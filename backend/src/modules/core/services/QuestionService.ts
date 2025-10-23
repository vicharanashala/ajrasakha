import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {
  IQuestion,
  IQuestionSubmission,
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  InternalServerError,
  UnauthorizedError,
} from 'routing-controllers';
import {
  AddQuestionBodyDto,
  GeneratedQuestionResponse,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '../classes/validators/QuestionValidators.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {CORE_TYPES} from '../types.js';
import {AiService} from './AiService.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';
import {dummyEmbeddings} from '../utils/questionGen.js';
import {IContextRepository} from '#root/shared/database/interfaces/IContextRepository.js';
import {PreferenceDto} from '../classes/validators/UserValidators.js';

@injectable()
export class QuestionService extends BaseService {
  constructor(
    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.ContextRepository)
    private readonly contextRepo: IContextRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.RequestRepository)
    private readonly requestRepository: IRequestRepository,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async addDummyQuestions(
    userId: string,
    contextId: string,
    questions: string[],
    session?: ClientSession,
  ) {
    try {
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new BadRequestError('Questions must be a non-empty array');
      }

      if (session) {
        const insertedQuestions = [];

        for (const questionText of questions) {
          const question = await this.questionRepo.addDummyQuestion(
            userId,
            contextId,
            questionText,
            session,
          );

          const submissionData: IQuestionSubmission = {
            questionId: question._id,
            lastRespondedBy: null,
            history: [],
            queue: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await this.questionSubmissionRepo.addSubmission(
            submissionData,
            session,
          );

          insertedQuestions.push(question);
        }

        return insertedQuestions;
      }

      return this._withTransaction(
        async (transactionSession: ClientSession) => {
          const insertedQuestions = [];

          for (const questionText of questions) {
            const question = await this.questionRepo.addDummyQuestion(
              userId,
              contextId,
              questionText,
              transactionSession,
            );

            const submissionData: IQuestionSubmission = {
              questionId: question._id,
              lastRespondedBy: null,
              history: [],
              queue: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            await this.questionSubmissionRepo.addSubmission(
              submissionData,
              transactionSession,
            );

            insertedQuestions.push(question);
          }

          return insertedQuestions;
        },
      );
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
    query: GetDetailedQuestionsQuery,
  ): Promise<QuestionResponse[]> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        // 1. Fetch the user and extract their preference details
        const user = await this.userRepo.findById(userId, session);
        const userPreference = user.preference || null;

        // 2. Build a query object (userQuery) based on the user's preferences (state, crop, domain)
        const userQuery: Record<string, any> = {};
        if (userPreference.state && userPreference.state !== 'all') {
          userQuery.state = userPreference.state;
        }
        if (userPreference.crop && userPreference.crop !== 'all') {
          userQuery.crop = userPreference.crop;
        }
        if (userPreference.domain && userPreference.domain !== 'all') {
          userQuery.domain = userPreference.domain;
        }

        // 3. Get unanswered questions based purely on user preference
        const userPreferenceQuestions =
          await this.questionRepo.getUnAnsweredQuestions(
            userId,
            userQuery,
            session,
          );

        // 4. Define preference keys to be checked (state, crop, domain)
        const keys = ['state', 'crop', 'domain'] as const;

        // 5. Check if the given query matches the user's preference-based query
        const isQueryMatchingPreference = keys.every(key => {
          const prefValue = userQuery[key];
          const queryValue = query[key];

          if (prefValue && queryValue) return prefValue === queryValue;
          if (!prefValue) return true;
          return false;
        });

        // 6. If query matches preference and no questions exist for that preference,
        //    delete matching keys from query to widen the filter
        if (isQueryMatchingPreference && userPreferenceQuestions.length === 0) {
          keys.forEach(key => {
            const prefValue = userQuery[key];
            const queryValue = query[key];

            if (prefValue && queryValue && prefValue === queryValue) {
              delete query[key];
            }
          });
        }

        // 7. If user still has unanswered preference-based questions,
        //    return those first before applying broader filters
        if (
          !isQueryMatchingPreference &&
          userPreferenceQuestions.length > 0 &&
          Object.keys(userQuery).length > 0
        ) {
          console.log(
            'Returning user preference questions as they are pending',
          );
          return userPreferenceQuestions;
        }

        // 8. If no preference-based questions or filters remain,
        //    return general unanswered questions using the updated query
        return this.questionRepo.getUnAnsweredQuestions(userId, query, session);
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to get unanswered questions: ${error}`,
      );
    }
  }

  async getDetailedQuestions(
    query: GetDetailedQuestionsQuery,
  ): Promise<{questions: IQuestion[]; totalPages: number}> {
    return this.questionRepo.findDetailedQuestions(query);
  }

  async getQuestionFromRawContext(
    // While text to speech
    context: string,
  ): Promise<GeneratedQuestionResponse[]> {
    const questions = await this.aiService.getQuestionByContext(context);
    const uniqueQuestions = Array.from(
      new Map(questions.map(q => [q.question, q])).values(),
    ).map(q => ({
      ...q,
      id: new ObjectId().toString(),
    }));
    return uniqueQuestions;
  }

  // async addQuestion(
  //   userId: string,
  //   body: AddQuestionBodyDto,
  // ): Promise<Partial<IQuestion>> {
  //   try {
  //     return this._withTransaction(async (session: ClientSession) => {
  //       const {question, priority, source, details, context} = body;
  //       const user = await this.userRepo.findById(userId, session);
  //       if (!user || user.role == 'expert') {
  //         throw new UnauthorizedError(
  //           `You don't have permission to add question`,
  //         );
  //       }
  //       let contextId: ObjectId | null = null;

  //       if (context) {
  //         const {insertedId} = await this.contextRepo.addContext(
  //           context,
  //           session,
  //         );
  //         contextId = new ObjectId(insertedId);
  //       }

  //       const text = `Question: ${question}`;
  //       const {embedding} = await this.aiService.getEmbedding(text);

  //       const newQuestion: IQuestion = {
  //         userId: new ObjectId(userId),
  //         question,
  //         priority,
  //         source,
  //         status: 'open',
  //         totalAnswersCount: 0,
  //         contextId,
  //         details,
  //         embedding,
  //         metrics: null,
  //         text,
  //         createdAt: new Date(),
  //         updatedAt: new Date(),
  //       };

  //       await this.questionRepo.addQuestion(newQuestion);

  //       return newQuestion;
  //     });
  //   } catch (error) {
  //     console.log(error);
  //     throw new InternalServerError(`Failed to add question: ${error}`);
  //   }
  // }

  async addQuestion(
    userId: string,
    body: AddQuestionBodyDto,
  ): Promise<Partial<IQuestion>> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const {question, priority, source, details, context} = body;

        // 1. If context is provided, create context first and get contextId
        let contextId: ObjectId | null = null;

        if (context) {
          //i) Create Context entry
          const {insertedId} = await this.contextRepo.addContext(
            context,
            session,
          );
          //ii) convert insertedId to ObjectId
          contextId = new ObjectId(insertedId);
        }

        // 2. Create Embedding for the question based on text
        const text = `Question: ${question}`;
        const {embedding} = await this.aiService.getEmbedding(text);
        // const embedding = [];
        // 3. Create Question entry
        const newQuestion: IQuestion = {
          userId: userId && userId.trim() !== '' ? new ObjectId(userId) : null,
          question,
          priority,
          source,
          status: 'open',
          totalAnswersCount: 0,
          contextId,
          details,
          embedding,
          metrics: null,
          text,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // 4. Save Question to DB
        const savedQuestion = await this.questionRepo.addQuestion(newQuestion);

        // 5. Fetch userId based on provided preference and create queue
        // i) Find users matching the preference
        const users = await this.userRepo.findUsersByPreference(
          details as PreferenceDto,
          session,
        );
        // ii) Create queue from the users found
        const queue = users.map(user => new ObjectId(user._id.toString()));

        // 6. Create an empty QuestionSubmission entry for the newly created question
        const submissionData: IQuestionSubmission = {
          questionId: new ObjectId(savedQuestion._id.toString()),
          lastRespondedBy: null,
          history: [],
          queue,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        // 6. Save QuestionSubmission to DB
        await this.questionSubmissionRepo.addSubmission(
          submissionData,
          session,
        );

        // 7. Return the saved question
        return newQuestion;
      });
    } catch (error) {
      console.error(error);
      throw new InternalServerError(`Failed to add question: ${error}`);
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
          source: currentQuestion.source,
          details: currentQuestion.details,
          priority: currentQuestion.priority,
          createdAt: new Date(currentQuestion.createdAt).toLocaleString(),
          updatedAt: new Date(currentQuestion.updatedAt).toLocaleString(),
          totalAnswersCount: currentQuestion.totalAnswersCount,
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

        const answers = await this.answerRepo.getByQuestionId(
          questionId,
          session,
        );
        if (
          updates.status === 'closed' &&
          answers.every(answer => answer.isFinalAnswer === false)
        ) {
          throw new BadRequestError(
            `Cannot close this question as it has non-final answers`,
          );
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
        await this.answerRepo.deleteByQuestionId(questionId, session);
        await this.questionSubmissionRepo.deleteByQuestionId(
          questionId,
          session,
        );
        await this.requestRepository.deleteByEntityId(questionId, session);
        return this.questionRepo.deleteQuestion(questionId, session);
      });
    } catch (error) {
      throw new InternalServerError(`Failed to delete question: ${error}`);
    }
  }

  async getQuestionFullData(
    questionId: string,
    userId: string,
  ): Promise<IQuestion | null> {
    try {
      const question = await this.questionRepo.getQuestionWithFullData(
        questionId,
        userId,
      );
      if (!question) {
        return null;
      }
      return question;
    } catch (error) {
      throw new InternalServerError(`Failed to fetch question data: ${error}`);
    }
  }
}
