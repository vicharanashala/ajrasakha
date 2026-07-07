import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {startBalanceWorkloadWorkers} from '#root/workers/balanceWorkload.manager.js';
import {startPaeAllocationWorker} from '#root/workers/paeAllocation.manager.js';
import {startBulkDeleteWorker} from '#root/workers/bulkDelete.manager.js';
import {
  IQuestion,
  IUser,
  IQuestionSubmission,
  ISubmissionHistory,
  IAnswer,
  INotificationType,
  IQuestionPriority,
  ISimilarQuestion,
  AddQuestionResult,
  ICheckStatusResponse,
  IPreviousAllocations,
  IAuthorsHistory,
  QuestionStatus,
  QuestionSource,
  TIME_BOUND_SOURCES,
  MANUAL_SOURCES,
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  ForbiddenError,
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
import {AiService} from '#root/modules/ai/services/AiService.js';
import {
  AddQuestionBodyDto,
  AllocatedQuestionsBodyDto,
  DetailedQuestionsBodyDto,
  GeneratedQuestionResponse,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '../classes/validators/QuestionVaidators.js';
import {PreferenceDto} from '#root/modules/user/validators/UserValidators.js';
import {QuestionLevelResponse} from '#root/modules/question/classes/transformers/QuestionLevel.js';
import {NotificationService} from '#root/modules/notification/services/NotificationService.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {
  IQuestionService,
  QueueDetailsResponse,
  QueueQuestionItem,
  QueueExpertItem,
  QueueSectionName,
  QueueSectionResult,
  RawQueueQuestionRow,
} from '../interfaces/IQuestionService.js';
import {isToday} from '#root/utils/date.utils.js';
import {UserService} from '#root/modules/user/services/UserService.js';
import {IReRouteRepository} from '#root/shared/database/interfaces/IReRouteRepository.js';
import {sendEmailWithAttachment} from '#root/utils/mailer.js';
import ExcelJS from 'exceljs';
import {cosineSimilarity} from '../../../utils/cosine-similarity.js';
import {IDuplicateQuestionRepository} from '#root/shared/database/interfaces/IDuplicateQuestionRepository.js';
import {chatbotSimilarityLogger} from '../logger/chatbot-similarity.logger.js';
import {checkConceptDuplicate} from '#root/modules/question/aiservice/checkConceptDuplicate.js';
import {ICropRepository} from '#root/shared/database/interfaces/ICropRepository.js';
import {CHATBOT_TYPES} from '#root/modules/chatbot/types.js';
import {AUDIT_TRAILS_TYPES} from '#root/modules/auditTrails/types.js';
import {IAuditTrailsService} from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {IChatbotRepository} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {toObjectIdArray} from '#root/utils/normalizeToObjectIdArray.js';
import {checkDuplicateQuestionHelper} from '../helpers/duplicateQuestionHelper.js';
import {
  DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT,
  TOTAL_EXPERTS_LIMIT,
} from '#root/shared/constants/general.js';
import {toTitleCase} from '#root/utils/ToTitlecase.js';
import axios from 'axios';
import {AccAgentService} from '#root/modules/acc-agent/services/AccAgentService.js';

/**
 * Module-level guard so two time-bound reallocation runs never overlap. The cron
 * fires every 2 min regardless of whether the previous run (and its detached
 * persistence workers) finished; without this lock an in-flight assignment that
 * hasn't been written yet still looks "free" in the DB and gets double-allocated.
 */
let isReallocatingTimeBound = false;

/** Same guard as above, for the manual (AGRI_EXPERT/OUTREACH) single-allocation cron. */
let isReallocatingManual = false;

@injectable()
export class QuestionService extends BaseService implements IQuestionService {
  constructor(
    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.AccAgentService)
    private readonly accAgentService: AccAgentService,

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

    @inject(GLOBAL_TYPES.UserService)
    private readonly userService: UserService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {
    super(mongoDatabase);
  }

  /**
   * Helper function to truncate question text for notifications
   */
  private truncateQuestionText(
    questionText: string,
    maxLength: number = 50,
  ): string {
    if (!questionText) return 'Question';
    if (questionText.length <= maxLength) return questionText;
    return questionText.substring(0, maxLength) + '...';
  }

  async createBulkQuestions(
    userId: string,
    questions: any[],
    isOutreachQuestion?: boolean,
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
      let normalised_crop: string | undefined;
      if (rawCropName.trim()) {
        const cacheKey = rawCropName.trim().toLowerCase();
        if (cropCache.has(cacheKey)) {
          normalised_crop = cropCache.get(cacheKey)!;
        } else {
          try {
            const existingCrop =
              await this.cropRepository.findByNameOrAlias(rawCropName);
            if (existingCrop) {
              normalised_crop = existingCrop.name;
              cropCache.set(cacheKey, normalised_crop);
            }
            // Crop not found — omit normalised_crop; moderator must add it via Agri Tech Management.
          } catch (cropError: any) {
            console.error('Crop normalization warning:', cropError.message);
          }
        }
      }
      details.crop = rawCropName.trim();
      if (normalised_crop !== undefined)
        details.normalised_crop = normalised_crop;

      const priorityRaw = (low.priority || 'medium').toString().toLowerCase();
      const priorities = ['low', 'high', 'medium', 'critical'];
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
        source: isOutreachQuestion
          ? 'OUTREACH'
          : ((low.source || 'AGRI_EXPERT') as IQuestion['source']),
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
        return this.questionRepo.getAllocatedQuestions(
          userId,
          query,
          session,
          body,
        );
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
  ): Promise<{questions: IQuestion[]; totalPages: number}> {
    let searchEmbedding: number[] | null = null;

    if (query?.search) {
      try {
        // const embedding=[]
        // const { embedding } = await this.aiService.getEmbedding(query.search);
        // searchEmbedding = embedding;
        searchEmbedding = null;
      } catch (err) {
        console.error(
          'Embedding generation failed, falling back to normal search:',
          err,
        );
        searchEmbedding = null;
      }
    }

    return this.questionRepo.findDetailedQuestions(
      {
        ...query,
        searchEmbedding,
      },
      body,
    );
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
        agri_specialist: item.source || 'AGRI_EXPERT',
        referenceSource: 'reviewer',
      })),

      ...(questions.golden || []).map((item: any) => ({
        question: item.question,
        answer: item.answer,
        agri_specialist: item.metadata?.['Agri Specialist'] || 'Unknown',
        referenceSource: 'golden',
      })),

      ...(questions.pop || []).map((item: any) => ({
        question: 'Reference Information',
        answer: item.text,
        agri_specialist: 'POP_DOCUMENT',
        referenceSource: 'pop',
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

  /**
   * Generate questions from call context (audio transcription)
   */
  async getQuestionFromCallContext(
    context: string,
    state?: string,
    crop?: string,
  ): Promise<GeneratedQuestionResponse[]> {
    try {
      const payload: any = {query: context};
      if (state) payload.state = state;
      if (crop) payload.crop = crop;

      const agentSearchResponse = await axios.post(
        'http://100.100.108.44:6002/search',
        payload,
        {timeout: 100000},
      );
      console.log(
        'Agent Search Output:',
        JSON.stringify(agentSearchResponse.data, null, 2),
      );

      const data = agentSearchResponse.data || {};

      // Send this in the appropriate format expected by the frontend
      let formattedResponse: any[] = [];

      if (
        data &&
        (Array.isArray(data.reviewer) ||
          Array.isArray(data.golden) ||
          Array.isArray(data.pop))
      ) {
        formattedResponse = [
          ...(data.reviewer || []).map((item: any) => ({
            question: item.question,
            answer: item.answer || item.text,
            agri_specialist:
              item.agri_expert ||
              item.agri_specialist ||
              item.source ||
              'AGRI_EXPERT',
            referenceSource: 'reviewer',
            id: item.id || new ObjectId().toString(),
          })),
          ...(data.golden || []).map((item: any) => ({
            question: item.question,
            answer: item.answer || item.text,
            agri_specialist:
              item.agri_expert ||
              item.agri_specialist ||
              item.metadata?.['Agri Specialist'] ||
              'Unknown',
            referenceSource: 'golden',
            id: item.id || new ObjectId().toString(),
          })),
          ...(data.pop || []).map((item: any) => ({
            question: 'Reference Information',
            answer: item.text,
            agri_specialist: 'POP_DOCUMENT',
            referenceSource: 'pop',
            id: item.id || new ObjectId().toString(),
          })),
        ];
      } else if (data && Array.isArray(data.results)) {
        // Map the results array from the agent_search response
        formattedResponse = data.results.map((item: any) => ({
          question: item.question || data.extracted_question || context,
          answer: item.answer || item.text || 'Answer not available',
          agri_specialist: item.source || 'AGRI_EXPERT',
          referenceSource: 'agent_search',
          id: item.id || new ObjectId().toString(),
        }));
      } else if (Array.isArray(data)) {
        formattedResponse = data.map((item: any) => ({
          question: item.question || context,
          answer: item.answer || item.response || JSON.stringify(item),
          agri_specialist: item.agri_specialist || item.source || 'AGRI_EXPERT',
          referenceSource: item.referenceSource || 'agent_search',
          id: item.id || new ObjectId().toString(),
        }));
      } else if (data && typeof data === 'object') {
        formattedResponse = [
          {
            question: data.extracted_question || data.question || context,
            answer: data.answer || data.response || JSON.stringify(data),
            agri_specialist:
              data.agri_specialist || data.source || 'AGRI_EXPERT',
            referenceSource: data.referenceSource || 'agent_search',
            id: data.id || new ObjectId().toString(),
          },
        ];
      }

      // Deduplicate by question text
      const uniqueQuestions = Array.from(
        new Map(formattedResponse.map(q => [q.question, q])).values(),
      ).map(q => ({
        ...q,
        id: q.id || new ObjectId().toString(),
      }));

      return uniqueQuestions;
    } catch (error) {
      console.error('Failed to generate questions from call context:', error);
      throw new InternalServerError(
        'Failed to generate questions from call context',
      );
    }
  }

  async getCallSummary(query: string): Promise<any> {
    try {
      const extractResponse = await axios.post(
        'http://100.100.108.44:6002/extract',
        {query},
        {timeout: 100000},
      );
      return extractResponse.data;
    } catch (error) {
      console.error('Failed to generate call summary:', error);
      throw new InternalServerError('Failed to generate call summary');
    }
  }

  /**
   * HIL Flow: Create thread for ACC Agent
   */
  async createAccAgentThread(): Promise<{thread_id: string}> {
    try {
      const result = await this.accAgentService.createThread();
      return result;
    } catch (error) {
      console.error('[QuestionService] createAccAgentThread: Error', error);
      throw new InternalServerError('Failed to create ACC Agent thread');
    }
  }

  /**
   * HIL Flow: Extract data from transcript
   */
  async extractAccAgentData(
    threadId: string,
    transcript: string,
  ): Promise<{
    extracted_query: string;
    extracted_crop: string;
    extracted_state: string;
    extracted_district: string;
  }> {
    try {
      const result = await this.accAgentService.extractData(
        threadId,
        transcript,
      );
      return result;
    } catch (error) {
      console.error('[QuestionService] extractAccAgentData: Error', error);
      throw new InternalServerError('Failed to extract data using ACC Agent');
    }
  }

  /**
   * HIL Flow: Update state with human corrections
   */
  async updateAccAgentState(
    threadId: string,
    correctedData: {
      query: string;
      crop: string;
      state: string;
      district: string;
    },
  ): Promise<void> {
    try {
      await this.accAgentService.updateState(threadId, correctedData);
    } catch (error) {
      console.error('[QuestionService] updateAccAgentState: Error', error);
      throw new InternalServerError('Failed to update ACC Agent state');
    }
  }

  /**
   * HIL Flow: Resume and get final answer
   */
  async resumeAccAgentAndGetAnswer(
    threadId: string,
  ): Promise<{final_answer: string}> {
    try {
      const result = await this.accAgentService.resumeAndGetAnswer(threadId);
      return result;
    } catch (error) {
      console.error(
        '[QuestionService] resumeAccAgentAndGetAnswer: Error',
        error,
      );
      throw new InternalServerError(
        'Failed to get final answer from ACC Agent',
      );
    }
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

  // Reusable duplicate detection helper.

  async checkDuplicateQuestion(
    baseQuestion: IQuestion,
    details: IQuestion['details'],
    logData: Record<string, any>,
    session?: ClientSession,
  ): Promise<{
    isDuplicate: boolean;
    duplicateData?: any;
    isNonAgri?: boolean;
    nonAgriData?: any;
  }> {
    return checkDuplicateQuestionHelper(
      baseQuestion,
      details,
      logData,
      this.aiService,
      this.duplicateQuestionRepository,
      session,
    );
  }

  async manualCheckDuplicate(questionId: string): Promise<{
    message: string;
    isDuplicate: boolean;
    referenceQuestionId?: string;
  }> {
    const question = await this.questionRepo.getById(questionId);

    if (question.referenceQuestionId) {
      return {
        message: 'Question already has a reference question assigned.',
        isDuplicate: true,
      };
    }

    const logData: Record<string, any> = {questionId, manual: true};
    const result = await this.runDuplicateCheckPipeline(
      question,
      question.details,
      logData,
    );

    if (result.isDuplicate) {
      const refId =
        result.referenceQuestionId instanceof ObjectId
          ? result.referenceQuestionId
          : result.referenceQuestionId
            ? new ObjectId(String(result.referenceQuestionId))
            : null;
      // Only flip the status to 'duplicate' when the question is still open/delayed.
      // For any other status (in-review, closed, etc.) the workflow is already past
      // that point, so the status must not change — we just record the reference.
      const canMarkDuplicate =
        question.status === 'open' || question.status === 'delayed';
      await this.questionRepo.updateQuestion(questionId, {
        ...(canMarkDuplicate ? {status: 'duplicate'} : {}),
        similarityScore: result.similarityScore,
        referenceQuestionId: refId,
        referenceQuestion: result.referenceQuestion,
        referenceSource: result.referenceSource,
        isDuplicateChecked: true,
        ...(result.isExact !== undefined ? {isExact: result.isExact} : {}),
      });
      return {
        message: canMarkDuplicate
          ? 'Duplicate detected and question updated.'
          : `Duplicate detected; status left unchanged (question is '${question.status}').`,
        isDuplicate: true,
        referenceQuestionId: refId?.toString(),
      };
    }

    if (result.isNonAgri) {
      await this.questionRepo.updateQuestion(questionId, {
        status: 'non_agri',
        isDuplicateChecked: true,
      });
      return {message: 'Question marked as non-agri.', isDuplicate: false};
    }

    await this.questionRepo.updateQuestion(questionId, {
      isDuplicateChecked: true,
    });
    return {message: 'No duplicate found.', isDuplicate: false};
  }

  private async runDuplicateCheckPipeline(
    baseQuestion: IQuestion,
    details: IQuestion['details'],
    logData: Record<string, any>,
  ): Promise<{
    isDuplicate: boolean;
    isNonAgri?: boolean;
    referenceQuestionId?: ObjectId | string | null;
    referenceQuestion?: string;
    referenceSource?: string;
    similarityScore?: number;
    isExact?: boolean;
  }> {
    const cropName =
      typeof details.crop === 'string'
        ? details.crop
        : (details.crop as any)?.name || '';

    const gdbResult = await this.aiService.searchGdb({
      crop: cropName,
      state: details.state,
      rephrased_query: baseQuestion.question,
    });

    console.log('[runDuplicateCheckPipeline] gdbResult:', gdbResult);

    const extractObjectId = (id: any): ObjectId | null => {
      const raw = id?.$oid ?? id;
      const hex = String(raw ?? '');
      if (/^[a-f\d]{24}$/i.test(hex)) return new ObjectId(hex);
      return null;
    };

    const exactMatch = gdbResult?.exact_match;
    if (exactMatch?.question_id) {
      const refId = extractObjectId(exactMatch.question_id);
      if (refId) {
        return {
          isDuplicate: true,
          referenceQuestionId: refId,
          referenceQuestion: exactMatch.question,
          referenceSource: 'reviewer',
          similarityScore: Number(
            (exactMatch.similarity_score * 100).toFixed(2),
          ),
          isExact: true,
        };
      }
      console.warn(
        `[runDuplicateCheckPipeline] GDB exact_match invalid question_id: ${exactMatch.question_id}, skipping`,
      );
    }

    const selectedMatch = gdbResult?.selected_match;
    if (selectedMatch?.question_id) {
      const refId = extractObjectId(selectedMatch.question_id);
      if (refId) {
        return {
          isDuplicate: true,
          referenceQuestionId: refId,
          referenceQuestion: selectedMatch.question,
          referenceSource: 'reviewer',
          similarityScore: Number(
            (selectedMatch.similarity_score * 100).toFixed(2),
          ),
          isExact: false,
        };
      }
      console.warn(
        `[runDuplicateCheckPipeline] GDB selected_match invalid question_id: ${selectedMatch.question_id}, skipping`,
      );
    }

    // No GDB match — call LLM directly to classify non-agri vs agri (no embedding search)
    try {
      const llmResult = await checkConceptDuplicate(baseQuestion.question, []);
      if (llmResult.isNonAgri) {
        logData.outcome = 'NON_AGRI_DETECTED';
        chatbotSimilarityLogger.warn('ADD_QUESTION_LOG', logData);
        return {isDuplicate: false, isNonAgri: true};
      }
    } catch (llmError: any) {
      console.warn(
        `[runDuplicateCheckPipeline] LLM non-agri check failed, treating as agri: ${llmError?.message}`,
      );
    }

    return {isDuplicate: false};
  }

  async addQuestion(
    userId: string,
    body: AddQuestionBodyDto,
  ): Promise<AddQuestionResult> {
    const logData: Record<string, any> = {};
    try {
      // Extract fields before normalizing keys to lowercase
      const aiInitialAnswer = body.aiInitialAnswer || '';
      const messageIdFromBody = body.messageId;
      const threadIdFromBody = body.threadId;
      const userIdFromBody = body.userId;
      const referenceQuestionDetailsFromBody = body.referenceQuestionDetails;
      const popContextFromBody = body.popContext;
      const toolsUsed = body.tools_used || [];
      body = normalizeKeysToLower(body);

      let {
        question,
        priority,
        source = 'AGRI_EXPERT',
        details,
        context,
        originalquestion = '',
      } = body;
      if (body.details) {
        body.details.state = toTitleCase(body.details.state);
        body.details.crop = toTitleCase(body.details.crop as string);
        body.details.domain = Array.isArray(body.details.domain)
          ? body.details.domain
          : body.details.domain
            ? [body.details.domain]
            : [];
      }
      const messageId = messageIdFromBody;
      const threadId = threadIdFromBody;
      const bodyUserId = userIdFromBody;
      const referenceQuestionDetails = referenceQuestionDetailsFromBody;
      const popContext = popContextFromBody;

      if (!details) {
        const b: any = body;
        details = {
          state: b?.state || '',
          district: b?.district || '',
          crop: b?.crop || '',
          season: b?.season || '',
          domain: Array.isArray(b?.domain)
            ? b.domain
            : b?.domain
              ? [b.domain]
              : [],
        };
      }

      const validPriorities = ['low', 'medium', 'high', 'critical'];
      priority = priority?.toLowerCase() as IQuestion['priority'];
      if (!validPriorities.includes(priority)) {
        priority = 'medium';
      }
      if (source === 'AJRASAKHA' || source === 'WHATSAPP') {
        priority = 'high';
      }

      if (!question?.trim()) {
        throw new BadRequestError(`Question is required`);
      }

      if (
        !(typeof details.crop === 'string'
          ? details.crop.trim()
          : details.crop?.name?.trim()) ||
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
      const rawCropName =
        typeof details.crop === 'string'
          ? details.crop
          : details.crop?.name || '';
      let normalised_crop: string | undefined;
      if (rawCropName.trim()) {
        try {
          const existingCrop =
            await this.cropRepository.findByNameOrAlias(rawCropName);
          if (existingCrop) {
            normalised_crop = existingCrop.name;
            logData.cropNormalization = {
              original: rawCropName,
              resolved: existingCrop.name,
              action:
                rawCropName.trim().toLowerCase() === existingCrop.name
                  ? 'EXACT_MATCH'
                  : 'ALIAS_RESOLVED',
            };
          } else {
            // Crop not found — omit normalised_crop; moderator must add it via Agri Tech Management.
            logData.cropNormalization = {
              original: rawCropName,
              action: 'NOT_FOUND',
            };
          }
        } catch (cropError: any) {
          console.error('Crop normalization warning:', cropError.message);
          logData.cropNormalizationError = cropError.message;
        }
      }
      details.crop = rawCropName.trim();
      if (normalised_crop !== undefined)
        details.normalised_crop = normalised_crop;

      // 🔹 Create Embedding — OUTSIDE transaction
      const text = `Question: ${question}`;
      let textEmbedding: number[] = [];

      if (appConfig.ENABLE_AI_SERVER) {
        const {embedding} = await this.aiService.getEmbedding(text);
        textEmbedding = embedding;
      }
      logData.embeddingGenerated = textEmbedding.length > 0;
      logData.vectorLength = textEmbedding.length;

      return this._withTransaction(async (session: ClientSession) => {
        // 🔹 Create Context
        let contextId: ObjectId | null = null;

        if (context) {
          const {insertedId} = await this.contextRepo.addContext(
            context,
            session,
          );
          contextId = new ObjectId(insertedId);
        }
        // 🔹 Create Base Question Object
        const baseQuestion: IQuestion = {
          userId:
            bodyUserId?.trim() || userId?.trim()
              ? new ObjectId(bodyUserId?.trim() || userId)
              : null,
          question,
          priority,
          source,
          status:
            source === 'AJRASAKHA' || source === 'WHATSAPP'
              ? 'pending'
              : 'open',
          totalAnswersCount: 0,
          contextId,
          details,
          isAutoAllocate: !(source === 'AJRASAKHA' || source === 'WHATSAPP'),
          embedding: textEmbedding,
          metrics: null,
          aiInitialAnswer,
          text,
          toolsUsed,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(source !== 'AGRI_EXPERT' && {originalQuestion: originalquestion}),
          ...(messageId && {messageId}),
          ...(threadId && {threadId}),
          ...(referenceQuestionDetails?.length && {referenceQuestionDetails}),
          ...(popContext && {popContext}),
        };

        // 🔹 Save question
        logData.outcome = 'NEW_QUESTION_ADDED';
        chatbotSimilarityLogger.info('ADD_QUESTION_LOG', logData);
        const savedQuestion = await this.questionRepo.addQuestion(
          baseQuestion,
          session,
        );

        if (!savedQuestion?._id) {
          throw new InternalServerError(`Failed to save question to database`);
        }
        /* if(!body.threadId)
        {
           await this.questionRepo.updateQuestion(savedQuestion._id.toString(), {
              isTesting: true,
            });
          return
        }*/

        // 🔹 Create bare submission record (expert queue populated in background)
        const submissionData: IQuestionSubmission = {
          questionId: new ObjectId(savedQuestion._id.toString()),
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

        // 🔹 Kick off background processing (duplicate check, expert allocation, notifications)
        const questionId = savedQuestion._id.toString();
        setImmediate(() => {
          this.processQuestionInBackground({
            questionId,
            source,
            details,
            baseQuestion: {...baseQuestion, _id: savedQuestion._id},
            logData,
          }).catch((err: any) =>
            console.error(
              `[addQuestion] Background processing failed for questionId=${questionId}:`,
              err?.message,
            ),
          );
        });

        return {
          data: {
            ...baseQuestion,
            _id: questionId,
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

  private async processQuestionInBackground(params: {
    questionId: string;
    source: IQuestion['source'];
    details: IQuestion['details'];
    baseQuestion: IQuestion;
    logData: Record<string, any>;
  }): Promise<void> {
    const {questionId, source, details, baseQuestion, logData} = params;
    try {
      if (source === 'AGRI_EXPERT') {
        // Manual single-allocation: AGRI_EXPERT questions are no longer bulk-allocated
        // on creation. They are left unallocated (empty queue, no firstAllocationAt)
        // and picked up one-at-a-time by the manual single-allocation cron
        // (reallocateManualQuestions), mirroring the time-bound flow.
        console.log(
          `[ManualSingle] Question ${questionId} left for single-allocation cron (source=AGRI_EXPERT)`,
        );
      } else {
        const isTimeBoundedQuestion =
          source === 'AJRASAKHA' || source === 'WHATSAPP';
        let threadValidation;
        if (isTimeBoundedQuestion) {
          threadValidation = await this.validateTimeBoundQuestionThread(
            questionId,
            baseQuestion.threadId,
          );
          console.log('threadValidation ', threadValidation);
          if (!threadValidation.isValid) {
            console.log('Npt valid');
            logData.outcome = 'TESTING_THREAD_ID';
            logData.threadValidationReason = threadValidation.reason;
            chatbotSimilarityLogger.warn('ADD_QUESTION_LOG', logData);

            await this.questionRepo.updateQuestion(questionId, {
              isTesting: true,
            });
            return;
          }
          /* else {
             // Extract the last GDB tool response from thread content
             const content: any[] = threadValidation.data?.content || [];
             const gdbToolCalls = content.filter(
               (c: any) => c.type === 'tool' && c.toolName === 'gdb' && c.toolResponse,
             );
             const lastGdbResponse = gdbToolCalls.length > 0
               ? gdbToolCalls[gdbToolCalls.length - 1].toolResponse
               : null;
 
             if (lastGdbResponse) {
               const isExact: boolean = lastGdbResponse.is_exact === true;
               const isSimilar: boolean = lastGdbResponse.is_similar === true;
 
               if (isExact && !isSimilar) {
                 // Exact match found in GDB — mark as duplicate using exact_match data
                 const exactMatch = lastGdbResponse.exact_match;
                 await this.questionRepo.updateQuestion(questionId, {
                   status: 'duplicate',
                   similarityScore: Number((exactMatch.similarity_score * 100).toFixed(2)),
                   referenceQuestionId: new ObjectId(String(exactMatch.question_id)),
                   referenceQuestion: exactMatch.question,
                   referenceSource: 'reviewer',
                   isExact: true,
                 });
                 return;
               } else if (!isExact && isSimilar) {
                 // Similar match found in GDB — mark as duplicate using similar_pair1 data
                 const similarPair = lastGdbResponse.similar_pair1;
                 await this.questionRepo.updateQuestion(questionId, {
                   status: 'duplicate',
                   similarityScore: Number((similarPair.similarity_score * 100).toFixed(2)),
                   referenceQuestionId: new ObjectId(String(similarPair.question_id)),
                   referenceQuestion: similarPair.question,
                   referenceSource: 'reviewer',
                   isExact: false,
                 });
                 return;
               }
               // Both false — fall through to existing duplicate check below
             }
           }*/

          //check for the question is dynamic or static + dynamic
          // const isDynamicTools = !baseQuestion?.details?.tools_used?.includes('knowledge_base')
          // const isDesclaimer = threadValidation?.data.content.find((item:any)=>item?.type === 'ai' && item?.text.includes("You will get the answer within 2 hours"))

          // const isStaticAndDynamic =!isDynamicTools && baseQuestion?.details?.tools_used?.length>1
          // const isDynamic = isDynamicTools && !isDesclaimer;

          //dynamic conditon: if the tools used only contains dynamic tools and there will be a proper answer
          //static+dynamic conditon: if the tools used contains dynamic and static tools and there will not be a proper answer
          // if (isDynamic) {
          //   await this.questionRepo.updateQuestion(questionId, {
          //     tag: 'dynamic',
          //     status: 'dynamic'
          //   });
          //   return;
          // } else if (isStaticAndDynamic && isDesclaimer) {
          //   await this.questionRepo.updateQuestion(questionId, {
          //     status: 'open',
          //     tag: 'static_dynamic',
          //     isAutoAllocate:true,
          //   });
          //   return
          // }

          const toolsUsed = baseQuestion?.details?.tools_used ?? [];
          const hasKnowledgeBase = toolsUsed.includes('knowledge_base');
          const hasDynamicTool = toolsUsed.some(
            tool => tool !== 'knowledge_base',
          );
          const isDisclaimer = threadValidation?.data.content.some(
            (item: any) =>
              item?.type === 'ai' &&
              item?.text?.includes('You will get the answer within 2 hours'),
          );
          const isDynamic =
            !hasKnowledgeBase && hasDynamicTool && !isDisclaimer;
          const isStaticAndDynamic =
            (hasKnowledgeBase && hasDynamicTool) ||
            (!hasKnowledgeBase && hasDynamicTool && isDisclaimer);
          if (isDynamic) {
            await this.questionRepo.updateQuestion(questionId, {
              tag: 'dynamic',
              status: 'dynamic',
            });
            return;
          }

          if (isStaticAndDynamic) {
            await this.questionRepo.updateQuestion(questionId, {
              status: 'open',
              tag: 'static_dynamic',
              isAutoAllocate: true,
            });
            return;
          }
          // AJRASAKHA / WHATSAPP — GDB → embedding → LLM duplicate/non-agri pipeline
          try {
            const result = await this.runDuplicateCheckPipeline(
              baseQuestion,
              details,
              logData,
            );

            if (result.isDuplicate) {
              const refId =
                result.referenceQuestionId instanceof ObjectId
                  ? result.referenceQuestionId
                  : result.referenceQuestionId
                    ? new ObjectId(String(result.referenceQuestionId))
                    : null;
              await this.questionRepo.updateQuestion(questionId, {
                status: 'duplicate',
                similarityScore: result.similarityScore,
                referenceQuestionId: refId,
                referenceQuestion: result.referenceQuestion,
                referenceSource: result.referenceSource,
                ...(result.isExact !== undefined
                  ? {isExact: result.isExact}
                  : {}),
              });
              return;
            }

            if (result.isNonAgri) {
              await this.questionRepo.updateQuestion(questionId, {
                status: 'non_agri',
              });
              return;
            }

            await this.questionRepo.updateQuestion(questionId, {
              status: 'open',
              isAutoAllocate: true,
            });
          } catch (pipelineError: any) {
            console.error(
              '[processQuestionInBackground] Duplicate check pipeline failed, proceeding as open:',
              pipelineError?.message,
            );
            await this.questionRepo.updateQuestion(questionId, {
              status: 'open',
              isAutoAllocate: true,
            });
          }
        }

        const [allModerators, taskForceModerators] = await Promise.all([
          this.userRepo.findModerators(),
          this.userRepo.getSpecialTaskForceModerators(),
        ]);
        const sourceLabel = source === 'AJRASAKHA' ? 'Ajrasakha' : 'WhatsApp';
        const message = `A new question has been received from ${sourceLabel} and needs your attention.`;
        const notificationType =
          source === 'AJRASAKHA'
            ? 'question_from_ajrasakha'
            : 'question_from_whatsapp';

        await Promise.all(
          [...allModerators, ...taskForceModerators].map((moderator: any) =>
            this.notificationService.saveTheNotifications(
              message,
              'New Question Received',
              questionId,
              moderator._id.toString(),
              notificationType,
            ),
          ),
        );

        // Time-bound expert allocation is handled exclusively by the
        // reallocateTimeBoundQuestions cron to avoid double-allocation races.
      }
    } catch (error: any) {
      console.error(
        `[processQuestionInBackground] Failed for questionId=${questionId}:`,
        error?.message,
      );
    }
  }

  private async validateTimeBoundQuestionThread(
    questionId: string,
    threadId?: string,
  ): Promise<{isValid: boolean; reason?: string; data?: any}> {
    if (!threadId?.trim()) {
      return {isValid: false, reason: 'THREAD_ID_MISSING'};
    }

    // Retry with backoff — the external thread system may not have the data
    // ready immediately after question creation (race between add and processing).
    const retryDelaysMs = [3000, 6000, 12000];
    let lastError: any;
    let hadSuccessfulApiCall = false;

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
      if (attempt > 0) {
        const delay = retryDelaysMs[attempt - 1];
        console.log(
          `[validateTimeBoundQuestionThread] Retry ${attempt}/${retryDelaysMs.length} for questionId=${questionId} after ${delay}ms`,
        );
        await new Promise<void>(resolve => setTimeout(resolve, delay));
      }

      try {
        const matchedQuestion = await this.getMatchedQuestion(questionId);
        hadSuccessfulApiCall = true; // API responded (even if no match returned)
        if (matchedQuestion) {
          return {isValid: true, data: matchedQuestion};
        }
      } catch (error: any) {
        const notFoundMessages = [
          'No matching WhatsApp message found',
          'Question not found',
          'Thread id not found',
        ];
        const isNotFound = notFoundMessages.some(msg =>
          error?.message?.includes(msg),
        );
        if (isNotFound) {
          hadSuccessfulApiCall = true; // API reachable — question simply not present yet
        }
        lastError = error;
        console.warn(
          `[validateTimeBoundQuestionThread] Attempt ${attempt + 1}/${retryDelaysMs.length + 1} failed for questionId=${questionId}: ${error?.message}`,
        );
      }
    }

    console.error(
      `[validateTimeBoundQuestionThread] All attempts exhausted for questionId=${questionId}:`,
      lastError?.message,
    );

    // API responded but found no match → question is a test, mark isTesting
    if (hadSuccessfulApiCall) {
      return {isValid: false, reason: 'Thread_id_not_found'};
    }

    // All attempts threw errors (API failure) → don't mark isTesting, proceed normally
    return {isValid: true, reason: lastError?.message || 'API_FAILED'};
  }

  async getQuestionDataById(questionId: string): Promise<IQuestion | null> {
    try {
      const question = await this.questionRepo.getById(questionId);
      if (!question) return null;
      return question;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  /**
   * Resolve a question's normalised crop. If it's already set, return it. Otherwise
   * try to resolve it from the crop master using the raw crop (same lookup used at
   * question creation) and persist it on the question, so a crop registered in Agri
   * Tech Management after the question was created (or missed by the backfill, which
   * skips empty-string values and non-matching spellings) doesn't block approval.
   * Returns the normalised crop name, or null if the raw crop isn't registered.
   */
  async ensureNormalisedCrop(
    questionId: string,
    session?: ClientSession,
  ): Promise<string | null> {
    const question = await this.questionRepo.getById(questionId, session);
    const existing = question.details?.normalised_crop?.trim();
    if (existing) return existing;

    const rawCrop =
      typeof question.details?.crop === 'string'
        ? question.details.crop
        : (question.details?.crop as any)?.name;
    if (!rawCrop?.trim()) return null;

    const resolved = await this.cropRepository.findByNameOrAlias(rawCrop);
    if (!resolved?.name) return null;

    await this.questionRepo.updateQuestion(
      questionId,
      {'details.normalised_crop': resolved.name} as any,
      session,
    );
    return resolved.name;
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

        let aiApprovedSources = currentQuestion.aiApprovedSources;

        // Backward compatibility: old DB still has aiApprovedAnswer
        if (!aiInitialAnswer && currentQuestion.aiApprovedAnswer) {
          aiInitialAnswer = currentQuestion.aiApprovedAnswer;
        }

        // Existing fallback (keep this)
        if (
          currentQuestion.source === 'AJRASAKHA' &&
          !aiInitialAnswer &&
          answers &&
          answers.length > 0
        ) {
          aiInitialAnswer = answers[0].answer;
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
    threadUpdate?: boolean,
  ): Promise<{modifiedCount: number}> {
    try {
      // ─── Normalize crop against crop_master DB (mirrors addQuestion logic) ───
      // Lifted OUTSIDE the transaction: cropRepository calls don't use the session,
      // so they shouldn't inflate the transaction scope.
      if (updates.details) {
        if (updates.details.state) {
          updates.details.state = toTitleCase(updates.details.state);
        }
        if (updates.details.district) {
          updates.details.district = toTitleCase(updates.details.district);
        }
        if (updates.details?.crop) {
          const rawCropName =
            typeof updates.details.crop === 'string'
              ? updates.details.crop
              : (updates.details.crop as any)?.name || '';
          const cleanCropName = toTitleCase(rawCropName);
          let normalised_crop = cleanCropName.toLowerCase();
          if (rawCropName.trim()) {
            try {
              const existingCrop =
                await this.cropRepository.findByNameOrAlias(rawCropName);
              if (existingCrop) {
                normalised_crop = existingCrop.name;
              } else {
                // Crop not found — auto-create it
                // const normalizedName = rawCropName.trim().toLowerCase();
                await this.cropRepository.createCrop(cleanCropName, '', []);
                normalised_crop = cleanCropName;
              }
            } catch (cropError: any) {
              console.error(
                'Crop normalization warning (updateQuestion):',
                cropError.message,
              );
            }
          }
          updates.details.crop = cleanCropName;
          updates.details.normalised_crop = normalised_crop;
        }
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
        if (threadUpdate) {
          return await this.questionRepo.updateThreadId(
            questionId,
            updates.threadId!,
            session,
          );
        }
        // When a question is passed, remove it from any moderator's assignedQuestionIds
        // so the cron sees them as available again. Keyed by questionId so a
        // malformed/missing moderatorId can't leave an orphan entry behind.
        if (updates.status === 'pass') {
          // Check for pending allocations before allowing pass
          const questionSubmission =
            await this.questionSubmissionRepo.getByQuestionId(
              questionId,
              session,
            );

          if (questionSubmission) {
            const queueLength = questionSubmission.queue.length;
            const historyLength = questionSubmission.history.length;

            // Condition 1: queue.length > 0 and history.length == 0
            // This means it is assigned but not completed
            if (queueLength > 0 && historyLength === 0) {
              throw new BadRequestError(
                'Cannot pass the question. There is a pending reviewer allocation. Please remove the pending reviewer before passing the question.',
              );
            }

            // Condition 2: queue.length > 0 and history.length > 0
            // Check if the last history item status is 'in-review' AND question status is NOT 'in-review'
            if (queueLength > 0 && historyLength > 0) {
              const lastHistoryItem =
                questionSubmission.history[historyLength - 1];
              if (
                lastHistoryItem.status === 'in-review' &&
                existingQuestion.status !== 'in-review'
              ) {
                throw new BadRequestError(
                  'Cannot pass the question. There is a pending reviewer allocation. Please remove the pending reviewer before passing the question.',
                );
              }
            }
          }

          try {
            await this.userRepo.removeAssignedQuestionFromAllModerators(
              questionId,
              session,
            );
          } catch (err: any) {
            console.error(
              '[ModeratorQueue] Failed to clear passed question from moderators:',
              err?.message,
            );
          }
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
    BATCH_EXPECTED_TO_ADD: number = DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT,
  ): Promise<{data?: ObjectId[]; status: boolean}> {
    const question = await this.questionRepo.getById(questionId, session);
    if (!question) throw new NotFoundError('Question not found');

    if (
      question.status === 'in-review' ||
      question.status === 'closed' ||
      question.status == 'pae_submitted'
    ) {
      console.log(
        'This question is currently being reviewed or has been closed. Please check back later!',
      );
      return {data: [], status: false};
    }
    // Single-allocation sources (time-bound AJRASAKHA/WHATSAPP and manual
    // AGRI_EXPERT/OUTREACH) are managed by the single-allocation cron — bulk
    // auto-allocation is disabled for them here.
    const isSingleAllocation =
      TIME_BOUND_SOURCES.includes(question.source) ||
      MANUAL_SOURCES.includes(question.source);
    if (isSingleAllocation) {
      const reason = `Auto-allocation is disabled for single-allocation questions (source: ${question.source})`;
      console.log(
        `[autoAllocateExperts] ${reason} — questionId: ${questionId}`,
      );
      return {data: [], status: false};
    }
    if (question.status == 'draft') {
      await this.questionRepo.updateQuestion(
        questionId,
        {
          status: 'open',
        },
        session,
      );
    }

    const details = question.details as PreferenceDto;

    const questionSubmission =
      await this.questionSubmissionRepo.getByQuestionId(questionId, session);

    if (!questionSubmission) {
      throw new NotFoundError('Question submission not found');
    }

    // checking last submission in history to see if there is an expert who has not yet responded and if !lastSubmission.answer is added to ensure that we are not blocking the queue in case of reviewers who are just reviewing the answer without providing any answers
    const lastSubmission = questionSubmission.history.at(-1);
    if (
      lastSubmission &&
      lastSubmission.status === 'in-review' &&
      !lastSubmission.answer
    ) {
      return {data: [], status: false};
    }

    const EXISTING_QUEUE_COUNT = questionSubmission.queue.length || 0;
    const EXISTING_HISTORY_COUNT = questionSubmission.history.length || 0;

    if (EXISTING_QUEUE_COUNT >= TOTAL_EXPERTS_LIMIT) {
      console.log('Cannot auto allocate as queue is full');
      return {data: [], status: false};
    }

    let allExpertIds: string[] = [];
    const isAjrasakha = question.source == 'AJRASAKHA' ? true : false;
    if (isAjrasakha) {
      const users = await this.userRepo.getExpertsWithFallback(
        details,
        session,
      );

      allExpertIds = users.map(user => user._id.toString());
    } else {
      const [users, preferredExperts] = await Promise.all([
        this.userRepo.findAll(),
        this.userRepo.findExpertsByPreference(details, session),
      ]);

      const expertIdsSet = new Set<string>();

      // Add preferred experts first to the set to ensure they get priority in allocation
      preferredExperts.forEach(user => expertIdsSet.add(user._id.toString()));

      // Add remaining
      users
        .filter(user => user.role === 'expert' && user.isBlocked !== true)
        .forEach(user => expertIdsSet.add(user._id.toString()));

      allExpertIds = Array.from(expertIdsSet);
    }

    let updatedQueue;

    // condition to check if we have room in the queue to add more experts and also to ensure we are not adding more experts if there is already an expert in the queue who has not yet responded (to avoid flooding the queue with multiple experts at once and to give existing experts a chance to respond before adding more)
    if (
      EXISTING_QUEUE_COUNT < DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT ||
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
          await this.questionRepo.updateQuestion(
            questionId,
            {firstAllocationAt: new Date()},
            session,
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
          false,
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
      updatedQueue = [...questionSubmission.queue, ...(expertsToAdd || [])]
        .slice(0, TOTAL_EXPERTS_LIMIT)
        .map(id => new ObjectId(id));

      await this.questionSubmissionRepo.updateQueue(
        questionId,
        updatedQueue,
        session,
      );
    }
    return {
      data: updatedQueue,
      status: true,
    };
  }

  async toggleAutoAllocate(
    questionId: string,
  ): Promise<{message: string; data?: ObjectId[]}> {
    try {
      return this._withTransaction(async (session: ClientSession) => {
        //1. Validate question existence
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) throw new NotFoundError('Question not found');
        if (question.status == 'draft') {
          await this.questionRepo.updateQuestion(
            questionId,
            {
              status: 'open',
            },
            session,
          );
        }

        const updated = await this.questionRepo.updateAutoAllocate(
          questionId,
          question?.isAutoAllocate,
          session,
        );

        const currentStatus = question.isAutoAllocate;

        // If currentStatus is false, then we need to set it to true and vice versa
        let out;

        if (!currentStatus) {
          const questionSubmission =
            await this.questionSubmissionRepo.getByQuestionId(
              questionId,
              session,
            );

          if (!questionSubmission)
            await this.questionSubmissionRepo.addSubmission(
              {
                questionId: new ObjectId(questionId),
                lastRespondedBy: null,
                history: [],
                queue: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                reviewDelayNotificationSent: false,
              },
              session,
            );

          // const CURRENT_QUEUE_LENGTH = submission.queue.length || 0;
          // let BATCH_EXPECTED_TO_ADD = 6;

          // If removing first 3 intial allocation, so allocate only 3 intially
          // if (CURRENT_QUEUE_LENGTH < 3)
          //   BATCH_EXPECTED_TO_ADD = 3 - CURRENT_QUEUE_LENGTH;

          out = await this.autoAllocateExperts(
            questionId,
            session,
            // BATCH_EXPECTED_TO_ADD,
          );

          if (!out.status) {
            return {
              message: 'Auto allocate toggled, but queue is already full',
              data: out?.data,
            };
          }
        }

        return {
          message: `Auto allocate is now set to ${updated.isAutoAllocate}`,
          data: out?.data,
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
        if (
          question.status === 'in-review' ||
          question.status === 'closed' ||
          question.status == 'pae_submitted'
        ) {
          console.log(
            'This question is currently being in reviewed or has been closed. Please check back later!',
          );
          return;
        }
        if (question.status == 'draft') {
          // Check if any of the experts being allocated is a PAE expert
          const expertUsers = await Promise.all(
            experts.map(id => this.userRepo.findById(id, session)),
          );
          const isPaeAllocation = expertUsers.some(
            u => u?.role === 'pae_expert',
          );

          await this.questionRepo.updateQuestion(
            questionId,
            {
              status: 'open',
              ...(isPaeAllocation && {pae_review: true}),
            },
            session,
          );
        }

        //2. Validate question submission existence
        let questionSubmission =
          await this.questionSubmissionRepo.getByQuestionId(
            questionId,
            session,
          );
        // let submission
        if (!questionSubmission) {
          if (question.source == 'WHATSAPP' || question.status === 'draft') {
            const newSubmission: IQuestionSubmission = {
              questionId: new ObjectId(questionId),
              lastRespondedBy: null,
              history: [],
              queue: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            questionSubmission =
              await this.questionSubmissionRepo.addSubmission(
                newSubmission,
                session,
              );
          } else {
            throw new NotFoundError('Question submission not found');
          }
        }

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
          await this.questionRepo.updateQuestion(
            questionId,
            {firstAllocationAt: new Date()},
            session,
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
            false,
          );
        }
        //7. Update question submission with new experts
        const updated = await this.questionSubmissionRepo.allocateExperts(
          questionId,
          expertIds,
          session,
        );

        //8. For time-bound questions: start the 45-min clock.
        // NOTE: do NOT force isAutoAllocate back on here — a moderator who
        // explicitly turned auto-allocate off before assigning an expert must
        // have that choice respected (otherwise it silently re-enables on
        // refresh for AJRASAKHA/WHATSAPP questions).
        if (question.source === 'WHATSAPP' || question.source === 'AJRASAKHA') {
          // Run outside transaction (non-critical, fire-and-forget style)
          setImmediate(async () => {
            try {
              await this.questionSubmissionRepo.setCurrentExpertAllocatedAt(
                questionId,
                new Date(),
              );
            } catch (err: any) {
              console.error(
                `[allocateExperts] Failed to set time-bound fields for ${questionId}:`,
                err?.message,
              );
            }
          });
        }

        //9. Return updated question submission
        return updated;
      });
    } catch (error) {
      throw new InternalServerError(`Failed to allocate experts: ${error}`);
    }
  }

  /**
   * Bulk allocate a PAE expert to multiple existing draft questions via background worker.
   * Fires and returns immediately — the worker handles DB operations asynchronously.
   */
  async bulkAllocatePaeExperts(
    userId: string,
    questionIds: string[],
    paeExpertId: string,
  ): Promise<{jobId: string; message: string}> {
    // Validate actor and PAE expert before handing off to worker
    const actor = await this.userRepo.findById(userId);
    if (!actor) throw new UnauthorizedError('Cannot find user, try relogin!');
    if (actor.role === 'expert')
      throw new UnauthorizedError(
        "You don't have permission to perform this operation",
      );

    const paeUser = await this.userRepo.findById(paeExpertId);
    if (!paeUser) throw new BadRequestError('PAE expert not found');

    const jobId = startPaeAllocationWorker(questionIds, paeExpertId, userId);
    return {
      jobId,
      message: `PAE allocation started for ${questionIds.length} question(s). Track progress with job ID: ${jobId}`,
    };
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
      if (updated) {
        let entityId = questionId;
        let message: string = `You have been removed from the Allocated question`;
        let title: string = 'Allocation Removed';
        let type: INotificationType = 'allocation_removal';
        await this.notificationService.saveTheNotifications(
          message,
          title,
          entityId,
          expertId,
          type,
        );
      }
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
      // if (!skipAutoAllocate && index >= 0 && question.isAutoAllocate) {
      //   // Get updated queue and history lengths
      //   const UPDATED_QUEUE_LENGTH = updated?.queue.length || 0;
      //   const UPDATED_HISTORY_LENGTH = updated?.history.length || 0;
      //   let BATCH_EXPECTED_TO_ADD = 6;

      //   // Adjust batch size if initial allocation (<3) experts are being removed
      //   if (UPDATED_QUEUE_LENGTH < 3)
      //     BATCH_EXPECTED_TO_ADD = 3 - UPDATED_QUEUE_LENGTH;

      //   // If all previous experts have responded and queue is not full, trigger auto allocation
      //   if (
      //     UPDATED_QUEUE_LENGTH < 3 ||
      //     (UPDATED_HISTORY_LENGTH == UPDATED_QUEUE_LENGTH &&
      //       UPDATED_QUEUE_LENGTH < 10)
      //   ) {
      //     await this.autoAllocateExperts(
      //       questionId,
      //       session,
      //       BATCH_EXPECTED_TO_ADD,
      //     );
      //   }
      // }

      //8. Return the updated question submission
      return updated;
    } catch (error) {
      throw new InternalServerError(
        `Failed to remove expert from queue: ${error}`,
      );
    }
  }

  /**
   * Replace an expert at a specific level/index in the queue or replace the author
   * This is used when a moderator wants to reassign a delayed review to a new expert
   */
  async replaceQueueExpert(
    userId: string,
    questionId: string,
    levelIndex: number,
    newExpertId: string,
    isAuthor?: boolean,
    reasonForChange?: string,
  ): Promise<IQuestionSubmission> {
    return this._withTransaction(async (session: ClientSession) => {
      // 1. Validate question exists
      const question = await this.questionRepo.getById(questionId, session);
      if (!question) {
        console.warn(`[replaceQueueExpert] Question not found: ${questionId}`);
        throw new NotFoundError('Question not found');
      }

      // 2. Get question submission
      const questionSubmission =
        await this.questionSubmissionRepo.getByQuestionId(questionId, session);
      if (!questionSubmission) {
        console.warn(
          `[replaceQueueExpert] Question submission not found: ${questionId}`,
        );
        throw new NotFoundError('Question submission not found');
      }

      // Handle Author replacement (column 0)
      if (isAuthor) {
        // Validate new expert exists
        const newExpert = await this.userRepo.findById(newExpertId, session);
        if (!newExpert) {
          console.warn(
            `[replaceQueueExpert] New expert not found: ${newExpertId}`,
          );
          throw new NotFoundError('New expert not found');
        }

        // Get current author ID
        const currentAuthorId = questionSubmission.queue[0];

        // Check if new expert is same as current author
        if (currentAuthorId === newExpertId) {
          console.warn(
            `[replaceQueueExpert] Cannot replace - new expert is same as current author`,
          );
          throw new BadRequestError(
            'The selected expert is already the author.',
          );
        }

        // Validate reasonForChange is provided
        if (!reasonForChange || reasonForChange.trim() === '') {
          console.warn(`[replaceQueueExpert] Reason for change not provided`);
          throw new BadRequestError('Reason for reallocation is required.');
        }

        const now = new Date();

        // Check for time constraint using authors_history or submission.createdAt
        let assignmentTime = questionSubmission.createdAt || now;
        const authorsHistory = question.authors_history || [];
        if (authorsHistory.length > 0) {
          // Use the last author replacement time
          assignmentTime = authorsHistory[authorsHistory.length - 1].createdAt;
        }

        const hoursSinceAssignment =
          (now.getTime() - new Date(assignmentTime).getTime()) /
          (1000 * 60 * 60);

        if (hoursSinceAssignment < 2) {
          const remainingMinutes = Math.ceil((2 - hoursSinceAssignment) * 60);
          throw new BadRequestError(
            `Reallocation denied. At least 2 hours must pass since the author was assigned. Please wait approximately ${remainingMinutes} more minutes.`,
          );
        }

        // Create authors_history entry for the old author being replaced
        const authorsHistoryEntry: IAuthorsHistory = {
          authorId: new ObjectId(currentAuthorId!),
          newAuthorId: new ObjectId(newExpertId),
          reasonForChange: reasonForChange,
          createdAt: now,
          updatedAt: now,
        };

        // Fetch current question to get existing authors_history
        const currentQuestion = await this.questionRepo.getById(
          questionId,
          session,
        );
        const existingHistory = currentQuestion.authors_history || [];

        const questionUpdates: Partial<IQuestion> = {
          userId: new ObjectId(newExpertId),
          authors_history: [...existingHistory, authorsHistoryEntry],
        };

        if (question.isOnHold) {
          const prevAccum = question.accumulatedHoldMs ?? 0;
          let segmentMs = 0;
          if (question.holdAt) {
            segmentMs = Math.max(
              0,
              now.getTime() - new Date(question.holdAt).getTime(),
            );
          }
          questionUpdates.isOnHold = false;
          questionUpdates.status = 'open';
          questionUpdates.accumulatedHoldMs = prevAccum + segmentMs;
          questionUpdates.holdAt = null;
        }

        // Update question's userId (author) and append to authors_history
        await this.questionRepo.updateQuestion(
          questionId,
          questionUpdates,
          session,
        );

        // ALSO update the queue[0] (author position in queue) - THIS WAS MISSING!
        let updatedQueue = questionSubmission.queue;
        if (questionSubmission.queue.length > 0) {
          const oldQueueAuthor = questionSubmission.queue[0]?.toString();
          updatedQueue = questionSubmission.queue.map((id, idx) =>
            idx === 0 ? new ObjectId(newExpertId) : new ObjectId(id.toString()),
          );
        } else {
          console.warn(
            `[replaceQueueExpert] Queue is empty, cannot update queue[0]`,
          );
        }

        // Update the question submission with queue only (history unchanged for author replacement)

        const updateResult = await this.questionSubmissionRepo.updateById(
          questionSubmission._id!.toString(),
          {
            $set: {
              queue: updatedQueue,
              updatedAt: now,
            },
          },
          session,
        );

        // Also update the answer's authorId (the initial answer created with the question)
        const answers = await this.answerRepo.getByQuestionId(
          questionId,
          session,
        );
        const initialAnswer = answers.find(
          a => a.answerIteration === 0 || a.isFinalAnswer === false,
        );
        if (initialAnswer && initialAnswer._id) {
          await this.answerRepo.updateAnswer(
            initialAnswer._id.toString(),
            {authorId: new ObjectId(newExpertId)},
            session,
          );
        }

        try {
          // Prepare notification data
          const truncatedQuestionText = this.truncateQuestionText(
            question.question,
          );
          const entityId = questionId.toString();
          const type: INotificationType = 'expert_replacement';

          const replacedExpertMessage = `You have been removed from the question "${truncatedQuestionText}". Reason: ${reasonForChange}`;
          const replacedExpertTitle = 'Question Assignment Removed';

          const newExpertMessage = `You have been assigned a new question: "${truncatedQuestionText}" as the author.`;
          const newExpertTitle = 'New Question Assigned';

          // Execute all operations in parallel
          await Promise.all([
            // 1. Assign penalty to replaced expert
            this.userService.updatePenaltyAndIncentive(
              currentAuthorId!.toString(),
              'penalty',
            ),

            // 2. Assign incentive to new expert
            this.userService.updatePenaltyAndIncentive(
              newExpertId,
              'incentive',
            ),

            // 3. Send notification to replaced expert (with error handling)
            this.notificationService
              .saveTheNotifications(
                replacedExpertMessage,
                replacedExpertTitle,
                entityId,
                currentAuthorId!.toString(),
                type,
              )
              .catch(notificationError => {
                console.error(
                  `[replaceQueueExpert] ❌ Failed to send notification to replaced author: ${currentAuthorId}`,
                  notificationError,
                );
                // Return resolved promise to not break Promise.all
                return Promise.resolve();
              }),

            // 4. Send notification to new expert (with error handling)
            this.notificationService
              .saveTheNotifications(
                newExpertMessage,
                newExpertTitle,
                entityId,
                newExpertId,
                type,
              )
              .catch(notificationError => {
                console.error(
                  `[replaceQueueExpert] ❌ Failed to send notification to new expert: ${newExpertId}`,
                  notificationError,
                );
                // Return resolved promise to not break Promise.all
                return Promise.resolve();
              }),
          ]);
        } catch (penaltyError) {
          console.error(
            `[replaceQueueExpert] Penalty/incentive update failed:`,
            penaltyError,
          );
          throw new InternalServerError(
            'Failed to update penalty/incentive scores. Operation rolled back.',
          );
        }

        // Return updated submission
        return updateResult;
      }

      // Handle Queue Expert replacement (Level 1, 2, etc.) - Reallocation Logic
      // 3. Validate levelIndex is within queue bounds (convert to 0-based for queue access)
      const queueIndex = levelIndex;
      if (queueIndex < 0 || queueIndex >= questionSubmission.queue.length) {
        console.warn(
          `[replaceQueueExpert] Invalid level index: ${levelIndex}, queue has ${questionSubmission.queue.length} experts`,
        );
        throw new BadRequestError(
          `Invalid level index. Queue has ${questionSubmission.queue.length} experts.`,
        );
      }

      // Step 1: Identify Last Reviewer from history and validate queue ownership
      const lastHistoryEntry =
        questionSubmission.history[questionSubmission.history.length - 1];
      const lastReviewerInQueue = lastHistoryEntry?.updatedBy?.toString();
      const currentExpertId = questionSubmission.queue[queueIndex]?.toString();

      // Validate that the reviewer to be replaced matches the current active reviewer
      // The last reviewer in queue must be the one being replaced (validation rule)
      if (currentExpertId !== lastReviewerInQueue) {
        console.warn(
          `[replaceQueueExpert] Queue validation failed - current expert ${currentExpertId} does not match last reviewer ${lastReviewerInQueue}`,
        );
        throw new BadRequestError(
          'Reallocation denied. The reviewer to be replaced must be the last assigned reviewer in the queue.',
        );
      }

      // 4. Check if this is the current active level (only current can be replaced)
      // Current active level is determined by history length (convert to 1-based since controller sends 1-based)
      const currentActiveIndex = questionSubmission.history.length - 1;

      if (levelIndex !== currentActiveIndex) {
        console.warn(
          `[replaceQueueExpert] Cannot replace - level ${levelIndex} is not active (active: ${currentActiveIndex})`,
        );
        throw new BadRequestError(
          'Can only replace the expert at the current active level. This level has already been completed or is not yet active.',
        );
      }

      // Step 2: Fetch History and perform validations
      const submissionHistory = questionSubmission.history || [];
      const now = new Date();

      // Find the history entry for the current expert being replaced
      let currentExpertHistoryIndex = -1;
      let currentExpertHistoryEntry: ISubmissionHistory | null = null;

      for (let i = 0; i < submissionHistory.length; i++) {
        const historyEntry = submissionHistory[i];
        if (historyEntry.updatedBy.toString() === currentExpertId) {
          currentExpertHistoryIndex = i;
          currentExpertHistoryEntry = historyEntry;
          break;
        }
      }

      // Use the found history entry or create a default one for validation
      const validationHistoryEntry =
        currentExpertHistoryEntry ||
        submissionHistory[submissionHistory.length - 1];

      // Time Constraint Validation: At least 2 hours must have passed since assignment (if history exists)
      if (validationHistoryEntry) {
        const lastAssignmentTime = new Date(validationHistoryEntry.createdAt);
        const hoursSinceAssignment =
          (now.getTime() - lastAssignmentTime.getTime()) / (1000 * 60 * 60);

        if (hoursSinceAssignment < 2) {
          console.warn(
            `[replaceQueueExpert] Time constraint not met - only ${hoursSinceAssignment.toFixed(2)} hours since assignment (requires 2 hours)`,
          );
          const remainingMinutes = Math.ceil((2 - hoursSinceAssignment) * 60);
          throw new BadRequestError(
            `Reallocation denied. At least 2 hours must pass since the review was assigned. Please wait approximately ${remainingMinutes} more minutes.`,
          );
        }

        // Review Status Validation: The submission must still be in 'in-review' state
        if (validationHistoryEntry.status !== 'in-review') {
          console.warn(
            `[replaceQueueExpert] Status validation failed - current status is ${validationHistoryEntry.status}, expected 'in-review'`,
          );
          throw new BadRequestError(
            `Reallocation denied. The review status is '${validationHistoryEntry.status}'. Only reviews in 'in-review' status can be reallocated.`,
          );
        }
      }

      // Validate reasonForChange is provided
      if (!reasonForChange || reasonForChange.trim() === '') {
        console.warn(`[replaceQueueExpert] Reason for change not provided`);
        throw new BadRequestError('Reason for reallocation is required.');
      }

      // 5. Validate new expert exists
      const newExpert = await this.userRepo.findById(newExpertId, session);
      if (!newExpert) {
        console.warn(
          `[replaceQueueExpert] New expert not found: ${newExpertId}`,
        );
        throw new NotFoundError('New expert not found');
      }
      // 6. Check if new expert is already in queue
      const existingQueueIds = questionSubmission.queue.map(id =>
        id.toString(),
      );
      if (existingQueueIds.includes(newExpertId)) {
        console.warn(
          `[replaceQueueExpert] Expert ${newExpertId} already in queue`,
        );
        throw new BadRequestError(
          'The selected expert is already in the queue. Please choose another expert.',
        );
      }

      // Step 3: Create Previous Allocation Record
      const previousAllocation: IPreviousAllocations = {
        reviewerId: new ObjectId(currentExpertId!),
        reasonForChange: reasonForChange,
        createdAt: currentExpertHistoryEntry?.createdAt || now,
        updatedAt: now,
      };

      // Step 4: Update Queue - Replace the expert at the specified index
      const updatedQueue = questionSubmission.queue.map((id, idx) => {
        const shouldReplace = idx === queueIndex;
        const resultId = shouldReplace
          ? new ObjectId(newExpertId)
          : new ObjectId(id.toString());
        return resultId;
      });

      // Step 5: Build updated history with previousAllocations
      const updatedHistory = [...submissionHistory];

      if (currentExpertHistoryIndex !== -1 && currentExpertHistoryEntry) {
        // Update existing history entry with previousAllocations
        const updatedPreviousAllocations = [
          ...(currentExpertHistoryEntry.previousAllocations || []),
          previousAllocation,
        ];
        const updatedExpertHistory: ISubmissionHistory = {
          ...currentExpertHistoryEntry,
          updatedBy: new ObjectId(newExpertId), // Replace with new expert ID
          previousAllocations: updatedPreviousAllocations,
          createdAt: now, // Update both timestamps as requested
          updatedAt: now,
        };
        updatedHistory[currentExpertHistoryIndex] = updatedExpertHistory;
      } else {
        // No history entry found for current expert - create one with new expert
        const newExpertHistoryEntry: ISubmissionHistory = {
          updatedBy: new ObjectId(newExpertId), // Create with new expert directly
          status: 'in-review',
          previousAllocations: [previousAllocation],
          createdAt: now,
          updatedAt: now,
        };
        updatedHistory.push(newExpertHistoryEntry);
      }

      // Update database with queue and history changes
      const updateData: any = {
        $set: {
          queue: updatedQueue,
          history: updatedHistory,
          updatedAt: now,
        },
      };

      if (question.isOnHold) {
        const prevAccum = question.accumulatedHoldMs ?? 0;
        let segmentMs = 0;
        if (question.holdAt) {
          segmentMs = Math.max(
            0,
            now.getTime() - new Date(question.holdAt).getTime(),
          );
        }
        await this.questionRepo.updateQuestion(
          questionId,
          {
            isOnHold: false,
            status: 'open',
            accumulatedHoldMs: prevAccum + segmentMs,
            holdAt: null,
          },
          session,
        );
      }

      const updated = await this.questionSubmissionRepo.updateById(
        questionSubmission._id!.toString(),
        updateData,
        session,
      );

      try {
        // Prepare notification data
        const truncatedQuestionText = this.truncateQuestionText(
          question.question,
        );
        const entityId = questionId.toString();
        const type: INotificationType = 'expert_replacement';

        const replacedExpertMessage = `You have been removed from level ${levelIndex} review of question "${truncatedQuestionText}".`;
        const replacedExpertTitle = 'Review Assignment Removed';

        const newExpertMessage = `You have been assigned level ${levelIndex} review for question: "${truncatedQuestionText}".`;
        const newExpertTitle = 'New Review Assigned';

        // Execute all operations in parallel
        await Promise.all([
          // 1. Assign penalty to replaced expert
          this.userService.updatePenaltyAndIncentive(
            currentExpertId,
            'penalty',
          ),

          // 2. Assign incentive to new expert
          this.userService.updatePenaltyAndIncentive(newExpertId, 'incentive'),

          // 3. Send notification to replaced expert (with error handling)
          this.notificationService
            .saveTheNotifications(
              replacedExpertMessage,
              replacedExpertTitle,
              entityId,
              currentExpertId,
              type,
            )
            .catch(notificationError => {
              console.error(
                `[replaceQueueExpert] ❌ Failed to send notification to replaced expert: ${currentExpertId}`,
                notificationError,
              );
              // Return resolved promise to not break Promise.all
              return Promise.resolve();
            }),

          // 4. Send notification to new expert (with error handling)
          this.notificationService
            .saveTheNotifications(
              newExpertMessage,
              newExpertTitle,
              entityId,
              newExpertId,
              type,
            )
            .catch(notificationError => {
              console.error(
                `[replaceQueueExpert] ❌ Failed to send notification to new expert: ${newExpertId}`,
                notificationError,
              );
              // Return resolved promise to not break Promise.all
              return Promise.resolve();
            }),
        ]);
      } catch (penaltyError) {
        console.error(
          `[replaceQueueExpert] Penalty/incentive update failed for queue expert:`,
          penaltyError,
        );
        throw new InternalServerError(
          'Failed to update penalty/incentive scores. Operation rolled back.',
        );
      }

      return updated;
    });
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

      // Delete duplicate question records referencing this question
      await this.duplicateQuestionRepository.deleteByReferenceQuestionId(
        questionId,
        activeSession,
      );

      // Pull this question from any moderator's assignedQuestionIds so no orphan entry
      // is left behind keeping them wrongly "busy" after the question is gone.
      await this.userRepo.removeAssignedQuestionFromAllModerators(
        questionId,
        activeSession,
      );

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

  async bulkDeleteQuestions(userId: string, questionIds: string[]) {
    if (!questionIds || questionIds.length === 0) {
      throw new BadRequestError('No question IDs found to delete!');
    }

    const jobId = startBulkDeleteWorker(questionIds, userId);
    return {
      jobId,
      message: `Your bulk delete request for ${questionIds.length} question(s) is being processed in the background. Estimated time: ~ ${Math.ceil(questionIds.length * 0.6)} sec.`,
    };
  }

  async getQuestionFullData(
    questionId: string,
    userId: string,
  ): Promise<{
    question: IQuestion | null;
    approved_moderator: {name: string; email: string};
    assigned_moderator: {name: string; email: string} | null;
    isAssignedModerator: boolean;
  }> {
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

      let approved_moderator = {
        name: '',
        email: '',
      };
      if (question.status === 'closed') {
        const answers = await this.answerRepo.getByQuestionId(questionId);
        const finalizedAnswer = answers.find(answer => answer.isFinalAnswer);

        if (
          finalizedAnswer?.approvedBy &&
          ObjectId.isValid(finalizedAnswer.approvedBy)
        ) {
          const moderator = await this.userRepo.findById(
            finalizedAnswer.approvedBy,
          );

          if (moderator) {
            approved_moderator = {
              name: `${moderator.firstName} ${moderator.lastName}`,
              email: moderator.email,
            };
          }
        }
      }

      // Resolve the currently assigned moderator (if any). Guard against a malformed
      // moderatorId (e.g. a serialized-Buffer object that stringifies to a non-hex
      // value) so a bad value can't blow up the whole question fetch with a BSONError.
      let assigned_moderator: {name: string; email: string} | null = null;
      const assignedModeratorId = (question as any).moderatorId?.toString();
      if (assignedModeratorId && ObjectId.isValid(assignedModeratorId)) {
        const mod = await this.userRepo.findById(assignedModeratorId);
        if (mod) {
          assigned_moderator = {
            name: `${mod.firstName} ${mod.lastName ?? ''}`.trim(),
            email: mod.email,
          };
        }
      }

      // Whether the requesting user is the moderator this question is assigned to.
      // Used by the UI to gate the Pass / Accept / Push to GDB actions.
      const isAssignedModerator =
        !!assignedModeratorId && assignedModeratorId === userId;

      // Resolve user email from conversation collection using threadId
      let threadUserEmail: string | null = null;
      if (question.threadId) {
        threadUserEmail =
          await this.chatbotRepository.getUserEmailByConversationId(
            question.threadId,
          );
      }

      return {
        question: {
          ...question,
          threadUserEmail,
        },
        approved_moderator,
        assigned_moderator,
        isAssignedModerator,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to fetch question data: ${error}`);
    }
  }

  /**
   * Manually (re)assign the moderator for a question.
   * - Sets moderatorId and stamps moderatorAssignedAt to now on the question (handled in the repo).
   * - Keeps the user docs consistent with the cron: pulls this question from the previous
   *   moderator's assignedQuestionIds array and appends it to the new moderator's array.
   *   A moderator stays "busy" (not picked by the cron) as long as their array is non-empty,
   *   so manual allocation can stack multiple questions onto one moderator.
   */
  async changeQuestionModerator(
    questionId: string,
    moderatorId: string,
  ): Promise<void> {
    // Read the currently assigned moderator (if any) so we can free them.
    const question = await this.questionRepo.getById(questionId);
    const previousModeratorId = (question as any)?.moderatorId?.toString();

    // Point the question at the new moderator (also stamps moderatorAssignedAt = now).
    await this.questionRepo.updateModeratorId(questionId, moderatorId);

    // Pull this question from the previous moderator and append it to the new one,
    // carrying the question's current status so free/busy stays accurate. Guard against
    // a malformed previous moderatorId so a bad value can't throw a BSONError.
    if (
      previousModeratorId &&
      ObjectId.isValid(previousModeratorId) &&
      previousModeratorId !== moderatorId
    ) {
      await this.userRepo.removeAssignedQuestion(
        previousModeratorId,
        questionId,
      );
    }
    await this.userRepo.addAssignedQuestion(
      moderatorId,
      questionId,
      ((question as any)?.status ?? 'in-review') as QuestionStatus,
      (question as any)?.source,
    );
  }

  /**
   * Remove the moderator currently assigned to a question.
   * - Pulls this question from the assigned moderator's assignedQuestionIds array, so the
   *   cron's "is this moderator free?" check (array empty) stays accurate.
   * - Nulls moderatorId and moderatorAssignedAt on the question (handled in the repo).
   */
  async removeQuestionModerator(questionId: string): Promise<void> {
    const question = await this.questionRepo.getById(questionId);
    const previousModeratorId = (question as any)?.moderatorId?.toString();

    // Null out moderatorId and moderatorAssignedAt on the question.
    await this.questionRepo.updateModeratorId(questionId, null);

    // Pull this question from the previously assigned moderator's array. Guard against
    // a malformed previous moderatorId so a bad value can't throw a BSONError.
    if (previousModeratorId && ObjectId.isValid(previousModeratorId)) {
      await this.userRepo.removeAssignedQuestion(
        previousModeratorId,
        questionId,
      );
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
        await this.autoAllocateExperts(
          questionId.toString(),
          session,
          // 3
        );
        // }
        continue;
      }

      // let BATCH_EXPECTED_TO_ADD = 6;
      // if (UPDATED_QUEUE_LENGTH < 3) {
      //   BATCH_EXPECTED_TO_ADD = 3 - UPDATED_QUEUE_LENGTH;
      // }
      if (
        UPDATED_QUEUE_LENGTH < DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT ||
        (UPDATED_QUEUE_LENGTH === UPDATED_HISTORY_LENGTH &&
          UPDATED_QUEUE_LENGTH < 10)
      ) {
        await this.autoAllocateExperts(
          questionId.toString(),
          session,
          // BATCH_EXPECTED_TO_ADD,
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

  async balanceWorkload(
    session?: ClientSession,
    type?: string,
  ): Promise<{
    message: string;
    expertsInvolved: number;
    submissionsProcessed: number;
    inactiveExpertsFound?: number;
  }> {
    console.log(`[QuestionService] balanceWorkload called with type: ${type}`);

    // ==========================================
    // 🚩 Path 1: Inactive to Active Reallocation
    // ==========================================
    if (type === 'inactive') {
      const lessWorkloadExperts =
        await this.userRepo.findActiveLowReputationExpertsToday(session);
      console.log(
        `[QuestionService] [Path 1] Found ${lessWorkloadExperts.length} active experts for replacement`,
      );

      if (!lessWorkloadExperts.length) {
        return {
          message:
            'No active experts with low workload available for balancing',
          expertsInvolved: 0,
          submissionsProcessed: 0,
        };
      }

      const inactiveExperts =
        await this.userRepo.findInactiveOrBlockedExperts(session);
      const inactiveExpertIds = inactiveExperts.map(u => u._id.toString());

      console.log(
        `[QuestionService] [Path 1] Found ${inactiveExpertIds.length} inactive/blocked experts to clean`,
      );

      if (inactiveExpertIds.length === 0) {
        return {
          message: 'No inactive or blocked experts found',
          expertsInvolved: lessWorkloadExperts.length,
          submissionsProcessed: 0,
        };
      }

      const targetSubmissions =
        await this.questionSubmissionRepo.findSubmissionsWithExpertsInQueue(
          inactiveExpertIds,
          session,
        );
      console.log(
        `[QuestionService] [Path 1] Found ${targetSubmissions.length} active tasks owned by inactive experts`,
      );

      if (!targetSubmissions.length) {
        return {
          message: 'No active tasks found for inactive experts',
          expertsInvolved: lessWorkloadExperts.length,
          submissionsProcessed: 0,
        };
      }

      const assignments: Record<string, any[]> = {};
      const expertLoad: Record<string, number> = {};
      const MAX_PER_EXPERT = 5;

      lessWorkloadExperts.forEach(e => {
        const id = e._id.toString();
        assignments[id] = [];
        expertLoad[id] = 0;
      });

      let expertIndex = 0;

      for (const submission of targetSubmissions) {
        let attempts = 0;
        let assigned = false;

        const historyExpertIds = new Set(
          (submission.history || []).map(h => h.updatedBy?.toString()),
        );
        const currentQueueIds = new Set(
          (submission.queue || []).map(id => id.toString()),
        );

        while (attempts < lessWorkloadExperts.length && !assigned) {
          const expert = lessWorkloadExperts[expertIndex];
          const expertId = expert._id.toString();

          if (
            !historyExpertIds.has(expertId) &&
            !currentQueueIds.has(expertId) &&
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
      for (const expertId in assignments) {
        for (const submission of assignments[expertId]) {
          flatAssignments.push({
            submissionId: submission._id.toString(),
            expertId,
          });
        }
      }

      startBalanceWorkloadWorkers(flatAssignments, inactiveExpertIds);

      return {
        message: 'Inactive-to-Active reallocation started in background',
        inactiveExpertsFound: inactiveExpertIds.length,
        expertsInvolved: lessWorkloadExperts.length,
        submissionsProcessed: flatAssignments.length,
      };
    }

    // ==========================================
    // 🚩 Path 2: Default ReAllocate (Escalation)
    // ==========================================
    else {
      const lessWorkloadExperts =
        await this.userRepo.findActiveLowReputationExpertsToday(session);

      console.log(
        `[QuestionService] Found ${lessWorkloadExperts.length} active experts with low workload`,
      );

      const MAX_PER_EXPERT = 5;
      const maxAssignments = lessWorkloadExperts.length * MAX_PER_EXPERT;

      if (!lessWorkloadExperts.length) {
        return {
          message:
            'No Expert Present To Reallocate Questions .No action needed.',
          expertsInvolved: 0,
          submissionsProcessed: 0,
        };
      }

      const delayedSubmissions =
        await this.questionSubmissionRepo.findQuestionsNeedingEscalation(
          maxAssignments,
          session,
        );

      console.log(
        `[QuestionService] Found ${delayedSubmissions.length} delayed submissions needing escalation`,
      );

      if (!delayedSubmissions.length) {
        return {
          message:
            'No questions are pending allocation for more than one hour. No action needed.',
          expertsInvolved: 0,
          submissionsProcessed: 0,
        };
      }

      await this._withTransaction(async session => {
        for (const submission of delayedSubmissions as any[]) {
          const question = submission.question;
          if (question && question.isOnHold) {
            const now = new Date();
            const prevAccum = question.accumulatedHoldMs ?? 0;
            let segmentMs = 0;
            if (question.holdAt) {
              segmentMs = Math.max(
                0,
                now.getTime() - new Date(question.holdAt).getTime(),
              );
            }
            await this.questionRepo.updateQuestion(
              question._id.toString(),
              {
                isOnHold: false,
                status: 'open',
                accumulatedHoldMs: prevAccum + segmentMs,
                holdAt: null,
              },
              session,
            );
          }
        }
      });

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
          } else {
            console.log(
              `[QuestionService] Skipping expert ${expertId} for submission ${submission._id}: alreadyInHistory=${historyExpertIds.has(expertId)}, alreadyInQueue=${queueExpertIds.has(expertId)}, load=${expertLoad[expertId]}`,
            );
          }

          expertIndex = (expertIndex + 1) % lessWorkloadExperts.length;
          attempts++;
        }
      }

      const flatAssignments: {submissionId: string; expertId: string}[] = [];

      for (const expertId in assignments) {
        for (const submission of assignments[expertId]) {
          flatAssignments.push({
            submissionId: submission._id.toString(),
            expertId,
          });
        }
      }

      console.log(
        `[QuestionService] Created ${flatAssignments.length} reallocation assignments`,
      );

      if (flatAssignments.length > 0) {
        startBalanceWorkloadWorkers(flatAssignments);
      }
      return {
        message: 'Workload balancing started in background',
        expertsInvolved: lessWorkloadExperts.length,
        submissionsProcessed: flatAssignments.length,
      };
    }
  }

  async getReallocationPreview(type: string): Promise<any> {
    return this._withTransaction(async session => {
      let questions: any[] = [];
      let inactiveExpertIds: string[] = [];
      const activeExperts =
        await this.userRepo.findActiveLowReputationExpertsToday(session);

      if (type === 'inactive') {
        const inactiveExperts =
          await this.userRepo.findInactiveOrBlockedExperts(session);
        inactiveExpertIds = inactiveExperts.map(e => e._id.toString());

        if (inactiveExpertIds.length > 0) {
          const INACTIVE_PREVIEW_LIMIT = 50;
          questions =
            await this.questionSubmissionRepo.findSubmissionsWithExpertsInQueue(
              inactiveExpertIds,
              session,
              INACTIVE_PREVIEW_LIMIT,
            );
        }
      } else {
        // escalation - show questions that are delayed (1+ hour)
        // We fetch a generous amount for the manual preview
        const ESCALATION_LIMIT = 50;
        questions =
          await this.questionSubmissionRepo.findQuestionsNeedingEscalation(
            ESCALATION_LIMIT,
            session,
          );
      }

      // Identify experts name and status for display
      const expertInfoMap = new Map<
        string,
        {name: string; status: string; isBlocked: boolean}
      >();
      if (questions.length > 0) {
        // Collect all expert IDs in queues
        const allExpertIdsInQueues = new Set<string>();
        questions.forEach(q => {
          q.queue?.forEach((id: any) =>
            allExpertIdsInQueues.add(id.toString()),
          );
        });

        const experts = await this.userRepo.getUsersByIds(
          Array.from(allExpertIdsInQueues),
          session,
        );
        experts.forEach(e =>
          expertInfoMap.set(e._id.toString(), {
            name: `${e.firstName || ''} ${e.lastName || ''}`.trim(),
            status: e.status || 'unknown',
            isBlocked: !!e.isBlocked,
          }),
        );
      }

      // Populate question text and identify current "responsible" expert
      const populatedQuestions = (
        await Promise.all(
          questions.map(async submission => {
            let questionText = '';
            try {
              const question = await this.questionRepo.getById(
                submission.questionId.toString(),
                session,
              );
              if (!question) return null; // Skip if question document is deleted
              questionText = question.question;
            } catch (err) {
              console.error(
                `[QuestionService] Failed to fetch question ${submission.questionId}:`,
                err,
              );
              return null; // Skip on error to avoid invalid entries
            }

            let currentExpertId = null;
            const targetExpertIdsSet = new Set(inactiveExpertIds);

            if (type === 'inactive') {
              // Identify which inactive expert is currently assigned
              const historyLength = (submission.history || []).length;
              const currentInQueue = submission.queue?.[historyLength];

              if (
                currentInQueue &&
                targetExpertIdsSet.has(currentInQueue.toString())
              ) {
                currentExpertId = currentInQueue.toString();
              } else {
                // Fallback: search queue for any inactive/blocked expert
                const targetInQueue = submission.queue?.find(id =>
                  targetExpertIdsSet.has(id.toString()),
                );
                if (targetInQueue) {
                  currentExpertId = targetInQueue.toString();
                }
              }
            } else {
              // Escalation - whoever is currently supposed to review
              const historyLength = (submission.history || []).length;
              currentExpertId = submission.queue?.[historyLength]?.toString();
            }

            const info = currentExpertId
              ? expertInfoMap.get(currentExpertId)
              : null;
            const currentExpertName = info?.name || 'No Experts Assigned';
            const currentExpertStatus = info?.status || 'unknown';
            const isCurrentExpertBlocked = info?.isBlocked || false;

            return {
              submissionId: submission._id.toString(),
              questionId: submission.questionId.toString(),
              questionText: questionText,
              currentExpertId,
              currentExpertName,
              currentExpertStatus,
              isCurrentExpertBlocked,
              queue: submission.queue?.map(id => id.toString()) || [],
            };
          }),
        )
      ).filter(q => q !== null);

      // Get names for active experts
      const populatedActiveExperts = activeExperts.map(e => ({
        id: e._id.toString(),
        name: `${e.firstName} ${e.lastName || ''}`.trim(),
        reputation_score: e.reputation_score || 0,
      }));

      return {
        questions: populatedQuestions,
        activeExperts: populatedActiveExperts,
        inactiveExpertIds: type === 'inactive' ? inactiveExpertIds : [],
      };
    });
  }

  async manualReallocate(
    assignments: {submissionId: string; expertId: string}[],
    inactiveExpertIds?: string[],
  ): Promise<{message: string; submissionsProcessed: number}> {
    if (assignments.length > 0) {
      startBalanceWorkloadWorkers(assignments, inactiveExpertIds);
    }

    return {
      message: 'Manual reallocation started in background',
      submissionsProcessed: assignments.length,
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

      // const duplicateQuestions = await this.duplicateQuestionRepository.findDuplicatesByDateRange(start, end, 'AJRASAKHA');
      const duplicateQuestions =
        await this.duplicateQuestionRepository.findDuplicatesByDateRange(
          start,
          end,
        );
      const combineQuestions = [...questions, ...duplicateQuestions];
      const allQuestions = [
        ...combineQuestions.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
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
      const excelBuffer = await this.convertQuestionsToExcel(
        allQuestions,
        startDate,
        endDate,
      );

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
    const sheet = workbook.addWorksheet('Outreach Questions');

    // Add title and date range at the top
    sheet.mergeCells('A1:K1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Out Reach Data Report';
    titleCell.font = {bold: true, size: 14};
    titleCell.alignment = {horizontal: 'center', vertical: 'middle'};

    sheet.mergeCells('A2:K2');
    const dateRangeCell = sheet.getCell('A2');
    dateRangeCell.value = `Date Range: ${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;
    dateRangeCell.font = {bold: true, size: 11};
    dateRangeCell.alignment = {horizontal: 'center', vertical: 'middle'};

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
      'Created At',
    ]);

    // Style the header row
    headerRow.font = {bold: true};
    headerRow.alignment = {horizontal: 'center', vertical: 'middle'};
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {argb: 'FFD3D3D3'},
    };

    // Set column widths
    sheet.getColumn(1).width = 50; // Question
    sheet.getColumn(2).width = 15; // Status
    sheet.getColumn(3).width = 15; // Priority
    sheet.getColumn(4).width = 15; // Source
    sheet.getColumn(5).width = 20; // State
    sheet.getColumn(6).width = 20; // District
    sheet.getColumn(7).width = 20; // Crop
    sheet.getColumn(8).width = 15; // Season
    sheet.getColumn(9).width = 25; // Domain
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
        q.createdAt ? this.formatDate(q.createdAt) : '',
      ]);

      // Enable text wrapping for long content
      row.getCell(1).alignment = {wrapText: true, vertical: 'top'}; // Question
      row.getCell(10).alignment = {wrapText: true, vertical: 'top'}; // Text
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

  async generateQuestionReport(
    consecutiveApprovals?: number,
    startDate?: Date,
    endDate?: Date,
  ) {
    const result = await this.answerRepo.groupbyquestion(
      consecutiveApprovals,
      startDate,
      endDate,
    );

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
    const sheet = workbook.addWorksheet('Question Reasons');

    sheet.columns = [
      {header: 'Created At', key: 'createdAt', width: 22},
      {header: 'Question', key: 'question', width: 50},
      {header: 'Reason For Modification', key: 'mod', width: 50},
      {header: 'Reason For Rejection', key: 'rej', width: 50},
    ];

    let rowCount = 0;
    result.reasons.forEach(item => {
      const modList = (item.reasonForModification || []).filter(Boolean);
      const rejList = (item.reasonForRejection || []).filter(Boolean);

      if (!modList.length && !rejList.length) return;

      const row = sheet.addRow({
        createdAt: item.createdAt,
        question: item.question,
        mod: modList.map((r, i) => `${i + 1}) ${r}`).join('\n'),
        rej: rejList.map((r, i) => `${i + 1}) ${r}`).join('\n'),
      });

      row.getCell('mod').alignment = {wrapText: true};
      row.getCell('rej').alignment = {wrapText: true};
      rowCount++;
    });

    const data = await workbook.xlsx.writeBuffer();
    return data;
  }

  async generateOverallQuestionReport(
    startDate?: Date,
    endDate?: Date,
  ): Promise<ArrayBuffer | null> {
    return this._withTransaction(async session => {
      // Get monthly statistics from the repository
      const stats = await this.questionRepo.getMonthlyQuestionStats(
        startDate,
        endDate,
        session,
      );

      // Check if there's any data
      if (!stats || stats.length === 0) {
        return null;
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Overall Questions Report');

      // Define columns matching the template
      sheet.columns = [
        {header: 'Year', key: 'year', width: 12},
        {header: 'Month', key: 'month', width: 15},
        {header: 'Total No. of Q', key: 'totalQuestions', width: 18},
        {header: 'Modified Answ', key: 'modifiedAnswers', width: 18},
        {header: 'Rejected Answ', key: 'rejectedAnswers', width: 18},
        {header: 'Total (Modified + Rejected)', key: 'total', width: 28},
      ];

      // Add data rows
      stats.forEach(stat => {
        sheet.addRow({
          year: stat.year,
          month: stat.month,
          totalQuestions: stat.totalQuestions,
          modifiedAnswers: stat.modifiedAnswers,
          rejectedAnswers: stat.rejectedAnswers,
          total: stat.modifiedAnswers + stat.rejectedAnswers,
        });
      });

      // Style the header row
      const headerRow = sheet.getRow(1);
      headerRow.font = {bold: true};
      headerRow.alignment = {horizontal: 'center', vertical: 'middle'};

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
    source?: string;
    hiddenQuestions?: string;
    duplicateQuestions?: string;
    startDate?: string;
    endDate?: string;
    /** Moderator (= final answer's approvedBy) to filter closed questions by. */
    moderator?: string;
  }): Promise<ArrayBuffer | null> {
    return this._withTransaction(async session => {
      // Build filter query
      const query: any = {};
      if (filters.state && filters.state !== 'all') {
        query['details.state'] = filters.state;
      }
      if (filters.crop && filters.crop !== 'all') {
        query['details.crop'] = filters.crop;
      }
      if (filters.normalised_crop && filters.normalised_crop !== 'all') {
        // Handle comma-separated multiple crops
        const crops = filters.normalised_crop
          .split(',')
          .map(c => c.trim())
          .filter(c => c);
        if (crops.length === 0) {
          // No valid crops, skip filter
        } else if (crops.length === 1) {
          // Single crop - use regex match
          if (crops[0] === '__NOT_SET__') {
            query.$or = [
              {'details.normalised_crop': {$exists: false}},
              {'details.normalised_crop': null},
              {'details.normalised_crop': ''},
            ];
          } else {
            query['details.normalised_crop'] = {
              $regex: `^${crops[0]}$`,
              $options: 'i',
            };
          }
        } else {
          // Multiple crops - use $in with regex for each
          query['details.normalised_crop'] = {
            $in: crops.map(crop => new RegExp(`^${crop}$`, 'i')),
          };
        }
      }
      if (filters.season && filters.season !== 'all') {
        query['details.season'] = filters.season;
      }
      if (filters.domain && filters.domain !== 'all') {
        query['details.domain'] = filters.domain;
      }
      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'pae_closed') {
          query.status = 'closed';
          query.pae_review = true;
        } else {
          query.status = filters.status;
        }
      }
      if (filters.source && filters.source !== 'all') {
        query.source = filters.source;
      }
      if (filters.hiddenQuestions === 'true') {
        query.isHidden = {$eq: true};
      }
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) {
          query.createdAt.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          const end = new Date(filters.endDate);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }

      // Check if this is a closed status report - if so, limit to 50 questions
      const isClosedStatus =
        filters.status === 'closed' || filters.status === 'pae_closed';
      // `moderator` is a comma-separated list of moderator (approvedBy) ids.
      const moderatorIds =
        filters.moderator && filters.moderator !== 'all'
          ? filters.moderator
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : [];
      const filterByModerator = moderatorIds.length > 0;
      // Answer / Sources / Moderator details only exist on a closed question's final
      // answer, so they are included for closed reports or when filtering by moderator.
      const includeAnswerDetails = isClosedStatus || filterByModerator;
      const questionLimit = includeAnswerDetails ? 50 : undefined;

      // Moderator filter (= final answer's approvedBy): restrict to the closed questions
      // those moderators approved. Final answers only exist for closed questions, so this
      // also scopes the report to closed questions.
      if (filterByModerator) {
        const approvedQuestionIds =
          await this.answerRepo.getFinalAnswerQuestionIdsByApprover(
            moderatorIds,
            session,
          );
        if (!approvedQuestionIds.length) {
          console.log(
            'No closed questions approved by the selected moderator(s)',
          );
          return null;
        }
        query._id = {
          $in: approvedQuestionIds.map((id: string) => new ObjectId(id)),
        };
      }

      // Get questions from repository
      const questions = await this.questionRepo.getQuestionsByFilters(
        query,
        session,
        filters.duplicateQuestions === 'true',
        questionLimit,
      );

      if (!questions || questions.length === 0) {
        console.log('No questions found for given filters');
        return null;
      }

      // For closed questions, fetch the final answer (text + sources + approving moderator).
      const questionAnswers = new Map<string, string>();
      const questionSources = new Map<string, string>();
      const questionModerator = new Map<string, string>();
      if (includeAnswerDetails) {
        const questionIds = questions.map(q => q._id.toString());
        const answers = await this.answerRepo.getFinalAnswersByQuestionIds(
          questionIds,
          session,
        );

        // Resolve approving-moderator ids → display names in one batch.
        const approverIds = [
          ...new Set(
            answers
              .map(a => a.approvedBy?.toString())
              .filter(Boolean) as string[],
          ),
        ];
        const moderatorNames = await this.resolveExpertNames(approverIds);

        answers.forEach(answer => {
          if (!answer.questionId) return;
          const qId = answer.questionId.toString();
          questionAnswers.set(qId, answer.answer ?? '');
          questionSources.set(qId, this.formatAnswerSources(answer.sources));
          const approverId = answer.approvedBy?.toString();
          if (approverId)
            questionModerator.set(qId, moderatorNames.get(approverId) ?? '');
        });
      }

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Questions');

      // Define columns - add Answer column for closed status
      const columns = [
        {header: 'Created At', key: 'createdAt', width: 22},
        {header: 'Question', key: 'question', width: 60},
        {header: 'State', key: 'state', width: 20},
        {header: 'District', key: 'district', width: 20},
        {header: 'Crop', key: 'crop', width: 20},
        {header: 'Season', key: 'season', width: 20},
        {header: 'Domain', key: 'domain', width: 25},
        {header: 'Status', key: 'status', width: 15},
        {header: 'Priority', key: 'priority', width: 15},
        {header: 'Source', key: 'source', width: 15},
      ];

      // Add Answer / Sources / Moderator columns for closed questions.
      if (includeAnswerDetails) {
        columns.push({header: 'Answer', key: 'answer', width: 80});
        columns.push({header: 'Sources', key: 'sources', width: 50});
        columns.push({header: 'Moderator', key: 'moderator', width: 25});
      }

      sheet.columns = columns;
      if (includeAnswerDetails) {
        sheet.getColumn('sources').alignment = {
          wrapText: true,
          vertical: 'top',
        };
      }

      // Add data rows
      questions.forEach(q => {
        const rowData: any = {
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
        };

        // Add answer / sources / moderator for closed questions.
        if (includeAnswerDetails) {
          const qId = q._id.toString();
          rowData.answer = questionAnswers.get(qId) || '';
          rowData.sources = questionSources.get(qId) || '';
          rowData.moderator = questionModerator.get(qId) || '';
        }

        sheet.addRow(rowData);
      });

      // Style the header row
      const headerRow = sheet.getRow(1);
      headerRow.font = {bold: true};
      headerRow.alignment = {horizontal: 'center', vertical: 'middle'};

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as ArrayBuffer;
    });
  }

  async generateDuplicateQuestionReport(
    startDate?: Date,
    endDate?: Date,
  ): Promise<ArrayBuffer | null> {
    return this._withTransaction(async session => {
      if (!startDate || !endDate) {
        throw new BadRequestError('startDate and endDate are required');
      }

      // Fetch duplicates using the repository
      // const duplicateQuestions = await this.duplicateQuestionRepository.findDuplicatesByDateRange(startDate, endDate, 'AJRASAKHA', session);
      const duplicateQuestions =
        await this.duplicateQuestionRepository.findDuplicatesByDateRange(
          startDate,
          endDate,
          session,
        );

      if (!duplicateQuestions || duplicateQuestions.length === 0) {
        return null;
      }

      // Fetch reference question details for metadata
      // Use a Map to avoid duplicate fetches for the same reference question
      const refDetailsMap = new Map<
        string,
        {
          state: string;
          district: string;
          crop: string | import('#root/shared/interfaces/models.js').ICropRef;
          season: string;
          domain: string[];
        } | null
      >();

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
      const sheet = workbook.addWorksheet('Similar Questions');

      // Define columns with metadata for both question and reference question
      sheet.columns = [
        {header: 'createdAt', key: 'createdAt', width: 22},
        {header: 'question', key: 'question', width: 60},
        {header: 'q_state', key: 'q_state', width: 18},
        {header: 'q_district', key: 'q_district', width: 20},
        {header: 'q_crop', key: 'q_crop', width: 18},
        {header: 'q_season', key: 'q_season', width: 18},
        {header: 'q_domain', key: 'q_domain', width: 22},
        {header: 'source', key: 'source', width: 15},
        {header: 'similarityScore', key: 'similarityScore', width: 18},
        {header: 'referenceQuestion', key: 'referenceQuestion', width: 60},
        {header: 'referenceSource', key: 'referenceSource', width: 20},
        {header: 'ref_state', key: 'ref_state', width: 18},
        {header: 'ref_district', key: 'ref_district', width: 20},
        {header: 'ref_crop', key: 'ref_crop', width: 18},
        {header: 'ref_season', key: 'ref_season', width: 18},
        {header: 'ref_domain', key: 'ref_domain', width: 22},
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
      headerRow.font = {bold: true};
      headerRow.alignment = {horizontal: 'center', vertical: 'middle'};

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer as ArrayBuffer;
    });
  }

  /*async getMatchedQuestion(questionId: string) {
    const questionData = await this.questionRepo.getById(questionId);

    if (!questionData) {
      throw new Error('Question not found');
    }


    const questionSource = questionData.source;
    if (questionSource == "WHATSAPP") {
      if (!questionData.threadId)
        throw new Error('Thread id not found for WhatsApp question');
      const response = await this.aiService.fetchWhatsAppMessage(questionData.threadId, questionData._id.toString());

      if (response) {
        return {
          messageId: response.messageId || '',
          createdAt: response.createdAt ? new Date(response.createdAt).toISOString() : '',
          updatedAt: response.updatedAt ? new Date(response.updatedAt).toISOString() : '',
          user: {
            username: response.userDetails?.username || 'N/A',
            email: response.userDetails?.email || '',
            emailVerified: response.userDetails?.emailVerified || false,
            avatar: response.userDetails?.avatar || null,
          },
          content: response.content || [],
        }
      } else {
        throw new Error('No matching WhatsApp message found');
      }
    }


    const { question, details, createdAt, messageId, userId } = questionData;
    const [analyticsMessages, annamMessages] = await Promise.all([
      this.chatbotRepository.findMatchingMessages({
        question,
        details,
        createdAt,
        questionId: questionId.toString(),
        messageId: messageId ? messageId.toString() : undefined,
      }),
      this.chatbotRepository.findFromSecondDb({
        question,
        details,
        createdAt,
        questionId: questionId.toString(),
        messageId: messageId ? messageId.toString() : undefined,
      }),
    ]);



    // Take first matched message (assuming 1 expected)
    const allMessages = [...analyticsMessages, ...annamMessages];

    const message = allMessages?.[0];

    if (!message) {
      throw new Error('No matching message found');
    }

    //update userid from the analytics db
    if (message.userDetails?._id !== userId?.toString() && !questionData.messageId) {
      await this.questionRepo.updateQuestion(
        questionId.toString(),
        {
          userId: new ObjectId(message.userDetails._id),
        },
      );
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
  }*/
  async getMatchedQuestion(questionId: string) {
    const questionData = await this.questionRepo.getById(questionId);

    if (!questionData) {
      throw new Error('Question not found');
    }

    const questionSource = questionData.source;

    const isTimeBoundedQuestion =
      questionSource === 'WHATSAPP' || questionSource === 'AJRASAKHA';

    const isTimeBoudedQuestionHasThreadId =
      isTimeBoundedQuestion && questionData.threadId;

    if (!questionData.threadId && questionSource === 'WHATSAPP') {
      throw new Error('Thread id not found for WhatsApp question');
    }

    if (isTimeBoudedQuestionHasThreadId) {
      const response = await this.aiService.fetchWhatsAppMessage(
        questionData.threadId,
        questionData._id.toString(),
      );

      if (!response) {
        throw new Error('No matching WhatsApp message found');
      }

      return {
        messageId: response.messageId || '',
        createdAt: response.createdAt
          ? new Date(response.createdAt).toISOString()
          : '',
        updatedAt: response.updatedAt
          ? new Date(response.updatedAt).toISOString()
          : '',
        user: {
          username: response.userDetails?.username || 'N/A',
          email: response.userDetails?.email || '',
          emailVerified: response.userDetails?.emailVerified || false,
          avatar: response.userDetails?.avatar || null,
        },
        content: response.content || [],
      };
    }

    // =========================
    // NORMAL FLOW
    // =========================

    const {question, details, createdAt, messageId, userId} = questionData;

    /* if(!messageId) {
       throw new Error('Question does not have messageId, cannot reliably fetch matched message');
     }*/

    // const analyticsPromise = this.chatbotRepository.findMatchingMessages({
    //   question,
    //   details,
    //   createdAt,
    //   questionId: questionId.toString(),
    //   messageId: messageId ? messageId.toString() : undefined,
    // });

    const annamPromise = await this.chatbotRepository.findFromSecondDb({
      question,
      details,
      createdAt,
      questionId: questionId.toString(),
      messageId: messageId ? messageId.toString() : undefined,
    });

    const [annamResult] = await Promise.allSettled([annamPromise]);

    // =========================
    // HANDLE RESULTS
    // =========================

    // const analyticsMessages =
    //   analyticsResult.status === 'fulfilled' ? analyticsResult.value : [];

    const annamMessages =
      annamResult.status === 'fulfilled' ? annamResult.value : [];

    // =========================
    // LOG FAILURES
    // =========================

    // if (analyticsResult.status === 'rejected') {
    //   console.error('Analytics DB failed:', {
    //     error: analyticsResult.reason?.message,
    //     stack: analyticsResult.reason?.stack,
    //     questionId,
    //     messageId,
    //   });
    // }

    if (annamResult.status === 'rejected') {
      console.error('Second DB failed:', {
        error: annamResult.reason?.message,
        stack: annamResult.reason?.stack,
        questionId,
        messageId,
      });
    }
    // =========================
    // MERGE RESULTS
    // =========================

    const allMessages = [...annamMessages];

    const message = allMessages?.[0];

    if (!message) {
      throw new Error('No matching message found');
    }

    // =========================
    // UPDATE USER ID IF NEEDED
    // =========================

    if (
      message.userDetails?._id &&
      message.userDetails._id !== userId?.toString() &&
      !questionData.messageId
    ) {
      try {
        await this.questionRepo.updateQuestion(questionId.toString(), {
          userId: new ObjectId(message.userDetails._id),
        });
      } catch (updateError) {
        console.error('Failed to update userId:', updateError);
      }
    }

    // =========================
    // FINAL RESPONSE
    // =========================

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
  async checkStatus(questionIds: string[]): Promise<ICheckStatusResponse[]> {
    const result =
      await this.questionRepo.getQuestionsWithAnswerDetails(questionIds);

    // 1. Fetch data

    return result;
  }

  async holdQuestion(
    questionId: string,
    userId: string,
    action: 'hold' | 'unhold',
  ): Promise<{id: string}> {
    return await this._withTransaction(async session => {
      if (action === 'unhold') {
        const question = await this.questionRepo.getById(questionId, session);
        if (!question) {
          throw new NotFoundError('Question not found');
        }
        const user = await this.userRepo.findById(userId, session);
        if (!user || user.role == 'expert') {
          throw new ForbiddenError(
            'Only moderators or Admins can unhold questions',
          );
        }
        if (!question.isOnHold) {
          throw new BadRequestError('Question is not on hold');
        }
        const prevAccum = question.accumulatedHoldMs ?? 0;
        let segmentMs = 0;
        if (question.holdAt) {
          segmentMs = Math.max(
            0,
            Date.now() - new Date(question.holdAt).getTime(),
          );
        }
        await this.questionRepo.updateQuestion(
          questionId,
          {
            isOnHold: false,
            status: 'open',
            accumulatedHoldMs: prevAccum + segmentMs,
            holdAt: null,
          },
          session,
        );
        return {id: questionId};
      }
      const user = await this.userRepo.findById(userId, session);
      if (user.role == 'expert') {
        throw new ForbiddenError('Only moderators can hold questions');
      }

      const question = await this.questionRepo.getById(questionId, session);
      if (!question) {
        throw new NotFoundError('Question not found');
      }

      if (question.status === 'closed') {
        throw new BadRequestError('Question is already closed');
      }
      const submission = await this.questionSubmissionRepo.getByQuestionId(
        questionId,
        session,
      );
      if (!submission) {
        throw new NotFoundError('Question submission not found');
      }
      await this._handleSubmissionOnHold(submission, session);
      await this.questionRepo.updateQuestion(
        questionId,
        {
          isOnHold: true,
          isAutoAllocate: false,
          status: 'hold',
          holdAt: new Date(),
        },
        session,
      );
      return {id: questionId};
    });
  }
  async checkSubmissionExists(questionId: string): Promise<boolean> {
    const submission =
      await this.questionSubmissionRepo.getByQuestionId(questionId);
    return !!submission;
  }

  private async _handleSubmissionOnHold(
    submission: IQuestionSubmission,
    session: ClientSession,
  ): Promise<void> {
    const questionId = submission.questionId.toString();
    if (!submission.history || submission.history.length === 0) {
      if (submission.queue?.length) {
        const firstUserId = submission.queue[0].toString();
        await this.userRepo.updateReputationScore(firstUserId, false, session);

        // Send notification to the expert that they have been removed from allocation
        try {
          const question = await this.questionRepo.getById(questionId, session);
          const truncatedQuestionText = question?.question
            ? question.question.length > 50
              ? question.question.substring(0, 50) + '...'
              : question.question
            : 'Question';
          await this.notificationService.saveTheNotifications(
            `You have been removed from the allocation. The question has been put on hold.`,
            'Allocation Removed',
            questionId,
            firstUserId,
            'allocation_removal',
          );
        } catch (notificationError) {
          console.error(
            `[_handleSubmissionOnHold] ❌ Failed to send notification to expert ${firstUserId}:`,
            notificationError,
          );
        }
      }

      await this.questionSubmissionRepo.updateSubmissionState(
        questionId,
        {queue: []},
        session,
      );

      return;
    }

    const lastHistory = submission.history[submission.history.length - 1];

    if (lastHistory.status !== 'in-review') return;

    const updatedById = lastHistory.updatedBy?.toString();

    let newQueue = submission.queue;

    const index = submission.queue.findIndex(q => q.toString() === updatedById);

    if (index !== -1) {
      newQueue = submission.queue.slice(0, index);
    }

    if (updatedById) {
      await this.userRepo.updateReputationScore(updatedById, false, session);

      // Send notification to the expert that they have been removed from allocation
      try {
        const question = await this.questionRepo.getById(questionId, session);
        const truncatedQuestionText = question?.question
          ? question.question.length > 50
            ? question.question.substring(0, 50) + '...'
            : question.question
          : 'Question';
        await this.notificationService.saveTheNotifications(
          `You have been removed from the allocation. The question has been put on hold.`,
          'Allocation Removed',
          questionId,
          updatedById,
          'allocation_removal',
        );
      } catch (notificationError) {
        console.error(
          `[_handleSubmissionOnHold] ❌ Failed to send notification to expert ${updatedById}:`,
          notificationError,
        );
      }
    }
    await this.questionSubmissionRepo.updateSubmissionState(
      questionId,
      {
        queue: toObjectIdArray(newQueue || []),
        popHistory: true,
        expertIdToRemove: updatedById,
      },
      session,
    );
  }

  async getQuestionStatusSummary(
    query: GetDetailedQuestionsQuery,
    body: DetailedQuestionsBodyDto,
  ): Promise<{
    totalQuestions: number;
    statuses: {status: string; count: number}[];
    sourceCounts: {source: string; count: number}[];
  }> {
    const result = await this.questionRepo.getQuestionStatusSummary(
      query,
      body,
    );
    return {
      totalQuestions: result.totalQuestions,
      statuses: result.statuses,
      sourceCounts: (result as any).sourceCounts ?? [],
    };
  }

  async getExprtIdByIndex(
    questionId: string,
    index: number,
  ): Promise<string | null> {
    const submission =
      await this.questionSubmissionRepo.getByQuestionId(questionId);
    if (!submission || !submission.queue || submission.queue.length <= index) {
      return null;
    }
    return submission.queue[index].toString();
  }
  async generateAiInitialAnswer(
    questionId: string,
  ): Promise<{aiInitialAnswer: string}> {
    return this._withTransaction(async session => {
      const question = await this.questionRepo.getById(questionId, session);

      if (!question) throw new NotFoundError('Question not found');

      // if (!(question.source === "AGRI_EXPERT" || question.source === "OUTREACH"))
      //   throw new ForbiddenError("Source must be agri expert outreach")

      const submissions =
        await this.questionSubmissionRepo.getByQuestionId(questionId);

      if (submissions.history.length > 0)
        throw new ForbiddenError(
          'Cannot generate AI initial answer. Question already has submitted answers.',
        );

      const res = await this.aiService.getAnswerByQuestionDetails(question);

      if (!res?.answer || !res.answer.trim()) {
        throw new InternalServerError('AI failed to generate answer');
      }

      return {aiInitialAnswer: res.answer};
    });
  }

  async approveAiInitialAnswer(questionId: string, answer: string) {
    return this._withTransaction(async session => {
      const question = await this.questionRepo.getById(questionId, session);

      if (!question) throw new NotFoundError('Question not found');

      // if (!(question.source === "AGRI_EXPERT" || question.source === "OUTREACH"))
      //   throw new ForbiddenError("Source must be agri expert or outreach");

      if (!answer?.trim()) throw new BadRequestError('Answer is required');

      const submissions =
        await this.questionSubmissionRepo.getByQuestionId(questionId);

      if (submissions.history.length > 0)
        throw new ForbiddenError(
          'Cannot generate AI initial answer. Question already has submitted answers.',
        );

      await this.questionRepo.updateQuestion(
        questionId,
        {aiInitialAnswer: answer},
        session,
      );

      return {success: true};
    });
  }

  //balance workload to experts for selected questions
  async balanceWorkloadSelectedQuestions(questionIds: string[]): Promise<{
    message: string;
    expertsInvolved: number;
    submissionsProcessed: number;
    questionsFiltered?: number;
    unallocatedQuestions?: number;
  }> {
    const lessWorkloadExperts =
      await this.userRepo.findActiveLowReputationExpertsToday();
    const MAX_PER_EXPERT = 5;

    if (!lessWorkloadExperts.length) {
      return {
        message: 'No Expert Present To Reallocate Questions .No action needed.',
        expertsInvolved: 0,
        submissionsProcessed: 0,
      };
    }

    if (questionIds.length > lessWorkloadExperts.length * MAX_PER_EXPERT) {
      return {
        message: `Too many questions selected. Only ${lessWorkloadExperts.length} experts are currently available for reallocation. The maximum allowed is ${lessWorkloadExperts.length * MAX_PER_EXPERT} questions based on the current expert capacity. Please reduce the number of selected questions or increase the number of available experts.`,
        expertsInvolved: lessWorkloadExperts.length,
        submissionsProcessed: 0,
      };
    }

    const questionSubmissionDetails =
      await this.questionSubmissionRepo.findReallocationQuestionsByIds(
        questionIds,
      );

    if (!questionSubmissionDetails.length) {
      return {
        message: `No valid questions found. Selected questions are either closed, in review, passed, draft, or already submitted.`,
        expertsInvolved: lessWorkloadExperts.length,
        submissionsProcessed: 0,
      };
    }

    await this._withTransaction(async session => {
      for (const submission of questionSubmissionDetails as any[]) {
        const question = submission.question;
        if (question && question.isOnHold) {
          const now = new Date();
          const prevAccum = question.accumulatedHoldMs ?? 0;
          let segmentMs = 0;
          if (question.holdAt) {
            segmentMs = Math.max(
              0,
              now.getTime() - new Date(question.holdAt).getTime(),
            );
          }
          await this.questionRepo.updateQuestion(
            question._id.toString(),
            {
              isOnHold: false,
              status: 'open',
              accumulatedHoldMs: prevAccum + segmentMs,
              holdAt: null,
            },
            session,
          );
        }
      }
    });

    const assignments: Record<string, any[]> = {};
    const expertLoad: Record<string, number> = {};

    lessWorkloadExperts.forEach(e => {
      const id = e._id.toString();
      assignments[id] = [];
      expertLoad[id] = 0;
    });

    let expertIndex = 0;
    let unallocatedQuestionsCount = 0;

    for (const submission of questionSubmissionDetails) {
      let attempts = 0;
      let assigned = false;

      // Get all experts who already reviewed the question
      const historyExpertIds = new Set(
        (submission.history || []).map(h => h.updatedBy?.toString()),
      );

      // Get all experts already present in queue
      const queueExpertIds = new Set(
        (submission.queue || []).map(id => id.toString()),
      );

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

        // Round robin balancing
        expertIndex = (expertIndex + 1) % lessWorkloadExperts.length;
        attempts++;
      }
      if (!assigned) unallocatedQuestionsCount++;
    }

    const flatAssignments: {submissionId: string; expertId: string}[] = [];

    for (const expertId in assignments) {
      for (const submission of assignments[expertId]) {
        flatAssignments.push({
          submissionId: submission._id.toString(),
          expertId,
        });
      }
    }
    startBalanceWorkloadWorkers(flatAssignments);

    return {
      message: 'Workload balancing started in background',
      expertsInvolved: lessWorkloadExperts.length,
      submissionsProcessed: flatAssignments.length,
      questionsFiltered: questionIds.length - questionSubmissionDetails.length,
      unallocatedQuestions: unallocatedQuestionsCount,
    };
  }

  //send notification to moderators for delayed questions
  async sendDelayedNotifications(): Promise<void> {
    await this._withTransaction(async session => {
      const delayedReviews =
        await this.questionSubmissionRepo.getDelayedReviews(session);
      if (!delayedReviews.length) {
        return;
      }

      const notifiedSubmissionIds: ObjectId[] = [];

      const moderators = await this.userRepo.findModerators();

      for (const item of delayedReviews) {
        try {
          await Promise.allSettled(
            moderators.map(mod =>
              this.notificationRepository.addNotification(
                mod._id.toString(),
                item.questionId.toString(),
                'question_delayed',
                'A question has been delayed for 45 minutes',
                'Question Delayed',
              ),
            ),
          );

          notifiedSubmissionIds.push(item?._id);
        } catch (error) {
          console.error(
            `Failed notification for question ${item?.questionId}`,
            error,
          );
        }
      }
      if (notifiedSubmissionIds.length) {
        await this.questionSubmissionRepo.markDelayedNotificationsSent(
          notifiedSubmissionIds,
          session,
        );
      }
    });
  }

  async backfillEmptyEmbeddings(batchLimit = 50): Promise<void> {
    if (!appConfig.ENABLE_AI_SERVER) {
      console.log('<<EMBEDDING_BACKFILL>> AI server disabled, skipping.');
      return;
    }

    const questions =
      await this.questionRepo.getQuestionsWithEmptyEmbeddings(batchLimit);

    if (questions.length === 0) {
      console.log(
        '<<EMBEDDING_BACKFILL>> No questions with empty embeddings found.',
      );
      return;
    }

    console.log(
      `<<EMBEDDING_BACKFILL>> Processing ${questions.length} question(s)...`,
    );

    let succeeded = 0;
    let failed = 0;

    for (const q of questions) {
      const inputText = (q.question || q.text || '').trim();

      if (!inputText) {
        console.warn(`<<EMBEDDING_BACKFILL>> Skipping ${q._id} — no text`);
        failed++;
        continue;
      }

      try {
        const {embedding} = await this.aiService.getEmbedding(inputText);
        await this.questionRepo.updateQuestionEmbedding(
          q._id.toString(),
          embedding,
        );
        succeeded++;
      } catch (err) {
        console.error(`<<EMBEDDING_BACKFILL>> Failed for ${q._id}:`, err);
        failed++;
      }
    }

    console.log(
      `<<EMBEDDING_BACKFILL>> Done — ✅ ${succeeded} succeeded, ❌ ${failed} failed`,
    );
  }

  // ─── Time-bound question tracking ───────────────────────────────────────────

  /** Called whenever an expert selects ANY question in the UI.
   *  1. Clears currentExpertOpenedAt on any OTHER time-bound submission the expert
   *     had previously opened — so navigating away makes the old question eligible
   *     for reallocation by the cron.
   *  2. Only SETS currentExpertOpenedAt if the current question is time-bound. */
  async markQuestionOpened(questionId: string, userId: string): Promise<void> {
    try {
      const question = await this.questionRepo.getById(questionId);
      if (!question) return;
      // Always call the repo — it clears previous openedAt on other questions, and
      // sets it on the current question for any single-allocation source (time-bound
      // OR manual AGRI_EXPERT/OUTREACH) so the reallocation crons don't reassign a
      // question the expert is actively working on.
      const isSingleAllocation =
        TIME_BOUND_SOURCES.includes(question.source) ||
        MANUAL_SOURCES.includes(question.source);
      await this.questionSubmissionRepo.markQuestionOpenedByExpert(
        questionId,
        userId,
        isSingleAllocation,
      );
    } catch (error) {
      // Non-fatal — log and swallow so the UI is never blocked by this
      console.error(
        `[markQuestionOpened] Failed for questionId=${questionId}:`,
        error,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODERATOR QUEUE CRON
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Periodic cron job — moderator queue management.
   *
   * Logic:
   *  1. Find all in-review questions that have no moderatorId assigned.
   *  2. Find available moderators — those whose assignedQuestionIds array is empty.
   *  3. For each available moderator, assign the oldest unassigned in-review question:
   *       - Set question.moderatorId = moderatorId
   *       - Append questionId to user.assignedQuestionIds
   *       - Push a moderator history entry into the submission
   *       - Notify the moderator
   *
   * De-assignment:
   *  When the moderator closes (approves) a question, AnswerService:
   *       - keeps question.moderatorId for history
   *       - pulls questionId from user.assignedQuestionIds
   *  …making the moderator available again on the next cron run once the array is empty.
   */
  async runModeratorQueueCron(): Promise<{
    assigned: number;
    availableWaiting: number;
    failedAssignments: number;
  }> {
    console.log(
      '[ModeratorQueue] Starting moderator queue assignment check...',
    );
    try {
      // Source-aware assignment: a moderator may hold ONE time-bound question and ONE
      // manual (non-time-bound) question at the same time. Availability is evaluated
      // per source group, so the two passes below are independent — a moderator free
      // for both categories can receive one of each in a single run, while a moderator
      // already holding (say) a time-bound question still receives a manual one.
      const [
        timeBoundModerators,
        manualModerators,
        timeBoundQuestions,
        manualQuestions,
      ] = await Promise.all([
        this.userRepo.findAvailableStfModeratorsForSources(TIME_BOUND_SOURCES),
        this.userRepo.findAvailableStfModeratorsForSources(MANUAL_SOURCES),
        this.questionRepo.findUnassignedInReviewQuestions(TIME_BOUND_SOURCES),
        this.questionRepo.findUnassignedInReviewQuestions(MANUAL_SOURCES),
      ]);

      // Track claimed question IDs across both passes so a question is never assigned
      // twice (the buckets are disjoint by source, but this is a cheap safety net).
      const claimedIds = new Set<string>();
      let assigned = 0;
      let availableWaiting = 0;
      let failedAssignments = 0;

      // Assign one question per available moderator within a single source group.
      const runPass = async (
        label: string,
        moderators: IUser[],
        questions: IQuestion[],
      ) => {
        for (const moderator of moderators) {
          const moderatorId = moderator._id!.toString();

          const nextQuestion = questions.find(
            (q: any) => !claimedIds.has(q._id.toString()),
          );
          if (!nextQuestion) {
            // Moderator is free for this category but no more questions left in it.
            availableWaiting++;
            continue;
          }

          const questionId = nextQuestion._id!.toString();
          claimedIds.add(questionId);

          try {
            // Assign question to moderator — update both documents and notify.
            await Promise.all([
              this.questionRepo.updateModeratorId(questionId, moderatorId),
              // Store the question's actual status (the cron assigns both in-review and
              // duplicate questions) and its source (used for source-aware availability).
              this.userRepo.addAssignedQuestion(
                moderatorId,
                questionId,
                ((nextQuestion as any)?.status ??
                  'in-review') as QuestionStatus,
                (nextQuestion as any)?.source,
              ),
              this.notificationService.saveTheNotifications(
                'A question has been assigned to you for moderation',
                'Moderation Assigned',
                questionId,
                moderatorId,
                'moderator_approval',
              ),
            ]);

            // Audit the system (cron) allocation so it shows in the question's audit
            // trail tagged "System Allocated".
            const moderatorName =
              `${moderator.firstName ?? ''} ${moderator.lastName ?? ''}`.trim() ||
              moderatorId;
            this.auditTrailsService
              .createAuditTrail({
                category: AuditCategory.EXPERTS_CATEGORY,
                action: AuditAction.SYSTEM_ALLOCATED,
                actor: {
                  id: 'system',
                  name: 'System',
                  email: '',
                  role: 'system',
                  avatar: '',
                },
                context: {
                  questionId,
                  question: (nextQuestion as any)?.question,
                  moderatorId,
                },
                changes: {after: {moderator: moderatorName}},
                outcome: {status: OutComeStatus.SUCCESS},
                createdAt: new Date(),
              } as ModeratorAuditTrail)
              .catch((auditErr: any) =>
                console.error(
                  '[ModeratorQueue] Failed to write SYSTEM_ALLOCATED audit:',
                  auditErr?.message,
                ),
              );

            console.log(
              `[ModeratorQueue] (${label}) Assigned question ${questionId} → moderator ${moderatorId}`,
            );
            assigned++;
          } catch (err: any) {
            console.error(
              `[ModeratorQueue] (${label}) Failed to assign ${questionId} → ${moderatorId}:`,
              err?.message,
            );
            claimedIds.delete(questionId);
            failedAssignments++;
          }
        }
      };

      if (!timeBoundModerators.length && !manualModerators.length) {
        console.log(
          '[ModeratorQueue] No available moderators for either category.',
        );
      }

      await runPass('time-bound', timeBoundModerators, timeBoundQuestions);
      await runPass('manual', manualModerators, manualQuestions);

      console.log(
        `[ModeratorQueue] Done. assigned=${assigned}, availableWaiting=${availableWaiting}, failed=${failedAssignments}`,
      );
      return {assigned, availableWaiting, failedAssignments};
    } catch (error: any) {
      console.error(
        '[ModeratorQueue] runModeratorQueueCron failed:',
        error?.message,
      );
      throw new InternalServerError(
        `Moderator queue cron failed: ${error?.message}`,
      );
    }
  }

  /** Periodic job — handles three cases for time-bound (AJRASAKHA/WHATSAPP) questions:
   *  A) Expert allocated but didn't open in 45 min → penalise + replace.
   *  B) Question never allocated → initial assignment.
   *  C) Initial answer submitted, status still open/delayed → assign reviewer. */
  async reallocateTimeBoundQuestions(): Promise<{
    message: string;
    reallocated: number;
    skipped: number;
  }> {
    if (isReallocatingTimeBound) {
      console.log(
        '[TimeBound] Previous run still in progress — skipping this tick to avoid double-allocation.',
      );
      return {
        message: 'Reallocation already in progress',
        reallocated: 0,
        skipped: 0,
      };
    }
    isReallocatingTimeBound = true;
    try {
      return await this._runSingleAllocation({
        label: 'TimeBound',
        sources: TIME_BOUND_SOURCES,
        requirePaeReviewNotDone: false,
      });
    } finally {
      isReallocatingTimeBound = false;
    }
  }

  /**
   * Manual single-allocation queue for AGRI_EXPERT / OUTREACH questions.
   * Mirrors the time-bound flow exactly (one expert at a time, STF-first for
   * never-allocated, 45-min stuck reallocation, reviewer assignment) but:
   *   - operates on MANUAL_SOURCES instead of time-bound sources,
   *   - only considers questions not yet PAE-reviewed (pae_review false/missing),
   *   - uses an independent per-expert "1 active manual" cap.
   */
  async reallocateManualQuestions(): Promise<{
    message: string;
    reallocated: number;
    skipped: number;
  }> {
    if (isReallocatingManual) {
      console.log(
        '[ManualSingle] Previous run still in progress — skipping this tick to avoid double-allocation.',
      );
      return {
        message: 'Reallocation already in progress',
        reallocated: 0,
        skipped: 0,
      };
    }
    isReallocatingManual = true;
    try {
      return await this._runSingleAllocation({
        label: 'ManualSingle',
        sources: MANUAL_SOURCES,
        requirePaeReviewNotDone: true,
      });
    } finally {
      isReallocatingManual = false;
    }
  }

  /**
   * Core single-question allocation engine shared by the time-bound and manual
   * crons. Fetches stuck / never-allocated / needs-reviewer submissions for the
   * given source group and allocates one expert at a time (cap enforced per group).
   */
  private async _runSingleAllocation(cfg: {
    label: string;
    sources: QuestionSource[];
    requirePaeReviewNotDone: boolean;
  }): Promise<{ message: string; reallocated: number; skipped: number }> {
    const { label, sources, requirePaeReviewNotDone } = cfg;
    console.log(
      `[${label}] Starting reallocation + initial-allocation + reviewer-assignment check...`,
    );
    try {
      // 1. Fetch all cases in parallel.
      // NOTE: opened-but-idle reallocation is intentionally DISABLED — once an expert
      // opens a question (currentExpertOpenedAt is set) it stays with them
      // and is never reallocated. The "stuck" path already excludes opened questions
      // (its query requires currentExpertOpenedAt to be null), so by not fetching the
      // openedIdle work here an opened question is reallocated by neither path.
      const [
        stuckSubmissions,
        unallocatedSubmissions,
        answeredNeedingReviewer,
      ] = await Promise.all([
        this.questionSubmissionRepo.findTimeBoundQuestionsForReallocation(
          sources,
          requirePaeReviewNotDone,
        ),
        this.questionSubmissionRepo.findUnallocatedTimeBoundQuestions(
          sources,
          requirePaeReviewNotDone,
        ),
        this.questionSubmissionRepo.findAnsweredQuestionsNeedingReviewer(
          sources,
          requirePaeReviewNotDone,
        ),
      ]);

      const byCreatedAt = (a: any, b: any) =>
        new Date((a.question?.createdAt ?? a.createdAt) as string).getTime() -
        new Date((b.question?.createdAt ?? b.createdAt) as string).getTime();

      stuckSubmissions.sort(byCreatedAt);
      unallocatedSubmissions.sort(byCreatedAt);
      answeredNeedingReviewer.sort(byCreatedAt);

      const totalWork =
        stuckSubmissions.length +
        unallocatedSubmissions.length +
        answeredNeedingReviewer.length;
      //console.log('the total work coming====', totalWork);
      if (!totalWork) {
        return {
          message: `[${label}] No questions need attention`,
          reallocated: 0,
          skipped: 0,
        };
      }

      console.log(
        `[TimeBound] Stuck: ${stuckSubmissions.length}, Never-allocated: ${unallocatedSubmissions.length}, NeedReviewer: ${answeredNeedingReviewer.length}`,
      );

      // 2. Get all non-blocked experts ordered by workload (lowest first)
      const allExperts = await this.userRepo.findExpertsByReputationScore(
        {} as any,
      );
      if (!allExperts.length) {
        return {
          message: 'No experts available',
          reallocated: 0,
          skipped: totalWork,
        };
      }

      // Audit a system (cron) allocation so it shows in the question's audit trail
      // tagged "System Allocated". Fire-and-forget — never blocks the allocation.
      const writeSystemAllocationAudit = (
        qId: string,
        qText: string | undefined,
        assigneeId: string,
        roleLabel: 'expert' | 'reviewer',
      ) => {
        const e = allExperts.find((x: any) => x._id.toString() === assigneeId);
        const name = e
          ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || assigneeId
          : assigneeId;
        this.auditTrailsService
          .createAuditTrail({
            category: AuditCategory.EXPERTS_CATEGORY,
            action: AuditAction.SYSTEM_ALLOCATED,
            actor: {
              id: 'system',
              name: 'System',
              email: '',
              role: 'system',
              avatar: '',
            },
            context: {questionId: qId, question: qText, expertId: assigneeId},
            changes: {after: {[roleLabel]: name}},
            outcome: {status: OutComeStatus.SUCCESS},
            createdAt: new Date(),
          } as ModeratorAuditTrail)
          .catch((err: any) =>
            console.error(
              '[TimeBound] Failed to write SYSTEM_ALLOCATED audit:',
              err?.message,
            ),
          );
      };

      // 3. Get current active workload per expert for THIS source group (single DB
      //    call). Passing `sources` keeps the manual cap independent from time-bound.
      const timeBoundCounts =
        await this.questionSubmissionRepo.getTimeBoundActiveCountPerExpert(
          sources,
        );
      const MAX_TIME_BOUND = 1; // Each expert handles at most 1 active question in this group
      // Track provisional additions during this run to respect cap within batch
      const provisionalCounts = new Map<string, number>(timeBoundCounts);

      // ── Full diagnostic dump: every question to allocate + every expert + availability ──
      const summarizeSub = (s: any) => ({
        questionId: (s.questionId ?? s._id)?.toString(),
        status: s.question?.status,
        source: s.question?.source,
        queueLen: (s.queue ?? []).length,
        historyLen: (s.history ?? []).length,
        queue: (s.queue ?? []).map((q: any) => q?.toString()),
        createdAt: s.question?.createdAt ?? s.createdAt,
      });
     /* console.log(
        '[TimeBound][diag] stuck:',
        JSON.stringify(stuckSubmissions.map(summarizeSub)),
      );
      console.log(
        '[TimeBound][diag] unallocated:',
        JSON.stringify(unallocatedSubmissions.map(summarizeSub)),
      );
      console.log(
        '[TimeBound][diag] needsReviewer:',
        JSON.stringify(answeredNeedingReviewer.map(summarizeSub)),
      );*/

      const expertDiag = allExperts.map((e: any) => {
        const id = e._id.toString();
        const active = provisionalCounts.get(id) ?? 0;
        return {
          id,
          name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim(),
          email: e.email,
          isBlocked: e.isBlocked === true,
          stf: e.special_task_force === true,
          reputation: e.reputation_score,
          activeTimeBound: active,
          free: active < MAX_TIME_BOUND,
        };
      });
    /*  console.log(
        `[TimeBound][diag] experts=${allExperts.length}, free=${expertDiag.filter(x => x.free).length}, ` +
          `freeSTF=${expertDiag.filter(x => x.free && x.stf).length}, busyMapSize=${timeBoundCounts.size}`,
      );
      console.log('[TimeBound][diag] experts:', JSON.stringify(expertDiag));*/

      // ── Merge all lists into one priority queue ordered by question.createdAt ──
      type WorkType = 'stuck' | 'openedIdle' | 'unallocated' | 'needsReviewer';
      const workQueue: {type: WorkType; submission: any}[] = [
        ...stuckSubmissions.map((s: any) => ({
          type: 'stuck' as WorkType,
          submission: s,
        })),
        // Opened-but-idle reallocation disabled — see note above. Once a question is
        // opened it stays with its current expert and is NOT added to the work queue.
        ...unallocatedSubmissions.map((s: any) => ({
          type: 'unallocated' as WorkType,
          submission: s,
        })),
        ...answeredNeedingReviewer.map((s: any) => ({
          type: 'needsReviewer' as WorkType,
          submission: s,
        })),
      ];

      // Priority: never-allocated questions (and stuck/opened-idle reallocations)
      // must be fully processed BEFORE any needsReviewer (review-level) work, so
      // that available STF experts are consumed by never-allocated questions first.
      // Only once no never-allocated questions remain do reviewer assignments run.
      // Within the same priority bucket, keep FIFO by question.createdAt.
      const typePriority: Record<WorkType, number> = {
        stuck: 0,
        openedIdle: 0,
        unallocated: 0,
        needsReviewer: 1,
      };
      workQueue.sort((a, b) => {
        if (typePriority[a.type] !== typePriority[b.type]) {
          return typePriority[a.type] - typePriority[b.type];
        }
        const aTime = new Date(
          (a.submission.question?.createdAt ??
            a.submission.createdAt) as string,
        ).getTime();
        const bTime = new Date(
          (b.submission.question?.createdAt ??
            b.submission.createdAt) as string,
        ).getTime();
        return aTime - bTime;
      });

      const flatAssignments: {
        submissionId: string;
        expertId: string;
        appendExpert?: boolean;
        skipPenalty?: boolean;
      }[] = [];
      const reallocationInfo: {
        questionId: string;
        oldExpertId: string;
        newExpertId: string;
        sourceLabel: string;
        questionText: string;
      }[] = [];
      let skipped = 0;
      let initialAllocated = 0;
      let reviewersAssigned = 0;

      // If this run has ANY never-allocated questions, STF experts are reserved
      // exclusively for them (never-allocated → STF only; needsReviewer → non-STF
      // only). Only when there are no never-allocated questions at all may STF
      // experts take reviewer work. unallocatedProcessed is kept for logging.
      const hasUnallocatedSubmissions = unallocatedSubmissions.length > 0;
      let unallocatedProcessed = 0;

      for (const {type, submission} of workQueue) {
        const questionId = submission.questionId?.toString();
        const question = submission.question;
        const sourceLabel =
          ({
            AJRASAKHA: 'Ajrasakha',
            WHATSAPP: 'WhatsApp',
            AGRI_EXPERT: 'Agri Expert',
            OUTREACH: 'Outreach',
          } as Record<string, string>)[question?.source] ??
          question?.source ??
          'Unknown';
        const history: any[] = submission.history || [];
        const queue: any[] = submission.queue || [];

        if (type === 'stuck' || type === 'openedIdle') {
          // Determine current stuck expert
          let currentExpertId: string | null = null;
          if (history.length === 0) {
            currentExpertId = queue[0]?.toString() ?? null;
          } else {
            const lastH = history[history.length - 1];
            currentExpertId =
              lastH.status === 'in-review'
                ? (lastH.updatedBy?.toString() ?? null)
                : (queue[history.length]?.toString() ?? null);
          }

          const historyExpertIds = new Set(
            history.map((h: any) => h.updatedBy?.toString()),
          );
          const queueExpertIds = new Set(queue.map((q: any) => q.toString()));

          let assignedExpert: string | null = null;
          for (const expert of allExperts) {
            const expertId = expert._id.toString();
            if (expertId === currentExpertId) continue;
            if (historyExpertIds.has(expertId)) continue;
            if (queueExpertIds.has(expertId)) continue;
            if (!history.length && expert?.special_task_force !== true)
              continue;
            // Reserve STF experts for never-allocated questions: when this run has
            // any never-allocated work, only AUTHOR-level reallocations (empty
            // history — they require an STF answer-creator) may use STF. Review-level
            // reallocations (history present, non-STF can handle them) skip STF.
            if (
              hasUnallocatedSubmissions &&
              history.length > 0 &&
              expert?.special_task_force === true
            ) {
              continue;
            }
            const currentCount = provisionalCounts.get(expertId) ?? 0;
            if (currentCount >= MAX_TIME_BOUND) continue;
            assignedExpert = expertId;
            provisionalCounts.set(expertId, currentCount + 1);
            break;
          }

          if (!assignedExpert) {
            console.log(
              `[TimeBound] No eligible expert for ${type} submission ${submission._id} — skipping`,
            );
            skipped++;
            continue;
          }
          // openedIdle → reassign but don't penalise the idle expert (skipPenalty).
          flatAssignments.push({
            submissionId: submission._id.toString(),
            expertId: assignedExpert,
            appendExpert: false,
            skipPenalty: type === 'openedIdle',
          });
          reallocationInfo.push({
            questionId,
            oldExpertId: currentExpertId ?? 'Unknown',
            newExpertId: assignedExpert,
            sourceLabel,
            questionText: (question as any)?.question?.toString() ?? '',
          });
        } else if (type === 'unallocated') {
          let assignedExpert: string | null = null;
          for (const expert of allExperts) {
            if (expert?.special_task_force !== true) continue;
            const expertId = expert._id.toString();
            const currentCount = provisionalCounts.get(expertId) ?? 0;
            if (currentCount >= MAX_TIME_BOUND) continue;
            assignedExpert = expertId;
            provisionalCounts.set(expertId, currentCount + 1);
            break;
          }

          if (!assignedExpert) {
            console.log(
              `[TimeBound] No eligible expert for unallocated question ${questionId} — skipping`,
            );
            skipped++;
            continue;
          }

          try {
            // Atomic allocation: run the DB writes in one transaction so a failure in
            // any of them rolls back the rest (no half-allocated question). Ops on a
            // single session must run sequentially (no Promise.all inside).
            await this._withTransaction(async (session: ClientSession) => {
              await this.questionSubmissionRepo.updateQueue(
                questionId,
                [new ObjectId(assignedExpert)],
                session,
              );
              await this.userRepo.updateReputationScore(
                assignedExpert,
                true,
                session,
              );
              await this.questionRepo.updateQuestion(
                questionId,
                { isAutoAllocate: true, firstAllocationAt: new Date() },
                session,
              );
              await this.questionSubmissionRepo.setCurrentExpertAllocatedAt(
                questionId,
                new Date(),
                session,
              );
            });

            // Notification is best-effort and lives OUTSIDE the transaction so it can
            // never roll back a committed allocation.
            await this.notificationService
              .saveTheNotifications(
                `A question from ${sourceLabel} has been assigned to you`,
                'Answer Creation Assigned',
                questionId,
                assignedExpert,
                'answer_creation',
              )
              .catch((err: any) =>
                console.error(
                  `[TimeBound] Failed to notify expert ${assignedExpert} for ${questionId}:`,
                  err?.message,
                ),
              );
            writeSystemAllocationAudit(
              questionId,
              (question as any)?.question,
              assignedExpert,
              'expert',
            );
            console.log(
              `[TimeBound] Initially allocated question ${questionId} to expert ${assignedExpert}`,
            );
            initialAllocated++;
            unallocatedProcessed++;
          } catch (allocErr: any) {
            console.error(
              `[TimeBound] Failed to initially allocate question ${questionId}:`,
              allocErr?.message,
            );
            skipped++;
          }
        } else {
          // needsReviewer
          const historyExpertIds = new Set(
            history.map((h: any) => h.updatedBy?.toString()),
          );
          const queueExpertIds = new Set(queue.map((q: any) => q.toString()));

          let assignedReviewer: string | null = null;
          for (const expert of allExperts) {
            const expertId = expert._id.toString();
            if (historyExpertIds.has(expertId)) continue;
            if (queueExpertIds.has(expertId)) continue;

            // CRITICAL: Whenever this run has ANY never-allocated questions, STF
            // experts are reserved EXCLUSIVELY for them — they are never assigned
            // to reviewer tasks, even after every never-allocated question has been
            // handled and they still have spare capacity. needsReviewer work goes
            // to non-STF experts only. (Only when there are NO never-allocated
            // questions at all this run may STF experts take reviewer work.)
            if (
              hasUnallocatedSubmissions &&
              expert?.special_task_force === true
            ) {
              console.log(
                `[TimeBound] Skipping STF expert ${expertId} for needsReviewer question ${questionId} — never-allocated questions present this run; STF reserved for them (${unallocatedProcessed}/${unallocatedSubmissions.length} allocated)`,
              );
              continue; // STF reserved for never-allocated questions
            }

            const currentCount = provisionalCounts.get(expertId) ?? 0;
            if (currentCount >= MAX_TIME_BOUND) continue;
            assignedReviewer = expertId;
            provisionalCounts.set(expertId, currentCount + 1);
            break;
          }

          if (!assignedReviewer) {
            console.log(
              `[TimeBound] No eligible reviewer for question ${questionId} — skipping`,
            );
            skipped++;
            continue;
          }

          try {
            // Atomic reviewer assignment (see initial-allocation note above): DB writes
            // run sequentially in one transaction; the notification is best-effort and
            // lives outside so it can't roll back a committed assignment.
            await this._withTransaction(async (session: ClientSession) => {
              await this.questionSubmissionRepo.assignTimeBoundReviewer(
                questionId,
                assignedReviewer,
                new Date(),
                session,
              );
              await this.userRepo.updateReputationScore(
                assignedReviewer,
                true,
                session,
              );
            });

            await this.notificationService
              .saveTheNotifications(
                `A question from ${sourceLabel} needs your review`,
                'New Review Assigned',
                questionId,
                assignedReviewer,
                'peer_review',
              )
              .catch((err: any) =>
                console.error(
                  `[TimeBound] Failed to notify reviewer ${assignedReviewer} for ${questionId}:`,
                  err?.message,
                ),
              );
            writeSystemAllocationAudit(
              questionId,
              (question as any)?.question,
              assignedReviewer,
              'reviewer',
            );
            console.log(
              `[TimeBound] Assigned reviewer ${assignedReviewer} for question ${questionId}`,
            );
            reviewersAssigned++;
          } catch (err: any) {
            console.error(
              `[TimeBound] Failed to assign reviewer for question ${questionId}:`,
              err?.message,
            );
            skipped++;
          }
        }
      }

      if (flatAssignments.length) {
        // Await the workers so the run (and its lock) stays open until the queue
        // writes land — otherwise the next tick could re-reserve an expert whose
        // assignment hasn't been persisted yet.
        const workerResult = await startBalanceWorkloadWorkers(flatAssignments);
        console.log(
          `[TimeBound] Triggered reallocation for ${flatAssignments.length} stuck submission(s); ` +
            `workers persisted=${workerResult.processed}, failedWorkers=${workerResult.failedWorkers}`,
        );

        // Audit each stuck reallocation as a system allocation ("System Allocated").
        for (const info of reallocationInfo) {
          writeSystemAllocationAudit(
            info.questionId,
            info.questionText,
            info.newExpertId,
            'expert',
          );
        }

        //   // Notify all moderators and admins about stuck-question reallocations
        //   try {
        //     const [moderators, admins] = await Promise.all([
        //       this.userRepo.findModerators(),
        //       this.userRepo.findAdmins(),
        //     ]);
        //     const allRecipients = [...(moderators || []), ...(admins || [])];
        //     console.log(`[TimeBound] Notifying ${allRecipients.length} moderators/admins about ${reallocationInfo.length} reallocation(s)`);

        //     const getName = async (id?: string | null): Promise<string> => {
        //       if (!id) return 'Unknown';
        //       try {
        //         const u = await this.userRepo.findById(id);
        //         if (!u) return 'Unknown';
        //         const first = (u as any).firstName?.toString().trim() || '';
        //         const last = (u as any).lastName?.toString().trim() || '';
        //         const full = `${first} ${last}`.trim();
        //         return full || 'Unknown';
        //       } catch {
        //         return 'Unknown';
        //       }
        //     };

        //     for (const info of reallocationInfo) {
        //       const [oldExpertName, newExpertName] = await Promise.all([
        //         getName(info.oldExpertId),
        //         getName(info.newExpertId),
        //       ]);
        //       const message = `${info.sourceLabel} question auto-reallocated from expert ${oldExpertName} to ${newExpertName}gggggg`;
        //       const trimmedQuestion = (info.questionText || '').trim();
        //       const title = trimmedQuestion
        //         ? (trimmedQuestion.length > 80 ? `${trimmedQuestion.slice(0, 80)}...` : trimmedQuestion)
        //         : 'Time-Bound Question Reallocated';
        //       for (const recipient of allRecipients) {
        //         const recipientId = recipient._id?.toString();
        //         if (!recipientId) continue;
        //         await this.notificationService.saveTheNotifications(
        //           message,
        //           title,
        //           info.questionId,
        //           recipientId,
        //           'expert_replacement',
        //         ).catch((err: any) => {
        //           console.error(`[TimeBound] Failed to notify ${recipientId}:`, err?.message);
        //         });
        //       }
        //     }
        //   } catch (err: any) {
        //     console.error(`[TimeBound] Failed to notify moderators/admins:`, err?.message);
        //   }
      }

      const totalReallocated =
        flatAssignments.length + initialAllocated + reviewersAssigned;
      return {
        message: `[${label}] reallocated=${flatAssignments.length}, initially-allocated=${initialAllocated}, reviewers-assigned=${reviewersAssigned}`,
        reallocated: totalReallocated,
        skipped,
      };
    } catch (error: any) {
      console.error(
        `[${label}] single-allocation run failed:`,
        error?.message,
      );
      throw new InternalServerError(
        `Failed to run ${label} allocation: ${error?.message}`,
      );
    }
  }

  // ── Queue Details helpers ────────────────────────────────────────────────

  /** Current assignee the cron would penalise/replace (used for STUCK items). */
  private deriveCurrentExpertId(
    queue: (ObjectId | string)[] = [],
    history: {updatedBy?: ObjectId | string; status?: string}[] = [],
  ): string | null {
    if (!queue?.length) return null;
    if (!history?.length) return queue[0]?.toString() ?? null;
    const last = history[history.length - 1];
    if (last?.status === 'in-review') return last.updatedBy?.toString() ?? null;
    return queue[history.length]?.toString() ?? null;
  }

  /** Queue member still holding pending work — identical rule to
   *  getTimeBoundActiveCountPerExpert's `isPending`. Returns null when every
   *  assigned expert has finished their step (author answered, awaiting reviewer). */
  private derivePendingAssigneeId(
    queue: (ObjectId | string)[] = [],
    history: {answer?: unknown; status?: string}[] = [],
  ): string | null {
    if (!queue?.length) return null;
    for (let i = 0; i < queue.length; i++) {
      const ch = history?.[i];
      const pending =
        i === 0 ? !ch || !ch.answer : !ch || ch.status === 'in-review';
      if (pending) return queue[i]?.toString() ?? null;
    }
    return null;
  }

  private queueCropName(crop: unknown): string | undefined {
    if (!crop) return undefined;
    if (typeof crop === 'string') return crop;
    if (typeof crop === 'object' && 'name' in (crop as any)) {
      return (crop as any).name?.toString();
    }
    return undefined;
  }

  private rawToQueueItem(row: RawQueueQuestionRow): QueueQuestionItem {
    return {
      _id: row._id?.toString(),
      question: row.question ?? '',
      status: row.status ?? '',
      source: row.source ?? '',
      priority: row.priority,
      createdAt: row.createdAt,
      state: row.state,
      district: row.district,
      crop: this.queueCropName(row.crop),
    };
  }

  /** Map a joined submission (with `.question`) into a lean question item. */
  private submissionToQueueItem(sub: any): QueueQuestionItem {
    const q = sub.question || {};
    return {
      _id: (q._id ?? sub.questionId)?.toString(),
      question: q.question ?? '',
      status: q.status ?? '',
      source: q.source ?? '',
      priority: q.priority,
      createdAt: q.createdAt,
      state: q.details?.state,
      district: q.details?.district,
      crop: this.queueCropName(q.details?.crop),
    };
  }

  /** Build the full queue as "Name (Level)" entries — Author for position 0,
   *  then Reviewer 1, Reviewer 2, … — resolving names from a pre-fetched map. */
  private buildQueueExpertNames(
    queue: any[] | undefined,
    names: Map<string, string>,
  ): string[] {
    return (queue ?? []).map((q, i) => {
      const id = q?.toString();
      const name = (id && names.get(id)) || 'Unknown';
      const level = i === 0 ? 'Author' : `Reviewer ${i}`;
      return `${name} (${level})`;
    });
  }

  /** Format an answer's sources into a newline-separated cell for the Excel report. */
  private formatAnswerSources(
    sources?: {source: string; sourceName?: string; page?: string | number}[],
  ): string {
    if (!sources?.length) return '';
    return sources
      .map(s => {
        const label = s.sourceName?.trim();
        const page =
          s.page != null && String(s.page).trim() ? ` (p.${s.page})` : '';
        const src = (s.source ?? '').toString().trim();
        if (!label && !src) return '';
        return label ? `${label}: ${src}${page}` : `${src}${page}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  /** Resolve expert ids → display names in a single batched lookup. */
  private async resolveExpertNames(
    ids: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return map;
    const users = await this.userRepo.getUsersByIds(unique);
    for (const u of users) {
      const name =
        `${(u as any).firstName ?? ''} ${(u as any).lastName ?? ''}`.trim();
      map.set(u._id.toString(), name || (u as any).email || 'Unknown');
    }
    return map;
  }

  /** Server-side paginated single Queue-Details section: exact total `count`
   *  plus only the requested page of `items` (default 50). Touches no allocation
   *  state and reuses the same queries the reallocation cron relies on. */
  async getQueueSection(
    section: QueueSectionName,
    page = 1,
    limit = 50,
    startTime?: Date,
    endTime?: Date,
  ): Promise<QueueSectionResult> {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 50), 200);
    const skip = (safePage - 1) * safeLimit;

    // Manual expert sections (suffix "Manual") reuse the time-bound section logic but
    // scoped to MANUAL_SOURCES (AGRI_EXPERT/OUTREACH) with the not-yet-PAE-reviewed
    // filter, mirroring the manual single-allocation cron. Moderator ...Manual sections
    // have their own dedicated cases and are NOT remapped here.
    const EXPERT_SECTIONS = new Set([
      'received', 'autoAllocateOff', 'autoAllocateOpen', 'autoAllocateDelayed',
      'allocated', 'waiting', 'freeExperts', 'stuck', 'needsReviewer', 'openedIdle', 'totalWork',
    ]);
    let baseSection: string = section;
    let expertSources: QuestionSource[] = TIME_BOUND_SOURCES;
    let requirePaeNotDone = false;
    if (section.endsWith('Manual')) {
      const stripped = section.slice(0, -'Manual'.length);
      if (EXPERT_SECTIONS.has(stripped)) {
        baseSection = stripped;
        expertSources = MANUAL_SOURCES;
        requirePaeNotDone = true;
      }
    }

    switch (baseSection as QueueSectionName) {
      case 'received':
      case 'autoAllocateOff':
      case 'autoAllocateOpen':
      case 'autoAllocateDelayed': {
        // Use baseSection (suffix-stripped) so the ...Manual variants map to the same
        // kind as their base section — otherwise 'autoAllocateDelayedManual' etc. fall
        // through to 'autoOff' and wrongly include open questions.
        const kind =
          baseSection === 'received'
            ? 'received'
            : baseSection === 'autoAllocateOpen'
              ? 'autoAllocateOpen'
              : baseSection === 'autoAllocateDelayed'
                ? 'autoAllocateDelayed'
                : 'autoOff';
        const {count, items} = await this.questionRepo.getQueueQuestionSection(
          kind,
          skip,
          safeLimit,
          startTime,
          endTime,
          expertSources,
          requirePaeNotDone,
        );
        return {count, items: items.map(r => this.rawToQueueItem(r))};
      }

      case 'allocated': {
        const {count, items} = await this.questionRepo.getQueueQuestionSection(
          'allocated',
          skip,
          safeLimit,
          startTime,
          endTime,
          expertSources,
          requirePaeNotDone,
        );
        const byQuestion = new Map<string, string | null>();
        const ids: string[] = [];
        for (const r of items) {
          const id = this.derivePendingAssigneeId(r.queue, r.history as any);
          byQuestion.set(r._id?.toString() ?? '', id);
          if (id) ids.push(id);
          for (const q of r.queue ?? []) ids.push(q?.toString());
        }
        const names = await this.resolveExpertNames(ids);
        return {
          count,
          items: items.map(r => {
            const id = byQuestion.get(r._id?.toString() ?? '');
            // Allocated: show plain names (no Author/Reviewer level) and a single
            // status for the current person — 'completed' if no one is pending,
            // otherwise 'waiting' for that person's response.
            return {
              ...this.rawToQueueItem(r),
              expertName: id ? (names.get(id) ?? 'Unknown') : undefined,
              queueExpertNames: (r.queue ?? []).map(
                q => names.get(q?.toString()) ?? 'Unknown',
              ),
              lastPersonStatus: id ? 'waiting' : 'completed',
            };
          }),
        };
      }

      case 'waiting': {
        // Same method (and therefore the same number) the cron logs as
        // "Never-allocated". No date filter / no DB-side limit — paginate the
        // full list in memory so the count always matches the console.
        const subs =
          (await this.questionSubmissionRepo.findUnallocatedTimeBoundQuestions(
            expertSources,
            requirePaeNotDone,
          )) as any[];
        const pageSubs = subs.slice(skip, skip + safeLimit);
        return {
          count: subs.length,
          items: pageSubs.map(s => this.submissionToQueueItem(s)),
        };
      }

      case 'freeExperts': {
        const [allExperts, busyMap] = await Promise.all([
          this.userRepo.findExpertsByReputationScore({} as any),
          this.questionSubmissionRepo.getTimeBoundActiveCountPerExpert(
            expertSources,
          ),
        ]);
        // Free = experts with no active time-bound allocation. busyMap is the
        // authoritative "currently holding pending work" set the cron uses.
        const free = (allExperts as any[]).filter(
          e => !busyMap.has(e._id.toString()),
        );
        const items: QueueExpertItem[] = free
          .slice(skip, skip + safeLimit)
          .map(e => ({
            _id: e._id.toString(),
            name:
              `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() ||
              e.email ||
              'Unknown',
            email: e.email,
            reputationScore: e.reputation_score,
            role: e.role,
            isSpecialTaskForce: e.special_task_force === true,
          }));
        return {count: free.length, items};
      }

      case 'stuck': {
        // Same method (and therefore the same number) the cron logs as "Stuck".
        // No date filter so the count always matches the console.
        const stuckSubs =
          (await this.questionSubmissionRepo.findTimeBoundQuestionsForReallocation(
            expertSources,
            requirePaeNotDone,
          )) as any[];
        const count = stuckSubs.length;
        const pageSubs = stuckSubs.slice(skip, skip + safeLimit);
        const byQuestion = new Map<string, string | null>();
        const ids: string[] = [];
        for (const sub of pageSubs) {
          const id = this.deriveCurrentExpertId(sub.queue, sub.history);
          const qId = (sub.question?._id ?? sub.questionId)?.toString() ?? '';
          byQuestion.set(qId, id);
          if (id) ids.push(id);
          for (const q of sub.queue ?? []) ids.push(q?.toString());
        }
        const names = await this.resolveExpertNames(ids);
        const now = Date.now();
        const items: QueueQuestionItem[] = pageSubs.map(sub => {
          const item = this.submissionToQueueItem(sub);
          const id = byQuestion.get(item._id ?? '');
          const allocatedAt = sub.currentExpertAllocatedAt ?? null;
          return {
            ...item,
            expertName: id ? (names.get(id) ?? 'Unknown') : undefined,
            queueExpertNames: this.buildQueueExpertNames(sub.queue, names),
            allocatedAt,
            minutesSinceAllocated: allocatedAt
              ? Math.floor((now - new Date(allocatedAt).getTime()) / 60000)
              : undefined,
          };
        });
        return {count, items};
      }

      case 'openedIdle': {
        // Opened by the current expert > 45 min ago but still no answer. No date
        // filter, mirroring the other time-bound sections.
        const subs =
          (await this.questionSubmissionRepo.findOpenedButIdleTimeBoundQuestions(
            expertSources,
          )) as any[];
        const count = subs.length;
        const pageSubs = subs.slice(skip, skip + safeLimit);
        const byQuestion = new Map<string, string | null>();
        const ids: string[] = [];
        for (const sub of pageSubs) {
          const id = this.deriveCurrentExpertId(sub.queue, sub.history);
          const qId = (sub.question?._id ?? sub.questionId)?.toString() ?? '';
          byQuestion.set(qId, id);
          if (id) ids.push(id);
          for (const q of sub.queue ?? []) ids.push(q?.toString());
        }
        const names = await this.resolveExpertNames(ids);
        const now = Date.now();
        const items: QueueQuestionItem[] = pageSubs.map(sub => {
          const item = this.submissionToQueueItem(sub);
          const id = byQuestion.get(item._id ?? '');
          const openedAt = sub.currentExpertOpenedAt ?? null;
          return {
            ...item,
            expertName: id ? (names.get(id) ?? 'Unknown') : undefined,
            queueExpertNames: this.buildQueueExpertNames(sub.queue, names),
            openedAt,
            minutesSinceOpened: openedAt
              ? Math.floor((now - new Date(openedAt).getTime()) / 60000)
              : undefined,
          };
        });
        return {count, items};
      }

      case 'needsReviewer': {
        // Same method (and therefore the same number) the cron logs as
        // "NeedReviewer": answered/reviewed questions still awaiting the next
        // reviewer. No date filter so the count always matches the console.
        const subs =
          (await this.questionSubmissionRepo.findAnsweredQuestionsNeedingReviewer(
            expertSources,
            requirePaeNotDone,
          )) as any[];
        const count = subs.length;
        const pageSubs = subs.slice(skip, skip + safeLimit);
        // Show every expert who completed a step on the question, in turn order (each
        // history entry's `updatedBy`), rather than only the last completer.
        const byQuestion = new Map<string, string[]>();
        const ids: string[] = [];
        for (const sub of pageSubs) {
          const completedIds = (sub.history ?? [])
            .map((h: any) => h?.updatedBy?.toString())
            .filter((id: string | undefined): id is string => Boolean(id));
          const qId = (sub.question?._id ?? sub.questionId)?.toString() ?? '';
          byQuestion.set(qId, completedIds);
          ids.push(...completedIds);
          for (const q of sub.queue ?? []) ids.push(q?.toString());
        }
        const names = await this.resolveExpertNames(ids);
        const items: QueueQuestionItem[] = pageSubs.map(sub => {
          const item = this.submissionToQueueItem(sub);
          const completedIds = byQuestion.get(item._id ?? '') ?? [];
          const completedExpertNames = completedIds.map(
            id => names.get(id) ?? 'Unknown',
          );
          return {
            ...item,
            completedExpertNames,
            queueExpertNames: this.buildQueueExpertNames(sub.queue, names),
            // Keep expertName as the most recent completer for backward compatibility.
            expertName: completedExpertNames[completedExpertNames.length - 1],
          };
        });
        return {count, items};
      }

      case 'totalWork': {
        // Everything the time-bound cron acts on: stuck + unallocated + needsReviewer,
        // mirroring reallocateTimeBoundQuestions' `totalWork`. The date range is ignored
        // (same as the cron) so this includes ALL such questions. Each item is tagged
        // with its workType so the UI can show which bucket it came from.
        const [stuckSubs, unallocatedSubs, reviewerSubs] = await Promise.all([
          this.questionSubmissionRepo.findTimeBoundQuestionsForReallocation(
            expertSources,
            requirePaeNotDone,
          ),
          this.questionSubmissionRepo.findUnallocatedTimeBoundQuestions(
            expertSources,
            requirePaeNotDone,
          ),
          this.questionSubmissionRepo.findAnsweredQuestionsNeedingReviewer(
            expertSources,
            requirePaeNotDone,
          ),
        ]);

        type Tagged = {
          sub: any;
          workType: 'stuck' | 'unallocated' | 'needsReviewer';
        };
        const tagged: Tagged[] = [
          ...(stuckSubs as any[]).map(sub => ({
            sub,
            workType: 'stuck' as const,
          })),
          ...(unallocatedSubs as any[]).map(sub => ({
            sub,
            workType: 'unallocated' as const,
          })),
          ...(reviewerSubs as any[]).map(sub => ({
            sub,
            workType: 'needsReviewer' as const,
          })),
        ];

        // Dedupe by questionId (the three states are mutually exclusive, but be safe).
        const byId = new Map<string, Tagged>();
        for (const t of tagged) {
          const qid = (t.sub.questionId ?? t.sub._id)?.toString();
          if (qid && !byId.has(qid)) byId.set(qid, t);
        }

        const all = Array.from(byId.values()).sort((a, b) => {
          const at = new Date(
            a.sub.question?.createdAt ?? a.sub.createdAt ?? 0,
          ).getTime();
          const bt = new Date(
            b.sub.question?.createdAt ?? b.sub.createdAt ?? 0,
          ).getTime();
          return bt - at;
        });

        const count = all.length;
        const pageSubs = all.slice(skip, skip + safeLimit);
        const items: QueueQuestionItem[] = pageSubs.map(t => ({
          ...this.submissionToQueueItem(t.sub),
          workType: t.workType,
        }));
        return {count, items};
      }

      case 'moderatorWaiting': {
        // Same method (and therefore the same number) the moderator-queue cron uses:
        // in-review/duplicate questions with no moderator assigned yet. No date
        // filter so the count always matches what the cron picks up.
        const qs =
          (await this.questionRepo.findUnassignedInReviewQuestions()) as any[];
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        // Map a full question doc through the submission mapper (wraps it as `.question`).
        return {
          count,
          items: pageQs.map(q => this.submissionToQueueItem({question: q})),
        };
      }

      case 'moderatorAllocated': {
        // Questions currently assigned to a moderator (moderatorId set). Re-routed
        // questions always carry a moderatorId, so they appear here too. Each item
        // is tagged with the assigned moderator's name.
        const qs =
          (await this.questionRepo.findModeratorAssignedQuestions()) as any[];
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        const ids = pageQs
          .map(q => q.moderatorId?.toString())
          .filter(Boolean) as string[];
        const names = await this.resolveExpertNames(ids);
        const items: QueueQuestionItem[] = pageQs.map(q => ({
          ...this.submissionToQueueItem({question: q}),
          moderatorName: q.moderatorId
            ? (names.get(q.moderatorId.toString()) ?? 'Unknown')
            : undefined,
        }));
        return {count, items};
      }

      case 'availableModerators': {
        // Same method (and therefore the same pool) the moderator-queue cron assigns
        // from: STF moderators with no question currently assigned.
        const mods =
          (await this.userRepo.findAvailableStfModerators()) as any[];
        const items: QueueExpertItem[] = mods
          .slice(skip, skip + safeLimit)
          .map(m => ({
            _id: m._id.toString(),
            name:
              `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() ||
              m.email ||
              'Unknown',
            email: m.email,
            reputationScore: m.reputation_score,
            role: m.role,
            isSpecialTaskForce: m.special_task_force === true,
          }));
        return {count: mods.length, items};
      }

      // ── Source-split moderator-queue sections (time-bound vs manual) ──
      // Same data as the three sections above, scoped to one source group so the UI
      // can show the moderator queue split into Time-bound / Manual.
      case 'moderatorWaitingTimeBound':
      case 'moderatorWaitingManual': {
        const sources =
          section === 'moderatorWaitingTimeBound'
            ? TIME_BOUND_SOURCES
            : MANUAL_SOURCES;
        const qs = (await this.questionRepo.findUnassignedInReviewQuestions(
          sources,
        )) as any[];
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        return {
          count,
          items: pageQs.map(q => this.submissionToQueueItem({question: q})),
        };
      }

      case 'moderatorAllocatedTimeBound':
      case 'moderatorAllocatedManual': {
        const sources =
          section === 'moderatorAllocatedTimeBound'
            ? TIME_BOUND_SOURCES
            : MANUAL_SOURCES;
        const qs = (await this.questionRepo.findModeratorAssignedQuestions(
          sources,
        )) as any[];
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        const ids = pageQs
          .map(q => q.moderatorId?.toString())
          .filter(Boolean) as string[];
        const names = await this.resolveExpertNames(ids);
        const items: QueueQuestionItem[] = pageQs.map(q => ({
          ...this.submissionToQueueItem({question: q}),
          moderatorName: q.moderatorId
            ? (names.get(q.moderatorId.toString()) ?? 'Unknown')
            : undefined,
        }));
        return {count, items};
      }

      case 'availableModeratorsTimeBound':
      case 'availableModeratorsManual': {
        const sources =
          section === 'availableModeratorsTimeBound'
            ? TIME_BOUND_SOURCES
            : MANUAL_SOURCES;
        const mods = (await this.userRepo.findAvailableStfModeratorsForSources(
          sources,
        )) as any[];
        const items: QueueExpertItem[] = mods
          .slice(skip, skip + safeLimit)
          .map(m => ({
            _id: m._id.toString(),
            name:
              `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() ||
              m.email ||
              'Unknown',
            email: m.email,
            reputationScore: m.reputation_score,
            role: m.role,
            isSpecialTaskForce: m.special_task_force === true,
          }));
        return {count: mods.length, items};
      }

      default:
        return {count: 0, items: []};
    }
  }

  /** Moderator/admin "Queue Details" — counts for all sections plus the first
   *  page (50) of each. Subsequent pages are fetched via getQueueSection.
   *  Touches no allocation state. The time-bound sections (waiting, stuck,
   *  needsReviewer) ignore the date range so their counts match the cron logs. */
  async getQueueDetails(
    startTime?: Date,
    endTime?: Date,
  ): Promise<QueueDetailsResponse> {
    const PAGE = 1;
    const LIMIT = 50;
    // Run each section independently so one failing section logs which one broke and
    // returns an empty result, rather than 500ing the whole queue-details endpoint.
    const safe = async (
      section: QueueSectionName,
    ): Promise<QueueSectionResult> => {
      try {
        return await this.getQueueSection(
          section,
          PAGE,
          LIMIT,
          startTime,
          endTime,
        );
      } catch (err: any) {
        console.error(
          `[getQueueDetails] section '${section}' failed:`,
          err?.message,
          err?.stack?.split('\n')?.slice(0, 4)?.join('\n'),
        );
        return {count: 0, items: []};
      }
    };
    const [
      received,
      autoAllocateOff,
      autoAllocateOpen,
      autoAllocateDelayed,
      allocated,
      waiting,
      freeExperts,
      stuck,
      needsReviewer,
      totalWork,
      openedIdle,
      moderatorWaiting,
      moderatorAllocated,
      availableModerators,
      moderatorWaitingTimeBound,
      moderatorWaitingManual,
      moderatorAllocatedTimeBound,
      moderatorAllocatedManual,
      availableModeratorsTimeBound,
      availableModeratorsManual,
      receivedStatusCounts,
      // Manual expert-queue sections (AGRI_EXPERT/OUTREACH single-allocation)
      receivedManual,
      autoAllocateOffManual,
      autoAllocateOpenManual,
      autoAllocateDelayedManual,
      allocatedManual,
      waitingManual,
      freeExpertsManual,
      stuckManual,
      needsReviewerManual,
      openedIdleManual,
      receivedStatusCountsManual,
    ] = await Promise.all([
      safe('received'),
      safe('autoAllocateOff'),
      safe('autoAllocateOpen'),
      safe('autoAllocateDelayed'),
      safe('allocated'),
      safe('waiting'),
      safe('freeExperts'),
      safe('stuck'),
      safe('needsReviewer'),
      safe('totalWork'),
      safe('openedIdle'),
      safe('moderatorWaiting'),
      safe('moderatorAllocated'),
      safe('availableModerators'),
      safe('moderatorWaitingTimeBound'),
      safe('moderatorWaitingManual'),
      safe('moderatorAllocatedTimeBound'),
      safe('moderatorAllocatedManual'),
      safe('availableModeratorsTimeBound'),
      safe('availableModeratorsManual'),
      // Separate aggregation — not a paginatable section, so call directly
      this.questionRepo
        .getReceivedStatusCounts(startTime, endTime)
        .catch((err: any) => {
          console.error(
            '[getQueueDetails] receivedStatusCounts failed:',
            err?.message,
          );
          return [] as {status: string; count: number}[];
        }),
      safe('receivedManual'),
      safe('autoAllocateOffManual'),
      safe('autoAllocateOpenManual'),
      safe('autoAllocateDelayedManual'),
      safe('allocatedManual'),
      safe('waitingManual'),
      safe('freeExpertsManual'),
      safe('stuckManual'),
      safe('needsReviewerManual'),
      safe('openedIdleManual'),
      this.questionRepo
        .getReceivedStatusCounts(startTime, endTime, MANUAL_SOURCES)
        .catch((err: any) => {
          console.error(
            '[getQueueDetails] receivedStatusCountsManual failed:',
            err?.message,
          );
          return [] as {status: string; count: number}[];
        }),
    ]);

    return {
      received: received as QueueDetailsResponse['received'],
      receivedStatusCounts:
        receivedStatusCounts as QueueDetailsResponse['receivedStatusCounts'],
      autoAllocateOff:
        autoAllocateOff as QueueDetailsResponse['autoAllocateOff'],
      autoAllocateOpen:
        autoAllocateOpen as QueueDetailsResponse['autoAllocateOpen'],
      autoAllocateDelayed:
        autoAllocateDelayed as QueueDetailsResponse['autoAllocateDelayed'],
      allocated: allocated as QueueDetailsResponse['allocated'],
      waiting: waiting as QueueDetailsResponse['waiting'],
      freeExperts: freeExperts as QueueDetailsResponse['freeExperts'],
      stuck: stuck as QueueDetailsResponse['stuck'],
      needsReviewer: needsReviewer as QueueDetailsResponse['needsReviewer'],
      totalWork: totalWork as QueueDetailsResponse['totalWork'],
      openedIdle: openedIdle as QueueDetailsResponse['openedIdle'],
      moderatorWaiting:
        moderatorWaiting as QueueDetailsResponse['moderatorWaiting'],
      moderatorAllocated:
        moderatorAllocated as QueueDetailsResponse['moderatorAllocated'],
      availableModerators:
        availableModerators as QueueDetailsResponse['availableModerators'],
      moderatorWaitingTimeBound:
        moderatorWaitingTimeBound as QueueDetailsResponse['moderatorWaitingTimeBound'],
      moderatorWaitingManual:
        moderatorWaitingManual as QueueDetailsResponse['moderatorWaitingManual'],
      moderatorAllocatedTimeBound:
        moderatorAllocatedTimeBound as QueueDetailsResponse['moderatorAllocatedTimeBound'],
      moderatorAllocatedManual:
        moderatorAllocatedManual as QueueDetailsResponse['moderatorAllocatedManual'],
      availableModeratorsTimeBound:
        availableModeratorsTimeBound as QueueDetailsResponse['availableModeratorsTimeBound'],
      availableModeratorsManual:
        availableModeratorsManual as QueueDetailsResponse['availableModeratorsManual'],

      // ── Manual expert-queue sections ──
      receivedManual: receivedManual as QueueDetailsResponse['receivedManual'],
      receivedStatusCountsManual:
        receivedStatusCountsManual as QueueDetailsResponse['receivedStatusCountsManual'],
      autoAllocateOffManual:
        autoAllocateOffManual as QueueDetailsResponse['autoAllocateOffManual'],
      autoAllocateOpenManual:
        autoAllocateOpenManual as QueueDetailsResponse['autoAllocateOpenManual'],
      autoAllocateDelayedManual:
        autoAllocateDelayedManual as QueueDetailsResponse['autoAllocateDelayedManual'],
      allocatedManual: allocatedManual as QueueDetailsResponse['allocatedManual'],
      waitingManual: waitingManual as QueueDetailsResponse['waitingManual'],
      freeExpertsManual:
        freeExpertsManual as QueueDetailsResponse['freeExpertsManual'],
      stuckManual: stuckManual as QueueDetailsResponse['stuckManual'],
      needsReviewerManual:
        needsReviewerManual as QueueDetailsResponse['needsReviewerManual'],
      openedIdleManual:
        openedIdleManual as QueueDetailsResponse['openedIdleManual'],
    };
  }
}
