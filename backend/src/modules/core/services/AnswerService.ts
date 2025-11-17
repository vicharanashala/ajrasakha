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
      // let analysisStatus: 'CONTINUE' | 'FLAGGED_FOR_REVIEW' | 'CONVERGED' =
      //   'CONTINUE';

      const answers = (await this.answerRepo.getByQuestionId(questionId)) || [];
      const answerTexts = answers.map(ans => ans.answer);

      // const payload: IQuestionWithAnswerTexts = {
      //   question_id: questionId,
      //   question_text: question.question,
      //   answers: [...answerTexts, answer],
      // };

      // const analysis = await this.aiService.evaluateAnswers(payload);
      // const analysis: IQuestionAnalysis = {
      //   question_id: '68f137fe5fbcb9f0f5f091eb',
      //   num_answers: 5,
      //   mean_similarity: 0.72,
      //   std_similarity: 0.15,
      //   recent_similarity: 0.68,
      //   collusion_score: 0.85,
      //   status: 'CONTINUE',
      //   message: 'Similarity score is high, needs review',
      // };

      // metrics = {
      //   mean_similarity: analysis.mean_similarity,
      //   std_similarity: analysis.std_similarity,
      //   recent_similarity: analysis.recent_similarity,
      //   collusion_score: analysis.collusion_score,
      // };

      // analysisStatus = analysis.status;

      // if (analysisStatus === 'CONVERGED') isFinalAnswer = true;
      if (isFinalAnswer) {
        const text = `Question: ${question.question}\nAnswer: ${answer}`;
        const {embedding} = await this.aiService.getEmbedding(text);
        // const embedding = [];
        await this.questionRepo.updateQuestion(
          questionId,
          {text, embedding},
          activeSession,
          true,
        );
      }

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
      );

      await this.questionRepo.updateQuestion(
        questionId,
        {
          totalAnswersCount: updatedAnswerCount,
          metrics,
          // status
          // analysisStatus === 'FLAGGED_FOR_REVIEW'
          //   ? 'in-review'
          //   : analysisStatus === 'CONTINUE'
          //     ? 'open'
          //     : 'closed',
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
        const user = await this.userRepo.findById(userId, session);

        if (!user) {
          throw new UnauthorizedError(
            `Failed to find user, try re login the application!`,
          );
        }

        const {
          questionId,
          status,
          answer,
          approvedAnswer,
          rejectedAnswer,
          reasonForRejection,
          sources,
          parameters,
          modifiedAnswer,
          reasonForModification,
        } = body;

        const question = await this.questionRepo.getById(questionId, session);
        if (!question)
          throw new NotFoundError(`Failed to find question, try again!`);

        const questionSubmission =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );

        if (!questionSubmission)
          throw new NotFoundError(
            `Failed to find question submission document, try again!`,
          );

        const submissionHistory = questionSubmission?.history ?? [];

        if (submissionHistory.length === 0) {
          // Handle first-time assignment check
          const assignedReviewer = questionSubmission?.queue?.[0]?.toString();

          if (assignedReviewer && assignedReviewer !== user._id.toString()) {
            throw new UnauthorizedError(
              'You are not authorized to review this question. It has been reassigned to another reviewer.',
            );
          }
        } else {
          // Validate reviewer consistency for ongoing review
          const lastHistory = submissionHistory[submissionHistory.length - 1];
          const assignedReviewer = lastHistory.updatedBy.toString();
          if (!assignedReviewer) {
            throw new UnauthorizedError(
              'Unable to verify the reviewer information for this question. Please try again later.',
            );
          }

          if (assignedReviewer !== user._id.toString()) {
            throw new UnauthorizedError(
              'This question is currently being reviewed by another expert. Please select a different question to review.',
            );
          }
        }

        const currentSubmissionHistory = questionSubmission.history || [];
        const currentQueue = questionSubmission.queue;

        const lastAnsweredHistory = currentSubmissionHistory
          .slice()
          .reverse()
          .find(
            h =>
              h?.answer &&
              h?.answer?.toString()?.trim() !== '' &&
              h?.status !== 'rejected',
          );

        if (!lastAnsweredHistory?.answer && status) {
          // if there status means, it is either accepting or rejecting
          throw new BadRequestError(
            `No answer found under review for this question. Please check the current submission history.`,
          );
        }

        if (
          (approvedAnswer &&
            approvedAnswer?.toString() !==
              lastAnsweredHistory?.answer.toString()) ||
          (rejectedAnswer &&
            rejectedAnswer?.toString() !==
              lastAnsweredHistory?.answer.toString())
        ) {
          throw new BadRequestError(
            `Failed to review this answer. You are attempting to review an answer that is not currently under review.`,
          );
        }

        let reviewId: ObjectId | null = null;

        // If status exists, user is performing a review (not author response)
        if (status) {
          // Determine the correct reason based on status
          const reason = (() => {
            switch (status) {
              case 'rejected':
                return reasonForRejection ?? '';
              case 'modified':
                return reasonForModification ?? '';
              case 'accepted':
              default:
                return '';
            }
          })();

          // Create the review record
          const {insertedId} = await this.reviewRepo.createReview(
            'answer',
            status as ReviewAction,
            questionId,
            userId,
            lastAnsweredHistory?.answer?.toString(),
            reason,
            parameters,
            session,
          );

          if (!insertedId) {
            throw new InternalServerError(
              'Failed to create review entry, please try again!',
            );
          }

          reviewId = new ObjectId(insertedId);
        }

        if (!status) {
          // Answer submission from first assigned expert
          const {insertedId} = await this.addAnswer(
            questionId,
            userId,
            answer,
            sources,
            session,
            'in-review',
          );

          // Push entry in to history array in submission
          const userSubmissionData: ISubmissionHistory = {
            updatedBy: new ObjectId(userId),
            answer: new ObjectId(insertedId),
            createdAt: new Date(),
            status: 'in-review',
            updatedAt: new Date(),
          };

          const one = await this.questionSubmissionRepo.update(
            questionId,
            userSubmissionData,
            session,
          );
        } else if (status == 'accepted') {
          const review_answer_id = lastAnsweredHistory.answer.toString();
          // const authorId =lastAnsweredHistory.updatedBy.toString()
          // await this.userRepo.updatePenaltyAndIncentive(authorId,'incentive',session)
          const updatedSubmissionData = {
            reviewId,
            approvedAnswer: new ObjectId(review_answer_id),
            status: 'reviewed',
          } as ISubmissionHistory;

          // increment the approval count field in the answerdocuemtn
          const currentApprovalCount = await this.incrementApprovalCount(
            review_answer_id,
            session,
          );
          // Mark this user review by changing the status
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            userId,
            updatedSubmissionData,
            session,
          );
          if (
            currentSubmissionHistory.length == 10 ||
            (currentApprovalCount && currentApprovalCount >= 3)
          ) {
            const payload: Partial<IAnswer> = {
              status: 'pending-with-moderator',
            };

            let updateDocument = await this.answerRepo.updateAnswerStatus(
              body.approvedAnswer,
              payload,
              session,
            );
          }
          if (currentApprovalCount && currentApprovalCount >= 3) {
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
            const IS_INCREMENT = false;
            await this.userRepo.updateReputationScore(
              userId,
              IS_INCREMENT,
              session,
            );
            return {message: 'Your response recorded sucessfully, thankyou!'};
          }
        } else if (status == 'rejected') {
          //1. update the status of the answer as rejected
          const payload: Partial<IAnswer> = {
            status: 'rejected',
          };
          // const answerDetails = await this.answerRepo.getById(body.rejectedAnswer.toString())
          const authorId = lastAnsweredHistory.updatedBy.toString();
          console.log('ans details ', authorId);
          await this.userRepo.updatePenaltyAndIncentive(
            authorId,
            'penalty',
            session,
          );
          await this.answerRepo.updateAnswerStatus(
            body.rejectedAnswer,
            payload,
          );

          //2. Prepare update payload for the rejected submission
          const rejectedHistoryUpdate: ISubmissionHistory = {
            reasonForRejection,
            rejectedBy: new ObjectId(userId),
            status: 'rejected',
          } as ISubmissionHistory;

          // Identify the expert whose answer is being rejected
          const rejectedExpertId = lastAnsweredHistory.updatedBy.toString();

          // Update the rejected expert’s submission history
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            rejectedExpertId,
            rejectedHistoryUpdate,
            session,
          );

          //3. Add new answer with proper status
          let status = 'in-review';

          if (currentSubmissionHistory.length == 10) {
            status = 'pending-with-moderator';
          }
          // Add a new answer entry from the current user
          const {insertedId} = await this.addAnswer(
            questionId,
            userId,
            answer,
            sources,
            session,
            status,
          );

          // 4. update the exisiting review doc
          const updatedSubmissionData = {
            rejectedAnswer: new ObjectId(lastAnsweredHistory.answer.toString()),
            status: 'reviewed',
            reviewId,
            answer: new ObjectId(insertedId),
          } as ISubmissionHistory;

          // Mark this user as reivewied review by changing the status
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            userId,
            updatedSubmissionData,
            session,
          );
        } else if (status == 'modified') {
          //1. Prepare update payload for the modified submission
          const modifiedHistoryUpdate: ISubmissionHistory = {
            reasonForLastModification: reasonForModification,
            lastModifiedBy: new ObjectId(userId),
          } as ISubmissionHistory;

          // Identify the expert whose answer is being modified
          const modifiedExpertId = lastAnsweredHistory.updatedBy.toString();

          // Update the rejected expert’s submission history
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            modifiedExpertId,
            modifiedHistoryUpdate,
            session,
          );

          //2. Modify the reviewed answer with proper status
          let status = 'in-review';

          if (currentSubmissionHistory.length == 10) {
            status = 'pending-with-moderator';
          }

          const review_answer_id = lastAnsweredHistory.answer.toString();
          const updatedAnswer: Partial<IAnswer> = {
            answer,
            sources,
            status,
          };

          await this.answerRepo.updateAnswer(
            review_answer_id,
            updatedAnswer,
            session,
          );

          //3. Update the current reviewer entry in submission history

          const updatedSubmissionData = {
            modifiedAnswer: new ObjectId(review_answer_id),
            status: 'reviewed',
            reviewId,
          } as ISubmissionHistory;

          // Mark this user as reivewied review by changing the status
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            userId,
            updatedSubmissionData,
            session,
          );
        }

        // Allocate next user in the history from queue if necessary

        // Find the current user's position in the queue
        const currentUserIndexInQueue = currentQueue.findIndex(
          id => id.toString() === userId.toString(),
        );

        // Check if the current user is in the queue
        if (currentUserIndexInQueue !== -1) {
          // Case 1: Current user is not the last in the queue and total history (including next) is less than 10
          if (
            currentUserIndexInQueue < currentQueue.length - 1 &&
            currentQueue.length <= 10
          ) {
            const nextExpertId = currentQueue[currentUserIndexInQueue + 1];

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
            currentUserIndexInQueue === currentQueue.length - 1 &&
            currentQueue.length < 10 &&
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
      throw new InternalServerError(
        `Failed to review answer, please try again! /More: ${error}`,
      );
    }
  }

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
  async getSubmissions(
    userId: string,
    page: number,
    limit: number,
  ): Promise<SubmissionResponse[]> {
    return await this.answerRepo.getAllSubmissions(userId, page, limit);
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

      const {embedding: questionEmbedding} = await this.aiService.getEmbedding(
        text,
      );
      // const questionEmbedding = [];
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

      const {embedding} = await this.aiService.getEmbedding(text);
      // const embedding = [];
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
