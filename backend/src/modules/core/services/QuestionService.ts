import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {
  GeneratedQuestionResponse,
  QuestionResponse,
} from '../classes/validators/QuestionValidators.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {CORE_TYPES} from '../types.js';
import {AiService} from './AiService.js';

@injectable()
export class QuestionService extends BaseService {
  constructor(
    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

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
    filter: 'newest' | 'oldest' | 'leastResponses' | 'mostResponses',
  ): Promise<QuestionResponse[]> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        return this.questionRepo.getUnAnsweredQuestions(
          userId,
          Number(page),
          Number(limit),
          filter,
          session,
        );
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to get unanswered questions: ${error}`,
      );
    }
  }

  async getQuestionFromRawContext(
    context: string,
  ): Promise<GeneratedQuestionResponse[]> {
    // const sampleQuestions: GeneratedQuestionResponse[] = [
    //   {
    //     id: '1',
    //     text: 'What is the main crop discussed in the transcript?',
    //     agriExpert: 'Dr. Rajesh Kumar',
    //     answer: 'The transcript mainly discusses wheat cultivation.',
    //   },
    //   {
    //     id: '2',
    //     text: 'List two key farming techniques mentioned.',
    //     agriExpert: 'Dr. Priya Sharma',
    //     answer: 'Crop rotation and drip irrigation were highlighted.',
    //   },
    //   {
    //     id: '3',
    //     text: 'How can the information be applied in real farms?',
    //     agriExpert: 'Dr. Anil Mehta',
    //     answer:
    //       'Farmers can adopt crop rotation and proper irrigation scheduling.',
    //   },
    // ];
    // const randomIndex = Math.floor(Math.random() * sampleQuestions.length);
    // return [sampleQuestions[randomIndex]];

    const questions = await this.aiService.getQuestionByContext(context);
    const uniqueQuestions = Array.from(
      new Map(questions.map(q => [q.question, q])).values(),
    ).map(q => ({
      ...q,
      id: new ObjectId().toString(),
    }));
    return uniqueQuestions;
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
