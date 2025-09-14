import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {QuestionResponse} from '../classes/validators/QuestionValidators.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';

@injectable()
export class QuestionService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,
    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async addQuestions(
    userId: string,
    contextId: string,
    questions: string[],
  ): Promise<{insertedCount: number}> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        return this.questionRepo.addQuestions(
          userId,
          contextId,
          questions,
          session,
        );
      });
    } catch (error) {
      throw new InternalServerError(`Failed to add questions: ${error}`);
    }
  }

  async getByContextId(contextId: string): Promise<IQuestion[]> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        return this.questionRepo.getByContextId(contextId, session);
      });
    } catch (error) {
      throw new InternalServerError(`Failed to get questions: ${error}`);
    }
  }

  async getUnAnsweredQuestions(
    userId: string,
    page: number,
    limit: number,
  ): Promise<QuestionResponse[]> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        return this.questionRepo.getUnAnsweredQuestions(
          userId,
          Number(page),
          Number(limit),
          session,
        );
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to get unanswered questions: ${error}`,
      );
    }
  }

  async getQuestionById(questionId: string): Promise<QuestionResponse> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const currentQuestion = await this.questionRepo.getById(questionId);
        const currentAnswers = await this.answerRepo.getByQuestionId(
          questionId,
          session,
        );
        return {
          id: currentQuestion._id.toString(),
          text: currentQuestion.question,
          createdAt: new Date(currentQuestion.createdAt).toLocaleString(),
          updatedAt: new Date(currentQuestion.updatedAt).toLocaleString(),
          totalAnwersCount: currentQuestion.totalAnwersCount,
          currentAnswers: currentAnswers.map(currentAnswer => ({
            id: currentAnswer._id.toString(),
            answer: currentAnswer.answer,
            isFinalAnswer: currentAnswer.isFinalAnswer,
            createdAt: currentAnswer.createdAt,
          })),
        };
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to get unanswered questions: ${error}`,
      );
    }
  }

  async updateQuestion(
    questionId: string,
    updates: Partial<IQuestion>,
  ): Promise<{modifiedCount: number}> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const existingQuestion = await this.questionRepo.getById(
          questionId,
          session,
        );

        if (!existingQuestion) {
          throw new BadRequestError(`Question with ID ${questionId} not found`);
        }

        return this.questionRepo.updateQuestion(questionId, updates, session);
      });
    } catch (error) {
      throw new InternalServerError(`Failed to update question: ${error}`);
    }
  }

  async deleteQuestion(questionId: string): Promise<{deletedCount: number}> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) {
          throw new BadRequestError(`Question with ID ${questionId} not found`);
        }

        return this.questionRepo.deleteQuestion(questionId, session);
      });
    } catch (error) {
      throw new InternalServerError(`Failed to delete question: ${error}`);
    }
  }
}
