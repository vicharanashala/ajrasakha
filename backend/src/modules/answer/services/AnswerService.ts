import { IAnswerRepository } from '#root/shared/database/interfaces/IAnswerRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject, injectable } from 'inversify';
import { ClientSession, ObjectId } from 'mongodb';
import {
  IAnswer,
  INotificationType,
  IQuestionMetrics,
  IReview,
  ISubmissionHistory,
  PreviousAnswersItem,
  ReviewAction,
  ReviewType,
  SourceItem,
  IQuestionSubmission,
  QuestionStatus,
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';
import { IQuestionSubmissionRepository } from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { INotificationRepository } from '#root/shared/database/interfaces/INotificationRepository.js';
import { notifyUser } from '#root/utils/pushNotification.js';
import { IReviewRepository } from '#root/shared/database/interfaces/IReviewRepository.js';
import { appConfig } from '#root/config/app.js';
import { aiConfig } from '#root/config/ai.js';
import { IReRouteRepository } from '#root/shared/database/interfaces/IReRouteRepository.js';
import { AiService } from '#root/modules/ai/services/AiService.js';
import { CORE_TYPES, NotificationService } from '#root/modules/core/index.js';
import {
  FetchAiInitialAnswerBody,
  ReviewAnswerBody,
  SubmissionResponse,
  UpdateAnswerBody,
} from '../classes/validators/AnswerValidator.js';
import { QuestionService } from '#root/modules/question/services/QuestionService.js';
import { IAnswerService } from '../interfaces/IAnswerService.js';
import { PreferenceDto } from '#root/modules/user/validators/UserValidators.js';
import { DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT } from '#root/shared/constants/general.js';
import { th } from '@faker-js/faker';
import { triggerWebhook } from '../utils/triggerWebhook.js';
import { threadId } from 'worker_threads';

@injectable()
export class AnswerService extends BaseService implements IAnswerService {
  constructor(
    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.ReviewRepository)
    private readonly reviewRepo: IReviewRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: QuestionService,

    @inject(GLOBAL_TYPES.NotificationService)
    private readonly notificationService: NotificationService,

    @inject(GLOBAL_TYPES.NotificationRepository)
    private readonly notificationRepository: INotificationRepository,

    @inject(GLOBAL_TYPES.ReRouteRepository)
    private readonly reRouteRepository: IReRouteRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
    sources: SourceItem[],
    session?: ClientSession,
    status?: string,
    remarks?: string,
    type?: string,
  ): Promise<{ insertedId: string; isFinalAnswer: boolean }> {
    const execute = async (activeSession: ClientSession) => {
      const question = await this.questionRepo.getById(
        questionId,
        activeSession,
      );
      if (!question) {
        throw new BadRequestError(`Question with ID ${questionId} not found`);
      }

      if (question.status === 'closed') {
        throw new BadRequestError(`Question is already closed`);
      }

      const isAlreadyResponded = await this.answerRepo.getByAuthorId(
        authorId,
        questionId,
        activeSession,
      );
      if (isAlreadyResponded && !type) {
        throw new BadRequestError('You’ve already submitted an answer!');
      }

      let isFinalAnswer = false;
      let metrics: IQuestionMetrics | null = null;

      const updatedAnswerCount = question.totalAnswersCount + 1;

      let textEmbedding = [];
      const ENABLE_AI_SERVER = appConfig.ENABLE_AI_SERVER;

      if (ENABLE_AI_SERVER) {
        const { embedding } = await this.aiService.getEmbedding(answer);
        textEmbedding = embedding;
      }

      const { insertedId } = await this.answerRepo.addAnswer(
        questionId,
        authorId,
        answer,
        sources,
        textEmbedding,
        isFinalAnswer,
        updatedAnswerCount,
        activeSession,
        status,
        remarks,
        type,
      );

      await this.questionRepo.updateQuestion(
        questionId,
        {
          totalAnswersCount: updatedAnswerCount,
          metrics,
        },
        activeSession,
      );

      return { insertedId, isFinalAnswer };
    };

    if (session) {
      return execute(session);
    }

    return this._withTransaction(async (newSession: ClientSession) =>
      execute(newSession),
    );
  }

  async fetchAiInitialAnswer(body: FetchAiInitialAnswerBody): Promise<any> {
    try {
      const response = await fetch(aiConfig.aiInitialAnswerGenerateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      let data: any;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = responseText;
      }

      if (!response.ok) {
        throw new InternalServerError(
          `AI answer service failed with status ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
        );
      }
      return data;
    } catch (error) {
      if (error instanceof InternalServerError) throw error;
      console.error('Error in fetchAiInitialAnswer:', error);
      throw new InternalServerError('Failed to fetch AI initial answer');
    }
  }
 
  private async notifyModeratorsAndAdminsForApproval(
    questionId: string,
    questionText: string | undefined,
    session?: ClientSession,
  ): Promise<void> {
    try {
      const [moderators, admins] = await Promise.all([
        this.userRepo.findModerators(),
        this.userRepo.findAdmins(session),
      ]);
      const recipients = [...(moderators || []), ...(admins || [])];
      if (!recipients.length) return;

      const trimmed = (questionText || '').trim();
      const title = trimmed
        ? (trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed)
        : 'Question Ready for Approval';
      const message = 'A question is ready for your approval';

      for (const r of recipients) {
        const id = (r as any)._id?.toString();
        if (!id) continue;
        await this.notificationService.saveTheNotifications(
          message,
          title,
          questionId,
          id,
          'moderator_approval' as INotificationType,
          session,
        ).catch((err: any) => {
          console.error(`[ModeratorApproval] Failed to notify ${id}:`, err?.message);
        });
      }
    } catch (err: any) {
      console.error('[ModeratorApproval] Failed to notify moderators/admins:', err?.message);
    }
  }

  async reviewAnswer(
    userId: string,
    body: ReviewAnswerBody,
  ): Promise<{ message: string }> {
    try {
      await this._withTransaction(async (session: ClientSession) => {
        // -----------------------------------------------------------
        // 1. Validate User
        // -----------------------------------------------------------

        const user = await this.userRepo.findById(userId, session);

        if (!user) {
          throw new UnauthorizedError(
            `Failed to find user. Please re-login the application.`,
          );
        }

        if (user.role !== 'expert' && user.role !== 'pae_expert') {
          throw new UnauthorizedError(
            `You are not authorized to perform reviews.`,
          );
        }
        // -----------------------------------------------------------
        // 2. Extract Body
        // -----------------------------------------------------------

        const {
          questionId,
          status, // accepted | rejected | modified | null (first-answer)
          answer,
          approvedAnswer,
          rejectedAnswer,
          reasonForRejection,
          sources,
          parameters,
          modifiedAnswer,
          reasonForModification,
          remarks,
          type,
        } = body;
        // -----------------------------------------------------------
        // 3. Validate Question
        // -----------------------------------------------------------

        const question = await this.questionRepo.getById(questionId, session);

        if (!question) {
          throw new NotFoundError(`Failed to find question. Please try again.`);
        }

        //check if it is re-routed
        /*  if(type){
            const intialStatus = 'in-review' as IAnswer['status'];
            const isIncrement=false
            const message="Expert created an answer for the re-routed question"
            const title="New answer for re-routed Question"
            const type:INotificationType='re-routed-answer-created'
            const {insertedId: answerId} = await this.addAnswer(
              questionId,
              userId,
              answer,
              sources,
              session,
              intialStatus,
              remarks,
              type
            );
            const reroute = await this.reRouteRepository.findByQuestionId(questionId.toString(),session)
            const moderatorId = reroute.reroutes[0].reroutedBy.toString()
            await this.userRepo.updateReputationScore(userId.toString(),isIncrement,session)
            await this.reRouteRepository.updateStatus(questionId.toString(),userId.toString(),'expert_completed',answerId,undefined,session)
            await this.notificationService.saveTheNotifications(message,title,questionId,moderatorId,type,session)
            return
          }*/

        // -----------------------------------------------------------
        // 4. Validate Submission Document
        // -----------------------------------------------------------

        const questionSubmission =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );

        if (!questionSubmission) {
          throw new NotFoundError(
            `Failed to find submission details for this question.`,
          );
        }

        const submissionHistory = questionSubmission.history ?? [];

        // -----------------------------------------------------------
        // 5. Reviewer Validation (first-time vs ongoing)
        // -----------------------------------------------------------

        if (submissionHistory.length === 0) {
          // First review: Reviewer must match queue[0]
          const assignedReviewer = questionSubmission.queue?.[0]?.toString();

          if (assignedReviewer && assignedReviewer !== user._id.toString()) {
            throw new UnauthorizedError(
              'You are not authorized to review this question. It has been assigned to another reviewer.',
            );
          }
        } else {
          // Ongoing review: Reviewer must match last updatedBy
          const lastHistory = submissionHistory[submissionHistory.length - 1];
          const assignedReviewer = lastHistory?.updatedBy?.toString();

          if (!assignedReviewer) {
            throw new UnauthorizedError(
              'Unable to find reviewer info for this question. Please try later.',
            );
          }

          if (assignedReviewer !== user._id.toString()) {
            throw new UnauthorizedError(
              'This question is currently being reviewed by another expert.',
            );
          }
        }

        // -----------------------------------------------------------
        // 6. Determine last valid (non-rejected) answer history
        // -----------------------------------------------------------

        const currentSubmissionHistory = questionSubmission.history ?? [];
        const currentSumbmissionQueue = questionSubmission.queue ?? [];

        const lastAnsweredHistory = [...currentSubmissionHistory]
          .reverse()
          .find(
            h =>
              h?.answer &&
              h.answer.toString().trim() !== '' &&
              h.status !== 'rejected',
          );

        // User is reviewing but no answer exists
        if (!lastAnsweredHistory?.answer && status) {
          throw new BadRequestError(
            `No answer found for review. Please check submission history.`,
          );
        }

        // -----------------------------------------------------------
        // 7. Validate approved/rejected answer reference consistency
        // -----------------------------------------------------------

        const lastAnswerId = lastAnsweredHistory?.answer?.toString();

        if (
          (approvedAnswer && approvedAnswer.toString() !== lastAnswerId) ||
          (rejectedAnswer && rejectedAnswer.toString() !== lastAnswerId)
        ) {
          throw new BadRequestError(
            `You are reviewing an answer that is not currently under review.`,
          );
        }

        // -----------------------------------------------------------
        // 8. Create Review Entry (Only when status exists)
        // -----------------------------------------------------------

        let reviewId: ObjectId | null = null;

        if (status) {
          const reason =
            status === 'rejected'
              ? (reasonForRejection ?? '')
              : status === 'modified'
                ? (reasonForModification ?? '')
                : '';

          const { insertedId } = await this.reviewRepo.createReview(
            'answer' as ReviewType,
            status as ReviewAction,
            questionId,
            userId,
            lastAnswerId,
            reason,
            parameters,
            false,
            session,
          );

          if (!insertedId) {
            throw new InternalServerError(
              'Failed to create review entry. Please try again.',
            );
          }

          reviewId = new ObjectId(insertedId);
        }

        // ---- Helper Builders -------------------------------------------------

        const buildHistoryEntry = (
          data: Partial<ISubmissionHistory>,
        ): Partial<ISubmissionHistory> => ({
          updatedAt: new Date(),
          ...data,
        });

        // -----------------------------------------------------------
        // 8. Handle submission by status
        // -----------------------------------------------------------
        if (!status) {
          // -------------------- FIRST SUBMISSION --------------------------------
          const isPaeExpert = user.role === 'pae_expert';
          const intialStatus = 'in-review' as IAnswer['status'];
          const { insertedId: answerId } = await this.addAnswer(
            questionId,
            userId,
            answer,
            sources,
            session,
            intialStatus,
            remarks,
          );

          const history = buildHistoryEntry({
            updatedBy: new ObjectId(userId),
            answer: new ObjectId(answerId),
            status: intialStatus as ISubmissionHistory['status'],
            createdAt: new Date(),
          });

          await this.questionSubmissionRepo.update(
            questionId,
            history as ISubmissionHistory,
            session,
          );

          // For time-bound questions: mark as opened so the cron won't reallocate
          if (question.source === 'AJRASAKHA' || question.source === 'WHATSAPP') {
            const sub = await this.questionSubmissionRepo.getByQuestionId(questionId, session);
            if (sub && !sub.currentExpertOpenedAt) {
              await this.questionSubmissionRepo.markQuestionOpenedByExpert(questionId, userId);
            }
          }

          // PAE experts skip the peer-review cycle — mark as pae_submitted for moderator action
          if (isPaeExpert) {
            await this.questionRepo.updateQuestion(
              questionId,
              { status: 'pae_submitted' },
              session,
            );
            // Decrement workload: PAE expert was incremented on allocation and is now done
            await this.userRepo.updateReputationScore(userId, false, session);
            await this.questionSubmissionRepo.clearCurrentExpertTracking(questionId, session);
            return;
          }
        }

        // ======================================================================
        // --------------------- ACCEPTED REVIEW --------------------------------
        // ======================================================================
        if (status === 'accepted') {
          const review_answerId = lastAnsweredHistory.answer.toString();

          const updatedHistory = buildHistoryEntry({
            reviewId,
            approvedAnswer: new ObjectId(review_answerId),
            status: 'reviewed',
          });

          // Increment approval count on the answer
          const approvalCount = await this.incrementApprovalCount(
            review_answerId,
            session,
          );

          // Mark this user as reviewed
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            userId,
            updatedHistory,
            session,
          );

          // Promote if 10 reviews OR 3 approvals
          if (
            currentSubmissionHistory.length === 10 ||
            (approvalCount && approvalCount >= 3)
          ) {
            await this.answerRepo.updateAnswerStatus(
              approvedAnswer,
              { status: 'pending-with-moderator' },
              session,
            );
          }

          // If >=3 approvals → auto approve expert
          if (approvalCount && approvalCount >= 3) {
            const approvedExpertId = lastAnsweredHistory.updatedBy.toString();

            await this.questionSubmissionRepo.updateHistoryByUserId(
              questionId,
              approvedExpertId,
              { status: 'approved' },
              session,
            );

            const wasOpenOrDelayed = question.status === 'open' || question.status === 'delayed' || question.status === 'duplicate';
            await this.questionRepo.updateQuestion(
              questionId,
              { status: 'in-review' },
              session,
            );
            if (wasOpenOrDelayed) {
              await this.notifyModeratorsAndAdminsForApproval(questionId, (question as any)?.question, session);
            }

            // Decrement the workload/reputation score
            const IS_INCREMENT = false;
            await this.userRepo.updateReputationScore(
              userId,
              IS_INCREMENT,
              session,
            );

            await this.questionSubmissionRepo.clearCurrentExpertTracking(questionId, session);
            return { message: 'Your response recorded successfully, thank you!' };
          }
        }

        // ======================================================================
        // --------------------- REJECTED REVIEW --------------------------------
        // ======================================================================
        if (status === 'rejected') {
          const rejectedExpertId = lastAnsweredHistory.updatedBy.toString();
          const rejectedAnswerId = lastAnsweredHistory.answer.toString();

          const answerToReject = await this.answerRepo.getById(rejectedAnswer);

          if (
            answerToReject.answer &&
            answerToReject.answer.trim() === answer.trim()
          ) {
            throw new BadRequestError(
              `The submitted answer is either identical to the existing answer or not provided. Please modify your response before saving.`,
            );
          }

          // 1. Mark answer rejected
          await this.userRepo.updatePenaltyAndIncentive(
            rejectedExpertId,
            'penalty',
            session,
          );

          await this.answerRepo.updateAnswerStatus(rejectedAnswer, {
            status: 'rejected',
          });

          // 2. Update submission history for the rejected expert
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            rejectedExpertId,
            buildHistoryEntry({
              status: 'rejected',
              rejectedBy: new ObjectId(userId),
              reasonForRejection,
            }),
            session,
          );

          // 3. Add new answer from reviewer
          const newStatus =
            currentSubmissionHistory.length === 10
              ? 'pending-with-moderator'
              : 'in-review';

          const { insertedId: newAnswerId } = await this.addAnswer(
            questionId,
            userId,
            answer,
            sources,
            session,
            newStatus,
            remarks,
          );

          // 4. Update reviewer history
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            userId,
            buildHistoryEntry({
              reviewId,
              status: 'reviewed',
              rejectedAnswer: new ObjectId(rejectedAnswerId),
              answer: new ObjectId(newAnswerId),
            }),
            session,
          );
          let message = `Your review has been rejected. Check the reviewer’s reason for more information.`;
          let title = 'Your review has been rejected.';
          let entityId = questionId.toString();
          const authorId = answerToReject.authorId.toString();
          const type: INotificationType = 'review_rejected';

          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            authorId,
            type,
            session,
          );
        }

        // ======================================================================
        // --------------------- MODIFIED REVIEW --------------------------------
        // ======================================================================
        if (status === 'modified') {
          const review_answerId = lastAnsweredHistory.answer.toString();
          const modifiedExpertId = lastAnsweredHistory.updatedBy.toString();
          // const modifiedAnswerId = lastAnsweredHistory.answer.toString();

          const answerToModify = await this.answerRepo.getById(modifiedAnswer);

          if (
            answerToModify.answer &&
            answerToModify.answer.trim() === answer.trim()
          ) {
            throw new BadRequestError(
              `The submitted answer is identical to the existing answer. Please modify your response before saving.`,
            );
          }

          // 1. Update previous expert entry
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            modifiedExpertId,
            buildHistoryEntry({
              reasonForLastModification: reasonForModification,
              lastModifiedBy: new ObjectId(userId),
            }),
            session,
          );

          // 2. Update answer
          const newStatus =
            currentSubmissionHistory.length === 10
              ? 'pending-with-moderator'
              : 'in-review';

          await this.answerRepo.updateAnswer(
            modifiedAnswer,
            { answer, sources, status: newStatus },
            session,
          );

          await this.answerRepo.resetApprovalCount(review_answerId, session);

          //update in the modifications array
          const modificationEntry: PreviousAnswersItem = {
            oldAnswer: answerToModify.answer,
            newAnswer: answer,
            modifiedBy: new ObjectId(userId),
            modifiedAt: new Date(),
          };
          await this.answerRepo.addAnswerModification(
            modifiedAnswer,
            modificationEntry,
            session,
          );

          // 3. Update reviewing user's history
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            userId,
            buildHistoryEntry({
              status: 'reviewed',
              reviewId,
              modifiedAnswer: new ObjectId(modifiedAnswer),
            }),
            session,
          );
          let message = `Your review has been modified. Check the question details for the updated changes`;
          let title = 'Your answer has been modified.';
          let entityId = questionId.toString();
          const authorId = answerToModify.authorId.toString();
          const type: INotificationType = 'review_modified';

          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            authorId,
            type,
            session,
          );
        }
        // Allocate next user in the history from queue if necessary

        // Find the current user's position in the queue
        const currentUserIndexInQueue = currentSumbmissionQueue.findIndex(
          id => id.toString() === userId.toString(),
        );
        // Check if the current user is in the queue
        if (currentUserIndexInQueue !== -1) {
          const isNotLast =
            currentUserIndexInQueue < currentSumbmissionQueue.length - 1;
          const isQueueNotFull = currentSumbmissionQueue.length < 10;
          // Case 1: Current user is not the last in the queue and total history (including next) is less than 10
          //currentSubmissionHistory.length <10

          // if (isNotLast &&isQueueNotFull  ) {
          if (isNotLast && currentSubmissionHistory.length < 10) {
            const nextExpertId =
              currentSumbmissionQueue[currentUserIndexInQueue + 1];

            const nextAllocatedSubmissionData: ISubmissionHistory = {
              updatedBy: new ObjectId(nextExpertId),
              status: 'in-review',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Add a new history entry for the next expert in the queue
            await this.questionSubmissionRepo.update(
              questionId,
              nextAllocatedSubmissionData,
              session,
              false,
            );
            // here i need to increment the workload of next expert
            const IS_INCREMENT = true;
            await this.userRepo.updateReputationScore(
              nextExpertId.toString(),
              IS_INCREMENT,
              session,
            );

            let message = `A new Review has been assigned to you`;
            let title = 'New Review Assigned';
            let entityId = questionId.toString();
            const user = nextExpertId.toString();
            const type: INotificationType = 'peer_review';

            await this.notificationService.saveTheNotifications(
              message,
              title,
              entityId,
              user,
              type,
              session,
            );
          }

          // Case 2: Current user is the last in the queue but the queue isn't full
          // Time-bound questions (AJRASAKHA/WHATSAPP) are managed by their own
          // cron — do NOT auto-expand the queue when an expert submits.
          const isTimeBound = question.source === 'AJRASAKHA' || question.source === 'WHATSAPP';
          if (
            !isTimeBound &&
            currentUserIndexInQueue === currentSumbmissionQueue.length - 1 &&
            currentSumbmissionQueue.length < 10 &&
            question.isAutoAllocate
          ) {
            // Automatically allocate additional experts to fill the queue
            await this.questionService.autoAllocateExperts(questionId, session);
          }
        }

        // Check the history limit reaced, if reached then question status will be in-review
        if (currentSubmissionHistory.length == 10) {
          const wasOpenOrDelayed = question.status === 'open' || question.status === 'delayed' || question.status === 'duplicate';
          await this.questionRepo.updateQuestion(
            questionId,
            { status: 'in-review' },
            session,
          );
          if (wasOpenOrDelayed) {
            await this.notifyModeratorsAndAdminsForApproval(questionId, (question as any)?.question, session);
          }
        }

        // Reset current-expert tracking now that the expert has submitted their
        // response — both allocated-at and opened-at are cleared.
        await this.questionSubmissionRepo.clearCurrentExpertTracking(questionId, session);

        // Decrement the reputation score of user since the user reviewed
        const IS_INCREMENT = false;
        await this.userRepo.updateReputationScore(
          userId,
          IS_INCREMENT,
          session,
        );
      });

      return { message: 'Your response recorded sucessfully, thankyou!' };
    } catch (error) {
      throw new InternalServerError(`${error}`);
    }
  }
  async reRouteReviewAnswer(
    userId: string,
    body: ReviewAnswerBody,
  ): Promise<{ message: string }> {
    try {
      await this._withTransaction(async (session: ClientSession) => {
        // -----------------------------------------------------------
        // 1. Validate User
        // -----------------------------------------------------------

        const user = await this.userRepo.findById(userId, session);

        if (!user) {
          throw new UnauthorizedError(
            `Failed to find user. Please re-login the application.`,
          );
        }

        if (user.role !== 'expert' && user.role !== 'pae_expert') {
          throw new UnauthorizedError(
            `You are not authorized to perform reviews.`,
          );
        }
        // -----------------------------------------------------------
        // 2. Extract Body
        // -----------------------------------------------------------

        const {
          questionId,
          status, // accepted | rejected | modified | null (first-answer)
          answer,
          approvedAnswer,
          rejectedAnswer,
          reasonForRejection,
          sources,
          parameters,
          modifiedAnswer,
          reasonForModification,
          remarks,
          type,
        } = body;

        const question = await this.questionRepo.getById(questionId, session);

        if (!question) {
          throw new NotFoundError(`Failed to find question. Please try again.`);
        }
        const questionSubmission =
          await this.reRouteRepository.findByQuestionId(
            questionId.toString(),
            session,
          );
        const submissionHistory = questionSubmission.reroutes ?? [];
        const lastHistory = submissionHistory[submissionHistory.length - 1];
        const moderatorId = lastHistory.reroutedBy.toString();
        const lastAnswerId = questionSubmission?.answerId?.toString();
        //check if it is re-routed
        /* if(type=="re-routed"){
           const intialStatus = 'in-review' as IAnswer['status'];
           const isIncrement=false
           const message="Expert created an answer for the re-routed question"
           const title="New answer for re-routed Question"
           const type:INotificationType='re-routed-answer-created'
           const {insertedId: answerId} = await this.addAnswer(
             questionId,
             userId,
             answer,
             sources,
             session,
             intialStatus,
             remarks,
             type
           );
           const reroute = await this.reRouteRepository.findByQuestionId(questionId.toString(),session)
           const moderatorId = reroute.reroutes[0].reroutedBy.toString()
           await this.userRepo.updateReputationScore(userId.toString(),isIncrement,session)
           await this.reRouteRepository.updateStatus(questionId.toString(),userId.toString(),'expert_completed',answerId,undefined,session)
           await this.notificationService.saveTheNotifications(message,title,questionId,moderatorId,type,session)
           return
         }*/
        if (!questionSubmission) {
          throw new NotFoundError(
            `Failed to find submission details for this question.`,
          );
        }
        if (submissionHistory.length === 0) {
          throw new UnauthorizedError(
            'You are not authorized to review this question. It has been assigned to another reviewer.',
          );
        } else {
          // Ongoing review: Reviewer must match last updatedBy
          const lastHistory = submissionHistory[submissionHistory.length - 1];
          const assignedReviewer = lastHistory?.reroutedTo?.toString();
          if (!assignedReviewer) {
            throw new UnauthorizedError(
              'Unable to find reviewer info for this question. Please try later.',
            );
          }

          if (assignedReviewer !== user._id.toString()) {
            throw new UnauthorizedError(
              'This question is currently being reviewed by another expert.',
            );
          }
        }

        let reviewId: ObjectId | null = null;

        if (status) {
          const reason =
            status === 'rejected'
              ? (reasonForRejection ?? '')
              : status === 'modified'
                ? (reasonForModification ?? '')
                : '';

          const { insertedId } = await this.reviewRepo.createReview(
            'answer' as ReviewType,
            status as ReviewAction,
            questionId,
            userId,
            lastAnswerId,
            reason,
            parameters,
            true,
            session,
          );

          if (!insertedId) {
            throw new InternalServerError(
              'Failed to create review entry. Please try again.',
            );
          }
          const wasOpenOrDelayed = question.status === 'open' || question.status === 'delayed' || question.status === 'duplicate';
          await this.questionRepo.updateQuestion(
            questionId,
            { status: 'in-review' },
            session,
          );
          if (wasOpenOrDelayed) {
            await this.notifyModeratorsAndAdminsForApproval(questionId, (question as any)?.question, session);
          }

          reviewId = new ObjectId(insertedId);
        }

        let review_answerId;
        if (status === 'accepted') {
          review_answerId = approvedAnswer;
          const approvalCount = await this.incrementApprovalCount(
            review_answerId,
            session,
          );

          await this.reRouteRepository.updateStatus(
            questionId.toString(),
            userId.toString(),
            'approved',
            review_answerId,
            undefined,
            session,
          );
          /*await this.answerRepo.updateAnswerStatus(review_answerId , {
            reRouted: true,
          });*/
        }

        if (status === 'rejected') {
          const answerToReject = await this.answerRepo.getById(rejectedAnswer);

          if (
            answerToReject.answer &&
            answerToReject.answer.trim() === answer.trim()
          ) {
            throw new BadRequestError(
              `The submitted answer is either identical to the existing answer or not provided. Please modify your response before saving.`,
            );
          }
          await this.answerRepo.updateAnswerStatus(rejectedAnswer, {
            status: 'rejected',
          });
          const newStatus = 'pending-with-moderator';

          const { insertedId: answerId } = await this.addAnswer(
            questionId,
            userId,
            answer,
            sources,
            session,
            newStatus,
            remarks,
            type,
          );
          review_answerId = answerId;
          await this.reRouteRepository.updateStatus(
            questionId.toString(),
            userId.toString(),
            'rejected',
            review_answerId,
            undefined,
            session,
          );
        }

        if (status === 'modified') {
          const answerToModify = await this.answerRepo.getById(modifiedAnswer);

          if (
            answerToModify.answer &&
            answerToModify.answer.trim() === answer.trim()
          ) {
            throw new BadRequestError(
              `The submitted answer is identical to the existing answer. Please modify your response before saving.`,
            );
          }

          // 2. Update answer
          const newStatus = 'pending-with-moderator';

          await this.answerRepo.updateAnswer(
            modifiedAnswer,
            { answer, sources, status: newStatus, reRouted: true },
            session,
          );

          //update in the modifications array
          const modificationEntry: PreviousAnswersItem = {
            oldAnswer: answerToModify.answer,
            newAnswer: answer,
            modifiedBy: new ObjectId(userId),
            modifiedAt: new Date(),
          };
          await this.answerRepo.addAnswerModification(
            modifiedAnswer,
            modificationEntry,
            session,
          );
          review_answerId = modifiedAnswer;
          await this.reRouteRepository.updateStatus(
            questionId.toString(),
            userId.toString(),
            'modified',
            review_answerId,
            undefined,
            session,
          );
        }

        const intialStatus = 'in-review' as IAnswer['status'];
        const isIncrement = false;
        const message = 'Expert created an answer for the re-routed question';
        const title = 'New answer for re-routed Question';
        const typeNoti: INotificationType = 're-routed-answer-created';

        await this.userRepo.updateReputationScore(
          userId.toString(),
          isIncrement,
          session,
        );

        await this.notificationService.saveTheNotifications(
          message,
          title,
          questionId,
          moderatorId,
          typeNoti,
          session,
        );
      });
      return { message: 'Your response recorded successfully, thank you!' };
    } catch (error) {
      throw new InternalServerError(
        `Failed to increment approved count /More ${error}`,
      );
    }
  }
  // async reviewAnswer(
  //   userId: string,
  //   body: ReviewAnswerBody,
  // ): Promise<{message: string}> {
  //   try {
  //     await this._withTransaction(async (session: ClientSession) => {
  //       const user = await this.userRepo.findById(userId, session);

  //       if (!user) {
  //         throw new UnauthorizedError(
  //           `Failed to find user, try re login the application!`,
  //         );
  //       }
  //       if(user.role !=="expert")
  //         throw new UnauthorizedError(`You are not authorized for review`)

  //       const {
  //         questionId,
  //         status,
  //         answer,
  //         approvedAnswer,
  //         rejectedAnswer,
  //         reasonForRejection,
  //         sources,
  //         parameters,
  //         modifiedAnswer,
  //         reasonForModification,
  //       } = body;

  //       const question = await this.questionRepo.getById(questionId, session);
  //       if (!question)
  //         throw new NotFoundError(`Failed to find question, try again!`);

  //       const questionSubmission =
  //         await this.questionSubmissionRepo.getByQuestionId(
  //           questionId,
  //           session,
  //         );

  //       if (!questionSubmission)
  //         throw new NotFoundError(
  //           `Failed to find question submission document, try again!`,
  //         );

  //       const submissionHistory = questionSubmission?.history ?? [];

  //       if (submissionHistory.length === 0) {
  //         // Handle first-time assignment check
  //         const assignedReviewer = questionSubmission?.queue?.[0]?.toString();

  //         if (assignedReviewer && assignedReviewer !== user._id.toString()) {
  //           throw new UnauthorizedError(
  //             'You are not authorized to review this question. It has been reassigned to another reviewer.',
  //           );
  //         }
  //       } else {
  //         // Validate reviewer consistency for ongoing review
  //         const lastHistory = submissionHistory[submissionHistory.length - 1];
  //         const assignedReviewer = lastHistory.updatedBy.toString();
  //         if (!assignedReviewer) {
  //           throw new UnauthorizedError(
  //             'Unable to verify the reviewer information for this question. Please try again later.',
  //           );
  //         }

  //         if (assignedReviewer !== user._id.toString()) {
  //           throw new UnauthorizedError(
  //             'This question is currently being reviewed by another expert. Please select a different question to review.',
  //           );
  //         }
  //       }

  //       const currentSubmissionHistory = questionSubmission.history || [];
  //       const currentQueue = questionSubmission.queue;

  //       const lastAnsweredHistory = currentSubmissionHistory
  //         .slice()
  //         .reverse()
  //         .find(
  //           h =>
  //             h?.answer &&
  //             h?.answer?.toString()?.trim() !== '' &&
  //             h?.status !== 'rejected',
  //         );

  //       if (!lastAnsweredHistory?.answer && status) {
  //         // if there status means, it is either accepting or rejecting
  //         throw new BadRequestError(
  //           `No answer found under review for this question. Please check the current submission history.`,
  //         );
  //       }

  //       if (
  //         (approvedAnswer &&
  //           approvedAnswer?.toString() !==
  //             lastAnsweredHistory?.answer.toString()) ||
  //         (rejectedAnswer &&
  //           rejectedAnswer?.toString() !==
  //             lastAnsweredHistory?.answer.toString())
  //       ) {
  //         throw new BadRequestError(
  //           `Failed to review this answer. You are attempting to review an answer that is not currently under review.`,
  //         );
  //       }

  //       let reviewId: ObjectId | null = null;

  //       // If status exists, user is performing a review (not author response)
  //       if (status) {
  //         // Determine the correct reason based on status
  //         const reason = (() => {
  //           switch (status) {
  //             case 'rejected':
  //               return reasonForRejection ?? '';
  //             case 'modified':
  //               return reasonForModification ?? '';
  //             case 'accepted':
  //             default:
  //               return '';
  //           }
  //         })();

  //         // Create the review record
  //         const {insertedId} = await this.reviewRepo.createReview(
  //           'answer',
  //           status as ReviewAction,
  //           questionId,
  //           userId,
  //           lastAnsweredHistory?.answer?.toString(),
  //           reason,
  //           parameters,
  //           session,
  //         );

  //         if (!insertedId) {
  //           throw new InternalServerError(
  //             'Failed to create review entry, please try again!',
  //           );
  //         }

  //         reviewId = new ObjectId(insertedId);
  //       }

  //       if (!status) {
  //         // Answer submission from first assigned expert
  //         const {insertedId} = await this.addAnswer(
  //           questionId,
  //           userId,
  //           answer,
  //           sources,
  //           session,
  //           'in-review',
  //         );

  //         // Push entry in to history array in submission
  //         const userSubmissionData: ISubmissionHistory = {
  //           updatedBy: new ObjectId(userId),
  //           answer: new ObjectId(insertedId),
  //           createdAt: new Date(),
  //           status: 'in-review',
  //           updatedAt: new Date(),
  //         };

  //         const one = await this.questionSubmissionRepo.update(
  //           questionId,
  //           userSubmissionData,
  //           session,
  //         );
  //       } else if (status == 'accepted') {
  //         const review_answer_id = lastAnsweredHistory.answer.toString();
  //         // const authorId =lastAnsweredHistory.updatedBy.toString()
  //         // await this.userRepo.updatePenaltyAndIncentive(authorId,'incentive',session)
  //         const updatedSubmissionData = {
  //           reviewId,
  //           approvedAnswer: new ObjectId(review_answer_id),
  //           status: 'reviewed',
  //         } as ISubmissionHistory;

  //         // increment the approval count field in the answerdocuemtn
  //         const currentApprovalCount = await this.incrementApprovalCount(
  //           review_answer_id,
  //           session,
  //         );
  //         // Mark this user review by changing the status
  //         await this.questionSubmissionRepo.updateHistoryByUserId(
  //           questionId,
  //           userId,
  //           updatedSubmissionData,
  //           session,
  //         );
  //         if (
  //           currentSubmissionHistory.length == 10 ||
  //           (currentApprovalCount && currentApprovalCount >= 3)
  //         ) {
  //           const payload: Partial<IAnswer> = {
  //             status: 'pending-with-moderator',
  //           };

  //           let updateDocument = await this.answerRepo.updateAnswerStatus(
  //             body.approvedAnswer,
  //             payload,
  //             session,
  //           );
  //         }
  //         if (currentApprovalCount && currentApprovalCount >= 3) {
  //           const approvedExpertId = lastAnsweredHistory.updatedBy.toString();

  //           await this.questionSubmissionRepo.updateHistoryByUserId(
  //             questionId,
  //             approvedExpertId,
  //             {status: 'approved'},
  //             session,
  //           );

  //           await this.questionRepo.updateQuestion(
  //             questionId,
  //             {status: 'in-review'},
  //             session,
  //           );
  //           const IS_INCREMENT = false;
  //           await this.userRepo.updateReputationScore(
  //             userId,
  //             IS_INCREMENT,
  //             session,
  //           );
  //           return {message: 'Your response recorded sucessfully, thankyou!'};
  //         }
  //       } else if (status == 'rejected') {
  //         //1. update the status of the answer as rejected
  //         const payload: Partial<IAnswer> = {
  //           status: 'rejected',
  //         };
  //         // const answerDetails = await this.answerRepo.getById(body.rejectedAnswer.toString())
  //         const authorId = lastAnsweredHistory.updatedBy.toString();
  //         console.log('ans details ', authorId);
  //         await this.userRepo.updatePenaltyAndIncentive(
  //           authorId,
  //           'penalty',
  //           session,
  //         );
  //         await this.answerRepo.updateAnswerStatus(
  //           body.rejectedAnswer,
  //           payload,
  //         );

  //         //2. Prepare update payload for the rejected submission
  //         const rejectedHistoryUpdate: ISubmissionHistory = {
  //           reasonForRejection,
  //           rejectedBy: new ObjectId(userId),
  //           status: 'rejected',
  //         } as ISubmissionHistory;

  //         // Identify the expert whose answer is being rejected
  //         const rejectedExpertId = lastAnsweredHistory.updatedBy.toString();

  //         // Update the rejected expert’s submission history
  //         await this.questionSubmissionRepo.updateHistoryByUserId(
  //           questionId,
  //           rejectedExpertId,
  //           rejectedHistoryUpdate,
  //           session,
  //         );

  //         //3. Add new answer with proper status
  //         let status = 'in-review';

  //         if (currentSubmissionHistory.length == 10) {
  //           status = 'pending-with-moderator';
  //         }
  //         // Add a new answer entry from the current user
  //         const {insertedId} = await this.addAnswer(
  //           questionId,
  //           userId,
  //           answer,
  //           sources,
  //           session,
  //           status,
  //         );

  //         // 4. update the exisiting review doc
  //         const updatedSubmissionData = {
  //           rejectedAnswer: new ObjectId(lastAnsweredHistory.answer.toString()),
  //           status: 'reviewed',
  //           reviewId,
  //           answer: new ObjectId(insertedId),
  //         } as ISubmissionHistory;

  //         // Mark this user as reivewied review by changing the status
  //         await this.questionSubmissionRepo.updateHistoryByUserId(
  //           questionId,
  //           userId,
  //           updatedSubmissionData,
  //           session,
  //         );
  //       } else if (status == 'modified') {
  //         //1. Prepare update payload for the modified submission
  //         const modifiedHistoryUpdate: ISubmissionHistory = {
  //           reasonForLastModification: reasonForModification,
  //           lastModifiedBy: new ObjectId(userId),
  //         } as ISubmissionHistory;

  //         // Identify the expert whose answer is being modified
  //         const modifiedExpertId = lastAnsweredHistory.updatedBy.toString();

  //         // Update the rejected expert’s submission history
  //         await this.questionSubmissionRepo.updateHistoryByUserId(
  //           questionId,
  //           modifiedExpertId,
  //           modifiedHistoryUpdate,
  //           session,
  //         );

  //         //2. Modify the reviewed answer with proper status
  //         let status = 'in-review';

  //         if (currentSubmissionHistory.length == 10) {
  //           status = 'pending-with-moderator';
  //         }

  //         const review_answer_id = lastAnsweredHistory.answer.toString();
  //         const updatedAnswer: Partial<IAnswer> = {
  //           answer,
  //           sources,
  //           status,
  //         };

  //         await this.answerRepo.updateAnswer(
  //           review_answer_id,
  //           updatedAnswer,
  //           session,
  //         );

  //         //3. Update the current reviewer entry in submission history

  //         const updatedSubmissionData = {
  //           modifiedAnswer: new ObjectId(review_answer_id),
  //           status: 'reviewed',
  //           reviewId,
  //         } as ISubmissionHistory;

  //         // Mark this user as reivewied review by changing the status
  //         await this.questionSubmissionRepo.updateHistoryByUserId(
  //           questionId,
  //           userId,
  //           updatedSubmissionData,
  //           session,
  //         );
  //       }

  //       // Allocate next user in the history from queue if necessary

  //       // Find the current user's position in the queue
  //       const currentUserIndexInQueue = currentQueue.findIndex(
  //         id => id.toString() === userId.toString(),
  //       );

  //       // Check if the current user is in the queue
  //       if (currentUserIndexInQueue !== -1) {
  //         // Case 1: Current user is not the last in the queue and total history (including next) is less than 10
  //         if (
  //           currentUserIndexInQueue < currentQueue.length - 1 &&
  //           currentQueue.length <= 10
  //         ) {
  //           const nextExpertId = currentQueue[currentUserIndexInQueue + 1];

  //           const nextAllocatedSubmissionData: ISubmissionHistory = {
  //             updatedBy: new ObjectId(nextExpertId),
  //             status: 'in-review',
  //             createdAt: new Date(),
  //             updatedAt: new Date(),
  //           };

  //           // Add a new history entry for the next expert in the queue
  //           await this.questionSubmissionRepo.update(
  //             questionId,
  //             nextAllocatedSubmissionData,
  //             session,
  //           );
  //           // here i need to increment the workload of next expert
  //           const IS_INCREMENT = true;
  //           await this.userRepo.updateReputationScore(
  //             nextExpertId.toString(),
  //             IS_INCREMENT,
  //             session,
  //           );

  //           let message = `A new Review has been assigned to you`;
  //           let title = 'New Review Assigned';
  //           let entityId = questionId.toString();
  //           const user = nextExpertId.toString();
  //           const type: INotificationType = 'peer_review';

  //           await this.notificationService.saveTheNotifications(
  //             message,
  //             title,
  //             entityId,
  //             user,
  //             type,
  //             session,
  //           );
  //         }

  //         // Case 2: Current user is the last in the queue but the queue isn't full
  //         else if (
  //           currentUserIndexInQueue === currentQueue.length - 1 &&
  //           currentQueue.length < 10 &&
  //           question.isAutoAllocate
  //         ) {
  //           // Automatically allocate additional experts to fill the queue
  //           await this.questionService.autoAllocateExperts(questionId, session);
  //         }
  //       }

  //       // Check the history limit reaced, if reached then question status will be in-review
  //       if (currentSubmissionHistory.length == 10) {
  //         await this.questionRepo.updateQuestion(
  //           questionId,
  //           {status: 'in-review'},
  //           session,
  //         );
  //       }
  //       // Decrement the reputation score of user since the user reviewed
  //       const IS_INCREMENT = false;
  //       await this.userRepo.updateReputationScore(
  //         userId,
  //         IS_INCREMENT,
  //         session,
  //       );
  //     });

  //     return {message: 'Your response recorded sucessfully, thankyou!'};
  //   } catch (error) {
  //     throw new InternalServerError(
  //       `Failed to review answer, please try again! /More: ${error}`,
  //     );
  //   }
  // }

  async incrementApprovalCount(
    answerId: string,
    session?: ClientSession,
  ): Promise<number> {
    try {
      const answer = await this.answerRepo.getById(answerId);
      if (!answer)
        throw new NotFoundError(
          `Failed to find answer while trying increment approvalcount!`,
        );

      return await this.answerRepo.incrementApprovalCount(answerId, session);
    } catch (error) {
      throw new InternalServerError(
        `Failed to increment approved count /More ${error}`,
      );
    }
  }

  // async getSubmissions(
  //   userId: string,
  //   page: number,
  //   limit: number,
  // ): Promise<SubmissionResponse[]> {
  //   return await this.answerRepo.getAllSubmissions(userId, page, limit);
  // }

  async getSubmissions(
    userId: string,
    page: number,
    limit: number,
    dateRange?: { from: string | undefined; to: string | undefined },
    selectedHistoryId?: string | undefined,
    expertId?: string | undefined,
  ): Promise<SubmissionResponse[]> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId);
      // Moderator/admin viewing another user's activity history. Route by the
      // TARGET user's role (expert vs moderator pipelines differ), and never
      // expose an admin's history.
      if (expertId && (user.role === 'moderator' || user.role === 'admin')) {
        const target = await this.userRepo.findById(expertId);
        if (!target || target.role === 'admin') {
          return [];
        }
        if (target.role === 'moderator') {
          return await this.answerRepo.getModeratorActivityHistory(
            expertId,
            page,
            limit,
            dateRange,
            selectedHistoryId,
            session,
          );
        }
        return await this.questionSubmissionRepo.getUserActivityHistory(
          expertId,
          page,
          limit,
          dateRange,
          session,
          selectedHistoryId,
        );
      }
      if (user.role === 'expert') {
        return await this.questionSubmissionRepo.getUserActivityHistory(
          userId,
          page,
          limit,
          dateRange,
          session,
          selectedHistoryId,
        );
      } else if (user.role === 'moderator') {
        return await this.answerRepo.getModeratorActivityHistory(
          userId,
          page,
          limit,
          dateRange,
          selectedHistoryId,
          session,
        );
      }
    });
  }
  async getFinalAnswerQuestions(
    userId: string,
    currentUserId: string,
    date: string,
    status: string,
  ): Promise<{
    finalizedSubmissions: any[];
  }> {
    const { finalizedSubmissions } = await this.answerRepo.getAllFinalizedAnswers(
      userId,
      currentUserId,
      date,
      status,
    );
    return {
      finalizedSubmissions,
    };
  }

  // Currently using for approving answer
  /* async approveAnswer(
     userId: string,
     answerId: string|undefined,
     updates: UpdateAnswerBody,
   ): Promise<{modifiedCount: number}> {
     return this._withTransaction(async (session: ClientSession) => {
       if (!answerId) throw new BadRequestError('AnswerId not found');
       const answer = await this.answerRepo.getById(answerId, session);
 
       if (!answer) {
         throw new BadRequestError(`Answer with ID ${answerId} not found`);
       }
 
       const user = await this.userRepo.findById(userId, session);
 
       if (!user || user.role == 'expert')
         throw new UnauthorizedError(
           "You don't have permission to approve an answer!",
         );
 
       const questionId = answer.questionId.toString();
 
       const question = await this.questionRepo.getById(questionId);
 
       if (!question) {
         throw new BadRequestError(`Question with ID ${questionId} not found`);
       }
 
       if (question.status !== 'in-review') {
         throw new BadRequestError(
           `Can't approve this answer:${answerId}, currently question is not in review!`,
         );
       }
 
       await this.answerRepo.getByQuestionId(questionId, session);
 
       const text = `Question: ${question.question}
 
 answer: ${updates.answer}`;
 
       let questionEmbedding = [];
 
       const ENABLE_AI_SERVER = appConfig.ENABLE_AI_SERVER;
 
       if (ENABLE_AI_SERVER) {
         const {embedding} = await this.aiService.getEmbedding(text);
         questionEmbedding = embedding;
       }
 
       // const {embedding: questionEmbedding} = await this.aiService.getEmbedding(
       //   text,
       // );
       // const questionEmbedding = [];
       const authorId = answer.authorId.toString();
 
       await this.userRepo.updatePenaltyAndIncentive(
         authorId,
         'incentive',
         session,
       );
       
       await this.questionRepo.updateQuestion(
         questionId,
         {
           text,
           embedding: questionEmbedding,
           status: 'closed',
           closedAt: new Date(),
         },
         session,
         true,
       );
 
       let textEmbedding = [];
 
       if (ENABLE_AI_SERVER) {
         const {embedding} = await this.aiService.getEmbedding(text);
         textEmbedding = embedding;
       }
 
       const payload: Partial<IAnswer> = {
         answer: updates.answer,
         sources: updates.sources,
         approvedBy: new ObjectId(userId),
         embedding: textEmbedding,
         isFinalAnswer: true,
         status: 'approved',
       };
       return this.answerRepo.updateAnswer(answerId, payload, session);
     });
   }*/

  async approveAnswer(
    userId: string,
    updates: UpdateAnswerBody,
  ): Promise<{ modifiedCount: number } | { insertedId: string }> {
    return this._withTransaction(async (session: ClientSession) => {
      let questionId = updates.questionId;
      if (!questionId && updates.answerId) {
        const answer = await this.answerRepo.getById(updates.answerId, session);
        if (!answer)
          throw new BadRequestError(
            `Answer with ID ${updates.answerId} not found`,
          );
        questionId = answer.questionId.toString();
      }

      if (!questionId) {
        throw new BadRequestError('Question ID not found');
      }

      const question = await this.questionRepo.getById(questionId);

      if (!question) {
        throw new BadRequestError(`Question with ID ${questionId} not found`);
      }

      // Block approval only if the crop genuinely isn't registered. If normalised_crop
      // is missing but the raw crop now exists in the crop master (e.g. registered in
      // Agri Tech Management after the question was created, or missed by the backfill),
      // this resolves and persists it so approval isn't blocked unnecessarily.
      const normalisedCrop = await this.questionService.ensureNormalisedCrop(
        questionId,
        session,
      );
      if (!normalisedCrop) {
        throw new BadRequestError(
          `This question does not have a normalised crop. Please add the respective crop from the Agri Tech Management section before approving this answer.`,
        );
      }

      const submission = await this.questionSubmissionRepo.getByQuestionId(
        questionId,
        session,
      );

      const user = await this.userRepo.findById(userId, session);

      if (!user || user.role === 'expert') {
        throw new UnauthorizedError(
          "You don't have permission to approve an answer!",
        );
      }

      const ENABLE_AI_SERVER = appConfig.ENABLE_AI_SERVER;

      const text = `Question: ${question.question}

answer: ${updates.answer}`;

      const generateEmbedding = async (value: string) => {
        if (appConfig.isDevelopment) {
          return [];
        }
        //  if (!ENABLE_AI_SERVER) throw new InternalServerError('AI server is not enabled');

        const { embedding } = await this.aiService.getEmbedding(value);

        return embedding;
      };

      // EDIT-FINAL-ANSWER FLOW
      // Allow admin/moderator to edit an already-finalized answer on a closed question.
      // Updates only answer/sources/embedding; preserves approvedBy/isFinalAnswer/status.
      if (question.status === 'closed' && updates.answerId) {
        const existing = await this.answerRepo.getById(updates.answerId, session);
        if (!existing) {
          throw new BadRequestError(`Answer with ID ${updates.answerId} not found`);
        }
        if (!existing.isFinalAnswer) {
          throw new BadRequestError(
            `Can't edit this answer: ${updates.answerId}. It is not the final answer for a closed question.`,
          );
        }

        const editEmbedding = await generateEmbedding(text);

        // Keep the question's `text` + `embedding` in sync with the edited
        // answer so search / semantic lookups don't go stale.
        await this.questionRepo.updateQuestion(
          question._id.toString(),
          {
            text,
            embedding: editEmbedding,
          },
          session,
          true,
        );

        const editResult = await this.answerRepo.updateAnswer(
          updates.answerId,
          {
            answer: updates.answer,
            sources: updates.sources,
            embedding: editEmbedding,
          },
          session,
        );

        // NOTE: Re-firing the WhatsApp / Ajrasakha webhook on edit is disabled
        // for now — undecided whether the farmer should be re-notified when a
        // moderator edits an already-delivered final answer. Re-enable by
        // un-commenting the block below if/when that decision is made.
        //
        // const editAuthor = await this.userRepo.findById(
        //   existing.authorId.toString(),
        //   session,
        // );
        // const editWebhookPayload = {
        //   question_id: question._id.toString(),
        //   status: 'closed',
        //   answer: updates.answer ?? '',
        //   author:
        //     `${editAuthor?.firstName ?? ''} ${editAuthor?.lastName ?? ''}`.trim() ||
        //     'Expert',
        //   sources: updates.sources ?? [],
        // };
        //
        // if (question.source === 'WHATSAPP') {
        //   try {
        //     await triggerWebhook(
        //       appConfig.WA_WEBHOOK_API_URL,
        //       appConfig.WA_WEBHOOK_API_KEY,
        //       editWebhookPayload,
        //       'WhatsApp',
        //     );
        //   } catch (err) {
        //     console.log('Error occurred while notifying customer on edit (WHATSAPP):', err);
        //   }
        // }
        //
        // if (question.source === 'AJRASAKHA') {
        //   try {
        //     await triggerWebhook(
        //       appConfig.WEB_WEBHOOK_API_URL,
        //       appConfig.WEB_WEBHOOK_API_KEY,
        //       {
        //         ...editWebhookPayload,
        //         question: question.question,
        //         messageId: question.messageId,
        //       },
        //       'Browser',
        //     );
        //   } catch (err) {
        //     console.log('Error occurred while notifying customer on edit (AJRASAKHA):', err);
        //   }
        // }

        return editResult;
      }

      let answerId = updates.answerId;

      // Dynamic questions (raised via the chatbot, routed to the Auditor and closed
      // through "Notify User") close as `dynamic_closed` rather than `closed`, so they
      // stay distinguishable downstream. The customer webhook carries the same status.
      const isDynamicClose =
        question.status === 'dynamic' ||
        (question.status === 'auditor_review' &&
          question.auditorReviewType === 'dynamic');
      const closeStatus: QuestionStatus = isDynamicClose
        ? 'dynamic_closed'
        : 'closed';

      // DUPLICATE / DYNAMIC QUESTION FLOW
      // Create final approved answer directly from LLM answer
      if (
        question.status === 'duplicate' ||
        ((question.status === 'auditor_review' ||
          question.status === 'dynamic') &&
          !answerId)
      ) {
        const [answerEmbedding, questionEmbedding] = await Promise.all([
          generateEmbedding(text),
          generateEmbedding(text),
        ]);

        const answer = await this.answerRepo.addAnswer(
          questionId,
          userId,
          updates.answer,
          updates.sources,
          answerEmbedding,
          true, // isFinalAnswer
          1, // answerIteration
          session,
          'approved',
          isDynamicClose
            ? 'LLM generated answer approved as final answer by auditor since the question is dynamic'
            : 'LLM generated answer approved as final answer by moderator since the question is marked as duplicate',
          undefined,
        );

        answerId = answer.insertedId.toString();

        await this.questionRepo.updateQuestion(
          questionId,
          {
            text,
            embedding: questionEmbedding,
            status: closeStatus,
            closedAt: new Date(),
          },
          session,
          true,
        );
      } else {
        // NORMAL APPROVAL FLOW
        if (!submission) {
          throw new NotFoundError(
            `Submission details for question ID ${questionId} not found`,
          );
        }

        if (
          question.status !== 'in-review' &&
          question.status !== 'pae_submitted'
        ) {
          throw new BadRequestError(
            `Can't approve this answer: ${answerId}, currently question is not in review or pae submitted!`,
          );
        }
      }

      if (!answerId) {
        throw new BadRequestError('Answer ID not found');
      }

      const answer = await this.answerRepo.getById(answerId, session);

      if (!answer) {
        throw new BadRequestError(`Answer with ID ${answerId} not found`);
      }

      const authorId = answer.authorId.toString();

      const author = await this.userRepo.findById(authorId, session);

      // UPDATE AUTHOR INCENTIVE
      // If the question status id duplicate then this incentive update will be done for moderator since the answer will be directly added from LLM answer and approved as final answer by moderator. In other cases the incentive update will be done for expert who created the answer.
      await this.userRepo.updatePenaltyAndIncentive(
        authorId,
        'incentive',
        session,
      );

      // CLOSE QUESTION. For normal questions keep moderatorId on the question for
      // historical reference and only clear the moderator's user-document entry.
      // For DUPLICATE questions, clear the moderator details from the question too.
      const isDuplicateApproval = question.status === 'duplicate';
      const questionEmbedding = await generateEmbedding(text);

      await this.questionRepo.updateQuestion(
        questionId,
        {
          text,
          embedding: questionEmbedding,
          status: closeStatus,
          closedAt: new Date(),
        },
        session,
        true,
      );

      // Pull this question from whichever moderator holds it so the cron sees them as
      // available again. Keyed by questionId, so a malformed/missing moderatorId can't
      // leave an orphan entry behind.
      try {
        await this.userRepo.removeAssignedQuestionFromAllModerators(questionId, session);
      } catch (err: any) {
        console.error('[ModeratorQueue] Failed to clear question from moderators:', err?.message);
      }

      // UPDATE ANSWER
      const answerEmbedding = await generateEmbedding(text);

      const payload: Partial<IAnswer> = {
        answer: updates.answer,
        sources: updates.sources,
        approvedBy: new ObjectId(userId),
        embedding: answerEmbedding,
        isFinalAnswer: true,
        status: 'approved',
      };

      const result = await this.answerRepo.updateAnswer(
        answerId,
        payload,
        session,
      );

      // Author display name reused for the parent + every replicated child notification.
      const authorName =
        `${author?.firstName ?? ''} ${author?.lastName ?? ''}`.trim() || 'Expert';

      // ── Propagate the close to queue-duplicate children ───────────────────────
      // Any question that was matched to this one in the GDB pending-duplicate queue
      // (referenceQuestionId === this question, status 'queue_duplicate') is closed too:
      // the same final answer is replicated onto it and it's stamped closedBy 'System'.
      try {
        const childQuestions = await this.questionRepo.findByReferenceQuestionId(
          questionId,
          'queue_duplicate',
          session,
        );
        for (const child of childQuestions) {
          const childId = child._id!.toString();
          // Replicate the parent's final answer onto the child.
          await this.answerRepo.addAnswer(
            childId,
            userId,
            updates.answer ?? '',
            updates.sources ?? [],
            answerEmbedding,
            true, // isFinalAnswer
            1, // answerIteration
            session,
            'approved',
            'Answer replicated from the parent question on close',
          );
          // Close the child question, marking it system-closed.
          await this.questionRepo.updateQuestion(
            childId,
            { status: 'closed', closedAt: new Date(), closedBy: 'System' },
            session,
          );
          // Free any moderator holding the child.
          await this.userRepo
            .removeAssignedQuestionFromAllModerators(childId, session)
            .catch((e: any) =>
              console.error(`[approveAnswer] Failed to clear moderators for child ${childId}:`, e?.message),
            );

          // Notify the child question's customer as well — it was closed with the
          // same replicated answer, so it must fire its own source-appropriate
          // webhook (using the child's own messageId/threadId), not just the parent's.
          await this.notifyCustomerOnClose(
            child,
            updates.answer ?? '',
            updates.sources ?? [],
            authorName,
            session,
          );
        }
        if (childQuestions.length) {
          console.log(
            `[approveAnswer] Closed ${childQuestions.length} queue_duplicate child question(s) of ${questionId} and replicated the answer (closedBy: System).`,
          );
        }
      } catch (childErr: any) {
        console.error(
          '[approveAnswer] Failed to propagate close to queue_duplicate children:',
          childErr?.message,
        );
      }

      //  WEBHOOK HANDLERS — notify the parent question's customer.
      await this.notifyCustomerOnClose(
        question,
        updates.answer ?? '',
        updates.sources ?? [],
        authorName,
        session,
        closeStatus,
      );

      return result;
    });
  }

  /**
   * Notify the end customer that their question was closed/answered, via the
   * source-appropriate webhook (WhatsApp for WHATSAPP, Browser for AJRASAKHA), and
   * persist the outcome on the question (`isCustomerNotified`).
   *
   * Best-effort: a webhook failure is logged and recorded, never thrown, so it can
   * never abort the surrounding close/transaction. No-op for non-chatbot sources
   * (AGRI_EXPERT / OUTREACH), which have no end customer to notify. Used for both the
   * approved parent question and each replicated queue_duplicate child question.
   */
  private async notifyCustomerOnClose(
    q: {
      _id?: string | ObjectId;
      source: string;
      question?: string;
      messageId?: string;
      threadId?: string;
    },
    answer: string,
    sources: SourceItem[],
    authorName: string,
    session?: ClientSession,
    status: QuestionStatus = 'closed',
  ): Promise<boolean> {
    if (q.source !== 'WHATSAPP' && q.source !== 'AJRASAKHA') return false;

    const qId = q._id!.toString();
    const webhookPayload = {
      question_id: qId,
      status,
      answer: answer ?? '',
      author: authorName || 'Expert',
      sources: sources ?? [],
    };

    let isCustomerNotified = false;
    try {
      if (q.source === 'WHATSAPP') {
        await triggerWebhook(
          appConfig.WA_WEBHOOK_API_URL,
          appConfig.WA_WEBHOOK_API_KEY,
          webhookPayload,
          'WhatsApp',
        );
      } else {
        await triggerWebhook(
          appConfig.WEB_WEBHOOK_API_URL,
          appConfig.WEB_WEBHOOK_API_KEY,
          {
            ...webhookPayload,
            question: q.question,
            messageId: q.messageId,
            threadId: q.threadId,
          },
          'Browser',
        );
      }
      isCustomerNotified = true;
    } catch (err) {
      isCustomerNotified = false;
      console.log(
        `Error occured while notifying customer(${q.source}) for question ${qId}: `,
        err,
      );
    }

    await this.questionRepo.updateQuestion(
      qId,
      { isCustomerNotified },
      session,
      false,
    );
    return isCustomerNotified;
  }

  async approveLLMAnswer(
    userId: string,
    updates: UpdateAnswerBody,
  ): Promise<{ modifiedCount: number }> {
    return this._withTransaction(async (session: ClientSession) => {
      const isAjrasakha = updates.source === 'AJRASAKHA';
      const isWhatsApp = updates.source === 'WHATSAPP';

      if (!isAjrasakha && !isWhatsApp) {
        throw new BadRequestError(
          'Only AJRASAKHA or WHATSAPP sources are supported for this action',
        );
      }

      if (!updates.questionId) {
        throw new BadRequestError('questionId is required');
      }

      const user = await this.userRepo.findById(userId, session);

      if (!user || user.role === 'expert') {
        throw new UnauthorizedError(
          "You don't have permission to approve an answer!",
        );
      }

      const question = await this.questionRepo.getById(
        updates.questionId,
        session,
      );

      if (!question) {
        throw new BadRequestError(
          `Question with ID ${updates.questionId} not found`,
        );
      }

      //open and delay:only allow
      if (question.status === 'in-review' || question.status == 'closed') {
        throw new BadRequestError(
          `Can't approve this answer. Current question status is '${question.status}'.`,
        );
      }

      // const text = `Question: ${question.question}\n\nanswer: ${updates.answer}`;

      // let questionEmbedding = [];
      // const ENABLE_AI_SERVER = appConfig.ENABLE_AI_SERVER;

      // if (ENABLE_AI_SERVER) {
      //   const {embedding} = await this.aiService.getEmbedding(text);
      //   questionEmbedding = embedding;
      // }

      const isAddTextRequired = true;
      // The moderator currently assigned to this question (set by the moderator-queue
      // cron). Approving moves the question back to "open", so the moderation step is
      // done — release the assignment so the moderator becomes available again.
      const assignedModeratorId = (question as any).moderatorId?.toString();
      // Update question with approved AI answer details
      await this.questionRepo.updateQuestion(
        updates.questionId,
        {
          // text,
          // embedding: questionEmbedding,
          aiApprovedSources: updates.sources ?? [],
          aiInitialAnswer: updates.answer ?? '',
          // totalAnswersCount: 1,
          isAutoAllocate: true,
          status: 'open',
          // Clear the moderator assignment — status is going back to "open".
          moderatorId: null,
          moderatorAssignedAt: null,
        },
        session,
        isAddTextRequired,
      );

      // Pull this question from the previously-assigned moderator's assignedQuestionIds
      // array so the cron sees them as available again once their array is empty.
      if (assignedModeratorId) {
        await this.userRepo.removeAssignedQuestion(assignedModeratorId, updates.questionId);
      }

    /*  if (question.status !== 'open' && question.status !== 'delayed') {
        let queue: ObjectId[] = [];
        let initialExpert: any = null;

      if (isAjrasakha) {
        // Special Task Force allocation for Ajrasakha (4 experts)
        const taskForceExperts = await this.userRepo.getExpertsWithFallback(
          question.details,
          session,
        );
        const expertsToAllocate = taskForceExperts.slice(
          0,
          DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT,
        );
        queue = expertsToAllocate.map(u => new ObjectId(u._id.toString()));
        initialExpert = expertsToAllocate[0];
      } else if (isWhatsApp) {
        // Normal expert allocation for WhatsApp (3 experts based on preference)
        const experts = await this.userRepo.findExpertsByPreference(
          question.details as PreferenceDto,
          session,
        );
        const expertsToAllocate = experts.slice(
          0,
          DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT,
        );
        queue = expertsToAllocate.map(u => new ObjectId(u._id.toString()));
        initialExpert = expertsToAllocate[0];
      }

      let submission = await this.questionSubmissionRepo.getByQuestionId(
        updates.questionId,
        session,
      );

      if (!submission) {
        const submissionData: IQuestionSubmission = {
          questionId: new ObjectId(updates.questionId.toString()),
          lastRespondedBy: new ObjectId(userId),
          history: [],
          queue,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await this.questionSubmissionRepo.addSubmission(
          submissionData,
          session,
        );
      } else {
        if (submission.history.length > 0) {
          throw new BadRequestError(
            'Cannot approve AI answer after expert reviews have started',
          );
        }

        let submission = await this.questionSubmissionRepo.getByQuestionId(
          updates.questionId,
          session,
        );

        if (!submission) {
          const submissionData: IQuestionSubmission = {
            questionId: new ObjectId(updates.questionId.toString()),
            lastRespondedBy: new ObjectId(userId),
            history: [],
            queue,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await this.questionSubmissionRepo.addSubmission(submissionData, session);
        } else {
          if (submission.history.length > 0) {
            throw new BadRequestError('Cannot approve AI answer after expert reviews have started');
          }
          await this.questionSubmissionRepo.updateQueue(
            updates.questionId.toString(),
            queue,
            session,
          );
        }

        if (initialExpert) {
          await this.userRepo.updateReputationScore(
            initialExpert._id.toString(),
            true,
            session,
          );
          await this.notificationService.saveTheNotifications(
            `A Question has been assigned for answering`,
            'Answer Creation Assigned',
            updates.questionId.toString(),
            initialExpert._id.toString(),
            'answer_creation',
            session
          );
        }
      }*/

      return { modifiedCount: 1 };
    });
  }

  async deleteAnswer(
    questionId: string,
    answerId: string,
  ): Promise<{ deletedCount: number }> {
    return this._withTransaction(async (session: ClientSession) => {
      const answer = await this.answerRepo.getById(answerId);
      if (!answer) {
        throw new BadRequestError(`Answer with ID ${answerId} not found`);
      }
      const question = await this.questionRepo.getById(questionId);

      if (!question) {
        throw new BadRequestError(`Question with ID ${questionId} not found`);
      }
      const updatedAnswerCount = question.totalAnswersCount - 1;

      const isFinalAnswer = answer.isFinalAnswer;

      await this.questionRepo.updateQuestion(
        questionId,
        {
          totalAnswersCount: updatedAnswerCount,
          status: isFinalAnswer ? 'open' : 'closed',
        },
        session,
      );

      return this.answerRepo.deleteAnswer(answerId, session);
    });
  }

  async goldenFaq(
    userId: string,
    page: number,
    limit: number,
    search: string,
  ): Promise<{ faqs: any[]; totalFaqs: number }> {
    return await this._withTransaction(async (session: ClientSession) => {
      return await this.answerRepo.getGoldenFaqs(
        userId,
        page,
        limit,
        search,
        session,
      );
    });
  }

  async getAnswerById(answerId: string): Promise<IAnswer> {
    return await this.answerRepo.getById(answerId);
  }
}
