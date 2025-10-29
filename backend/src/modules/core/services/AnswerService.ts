import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {
  IAnswer,
  IQuestionMetrics,
  ISubmissionHistory,
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

@injectable()
export class AnswerService extends BaseService {
  constructor(
    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: QuestionService,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  //   async addAnswer(
  //     questionId: string,
  //     authorId: string,
  //     answer: string,
  //     sources: string[],
  //     session?: ClientSession
  //   ): Promise<{insertedId: string; isFinalAnswer: boolean}> {
  //     return this._withTransaction(async (session: ClientSession) => {
  //       const question = await this.questionRepo.getById(questionId, session);

  //       if (!question) {
  //         throw new BadRequestError(`Question with ID ${questionId} not found`);
  //       }

  //       const isQuestionClosed = question.status === 'closed';

  //       if (isQuestionClosed) {
  //         throw new BadRequestError(`Question is already closed`);
  //       }

  //       const isAlreadyResponded = await this.answerRepo.getByAuthorId(
  //         authorId,
  //         questionId,
  //         session,
  //       );

  //       if (isAlreadyResponded) {
  //         throw new BadRequestError('You’ve already submitted an answer!');
  //       }

  //       // lets consider it is not final answer
  //       let isFinalAnswer = false;

  //       let metrics: IQuestionMetrics | null = null;

  //       let analysisStatus: 'CONTINUE' | 'FLAGGED_FOR_REVIEW' | 'CONVERGED' =
  //         'CONTINUE';

  //       const answers = (await this.answerRepo.getByQuestionId(questionId)) || [];

  //       // if (answers.length) {
  //       const answerTexts = answers.map(ans => ans.answer);

  //       const payload: IQuestionWithAnswerTexts = {
  //         question_id: questionId,
  //         question_text: question.question,
  //         answers: [...answerTexts, answer],
  //       };

  //       // Wait for AI analysis
  //       // const analysis = await this.aiService.evaluateAnswers(payload);

  //       const analysis: IQuestionAnalysis = {
  //         question_id: '68f137fe5fbcb9f0f5f091eb',
  //         num_answers: 5,
  //         mean_similarity: 0.72,
  //         std_similarity: 0.15,
  //         recent_similarity: 0.68,
  //         collusion_score: 0.85,
  //         status: 'CONTINUE',
  //         message: 'Similarity score is high, needs review',
  //       };

  //       metrics = {
  //         mean_similarity: analysis.mean_similarity,
  //         std_similarity: analysis.std_similarity,
  //         recent_similarity: analysis.recent_similarity,
  //         collusion_score: analysis.collusion_score,
  //       };

  //       analysisStatus = analysis.status;

  //       if (analysisStatus == 'CONVERGED') isFinalAnswer = true;

  //       if (isFinalAnswer) {
  //         const text = `Question: ${question.question}
  // Answer: ${answer}`;
  //         const {embedding} = await this.aiService.getEmbedding(text);
  //         await this.questionRepo.updateQuestion(
  //           questionId,
  //           {text, embedding},
  //           session,
  //           true,
  //         );
  //       }

  //       const updatedAnswerCount = question.totalAnswersCount + 1;

  //       // const {embedding} = await this.aiService.getEmbedding(answer);

  //       const embedding = [];

  //       const {insertedId} = await this.answerRepo.addAnswer(
  //         questionId,
  //         authorId,
  //         answer,
  //         sources,
  //         embedding,
  //         isFinalAnswer,
  //         updatedAnswerCount,
  //         session,
  //       );

  //       await this.questionRepo.updateQuestion(
  //         questionId,
  //         {
  //           totalAnswersCount: updatedAnswerCount,
  //           metrics,
  //           status:
  //             analysisStatus == 'FLAGGED_FOR_REVIEW'
  //               ? 'in-review'
  //               : analysisStatus == 'CONTINUE'
  //                 ? 'open'
  //                 : 'closed',
  //         },
  //         session,
  //       );

  //       const submission = await this.questionSubmissionRepo.getByQuestionId(
  //         questionId,
  //         session,
  //       );
  //       if (!submission) {
  //         throw new BadRequestError('Question submission not found');
  //       }

  //       // const isCurrentExpertLastInQueue =
  //       const userSubmissionData: ISubmissionHistroy = {
  //         updatedBy: new ObjectId(authorId),
  //         answer: new ObjectId(insertedId),
  //         createdAt: new Date(),
  //         status: 'in-review',
  //         updatedAt: new Date(),
  //       };

  //       await this.questionSubmissionRepo.update(
  //         questionId,
  //         userSubmissionData,
  //         session,
  //       );

  //       // const currentSubmissionQueue = submission.queue || [];
  //       // if (
  //       //   currentSubmissionQueue.length < 10 &&
  //       //   question.isAutoAllocate &&
  //       //   currentSubmissionQueue.length == submission.history.length + 1 // +1 becuase this history not include current submission
  //       // ) {
  //       //   await this.questionService.autoAllocateExperts(questionId, session);
  //       // }

  //       // const IS_INCREMENT = false;
  //       // await this.userRepo.updateReputationScore(
  //       //   authorId,
  //       //   IS_INCREMENT,
  //       //   session,
  //       // );
  //       return {insertedId, isFinalAnswer};
  //     });
  //   }

  async addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
    sources: string[],
    session?: ClientSession,
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
      let analysisStatus: 'CONTINUE' | 'FLAGGED_FOR_REVIEW' | 'CONVERGED' =
        'CONTINUE';

      const answers = (await this.answerRepo.getByQuestionId(questionId)) || [];
      const answerTexts = answers.map(ans => ans.answer);

      const payload: IQuestionWithAnswerTexts = {
        question_id: questionId,
        question_text: question.question,
        answers: [...answerTexts, answer],
      };

      // const analysis = await this.aiService.evaluateAnswers(payload);
      const analysis: IQuestionAnalysis = {
        question_id: '68f137fe5fbcb9f0f5f091eb',
        num_answers: 5,
        mean_similarity: 0.72,
        std_similarity: 0.15,
        recent_similarity: 0.68,
        collusion_score: 0.85,
        status: 'CONTINUE',
        message: 'Similarity score is high, needs review',
      };

      metrics = {
        mean_similarity: analysis.mean_similarity,
        std_similarity: analysis.std_similarity,
        recent_similarity: analysis.recent_similarity,
        collusion_score: analysis.collusion_score,
      };

      analysisStatus = analysis.status;

      if (analysisStatus === 'CONVERGED') isFinalAnswer = true;

      if (isFinalAnswer) {
        const text = `Question: ${question.question}\nAnswer: ${answer}`;
        const {embedding} = await this.aiService.getEmbedding(text);
        await this.questionRepo.updateQuestion(
          questionId,
          {text, embedding},
          activeSession,
          true,
        );
      }

      const updatedAnswerCount = question.totalAnswersCount + 1;

      const embedding = []; // replace with actual embedding if needed

      const {insertedId} = await this.answerRepo.addAnswer(
        questionId,
        authorId,
        answer,
        sources,
        embedding,
        isFinalAnswer,
        updatedAnswerCount,
        activeSession,
      );

      await this.questionRepo.updateQuestion(
        questionId,
        {
          totalAnswersCount: updatedAnswerCount,
          metrics,
          status:
            analysisStatus === 'FLAGGED_FOR_REVIEW'
              ? 'in-review'
              : analysisStatus === 'CONTINUE'
                ? 'open'
                : 'closed',
        },
        activeSession,
      );

      // const submission = await this.questionSubmissionRepo.getByQuestionId(
      //   questionId,
      //   activeSession,
      // );
      // if (!submission) {
      //   throw new BadRequestError('Question submission not found');
      // }

      // const userSubmissionData: ISubmissionHistory = {
      //   updatedBy: new ObjectId(authorId),
      //   answer: new ObjectId(insertedId),
      //   createdAt: new Date(),
      //   status: 'in-review',
      //   updatedAt: new Date(),
      // };

      // await this.questionSubmissionRepo.update(
      //   questionId,
      //   userSubmissionData,
      //   activeSession,
      // );

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
        } = body;

        console.log('Body: ', body);

        const question = await this.questionRepo.getById(questionId, session);
        if (!question)
          throw new NotFoundError(`Failed to find question, try again!`);

        console.log('Current status: ', status);

        const questionSubmission =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );

        if (!questionSubmission)
          throw new NotFoundError(
            `Failed to find question submission document, try again!`,
          );

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

        console.log('Last answeed history: ', lastAnsweredHistory);

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

        if (!status) {
          console.log('Inside no status ');
          // Answer submission from first assigned expert
          const {insertedId} = await this.addAnswer(
            questionId,
            userId,
            answer,
            sources,
            session,
          );

          // Push entry in to history array in submission
          const userSubmissionData: ISubmissionHistory = {
            updatedBy: new ObjectId(userId),
            answer: new ObjectId(insertedId),
            createdAt: new Date(),
            status: 'in-review',
            updatedAt: new Date(),
          };

          await this.questionSubmissionRepo.update(
            questionId,
            userSubmissionData,
            session,
          );
        } else if (status == 'accepted') {
          const review_answer_id = lastAnsweredHistory.answer.toString();
          const updatedSubmissionData = {
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
          if (currentApprovalCount && currentApprovalCount >= 3) {
            const rejectedExpertId = lastAnsweredHistory.updatedBy.toString();

            await this.questionSubmissionRepo.updateHistoryByUserId(
              questionId,
              rejectedExpertId,
              {status: 'approved'},
              session,
            );

            await this.questionRepo.updateQuestion(
              questionId,
              {status: 'in-review'},
              session,
            );
            return {message: 'Your response recorded sucessfully, thankyou!'};
          }
          // Calculate current queue and history lengths
          const queueLength = questionSubmission.queue.length;
          const updatedHistoryLength = questionSubmission.history.length + 1; // +1 includes the newly added answer

          // If all queued experts have now responded and the total is at least 10,
          // move the question to 'in-review' status
          const isAllResponsesCompleted =
            updatedHistoryLength >= 10 &&
            questionSubmission.queue[queueLength - 1].toString() == userId;

          if (isAllResponsesCompleted) {
            await this.questionRepo.updateQuestion(
              questionId,
              {status: 'in-review'},
              session,
            );
            return {message: 'Your response recorded sucessfully, thankyou!'};
          }
        } else if (status == 'rejected') {
          // Prepare update payload for the rejected submission
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

          // Add a new answer entry from the current user
          const {insertedId} = await this.addAnswer(
            questionId,
            userId,
            answer,
            sources,
            session,
          );

          const updatedSubmissionData = {
            rejectedAnswer: new ObjectId(lastAnsweredHistory.answer.toString()),
            status: 'reviewed',
            answer: new ObjectId(insertedId),
          } as ISubmissionHistory;

          // Mark this user as reivewied review by changing the status
          await this.questionSubmissionRepo.updateHistoryByUserId(
            questionId,
            userId,
            updatedSubmissionData,
            session,
          );

          // Calculate current queue and history lengths
          const queueLength = questionSubmission.queue.length;
          const updatedHistoryLength = questionSubmission.history.length + 1; // +1 includes the newly added answer

          // If all queued experts have now responded and the total is at least 10,
          // move the question to 'in-review' status
          const isAllResponsesCompleted =
            updatedHistoryLength >= 10 &&
            questionSubmission.queue[queueLength - 1].toString() == userId;

          if (isAllResponsesCompleted) {
            await this.questionRepo.updateQuestion(
              questionId,
              {status: 'in-review'},
              session,
            );
            return {message: 'Your response recorded sucessfully, thankyou!'};
          }
        }

        // Allocate next user in the history from queue if necessary

        // Find the current user's position in the queue
        const currentUserIndexInQueue = currentQueue.findIndex(
          id => id.toString() === userId.toString(),
        );

        console.log(
          'Current user index: ',
          currentUserIndexInQueue,
          'currentQueue.length: ',
          currentQueue.length,
          'currentSubmissionHistory.length : ',
          currentSubmissionHistory.length,
        );

        if (
          currentUserIndexInQueue !== -1 &&
          currentUserIndexInQueue < currentQueue.length - 1 &&
          currentSubmissionHistory.length + 1 < 10
        ) {
          const nextExpertId = currentQueue[currentUserIndexInQueue + 1];

          const nextAllocatedSubmissionData: ISubmissionHistory = {
            updatedBy: new ObjectId(nextExpertId),
            status: 'in-review',
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await this.questionSubmissionRepo.update(
            questionId,
            nextAllocatedSubmissionData,
            session,
          );
        }else{
          await this.questionService.autoAllocateExperts(questionId, session);
        }
        console.log('After next allocation');

        // Auto allocate more user if necessary
        // const currentSubmissionQueue = questionSubmission.queue || [];

        // const lastHistory = currentSubmissionHistory.at(-1);

        // const canAutoAllocate =
        //   question.isAutoAllocate &&
        //   currentSubmissionQueue.length < 10 &&

        // if (canAutoAllocate) {
        //   await this.questionService.autoAllocateExperts(questionId, session);
        // }

        // Check the history limit reaced, if reached then question status will be in-review
        if (currentSubmissionHistory.length + 1 == 10) {
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

  async updateAnswer(
    answerId: string,
    updates: UpdateAnswerBody,
  ): Promise<{modifiedCount: number}> {
    return this._withTransaction(async (session: ClientSession) => {
      if (!answerId) throw new BadRequestError('AnswerId not found');
      const answer = await this.answerRepo.getById(answerId, session);

      if (!answer) {
        throw new BadRequestError(`Answer with ID ${answerId} not found`);
      }

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

      const answers = await this.answerRepo.getByQuestionId(
        questionId,
        session,
      );

      const text = `Question: ${question.question}
        answer: ${answer}`;
      const {embedding: questionEmbedding} =
        await this.aiService.getEmbedding(text);

      await this.questionRepo.updateQuestion(
        questionId,
        {text, embedding: questionEmbedding},
        session,
        true,
      );

      const {embedding} = await this.aiService.getEmbedding(text);
      const payload = {...updates, embedding};
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
}
