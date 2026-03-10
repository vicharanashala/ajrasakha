import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {startBalanceWorkloadWorkers} from '#root/workers/balanceWorkload.manager.js';
import {
  IQuestion,
  IQuestionSubmission,
  ISubmissionHistory,
  IAnswer,
  INotificationType,
  IQuestionPriority,
  ISimilarQuestion,
  AddQuestionResult
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IRequestRepository} from '#root/shared/database/interfaces/IRequestRepository.js';
import {IContextRepository} from '#root/shared/database/interfaces/IContextRepository.js';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {notifyUser} from '#root/utils/pushNotification.js';
import {normalizeKeysToLower} from '#root/utils/normalizeKeysToLower.js';
import {appConfig} from '#root/config/app.js';
import {AiService} from '#root/modules/core/services/AiService.js';
import {
  AddQuestionBodyDto,
  GeneratedQuestionResponse,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '../classes/validators/QuestionVaidators.js';
import {PreferenceDto} from '#root/modules/core/classes/validators/UserValidators.js';
import {QuestionLevelResponse} from '#root/modules/core/classes/transformers/QuestionLevel.js';
import {NotificationService} from '#root/modules/core/services/NotificationService.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IQuestionService} from '../interfaces/IQuestionService.js';
import {isToday} from '#root/utils/date.utils.js';
import {IReRouteRepository} from '#root/shared/database/interfaces/IReRouteRepository.js';
import { sendEmailWithAttachment } from '#root/utils/mailer.js';
import ExcelJS from "exceljs";
import { cosineSimilarity } from '../../../utils/cosine-similarity.js';
import {IDuplicateQuestionRepository} from '#root/shared/database/interfaces/IDuplicateQuestionRepository.js';
import { chatbotSimilarityLogger } from '../logger/chatbot-similarity.logger.js';
import { checkConceptDuplicate } from '../openai/checkConceptDuplicate.js';

@injectable()
export class QuestionService extends BaseService implements IQuestionService {
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

    @inject(GLOBAL_TYPES.NotificationRepository)
    private readonly notificationRepository: INotificationRepository,

    @inject(GLOBAL_TYPES.NotificationService)
    private readonly notificationService: NotificationService,

    @inject(GLOBAL_TYPES.ReRouteRepository)
    private readonly reRouteRepository: IReRouteRepository,

    @inject(GLOBAL_TYPES.DuplicateQuestionRepository)
    private readonly duplicateQuestionRepository: IDuplicateQuestionRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async createBulkQuestions(
    userId: string,
    questions: any[],
  ): Promise<string[]> {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new BadRequestError('No questions provided for bulk insert');
    }

    // To test whether the ai server is running or not
    const testEmbedding = await this.aiService.getEmbedding('Test');

    const formatted: IQuestion[] = questions.map((q: any) => {
      const low = normalizeKeysToLower(q || {});
      const details = {
        state: (low.state || '').toString(),
        district: (low.district || '').toString(),
        crop: (low.crop || '').toString(),
        season: (low.season || '').toString(),
        domain: (low.domain || '').toString(),
      };
      const priorityRaw = (low.priority || 'medium').toString().toLowerCase();
      const priorities = ['low', 'high', 'medium'];
      const priority = priorities.includes(priorityRaw)
        ? (priorityRaw as IQuestionPriority)
        : 'medium';
      const questionText = (low.question || '').toString().trim();
      const aiInitialAnswer = q.aiInitialAnswer;
      if (!questionText) {
        throw new BadRequestError(
          'Each question must have a non-empty "question" field',
        );
      }
      const base: IQuestion = {
        userId: userId && userId.trim() !== '' ? new ObjectId(userId) : null,
        question: questionText,
        priority,
        source: (low.source || 'AGRI_EXPERT') as IQuestion['source'],
        status: 'open',
        totalAnswersCount: 0,
        contextId: null,
        details,
        aiInitialAnswer,
        isAutoAllocate: true,
        embedding: [],
        metrics: null,
        text: `Question: ${questionText}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return base;
    });

    try {
      const insertedIds = await this.questionRepo.insertMany(formatted);
      return insertedIds;
    } catch (error: any) {
      throw new InternalServerError(
        `Failed to insert questions: ${error?.message || error}`,
      );
    }
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

  async getAllocatedQuestions(
    userId: string,
    query: GetDetailedQuestionsQuery,
  ): Promise<QuestionResponse[]> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        return this.questionRepo.getAllocatedQuestions(userId, query, session);
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
    let searchEmbedding: number[] | null = null;

    if (query?.search) {
      try {
        // const embedding=[]
        const {embedding} = await this.aiService.getEmbedding(query.search);
        searchEmbedding = embedding;
      } catch (err) {
        console.error(
          'Embedding generation failed, falling back to normal search:',
          err,
        );
        searchEmbedding = null;
      }
    }

    return this.questionRepo.findDetailedQuestions({
      ...query,
      searchEmbedding,
    });
  }

  async getQuestionFromRawContext(
    // While text to speech
    context: string,
  ): Promise<GeneratedQuestionResponse[]> {
    const questions = await this.aiService.getQuestionByContext(context);
    const merged = [
      ...(questions.reviewer || []).map((item: any) => ({
        question: item.question,
        answer: item.answer,
        agri_specialist: item.source || "AGRI_EXPERT",
        referenceSource: "reviewer",
      })),
  
      ...(questions.golden || []).map((item: any) => ({
        question: item.question,
        answer: item.answer,
        agri_specialist: item.metadata?.["Agri Specialist"] || "Unknown",
        referenceSource: "golden",
      })),
  
      ...(questions.pop || []).map((item: any) => ({
        question: "Reference Information",
        answer: item.text,
        agri_specialist: "POP_DOCUMENT",
        referenceSource: "pop",
      })),
    ];
    const uniqueQuestions = Array.from(
      new Map(merged.map(q => [q.question, q])).values(),
    ).map(q => ({
      ...q,
      id: new ObjectId().toString(),
    }));
    return uniqueQuestions;
  }

  /*async addQuestion(
    userId: string,
    body: AddQuestionBodyDto,
  ): Promise<Partial<IQuestion>> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        body = normalizeKeysToLower(body);
        let {
          question,
          priority,
          source = 'AGRI_EXPERT',
          details,
          context,
        } = body;

        if (!details) {
          const b: any = body;

          details = {
            state: b?.state || '',
            district: b?.district || '',
            crop: b?.crop || '',
            season: b?.season || '',
            domain: b?.domain || '',
          };
        }

        let priorities = ['low', 'high', 'medium,'];
        priority = priority.toLowerCase() as IQuestion['priority'];
        if (!priorities.includes(priority)) {
          priority = 'medium';
        }
        if (!question || question.trim() == '') {
          throw new BadRequestError(`Question is required`);
        }
        if (
          !details.crop ||
          !details.district ||
          !details.domain ||
          !details.season ||
          !details.state
        ) {
          throw new BadRequestError(`All fields are required`);
        }
        // Prevent duplicate questoin entry
        const isQuestionExisit =
          await this.questionRepo.getQuestionByQuestionText(
            body?.question || '',
            session,
          );

        // if (isQuestionExisit)
        //   throw new BadRequestError(
        //     `This question already exsist in database, try adding new one!`,
        //   );

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

        let textEmbedding = [];
        const ENABLE_AI_SERVER = appConfig.ENABLE_AI_SERVER;

        if (ENABLE_AI_SERVER) {
          const {embedding} = await this.aiService.getEmbedding(text);
          textEmbedding = embedding;
        }

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
          isAutoAllocate: true,
          embedding: textEmbedding,
          metrics: null,
          aiInitialAnswer: body.aiInitialAnswer || '',
          text,
          createdAt: new Date(),

          // createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
          updatedAt: new Date(),
        };
        // 4. Save Question to DB
        const savedQuestion = await this.questionRepo.addQuestion(
          newQuestion,
          session,
        );

        // 5. Fetch userId based on provided preference and create queue
        // i) Find users matching the preference
        const users = await this.userRepo.findExpertsByPreference(
          details as PreferenceDto,
          session,
        );

        // ii) Create queue from the users found
        const intialUsersToAllocate = users.slice(0, 3);

        const queue = intialUsersToAllocate // Limit to first 3 experts
          .map(user => new ObjectId(user._id.toString()));

        // for (const user of intialUsersToAllocate) {
        //   const IS_INCREMENT = true;
        //   const userId = user._id.toString();
        //   await this.userRepo.updateReputationScore(
        //     userId,
        //     IS_INCREMENT,
        //     session,
        //   );
        // }
        if (intialUsersToAllocate) {
          const IS_INCREMENT = true;
          const userId = intialUsersToAllocate[0]._id.toString();
          await this.userRepo.updateReputationScore(
            userId,
            IS_INCREMENT,
            session,
          );
        }
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

        //send notification to the first assigned expert
        if (intialUsersToAllocate[0]) {
          let message = `A Question has been assigned for answering`;
          let title = 'Answer Creation Assigned';
          let entityId = savedQuestion._id.toString();
          const user = intialUsersToAllocate[0]._id.toString();
          const type: INotificationType = 'answer_creation';
          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            user,
            type,
          );
        }
        // 7. Return the saved question
        return newQuestion;
      });
    } catch (error) {
      console.error(error);
      throw new InternalServerError(`Failed to add question: ${error}`);
    }
  }*/
 

  /*async addQuestion(
    userId: string,
    body: AddQuestionBodyDto,
  ): Promise<AddQuestionResult> {
    const logData: Record<string, any> = {};
    try {
      body = normalizeKeysToLower(body);
  
      let {
        question,
        priority,
        source = 'AGRI_EXPERT',
        details,
        context,
      } = body;
  
      if (!details) {
        const b: any = body;
        details = {
          state: b?.state || '',
          district: b?.district || '',
          crop: b?.crop || '',
          season: b?.season || '',
          domain: b?.domain || '',
        };
      }
  
      const validPriorities = ['low', 'medium', 'high'];
      priority = priority?.toLowerCase() as IQuestion['priority'];
      if (!validPriorities.includes(priority)) {
        priority = 'medium';
      }
  
      if (!question?.trim()) {
        throw new BadRequestError(`Question is required`);
      }
  
      if (
        !details.crop ||
        !details.district ||
        !details.domain ||
        !details.season ||
        !details.state
      ) {
        throw new BadRequestError(`All fields are required`);
      }

      logData.userId = userId;
      logData.question = question;
      logData.details = details;
      logData.source = source;

      // 🔹 Create Embedding — OUTSIDE transaction
      const text = `Question: ${question}`;
      let textEmbedding: number[] = [];


      if (appConfig.ENABLE_AI_SERVER) {
        const { embedding } = await this.aiService.getEmbedding(text);
        textEmbedding = embedding;
      }

      logData.embeddingGenerated = textEmbedding.length > 0;
      logData.vectorLength = textEmbedding.length;

      // 🔥 Similarity Check — OUTSIDE transaction ($vectorSearch cannot run inside one)
      let highestScore = 0;
      let referenceQuestionId: ObjectId | null = null;
      let referenceQuestion=''
      
      if (textEmbedding.length && source === 'AJRASAKHA') {
        // No session passed here intentionally
        const topSimilar = await this.questionRepo.findTopSimilarQuestions(
          textEmbedding,
          5,
          { state: details.state, district: details.district, crop: details.crop, domain: details.domain, season: details.season },
        );

        logData.totalMatches = topSimilar.length;
        logData.matches = topSimilar.map((q) => ({
          questionId: q._id,
          question: q.question,
          similarityScore: ((q._vectorSearchScore ?? 0) * 100).toFixed(2),
        }));

        if (topSimilar.length > 0) {
          const best = topSimilar[0];
          highestScore = (best._vectorSearchScore ?? 0) * 100;
          referenceQuestionId = best._id as ObjectId;
          referenceQuestion=best.question
          logData.vectorLength = textEmbedding.length;
          logData.referenceQuestionId = referenceQuestionId;
        }

      }

      logData.highestScore = highestScore.toFixed(2);
      logData.threshold = 85;      

      // ✅ Everything that needs atomicity goes inside the transaction
      return this._withTransaction(async (session: ClientSession) => {
        // 🔹 Create Context
        let contextId: ObjectId | null = null;

        if (context) {
          const { insertedId } = await this.contextRepo.addContext(context, session);
          contextId = new ObjectId(insertedId);
        }

        // 🔹 Create Base Question Object
        const baseQuestion: IQuestion = {
          userId: userId?.trim() !== '' ? new ObjectId(userId) : null,
          question,
          priority,
          source,
          status: 'open',
          totalAnswersCount: 0,
          contextId,
          details,
          isAutoAllocate: true,
          embedding: textEmbedding,
          metrics: null,
          aiInitialAnswer: body.aiInitialAnswer || '',
          text,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
  
        // =====================================================
        // 🔥 IF SIMILAR → STORE AS DUPLICATE
        // =====================================================
        if (highestScore >= 85 && referenceQuestionId && referenceQuestion) {
          const duplicateQuestion = {
            ...baseQuestion,
            similarityScore: Number(highestScore.toFixed(2)),
            referenceQuestionId,
            referenceQuestion
          };
          await this.duplicateQuestionRepository.addDuplicate(
            duplicateQuestion,
            session,
          );
  
          logData.outcome = 'DUPLICATE_DETECTED';
          logData.matchedQuestion = referenceQuestion;
          logData.similarityScore = highestScore.toFixed(2);
          chatbotSimilarityLogger.warn('ADD_QUESTION_LOG', logData);

          return { isDuplicate: true, data: duplicateQuestion };
        }
  
        // =====================================================
        // 🔥 IF NOT SIMILAR → NORMAL FLOW
        // =====================================================
    
        logData.outcome = 'NEW_QUESTION_ADDED';
        chatbotSimilarityLogger.info('ADD_QUESTION_LOG', logData);

        const savedQuestion = await this.questionRepo.addQuestion(
          baseQuestion,
          session,
        );
  
        if (!savedQuestion?._id) {
          throw new InternalServerError(`Failed to save question to database`);
        }
  
        const users = await this.userRepo.findExpertsByPreference(
          details as PreferenceDto,
          session,
        );
  
        const initialUsersToAllocate = users.slice(0, 3);
  
        const queue = initialUsersToAllocate.map(
          (user) => new ObjectId(user._id.toString()),
        );
  
        if (initialUsersToAllocate[0]) {
          await this.userRepo.updateReputationScore(
            initialUsersToAllocate[0]._id.toString(),
            true,
            session,
          );
        }
  
        const submissionData: IQuestionSubmission = {
          questionId: new ObjectId(savedQuestion._id.toString()),
          lastRespondedBy: null,
          history: [],
          queue,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
  
        await this.questionSubmissionRepo.addSubmission(submissionData, session);
  
        if (initialUsersToAllocate[0]) {
          await this.notificationService.saveTheNotifications(
            `A Question has been assigned for answering`,
            'Answer Creation Assigned',
            savedQuestion._id.toString(),
            initialUsersToAllocate[0]._id.toString(),
            'answer_creation',
          );
        }
  
        return { isDuplicate: false, data: baseQuestion };
      });
    } catch (error) {
      console.error(error);

      logData.outcome = 'FAILED';
      logData.errorMessage = error.message;
      logData.stack = error.stack;
      chatbotSimilarityLogger.error('ADD_QUESTION_LOG', logData);
            
      throw new InternalServerError(`Failed to add question: ${error}`);
    }
  }*/
  async addQuestion(
    userId: string,
    body: AddQuestionBodyDto,
  ): Promise<AddQuestionResult> {
    console.log("add question method 505 called with body:", body);
    const logData: Record<string, any> = {};
    try {
      body = normalizeKeysToLower(body);
  
      let {
        question,
        priority,
        source = 'AGRI_EXPERT',
        details,
        context,
      } = body;
  
      if (!details) {
        const b: any = body;
        details = {
          state: b?.state || '',
          district: b?.district || '',
          crop: b?.crop || '',
          season: b?.season || '',
          domain: b?.domain || '',
        };
      }
  
      const validPriorities = ['low', 'medium', 'high'];
      priority = priority?.toLowerCase() as IQuestion['priority'];
      if (!validPriorities.includes(priority)) {
        priority = 'medium';
      }
  
      if (!question?.trim()) {
        throw new BadRequestError(`Question is required`);
      }
  
      if (
        !details.crop ||
        !details.district ||
        !details.domain ||
        !details.season ||
        !details.state
      ) {
        throw new BadRequestError(`All fields are required`);
      }

      logData.userId = userId;
      logData.question = question;
      logData.details = details;
      logData.source = source;

      // 🔹 Create Embedding — OUTSIDE transaction
      const text = `Question: ${question}`;
      let textEmbedding: number[] = [];

      
      if (appConfig.ENABLE_AI_SERVER) {
        const { embedding } = await this.aiService.getEmbedding(text);
        textEmbedding = embedding;
      }
      textEmbedding = [
    -0.013456368818879128,
    0.018867095932364464,
    0.02485898695886135,
    0.0025503195356577635,
    -0.04133155569434166,
    0.038005731999874115,
    0.00740574486553669,
    0.016502732411026955,
    0.04138239100575447,
    0.04007939249277115,
    -0.012843542732298374,
    -0.027642767876386642,
    0.001121762441471219,
    -0.03362029418349266,
    -0.0008598113781772554,
    0.002773374319076538,
    -0.0448007732629776,
    -0.05310164391994476,
    -0.01606462523341179,
    0.05330059304833412,
    0.004865072667598724,
    0.06732919067144394,
    0.007383849937468767,
    -0.017480088397860527,
    0.010695886798202991,
    0.009995784610509872,
    -0.06677480041980743,
    -0.04137638583779335,
    0.07007487118244171,
    0.05046694725751877,
    -0.04052548110485077,
    0.014404882676899433,
    0.023701360449194908,
    0.02628622017800808,
    -0.026815371587872505,
    -0.030264582484960556,
    0.0030803470872342587,
    -0.05039973556995392,
    0.004611459095031023,
    -0.04696406424045563,
    0.00013584352564066648,
    0.011196337640285492,
    0.013964852318167686,
    0.0054159509018063545,
    0.01624286361038685,
    -0.0008048700401559472,
    -0.04237041622400284,
    -0.005482228938490152,
    -0.021403269842267036,
    -0.008189305663108826,
    -0.002010302385315299,
    0.03540122136473656,
    0.002741838339716196,
    -0.04807814955711365,
    -0.007769380230456591,
    0.00268744258210063,
    -0.0029322048649191856,
    -0.005576836410909891,
    -0.05762734264135361,
    0.03882018104195595,
    0.017188388854265213,
    0.014207885600626469,
    -0.025218047201633453,
    -0.00108800467569381,
    0.05807335674762726,
    0.09575408697128296,
    -0.022260505706071854,
    0.0023809480480849743,
    0.03248405084013939,
    -0.01766887493431568,
    -0.011527602560818195,
    0.00768883666023612,
    -0.006047488655894995,
    -0.012343120761215687,
    0.009561792016029358,
    0.00666810292750597,
    0.05161426216363907,
    0.037600789219141006,
    -0.010226523503661156,
    0.05275484174489975,
    -0.03408624976873398,
    0.0070501468144357204,
    0.008701714687049389,
    -0.040984321385622025,
    -0.03303367272019386,
    -0.011225269176065922,
    0.0022256190422922373,
    0.0013746515614911914,
    0.035410650074481964,
    0.004576437175273895,
    -0.027163809165358543,
    0.01763031631708145,
    0.0047041913494467735,
    -0.04089409112930298,
    0.012869074009358883,
    -0.0015635299496352673,
    -0.038744378834962845,
    0.07920010387897491,
    0.05141293630003929,
    0.006256830878555775,
    0.04613649472594261,
    0.02606033720076084,
    0.008077628910541534,
    0.006900344043970108,
    -0.06205364689230919,
    -0.010348547250032425,
    0.03634893521666527,
    -0.004940529819577932,
    -0.0596708282828331,
    0.011110430583357811,
    0.021953122690320015,
    0.01580781117081642,
    -0.030817678198218346,
    0.012106280773878098,
    0.004263259470462799,
    0.013716687448322773,
    -0.0031958776526153088,
    0.04028698429465294,
    -0.11218683421611786,
    0.05204952880740166,
    0.02766958437860012,
    -0.0009689304861240089,
    0.03138285502791405,
    -0.016710732132196426,
    0.00777601869776845,
    -0.023153308779001236,
    -0.04576477035880089,
    0.020085684955120087,
    -0.02372162416577339,
    -0.01613864116370678,
    -0.005428311415016651,
    -0.047326959669589996,
    -0.011738474480807781,
    0.021462157368659973,
    0.021606605499982834,
    0.03679800033569336,
    0.013450471684336662,
    0.01024090126156807,
    0.0044870320707559586,
    -0.04830542579293251,
    0.0024207737296819687,
    0.016200823709368706,
    0.007773124612867832,
    0.0863092839717865,
    0.009087483398616314,
    0.00034927178057841957,
    0.00184365373570472,
    0.0037009681109339,
    -0.00347131141461432,
    0.03332673758268356,
    -0.05607224255800247,
    0.004191195126622915,
    -0.0323278084397316,
    0.022354159504175186,
    0.03161311894655228,
    -0.0552876740694046,
    0.009773746132850647,
    -0.03313061222434044,
    -0.010413788259029388,
    0.038483697921037674,
    0.020981699228286743,
    0.03140738606452942,
    -0.0037845082115381956,
    -0.005458945408463478,
    -0.0350603349506855,
    0.05254491791129112,
    -0.02659010887145996,
    -0.017574720084667206,
    -0.004078543744981289,
    -0.028345048427581787,
    0.049745846539735794,
    -0.02789808064699173,
    0.011175199411809444,
    0.03224626183509827,
    0.0013837858568876982,
    -0.017525341361761093,
    0.06007441505789757,
    0.03606833517551422,
    0.03567395359277725,
    0.031072678044438362,
    0.0027506956830620766,
    -0.04410463199019432,
    0.024802297353744507,
    0.05853378027677536,
    0.0018175073200836778,
    0.04253958910703659,
    -0.01894955337047577,
    -0.001896780333481729,
    0.023611348122358322,
    -0.012967369519174099,
    0.005588069558143616,
    0.011795677244663239,
    0.0009204227826558053,
    0.009854735806584358,
    -0.013720057904720306,
    -0.029849743470549583,
    -0.03545336797833443,
    0.034048132598400116,
    0.024279087781906128,
    -0.025517942383885384,
    -0.01815439946949482,
    0.036178044974803925,
    0.011993026360869408,
    0.015027583576738834,
    -0.013409599661827087,
    0.010107908397912979,
    0.017789149656891823,
    0.02217659167945385,
    -0.008185994811356068,
    -0.0007978195208124816,
    0.04071824252605438,
    0.00340461079031229,
    -0.03903832659125328,
    -0.01781809702515602,
    0.02480299398303032,
    0.000960752775426954,
    -0.025061363354325294,
    0.01740165986120701,
    0.014731685630977154,
    -0.026255229488015175,
    0.03774324804544449,
    -0.018132232129573822,
    0.033139362931251526,
    0.032951146364212036,
    0.017615418881177902,
    -0.02715327776968479,
    -0.031763043254613876,
    0.060910310596227646,
    0.042119622230529785,
    0.03465427830815315,
    0.0024686248507350683,
    0.02207539789378643,
    0.03943527862429619,
    0.04085870087146759,
    -0.0003557520976755768,
    0.015173912048339844,
    -0.005305445287376642,
    0.02605791762471199,
    0.02348385937511921,
    -0.009013347327709198,
    0.03245069831609726,
    0.022582273930311203,
    0.016242289915680885,
    0.01421315222978592,
    0.007386340759694576,
    0.052449584007263184,
    0.0009555374854244292,
    0.0009830426424741745,
    -0.010087281465530396,
    0.04910283535718918,
    -0.025132132694125175,
    0.04114554077386856,
    0.03972930088639259,
    0.038344088941812515,
    -0.0019697477109730244,
    0.016654714941978455,
    0.0071674552746117115,
    -0.006845098454505205,
    -0.03751508891582489,
    -0.05514178425073624,
    0.018229767680168152,
    0.009526395238935947,
    0.01613250933587551,
    -0.01449001394212246,
    0.014886408112943172,
    0.020876683294773102,
    -0.032413069158792496,
    0.0941166877746582,
    -0.009072226472198963,
    -0.0017236971762031317,
    -0.006272077094763517,
    -0.0563771054148674,
    -0.016050949692726135,
    -0.046819210052490234,
    -0.0563717819750309,
    -0.04441223293542862,
    -0.008978175930678844,
    -0.03493882715702057,
    0.024932513013482094,
    0.002137505216524005,
    0.010011871345341206,
    -0.02210194803774357,
    -0.01904934272170067,
    0.06185898557305336,
    0.028946878388524055,
    0.004612807184457779,
    0.012715436518192291,
    0.010132704861462116,
    -0.05321833863854408,
    0.022712888196110725,
    0.014873972162604332,
    0.02952827885746956,
    -0.08550756424665451,
    -0.015113486908376217,
    -0.012989960610866547,
    -0.0022107474505901337,
    -0.005249786656349897,
    -0.024941924959421158,
    0.018091393634676933,
    0.013460659421980381,
    -0.048478078097105026,
    0.0038645779713988304,
    -0.03776577115058899,
    -0.000032984986319206655,
    0.011115211993455887,
    0.02018614672124386,
    -0.04437842220067978,
    -0.023950820788741112,
    0.0039656939916312695,
    -0.014029408805072308,
    -0.0004601941618602723,
    0.019826499745249748,
    0.0023655965924263,
    0.009416668675839901,
    -0.06601312011480331,
    0.016641372814774513,
    0.0346972793340683,
    0.02623637765645981,
    -0.0208260677754879,
    -0.033980246633291245,
    -0.061920009553432465,
    -0.029434209689497948,
    0.020562024787068367,
    -0.018301932141184807,
    0.004751117434352636,
    0.03528321906924248,
    0.006685398519039154,
    -0.07660604268312454,
    0.04970422014594078,
    -0.029677093029022217,
    -0.0461556613445282,
    -0.009700723923742771,
    -0.040307801216840744,
    0.014416498132050037,
    0.005560263060033321,
    0.009655145928263664,
    -0.029119018465280533,
    -0.03685283288359642,
    -0.03990771621465683,
    -0.015607094392180443,
    0.04221878573298454,
    0.0017401902005076408,
    0.039314404129981995,
    0.018363524228334427,
    0.03240450844168663,
    0.02968614734709263,
    0.07275041937828064,
    -0.03543746843934059,
    0.04530549794435501,
    -0.010643973015248775,
    0.021434856578707695,
    0.008901841938495636,
    -0.026395954191684723,
    -0.01754876598715782,
    0.04241597652435303,
    0.018692035228013992,
    -0.020558049902319908,
    0.03505898639559746,
    0.0023984236177057028,
    -0.004219891969114542,
    -0.003259944263845682,
    0.05704892426729202,
    0.0018676758045330644,
    -0.016898542642593384,
    -0.01673133298754692,
    -0.029703309759497643,
    0.02287246473133564,
    -0.00777391716837883,
    0.034110598266124725,
    -0.023261120542883873,
    0.03497089073061943,
    0.0004811584367416799,
    -0.009233733639121056,
    -0.011412957683205605,
    -0.031057359650731087,
    -0.01852530799806118,
    0.019209235906600952,
    -0.01963977888226509,
    0.05212904512882233,
    -0.032996974885463715,
    0.07431982457637787,
    -0.021366503089666367,
    0.011900543235242367,
    0.009716146625578403,
    0.022913888096809387,
    0.01110800076276064,
    -0.01586661860346794,
    0.027022501453757286,
    -0.03912096843123436,
    -0.02619851939380169,
    0.049115851521492004,
    -0.04304257780313492,
    0.013006018474698067,
    -0.00965009443461895,
    -0.002497167559340596,
    -0.03729848563671112,
    0.006875703111290932,
    -0.014050055295228958,
    0.0003169711562804878,
    0.00018338006339035928,
    0.033816900104284286,
    -0.015194828622043133,
    0.00848759338259697,
    0.023853100836277008,
    0.01482594758272171,
    -0.01465451717376709,
    -0.05426466837525368,
    0.040801048278808594,
    0.018742835149168968,
    -0.05839468166232109,
    0.013176290318369865,
    0.007852026261389256,
    0.011267699301242828,
    0.02633923850953579,
    -0.00032980574178509414,
    -0.006302358116954565,
    -0.06904567778110504,
    0.005860270466655493,
    0.005004939157515764,
    0.00004812073893845081,
    -0.03313639387488365,
    -0.028622867539525032,
    -0.03622739017009735,
    0.03604456037282944,
    0.007118748966604471,
    0.008596232160925865,
    0.03656129166483879,
    -0.022992363199591637,
    0.017634078860282898,
    0.03491844981908798,
    0.023484034463763237,
    0.024000754579901695,
    -0.03728582337498665,
    -0.006247037090361118,
    -0.01941509358584881,
    0.033106688410043716,
    0.01666153594851494,
    0.014375679194927216,
    -0.050304852426052094,
    0.008897357620298862,
    -0.00329895899631083,
    0.016453655436635017,
    -0.0017072370974346995,
    -0.015484115108847618,
    -0.026182763278484344,
    0.03278186544775963,
    0.018649954348802567,
    0.0033614852000027895,
    0.030612578615546227,
    0.015223102644085884,
    0.029884910210967064,
    -0.038535140454769135,
    0.02978985197842121,
    -0.012606741860508919,
    0.026791008189320564,
    0.020967183634638786,
    0.011456337757408619,
    0.033827412873506546,
    0.02914665825664997,
    -0.015668708831071854,
    -0.02031494304537773,
    -0.02046174556016922,
    -0.01926395297050476,
    0.023227261379361153,
    -0.0596776008605957,
    0.04367111995816231,
    0.010966505855321884,
    -0.042467862367630005,
    0.0775369256734848,
    0.01078659575432539,
    0.012475039809942245,
    0.04973561689257622,
    0.06891952455043793,
    -0.038172200322151184,
    0.015289358794689178,
    -0.020576290786266327,
    0.0491151325404644,
    0.007327777799218893,
    -0.03978464752435684,
    0.008198980242013931,
    -0.008380644023418427,
    -0.002323460765182972,
    -0.0070495689287781715,
    -0.01955314725637436,
    0.0028784123715013266,
    -0.0724598616361618,
    0.006596772000193596,
    0.008509622886776924,
    -0.01896556094288826,
    0.035245347768068314,
    -0.005136704072356224,
    -0.01580432988703251,
    0.016778912395238876,
    0.01130736619234085,
    -0.01146919745951891,
    -0.004938072059303522,
    -0.033083006739616394,
    -0.054976936429739,
    -0.006552363280206919,
    -0.006930653937160969,
    0.06730091571807861,
    -0.07033298164606094,
    0.008861664682626724,
    0.00891523901373148,
    0.002841426758095622,
    0.020645786076784134,
    -0.008315734565258026,
    -0.009997749701142311,
    -0.018177809193730354,
    0.04610254615545273,
    -0.03048783168196678,
    -0.008375627920031548,
    -0.01683867909014225,
    -0.0475524365901947,
    0.011975379660725594,
    -0.035813573747873306,
    0.0350695475935936,
    0.00593950878828764,
    -0.021404363214969635,
    0.03665260225534439,
    -0.039568282663822174,
    -0.06287049502134323,
    -0.0007946585537865758,
    0.007061643060296774,
    -0.0014341280329972506,
    0.06382259726524353,
    0.03543578088283539,
    -0.0466076135635376,
    -0.02857811376452446,
    0.014225696213543415,
    0.0022503004875034094,
    -0.018503356724977493,
    -0.06232193484902382,
    -0.049599695950746536,
    -0.007865527644753456,
    -0.03412174433469772,
    -0.03423153981566429,
    0.011773431673645973,
    -0.052324049174785614,
    -0.013739919289946556,
    -0.03931644186377525,
    0.004792277235537767,
    -0.016642624512314796,
    0.003401051042601466,
    -0.042179614305496216,
    -0.0498492494225502,
    -0.004491751082241535,
    -0.025238892063498497,
    0.00005780590436188504,
    0.015212827362120152,
    0.022720985114574432,
    -0.03803243860602379,
    0.01882881298661232,
    -0.009699854999780655,
    -0.023800978437066078,
    -0.0039983089081943035,
    -0.04592438414692879,
    0.0064566838555037975,
    0.022958742454648018,
    -0.0596606619656086,
    -0.0297150406986475,
    0.07200802117586136,
    -0.04352116212248802,
    0.03167203441262245,
    -0.016017142683267593,
    -0.02199968509376049,
    -0.015790825709700584,
    0.0044168345630168915,
    0.03719032555818558,
    0.035468172281980515,
    0.02037779986858368,
    0.008170956745743752,
    0.029090391471982002,
    0.04627672955393791,
    0.012743941508233547,
    -0.033185072243213654,
    -0.025793399661779404,
    -0.07356175035238266,
    -0.018358856439590454,
    0.04968102648854256,
    -0.024860767647624016,
    -0.022640591487288475,
    -0.04346514493227005,
    -0.015044652856886387,
    0.042899731546640396,
    0.0033555396366864443,
    0.010278495028614998,
    0.058221083134412766,
    0.010700707323849201,
    -0.013249078765511513,
    -0.031705547124147415,
    0.027786018326878548,
    0.013957055285573006,
    -0.028306594118475914,
    0.011664768680930138,
    -0.012928739190101624,
    -0.025420576333999634,
    0.004067155532538891,
    -0.008415117859840393,
    -0.01706870086491108,
    0.005900565069168806,
    0.043928083032369614,
    0.006121788639575243,
    0.00906486064195633,
    0.03393183648586273,
    0.006753170397132635,
    -0.022593535482883453,
    -0.025548594072461128,
    0.016756266355514526,
    0.03872742876410484,
    0.012869549915194511,
    0.017130989581346512,
    -0.004550461657345295,
    -0.019784817472100258,
    0.04474050924181938,
    -0.0017470521852374077,
    0.043491411954164505,
    -0.021712403744459152,
    0.023634037002921104,
    -0.05051732808351517,
    -0.01831800676882267,
    -0.0029990780167281628,
    0.019542858004570007,
    -0.02326812967658043,
    -0.05445414409041405,
    0.02998097613453865,
    0.0020807781256735325,
    0.013111396692693233,
    -0.004644011612981558,
    0.021568406373262405,
    -0.022582920268177986,
    -0.07473244518041611,
    0.030989782884716988,
    0.01973266713321209,
    -0.032356031239032745,
    0.01088420394808054,
    -0.032892435789108276,
    0.03046608716249466,
    -0.03625088185071945,
    0.0020970471668988466,
    0.04900725185871124,
    -0.03972615301609039,
    -0.0444650761783123,
    -0.035686757415533066,
    0.01462444756180048,
    -0.02572960965335369,
    0.00504764961078763,
    -0.011807166039943695,
    -0.006219072733074427,
    -0.008532064966857433,
    -0.014097347855567932,
    -0.006777265574783087,
    0.04749533534049988,
    -0.07084392011165619,
    -0.03893193602561951,
    0.01159562636166811,
    -0.018047593533992767,
    -0.04647445306181908,
    -0.02524617686867714,
    0.027678580954670906,
    0.04127650335431099,
    -0.002290799282491207,
    -0.003113546408712864,
    -0.01780541241168976,
    -0.005627053789794445,
    0.008693008683621883,
    -0.03925113379955292,
    -0.02429463341832161,
    -0.014941152185201645,
    0.00930246151983738,
    -0.013054532930254936,
    -0.053057264536619186,
    0.0037977173924446106,
    -0.0012117603328078985,
    0.05006450414657593,
    -0.012207292951643467,
    0.01968778483569622,
    0.03893113136291504,
    0.008190978318452835,
    -0.037244994193315506,
    0.01815866306424141,
    -0.04194466024637222,
    0.03223958984017372,
    -0.03246702998876572,
    -0.05332479253411293,
    0.01375909335911274,
    0.0034205522388219833,
    -0.011164525523781776,
    0.0376601442694664,
    -0.024532601237297058,
    0.0006492354441434145,
    0.007080093491822481,
    -0.0026669343933463097,
    0.03033074550330639,
    0.00876426137983799,
    -0.017475994303822517,
    -0.012831551022827625,
    0.007376409601420164,
    -0.028302911669015884,
    -0.06008383631706238,
    0.05534147098660469,
    0.0681205615401268,
    -0.03760601952672005,
    0.017246617004275322,
    -0.004589708987623453,
    0.015978334471583366,
    -0.0060952589847147465,
    -0.041453149169683456,
    0.032928217202425,
    -0.012964907102286816,
    -0.011442895978689194,
    0.012692615389823914,
    0.0458303727209568,
    -0.03515753149986267,
    -0.02404729835689068,
    -0.06845466792583466,
    -0.018986236304044724,
    -0.019396977499127388,
    -0.009074938483536243,
    0.008774319663643837,
    0.01410516444593668,
    0.01648503914475441,
    0.0007962208474054933,
    0.017056159675121307,
    -0.00012801082630176097,
    0.0087843406945467,
    -0.005796077661216259,
    -0.007673076819628477,
    -0.002916766796261072,
    0.008715704083442688,
    -0.010358970612287521,
    0.003780874889343977,
    0.007950483821332455,
    0.04308680444955826,
    -0.010748812928795815,
    0.01668478548526764,
    0.044491324573755264,
    0.0410245843231678,
    0.0103321373462677,
    -0.04288053512573242,
    0.0583631657063961,
    0.027050217613577843,
    0.027887091040611267,
    0.007860868237912655,
    -0.010822671465575695,
    0.003064168384298682,
    0.004389417823404074,
    -0.025088220834732056,
    -0.05787983909249306,
    -0.008961912244558334,
    -0.01786945015192032,
    -0.06724757701158524,
    -0.01908806525170803,
    -0.024770047515630722,
    0.003949262667447329,
    0.018082352355122566,
    -0.010369866155087948,
    -0.010944553650915623,
    0.004134269431233406,
    -0.007847354747354984,
    0.0680842399597168,
    0.017402930185198784,
    0.00631073210388422,
    -0.02184593863785267,
    0.007214361801743507,
    -0.05044734850525856,
    -0.012503225356340408,
    0.013450474478304386,
    0.0240307804197073,
    -0.0015992533881217241,
    -0.04514278471469879,
    -0.010032354854047298,
    -0.003706372808665037,
    -0.01338433288037777,
    0.05314120650291443,
    -0.025411123409867287,
    -0.045388709753751755,
    -0.0676318034529686,
    -0.007183946203440428,
    -0.009971808642148972,
    -0.03272758796811104,
    -0.010009577497839928,
    0.025310814380645752,
    -0.047865401953458786,
    -0.009921068325638771,
    -0.0025971040595322847,
    0.03029121458530426,
    0.03816787153482437,
    -0.006443227641284466,
    0.008884952403604984,
    0.01944822631776333,
    -0.00223460141569376,
    -0.04292531684041023,
    -0.015298400074243546,
    -0.022237557917833328,
    0.06403257697820663,
    0.018303776159882545,
    0.03704079985618591,
    0.0073343301191926,
    -0.015339449048042297,
    0.017883071675896645,
    -0.013346872292459011,
    -0.002495558699592948,
    -0.01623230054974556,
    -0.03981802985072136,
    0.03229392319917679,
    0.028735149651765823,
    -0.029669631272554398,
    -0.01787632331252098,
    -0.02538851648569107,
    0.007322485093027353,
    0.020733021199703217,
    -0.008400925435125828,
    0.001782677136361599,
    0.017906812950968742,
    0.0008159520220942795,
    0.01939593255519867,
    -0.026667822152376175,
    0.011290512047708035,
    0.003608400234952569,
    -0.03979989513754845,
    0.05199307203292847,
    0.008927900344133377,
    -0.03197124972939491,
    -0.006614600773900747,
    0.03760617598891258,
    0.04604293033480644,
    -0.019719233736395836,
    0.02243768237531185,
    -0.0131601020693779,
    -0.01496896892786026,
    -0.07626300305128098,
    0.0378652885556221,
    0.03013184666633606,
    -0.01680605858564377,
    -0.01797831803560257,
    0.01706627756357193,
    -0.08284659683704376,
    0.018726414069533348,
    -0.04593668878078461,
    -0.044730089604854584,
    0.03870609030127525,
    -0.018515972420573235,
    -0.0757196843624115,
    0.000245233386522159,
    0.01477245707064867,
    0.011266968213021755,
    0.021277155727148056,
    0.0285334549844265,
    -0.01795576699078083,
    -0.028755847364664078,
    -0.017648497596383095,
    -0.02622854895889759,
    0.02184748463332653,
    0.026747871190309525,
    0.02812982350587845,
    -0.017126215621829033,
    0.058827225118875504,
    0.032776884734630585,
    0.007828179746866226,
    0.051376041024923325,
    -0.0074283466674387455,
    -0.02885739877820015,
    -0.024364318698644638,
    -0.011031812988221645,
    -0.045148249715566635,
    0.008047856390476227,
    -0.002229836769402027,
    -0.05900052934885025,
    -0.015926387161016464,
    0.010414771735668182,
    -0.017500095069408417,
    -0.06893809884786606,
    0.017897099256515503,
    -0.03918040916323662,
    -0.002901485189795494,
    -0.025281541049480438,
    0.018254147842526436,
    0.01540040597319603,
    -0.02691962756216526,
    -0.017720665782690048,
    0.003522962797433138,
    -0.029247025027871132,
    -0.00036675314186140895,
    -0.0625763088464737,
    0.042657867074012756,
    0.00719560356810689,
    -0.019741006195545197,
    -0.022607816383242607,
    -0.011370847001671791,
    0.029747730121016502,
    0.026525994762778282,
    -0.042869362980127335,
    -0.048002615571022034,
    0.029655950143933296,
    0.03995327651500702,
    0.03234860673546791,
    -0.005969036370515823,
    0.0020246461499482393,
    0.006011301185935736,
    0.004478263668715954,
    0.009046212770044804,
    -0.006070153787732124,
    0.0081151332706213,
    0.016237618401646614,
    -0.006380137987434864,
    -0.03490271046757698,
    0.009801856242120266,
    0.005102809518575668,
    -0.008120890706777573,
    0.0047133187763392925,
    -0.04191061481833458,
    0.020001927390694618,
    -0.051711395382881165,
    -0.017921678721904755,
    -0.007644614204764366,
    0.06040935590863228,
    -0.02061876282095909,
    0.01616920903325081,
    -0.03124777041375637,
    -0.003936858382076025,
    -0.07800895720720291,
    -0.019789449870586395,
    -0.019687116146087646,
    -0.05415874347090721,
    -0.012367630377411842,
    -0.022860350087285042,
    0.02985421195626259,
    -0.054791513830423355,
    0.26240938901901245,
    0.04021954536437988,
    -0.003737269202247262,
    -0.007497791200876236,
    -0.005500297527760267,
    0.01990540884435177,
    0.02799481339752674,
    -0.04963897913694382,
    0.004012332763522863,
    -0.019846919924020767,
    -0.03737165033817291,
    -0.021114010363817215,
    0.00013465863594319671,
    0.02449796535074711,
    0.006906663067638874,
    0.03074985183775425,
    -0.03543275222182274,
    0.02596008963882923,
    0.019420471042394638,
    -0.026924820616841316,
    0.005687041208148003,
    -0.0008677019504830241,
    0.015102392062544823,
    0.01662163995206356,
    0.003631745697930455,
    0.007040149997919798,
    0.006916589103639126,
    -0.03256983309984207,
    0.03274351358413696,
    0.026970988139510155,
    0.017437797039747238,
    -0.007575588300824165,
    0.03883320093154907,
    -0.03718215599656105,
    -0.019939817488193512,
    0.06553738564252853,
    -0.00453127920627594,
    0.012385441921651363,
    0.0021527123171836138,
    -0.07186885178089142,
    -0.008460470475256443,
    0.03470681607723236,
    -0.025599930435419083,
    -0.04405895248055458,
    0.03683825582265854,
    0.04352046176791191,
    -0.003849116386845708,
    0.04138181731104851,
    0.060146357864141464,
    -0.02718697302043438,
    0.008143180049955845,
    -0.04123932868242264,
    0.0015147592639550567,
    -0.0025103113148361444,
    -0.06017487123608589,
    0.04003242403268814,
    0.030713781714439392,
    -0.01932554505765438,
    0.021421462297439575,
    -0.006632639095187187,
    0.043221499770879745,
    -0.017369557172060013,
    -0.001369071309454739,
    0.03898773714900017,
    0.0035240433644503355,
    0.004248183686286211,
    0.05056452378630638,
    -0.03729676827788353,
    -0.006165903527289629,
    -0.03257886692881584,
    0.0186323132365942,
    -0.029544923454523087,
    0.011179567314684391,
    -0.04520320147275925,
    0.07670409977436066,
    0.03292367607355118,
    -0.008190681226551533,
    0.02879922091960907,
    0.011943893507122993,
    0.0017812743317335844,
    0.02767101116478443,
    -0.01224228274077177,
    -0.010035800747573376,
    -0.041620686650276184,
    0.01833116076886654,
    0.02749471552670002,
    -0.023618020117282867,
    -0.020687097683548927,
    -0.00538030406460166,
    -0.013469552621245384,
    0.011112893000245094,
    0.014643829315900803,
    0.016321418806910515,
    -0.06055646389722824,
    0.0320078544318676
      ]
      source = 'AJRASAKHA';
      logData.embeddingGenerated = textEmbedding.length > 0;
      logData.vectorLength = textEmbedding.length;

      // 🔥 Similarity Check — OUTSIDE transaction ($vectorSearch cannot run inside one)

// Check 4 Questions best match- 
  
	let topMatches: {questionId: ObjectId, question: string, similarityScore: number }[] = []
console.log("Source 1", source);



	if (textEmbedding.length && source === 'AJRASAKHA') {
	  const topSimilar = await this.questionRepo.findTopSimilarQuestions(
		textEmbedding, 5,
		{ state: details.state,district: details.district, crop: details.crop, domain: details.domain, season: details.season }, )
    
    console.log("Top Similar Questions:", topSimilar.map(q => ({ question: q.question, score: (q._vectorSearchScore ?? 0) * 100 })))
	  
    logData.totalMatches = topSimilar.length

	  logData.matches = topSimilar.map((q) => ({ questionId: q._id, question: q.question, similarityScore: ((q._vectorSearchScore ?? 0) * 100).toFixed(2), }))

	  // Take top 4 highest scoring questions
	  const bestFour = topSimilar.slice(0, 4)

	  topMatches = bestFour.map(q => ({
		questionId: q._id as ObjectId,
		question: q.question,
		similarityScore: (q._vectorSearchScore ?? 0) * 100
	  }))
	  logData.vectorLength = textEmbedding.length
	}
	logData.topMatches = topMatches
	logData.threshold = 85
     
     
/*     
      let highestScore = 0;
      let referenceQuestionId: ObjectId | null = null;
      let referenceQuestion=''
      
      if (textEmbedding.length && source === 'AJRASAKHA') {
        // No session passed here intentionally
        const topSimilar = await this.questionRepo.findTopSimilarQuestions(
          textEmbedding,
          5,
          { state: details.state, district: details.district, crop: details.crop, domain: details.domain, season: details.season },
        );

        logData.totalMatches = topSimilar.length;
        logData.matches = topSimilar.map((q) => ({
          questionId: q._id,
          question: q.question,
          similarityScore: ((q._vectorSearchScore ?? 0) * 100).toFixed(2),
        }));

        if (topSimilar.length > 0) {
          const best = topSimilar[0];
          highestScore = (best._vectorSearchScore ?? 0) * 100;
          referenceQuestionId = best._id as ObjectId;
          referenceQuestion=best.question
          logData.vectorLength = textEmbedding.length;
          logData.referenceQuestionId = referenceQuestionId;
        }

      }

      logData.highestScore = highestScore.toFixed(2);
      logData.threshold = 85;      
      */

      // ✅ Everything that needs atomicity goes inside the transaction
      return this._withTransaction(async (session: ClientSession) => {
        // 🔹 Create Context
        let contextId: ObjectId | null = null;

        if (context) {
          const { insertedId } = await this.contextRepo.addContext(context, session);
          contextId = new ObjectId(insertedId);
        }

        // 🔹 Create Base Question Object
        const baseQuestion: IQuestion = {
          userId: userId?.trim() !== '' ? new ObjectId(userId) : null,
          question,
          priority,
          source,
          status: 'open',
          totalAnswersCount: 0,
          contextId,
          details,
          isAutoAllocate: true,
          embedding: textEmbedding,
          metrics: null,
          aiInitialAnswer: body.aiInitialAnswer || '',
          text,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
  
        // =====================================================
        // 🔥 IF SIMILAR → STORE AS DUPLICATE
        // =====================================================
        /* Logic Flow
         *  Step 1 → scan scores
          Step 2 → if >=95 stop
          Step 3 → collect 85–95 candidates
          Step 4 → call LLM once
        */
       
        let isDuplicate = false
        let matchedQuestion = ""
        let matchedQuestionId: ObjectId | null = null
        let matchedScore = 0

        const llmCandidates: typeof topMatches = []

		for (const match of topMatches) {

		  const highestScore = match.similarityScore

		  // Rule 1: immediate duplicate
		  if (highestScore >= 95) {
        isDuplicate = true
        matchedQuestion = match.question
        matchedQuestionId = match.questionId
        matchedScore = highestScore
        break
		  }

		  // Rule 2: collect candidates for LLM
		  if (highestScore >= 85 && highestScore < 95) {
			  llmCandidates.push(match)
		  }
		}

		// Rule 3: call LLM once
		if (!isDuplicate && llmCandidates.length > 0) {

		  const candidateQuestions = llmCandidates.map(q => q.question)
		  const llmResult = await checkConceptDuplicate( baseQuestion.question, candidateQuestions)

		  if (llmResult?.duplicate) {
			const matched = llmCandidates[llmResult.index]

			isDuplicate = true
			matchedQuestion = matched.question
			matchedQuestionId = matched.questionId
			matchedScore = matched.similarityScore
		  }
		}
		if (isDuplicate && matchedQuestionId && matchedQuestion) {

		  const duplicateQuestion = {
			...baseQuestion,
			similarityScore: Number(matchedScore.toFixed(2)),
			referenceQuestionId: matchedQuestionId,
			referenceQuestion: matchedQuestion
		  }

		  await this.duplicateQuestionRepository.addDuplicate(
			duplicateQuestion,
			session
		  )

		  logData.outcome = 'DUPLICATE_DETECTED'
		  logData.matchedQuestion = matchedQuestion
		  logData.similarityScore = matchedScore.toFixed(2)

		  chatbotSimilarityLogger.warn('ADD_QUESTION_LOG', logData)

		  return { isDuplicate: true, data: duplicateQuestion }
		}

        // =====================================================
        // 🔥 IF NOT SIMILAR → NORMAL FLOW
        // =====================================================
    
        logData.outcome = 'NEW_QUESTION_ADDED';
        chatbotSimilarityLogger.info('ADD_QUESTION_LOG', logData);

        const savedQuestion = await this.questionRepo.addQuestion(
          baseQuestion,
          session,
        );
  
        if (!savedQuestion?._id) {
          throw new InternalServerError(`Failed to save question to database`);
        }
  
        const users = await this.userRepo.findExpertsByPreference(
          details as PreferenceDto,
          session,
        );
  
        const initialUsersToAllocate = users.slice(0, 3);
  
        const queue = initialUsersToAllocate.map(
          (user) => new ObjectId(user._id.toString()),
        );
  
        if (initialUsersToAllocate[0]) {
          await this.userRepo.updateReputationScore(
            initialUsersToAllocate[0]._id.toString(),
            true,
            session,
          );
        }
  
        const submissionData: IQuestionSubmission = {
          questionId: new ObjectId(savedQuestion._id.toString()),
          lastRespondedBy: null,
          history: [],
          queue,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
  
        await this.questionSubmissionRepo.addSubmission(submissionData, session);
  
        if (initialUsersToAllocate[0]) {
          await this.notificationService.saveTheNotifications(
            `A Question has been assigned for answering`,
            'Answer Creation Assigned',
            savedQuestion._id.toString(),
            initialUsersToAllocate[0]._id.toString(),
            'answer_creation',
          );
        }
  
        return { isDuplicate: false, data: baseQuestion };
      });
    } catch (error) {
      console.error(error);

      logData.outcome = 'FAILED';
      logData.errorMessage = error.message;
      logData.stack = error.stack;
      chatbotSimilarityLogger.error('ADD_QUESTION_LOG', logData);
            
      throw new InternalServerError(`Failed to add question: ${error}`);
    }
  }


  async getQuestionById(questionId: string): Promise<QuestionResponse> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        const currentQuestion = await this.questionRepo.getById(questionId);

        if (!currentQuestion)
          throw new NotFoundError(
            `Failed to find question with id: ${questionId}`,
          );

        // const currentAnswers = await this.answerRepo.getByQuestionId(
        //   questionId,
        //   session,
        // );

        const questionSubmissions =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );

        if (!questionSubmissions)
          throw new NotFoundError(
            `Failed to find question submission document of questionId: ${questionId}`,
          );

        const submissionHistory =
          await this.questionSubmissionRepo.getDetailedSubmissionHistory(
            questionId,
            session,
          );

        // Only author needs to see ai initial answer
        let aiInitialAnswer = '';

        const answers = await this.answerRepo.getByQuestionId(
          questionId,
          session,
        );

        if (answers && answers.length == 0)
          aiInitialAnswer = currentQuestion.aiInitialAnswer;

        return {
          id: currentQuestion._id.toString(),
          text: currentQuestion.question,
          source: currentQuestion.source,
          details: currentQuestion.details,
          status: currentQuestion.status,
          priority: currentQuestion.priority,
          aiInitialAnswer,
          createdAt: new Date(currentQuestion.createdAt).toLocaleString(),
          updatedAt: new Date(currentQuestion.updatedAt).toLocaleString(),
          totalAnswersCount: currentQuestion.totalAnswersCount,
          history: submissionHistory,
          // currentAnswers: currentAnswers.map(currentAnswer => ({
          //   id: currentAnswer._id.toString(),
          //   answer: currentAnswer.answer,
          //   isFinalAnswer: currentAnswer.isFinalAnswer,
          //   createdAt: currentAnswer.createdAt,
          // })),
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

        // if (existingQuestion.status == 'closed')
        //   throw new BadRequestError(
        //     'You cannot modify a question that has already been closed.',
        //   );

        const answers = await this.answerRepo.getByQuestionId(
          questionId,
          session,
        );
        if (
          updates.status === 'closed' &&
          answers.every(answer => answer.isFinalAnswer === false)
        ) {
          throw new BadRequestError(
            `Cannot close this question as it has non-final answer`,
          );
        }

        return this.questionRepo.updateQuestion(questionId, updates, session);
      });
    } catch (error) {
      throw new InternalServerError(`Failed to update question: ${error}`);
    }
  }

  async autoAllocateExperts(
    questionId: string,
    session?: ClientSession,
    BATCH_EXPECTED_TO_ADD: number = 6,
  ): Promise<boolean> {
    const TOTAL_EXPERTS_LIMIT = 10;
    const question = await this.questionRepo.getById(questionId, session);
    if (!question) throw new NotFoundError('Question not found');

    if (question.status !== 'open' && question.status !== 'delayed') {
      console.log(
        'This question is currently being reviewed or has been closed. Please check back later!',
      );
      return false;
    }

    const details = question.details as PreferenceDto;

    const questionSubmission =
      await this.questionSubmissionRepo.getByQuestionId(questionId, session);

    if (!questionSubmission) {
      throw new NotFoundError('Question submission not found');
    }

    const EXISTING_QUEUE_COUNT = questionSubmission.queue.length || 0;
    const EXISTING_HISTORY_COUNT = questionSubmission.history.length || 0;

    if (EXISTING_QUEUE_COUNT >= TOTAL_EXPERTS_LIMIT) {
      console.log('Cannot auto allocate as queue is full');
      return false;
    }

    const [users, preferredExperts] = await Promise.all([
      this.userRepo.findAll(),
      this.userRepo.findExpertsByPreference(details, session),
    ]);

    const expertIdsSet = new Set<string>();
    preferredExperts.forEach(user => expertIdsSet.add(user._id.toString()));
    users
      .filter(user => user.role === 'expert' && user.isBlocked !== true)
      .forEach(user => expertIdsSet.add(user._id.toString()));

    const allExpertIds = Array.from(expertIdsSet);

    if (
      EXISTING_QUEUE_COUNT < 3 ||
      (EXISTING_QUEUE_COUNT === EXISTING_HISTORY_COUNT &&
        EXISTING_QUEUE_COUNT <= allExpertIds.length)
    ) {
      const answeredExperts = new Set(
        questionSubmission.history.map(h => h.updatedBy.toString()),
      );

      const unAnsweredExpertIds = allExpertIds.filter(
        expertId => !answeredExperts.has(expertId),
      );

      const CURRENT_BATCH_SIZE = TOTAL_EXPERTS_LIMIT - EXISTING_QUEUE_COUNT;

      // To ensure allocation will not overflow total limit
      const FINAL_BATCH_SIZE = Math.min(
        BATCH_EXPECTED_TO_ADD,
        CURRENT_BATCH_SIZE,
      );

      const existingQueueIds = questionSubmission.queue.map(id =>
        id.toString(),
      );

      const filteredExperts = unAnsweredExpertIds.filter(
        id => !existingQueueIds.includes(id.toString()),
      );

      const lastSubmission = questionSubmission.history.at(-1);
      if (filteredExperts.length === 0) {
        await this.questionRepo.updateQuestion(
          questionId,
          {status: 'in-review'},
          session,
        );
        const payload: Partial<IAnswer> = {
          status: 'pending-with-moderator',
        };
        const answer = lastSubmission.answer || lastSubmission.approvedAnswer;
        await this.answerRepo.updateAnswerStatus(
          answer.toString(),
          payload,
          session,
        );
      }

      const expertsToAdd = filteredExperts.slice(0, FINAL_BATCH_SIZE);

      // Add entry for first expert in the queue as status in-review (only after intial 3 allocation)
      // if (
      //   questionSubmission.history.length >= 0 &&
      //   (!lastSubmission ||
      //     (lastSubmission?.answer && lastSubmission.status !== 'in-review') ||
      //     lastSubmission?.status == 'reviewed')
      //   // &&EXISTING_QUEUE_COUNT >= 3
      // ) {
      const hasExperts = expertsToAdd?.length >= 1;
      if (!lastSubmission) {
        const IS_INCREMENT = true;
        const expertId = expertsToAdd[0]?.toString();
        await this.userRepo.updateReputationScore(
          expertId,
          IS_INCREMENT,
          session,
        );
        // No submissions send answer_creation notification to the first expert
        if (EXISTING_QUEUE_COUNT === 0) {
          let message = `A Question has been assigned for answering`;
          let title = 'Answer Creation Assigned';
          let entityId = questionId.toString();
          const user = expertId;
          const type: INotificationType = 'answer_creation';
          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            user,
            type,
          );
        }
      }
      if (
        hasExperts &&
        lastSubmission &&
        (lastSubmission.reviewId || lastSubmission.answer) // if last submission is reviewed or author's answer
      ) {
        const nextExpertId = expertsToAdd[0]?.toString();
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
        );
      }
      const updatedQueue = [
        ...questionSubmission.queue,
        ...(expertsToAdd || []),
      ]
        .slice(0, TOTAL_EXPERTS_LIMIT)
        .map(id => new ObjectId(id));

      await this.questionSubmissionRepo.updateQueue(
        questionId,
        updatedQueue,
        session,
      );
    }
    return true;
  }

  async toggleAutoAllocate(questionId: string): Promise<{message: string}> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        //1. Validate question existence
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) throw new NotFoundError('Question not found');
        console.log('toggleAutoAllocate*****', question);

        const updated = await this.questionRepo.updateAutoAllocate(
          questionId,
          question?.isAutoAllocate,
          session,
        );
        const currentStatus = question.isAutoAllocate;
        // If currentStatus is false, then we need to set it to true and vice versa

        if (!currentStatus) {
          const submission = await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );

          const CURRENT_QUEUE_LENGTH = submission.queue.length || 0;
          let BATCH_EXPECTED_TO_ADD = 6;

          // If removing first 3 intial allocation, so allocate only 3 intially
          if (CURRENT_QUEUE_LENGTH < 3)
            BATCH_EXPECTED_TO_ADD = 3 - CURRENT_QUEUE_LENGTH;

          const out = await this.autoAllocateExperts(
            questionId,
            session,
            BATCH_EXPECTED_TO_ADD,
          );

          if (!out) {
            return {
              message: 'Auto allocate toggled, but queue is already full',
            };
          }
        }

        return {
          message: `Auto allocate is now set to ${updated.isAutoAllocate}`,
        };
      });
    } catch (error) {
      throw new InternalServerError(`Failed to toggle auto allocate: ${error}`);
    }
  }

  async allocateExperts(
    userId: string,
    questionId: string,
    experts: string[],
  ): Promise<IQuestionSubmission> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        // Validate that user has authorization for this
        const user = await this.userRepo.findById(userId, session);
        if (!user)
          throw new UnauthorizedError(`Cannot find user, try relogin!`);
        if (user.role == 'expert')
          throw new UnauthorizedError(
            `You don't have permission to perform this operation`,
          );
        //1. Validate question existence
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) throw new NotFoundError('Question not found');

        if (question.status !== 'open' && question.status !== 'delayed') {
          console.log(
            'This question is currently being in reviewe or has been closed. Please check back later!',
          );
          return;
        }

        //2. Validate question submission existence
        const questionSubmission =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );
        if (!questionSubmission)
          throw new NotFoundError('Question submission not found');

        // 3. Validate if the queue is full
        if (questionSubmission.queue.length >= 10)
          throw new BadRequestError(
            'Cannot allocate more than 10 experts for a question.',
          );

        const hasExistingExpert = experts.some(expertId =>
          questionSubmission.queue.includes(expertId),
        );

        // 4. Validate if the expert Id is already there in queue

        if (hasExistingExpert) {
          throw new BadRequestError(
            'The selected expert is already in the queue. Please choose another expert.',
          );
        }
        //5. Validate experts array
        if (!experts || experts.length === 0)
          throw new BadRequestError('Experts list cannot be empty');

        // Check if adding these experts exceeds the limit of 10
        const totalAllocatedExperts = questionSubmission.queue.length;
        if (totalAllocatedExperts + experts.length > 10)
          throw new BadRequestError(
            `Cannot allocate more than 10 experts. Currently allocated: ${totalAllocatedExperts}`,
          );

        // for (let expert of experts) {
        //   const IS_INCREMENT = true;
        //   await this.userRepo.updateReputationScore(
        //     expert,
        //     IS_INCREMENT,
        //     session,
        //   );
        // }

        //if manuall alloacation is first person

        if (questionSubmission.queue.length === 0) {
          const firstPerson = experts[0];
          const IS_INCREMENT = true;
          await this.userRepo.updateReputationScore(
            firstPerson.toString(),
            IS_INCREMENT,
            session,
          );
          let message = `A Question has been assigned for answering`;
          let title = 'Answer Creation Assigned';
          let entityId = questionId.toString();
          const user = firstPerson.toString();
          const type: INotificationType = 'answer_creation';
          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            user,
            type,
          );
        }

        //6. Allocate experts
        const expertIds = experts.map(e => new ObjectId(e));

        // if the last expert is  reviewing other question  (if status is not reviewed or not submitted an answer)
        const lastSubmission = questionSubmission.history.at(-1);
        if (
          questionSubmission.history.length >= 0 &&
          (lastSubmission?.answer || lastSubmission?.status == 'reviewed')
        ) {
          const expertId = expertIds[0];
          const userSubmissionData: ISubmissionHistory = {
            updatedBy: expertId,
            createdAt: new Date(),
            status: 'in-review',
            updatedAt: new Date(),
          };
          const IS_INCREMENT = true;
          await this.userRepo.updateReputationScore(
            expertId.toString(),
            IS_INCREMENT,
            session,
          );
          //need to add here
          let message = `A new Review has been assigned to you`;
          let title = 'New Review Assigned';
          let entityId = questionId.toString();
          const user = expertId.toString();
          const type: INotificationType = 'peer_review';
          await this.notificationService.saveTheNotifications(
            message,
            title,
            entityId,
            user,
            type,
          );
          await this.questionSubmissionRepo.update(
            questionId,
            userSubmissionData,
            session,
          );
        }
        //7. Update question submission with new experts
        const updated = await this.questionSubmissionRepo.allocateExperts(
          questionId,
          expertIds,
          session,
        );

        //8. Return updated question submission
        return updated;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to allocate experts: ${error}`);
    }
  }

  // async removeExpertFromQueue(
  //   userId: string,
  //   questionId: string,
  //   index: number,
  //   options?: {
  //     skipAutoAllocate?: boolean;
  //   },
  //   session?: ClientSession,
  // ): Promise<IQuestionSubmission> {
  //   const skipAutoAllocate = options?.skipAutoAllocate ?? false;
  //   try {
  //     // return this._withTransaction(async (session: ClientSession) => {
  //     if (userId !== 'system') {
  //       const user = await this.userRepo.findById(userId, session);
  //       if (!user)
  //         throw new UnauthorizedError(`Cannot find user, try relogin!`);
  //       if (user.role == 'expert')
  //         throw new UnauthorizedError(
  //           `You don't have permission to perform this operation`,
  //         );
  //     }
  //     //1. Validate that the question exists
  //     const question = await this.questionRepo.getById(questionId, session);
  //     if (!question) throw new NotFoundError('Question not found');

  //     //2. Validate that the corresponding question submission exists
  //     const questionSubmission =
  //       await this.questionSubmissionRepo.getByQuestionId(questionId, session);
  //     if (!questionSubmission)
  //       throw new NotFoundError('Question submission not found');

  //     //3. Get the current expert queue from the question submission
  //     const submissionQueue = questionSubmission.queue || [];
  //     const submissionHistory = questionSubmission.history || [];
  //     //4. Extract the expert ID based on the provided index
  //     const expertId = submissionQueue[index]?.toString();
  //     //5. Decrease the expert's reputation score (since being removed)
  //     const nextUserId = submissionQueue[index + 1]?.toString();
  //     const isExpertInHistory = submissionHistory.find(
  //       h => h.updatedBy.toString() == expertId.toString(),
  //     );
  //     if (
  //       expertId &&
  //       isExpertInHistory &&
  //       !isExpertInHistory.reviewId &&
  //       isExpertInHistory.status === 'in-review'
  //     ) {
  //       const INCREMENT = false;
  //       await this.userRepo.updateReputationScore(expertId, INCREMENT, session);

  //       if (nextUserId) {
  //         const INCREMENT = true;
  //         await this.userRepo.updateReputationScore(
  //           nextUserId,
  //           INCREMENT,
  //           session,
  //         );
  //       }
  //     }
  //     if (submissionHistory.length === 0) {
  //       if (submissionQueue[0].toString() === expertId) {
  //         const IS_INCREMENT = false;
  //         await this.userRepo.updateReputationScore(
  //           expertId,
  //           IS_INCREMENT,
  //           session,
  //         );
  //         if (nextUserId) {
  //           const IS_INCREMENT = true;
  //           await this.userRepo.updateReputationScore(
  //             nextUserId,
  //             IS_INCREMENT,
  //             session,
  //           );
  //         }
  //       }
  //     }
  //     // } else {
  //     //   const matchUser = submissionHistory.find(
  //     //     u => u.updatedBy?.toString() === expertId,
  //     //   );
  //     //   if (matchUser) {
  //     //     const IS_INCREMENT = false;
  //     //     await this.userRepo.updateReputationScore(
  //     //       expertId,
  //     //       IS_INCREMENT,
  //     //       session,
  //     //     );
  //     //     if (nextUserId) {
  //     //       const IS_INCREMENT = true;
  //     //       await this.userRepo.updateReputationScore(
  //     //         nextUserId,
  //     //         IS_INCREMENT,
  //     //         session,
  //     //       );
  //     //     }
  //     //   }
  //     // }

  //     //6. Remove the expert from the queue by index
  //     const updated =
  //       await this.questionSubmissionRepo.removeExpertFromQueuebyIndex(
  //         questionId,
  //         Number(index),
  //         session,
  //       );
  //     /*  if(updated)
  //         {
  //           const IS_INCREMENT = true;
  //         const userId =updated.queue[0];
  //         await this.userRepo.updateReputationScore(
  //           userId.toString(),
  //           IS_INCREMENT,
  //           session,
  //         );
  //         }*/

  //     //7. Handle auto reallocation logic if autoAllocate is enabled
  //     if (!skipAutoAllocate && index >= 0 && question.isAutoAllocate) {
  //       // Get updated queue and history lengths
  //       const UPDATED_QUEUE_LENGTH = updated?.queue.length || 0;
  //       const UPDATED_HISTORY_LENGTH = updated?.history.length || 0;
  //       let BATCH_EXPECTED_TO_ADD = 6;

  //       // Adjust batch size if initial allocation (<3) experts are being removed
  //       if (UPDATED_QUEUE_LENGTH < 3)
  //         BATCH_EXPECTED_TO_ADD = 3 - UPDATED_QUEUE_LENGTH;

  //       // If all previous experts have responded and queue is not full, trigger auto allocation
  //       if (
  //         UPDATED_QUEUE_LENGTH < 3 ||
  //         (UPDATED_HISTORY_LENGTH == UPDATED_QUEUE_LENGTH &&
  //           UPDATED_QUEUE_LENGTH < 10)
  //       ) {
  //         await this.autoAllocateExperts(
  //           questionId,
  //           session,
  //           BATCH_EXPECTED_TO_ADD,
  //         );
  //       }
  //     }

  //     //8. Return the updated question submission
  //     return updated;
  //     // });
  //   } catch (error) {
  //     throw new InternalServerError(
  //       `Failed to remove expert from queue: ${error}`,
  //     );
  //   }
  // }

  async removeExpertFromQueue(
    userId: string,
    questionId: string,
    index: number,
    options?: {
      skipAutoAllocate?: boolean;
    },
    session?: ClientSession,
  ): Promise<IQuestionSubmission> {
    if (session) {
      return this._removeExpertFromQueue(
        userId,
        questionId,
        index,
        options,
        session,
      );
    }
    return this._withTransaction(async newSession => {
      return this._removeExpertFromQueue(
        userId,
        questionId,
        index,
        options,
        newSession,
      );
    });
  }

  async _removeExpertFromQueue(
    userId: string,
    questionId: string,
    index: number,
    options?: {
      skipAutoAllocate?: boolean;
    },
    session?: ClientSession,
  ): Promise<IQuestionSubmission> {
    const skipAutoAllocate = options?.skipAutoAllocate ?? false;
    try {
      if (userId !== 'system') {
        const user = await this.userRepo.findById(userId, session);
        if (!user)
          throw new UnauthorizedError(`Cannot find user, try relogin!`);
        if (user.role == 'expert')
          throw new UnauthorizedError(
            `You don't have permission to perform this operation`,
          );
      }
      //1. Validate that the question exists
      const question = await this.questionRepo.getById(questionId, session);
      if (!question) throw new NotFoundError('Question not found');

      //2. Validate that the corresponding question submission exists
      const questionSubmission =
        await this.questionSubmissionRepo.getByQuestionId(questionId, session);
      if (!questionSubmission)
        throw new NotFoundError('Question submission not found');

      //3. Get the current expert queue from the question submission
      const submissionQueue = questionSubmission.queue || [];
      const submissionHistory = questionSubmission.history || [];
      //4. Extract the expert ID based on the provided index
      const expertId = submissionQueue[index]?.toString();
      //5. Decrease the expert's reputation score (since being removed)
      const nextUserId = submissionQueue[index + 1]?.toString();
      const isExpertInHistory = submissionHistory.find(
        h => h.updatedBy.toString() == expertId.toString(),
      );
      if (
        expertId &&
        isExpertInHistory &&
        !isExpertInHistory.reviewId &&
        isExpertInHistory.status === 'in-review'
      ) {
        const INCREMENT = false;
        await this.userRepo.updateReputationScore(expertId, INCREMENT, session);

        if (nextUserId) {
          const INCREMENT = true;
          await this.userRepo.updateReputationScore(
            nextUserId,
            INCREMENT,
            session,
          );
        }
      }
      if (submissionHistory.length === 0) {
        if (submissionQueue[0].toString() === expertId) {
          const IS_INCREMENT = false;
          await this.userRepo.updateReputationScore(
            expertId,
            IS_INCREMENT,
            session,
          );
          if (nextUserId) {
            const IS_INCREMENT = true;
            await this.userRepo.updateReputationScore(
              nextUserId,
              IS_INCREMENT,
              session,
            );
            let entityId = questionId;
            let message: string = `A new Review has been assigned to you`;
            let title: string = 'New Review Assigned';
            let type: INotificationType = 'peer_review';
            await this.notificationService.saveTheNotifications(
              message,
              title,
              entityId,
              nextUserId,
              type,
            );
          }
        }
      }
      // } else {
      //   const matchUser = submissionHistory.find(
      //     u => u.updatedBy?.toString() === expertId,
      //   );
      //   if (matchUser) {
      //     const IS_INCREMENT = false;
      //     await this.userRepo.updateReputationScore(
      //       expertId,
      //       IS_INCREMENT,
      //       session,
      //     );
      //     if (nextUserId) {
      //       const IS_INCREMENT = true;
      //       await this.userRepo.updateReputationScore(
      //         nextUserId,
      //         IS_INCREMENT,
      //         session,
      //       );
      //     }
      //   }
      // }

      //6. Remove the expert from the queue by index
      const updated =
        await this.questionSubmissionRepo.removeExpertFromQueuebyIndex(
          questionId,
          Number(index),
          session,
        );
      /*  if(updated)
          {
            const IS_INCREMENT = true;
          const userId =updated.queue[0];
          await this.userRepo.updateReputationScore(
            userId.toString(),
            IS_INCREMENT,
            session,
          );
          }*/

      //7. Handle auto reallocation logic if autoAllocate is enabled
      if (!skipAutoAllocate && index >= 0 && question.isAutoAllocate) {
        // Get updated queue and history lengths
        const UPDATED_QUEUE_LENGTH = updated?.queue.length || 0;
        const UPDATED_HISTORY_LENGTH = updated?.history.length || 0;
        let BATCH_EXPECTED_TO_ADD = 6;

        // Adjust batch size if initial allocation (<3) experts are being removed
        if (UPDATED_QUEUE_LENGTH < 3)
          BATCH_EXPECTED_TO_ADD = 3 - UPDATED_QUEUE_LENGTH;

        // If all previous experts have responded and queue is not full, trigger auto allocation
        if (
          UPDATED_QUEUE_LENGTH < 3 ||
          (UPDATED_HISTORY_LENGTH == UPDATED_QUEUE_LENGTH &&
            UPDATED_QUEUE_LENGTH < 10)
        ) {
          await this.autoAllocateExperts(
            questionId,
            session,
            BATCH_EXPECTED_TO_ADD,
          );
        }
      }

      //8. Return the updated question submission
      return updated;
    } catch (error) {
      throw new InternalServerError(
        `Failed to remove expert from queue: ${error}`,
      );
    }
  }

  // async deleteQuestion(
  //   questionId: string,
  //   session?: ClientSession,
  // ): Promise<{deletedCount: number}> {
  //   try {
  //     return this._withTransaction(
  //       async (transactionSession: ClientSession) => {

  //         const question = await this.questionRepo.getById(questionId, session);
  //         if (!question) {
  //           throw new BadRequestError(
  //             `Question with ID ${questionId} not found`,
  //           );
  //         }
  //         await this.answerRepo.deleteByQuestionId(questionId, session);

  //         const questionSubmission =
  //           await this.questionSubmissionRepo.getByQuestionId(
  //             questionId,
  //             session,
  //           );

  //         const history = questionSubmission?.history || [];
  //         if (history && history.length > 0) {
  //           // Get the last history entry
  //           const lastHistoryEntry = history[history.length - 1];

  //           if (!lastHistoryEntry) {
  //             throw new BadRequestError(
  //               `Invalid submission history for question ID: ${questionId}`,
  //             );
  //           }

  //           // Check if the last entry is still under review and no answer provided yet
  //           const isUnderReviewWithoutAnswer =
  //             lastHistoryEntry.status === 'in-review' &&
  //             !lastHistoryEntry.answer;
  //           if (isUnderReviewWithoutAnswer) {
  //             const IS_INCREMENT = false;
  //             const expertId = lastHistoryEntry.updatedBy?.toString();
  //             if (!expertId) {
  //               throw new BadRequestError(
  //                 `Expert ID missing in the last history entry for question ID: ${questionId}`,
  //               );
  //             }

  //             await this.userRepo.updateReputationScore(
  //               expertId,
  //               IS_INCREMENT,
  //               session,
  //             );
  //           }
  //         } else {
  //           const IS_INCREMENT = false;
  //           const expertId = questionSubmission?.queue[0]?.toString();
  //           await this.userRepo.updateReputationScore(
  //             expertId,
  //             IS_INCREMENT,
  //             session,
  //           );
  //         }

  //         await this.questionSubmissionRepo.deleteByQuestionId(
  //           questionId,
  //           session,
  //         );
  //         await this.requestRepository.deleteByEntityId(questionId, session);
  //         return this.questionRepo.deleteQuestion(questionId, session);
  //       },
  //     );
  //   } catch (error) {
  //     throw new InternalServerError(`Failed to delete question: ${error}`);
  //   }
  // }

  async deleteQuestion(
    questionId: string,
    session?: ClientSession,
  ): Promise<{deletedCount: number}> {
    const execute = async (activeSession: ClientSession) => {
      const question = await this.questionRepo.getById(
        questionId,
        activeSession,
      );
      if (!question) {
        throw new BadRequestError(`Question with ID ${questionId} not found`);
      }

      // Delete all answers for this question
      await this.answerRepo.deleteByQuestionId(questionId, activeSession);

      // Fetch the submission to check history/queue
      const questionSubmission =
        await this.questionSubmissionRepo.getByQuestionId(
          questionId,
          activeSession,
        );

      const history = questionSubmission?.history || [];
      if (history.length > 0) {
        const lastHistoryEntry = history[history.length - 1];
        if (!lastHistoryEntry) {
          throw new BadRequestError(
            `Invalid submission history for question ID: ${questionId}`,
          );
        }

        const isUnderReviewWithoutAnswer =
          lastHistoryEntry.status === 'in-review' && !lastHistoryEntry.answer;

        if (isUnderReviewWithoutAnswer) {
          const IS_INCREMENT = false;
          const expertId = lastHistoryEntry.updatedBy?.toString();
          if (!expertId) {
            throw new BadRequestError(
              `Expert ID missing in the last history entry for question ID: ${questionId}`,
            );
          }

          await this.userRepo.updateReputationScore(
            expertId,
            IS_INCREMENT,
            activeSession,
          );
        }
      } else {
        const IS_INCREMENT = false;
        const expertId = questionSubmission?.queue?.[0]?.toString();
        if (expertId) {
          await this.userRepo.updateReputationScore(
            expertId,
            IS_INCREMENT,
            activeSession,
          );
        }
      }
      // handle re-routed expert's reputation_score deduction when expert hasn't answered/reviewed yet (pending state)
      const existingReRoute = await this.reRouteRepository.findByQuestionId(
        questionId,
        activeSession,
      );

      if (existingReRoute?.reroutes?.length) {
        const lastReroute = existingReRoute.reroutes.at(-1);

        if (lastReroute?.status === 'pending') {
          const reroutedExpertId = lastReroute.reroutedTo?.toString();
          if (reroutedExpertId) {
            await this.userRepo.updateReputationScore(
              reroutedExpertId,
              false,
              activeSession,
            );
          }
        }
      }

      // Delete submissions and requests related to this question
      await this.questionSubmissionRepo.deleteByQuestionId(
        questionId,
        activeSession,
      );
      await this.requestRepository.deleteByEntityId(questionId, activeSession);

      // Finally, delete the question itself
      return this.questionRepo.deleteQuestion(questionId, activeSession);
    };

    if (session) {
      return execute(session);
    }

    return this._withTransaction(async (transactionSession: ClientSession) =>
      execute(transactionSession),
    );
  }

  async bulkDeleteQuestions(questionIds: string[]) {
    return this._withTransaction(async (session: ClientSession) => {
      if (!questionIds || questionIds.length === 0) {
        throw new BadRequestError('No question IDs found to delete!');
      }
      if (questionIds.length > 50) {
        throw new BadRequestError('You can select a maximum of 50 questions');
      }

      let deletedCount = 0;

      for (const id of questionIds) {
        const res = await this.deleteQuestion(id, session);
        deletedCount += res.deletedCount ?? 0;
      }

      return {deletedCount};
    });
  }

  async getQuestionFullData(
    questionId: string,
    userId: string,
  ): Promise<IQuestion | null> {
    try {
      const user = await this.userRepo.findById(userId);
      const isExpert = user.role == 'expert';
      const question = await this.questionRepo.getQuestionWithFullData(
        questionId,
        userId,
        isExpert,
      );
      if (!question) {
        return null;
      }
      return question;
    } catch (error) {
      throw new InternalServerError(`Failed to fetch question data: ${error}`);
    }
  }

  async getAllocatedQuestionPage(userId: string, questionId: string) {
    return this._withTransaction(async session => {
      return this.questionRepo.getAllocatedQuestionPage(
        userId,
        questionId,
        session,
      );
    });
  }

  async getQuestionAndReviewLevel(
    query: GetDetailedQuestionsQuery,
  ): Promise<QuestionLevelResponse> {
    return this._withTransaction(async session => {
      let searchEmbedding: number[] | null = null;

      if (query?.search) {
        try {
          // const embedding=[]
          const {embedding} = await this.aiService.getEmbedding(query.search);
          searchEmbedding = embedding;
        } catch (err) {
          console.error(
            'Embedding generation failed, falling back to normal search:',
            err,
          );
          searchEmbedding = null;
        }
      }

      return this.questionRepo.getQuestionsAndReviewLevel({
        ...query,
        searchEmbedding,
      });
    });
  }

  async runAbsentScript() {
    return await this._withTransaction(async session => {
      try {
        const absentExpertIds = await this.findAbsentExperts(session);
        console.log('absent experts ', absentExpertIds);
        if (!absentExpertIds.length) return;
        await this.userRepo.blockExperts(absentExpertIds, session);
        await this.cleanupQuestionSubmissions(absentExpertIds, session);
      } catch (error) {
        throw new InternalServerError(
          `Daily reviewer cleanup failed: ${error}`,
        );
      }
    });
  }

  async findAbsentExperts(session: ClientSession): Promise<string[]> {
    const experts = await this.userRepo.findUnblockedUsers(session);
    return experts
      .filter(expert => !isToday(expert.lastCheckInAt))
      .map(expert => expert._id.toString());
  }

  async cleanupQuestionSubmissions(
    absentExpertIds: string[],
    session: ClientSession,
  ): Promise<void> {
    if (!absentExpertIds.length) return;

    const submissions = await this.questionSubmissionRepo.getAbsentSubmissions(
      absentExpertIds,
      session,
    );
    for (const submission of submissions) {
      const {questionId, queue = [], history = []} = submission;

      if (!queue.length) continue;
      const indicesToRemove = new Set<number>();
      if (
        history.length === 0 &&
        queue[0] &&
        absentExpertIds.includes(queue[0].toString())
      ) {
        indicesToRemove.add(0);
      }
      if (history.length > 0) {
        const pendingIndex = history.length - 1;
        const expertId = queue[pendingIndex]?.toString();

        if (expertId && absentExpertIds.includes(expertId)) {
          indicesToRemove.add(pendingIndex);
        }
      }
      for (let index = history.length; index < queue.length; index++) {
        const expertId = queue[index]?.toString();
        if (!expertId) continue;

        if (absentExpertIds.includes(expertId)) {
          indicesToRemove.add(index);
        }
      }
      if (!indicesToRemove.size) continue;
      const sortedIndices = Array.from(indicesToRemove).sort((a, b) => b - a);
      for (const index of sortedIndices) {
        console.log(
          'Removing expert from question',
          questionId.toString(),
          'at index',
          index,
        );

        await this.removeExpertFromQueue(
          'system',
          questionId.toString(),
          index,
          {skipAutoAllocate: true},
          session,
        );
      }
      const question = await this.questionRepo.getById(
        questionId.toString(),
        session,
      );
      if (question.isAutoAllocate === false) {
        await this.questionRepo.updateAutoAllocate(
          questionId.toString(),
          true,
          session,
        );
      }
      const latestSubmission =
        await this.questionSubmissionRepo.getByQuestionId(
          questionId.toString(),
          session,
        );

      const UPDATED_QUEUE_LENGTH = latestSubmission.queue.length || 0;
      const UPDATED_HISTORY_LENGTH = latestSubmission.history.length || 0;
      if (UPDATED_QUEUE_LENGTH === 0) {
        // if (question?.isAutoAllocate) {
        await this.autoAllocateExperts(questionId.toString(), session, 3);
        // }
        continue;
      }

      let BATCH_EXPECTED_TO_ADD = 6;
      if (UPDATED_QUEUE_LENGTH < 3) {
        BATCH_EXPECTED_TO_ADD = 3 - UPDATED_QUEUE_LENGTH;
      }
      if (
        UPDATED_QUEUE_LENGTH < 3 ||
        (UPDATED_QUEUE_LENGTH === UPDATED_HISTORY_LENGTH &&
          UPDATED_QUEUE_LENGTH < 10)
      ) {
        await this.autoAllocateExperts(
          questionId.toString(),
          session,
          BATCH_EXPECTED_TO_ADD,
        );
      }
    }
    console.log('Completed!');
  }
  async balanceWorkload_copy() {
    return await this._withTransaction(async session => {
      try {
        const lessWorkloadExperts =
          await this.userRepo.findActiveLowReputationExpertsToday(session);
        const MAX_PER_EXPERT = 5;
        const maxAssignments = lessWorkloadExperts.length * MAX_PER_EXPERT;
        if (!lessWorkloadExperts.length) {
          return {
            message: 'No Expert present to Reallocate question ',
            expertsInvolved: 0,
            submissionsProcessed: 0,
          };
        }

        const delayedSubmissions =
          await this.questionSubmissionRepo.findQuestionsNeedingEscalation(
            maxAssignments,
            session,
          );
        if (!delayedSubmissions.length) {
          return {
            message: 'No delayed questions present to Reallocate',
            expertsInvolved: 0,
            submissionsProcessed: 0,
          };
        }

        //  const submissionsToProcess = delayedSubmissions.slice(0, maxAssignments);

        // -----------------------------
        // 🎯 Round Robin Distribution
        // -----------------------------
        /* const assignments: Record<string, any[]> = {};
        lessWorkloadExperts.forEach(e => (assignments[e._id.toString()] = []));
  
        let expertIndex = 0;
        for (const submission of submissionsToProcess) {
          const expert = lessWorkloadExperts[expertIndex];
          assignments[expert._id.toString()].push(submission);
          expertIndex = (expertIndex + 1) % lessWorkloadExperts.length;
        }*/
        // -----------------------------
        // 🎯 Smart Round Robin Distribution
        // -----------------------------
        const assignments: Record<string, any[]> = {};
        const expertLoad: Record<string, number> = {};

        lessWorkloadExperts.forEach(e => {
          const id = e._id.toString();
          assignments[id] = [];
          expertLoad[id] = 0;
        });

        let expertIndex = 0;
        console.log(
          'the assignments coming=====',
          delayedSubmissions.length,
          assignments,
        );
        console.log('the delayed questions====', expertLoad);

        for (const submission of delayedSubmissions) {
          let attempts = 0;
          let assigned = false;

          // Build a set of experts who already handled this submission
          const historyExpertIds = new Set(
            (submission.history || []).map(h => h.updatedBy?.toString()),
          );

          /*const queueExpertIds = new Set(
    (submission.queue || []).map(q => q.toString()),
  );*/
          const firstExpertId = submission.queue?.[0]?.toString();
          const queueExpertIds = new Set(firstExpertId ? [firstExpertId] : []);

          while (attempts < lessWorkloadExperts.length && !assigned) {
            const expert = lessWorkloadExperts[expertIndex];
            const expertId = expert._id.toString();

            const alreadyInHistory = historyExpertIds.has(expertId);
            const alreadyInQueue = queueExpertIds.has(expertId);
            const overloaded = expertLoad[expertId] >= MAX_PER_EXPERT;

            if (!alreadyInHistory && !alreadyInQueue && !overloaded) {
              assignments[expertId].push(submission);
              expertLoad[expertId]++;
              assigned = true;
            }

            expertIndex = (expertIndex + 1) % lessWorkloadExperts.length;
            attempts++;
          }

          if (!assigned) {
            console.warn(
              `No eligible expert found for submission ${submission._id}`,
            );
            // Optional: push to fallback/manual bucket
          }
        }
        const totalAssigned = Object.values(assignments).reduce(
          (sum, arr) => sum + arr.length,
          0,
        );

        // -----------------------------
        // 🔄 Process Each Assignment
        // -----------------------------
        for (const expertId in assignments) {
          const expertSubmissions = assignments[expertId];

          for (const submission of expertSubmissions) {
            const submissionId = submission._id;
            const queue = submission.queue || [];
            const history = submission.history || [];
            const now = new Date();

            // =========================
            // 🟢 TYPE A — No History
            // =========================
            if (history.length === 0) {
              const firstExpert = queue[0]?.toString();

              // Penalize only first queued expert
              if (firstExpert) {
                await this.userRepo.updateReputationScore(
                  firstExpert,
                  false,
                  session,
                );
              }

              await this.questionSubmissionRepo.updateById(
                submissionId,
                {
                  $set: {
                    queue: [new ObjectId(expertId)],
                    createdAt: now,
                    updatedAt: now,
                  },
                },
                session,
              );

              await this.userRepo.updateReputationScore(
                expertId,
                true,
                session,
              );

              await this.notificationService.saveTheNotifications(
                'A Question has been assigned for answering',
                'Answer Creation Assigned',
                submission.questionId.toString(),
                expertId,
                'answer_creation',
              );

              continue;
            }

            // =========================
            // 🔵 TYPE B — Has History
            // =========================
            const lastHistory = history[history.length - 1];

            if (lastHistory?.status === 'in-review') {
              const stuckExpertId = lastHistory.updatedBy?.toString();

              // Find stuck expert index
              const stuckIndex = queue.findIndex(
                q => q.toString() === stuckExpertId,
              );

              // Keep only experts before stuck one
              const newQueue =
                stuckIndex > -1 ? queue.slice(0, stuckIndex) : [];

              // Add new expert
              newQueue.push(new ObjectId(expertId));
              // rebuild history safely
              const updatedHistory = history.slice(0, -1);
              updatedHistory.push({
                updatedBy: new ObjectId(expertId),
                status: 'in-review',
                createdAt: now,
                updatedAt: now,
              });

              await this.questionSubmissionRepo.updateById(
                submissionId,
                {
                  $set: {
                    queue: newQueue,
                    history: updatedHistory,
                    updatedAt: now,
                  },
                },
                session,
              );

              // Penalize stuck expert
              if (stuckExpertId) {
                await this.userRepo.updateReputationScore(
                  stuckExpertId,
                  false,
                  session,
                );
              }

              // Reward new expert
              await this.userRepo.updateReputationScore(
                expertId,
                true,
                session,
              );
              await this.notificationService.saveTheNotifications(
                'A new Review has been assigned to you',
                'New Review Assigned',
                submission.questionId.toString(),
                expertId,
                'peer_review',
              );
            }
          }
        }
        return {
          message: 'Successfully ReAllocated delayed Questions',
          expertsInvolved: lessWorkloadExperts.length,
          submissionsProcessed: totalAssigned,
        };
      } catch (error) {
        throw new InternalServerError(`Failed to balance workload: ${error}`);
      }
    });
  }

  async balanceWorkload() {
    const lessWorkloadExperts =
      await this.userRepo.findActiveLowReputationExpertsToday();

    const MAX_PER_EXPERT = 5;
    const maxAssignments = lessWorkloadExperts.length * MAX_PER_EXPERT;

    if (!lessWorkloadExperts.length) {
      return {
        message: 'No Expert Present To Reallocate Questions .No action needed.',
        expertsInvolved: 0,
        submissionsProcessed: 0,
      };
    }

    const delayedSubmissions =
      await this.questionSubmissionRepo.findQuestionsNeedingEscalation(
        maxAssignments,
      );

    if (!delayedSubmissions.length) {
      return {
        message:
          'No questions are pending allocation for more than one hour. No action needed.',
        expertsInvolved: 0,
        submissionsProcessed: 0,
      };
    }

    const assignments: Record<string, any[]> = {};
    const expertLoad: Record<string, number> = {};

    lessWorkloadExperts.forEach(e => {
      const id = e._id.toString();
      assignments[id] = [];
      expertLoad[id] = 0;
    });

    let expertIndex = 0;

    for (const submission of delayedSubmissions) {
      let attempts = 0;
      let assigned = false;

      const historyExpertIds = new Set(
        (submission.history || []).map(h => h.updatedBy?.toString()),
      );
      const firstExpertId = submission.queue?.[0]?.toString();
      const queueExpertIds = new Set(firstExpertId ? [firstExpertId] : []);

      while (attempts < lessWorkloadExperts.length && !assigned) {
        const expert = lessWorkloadExperts[expertIndex];
        const expertId = expert._id.toString();

        if (
          !historyExpertIds.has(expertId) &&
          !queueExpertIds.has(expertId) &&
          expertLoad[expertId] < MAX_PER_EXPERT
        ) {
          assignments[expertId].push(submission);
          expertLoad[expertId]++;
          assigned = true;
        }

        expertIndex = (expertIndex + 1) % lessWorkloadExperts.length;
        attempts++;
      }
    }

    const flatAssignments: {submissionId: string; expertId: string}[] = [];

    // console.log("the assignments=======",assignments)

    for (const expertId in assignments) {
      for (const submission of assignments[expertId]) {
        flatAssignments.push({
          submissionId: submission._id.toString(),
          expertId,
        });
      }
    }
    const jobId = startBalanceWorkloadWorkers(flatAssignments);

    return {
      message: 'Workload balancing started in background',
      expertsInvolved: lessWorkloadExperts.length,
      submissionsProcessed: flatAssignments.length,
    };
  }

  // async getQuestionsByDateRange(
  //     startDate: string,
  //     endDate: string,
  //   ):Promise<IQuestion[]> {
  //     if (!startDate || !endDate) {
  //       throw new Error('startDate and endDate are required');
  //     }

  //     const start = new Date(startDate);
  //     const end = new Date(endDate);

  //     // make end date inclusive
  //     end.setHours(23, 59, 59, 999);

  //     return await this.questionRepo.findByDateRangeAndSource(
  //       start,
  //       end,
  //       'AJRASAKHA',
  //     );
  //   }

  async sendOutReachQuestionsMail(
    startDate: string,
    endDate: string,
    emails: string | string[],
  ): Promise<{success: boolean; message: string}> {
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(endDate + 'T23:59:59.999Z');
    const questions = await this.questionRepo.findByDateRangeAndSource(
      start,
      end,
      'AJRASAKHA',
    );

    const duplicateQuestions = await this.duplicateQuestionRepository.findDuplicatesByDateRange(start, end, 'AJRASAKHA');
      const combineQuestions=[...questions,...duplicateQuestions]
    const allQuestions = [
      ...combineQuestions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
            
    ];


    if (allQuestions.length === 0) {

      return {
        success: true,
        message: 'There are no Outreach questions in the selected time',
      };
    }

    const csv = this.convertQuestionsToCSV(allQuestions, startDate, endDate);


    await sendEmailWithAttachment(
      emails,
      'Ajrasakha Outreach Questions Report',
      `
        <p>Hello,</p>
        <p>Please find attached the <b>Ajrasakha Outreach Questions</b> report.</p>
        <p>Date Range: <b>${startDate}</b> to <b>${endDate}</b></p>
        <br />
        <p>Regards,<br/>Ajrasakha System</p>
      `,
      csv,
      'out_reach_questions.csv',
    );
    return {
      success: true,
      message: 'Outreach questions report sent via email',
    };
  }

  private convertQuestionsToCSV(
    data: IQuestion[],
    startDate?: string,
    endDate?: string,
  ): string {
    if (!data.length) return '';

    const reportHeader = [
      'Out Reach Data Report',
      `Date Range: ${this.formatDate(startDate)} - ${this.formatDate(endDate)}`,
      '', // empty line
    ].join('\n');

    const headers = [
      'Question',
      'Status',
      'Priority',
      // 'Is Auto Allocate',
      'Source',
      'State',
      'District',
      'Crop',
      'Season',
      'Domain',
      // 'Total Answers',
      // 'AI Initial Answer',
      'Text',
      // 'Closed At',
      'Created At',
      // 'Updated At',
    ];

    const rows = data.map(q => [
      this.escape(q.question),
      q.status,
      q.priority,
      // q.isAutoAllocate,
      q.source,
      q.details?.state,
      q.details?.district,
      q.details?.crop,
      q.details?.season,
      q.details?.domain,
      // q.totalAnswersCount,
      // this.escape(q.aiInitialAnswer),
      this.escape(q.text),
      // q.closedAt ? this.formatDate(q.closedAt) : '',
      q.createdAt ? this.formatDate(q.createdAt) : '',
      // q.updatedAt ? this.formatDate(q.updatedAt) : '',
    ]);

    return [
      reportHeader,
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');
  }

  private formatDate(date: Date | string): string {
    return new Date(date).toISOString().split('T')[0]; // YYYY-MM-DD
  }
  private escape(value: any): string {
    if (value === null || value === undefined) return '';
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  async generateQuestionReport(consecutiveApprovals?: number, startDate?: Date, endDate?: Date) {
    const result = await this.answerRepo.groupbyquestion(consecutiveApprovals, startDate, endDate);

    // Check if there's any data with reasons
    const hasData = result.reasons.some(item => {
      const modList = (item.reasonForModification || []).filter(Boolean);
      const rejList = (item.reasonForRejection || []).filter(Boolean);
      return modList.length > 0 || rejList.length > 0;
    });

    // Return null if no data found
    if (!hasData) {
      return null;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Question Reasons");
  
    sheet.columns = [
      { header: "Created At", key: "createdAt", width: 22 },
      { header: "Question", key: "question", width: 50 },
      { header: "Reason For Modification", key: "mod", width: 50 },
      { header: "Reason For Rejection", key: "rej", width: 50 }
    ];
  
    let rowCount = 0;
    result.reasons.forEach(item => {
      const modList = (item.reasonForModification || []).filter(Boolean);
      const rejList = (item.reasonForRejection || []).filter(Boolean);
      
      if (!modList.length && !rejList.length) return;
  
      const row = sheet.addRow({
        createdAt: item.createdAt,
        question: item.question,
        mod: modList.map((r, i) => `${i + 1}) ${r}`).join("\n"),
        rej: rejList.map((r, i) => `${i + 1}) ${r}`).join("\n"),
      });
  
      row.getCell("mod").alignment = { wrapText: true };
      row.getCell("rej").alignment = { wrapText: true };
      rowCount++;
    });
  
    const data = await workbook.xlsx.writeBuffer();
    return data;
  }

  async generateOverallQuestionReport(startDate?: Date, endDate?: Date): Promise<ArrayBuffer | null> {
    return this._withTransaction(async (session) => {
      // Get monthly statistics from the repository
      const stats = await this.questionRepo.getMonthlyQuestionStats(startDate, endDate, session);

      // Check if there's any data
      if (!stats || stats.length === 0) {
        return null;
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Overall Questions Report");

      // Define columns matching the template
      sheet.columns = [
        { header: "Year", key: "year", width: 12 },
        { header: "Month", key: "month", width: 15 },
        { header: "Total No. of Q", key: "totalQuestions", width: 18 },
        { header: "Modified Answ", key: "modifiedAnswers", width: 18 },
        { header: "Rejected Answ", key: "rejectedAnswers", width: 18 },
        { header: "Total (Modified + Rejected)", key: "total", width: 28 }
      ];

      // Add data rows
      stats.forEach(stat => {
        sheet.addRow({
          year: stat.year,
          month: stat.month,
          totalQuestions: stat.totalQuestions,
          modifiedAnswers: stat.modifiedAnswers,
          rejectedAnswers: stat.rejectedAnswers,
          total: stat.modifiedAnswers + stat.rejectedAnswers
        });
      });

      // Style the header row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as ArrayBuffer;
    });
  }

  async generateStateCropQuestionReport(filters: {
    state?: string;
    crop?: string;
    season?: string;
    domain?: string;
    status?: string;
  }): Promise<ArrayBuffer | null> {
    return this._withTransaction(async (session) => {
      // Build filter query
      const query: any = {};
      if (filters.state && filters.state !== 'all') {
        query['details.state'] = filters.state;
      }
      if (filters.crop && filters.crop !== 'all') {
        query['details.crop'] = filters.crop;
      }
      if (filters.season && filters.season !== 'all') {
        query['details.season'] = filters.season;
      }
      if (filters.domain && filters.domain !== 'all') {
        query['details.domain'] = filters.domain;
      }
      if (filters.status && filters.status !== 'all') {
        query.status = filters.status;
      }

      // Get questions from repository
      const questions = await this.questionRepo.getQuestionsByFilters(query, session);

      if (!questions || questions.length === 0) {
        console.log("No questions found for given filters");
        return null;
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Questions");

      // Define columns
      sheet.columns = [
        { header: "Created At", key: "createdAt", width: 22 },
        { header: "Question", key: "question", width: 60 },
        { header: "State", key: "state", width: 20 },
        { header: "District", key: "district", width: 20 },
        { header: "Crop", key: "crop", width: 20 },
        { header: "Season", key: "season", width: 20 },
        { header: "Domain", key: "domain", width: 25 },
        { header: "Status", key: "status", width: 15 },
        { header: "Priority", key: "priority", width: 15 },
        { header: "Source", key: "source", width: 15 },
      ];

      // Add data rows
      questions.forEach(q => {
        sheet.addRow({
          createdAt: q.createdAt,
          question: q.question,
          state: q.details?.state,
          district: q.details?.district,
          crop: q.details?.crop,
          season: q.details?.season,
          domain: q.details?.domain,
          status: q.status,
          priority: q.priority,
          source: q.source,
        });
      });

      // Style the header row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as ArrayBuffer;
    });
  }

    async generateDuplicateQuestionReport(startDate?: Date, endDate?: Date): Promise<ArrayBuffer | null> {
    return this._withTransaction(async (session) => {
      if (!startDate || !endDate) {
        throw new BadRequestError('startDate and endDate are required');
      }

      // Fetch duplicates using the repository
      const duplicateQuestions = await this.duplicateQuestionRepository.findDuplicatesByDateRange(startDate, endDate, 'AJRASAKHA',session);

      if (!duplicateQuestions || duplicateQuestions.length === 0) {
        return null;
      }

      // Fetch reference question details for metadata
      // Use a Map to avoid duplicate fetches for the same reference question
      const refDetailsMap = new Map<string, {state: string; district: string; crop: string; season: string; domain: string} | null>();

      for (const q of duplicateQuestions) {
        const refId = q.referenceQuestionId?.toString();
        if (refId && !refDetailsMap.has(refId)) {
          try {
            const refQuestion = await this.questionRepo.getById(refId, session);
            refDetailsMap.set(refId, refQuestion?.details || null);
          } catch {
            refDetailsMap.set(refId, null);
          }
        }
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Similar Questions");

      // Define columns with metadata for both question and reference question
      sheet.columns = [
        { header: "createdAt", key: "createdAt", width: 22 },
        { header: "question", key: "question", width: 60 },
        { header: "q_state", key: "q_state", width: 18 },
        { header: "q_district", key: "q_district", width: 20 },
        { header: "q_crop", key: "q_crop", width: 18 },
        { header: "q_season", key: "q_season", width: 18 },
        { header: "q_domain", key: "q_domain", width: 22 },
        { header: "source", key: "source", width: 15 },
        { header: "similarityScore", key: "similarityScore", width: 18 },
        { header: "referenceQuestion", key: "referenceQuestion", width: 60 },
        { header: "ref_state", key: "ref_state", width: 18 },
        { header: "ref_district", key: "ref_district", width: 20 },
        { header: "ref_crop", key: "ref_crop", width: 18 },
        { header: "ref_season", key: "ref_season", width: 18 },
        { header: "ref_domain", key: "ref_domain", width: 22 },
      ];

      // Add data rows
      duplicateQuestions.forEach(q => {
        const refId = q.referenceQuestionId?.toString();
        const refDetails = refId ? refDetailsMap.get(refId) : null;

        sheet.addRow({
          createdAt: q.createdAt,
          question: q.question,
          q_state: q.details?.state || '',
          q_district: q.details?.district || '',
          q_crop: q.details?.crop || '',
          q_season: q.details?.season || '',
          q_domain: q.details?.domain || '',
          source: q.source,
          similarityScore: q.similarityScore,
          referenceQuestion: q.referenceQuestion ? q.referenceQuestion : '',
          ref_state: refDetails?.state || '',
          ref_district: refDetails?.district || '',
          ref_crop: refDetails?.crop || '',
          ref_season: refDetails?.season || '',
          ref_domain: refDetails?.domain || '',
        });
      });

      // Style the header row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as ArrayBuffer;
    });
  }


}
