import 'reflect-metadata';
import { inject, injectable } from 'inversify';
import { ClientSession, ObjectId } from 'mongodb';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { appConfig } from '#root/config/app.js';
import {
  IAnswer,
  INotificationType,
  IQuestionMetrics,
  ISubmissionHistory,
  PreviousAnswersItem,
  ReviewAction,
  ReviewType,
  SourceItem,
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';
import { IAnswerRepository } from '#root/shared/database/interfaces/IAnswerRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { IQuestionSubmissionRepository } from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { IReviewRepository } from '#root/shared/database/interfaces/IReviewRepository.js';
import { IReRouteRepository } from '#root/shared/database/interfaces/IReRouteRepository.js';
import { NotificationService } from '#root/modules/notification/services/NotificationService.js';
import { AiService } from '#root/modules/ai/services/AiService.js';
import { IQuestionService } from '#root/modules/question/interfaces/IQuestionService.js';
import { ReviewAnswerBody } from '../classes/validators/AnswerValidator.js';
import { IAnswerReviewService } from '../interfaces/IAnswerReviewService.js';

/**
 * Service responsible for expert & PAE peer-review workflows.
 */
@injectable()
export class AnswerReviewService extends BaseService implements IAnswerReviewService {
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
    private readonly questionService: IQuestionService,

    @inject(GLOBAL_TYPES.NotificationService)
    private readonly notificationService: NotificationService,

    @inject(GLOBAL_TYPES.ReRouteRepository)
    private readonly reRouteRepository: IReRouteRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  private async addAnswerHelper(
    questionId: string,
    authorId: string,
    answer: string,
    sources: SourceItem[],
    session?: ClientSession,
    status?: string,
    remarks?: string,
    type?: string,
  ): Promise<{ insertedId: string; isFinalAnswer: boolean }> {
    const question = await this.questionRepo.getById(questionId, session);
    if (!question) {
      throw new BadRequestError(`Question with ID ${questionId} not found`);
    }

    if (question.status === 'closed') {
      throw new BadRequestError(`Question is already closed`);
    }

    const isAlreadyResponded = await this.answerRepo.getByAuthorId(
      authorId,
      questionId,
      session,
    );
    if (isAlreadyResponded && !type) {
      throw new BadRequestError('You’ve already submitted an answer!');
    }

    const isFinalAnswer = false;
    const metrics: IQuestionMetrics | null = null;
    const updatedAnswerCount = question.totalAnswersCount + 1;

    let textEmbedding: number[] = [];
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
      session,
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
      session,
    );

    return { insertedId, isFinalAnswer };
  }

  private async incrementApprovalCount(
    answerId: string,
    session?: ClientSession,
  ): Promise<number> {
    const answer = await this.answerRepo.getById(answerId);
    if (!answer) {
      throw new NotFoundError(
        `Failed to find answer while trying increment approvalcount!`,
      );
    }
    return await this.answerRepo.incrementApprovalCount(answerId, session);
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
        ? trimmed.length > 80
          ? `${trimmed.slice(0, 80)}...`
          : trimmed
        : 'Question Ready for Approval';
      const message = 'A question is ready for your approval';

      for (const r of recipients) {
        const id = (r as any)._id?.toString();
        if (!id) continue;
        await this.notificationService
          .saveTheNotifications(
            message,
            title,
            questionId,
            id,
            'moderator_approval' as INotificationType,
            session,
          )
          .catch((err: any) => {
            console.error(
              `[ModeratorApproval] Failed to notify ${id}:`,
              err?.message,
            );
          });
      }
    } catch (err: any) {
      console.error(
        '[ModeratorApproval] Failed to notify moderators/admins:',
        err?.message,
      );
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
          const { insertedId: answerId } = await this.addAnswerHelper(
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
            const sub = await this.questionSubmissionRepo.getByQuestionId(
              questionId,
              session,
            );
            if (sub && !sub.currentExpertOpenedAt) {
              await this.questionSubmissionRepo.markQuestionOpenedByExpert(
                questionId,
                userId,
              );
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
            await this.questionSubmissionRepo.clearCurrentExpertTracking(
              questionId,
              session,
            );
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

            const wasOpenOrDelayed =
              question.status === 'open' ||
              question.status === 'delayed' ||
              question.status === 'duplicate';
            await this.questionRepo.updateQuestion(
              questionId,
              { status: 'in-review' },
              session,
            );
            if (wasOpenOrDelayed) {
              await this.notifyModeratorsAndAdminsForApproval(
                questionId,
                (question as any)?.question,
                session,
              );
            }

            // Decrement the workload/reputation score
            const IS_INCREMENT = false;
            await this.userRepo.updateReputationScore(
              userId,
              IS_INCREMENT,
              session,
            );

            await this.questionSubmissionRepo.clearCurrentExpertTracking(
              questionId,
              session,
            );
            return {
              message: 'Your response recorded successfully, thank you!',
            };
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

          const { insertedId: newAnswerId } = await this.addAnswerHelper(
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
          const message = `Your review has been rejected. Check the reviewer’s reason for more information.`;
          const title = 'Your review has been rejected.';
          const entityId = questionId.toString();
          const authorId = answerToReject.authorId.toString();
          const typeNoti: INotificationType = 'review_rejected';

          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            authorId,
            typeNoti,
            session,
          );
        }

        // ======================================================================
        // --------------------- MODIFIED REVIEW --------------------------------
        // ======================================================================
        if (status === 'modified') {
          const review_answerId = lastAnsweredHistory.answer.toString();
          const modifiedExpertId = lastAnsweredHistory.updatedBy.toString();

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

          // update in the modifications array
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
          const message = `Your review has been modified. Check the question details for the updated changes`;
          const title = 'Your answer has been modified.';
          const entityId = questionId.toString();
          const authorId = answerToModify?.authorId?.toString();
          const typeNoti: INotificationType = 'review_modified';

          if (authorId) {
            await this.notificationService.saveTheNotifications(
              message,
              title,
              entityId,
              authorId,
              typeNoti,
              session,
            );
          }
        }

        // Allocate next user in the history from queue if necessary
        const currentUserIndexInQueue = currentSumbmissionQueue.findIndex(
          id => id.toString() === userId.toString(),
        );

        if (currentUserIndexInQueue !== -1) {
          const isNotLast =
            currentUserIndexInQueue < currentSumbmissionQueue.length - 1;
          const isSingleAllocation =
            question.source === 'AJRASAKHA' ||
            question.source === 'WHATSAPP' ||
            question.source === 'AGRI_EXPERT' ||
            question.source === 'OUTREACH';

          if (
            !isSingleAllocation &&
            isNotLast &&
            currentSubmissionHistory.length < 10
          ) {
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
            const IS_INCREMENT = true;
            await this.userRepo.updateReputationScore(
              nextExpertId.toString(),
              IS_INCREMENT,
              session,
            );

            const message = `A new Review has been assigned to you`;
            const title = 'New Review Assigned';
            const entityId = questionId.toString();
            const nextUser = nextExpertId.toString();
            const typeNoti: INotificationType = 'peer_review';

            await this.notificationService.saveTheNotifications(
              message,
              title,
              entityId,
              nextUser,
              typeNoti,
              session,
            );
          }

          if (
            !isSingleAllocation &&
            currentUserIndexInQueue === currentSumbmissionQueue.length - 1 &&
            currentSumbmissionQueue.length < 10 &&
            question.isAutoAllocate
          ) {
            await this.questionService.autoAllocateExperts(questionId, session);
          }
        }

        // Check if history limit reached
        if (currentSubmissionHistory.length === 10) {
          const wasOpenOrDelayed =
            question.status === 'open' ||
            question.status === 'delayed' ||
            question.status === 'duplicate';
          await this.questionRepo.updateQuestion(
            questionId,
            { status: 'in-review' },
            session,
          );
          if (wasOpenOrDelayed) {
            await this.notifyModeratorsAndAdminsForApproval(
              questionId,
              (question as any)?.question,
              session,
            );
          }
        }

        // Reset current-expert tracking
        await this.questionSubmissionRepo.clearCurrentExpertTracking(
          questionId,
          session,
        );

        // Decrement reputation score
        const IS_INCREMENT = false;
        await this.userRepo.updateReputationScore(
          userId,
          IS_INCREMENT,
          session,
        );
      });

      // Transaction committed. This review may have handed the question off to a
      // moderator (status → in-review, via autoAllocateExperts or the history-limit
      // branch above) — event-driven moderator-queue allocation (replaces the periodic
      // moderator cron). Fire-and-forget, so it can't affect the recorded review.
      this.questionService.triggerModeratorQueueAllocation('reviewAnswer');

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

        if (!questionSubmission) {
          throw new NotFoundError(
            `Failed to find submission details for this question.`,
          );
        }

        const submissionHistory = questionSubmission.reroutes ?? [];
        if (submissionHistory.length === 0) {
          throw new UnauthorizedError(
            'You are not authorized to review this question. It has been assigned to another reviewer.',
          );
        } else {
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

        const lastHistory = submissionHistory[submissionHistory.length - 1];
        const moderatorId = lastHistory.reroutedBy.toString();
        const lastAnswerId = questionSubmission?.answerId?.toString();

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
          const wasOpenOrDelayed =
            question.status === 'open' ||
            question.status === 'delayed' ||
            question.status === 'duplicate';
          await this.questionRepo.updateQuestion(
            questionId,
            { status: 'in-review' },
            session,
          );
          if (wasOpenOrDelayed) {
            await this.notifyModeratorsAndAdminsForApproval(
              questionId,
              (question as any)?.question,
              session,
            );
          }

          reviewId = new ObjectId(insertedId);
        }

        let review_answerId: any;
        if (status === 'accepted') {
          review_answerId = approvedAnswer;
          await this.incrementApprovalCount(review_answerId, session);

          await this.reRouteRepository.updateStatus(
            questionId.toString(),
            userId.toString(),
            'approved',
            review_answerId,
            undefined,
            session,
          );
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

          const { insertedId: answerId } = await this.addAnswerHelper(
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

          // update in the modifications array
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
}
