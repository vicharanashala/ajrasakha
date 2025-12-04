import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {
  IAnswer,
  INotificationType,
  IQuestionMetrics,
  IReview,
  ISubmissionHistory,
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
import {
  ReviewAnswerBody,
  SubmissionResponse,
  UpdateAnswerBody,
} from '../classes/validators/AnswerValidators.js';
import {CORE_TYPES} from '../types.js';
import {AiService} from './AiService.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {dummyEmbeddings} from '../utils/questionGen.js';
import {
  IQuestionAnalysis,
  IQuestionWithAnswerTexts,
} from '../classes/validators/QuestionValidators.js';
import {QuestionService} from './QuestionService.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {notifyUser} from '#root/utils/pushNotification.js';
import {NotificationService} from './NotificationService.js';
import {IReviewRepository} from '#root/shared/database/interfaces/IReviewRepository.js';

@injectable()
export class AnswerService extends BaseService {
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
  ): Promise<{insertedId: string; isFinalAnswer: boolean}> {
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
      if (isAlreadyResponded) {
        throw new BadRequestError('You’ve already submitted an answer!');
      }

      let isFinalAnswer = false;
      let metrics: IQuestionMetrics | null = null;

      const updatedAnswerCount = question.totalAnswersCount + 1;

      // const embedding = [];
      const {embedding} = await this.aiService.getEmbedding(answer);

      const {insertedId} = await this.answerRepo.addAnswer(
        questionId,
        authorId,
        answer,
        sources,
        embedding,
        isFinalAnswer,
        updatedAnswerCount,
        activeSession,
        status,
        remarks,
      );

      await this.questionRepo.updateQuestion(
        questionId,
        {
          totalAnswersCount: updatedAnswerCount,
          metrics,
        },
        activeSession,
      );

      return {insertedId, isFinalAnswer};
    };

    if (session) {
      return execute(session);
    }

    return this._withTransaction(async (newSession: ClientSession) =>
      execute(newSession),
    );
  }

  async reviewAnswer(
    userId: string,
    body: ReviewAnswerBody,
  ): Promise<{message: string}> {
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

        if (user.role !== 'expert') {
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
              ? reasonForRejection ?? ''
              : status === 'modified'
              ? reasonForModification ?? ''
              : '';

          const {insertedId} = await this.reviewRepo.createReview(
            'answer' as ReviewType,
            status as ReviewAction,
            questionId,
            userId,
            lastAnswerId,
            reason,
            parameters,
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
          const intialStatus = 'in-review' as IAnswer['status'];
          const {insertedId: answerId} = await this.addAnswer(
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
              {status: 'pending-with-moderator'},
              session,
            );
          }

          // If >=3 approvals → auto approve expert
          if (approvalCount && approvalCount >= 3) {
            const approvedExpertId = lastAnsweredHistory.updatedBy.toString();

            await this.questionSubmissionRepo.updateHistoryByUserId(
              questionId,
              approvedExpertId,
              {status: 'approved'},
              session,
            );

            await this.questionRepo.updateQuestion(
              questionId,
              {status: 'in-review'},
              session,
            );

            // Decrement the workload/reputation score
            const IS_INCREMENT = false;
            await this.userRepo.updateReputationScore(
              userId,
              IS_INCREMENT,
              session,
            );

            return {message: 'Your response recorded successfully, thank you!'};
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
              `The submitted answer is identical to the existing answer. Please modify your response before saving.`,
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

          const {insertedId: newAnswerId} = await this.addAnswer(
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
        }

        // ======================================================================
        // --------------------- MODIFIED REVIEW --------------------------------
        // ======================================================================
        if (status === 'modified') {
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
            {answer, sources, status: newStatus},
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
          if (isNotLast && isQueueNotFull) {
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
          else if (
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
          await this.questionRepo.updateQuestion(
            questionId,
            {status: 'in-review'},
            session,
          );
        }
        // Decrement the reputation score of user since the user reviewed
        const IS_INCREMENT = false;
        await this.userRepo.updateReputationScore(
          userId,
          IS_INCREMENT,
          session,
        );
      });

      return {message: 'Your response recorded sucessfully, thankyou!'};
    } catch (error) {
      throw new InternalServerError(`${error}`);
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
    dateRange?: {from: string | undefined; to: string | undefined},
  ): Promise<SubmissionResponse[]> {
    return await this._withTransaction(async (session: ClientSession) => {
      const user = await this.userRepo.findById(userId);
      if (user.role === 'expert') {
        return await this.questionSubmissionRepo.getUserActivityHistory(
          userId,
          page,
          limit,
          dateRange,
          session,
        );
      } else if (user.role === 'moderator') {
        return await this.answerRepo.getModeratorActivityHistory(
          userId,
          page,
          limit,
          dateRange,
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
    const {finalizedSubmissions} = await this.answerRepo.getAllFinalizedAnswers(
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
  async updateAnswer(
    userId: string,
    answerId: string,
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
          `Cant't edit this answer:${answerId}, currently question is not in review!`,
        );
      }

      await this.answerRepo.getByQuestionId(questionId, session);

      const text = `Question: ${question.question}

answer: ${updates.answer}`;

      // const {embedding: questionEmbedding} = await this.aiService.getEmbedding(
      //   text,
      // );
      const questionEmbedding = [];
      const authorId = answer.authorId.toString();
      await this.userRepo.updatePenaltyAndIncentive(
        authorId,
        'incentive',
        session,
      );
      await this.questionRepo.updateQuestion(
        questionId,
        {text, embedding: questionEmbedding, status: 'closed'},
        session,
        true,
      );

      // const {embedding} = await this.aiService.getEmbedding(text);
      const embedding = [];
      const payload: Partial<IAnswer> = {
        ...updates,
        approvedBy: new ObjectId(userId),
        embedding,
        isFinalAnswer: true,
        status: 'approved',
      };
      return this.answerRepo.updateAnswer(answerId, payload, session);
    });
  }

  async deleteAnswer(
    questionId: string,
    answerId: string,
  ): Promise<{deletedCount: number}> {
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
  ): Promise<{faqs: any[]; totalFaqs: number}> {
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
}
