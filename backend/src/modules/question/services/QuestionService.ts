import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject, injectable } from 'inversify';
import { ClientSession, ObjectId } from 'mongodb';
import { startBalanceWorkloadWorkers } from '#root/workers/balanceWorkload.manager.js';
import {
  IQuestion,
  IQuestionSubmission,
  ISubmissionHistory,
  IAnswer,
  INotificationType,
  IQuestionPriority,
  ISimilarQuestion,
  AddQuestionResult,
  ICheckStatusResponse
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';
import { IAnswerRepository } from '#root/shared/database/interfaces/IAnswerRepository.js';
import { IQuestionSubmissionRepository } from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { IRequestRepository } from '#root/shared/database/interfaces/IRequestRepository.js';
import { IContextRepository } from '#root/shared/database/interfaces/IContextRepository.js';
import { INotificationRepository } from '#root/shared/database/interfaces/INotificationRepository.js';
import { notifyUser } from '#root/utils/pushNotification.js';
import { normalizeKeysToLower } from '#root/utils/normalizeKeysToLower.js';
import { appConfig } from '#root/config/app.js';
import { AiService } from '#root/modules/core/services/AiService.js';
import {
  AddQuestionBodyDto,
  AllocatedQuestionsBodyDto,
  DetailedQuestionsBodyDto,
  GeneratedQuestionResponse,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '../classes/validators/QuestionVaidators.js';
import { PreferenceDto } from '#root/modules/core/classes/validators/UserValidators.js';
import { QuestionLevelResponse } from '#root/modules/core/classes/transformers/QuestionLevel.js';
import { NotificationService } from '#root/modules/core/services/NotificationService.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { IQuestionService } from '../interfaces/IQuestionService.js';
import { isToday } from '#root/utils/date.utils.js';
import { IReRouteRepository } from '#root/shared/database/interfaces/IReRouteRepository.js';
import { sendEmailWithAttachment } from '#root/utils/mailer.js';
import ExcelJS from 'exceljs'
import { cosineSimilarity } from '../../../utils/cosine-similarity.js';
import { IDuplicateQuestionRepository } from '#root/shared/database/interfaces/IDuplicateQuestionRepository.js';
import { chatbotSimilarityLogger } from '../logger/chatbot-similarity.logger.js';
import { checkConceptDuplicate } from '#root/modules/question/aiservice/checkConceptDuplicate.js'
import { ICropRepository } from '#root/shared/database/interfaces/ICropRepository.js';
import { CHATBOT_TYPES } from '#root/modules/chatbot/types.js';
import { IChatbotRepository } from '#root/shared/database/interfaces/IChatbotRepository.js';
import { toObjectIdArray } from '#root/utils/normalizeToObjectIdArray.js';

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

    @inject(GLOBAL_TYPES.CropRepository)
    private readonly cropRepository: ICropRepository,

    @inject(CHATBOT_TYPES.ChatbotRepository)
    private readonly chatbotRepository: IChatbotRepository,

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

    // const testEmbedding = await this.aiService.getEmbedding('Test'); // disabled locally — AI server not running

    // ── In-memory crop cache: lowercase input → canonical normalised_crop ──
    const cropCache = new Map<string, string>();

    const formatted: IQuestion[] = [];
    for (const q of questions) {
      const low = normalizeKeysToLower(q || {});
      const details: IQuestion['details'] = {
        state: (low.state || '').toString(),
        district: (low.district || '').toString(),
        crop: (low.crop || '').toString(),
        season: (low.season || '').toString(),
        domain: (low.domain || '').toString(),
      };

      // ── Crop normalisation (mirrors addQuestion logic, with per-call cache) ──
      const rawCropName = (low.crop || '').toString();
      let normalised_crop = rawCropName.trim().toLowerCase();
      if (rawCropName.trim()) {
        const cacheKey = rawCropName.trim().toLowerCase();
        if (cropCache.has(cacheKey)) {
          normalised_crop = cropCache.get(cacheKey)!;
        } else {
          try {
            const existingCrop = await this.cropRepository.findByNameOrAlias(rawCropName);
            if (existingCrop) {
              normalised_crop = existingCrop.name;
            } else {
              const normalizedName = rawCropName.trim().toLowerCase();
              await this.cropRepository.createCrop(normalizedName, userId || '', []);
              normalised_crop = normalizedName;
            }
          } catch (cropError: any) {
            console.error('Crop normalization warning:', cropError.message);
          }
          // Always cache — prevents retrying failed crop creation on subsequent questions
          cropCache.set(cacheKey, normalised_crop);
        }
      }
      // Explicitly preserve the original input string — normalised_crop holds the canonical name
      details.crop = rawCropName.trim();
      details.normalised_crop = normalised_crop;

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

      formatted.push(base);
    }

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
    body: AllocatedQuestionsBodyDto,
  ): Promise<QuestionResponse[]> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        return this.questionRepo.getAllocatedQuestions(userId, query, session, body);
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to get unanswered questions: ${error}`,
      );
    }
  }

  async getDetailedQuestions(
    query: GetDetailedQuestionsQuery,
    body: DetailedQuestionsBodyDto,
  ): Promise<{ questions: IQuestion[]; totalPages: number }> {

    let searchEmbedding: number[] | null = null;

    if (query?.search) {
      try {
        // const embedding=[]
        const { embedding } = await this.aiService.getEmbedding(query.search);
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
    }, body);
  }

  async getQuestionFromRawContext(
    // While text to speech
    context: string,
  ): Promise<GeneratedQuestionResponse[]> {
    const questions = await this.aiService.getQuestionByContext(context);
    // SAMPLE RESPONSE (mocked because API doesn't work locally)
    /* const questions: any = {
       reviewer: [
         {
           id: "697dbfb7622aa3a183070682",
           question: "How to control stem borer grubs in paddy crop?",
           answer: "Stem borer is one of the most destructive pests of paddy (rice) crop...",
           source: "AGRI_EXPERT",
           details: {
             state: "Haryana",
             district: "HISSAR",
             crop: "Paddy",
             season: "KHARIF",
             domain: "Pest",
           },
           score: 0.9331517815589905,
         },
         {
           id: "695b446528ae67127339da95",
           question: "How to control Stem Borer infestation in Paddy?",
           answer: "Stem borer is one of the most destructive pests affecting paddy crops in India...",
           source: "AGRI_EXPERT",
           details: {
             state: "UTTAR PRADESH",
             district: "CHANDAULI",
             crop: "Paddy",
             season: "Kharif",
             domain: "Plant Protection",
           },
           score: 0.932569146156311,
         },
       ],
   
       golden: [
         {
           question: "How to prevent stem borer in paddy?",
           answer: "Stem borer in paddy is a major pest and shows distinct symptoms...",
           metadata: {
             "Agri Specialist": "Gonnabathula Girishma",
             Crop: "Paddy Dhan",
             District: "YADADRI BHUVANAGIRI",
             Season: "Kharif",
             State: "TELANGANA",
           },
           score: 0.9287769794464111,
         },
       ],
   
       pop: [
         {
           text: "Rice stem borers: The larvae of these insects bore into the stem and cause damage from July to October...",
           metadata: {
             page_no: 24,
             headings: ["A. Insect Pests"],
             source:
               "https://storage.googleapis.com/annam-dataset/pops/Punjab_Kharif_2025.pdf",
           },
           score: 0.9020636677742004,
         },
       ],
     };*/
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
          { state: details.state, district: details.district, crop: typeof details.crop === 'string' ? details.crop : details.crop.name, domain: details.domain, season: details.season },
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
    const logData: Record<string, any> = {};
    try {
      // Extract aiInitialAnswer before normalizing keys to lowercase
      const aiInitialAnswer = body.aiInitialAnswer || '';
      body = normalizeKeysToLower(body);

      let {
        question,
        priority,
        source = 'AGRI_EXPERT',
        details,
        context,
      } = body;
      console.log("the body coming=====", body)

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
        !(typeof details.crop === 'string' ? details.crop.trim() : details.crop?.name?.trim()) ||
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

      // ─── Normalize crop against crop_master DB ───────────────────────────
      const rawCropName = typeof details.crop === 'string' ? details.crop : details.crop?.name || '';
      let normalised_crop = rawCropName.trim().toLowerCase();
      if (rawCropName.trim()) {
        try {
          const existingCrop = await this.cropRepository.findByNameOrAlias(rawCropName);
          if (existingCrop) {
            // Crop found — keep original input string, normalise to canonical name
            normalised_crop = existingCrop.name;
            logData.cropNormalization = { original: rawCropName, resolved: existingCrop.name, action: rawCropName.trim().toLowerCase() === existingCrop.name ? 'EXACT_MATCH' : 'ALIAS_RESOLVED' };
          } else {
            // Crop not found — auto-create it in the DB
            const normalizedName = rawCropName.trim().toLowerCase();
            await this.cropRepository.createCrop(normalizedName, userId || '', []);
            normalised_crop = normalizedName;
            logData.cropNormalization = { original: rawCropName, resolved: normalizedName, action: 'AUTO_CREATED' };
          }
        } catch (cropError: any) {
          // If crop normalization fails (e.g. uniqueness race condition), log but don't block question creation
          console.error('Crop normalization warning:', cropError.message);
          logData.cropNormalizationError = cropError.message;
        }
      }
      // Explicitly preserve the original input string — normalised_crop holds the canonical name
      details.crop = rawCropName.trim();
      details.normalised_crop = normalised_crop;

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

      // Check 4 Questions best match- 

      let topMatches: { questionId: ObjectId, question: string, similarityScore: number }[] = []

      // ✅ Everything that needs atomicity goes inside the transaction
      return this._withTransaction(async (session: ClientSession) => {
        // 🔹 Create Context
        let contextId: ObjectId | null = null;

        if (context) {
          const { insertedId } = await this.contextRepo.addContext(context, session);
          contextId = new ObjectId(insertedId);
        }
        // source="AJRASAKHA"
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
          isAutoAllocate: !(source === "AJRASAKHA" || source === "WHATSAPP"),
          embedding: textEmbedding,
          metrics: null,
          aiInitialAnswer,
          text,
          createdAt: new Date(),
          updatedAt: new Date(),
        };



        let isDuplicate = false
        let matchedQuestion = ""
        let matchedQuestionId: ObjectId | null = null
        let matchedScore = 0
        let referenceSourcefrom = ''

        let topSimilar

        const llmCandidates: typeof topMatches = []
        let dummysource = false
        if (source === 'AJRASAKHA' || source === 'WHATSAPP') {
          console.log("the source is coming====", source)
          /* const topSimilar = await this.questionRepo.findTopSimilarQuestions(
           textEmbedding, 25,
           { state: details.state,district: details.district, crop: details.crop, domain: details.domain, season: details.season }, )*/
          const questions = await this.aiService.getQuestionByContextAndMetaData(
            question,
            details.state,
            details.district,
            typeof details.crop === 'string' ? details.crop : details.crop.name,
            //details.season,
            // details.domain
          );
          console.log("the questions coming=====", questions)
          // merge reviewer + golden
          let merged = [
            ...(questions.reviewer || []).map((item: any) => ({
              question: item.question,
              answer: item.answer,
              agri_specialist: item.source || "AGRI_EXPERT",
              referenceSource: "reviewer",
              score: item.score * 100
            })),

            ...(questions.golden || []).map((item: any) => ({
              question: item.question,
              answer: item.answer,
              agri_specialist: item.metadata?.["Agri Specialist"] || "Unknown",
              referenceSource: "golden",
              score: item.score * 100
            })),


          ];
          merged = Array.from(
            new Map(merged.map(q => [q.question, q])).values(),
          ).map(q => ({
            ...q,
            id: new ObjectId().toString()
          }));


          merged.sort((a, b) => b.score - a.score);


          // get top 5
          const bestFive = merged.slice(0, 5);

          // convert to topMatches
          topSimilar = bestFive.map(q => ({
            questionId: new ObjectId().toString(),
            question: q.question,
            similarityScore: q.score,
            referenceSource: q.referenceSource
          }));

          logData.totalMatches = topSimilar.length

          logData.matches = topSimilar.map((q) => ({ questionId: q.questionId, question: q.question, similarityScore: q.similarityScore }))
          logData.topMatches = topSimilar
          logData.threshold = 85
          for (const match of topSimilar) {


            const highestScore = match.similarityScore

            // Rule 1: immediate duplicate
            if (highestScore >= 95) {
              isDuplicate = true
              matchedQuestion = match.question
              matchedQuestionId = match.questionId
              matchedScore = highestScore
              referenceSourcefrom = match.referenceSource
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

            const matchedQuestionfromllm = await checkConceptDuplicate(
              baseQuestion.question,
              candidateQuestions
            )

            if (matchedQuestionfromllm) {

              let filtermatchinQuestion = topSimilar.filter(ele => ele.question == matchedQuestionfromllm)

              matchedQuestion = filtermatchinQuestion[0].question
              matchedQuestionId = filtermatchinQuestion[0].questionId
              matchedScore = filtermatchinQuestion[0].similarityScore
              referenceSourcefrom = filtermatchinQuestion[0].referenceSource

              const duplicateQuestion = {
                ...baseQuestion,
                similarityScore: Number(matchedScore.toFixed(2)),
                referenceQuestionId: matchedQuestionId,
                referenceQuestion: matchedQuestion,
                referenceSource: referenceSourcefrom
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
          }

          if (isDuplicate && matchedQuestionId && matchedQuestion) {
            const duplicateQuestion = {
              ...baseQuestion,
              similarityScore: Number(matchedScore.toFixed(2)),
              referenceQuestionId: matchedQuestionId,
              referenceQuestion: matchedQuestion,
              referenceSource: referenceSourcefrom
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
        let queue: ObjectId[] = [];
        let initialUsersToAllocate: typeof users = [];

        if (source === 'AGRI_EXPERT') {
          initialUsersToAllocate = users.slice(0, 3);

          queue = initialUsersToAllocate.map(
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
        } else {
          const [allModerators, taskForceModerators] = await Promise.all([
            this.userRepo.findModerators(),
            this.userRepo.getSpecialTaskForceModerators()
          ]);
          const allUsers = [...allModerators, ...taskForceModerators]

          const sourceLabel =
            source === "AJRASAKHA" ? "Ajrasakha" : "WhatsApp";

          const message = `A new question has been received from ${sourceLabel} and needs your attention.`;

          await Promise.all(
            allUsers.map((moderator: any) =>
              this.notificationService.saveTheNotifications(
                message,
                "New Question Received",
                savedQuestion._id.toString(),
                moderator._id.toString(),
                source === "AJRASAKHA" ? "question_from_ajrasakha" : "question_from_whatsapp"
              )
            )
          );
        }


        // return { isDuplicate: false, data: baseQuestion };
        return {
          isDuplicate: false,
          data: {
            ...baseQuestion,
            _id: baseQuestion._id?.toString?.(),
            userId: baseQuestion.userId?.toString?.(),
          },
        };
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
        let aiInitialAnswer = currentQuestion.aiInitialAnswer;

        const answers = await this.answerRepo.getByQuestionId(
          questionId,
          session,
        );

        if (answers && answers.length == 0)
          aiInitialAnswer = currentQuestion.aiInitialAnswer;

        // For AJRASAKHA: if aiApprovedAnswer is not set (old data), fall back
        // to the first answer from the answers collection
        let aiApprovedAnswer = currentQuestion.aiApprovedAnswer;
        let aiApprovedSources = currentQuestion.aiApprovedSources;
        if (
          currentQuestion.source === 'AJRASAKHA' &&
          !aiApprovedAnswer &&
          answers &&
          answers.length > 0
        ) {
          aiApprovedAnswer = answers[0].answer;
          aiApprovedSources = answers[0].sources;
        }

        return {
          id: currentQuestion._id.toString(),
          text: currentQuestion.question,
          source: currentQuestion.source,
          details: currentQuestion.details,
          status: currentQuestion.status,
          priority: currentQuestion.priority,
          aiInitialAnswer,
          aiApprovedAnswer,
          aiApprovedSources,
          isAutoAllocate: currentQuestion.isAutoAllocate,
          createdAt: new Date(currentQuestion.createdAt).toLocaleString(),
          updatedAt: new Date(currentQuestion.updatedAt).toLocaleString(),
          totalAnswersCount: currentQuestion.totalAnswersCount,
          history: submissionHistory,
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
  ): Promise<{ modifiedCount: number }> {
    try {
      // ─── Normalize crop against crop_master DB (mirrors addQuestion logic) ───
      // Lifted OUTSIDE the transaction: cropRepository calls don't use the session,
      // so they shouldn't inflate the transaction scope.
      if (updates.details?.crop) {
        const rawCropName = typeof updates.details.crop === 'string'
          ? updates.details.crop
          : (updates.details.crop as any)?.name || '';
        let normalised_crop = rawCropName.trim().toLowerCase();
        if (rawCropName.trim()) {
          try {
            const existingCrop = await this.cropRepository.findByNameOrAlias(rawCropName);
            if (existingCrop) {
              normalised_crop = existingCrop.name;
            } else {
              // Crop not found — auto-create it
              const normalizedName = rawCropName.trim().toLowerCase();
              await this.cropRepository.createCrop(normalizedName, '', []);
              normalised_crop = normalizedName;
            }
          } catch (cropError: any) {
            console.error('Crop normalization warning (updateQuestion):', cropError.message);
          }
        }
        updates.details.crop = rawCropName.trim();
        updates.details.normalised_crop = normalised_crop;
      }

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

    const [allUsers, preferredExperts] = await Promise.all([
      this.userRepo.findAll(),
      this.userRepo.findExpertsByPreference(details, session),
    ]);

    /*const expertIdsSet = new Set<string>();
    preferredExperts.forEach(user => expertIdsSet.add(user._id.toString()));
    users
      .filter(user => user.role === 'expert' && user.isBlocked !== true)
      .forEach(user => expertIdsSet.add(user._id.toString()));

    const allExpertIds = Array.from(expertIdsSet);*/
    let allExpertIds: string[] = [];
    const isAjrasakha = question.source == "AJRASAKHA" ? true : false
    if (isAjrasakha) {
      const taskForceUsers = await this.userRepo.getSpecialTaskForceExperts(session);
      
      if (taskForceUsers.length > 0) {
        allExpertIds = taskForceUsers.map(user => user._id.toString());
      } else {
        // Fallback to normal flow if no task force experts exist
        console.log('No special task force experts found, falling back to normal flow for Ajrasakha question:', questionId);
        const expertIdsSet = new Set<string>();
        preferredExperts.forEach(user => expertIdsSet.add(user._id.toString()));
        allUsers
          .filter(user => user.role === 'expert' && user.isBlocked !== true)
          .forEach(user => expertIdsSet.add(user._id.toString()));
        allExpertIds = Array.from(expertIdsSet);
      }
    } else {
      // ✅ NORMAL FLOW
      

      const expertIdsSet = new Set<string>();

      preferredExperts.forEach(user =>
        expertIdsSet.add(user._id.toString()),
      );

      allUsers
      .filter(user => user.role === 'expert' && user.isBlocked !== true)
        .forEach(user =>
          expertIdsSet.add(user._id.toString()),
        );

      allExpertIds = Array.from(expertIdsSet);
    }

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
    /*  if (filteredExperts.length === 0) {
        await this.questionRepo.updateQuestion(
          questionId,
          { status: 'in-review' },
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
      }*/
     // const expertsToAdd = filteredExperts.slice(0, FINAL_BATCH_SIZE);

      const fallbackExperts =
        filteredExperts.length === 0
          ? allExpertIds
          : [];

      const expertsToAdd = (
        filteredExperts.length > 0 ? filteredExperts : fallbackExperts
      ).slice(0, FINAL_BATCH_SIZE);

     
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

  async toggleAutoAllocate(questionId: string): Promise<{ message: string }> {
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
  ): Promise<{ deletedCount: number }> {
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

      return { deletedCount };
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
          const { embedding } = await this.aiService.getEmbedding(query.search);
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
      const { questionId, queue = [], history = [] } = submission;

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
          { skipAutoAllocate: true },
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

    const flatAssignments: { submissionId: string; expertId: string }[] = [];

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
  ): Promise<{ success: boolean; message: string }> {
    try {
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
      const combineQuestions = [...questions, ...duplicateQuestions]
      const allQuestions = [
        ...combineQuestions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),

      ];


      if (allQuestions.length === 0) {

        return {
          success: true,
          message: 'There are no Outreach questions in the selected time',
        };
      }

      // OLD CSV IMPLEMENTATION
      // const csv = this.convertQuestionsToCSV(allQuestions, startDate, endDate);
      // await sendEmailWithAttachment(
      //   emails,
      //   'Ajrasakha Outreach Questions Report',
      //   `
      //     <p>Hello,</p>
      //     <p>Please find attached the <b>Ajrasakha Outreach Questions</b> report.</p>
      //     <p>Date Range: <b>${startDate}</b> to <b>${endDate}</b></p>
      //     <br />
      //     <p>Regards,<br/>Ajrasakha System</p>
      //   `,
      //   csv,
      //   'out_reach_questions.csv',
      // );

      // NEW EXCEL IMPLEMENTATION
      const excelBuffer = await this.convertQuestionsToExcel(allQuestions, startDate, endDate);

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
        excelBuffer,
        'out_reach_questions.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      return {
        success: true,
        message: 'Outreach questions report sent via email',
      };
    } catch (error) {
      console.error('Error in sendOutReachQuestionsMail:', error);
      throw error;
    }
  }

  // OLD CSV IMPLEMENTATION
  // private convertQuestionsToCSV(
  //   data: IQuestion[],
  //   startDate?: string,
  //   endDate?: string,
  // ): string {
  //   if (!data.length) return '';

  //   const reportHeader = [
  //     'Out Reach Data Report',
  //     `Date Range: ${this.formatDate(startDate)} - ${this.formatDate(endDate)}`,
  //     '', // empty line
  //   ].join('\n');

  //   const headers = [
  //     'Question',
  //     'Status',
  //     'Priority',
  //     // 'Is Auto Allocate',
  //     'Source',
  //     'State',
  //     'District',
  //     'Crop',
  //     'Season',
  //     'Domain',
  //     // 'Total Answers',
  //     // 'AI Initial Answer',
  //     'Text',
  //     // 'Closed At',
  //     'Created At',
  //     // 'Updated At',
  //   ];

  //   const rows = data.map(q => [
  //     this.escape(q.question),
  //     q.status,
  //     q.priority,
  //     // q.isAutoAllocate,
  //     q.source,
  //     q.details?.state,
  //     q.details?.district,
  //     q.details?.crop,
  //     q.details?.season,
  //     q.details?.domain,
  //     // q.totalAnswersCount,
  //     // this.escape(q.aiInitialAnswer),
  //     this.escape(q.text),
  //     // q.closedAt ? this.formatDate(q.closedAt) : '',
  //     q.createdAt ? this.formatDate(q.createdAt) : '',
  //     // q.updatedAt ? this.formatDate(q.updatedAt) : '',
  //   ]);

  //   return [
  //     reportHeader,
  //     headers.join(','),
  //     ...rows.map(r => r.join(',')),
  //   ].join('\n');
  // }

  // NEW EXCEL IMPLEMENTATION
  private async convertQuestionsToExcel(
    data: IQuestion[],
    startDate?: string,
    endDate?: string,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Outreach Questions");

    // Add title and date range at the top
    sheet.mergeCells('A1:K1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Out Reach Data Report';
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells('A2:K2');
    const dateRangeCell = sheet.getCell('A2');
    dateRangeCell.value = `Date Range: ${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;
    dateRangeCell.font = { bold: true, size: 11 };
    dateRangeCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Add empty row
    sheet.addRow([]);

    // Manually add header row (row 4)
    const headerRow = sheet.addRow([
      'Question',
      'Status',
      'Priority',
      'Source',
      'State',
      'District',
      'Crop',
      'Season',
      'Domain',
      'Text',
      'Created At'
    ]);

    // Style the header row
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };

    // Set column widths
    sheet.getColumn(1).width = 50;  // Question
    sheet.getColumn(2).width = 15;  // Status
    sheet.getColumn(3).width = 15;  // Priority
    sheet.getColumn(4).width = 15;  // Source
    sheet.getColumn(5).width = 20;  // State
    sheet.getColumn(6).width = 20;  // District
    sheet.getColumn(7).width = 20;  // Crop
    sheet.getColumn(8).width = 15;  // Season
    sheet.getColumn(9).width = 25;  // Domain
    sheet.getColumn(10).width = 50; // Text
    sheet.getColumn(11).width = 22; // Created At

    // Add data rows
    data.forEach(q => {
      const row = sheet.addRow([
        q.question || '',
        q.status || '',
        q.priority || '',
        q.source || '',
        q.details?.state || '',
        q.details?.district || '',
        q.details?.crop || '',
        q.details?.season || '',
        q.details?.domain || '',
        q.text || '',
        q.createdAt ? this.formatDate(q.createdAt) : ''
      ]);

      // Enable text wrapping for long content
      row.getCell(1).alignment = { wrapText: true, vertical: 'top' }; // Question
      row.getCell(10).alignment = { wrapText: true, vertical: 'top' }; // Text
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
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
    normalised_crop?: string;
    season?: string;
    domain?: string;
    status?: string;
    hiddenQuestions?: string;
    duplicateQuestions?: string;
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
      if (filters.normalised_crop && filters.normalised_crop !== 'all') {
        if (filters.normalised_crop === '__NOT_SET__') {
          query.$or = [
            { 'details.normalised_crop': { $exists: false } },
            { 'details.normalised_crop': null },
            { 'details.normalised_crop': '' },
          ];
        } else {
          query['details.normalised_crop'] = { $regex: `^${filters.normalised_crop}$`, $options: 'i' };
        }
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
      if (filters.hiddenQuestions === 'true') {
        query.isHidden = { $eq: true };
      }

      // Get questions from repository
      const questions = await this.questionRepo.getQuestionsByFilters(
        query,
        session,
        filters.duplicateQuestions === 'true',
      );

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
      const duplicateQuestions = await this.duplicateQuestionRepository.findDuplicatesByDateRange(startDate, endDate, 'AJRASAKHA', session);

      if (!duplicateQuestions || duplicateQuestions.length === 0) {
        return null;
      }

      // Fetch reference question details for metadata
      // Use a Map to avoid duplicate fetches for the same reference question
      const refDetailsMap = new Map<string, { state: string; district: string; crop: string | import('#root/shared/interfaces/models.js').ICropRef; season: string; domain: string } | null>();

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
        { header: "referenceSource", key: "referenceSource", width: 20 },
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
          referenceSource: q.referenceSource || '',
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

  async getMatchedQuestion(questionId: string) {
    const questionData = await this.questionRepo.getById(questionId);

    if (!questionData) {
      throw new Error('Question not found');
    }

  const { question, details, createdAt} = questionData;

  const [analyticsMessages, annamMessages] = await Promise.all([
    this.chatbotRepository.findMatchingMessages({
      question,
      details,
      createdAt,
      questionId: questionId.toString(),
    }),
     this.chatbotRepository.findFromSecondDb({
      question,
      details,
      createdAt,
      questionId: questionId.toString(),
    }),
  ]);



    // Take first matched message (assuming 1 expected)
    const allMessages = [...analyticsMessages, ...annamMessages];

    const message = allMessages?.[0];

    if (!message) {
      throw new Error('No matching message found');
    }

    return {
      messageId: message.messageId || '',
      createdAt: message.createdAt
        ? new Date(message.createdAt).toISOString()
        : '',
      updatedAt: message.updatedAt
        ? new Date(message.updatedAt).toISOString()
        : '',
      user: {
        username: message?.userDetails?.username || 'N/A',
        email: message?.userDetails?.email || '',
        emailVerified: message?.userDetails?.emailVerified || false,
        avatar: message?.userDetails?.avatar || null,
      },
      content: message.content || [],
    };
  }
  async checkStatus(
    questionIds: string[],
  ): Promise<ICheckStatusResponse[]> {

    const result = await this.questionRepo.getQuestionsWithAnswerDetails(questionIds)

    // 1. Fetch data

    return result


  }

  async holdQuestion(questionId: string, userId: string, action: "hold" | "unhold"): Promise<{ id: string }> {
    return await this._withTransaction(async session => {
      if (action === "unhold") {
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) {
          throw new NotFoundError('Question not found');
        }
        const user = await this.userRepo.findById(userId, session);
        if (!user || user.role == 'expert') {
          throw new ForbiddenError('Only moderators or Admins can unhold questions');
        }
        await this.questionRepo.updateQuestion(questionId, { isOnHold: false }, session)
        return { id: questionId }
      }
      const user = await this.userRepo.findById(userId, session);
      if (user.role == 'expert') {
        throw new ForbiddenError('Only moderators can hold questions');
      }
      const question = await this.questionRepo.getById(questionId, session);
      if (!question) {
        throw new NotFoundError('Question not found');
      }
      const submission = await this.questionSubmissionRepo.getByQuestionId(questionId, session);
      if (!submission) {
        throw new NotFoundError('Question submission not found');
      }
      await this._handleSubmissionOnHold(submission, session);
      await this.questionRepo.updateQuestion(questionId, { isOnHold: true, isAutoAllocate: false }, session)
      return { id: questionId }
    })
  }
  async checkSubmissionExists(questionId: string): Promise<boolean> {
    const submission = await this.questionSubmissionRepo.getByQuestionId(questionId);
    return !!submission;
  }

  private async _handleSubmissionOnHold(
    submission: IQuestionSubmission,
    session: ClientSession
  ): Promise<void> {
    const questionId = submission.questionId.toString();
    if (!submission.history || submission.history.length === 0) {
      if (submission.queue?.length) {
        const firstUserId = submission.queue[0].toString();
        await this.userRepo.updateReputationScore(firstUserId, false, session);
      }

      await this.questionSubmissionRepo.updateSubmissionState(
        questionId,
        { queue: [] },
        session
      );

      return;
    }

    const lastHistory = submission.history[submission.history.length - 1];

    if (lastHistory.status !== 'in-review') return;

    const updatedById = lastHistory.updatedBy?.toString();

    let newQueue = submission.queue;

    const index = submission.queue.findIndex(
      (q) => q.toString() === updatedById
    );

    if (index !== -1) {
      newQueue = submission.queue.slice(0, index);
    }

    if (updatedById) {
      await this.userRepo.updateReputationScore(updatedById, false, session);
    }
    await this.questionSubmissionRepo.updateSubmissionState(
      questionId,
      {
        queue: toObjectIdArray(newQueue || []),
        popHistory: true,
      },
      session
    );
  }

}
