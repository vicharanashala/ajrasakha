import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { IQuestionReportService } from '../interfaces/IQuestionReportService.js';
import { IPaeValidationService } from '../interfaces/IPaeValidationService.js';
import { IFeedbackService } from '../interfaces/IFeedbackService.js';
import { IQuestionAiService } from '../interfaces/IQuestionAiService.js';
import { IDuplicateService } from '../interfaces/IDuplicateService.js';
import { resolveExpertMeta } from './helpers/reportHelpers.js';
import { queueCropName, submissionToQueueItem } from './helpers/queueItem.js';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject, injectable } from 'inversify';
import { ClientSession, ObjectId } from 'mongodb';
import { startBalanceWorkloadWorkers } from '#root/workers/balanceWorkload.manager.js';
import { startPaeAllocationWorker } from '#root/workers/paeAllocation.manager.js';
import { startBulkDeleteWorker } from '#root/workers/bulkDelete.manager.js';
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
  UserRole,
  TIME_BOUND_SOURCES,
  MANUAL_SOURCES,
  IFeedback,
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
import { AiService } from '#root/modules/ai/services/AiService.js';
import {
  AddQuestionBodyDto,
  AllocatedQuestionsBodyDto,
  DetailedQuestionsBodyDto,
  GeneratedQuestionResponse,
  GetDetailedQuestionsQuery,
  QuestionResponse,
} from '../classes/validators/QuestionVaidators.js';
import { PreferenceDto } from '#root/modules/user/validators/UserValidators.js';
import { QuestionLevelResponse } from '#root/modules/question/classes/transformers/QuestionLevel.js';
import { NotificationService } from '#root/modules/notification/services/NotificationService.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import {
  IQuestionService,
  QueueDetailsResponse,
  QueueQuestionItem,
  QueueExpertItem,
  QueueSectionName,
  QueueSectionResult,
  RawQueueQuestionRow,
} from '../interfaces/IQuestionService.js';
import { isToday } from '#root/utils/date.utils.js';
import { UserService } from '#root/modules/user/services/UserService.js';
import { IReRouteRepository } from '#root/shared/database/interfaces/IReRouteRepository.js';
import { sendEmailWithAttachment } from '#root/utils/mailer.js';
import ExcelJS from 'exceljs';
import { cosineSimilarity } from '../../../utils/cosine-similarity.js';
import { IDuplicateQuestionRepository } from '#root/shared/database/interfaces/IDuplicateQuestionRepository.js';
import { IFeedbackRepository } from '#root/shared/database/interfaces/IFeedbackRepository.js';
import { chatbotSimilarityLogger } from '../logger/chatbot-similarity.logger.js';
import { ICropRepository } from '#root/shared/database/interfaces/ICropRepository.js';
import { CHATBOT_TYPES } from '#root/modules/chatbot/types.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { IChatbotRepository } from '#root/shared/database/interfaces/IChatbotRepository.js';
import { toObjectIdArray } from '#root/utils/normalizeToObjectIdArray.js';
import { runDuplicateCheckPipeline } from './helpers/duplicatePipeline.js';
import {
  DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT,
  TOTAL_EXPERTS_LIMIT,
} from '#root/shared/constants/general.js';
import { toTitleCase } from '#root/utils/ToTitlecase.js';
import axios from 'axios';

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

    @inject(CORE_TYPES.FeedbackRepository)
    private readonly feedbackRepo: IFeedbackRepository,

    @inject(GLOBAL_TYPES.QuestionReportService)
    private readonly questionReportService: IQuestionReportService,

    @inject(GLOBAL_TYPES.PaeValidationService)
    private readonly paeValidationService: IPaeValidationService,

    @inject(GLOBAL_TYPES.FeedbackService)
    private readonly feedbackService: IFeedbackService,

    @inject(GLOBAL_TYPES.QuestionAiService)
    private readonly questionAiService: IQuestionAiService,

    @inject(GLOBAL_TYPES.DuplicateService)
    private readonly duplicateService: IDuplicateService,
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

  private isQuestionUserTrainingTypeMatch(
    user: IUser,
    question: IQuestion,
  ): boolean {
    return (
      (question.isTrainingQuestion === true) === (user.isTrainingUser === true)
    );
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

  /** Standardise a state name across all questions: any question whose details.state matches
   *  one of `currentValues` (e.g. "punjab", "PUNJAB", "पंजाब") is set to `standardizedTo`
   *  (e.g. "Punjab"). Returns how many matched/were modified. */
  async normalizeQuestionState(
    currentValues: string[],
    standardizedTo: string,
  ): Promise<{matched: number; modified: number}> {
    const cleaned = (currentValues ?? [])
      .map(v => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    const target = (standardizedTo ?? '').trim();
    if (cleaned.length === 0) {
      throw new BadRequestError(
        'current values must be a non-empty array of strings',
      );
    }
    if (!target) {
      throw new BadRequestError('standardizedTo is required');
    }
    return this._withTransaction(async (session: ClientSession) => {
      return this.questionRepo.normalizeQuestionState(cleaned, target, session);
    });
  }

  /** Standardise question district names, validating each `standardiseTo` against the
   *  `districts` collection (districtNameEnglish). Matching ones update questions whose
   *  details.district === existingName; non-matching names are returned untouched. */
  async normalizeQuestionDistricts(
    mappings: {existingName: string; standardiseTo: string}[],
  ) {
    const cleaned = (mappings ?? [])
      .map(m => ({
        existingName:
          typeof m?.existingName === 'string' ? m.existingName.trim() : '',
        standardiseTo:
          typeof m?.standardiseTo === 'string' ? m.standardiseTo.trim() : '',
      }))
      .filter(m => m.existingName && m.standardiseTo);
    if (cleaned.length === 0) {
      throw new BadRequestError(
        'mappings must be a non-empty array of { existingName, standardiseTo }',
      );
    }
    return this.questionRepo.normalizeQuestionDistricts(cleaned);
  }

  /** Audit: distinct question details.state / details.district values that don't exist in the
   *  states / districts collections. */
  async findUnknownQuestionGeo(): Promise<{
    unknownStates: string[];
    matchedDistricts: {
      name: string;
      foundIn: 'block' | 'village';
      districtCode: number | null;
      stateCode: number | null;
      districtNameEnglish: string | null;
    }[];
    notMatchingDistricts: string[];
  }> {
    return this.questionRepo.findUnknownQuestionGeo();
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
  ): Promise<{
    questions: IQuestion[];
    totalPages: number;
    feedbackQuestions?: IQuestion[];
  }> {
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

    const result = await this.questionRepo.findDetailedQuestions(
      {
        ...query,
        searchEmbedding,
      },
      body,
    );

    // Check if this is a dedicated view (moderator/gatekeeper/auditor assigned questions)
    const {moderatorId, gateKeeperId, auditorId} = query;
    const assignedUserId = moderatorId || gateKeeperId || auditorId;
    if (assignedUserId) {
      try {
        const user = await this.userRepo.findById(assignedUserId);
        const feedbacksAssigned = user?.feedbacksAssigned;
        if (feedbacksAssigned && feedbacksAssigned.length > 0) {
          // Fetch the feedback questions
          const feedbackQuestionIds = feedbacksAssigned.map(id => {
            if (typeof id === 'string') return new ObjectId(id);
            return id;
          });

          const feedbackQuestions =
            await this.questionRepo.findByIds(feedbackQuestionIds);
          const feedbackQuestionsWithFlag = feedbackQuestions.map(q => ({
            ...q,
            isFeedbackQuestion: true,
          }));

          return {
            ...result,
            feedbackQuestions: feedbackQuestionsWithFlag,
          };
        }
      } catch (err) {
        console.error('Error fetching feedback questions:', err);
      }
    }

    return result;
  }

  // ── AI / ACC-agent helpers delegate to QuestionAiService ──
  async getQuestionFromRawContext(context: string) {
    return this.questionAiService.getQuestionFromRawContext(context);
  }

  async getQuestionFromCallContext(
    context: string,
    state?: string,
    crop?: string,
  ) {
    return this.questionAiService.getQuestionFromCallContext(
      context,
      state,
      crop,
    );
  }

  async getCallSummary(query: string) {
    return this.questionAiService.getCallSummary(query);
  }

  async createAccAgentThread() {
    return this.questionAiService.createAccAgentThread();
  }

  async extractAccAgentData(threadId: string, transcript: string) {
    return this.questionAiService.extractAccAgentData(threadId, transcript);
  }

  async updateAccAgentState(
    threadId: string,
    correctedData: Parameters<
      IQuestionAiService['updateAccAgentState']
    >[1],
  ) {
    return this.questionAiService.updateAccAgentState(threadId, correctedData);
  }

  async resumeAccAgentAndGetAnswer(
    threadId: string,
    callUuid?: string,
    metadata?: Parameters<
      IQuestionAiService['resumeAccAgentAndGetAnswer']
    >[2],
  ) {
    return this.questionAiService.resumeAccAgentAndGetAnswer(
      threadId,
      callUuid,
      metadata,
    );
  }

  async getAccAgentState(
    threadId: string,
    callUuid?: string,
    metadata?: Parameters<IQuestionAiService['getAccAgentState']>[2],
  ) {
    return this.questionAiService.getAccAgentState(threadId, callUuid, metadata);
  }

  // ── Duplicate detection delegates to DuplicateService ──
  async checkDuplicateQuestion(
    baseQuestion: IQuestion,
    details: IQuestion['details'],
    logData: Record<string, any>,
    session?: ClientSession,
  ) {
    return this.duplicateService.checkDuplicateQuestion(
      baseQuestion,
      details,
      logData,
      session,
    );
  }

  async manualCheckDuplicate(questionId: string) {
    return this.duplicateService.manualCheckDuplicate(questionId);
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
      const isTrainingQuestion = body.isTrainingQuestion === true;

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
        body.details.district = toTitleCase(body.details.district as string);
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
      // Store state/district/crop in Title Case (e.g. "andhra pradesh" -> "Andhra Pradesh").
      details.crop = toTitleCase(rawCropName);
      details.state = toTitleCase(details.state);
      if (typeof details.district === 'string')
        details.district = toTitleCase(details.district);
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
          // New questions are eligible for gate-keeper / auditor auto-allocation by
          // default; the cron only picks them up once they reach a matching status.
          autoAllocateGateKeeper: true,
          autoAllocateAuditor: true,
          embedding: textEmbedding,
          metrics: null,
          aiInitialAnswer,
          text,
          toolsUsed,
          createdAt: new Date(),
          updatedAt: new Date(),
          isTrainingQuestion,
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
            const result = await runDuplicateCheckPipeline(
              this.aiService,
              baseQuestion,
              details,
              logData,
            );

            const refId =
              result.referenceQuestionId instanceof ObjectId
                ? result.referenceQuestionId
                : result.referenceQuestionId
                  ? new ObjectId(String(result.referenceQuestionId))
                  : null;

            // 1. Duplicate
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

            // 2. Found in the GDB pending-duplicate queue → carry the matched reference
            //    details and turn auto-allocate off.
            if (result.isQueueDuplicate) {
              await this.questionRepo.updateQuestion(questionId, {
                status: 'queue_duplicate',
                isAutoAllocate: false,
                similarityScore: result.similarityScore,
                referenceQuestionId: refId,
                referenceQuestion: result.referenceQuestion,
                referenceSource: result.referenceSource,
              });
              return;
            }

            // 3. Non-agri (LLM) → non_agri, else → open.
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
              '[processQuestionInBackground] duplicate/queue pipeline failed, proceeding as open:',
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

        const moderators = [...allModerators, ...taskForceModerators].filter(
          moderator => moderator.isTrainingUser !== true,
        );

        await Promise.all(
          moderators.map((moderator: any) =>
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

  async ensureNormalisedLocation(
    questionId: string,
    session?: ClientSession,
  ): Promise<{valid: true}> {
    const question = await this.questionRepo.getById(questionId, session);
    const rawState = question.details?.state?.trim() ?? '';
    const rawDistrict = question.details?.district?.trim() ?? '';

    // ── State validation ──────────────────────────────────────────────────────
    if (rawState) {
      const statesCollection = await this.mongoDatabase.getCollection<{
        stateNameEnglish: string;
        aliases?: string[];
      }>('states');

      // Build a map: lowercase alias → canonical stateNameEnglish
      const allStates = await statesCollection.find({}).toArray();
      const aliasToState = new Map<string, string>();
      for (const s of allStates) {
        const canonical = s.stateNameEnglish;
        // Map the canonical name itself (case-insensitive)
        aliasToState.set(canonical.toLowerCase(), canonical);
        // Map each alias
        for (const alias of s.aliases ?? []) {
          aliasToState.set(alias.toLowerCase(), canonical);
        }
      }

      const stateKey = rawState.toLowerCase();
      const normalisedState = aliasToState.get(stateKey);

      if (!normalisedState) {
        throw new BadRequestError(
          `This question's state "${rawState}" is not registered in the system. Please add the correct state from the LGD Management section before approving this answer.`,
        );
      }

      // Update if the canonical name differs from the raw value
      if (normalisedState !== rawState) {
        await this.questionRepo.updateQuestion(
          questionId,
          {'details.state': normalisedState} as any,
          session,
        );
      }
    }

    // ── District validation ───────────────────────────────────────────────────
    if (rawDistrict) {
      const districtsCollection = await this.mongoDatabase.getCollection<{
        districtNameEnglish: string;
        aliases?: string[];
      }>('districts');

      // Build a map: lowercase alias → canonical districtNameEnglish
      const allDistricts = await districtsCollection.find({}).toArray();
      const aliasToDistrict = new Map<string, string>();
      for (const d of allDistricts) {
        const canonical = d.districtNameEnglish;
        // Map the canonical name itself (case-insensitive)
        aliasToDistrict.set(canonical.toLowerCase(), canonical);
        // Map each alias
        for (const alias of d.aliases ?? []) {
          aliasToDistrict.set(alias.toLowerCase(), canonical);
        }
      }

      const districtKey = rawDistrict.toLowerCase();
      const normalisedDistrict = aliasToDistrict.get(districtKey);

      if (!normalisedDistrict) {
        throw new BadRequestError(
          `This question's district "${rawDistrict}" is not registered in the system. Please add the correct district from the LGD Management section before approving this answer.`,
        );
      }

      // Update if the canonical name differs from the raw value
      if (normalisedDistrict !== rawDistrict) {
        await this.questionRepo.updateQuestion(
          questionId,
          {'details.district': normalisedDistrict} as any,
          session,
        );
      }
    }

    return {valid: true};
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
      const result = await this._withTransaction(
        async (session: ClientSession) => {
          const existingQuestion = await this.questionRepo.getById(
            questionId,
            session,
          );

          if (!existingQuestion) {
            throw new BadRequestError(
              `Question with ID ${questionId} not found`,
            );
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
            await this.ensureNormalisedLocation(questionId, session);
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
          // Auditor "Notify User" flow closes dynamic questions as `dynamic_closed` and
          // duplicate questions as `duplicate_closed`. Stamp closedAt/isClosed just like the
          // regular `closed` transition so analytics and closed-question filters treat them
          // consistently.
          if (
            updates.status === 'dynamic_closed' ||
            updates.status === 'duplicate_closed'
          ) {
            updates.isClosed = true;
            updates.paeValidation = 'pending';
            updates.autoAllocatePaeValidationExpert = true;
            if (!updates.closedAt) updates.closedAt = new Date();
          }
          const updateResult = await this.questionRepo.updateQuestion(
            questionId,
            updates,
            session,
          );

          // In-transaction: if the status changed, free any gate keeper / auditor whose
          // handling scope the question has now left (pass / push-to-auditor / close, etc.)
          // so the status change and the release commit atomically — a failure here rolls
          // back the whole update, preventing a stuck assignee. (The queue cron still
          // reconciles as a backstop for any release missed by other paths.)
          if (!threadUpdate && updates.status) {
            await this.freeRoleAssigneeOnStatusChange(
              questionId,
              updates.status,
              session,
            );
          }

          return updateResult;
        },
      );

      return result;
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
    const isTrainingQuestion = question.isTrainingQuestion === true;
    if (isAjrasakha) {
      const users = await this.userRepo.getExpertsWithFallback(
        details,
        session,
      );

      allExpertIds = users
        .filter(user => user.isTrainingUser !== true)
        .map(user => user._id.toString());
    } else {
      const expertTMU = [];
      const expertNormal = [];
      const [users, preferredExperts] = await Promise.all([
        this.userRepo.findAll(),
        this.userRepo.findExpertsByPreference(details, session),
      ]);

      for (const user of users) {
        if (user.role !== 'expert' || user.isBlocked === true) {
          continue;
        }

        if (user.isTrainingUser) {
          expertTMU.push(user);
        } else {
          expertNormal.push(user);
        }
      }

      const eligibleUsers = isTrainingQuestion ? expertTMU : expertNormal;

      const preferredTMU = [];
      const preferredNormal = [];

      for (const user of preferredExperts) {
        if (user.isTrainingUser) {
          preferredTMU.push(user);
        } else {
          preferredNormal.push(user);
        }
      }
      const eligiblePreferredExperts = isTrainingQuestion
        ? preferredTMU
        : preferredNormal;

      const expertIdsSet = new Set<string>();

      // Add preferred experts first to the set to ensure they get priority in allocation
      eligiblePreferredExperts.forEach(user =>
        expertIdsSet.add(user._id.toString()),
      );

      // Add remaining
      eligibleUsers.forEach(user => expertIdsSet.add(user._id.toString()));

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
      // No more experts left to allocate — hand the question off to a moderator
      // (status → in-review, last answer → pending-with-moderator) and stop here:
      // everything below only applies when there are experts to add.
      if (filteredExperts.length === 0) {
        await this.questionRepo.updateQuestion(
          questionId,
          {status: 'in-review'},
          session,
        );
        const payload: Partial<IAnswer> = {
          status: 'pending-with-moderator',
        };

        // The last submission may be an answer, an approval, or a modification —
        // a modified review carries `modifiedAnswer` (not `answer`/`approvedAnswer`).
        // Include it in the fallback so the correct answer is marked pending-with-
        // moderator, and guard against a missing id so this never throws.
        const answer =
          lastSubmission?.answer ||
          lastSubmission?.approvedAnswer ||
          lastSubmission?.modifiedAnswer ||
          lastSubmission?.rejectedAnswer;

        if (answer) {
          await this.answerRepo.updateAnswerStatus(
            answer.toString(),
            payload,
            session,
          );
        }

        return {data: [], status: false};
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
        // If the question is a duplicate and auto-allocate is OFF, it means the
        // moderator intentionally toggled off auto-allocate and is now manually
        // picking an expert. Reopen the question so the selected expert can see
        // it in their dashboard (only open/delayed questions are visible there).
        const updateData: any = {
          firstAllocationAt: new Date(),
        };
        if (question.status === 'duplicate') {
          updateData.status = 'open';
        }

        await this.questionRepo.updateQuestion(questionId, updateData, session);

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
    assigned_gate_keeper: {name: string; email: string} | null;
    assigned_auditor: {name: string; email: string} | null;
    isAssignedModerator: boolean;
    isAssignedGateKeeper: boolean;
    isAssignedAuditor: boolean;
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

      // Resolve the currently assigned gate keeper / auditor (role queue), same as
      // the moderator resolution above.
      let assigned_gate_keeper: {name: string; email: string} | null = null;
      const assignedGateKeeperId = (question as any).gateKeeperId?.toString();
      if (assignedGateKeeperId && ObjectId.isValid(assignedGateKeeperId)) {
        const u = await this.userRepo.findById(assignedGateKeeperId);
        if (u) {
          assigned_gate_keeper = {
            name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
            email: u.email,
          };
        }
      }
      let assigned_auditor: {name: string; email: string} | null = null;
      const assignedAuditorId = (question as any).auditorId?.toString();
      if (assignedAuditorId && ObjectId.isValid(assignedAuditorId)) {
        const u = await this.userRepo.findById(assignedAuditorId);
        if (u) {
          assigned_auditor = {
            name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
            email: u.email,
          };
        }
      }

      // Whether the requesting user is the moderator this question is assigned to.
      // Used by the UI to gate the Pass / Accept / Push to GDB actions.
      const isAssignedModerator =
        !!assignedModeratorId && assignedModeratorId === userId;
      // Same, for the gate keeper / auditor role queues — computed server-side to
      // avoid ObjectId serialization mismatches when comparing ids on the client.
      const isAssignedGateKeeper =
        !!assignedGateKeeperId && assignedGateKeeperId === userId;
      const isAssignedAuditor =
        !!assignedAuditorId && assignedAuditorId === userId;

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
        assigned_gate_keeper,
        assigned_auditor,
        isAssignedModerator,
        isAssignedGateKeeper,
        isAssignedAuditor,
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

  /** Field mapping for the gate-keeper / auditor role assignee on a question. */
  private roleAssigneeFields(role: 'gate_keeper' | 'auditor'): {
    assigneeField: 'gateKeeperId' | 'auditorId';
    assignedAtField: 'gateKeeperAssignedAt' | 'auditorAssignedAt';
    finishedAtField: 'gateKeeperFinishedAt' | 'auditorFinishedAt';
  } {
    return role === 'gate_keeper'
      ? {
          assigneeField: 'gateKeeperId',
          assignedAtField: 'gateKeeperAssignedAt',
          finishedAtField: 'gateKeeperFinishedAt',
        }
      : {
          assigneeField: 'auditorId',
          assignedAtField: 'auditorAssignedAt',
          finishedAtField: 'auditorFinishedAt',
        };
  }

  /**
   * Once a gate keeper / auditor has submitted their response (finishedAt is set) their
   * assignment is settled — reassigning or removing it would orphan work that has already
   * been recorded against them. Callers must re-open the question first.
   */
  private assertRoleNotFinished(
    question: unknown,
    role: 'gate_keeper' | 'auditor',
  ): void {
    const {finishedAtField} = this.roleAssigneeFields(role);
    if ((question as any)?.[finishedAtField]) {
      const noun = role === 'gate_keeper' ? 'gate keeper' : 'auditor';
      throw new BadRequestError(
        `This question's ${noun} has already submitted their response, so the ${noun} can no longer be changed.`,
      );
    }
  }

  /** Dashboard for the logged-in gate keeper / auditor: assigned + submitted counts
   *  plus their paginated question list. "Submitted" = they finished it (finishedAt set).
   *  Supports optional date range filtering by assigned date, completed date, or both. */
  async getRoleAssigneeDashboard(
    userId: string,
    role: 'gate_keeper' | 'auditor',
    page: number,
    limit: number,
    search?: string,
    startDate?: Date,
    endDate?: Date,
    dateFilterType?: 'assigned' | 'completed' | 'both',
  ) {
    const {assigneeField, assignedAtField} = this.roleAssigneeFields(role);
    const finishedField =
      role === 'gate_keeper' ? 'gateKeeperFinishedAt' : 'auditorFinishedAt';
    const result = await this.questionRepo.getRoleAssigneeDashboard(
      userId,
      assigneeField,
      finishedField,
      assignedAtField,
      page,
      limit,
      search,
      startDate,
      endDate,
      dateFilterType,
    );

    // Auditors also review FEEDBACK questions (held in their feedbacksAssigned), so
    // surface those in the dashboard too. Gate keepers never receive feedback.
    // An auditor holds at most one feedback at a time, so appending to the first
    // page and bumping the totals keeps pagination effectively correct.
    if (role === 'auditor') {
      try {
        const user = await this.userRepo.findById(userId);
        const fbAssigned = ((user as any)?.feedbacksAssigned ?? []) as any[];
        if (fbAssigned.length) {
          const fbIds = fbAssigned.map(id =>
            typeof id === 'string' ? new ObjectId(id) : id,
          );
          let fbQuestions = await this.questionRepo.findByIds(fbIds);
          if (search && search.trim()) {
            const s = search.trim().toLowerCase();
            fbQuestions = fbQuestions.filter(q =>
              ((q as any).question ?? '').toLowerCase().includes(s),
            );
          }
          const existing = new Set(
            (result.questions ?? []).map((q: any) => q._id?.toString()),
          );
          const fbToAppend = fbQuestions
            .filter(q => !existing.has(q._id?.toString()))
            .map(q => ({...(q as any), isFeedbackQuestion: true}));
          return {
            ...result,
            assignedCount: result.assignedCount + fbToAppend.length,
            totalCount: result.totalCount + fbToAppend.length,
            questions:
              page === 1
                ? [...fbToAppend, ...result.questions]
                : result.questions,
          };
        }
      } catch (err) {
        console.error(
          '[RoleDashboard] Failed to append auditor feedback questions:',
          err,
        );
      }
    }

    return result;
  }

  /** Manually (re)assign the gate keeper / auditor for a question — mirrors
   *  changeQuestionModerator: pulls the question from the previous assignee's
   *  assignedQuestionIds and appends it to the new assignee's. */
  async changeQuestionRoleAssignee(
    questionId: string,
    role: 'gate_keeper' | 'auditor',
    userId: string,
    actorName?: string,
  ): Promise<void> {
    const {assigneeField, assignedAtField} = this.roleAssigneeFields(role);
    const question = await this.questionRepo.getById(questionId);
    this.assertRoleNotFinished(question, role);
    const previousId = (question as any)?.[assigneeField]?.toString();
    const noun = role === 'gate_keeper' ? 'gate keeper' : 'auditor';

    await this.questionRepo.setRoleAssignee(
      questionId,
      assigneeField,
      assignedAtField,
      userId,
    );

    if (previousId && ObjectId.isValid(previousId) && previousId !== userId) {
      await this.userRepo.removeAssignedQuestion(previousId, questionId);

      // Notify the replaced user that their allocation was taken away, naming who did it.
      try {
        const by = actorName ? ` by ${actorName}` : '';
        await this.notificationService.saveTheNotifications(
          `This question's ${noun} allocation has been removed${by}.`,
          'Allocation Removed',
          questionId,
          previousId,
          'moderator_approval',
        );
      } catch (err: any) {
        console.error(
          `[RoleAssignee] Failed to send reassignment-removal notification for ${questionId} → ${previousId}:`,
          err?.message,
        );
      }
    }
    await this.userRepo.addAssignedQuestion(
      userId,
      questionId,
      ((question as any)?.status ?? 'open') as QuestionStatus,
      (question as any)?.source,
    );

    // Notify the newly-assigned user, mirroring the auto-allocation cron so a manual
    // assignment by a moderator/admin triggers the same "Question Assigned" alert.
    try {
      await this.notificationService.saveTheNotifications(
        role === 'gate_keeper'
          ? 'A question has been assigned to you for review'
          : 'A question has been assigned to you for audit',
        'Question Assigned',
        questionId,
        userId,
        'moderator_approval',
      );
    } catch (err: any) {
      console.error(
        `[RoleAssignee] Failed to send assignment notification for ${questionId} → ${userId}:`,
        err?.message,
      );
    }
  }

  /** Remove the gate keeper / auditor currently assigned to a question. When an actor
   *  name is supplied (manual removal by a moderator/admin), the removed user is notified
   *  that their allocation was taken away and by whom. */
  async removeQuestionRoleAssignee(
    questionId: string,
    role: 'gate_keeper' | 'auditor',
    actorName?: string,
  ): Promise<void> {
    const {assigneeField, assignedAtField} = this.roleAssigneeFields(role);
    const question = await this.questionRepo.getById(questionId);
    this.assertRoleNotFinished(question, role);
    const previousId = (question as any)?.[assigneeField]?.toString();

    await this.questionRepo.setRoleAssignee(
      questionId,
      assigneeField,
      assignedAtField,
      null,
    );

    if (previousId && ObjectId.isValid(previousId)) {
      await this.userRepo.removeAssignedQuestion(previousId, questionId);

      // Notify the user who lost the assignment, naming who removed it.
      try {
        const by = actorName ? ` by ${actorName}` : '';
        await this.notificationService.saveTheNotifications(
          `This question's ${role === 'gate_keeper' ? 'gate keeper' : 'auditor'} allocation has been removed${by}.`,
          'Allocation Removed',
          questionId,
          previousId,
          'moderator_approval',
        );
      } catch (err: any) {
        console.error(
          `[RoleAssignee] Failed to send removal notification for ${questionId} → ${previousId}:`,
          err?.message,
        );
      }
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

      // Do NOT reset isAutoAllocate here. If a moderator deliberately turned off
      // auto-allocation for this question, that decision must be respected even
      // when the absent-expert cleanup removes experts from the queue.
      // Only attempt re-allocation when the question still has isAutoAllocate: true.
      if (!question.isAutoAllocate) {
        console.log(
          `[AbsentExpert] Skipping auto-reallocation for question ${questionId} — isAutoAllocate is false (moderator override).`,
        );
        continue;
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

  // ── Report generation delegates to QuestionReportService ──
  async sendOutReachQuestionsMail(
    startDate: string,
    endDate: string,
    emails: string | string[],
  ): Promise<{success: boolean; message: string}> {
    return this.questionReportService.sendOutReachQuestionsMail(
      startDate,
      endDate,
      emails,
    );
  }

  async generateQuestionReport(
    consecutiveApprovals?: number,
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ) {
    return this.questionReportService.generateQuestionReport(
      consecutiveApprovals,
      startDate,
      endDate,
      isTrainingUser,
      isAdmin,
    );
  }

  async generateTatReport(
    startDate: Date,
    endDate: Date,
    opts: {sources?: string[]; statuses?: string[]; maxReviewers?: number} = {},
  ): Promise<ArrayBuffer | null> {
    return this.questionReportService.generateTatReport(startDate, endDate, opts);
  }

  async generateOverallQuestionReport(
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<ArrayBuffer | null> {
    return this.questionReportService.generateOverallQuestionReport(
      startDate,
      endDate,
      isTrainingUser,
      isAdmin,
    );
  }

  async generateStateCropQuestionReport(
    filters: Parameters<
      IQuestionReportService['generateStateCropQuestionReport']
    >[0],
  ): Promise<ArrayBuffer | null> {
    return this.questionReportService.generateStateCropQuestionReport(filters);
  }

  async generateDuplicateQuestionReport(
    startDate?: Date,
    endDate?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<ArrayBuffer | null> {
    return this.questionReportService.generateDuplicateQuestionReport(
      startDate,
      endDate,
      isTrainingUser,
      isAdmin,
    );
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
      // Training questions must only go to training moderators, and non-training
      // questions must only go to non-training moderators.
      const runPass = async (
        label: string,
        moderators: IUser[],
        questions: IQuestion[],
        canAssignQuestion?: (moderator: IUser, question: IQuestion) => boolean,
      ) => {
        for (const moderator of moderators) {
          const moderatorId = moderator._id!.toString();

          const nextQuestion = questions.find(
            (q: any) =>
              !claimedIds.has(q._id.toString()) &&
              (canAssignQuestion ? canAssignQuestion(moderator, q) : true),
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

      // ── Feedback pass ──────────────────────────────────────────────────────
      // Feedback-open questions (auto-allocation ON) are allocated in the same run.
      // A feedback counts as a TIME-BOUND item — it competes for the moderator's
      // single time-bound slot. Target = the final answer's approver when they are an
      // active, non-blocked MODERATOR; otherwise an available auditor (one holding no
      // time-bound question). The claim + submission guards enforce one-at-a-time.
      const feedbackAssignedModeratorIds = new Set<string>();
      try {
        const feedbackQuestions =
          await this.questionRepo.findQuestionsWithOpenFeedbacks(true);
        if (feedbackQuestions.length) {
          const fbIds = feedbackQuestions
            .map(q => q._id?.toString())
            .filter((id): id is string => Boolean(id));

          // approvedBy per question, from the final answer.
          const finalAnswers =
            await this.answerRepo.getFinalAnswersByQuestionIds(fbIds);
          const approverByQuestion = new Map<string, string>();
          for (const a of finalAnswers) {
            const qid = a.questionId?.toString();
            const approver = a.approvedBy?.toString();
            if (qid && approver && !approverByQuestion.has(qid)) {
              approverByQuestion.set(qid, approver);
            }
          }

          // Load approver users to check eligibility (active + non-blocked + moderator).
          const approverIds = [...new Set(approverByQuestion.values())];
          const approverUsers = approverIds.length
            ? await this.userRepo.getUsersByIds(approverIds)
            : [];
          const approverById = new Map(
            approverUsers.map(u => [u._id!.toString(), u]),
          );

          // Auditor fallback pool — auditors free for feedback (no time-bound
          // question, no existing feedback).
          const auditorPool = (
            await this.userRepo.findAvailableFeedbackReviewers()
          )
            .filter(u => u.role === 'auditor')
            .map(u => u._id!.toString());
          const usedAssignees = new Set<string>();

          for (const q of feedbackQuestions) {
            const questionId = q._id?.toString();
            if (!questionId) continue;
            const approverId = approverByQuestion.get(questionId);
            const approver = approverId
              ? approverById.get(approverId)
              : undefined;

            // approvedBy gets it only when an active, non-blocked moderator; else auditor.
            const approverEligible =
              !!approver &&
              approver.role === 'moderator' &&
              approver.isBlocked !== true &&
              approver.status !== 'in-active' &&
              !usedAssignees.has(approverId!) &&
              !approver.feedbacksAssigned?.length;

            let targetId: string | undefined;
            let targetIsModerator = false;
            if (approverEligible) {
              targetId = approverId;
              targetIsModerator = true;
            } else {
              targetId = auditorPool.find(id => !usedAssignees.has(id));
            }
            if (!targetId) {
              availableWaiting++;
              continue;
            }

            try {
              // Atomic claim: guards feedback-empty AND no time-bound question.
              const claimed = await this.userRepo.claimFeedbackAllocation(
                targetId,
                questionId,
              );
              if (!claimed) continue;
              const roundOpened =
                await this.questionSubmissionRepo.assignFeedbackReviewer(
                  questionId,
                  targetId,
                  new Date(),
                );
              if (!roundOpened) {
                // Another reviewer already has an open round — release the claim.
                await this.userRepo.removeFeedbacksAssigned(
                  targetId,
                  questionId,
                );
                continue;
              }
              usedAssignees.add(targetId);
              if (targetIsModerator) feedbackAssignedModeratorIds.add(targetId);

              await this.notificationService.saveTheNotifications(
                'A feedback has been assigned to you for review',
                'Feedback Assigned',
                questionId,
                targetId,
                'moderator_approval',
              );

              const meta = await this.resolveExpertMeta([targetId]);
              const reviewerName = meta.get(targetId)?.name ?? targetId;
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
                    question: (q as any)?.question,
                    expertId: targetId,
                    operation: 'feedback',
                  },
                  changes: {after: {'feedback reviewer': reviewerName}},
                  outcome: {status: OutComeStatus.SUCCESS},
                  createdAt: new Date(),
                } as ModeratorAuditTrail)
                .catch((auditErr: any) =>
                  console.error(
                    '[ModeratorQueue] Failed to write feedback SYSTEM_ALLOCATED audit:',
                    auditErr?.message,
                  ),
                );

              assigned++;
              console.log(
                `[ModeratorQueue] (feedback) Assigned question ${questionId} → ${targetIsModerator ? 'moderator' : 'auditor'} ${targetId}`,
              );
            } catch (err: any) {
              console.error(
                `[ModeratorQueue] (feedback) Failed to assign ${questionId}:`,
                err?.message,
              );
              failedAssignments++;
            }
          }
        }
      } catch (fbErr: any) {
        console.error('[ModeratorQueue] feedback pass failed:', fbErr?.message);
      }

      // A feedback occupies the moderator's time-bound slot, so exclude moderators who
      // just took a feedback this run OR already hold one from a previous run.
      const eligibleTimeBoundModerators = timeBoundModerators.filter(
        m =>
          !feedbackAssignedModeratorIds.has(m._id!.toString()) &&
          !(m as any).feedbacksAssigned?.length,
      );

      await runPass(
        'time-bound',
        eligibleTimeBoundModerators,
        timeBoundQuestions,
        (moderator, question) =>
          this.isQuestionUserTrainingTypeMatch(moderator, question),
      );
      await runPass(
        'manual',
        manualModerators,
        manualQuestions,
        (moderator, question) =>
          this.isQuestionUserTrainingTypeMatch(moderator, question),
      );

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

  // ─────────────────────────────────────────────────────────────────────────────
  // GATE KEEPER / AUDITOR QUEUE CRON
  // ─────────────────────────────────────────────────────────────────────────────

  /** Statuses each role handles (drives both assignment and auto-freeing). */
  private static readonly GATE_KEEPER_STATUSES: QuestionStatus[] = [
    'dynamic',
    'duplicate',
    'queue_duplicate',
  ];
  private static readonly AUDITOR_STATUSES: QuestionStatus[] = [
    'auditor_review',
  ];

  /**
   * Gate-keeper / auditor single-allocation cron. One question per user at a time:
   *   - dynamic / duplicate / queue_duplicate  → a free gate keeper
   *   - auditor_review                          → a free auditor
   * The assignee is recorded on the question (gateKeeperId / auditorId) and on the
   * user (assignedQuestionIds). They're freed when they act on the question — see
   * freeRoleAssigneeOnStatusChange.
   */
  async runGateKeeperAuditorQueueCron(): Promise<{
    gateKeeperAssigned: number;
    auditorAssigned: number;
  }> {
    // Self-heal first: free any gate keeper / auditor still holding a question whose status
    // has left their scope (e.g. pushed to auditor) but whose post-commit release was
    // missed. Without this, that user stays "busy" forever and never gets new work.
    await this.reconcileRoleAssignees({
      label: 'GateKeeper',
      assigneeField: 'gateKeeperId',
      finishedAtField: 'gateKeeperFinishedAt',
      statuses: QuestionService.GATE_KEEPER_STATUSES,
    });
    await this.reconcileRoleAssignees({
      label: 'Auditor',
      assigneeField: 'auditorId',
      finishedAtField: 'auditorFinishedAt',
      statuses: QuestionService.AUDITOR_STATUSES,
    });

    const gateKeeperAssigned = await this.assignRoleQueue({
      label: 'GateKeeper',
      role: 'gate_keeper',
      statuses: QuestionService.GATE_KEEPER_STATUSES,
      assigneeField: 'gateKeeperId',
      assignedAtField: 'gateKeeperAssignedAt',
      autoAllocateField: 'autoAllocateGateKeeper',
      notificationTitle: 'Question Assigned',
      notificationMessage: 'A question has been assigned to you for review',
    });
    const auditorAssigned = await this.assignRoleQueue({
      label: 'Auditor',
      role: 'auditor',
      statuses: QuestionService.AUDITOR_STATUSES,
      assigneeField: 'auditorId',
      assignedAtField: 'auditorAssignedAt',
      autoAllocateField: 'autoAllocateAuditor',
      notificationTitle: 'Question Assigned',
      notificationMessage: 'A question has been assigned to you for audit',
    });
    return {gateKeeperAssigned, auditorAssigned};
  }

  /** Frees role assignees (gate keeper / auditor) still holding a question that has left
   *  their status scope but was never marked finished — the durable backstop for a missed
   *  post-commit release (see freeRoleAssigneeOnStatusChange). Best-effort per question. */
  private async reconcileRoleAssignees(cfg: {
    label: string;
    assigneeField: 'gateKeeperId' | 'auditorId';
    finishedAtField: 'gateKeeperFinishedAt' | 'auditorFinishedAt';
    statuses: QuestionStatus[];
  }): Promise<number> {
    try {
      const leaked = await this.questionRepo.findLeakedRoleAssignments(
        cfg.assigneeField,
        cfg.finishedAtField,
        cfg.statuses,
      );
      let freed = 0;
      for (const q of leaked) {
        const questionId = q._id!.toString();
        const userId = (q as any)[cfg.assigneeField]?.toString();
        try {
          if (userId) {
            await this.userRepo.removeAssignedQuestion(userId, questionId);
          }
          await this.questionRepo.markRoleFinished(
            questionId,
            cfg.finishedAtField,
            new Date(),
          );
          freed++;
        } catch (err: any) {
          console.error(
            `[${cfg.label}] Failed to reconcile leaked assignment ${questionId}:`,
            err?.message,
          );
        }
      }
      if (freed) {
        console.log(`[${cfg.label}] Reconciled ${freed} leaked assignment(s).`);
      }
      return freed;
    } catch (err: any) {
      console.error(
        `[${cfg.label}] Failed to reconcile leaked assignments:`,
        err?.message,
      );
      return 0;
    }
  }

  /** Assigns one unassigned question (in the given statuses) to each free user of a
   *  role, updating both the question and the user's assigned list. Best-effort. */
  private async assignRoleQueue(cfg: {
    label: string;
    role: UserRole;
    statuses: QuestionStatus[];
    assigneeField: 'gateKeeperId' | 'auditorId';
    assignedAtField: 'gateKeeperAssignedAt' | 'auditorAssignedAt';
    autoAllocateField: 'autoAllocateGateKeeper' | 'autoAllocateAuditor';
    notificationTitle: string;
    notificationMessage: string;
  }): Promise<number> {
    try {
      const [users, questions] = await Promise.all([
        this.userRepo.findAvailableUsersByRole(cfg.role),
        this.questionRepo.findUnassignedQuestionsForRole(
          cfg.statuses,
          cfg.assigneeField,
          cfg.autoAllocateField,
        ),
      ]);
      if (!users.length || !questions.length) return 0;

      let assigned = 0;
      const claimed = new Set<string>();
      for (const user of users) {
        const userId = user._id!.toString();
        const next = questions.find(q => !claimed.has(q._id!.toString()));
        if (!next) break; // no more questions this run
        const questionId = next._id!.toString();
        claimed.add(questionId);
        try {
          // Run the three writes in one transaction so a failure in any of them
          // rolls back the whole assignment (no half-assigned question / user).
          await this._withTransaction(async (session: ClientSession) => {
            await this.questionRepo.setRoleAssignee(
              questionId,
              cfg.assigneeField,
              cfg.assignedAtField,
              userId,
              session,
            );
            const added = await this.userRepo.addAssignedQuestion(
              userId,
              questionId,
              next.status,
              next.source,
              session,
            );
            // For auditors, addAssignedQuestion refuses (returns false) if the user
            // picked up a feedback-review in the race between the availability query
            // and this write. Throw to abort the transaction (rolls back setRoleAssignee)
            // so we never leave the question assigned to an auditor who holds both.
            if (!added) {
              throw new Error('ASSIGNEE_NO_LONGER_FREE');
            }
            await this.notificationService.saveTheNotifications(
              cfg.notificationMessage,
              cfg.notificationTitle,
              questionId,
              userId,
              'moderator_approval',
              session,
            );
          });
          console.log(
            `[${cfg.label}] Assigned question ${questionId} → ${cfg.role} ${userId}`,
          );
          assigned++;

          // Audit the system (cron) allocation so it shows in the question's audit
          // trail — mirrors the moderator / time-bound crons' SYSTEM_ALLOCATED entries.
          const assigneeName =
            `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
            user.email ||
            userId;
          const roleLabel =
            cfg.role === 'gate_keeper'
              ? 'gate keeper'
              : cfg.role === 'auditor'
                ? 'auditor'
                : cfg.role;
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
                question: (next as any)?.question,
                expertId: userId,
                role: cfg.role,
              },
              changes: { after: { [roleLabel]: assigneeName } },
              outcome: { status: OutComeStatus.SUCCESS },
              createdAt: new Date(),
            } as ModeratorAuditTrail)
            .catch((auditErr: any) =>
              console.error(
                `[${cfg.label}] Failed to write SYSTEM_ALLOCATED audit:`,
                auditErr?.message,
              ),
            );
        } catch (err: any) {
          claimed.delete(questionId);
          console.error(
            `[${cfg.label}] Failed to assign ${questionId} → ${userId}:`,
            err?.message,
          );
        }
      }
      console.log(`[${cfg.label}] Done. assigned=${assigned}`);
      return assigned;
    } catch (error: any) {
      console.error(`[${cfg.label}] queue cron failed:`, error?.message);
      return 0;
    }
  }

  /**
   * Free the gate keeper / auditor assigned to a question once its status moves out
   * of that role's handling statuses (i.e. they've acted on it — pass / allocate
   * experts / push to auditor for a gate keeper; push to GDB / notify user for an
   * auditor). Clears the assignee field on the question and removes it from the
   * user's assigned list so the cron can hand them another. Best-effort; never throws.
   */
  /**
   * The exact time a role (gate keeper / auditor) finished with a question — taken from the
   * audit trail (the createdAt of the latest action logged by an actor of that role) rather
   * than fabricated with new Date().
   *
   * When called inside the update transaction (session present), the audit entry for the
   * current action hasn't been written yet AND an older same-role entry could mislead — so
   * there we use the action instant (now), which is exact. Post-commit / reconciliation
   * (no session) reads the real historical time from the audit trail.
   */
  private async resolveRoleFinishTime(
    questionId: string,
    role: 'gate_keeper' | 'auditor',
    session?: ClientSession,
  ): Promise<Date> {
    if (session) return new Date();
    try {
      const {data} = await this.auditTrailsService.getAuditTrailsByQuestionId(
        questionId,
        1,
        25,
        null,
        'desc',
      );
      const entry = data.find(
        a => (a as any)?.actor?.role === role && (a as any)?.createdAt,
      );
      if (entry?.createdAt) return new Date(entry.createdAt as any);
    } catch (err: any) {
      console.error(
        `[RoleAssignee] audit-time lookup failed for ${questionId} (${role}):`,
        err?.message,
      );
    }
    return new Date();
  }

  async freeRoleAssigneeOnStatusChange(
    questionId: string,
    newStatus?: QuestionStatus,
    session?: ClientSession,
  ): Promise<void> {
    // When a session is supplied, the caller wants this to run inside their transaction —
    // let failures propagate so the status change and the release roll back together.
    // Without a session it stays best-effort (post-commit / other callers) and never throws.
    const run = async () => {
      const question = await this.questionRepo.getById(questionId, session);
      if (!question) return;
      // Fall back to the question's current status when the caller doesn't pass one —
      // e.g. after an answer approval/close.
      const status = newStatus ?? question.status;

      // When the question leaves the role's handling statuses, the assignee has acted:
      // free the user (assignedQuestionIds) and stamp finishedAt — but keep the assignee
      // id on the question for history/timeline. Guarded by finishedAt so a later status
      // change doesn't overwrite the original finish time.
      const gkId = (question as any).gateKeeperId?.toString();
      if (gkId && !QuestionService.GATE_KEEPER_STATUSES.includes(status)) {
        await this.userRepo.removeAssignedQuestion(gkId, questionId, session);
        if (!(question as any).gateKeeperFinishedAt) {
          await this.questionRepo.markRoleFinished(
            questionId,
            'gateKeeperFinishedAt',
            await this.resolveRoleFinishTime(
              questionId,
              'gate_keeper',
              session,
            ),
            session,
          );
        }
      }

      const audId = (question as any).auditorId?.toString();
      if (audId && !QuestionService.AUDITOR_STATUSES.includes(status)) {
        await this.userRepo.removeAssignedQuestion(audId, questionId, session);
        if (!(question as any).auditorFinishedAt) {
          await this.questionRepo.markRoleFinished(
            questionId,
            'auditorFinishedAt',
            await this.resolveRoleFinishTime(questionId, 'auditor', session),
            session,
          );
        }
      }
    };

    if (session) {
      await run();
      return;
    }

    try {
      await run();
    } catch (err: any) {
      console.error(
        `[RoleAssignee] Failed to free assignee for ${questionId}:`,
        err?.message,
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
  }): Promise<{message: string; reallocated: number; skipped: number}> {
    const {label, sources, requirePaeReviewNotDone} = cfg;
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
      const TMU_experts = [];
      const Normal_experts = [];
      for (const expert of allExperts) {
        if (expert.isTrainingUser === true) {
          TMU_experts.push(expert);
        } else {
          Normal_experts.push(expert);
        }
      }
      if (!allExperts.length) {
        return {
          message: 'No experts available',
          reallocated: 0,
          skipped: totalWork,
        };
      }

      const getEligibleExpertsForQuestion = (question?: IQuestion | null) => {
        return question?.isTrainingQuestion === true
          ? TMU_experts
          : Normal_experts;
      };

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

      // Never-allocated (author-level) questions REQUIRE an STF answer-creator, so STF
      // experts are reserved for them — but only while such questions still remain to be
      // processed this run. Because the work queue puts all never-allocated work BEFORE
      // reviewer work, once they're all handled any STF still free (per the cap) is spare
      // and MAY take reviewer work. `unallocatedRemaining` tracks how many never-allocated
      // questions are still pending; the needsReviewer STF guard checks it (not a run-wide
      // flag) so a free STF isn't wrongly blocked from review-level questions.
      const hasUnallocatedSubmissions = unallocatedSubmissions.length > 0;
      let unallocatedProcessed = 0;
      let unallocatedRemaining = unallocatedSubmissions.length;

      for (const {type, submission} of workQueue) {
        const questionId = submission.questionId?.toString();
        const question = submission.question;
        const sourceLabel =
          (
            {
              AJRASAKHA: 'Ajrasakha',
              WHATSAPP: 'WhatsApp',
              AGRI_EXPERT: 'Agri Expert',
              OUTREACH: 'Outreach',
            } as Record<string, string>
          )[question?.source] ??
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
          for (const expert of getEligibleExpertsForQuestion(question)) {
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
          // This never-allocated question is now being handled — it no longer reserves an
          // STF expert away from later reviewer work.
          unallocatedRemaining--;
          let assignedExpert: string | null = null;
          for (const expert of getEligibleExpertsForQuestion(question)) {
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
                {isAutoAllocate: true, firstAllocationAt: new Date()},
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
          for (const expert of getEligibleExpertsForQuestion(question)) {
            const expertId = expert._id.toString();
            if (historyExpertIds.has(expertId)) continue;
            if (queueExpertIds.has(expertId)) continue;

            // Reserve STF experts for never-allocated questions only while such
            // questions still remain to be processed this run. Since never-allocated
            // work is ordered BEFORE reviewer work, by the time we reach needsReviewer
            // all of it has been handled (unallocatedRemaining === 0), so an STF expert
            // that is still free (per the cap) is spare and may take review-level work.
            if (
              unallocatedRemaining > 0 &&
              expert?.special_task_force === true
            ) {
              console.log(
                `[TimeBound] Skipping STF expert ${expertId} for needsReviewer question ${questionId} — ${unallocatedRemaining} never-allocated question(s) still pending; STF reserved for them`,
              );
              continue; // STF reserved for still-pending never-allocated questions
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
      console.error(`[${label}] single-allocation run failed:`, error?.message);
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
    return queueCropName(crop);
  }

  private rawToQueueItem(row: RawQueueQuestionRow): QueueQuestionItem {
    return {
      _id: row._id?.toString(),
      question: row.question ?? '',
      status: row.status ?? '',
      source: row.source ?? '',
      isTrainingQuestion: row.isTrainingQuestion === true,
      priority: row.priority,
      createdAt: row.createdAt,
      state: row.state,
      district: row.district,
      crop: this.queueCropName(row.crop),
    };
  }

  /** Map a joined submission (with `.question`) into a lean question item. */
  private submissionToQueueItem(sub: any): QueueQuestionItem {
    return submissionToQueueItem(sub);
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
  /** Resolve expert ids → {name, isTrainingUser}. Delegates to the shared helper
   *  (also used by QuestionReportService). */
  private resolveExpertMeta(
    ids: string[],
  ): Promise<Map<string, {name: string; isTrainingUser: boolean}>> {
    return resolveExpertMeta(this.userRepo, ids);
  }

  private expertMetaToNames(
    meta: Map<string, {name: string; isTrainingUser: boolean}>,
  ): Map<string, string> {
    return new Map(
      Array.from(meta.entries()).map(([id, value]) => [id, value.name]),
    );
  }

  /** Effective moderator-queue wait time for a question: feedback questions use
   *  `recentFeedback` (when the feedback arrived), everything else uses `createdAt`.
   *  Used to interleave in-review + feedback questions in "Waiting for Moderator". */
  private effectiveQueueTime(q: any): number {
    const ts = q?.recentFeedback ?? q?.createdAt;
    const ms = ts ? new Date(ts).getTime() : 0;
    return Number.isNaN(ms) ? 0 : ms;
  }

  /** Waiting feedback questions (closed + open feedback) that don't yet have a
   *  reviewer — shown in the moderator queue's TIME-BOUND "Waiting for Moderator"
   *  section, irrespective of the question's source (feedback counts as time-bound).
   *  Includes both auto-allocate and manual ones (all are awaiting a reviewer).
   *  Filtered by training-user, matching the in-review query's behaviour. */
  private async getWaitingFeedbackQuestions(
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<any[]> {
    const [feedbackQs, openReviews] = await Promise.all([
      this.questionRepo.findQuestionsWithOpenFeedbacks(false),
      this.questionSubmissionRepo.findOpenFeedbackReviews(),
    ]);
    const assignedIds = new Set(openReviews.map(o => o.questionId));
    return (feedbackQs as any[]).filter(q => {
      if (assignedIds.has(q._id?.toString())) return false;
      if (isAdmin !== true && isTrainingUser !== undefined) {
        return isTrainingUser
          ? q.isTrainingQuestion === true
          : q.isTrainingQuestion !== true;
      }
      return true;
    });
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
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ): Promise<QueueSectionResult> {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 50), 200);
    const skip = (safePage - 1) * safeLimit;

    // Manual expert sections (suffix "Manual") reuse the time-bound section logic but
    // scoped to MANUAL_SOURCES (AGRI_EXPERT/OUTREACH) with the not-yet-PAE-reviewed
    // filter, mirroring the manual single-allocation cron. Moderator ...Manual sections
    // have their own dedicated cases and are NOT remapped here.
    const EXPERT_SECTIONS = new Set([
      'received',
      'autoAllocateOff',
      'autoAllocateOpen',
      'autoAllocateDelayed',
      'allocated',
      'waiting',
      'freeExperts',
      'stuck',
      'needsReviewer',
      'openedIdle',
      'totalWork',
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
          isTrainingUser,
          isAdmin,
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
          isTrainingUser,
          isAdmin,
        );
        const byQuestion = new Map<string, string | null>();
        const ids: string[] = [];
        for (const r of items) {
          const id = this.derivePendingAssigneeId(r.queue, r.history as any);
          byQuestion.set(r._id?.toString() ?? '', id);
          if (id) ids.push(id);
          for (const q of r.queue ?? []) ids.push(q?.toString());
        }
        const experts = await this.resolveExpertMeta(ids);
        const names = this.expertMetaToNames(experts);
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
              isTrainingUser: id
                ? experts.get(id)?.isTrainingUser === true
                : undefined,
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
            isTrainingUser,
            isAdmin,
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
          e =>
            !busyMap.has(e._id.toString()) &&
            (isAdmin ||
              (isTrainingUser
                ? e.isTrainingUser === true
                : e.isTrainingUser !== true)),
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
            isTrainingUser: e.isTrainingUser === true,
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
            isTrainingUser,
            isAdmin,
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
        const experts = await this.resolveExpertMeta(ids);
        const names = this.expertMetaToNames(experts);
        const now = Date.now();
        const items: QueueQuestionItem[] = pageSubs.map(sub => {
          const item = this.submissionToQueueItem(sub);
          const id = byQuestion.get(item._id ?? '');
          const allocatedAt = sub.currentExpertAllocatedAt ?? null;
          return {
            ...item,
            expertName: id ? (names.get(id) ?? 'Unknown') : undefined,
            isTrainingUser: id
              ? experts.get(id)?.isTrainingUser === true
              : undefined,
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
        const experts = await this.resolveExpertMeta(ids);
        const names = this.expertMetaToNames(experts);
        const now = Date.now();
        const items: QueueQuestionItem[] = pageSubs.map(sub => {
          const item = this.submissionToQueueItem(sub);
          const id = byQuestion.get(item._id ?? '');
          const openedAt = sub.currentExpertOpenedAt ?? null;
          return {
            ...item,
            expertName: id ? (names.get(id) ?? 'Unknown') : undefined,
            isTrainingUser: id
              ? experts.get(id)?.isTrainingUser === true
              : undefined,
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
            isTrainingUser,
            isAdmin,
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
        const experts = await this.resolveExpertMeta(ids);
        const names = this.expertMetaToNames(experts);
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
            isTrainingUser:
              completedIds.length > 0
                ? experts.get(completedIds[completedIds.length - 1])
                    ?.isTrainingUser === true
                : undefined,
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
            isTrainingUser,
            isAdmin,
          ),
          this.questionSubmissionRepo.findUnallocatedTimeBoundQuestions(
            expertSources,
            requirePaeNotDone,
            isTrainingUser,
            isAdmin,
          ),
          this.questionSubmissionRepo.findAnsweredQuestionsNeedingReviewer(
            expertSources,
            requirePaeNotDone,
            isTrainingUser,
            isAdmin,
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
        // In-review/duplicate questions with no moderator yet, PLUS waiting feedback
        // questions (closed + open feedback, no reviewer) — both need the moderator queue.
        const [inReviewQs, waitingFeedback] = await Promise.all([
          this.questionRepo.findUnassignedInReviewQuestions(
            [],
            isTrainingUser,
            isAdmin,
          ),
          this.getWaitingFeedbackQuestions(isTrainingUser, isAdmin),
        ]);
        // Order the merged queue by effective wait time: in-review by createdAt,
        // feedback by recentFeedback (falls back to createdAt).
        const qs = [...(inReviewQs as any[]), ...waitingFeedback].sort(
          (a, b) => this.effectiveQueueTime(a) - this.effectiveQueueTime(b),
        );
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
        const qs = (await this.questionRepo.findModeratorAssignedQuestions(
          [],
          isTrainingUser,
          isAdmin,
        )) as any[];
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        const ids = pageQs
          .map(q => q.moderatorId?.toString())
          .filter(Boolean) as string[];
        const moderators = await this.resolveExpertMeta(ids);
        const items: QueueQuestionItem[] = pageQs.map(q => ({
          ...this.submissionToQueueItem({question: q}),
          moderatorName: q.moderatorId
            ? (moderators.get(q.moderatorId.toString())?.name ?? 'Unknown')
            : undefined,
          isTrainingUser: q.moderatorId
            ? moderators.get(q.moderatorId.toString())?.isTrainingUser === true
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
            isTrainingUser: m.isTrainingUser === true,
          }));
        return {count: mods.length, items};
      }

      // ── Source-split moderator-queue sections (time-bound vs manual) ──
      // Same data as the three sections above, scoped to one source group so the UI
      // can show the moderator queue split into Time-bound / Manual.
      case 'moderatorWaitingTimeBound':
      case 'moderatorWaitingManual': {
        const isTimeBound = section === 'moderatorWaitingTimeBound';
        const sources = isTimeBound ? TIME_BOUND_SOURCES : MANUAL_SOURCES;
        const inReviewQs =
          (await this.questionRepo.findUnassignedInReviewQuestions(
            sources,
            isTrainingUser,
            isAdmin,
          )) as any[];
        // Feedback questions go in the TIME-BOUND column irrespective of source
        // (feedback counts as time-bound); the Manual column shows in-review only.
        const waitingFeedback = isTimeBound
          ? await this.getWaitingFeedbackQuestions(isTrainingUser, isAdmin)
          : [];
        // Order the merged queue by effective wait time: in-review by createdAt,
        // feedback by recentFeedback (falls back to createdAt).
        const qs = [...inReviewQs, ...waitingFeedback].sort(
          (a, b) => this.effectiveQueueTime(a) - this.effectiveQueueTime(b),
        );
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
          isTrainingUser,
          isAdmin,
        )) as any[];
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        const ids = pageQs
          .map(q => q.moderatorId?.toString())
          .filter(Boolean) as string[];
        const moderators = await this.resolveExpertMeta(ids);
        const items: QueueQuestionItem[] = pageQs.map(q => ({
          ...this.submissionToQueueItem({question: q}),
          moderatorName: q.moderatorId
            ? (moderators.get(q.moderatorId.toString())?.name ?? 'Unknown')
            : undefined,
          isTrainingUser: q.moderatorId
            ? moderators.get(q.moderatorId.toString())?.isTrainingUser === true
            : undefined,
        }));
        return {count, items};
      }

      case 'availableModeratorsTimeBound':
      case 'availableModeratorsManual': {
        const isTimeBound = section === 'availableModeratorsTimeBound';
        const sources = isTimeBound ? TIME_BOUND_SOURCES : MANUAL_SOURCES;
        const modsRaw =
          (await this.userRepo.findAvailableStfModeratorsForSources(
            sources,
            isTrainingUser,
            isAdmin,
          )) as any[];
        // Feedback counts as a time-bound item, so a moderator holding a feedback is
        // NOT free for the time-bound queue (they're still free for the manual one).
        const mods = isTimeBound
          ? modsRaw.filter(m => !m.feedbacksAssigned?.length)
          : modsRaw;
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
            isTrainingUser: m.isTrainingUser === true,
          }));
        return {count: mods.length, items};
      }

      // ── Gate keeper / auditor role queues (mirror the moderator queue sections) ──
      case 'gateKeeperWaiting':
      case 'auditorWaiting': {
        const isGK = section === 'gateKeeperWaiting';
        const qs = await this.questionRepo.findUnassignedQuestionsForRole(
          isGK
            ? QuestionService.GATE_KEEPER_STATUSES
            : QuestionService.AUDITOR_STATUSES,
          isGK ? 'gateKeeperId' : 'auditorId',
          isGK ? 'autoAllocateGateKeeper' : 'autoAllocateAuditor',
        );
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        return {
          count,
          items: pageQs.map(q => this.submissionToQueueItem({question: q})),
        };
      }

      case 'gateKeeperAllocated':
      case 'auditorAllocated': {
        const isGK = section === 'gateKeeperAllocated';
        const assigneeField = isGK ? 'gateKeeperId' : 'auditorId';
        const qs = await this.questionRepo.findQuestionsAssignedToRole(
          assigneeField,
          isGK
            ? QuestionService.GATE_KEEPER_STATUSES
            : QuestionService.AUDITOR_STATUSES,
        );
        const count = qs.length;
        const pageQs = qs.slice(skip, skip + safeLimit);
        const ids = pageQs
          .map(q => (q as any)[assigneeField]?.toString())
          .filter(Boolean) as string[];
        const assignees = await this.resolveExpertMeta(ids);
        const items: QueueQuestionItem[] = pageQs.map(q => {
          const id = (q as any)[assigneeField]?.toString();
          return {
            ...this.submissionToQueueItem({question: q}),
            assigneeName: id
              ? (assignees.get(id)?.name ?? 'Unknown')
              : undefined,
            isTrainingUser: id
              ? assignees.get(id)?.isTrainingUser === true
              : undefined,
          };
        });
        return {count, items};
      }

      case 'availableGateKeepers':
      case 'availableAuditors': {
        const role =
          section === 'availableGateKeepers' ? 'gate_keeper' : 'auditor';
        const users = (await this.userRepo.findAvailableUsersByRole(
          role,
        )) as any[];
        const items: QueueExpertItem[] = users
          .slice(skip, skip + safeLimit)
          .map(u => ({
            _id: u._id.toString(),
            name:
              `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() ||
              u.email ||
              'Unknown',
            email: u.email,
            reputationScore: u.reputation_score,
            role: u.role,
            isSpecialTaskForce: u.special_task_force === true,
            isTrainingUser: u.isTrainingUser === true,
          }));
        return {count: users.length, items};
      }

      // ── Feedback-review queue ──
      case 'feedbackAllocated': {
        // One row per open feedback-review round (reviewer + question).
        const open =
          await this.questionSubmissionRepo.findOpenFeedbackReviews();
        const count = open.length;
        const page = open.slice(skip, skip + safeLimit);
        const questions = await this.questionRepo.findByIds(
          page
            .map(o => o.questionId)
            .filter(Boolean)
            .map(id => new ObjectId(id)),
        );
        const qById = new Map(questions.map(q => [q._id?.toString(), q]));
        const reviewers = await this.resolveExpertMeta(
          page.map(o => o.reviewerId).filter(Boolean),
        );
        const items: QueueQuestionItem[] = page.map(o => ({
          ...this.submissionToQueueItem({question: qById.get(o.questionId)}),
          assigneeName: reviewers.get(o.reviewerId)?.name ?? 'Unknown',
          isTrainingUser: reviewers.get(o.reviewerId)?.isTrainingUser === true,
        }));
        return {count, items};
      }

      case 'feedbackWaiting': {
        // Questions with an open feedback minus the ones already assigned a reviewer.
        const [openQs, openReviews] = await Promise.all([
          this.questionRepo.findQuestionsWithOpenFeedbacks(),
          this.questionSubmissionRepo.findOpenFeedbackReviews(),
        ]);
        const allocatedIds = new Set(openReviews.map(o => o.questionId));
        const waitingQs = openQs.filter(
          q => !allocatedIds.has(q._id?.toString()),
        );
        const count = waitingQs.length;
        const pageQs = waitingQs.slice(skip, skip + safeLimit);
        return {
          count,
          items: pageQs.map(q => this.submissionToQueueItem({question: q})),
        };
      }

      case 'availableFeedbackReviewers': {
        const users =
          (await this.userRepo.findAvailableFeedbackReviewers()) as any[];
        const items: QueueExpertItem[] = users
          .slice(skip, skip + safeLimit)
          .map(u => ({
            _id: u._id.toString(),
            name:
              `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() ||
              u.email ||
              'Unknown',
            email: u.email,
            reputationScore: u.reputation_score,
            role: u.role,
            isSpecialTaskForce: u.special_task_force === true,
            isTrainingUser: u.isTrainingUser === true,
          }));
        return {count: users.length, items};
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
    isTrainingUser?: boolean,
    isAdmin?: boolean,
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
          isTrainingUser,
          isAdmin,
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
      gateKeeperWaiting,
      gateKeeperAllocated,
      availableGateKeepers,
      auditorWaiting,
      auditorAllocated,
      availableAuditors,
      feedbackWaiting,
      feedbackAllocated,
      availableFeedbackReviewers,
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
      safe('gateKeeperWaiting'),
      safe('gateKeeperAllocated'),
      safe('availableGateKeepers'),
      safe('auditorWaiting'),
      safe('auditorAllocated'),
      safe('availableAuditors'),
      safe('feedbackWaiting'),
      safe('feedbackAllocated'),
      safe('availableFeedbackReviewers'),
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

      // ── Gate keeper / auditor role queues ──
      gateKeeperWaiting:
        gateKeeperWaiting as QueueDetailsResponse['gateKeeperWaiting'],
      gateKeeperAllocated:
        gateKeeperAllocated as QueueDetailsResponse['gateKeeperAllocated'],
      availableGateKeepers:
        availableGateKeepers as QueueDetailsResponse['availableGateKeepers'],
      auditorWaiting: auditorWaiting as QueueDetailsResponse['auditorWaiting'],
      auditorAllocated:
        auditorAllocated as QueueDetailsResponse['auditorAllocated'],
      availableAuditors:
        availableAuditors as QueueDetailsResponse['availableAuditors'],
      // ── Feedback-review queue ──
      feedbackWaiting:
        feedbackWaiting as QueueDetailsResponse['feedbackWaiting'],
      feedbackAllocated:
        feedbackAllocated as QueueDetailsResponse['feedbackAllocated'],
      availableFeedbackReviewers:
        availableFeedbackReviewers as QueueDetailsResponse['availableFeedbackReviewers'],
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
      allocatedManual:
        allocatedManual as QueueDetailsResponse['allocatedManual'],
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

  /**
   * Remove the second entry from history and queue arrays in a question submission.
   * This is used for migration purposes to fix duplicate entries.
   * @param submissionId - The submission document ID
   */
  async backgroundProcessAction(
    userId: string,
  ): Promise<{modifiedCount: number}> {
    return await this.userRepo.clearAssignedQuestions(userId);
  }

  /** Admin utility: remove a submission history entry (by 0-based index) for a question. */
  async removeSubmissionHistoryEntry(
    questionId: string,
    index: number,
  ): Promise<{success: boolean; historyLength: number}> {
    const updated = await this.questionSubmissionRepo.removeHistoryEntryByIndex(
      questionId,
      index,
    );
    return {
      success: true,
      historyLength: updated?.history?.length ?? 0,
    };
  }

  /** Admin data-fix: remove a single expert from a question's submission queue by index. */
  async removeSubmissionQueueEntry(
    questionId: string,
    index: number,
  ): Promise<{success: boolean; queueLength: number}> {
    const updated = await this.questionSubmissionRepo.removeQueueEntryByIndex(
      questionId,
      index,
    );
    return {
      success: true,
      queueLength: updated?.queue?.length ?? 0,
    };
  }

  /** Admin utility: append an expert to a question's submission queue. */
  async addSubmissionQueueEntry(
    questionId: string,
    expertId: string,
  ): Promise<{success: boolean; queueLength: number}> {
    if (!expertId || !ObjectId.isValid(expertId)) {
      throw new BadRequestError('A valid expertId is required');
    }
    const updated = await this.questionSubmissionRepo.addQueueEntry(
      questionId,
      expertId,
    );
    return {success: true, queueLength: updated?.queue?.length ?? 0};
  }

  /** Admin utility: append a history entry to a question's submission history.
   *  The raw entry's id/date fields are coerced to ObjectId/Date before storing. */
  async addSubmissionHistoryEntry(
    questionId: string,
    rawEntry: Record<string, any>,
  ): Promise<{success: boolean; historyLength: number}> {
    const entry = this.buildHistoryEntry(rawEntry);
    const updated = await this.questionSubmissionRepo.addHistoryEntry(
      questionId,
      entry,
    );
    return {
      success: true,
      historyLength: updated?.history?.length ?? 0,
    };
  }

  /** Coerce a raw JSON history entry into a stored ISubmissionHistory (ObjectIds + Dates). */
  private buildHistoryEntry(raw: Record<string, any>): ISubmissionHistory {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestError('entry object is required');
    }
    const toOid = (v: unknown): ObjectId => {
      if (!v || !ObjectId.isValid(String(v))) {
        throw new BadRequestError(`Invalid ObjectId: ${String(v)}`);
      }
      return new ObjectId(String(v));
    };
    const toDate = (v: unknown): Date | undefined =>
      v ? new Date(v as string) : undefined;

    if (!raw.updatedBy) {
      throw new BadRequestError('entry.updatedBy is required');
    }
    if (!raw.status) {
      throw new BadRequestError('entry.status is required');
    }

    const entry: any = {
      updatedBy: toOid(raw.updatedBy),
      status: raw.status,
      createdAt: toDate(raw.createdAt) ?? new Date(),
      updatedAt: toDate(raw.updatedAt) ?? new Date(),
    };

    // Optional ObjectId fields.
    if (raw.answer) entry.answer = toOid(raw.answer);
    if (raw.reviewId) entry.reviewId = toOid(raw.reviewId);
    if (raw.approvedAnswer) entry.approvedAnswer = toOid(raw.approvedAnswer);
    if (raw.rejectedBy) entry.rejectedBy = toOid(raw.rejectedBy);
    if (raw.rejectedAnswer) entry.rejectedAnswer = toOid(raw.rejectedAnswer);
    if (raw.lastModifiedBy) entry.lastModifiedBy = toOid(raw.lastModifiedBy);
    if (raw.modifiedAnswer) entry.modifiedAnswer = toOid(raw.modifiedAnswer);

    // Optional string fields.
    if (raw.reasonForRejection) {
      entry.reasonForRejection = String(raw.reasonForRejection);
    }
    if (raw.reasonForLastModification) {
      entry.reasonForLastModification = String(raw.reasonForLastModification);
    }

    return entry as ISubmissionHistory;
  }

  // Feedback allocation
  // ── Feedback delegates to FeedbackService ──
  async getQuestionFeedback(questionId: string) {
    return this.feedbackService.getQuestionFeedback(questionId);
  }

  async allocateFeedbackQuestions() {
    return this.feedbackService.allocateFeedbackQuestions();
  }

  async handleFeedbackAction(
    questionId: string,
    feedbackId: string,
    action: 'accept' | 'reject',
    reason: string,
    processedBy: string,
    source: 'DATASET' | 'WEB_APPLICATION' | 'PAE_Validation',
  ) {
    return this.feedbackService.handleFeedbackAction(
      questionId,
      feedbackId,
      action,
      reason,
      processedBy,
      source,
    );
  }

  async getFeedbackQueueDetails() {
    return this.feedbackService.getFeedbackQueueDetails();
  }

  async getFeedbackTimeline(questionId: string) {
    return this.feedbackService.getFeedbackTimeline(questionId);
  }

  async getAssignableFeedbackReviewers() {
    return this.feedbackService.getAssignableFeedbackReviewers();
  }

  async assignFeedbackReviewerManually(
    questionId: string,
    userId: string,
    index?: number,
  ) {
    return this.feedbackService.assignFeedbackReviewerManually(
      questionId,
      userId,
      index,
    );
  }

  async removeFeedbackReviewer(questionId: string, index: number) {
    return this.feedbackService.removeFeedbackReviewer(questionId, index);
  }

  async getFeedbacks(
    questionId: string,
    page: number = 1,
    pageSize: number = 5,
  ) {
    return this.feedbackService.getFeedbacks(questionId, page, pageSize);
  }

  async handleFeedbackStatusUpdate(
    questionId: string,
    source: 'DATASET' | 'WEB_APPLICATION' | 'PAE_Validation',
  ) {
    return this.feedbackService.handleFeedbackStatusUpdate(questionId, source);
  }

  /**
   * Backfill moderatorId on CLOSED questions that have none. moderatorId is cleared
   * when a question closes, so for reporting we restore it from the question's final
   * answer (isFinalAnswer: true) `approvedBy` — the approver is effectively the
   * moderator. Paginated via `limit` so it can be run repeatedly until nothing is left.
   */
  /** Bulk-set `normalizedDomain` on questions from a list of
   *  { "Question ID", "Standardized Domain" } entries. Returns modified / not-matched
   *  counts. */
  async setNormalizedDomains(
    entries: { 'Question ID'?: string; 'Standardized Domain'?: string }[],
  ): Promise<{
    total: number;
    matched: number;
    modified: number;
    notMatched: number;
    invalid: number;
  }> {
    const pairs = (Array.isArray(entries) ? entries : []).map(e => ({
      questionId: String(e?.['Question ID'] ?? '').trim(),
      normalizedDomain: String(e?.['Standardized Domain'] ?? '').trim(),
    }));
    return this.questionRepo.bulkSetNormalizedDomain(pairs);
  }

  /** Diagnostic: closed questions in a window that don't have a final answer with a
   *  valid ObjectId approvedBy — i.e. the ones dropped from the moderator breakdown,
   *  which explains the "closed count vs breakdown count" mismatch. */
  async getClosedAnswerMismatch(
    startTime?: Date,
    endTime?: Date,
  ): Promise<{
    window: { start: Date; end: Date };
    totalClosed: number;
    matched: number;
    mismatched: number;
    items: any[];
  }> {
    let start = startTime;
    let end = endTime;
    if (!start || !end) {
      // Default to the current IST day if no window is given.
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    }
    return this.questionRepo.getClosedAnswerMismatch(start, end);
  }

  async backfillClosedModeratorIds(limit = 500): Promise<{
    matched: number;
    updated: number;
    skippedNoFinalAnswer: number;
    skippedNoApprover: number;
  }> {
    const questionIds =
      await this.questionRepo.findClosedQuestionsWithoutModerator(limit);
    if (!questionIds.length) {
      return {
        matched: 0,
        updated: 0,
        skippedNoFinalAnswer: 0,
        skippedNoApprover: 0,
      };
    }

    const finalAnswers =
      await this.answerRepo.getFinalAnswersByQuestionIds(questionIds);

    // questionId -> approvedBy (first final answer that has an approver wins).
    const approverByQuestion = new Map<string, string>();
    const questionsWithFinal = new Set<string>();
    for (const a of finalAnswers) {
      const qid = a.questionId?.toString();
      if (!qid) continue;
      questionsWithFinal.add(qid);
      const approver = a.approvedBy?.toString();
      if (approver && !approverByQuestion.has(qid)) {
        approverByQuestion.set(qid, approver);
      }
    }

    const pairs: {questionId: string; moderatorId: string}[] = [];
    let skippedNoFinalAnswer = 0;
    let skippedNoApprover = 0;
    for (const qid of questionIds) {
      if (!questionsWithFinal.has(qid)) {
        skippedNoFinalAnswer++;
        continue;
      }
      const approver = approverByQuestion.get(qid);
      if (!approver) {
        skippedNoApprover++;
        continue;
      }
      pairs.push({questionId: qid, moderatorId: approver});
    }

    const updated = await this.questionRepo.bulkSetModeratorId(pairs);
    return {
      matched: questionIds.length,
      updated,
      skippedNoFinalAnswer,
      skippedNoApprover,
    };
  }

  /**
   * Get feedbacks for a question (paginated)
   * Fetches from external data release service with mock data fallback
   */

  // ─────────────────────────────────────────────────────────────────────────────
  // PAE VALIDATION QUEUE CRON
  // ─────────────────────────────────────────────────────────────────────────────

  // ── PAE validation delegates to PaeValidationService ──
  async runPaeValidationQueueCron() {
    return this.paeValidationService.runPaeValidationQueueCron();
  }

  async getPaeValidationTimeline(questionId: string) {
    return this.paeValidationService.getPaeValidationTimeline(questionId);
  }

  async assignPaeValidationReviewerManually(
    questionId: string,
    userId: string,
    index?: number,
  ) {
    return this.paeValidationService.assignPaeValidationReviewerManually(
      questionId,
      userId,
      index,
    );
  }

  async removePaeValidationReviewer(questionId: string, index: number) {
    return this.paeValidationService.removePaeValidationReviewer(
      questionId,
      index,
    );
  }

  async getPaeValidationAssignedQuestions(
    paeExpertId: string,
    page: number,
    limit: number,
  ) {
    return this.paeValidationService.getPaeValidationAssignedQuestions(
      paeExpertId,
      page,
      limit,
    );
  }

  async processPaeValidation(
    paeExpertId: string,
    questionId: string,
    status: 'approve' | 'feedback',
    suggestionComment?: string,
    suggestionLink?: string,
    answerId?: string,
    suggestionSourceName?: string,
  ) {
    return this.paeValidationService.processPaeValidation(
      paeExpertId,
      questionId,
      status,
      suggestionComment,
      suggestionLink,
      answerId,
      suggestionSourceName,
    );
  }

  async getPaeValidationQueueDetails() {
    return this.paeValidationService.getPaeValidationQueueDetails();
  }
}
