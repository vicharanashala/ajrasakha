import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { IQuestionReportService } from '../interfaces/IQuestionReportService.js';
import { IPaeValidationService } from '../interfaces/IPaeValidationService.js';
import { IFeedbackService } from '../interfaces/IFeedbackService.js';
import { IQuestionAiService } from '../interfaces/IQuestionAiService.js';
import { IDuplicateService } from '../interfaces/IDuplicateService.js';
import { IQueueService } from '../interfaces/IQueueService.js';
import { IRoleAssigneeService } from '../interfaces/IRoleAssigneeService.js';
import { IAllocationService } from '../interfaces/IAllocationService.js';
import { IModeratorQueueService } from '../interfaces/IModeratorQueueService.js';
import { IQuestionMaintenanceService } from '../interfaces/IQuestionMaintenanceService.js';
import { resolveExpertMeta } from './helpers/reportHelpers.js';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject, injectable } from 'inversify';
import { ClientSession, ObjectId } from 'mongodb';
import { startBulkDeleteWorker } from '#root/workers/bulkDelete.manager.js';
import {
  IQuestion,
  IUser,
  IQuestionSubmission,
  IAnswer,
  INotificationType,
  IQuestionPriority,
  ISimilarQuestion,
  AddQuestionResult,
  ICheckStatusResponse,
  QuestionStatus,
  QuestionSource,
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
import { QuestionLevelResponse } from '#root/modules/question/classes/transformers/QuestionLevel.js';
import { NotificationService } from '#root/modules/notification/services/NotificationService.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import {
  IQuestionService,
  QueueSectionName,
} from '../interfaces/IQuestionService.js';
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

    @inject(GLOBAL_TYPES.QueueService)
    private readonly queueService: IQueueService,

    @inject(GLOBAL_TYPES.RoleAssigneeService)
    private readonly roleAssigneeService: IRoleAssigneeService,

    @inject(GLOBAL_TYPES.AllocationService)
    private readonly allocationService: IAllocationService,

    @inject(GLOBAL_TYPES.ModeratorQueueService)
    private readonly moderatorQueueService: IModeratorQueueService,

    @inject(GLOBAL_TYPES.QuestionMaintenanceService)
    private readonly maintenanceService: IQuestionMaintenanceService,
  ) {
    super(mongoDatabase);
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
  // ── Admin / maintenance / normalization delegates to QuestionMaintenanceService ──
  async normalizeQuestionState(currentValues: string[], standardizedTo: string) {
    return this.maintenanceService.normalizeQuestionState(currentValues, standardizedTo);
  }

  async normalizeQuestionDistricts(mappings: {existingName: string; standardiseTo: string}[]) {
    return this.maintenanceService.normalizeQuestionDistricts(mappings);
  }

  async findUnknownQuestionGeo() {
    return this.maintenanceService.findUnknownQuestionGeo();
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
            // Entered a gate-keeper status → fill the gate-keeper queue now.
            this.triggerRoleQueueAllocation('processQuestionInBackground');
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
              // Entered a gate-keeper status → fill the gate-keeper queue now.
              this.triggerRoleQueueAllocation('processQuestionInBackground');
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
              // Entered a gate-keeper status → fill the gate-keeper queue now.
              this.triggerRoleQueueAllocation('processQuestionInBackground');
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

  /**
   * Event-driven gate-keeper / auditor queue allocation (replaces the periodic cron).
   * Call this right after a question enters a gate-keeper/auditor status (or a role
   * assignee is freed). Fire-and-forget and best-effort: `runGateKeeperAuditorQueueCron`
   * is idempotent (self-heals leaked assignees + fills both role queues), and any failure
   * is swallowed so it can never roll back or disrupt the caller's own write.
   */
  private triggerRoleQueueAllocation(context: string): void {
    void this.roleAssigneeService
      .runGateKeeperAuditorQueueCron()
      .catch(err =>
        console.error(
          `[${context}] event-driven gate-keeper/auditor allocation failed:`,
          err?.message,
        ),
      );
  }

  /**
   * Event-driven moderator-queue allocation (replaces the periodic moderator cron).
   * Call this right after a question enters a moderator status (status → in-review /
   * pae_submitted) OR a moderator is freed (finalizes an answer, submits feedback).
   * Public so callers in other services (answer review, feedback) can trigger it after
   * their own transaction commits. Fire-and-forget and best-effort: runModeratorQueueCron
   * is idempotent, and any failure is swallowed so it can't disrupt the caller's write.
   */
  triggerModeratorQueueAllocation(context: string): void {
    void this.moderatorQueueService
      .runModeratorQueueCron()
      .catch(err =>
        console.error(
          `[${context}] event-driven moderator-queue allocation failed:`,
          err?.message,
        ),
      );
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

      // Event-driven gate-keeper / auditor allocation (replaces the periodic cron):
      // fill the role queues now when this update made a question newly available to a
      // role — it entered a gate-keeper/auditor status, its auto-allocate toggle was
      // turned ON, OR it freed a role assignee (left their scope, via
      // freeRoleAssigneeOnStatusChange above). Runs AFTER the transaction commits,
      // best-effort and fire-and-forget, so it can never roll back the update.
      if (
        !threadUpdate &&
        (updates.status ||
          updates.autoAllocateGateKeeper === true ||
          updates.autoAllocateAuditor === true)
      ) {
        this.triggerRoleQueueAllocation('updateQuestion');
      }

      // Event-driven moderator-queue allocation (replaces the periodic moderator cron):
      // fill the moderator queue now when this update made a question newly available to a
      // moderator — a status change (freed the moderator via finalize → 'closed'/pass, or
      // made it a candidate → in-review / pae_submitted), OR its moderator auto-allocate
      // toggle was turned ON (an in-review/pae_submitted question that was excluded now
      // qualifies). Fire-and-forget, so it can never roll back the update.
      if (
        !threadUpdate &&
        (updates.status || updates.autoAllocateModerator === true)
      ) {
        this.triggerModeratorQueueAllocation('updateQuestion');
      }

      return result;
    } catch (error) {
      throw new InternalServerError(`Failed to update question: ${error}`);
    }
  }

  // ── Expert allocation & workload balancing delegates to AllocationService ──
  async autoAllocateExperts(questionId: string, session?: ClientSession, BATCH_EXPECTED_TO_ADD?: number) {
    const result = await this.allocationService.autoAllocateExperts(questionId, session, BATCH_EXPECTED_TO_ADD);
    // When we own the transaction (no external session) it's committed now, so a question
    // handed off to a moderator (→ in-review) is visible — fill the moderator queue. When a
    // session is passed, the caller owns the commit and triggers after it (e.g. reviewAnswer).
    if (!session) this.triggerModeratorQueueAllocation('autoAllocateExperts');
    return result;
  }

  async toggleAutoAllocate(questionId: string) {
    return this.allocationService.toggleAutoAllocate(questionId);
  }

  async allocateExperts(userId: string, questionId: string, experts: string[]) {
    const result = await this.allocationService.allocateExperts(userId, questionId, experts);
    // May have exhausted experts and handed the question to a moderator (→ in-review).
    this.triggerModeratorQueueAllocation('allocateExperts');
    return result;
  }

  async bulkAllocatePaeExperts(userId: string, questionIds: string[], paeExpertId: string) {
    return this.allocationService.bulkAllocatePaeExperts(userId, questionIds, paeExpertId);
  }

  async removeExpertFromQueue(userId: string, questionId: string, index: number, options?: {skipAutoAllocate?: boolean}, session?: ClientSession) {
    return this.allocationService.removeExpertFromQueue(userId, questionId, index, options, session);
  }

  async _removeExpertFromQueue(userId: string, questionId: string, index: number, options?: {skipAutoAllocate?: boolean}, session?: ClientSession) {
    return this.allocationService._removeExpertFromQueue(userId, questionId, index, options, session);
  }

  async replaceQueueExpert(userId: string, questionId: string, levelIndex: number, newExpertId: string, isAuthor?: boolean, reasonForChange?: string) {
    const result = await this.allocationService.replaceQueueExpert(userId, questionId, levelIndex, newExpertId, isAuthor, reasonForChange);
    // May have exhausted experts and handed the question to a moderator (→ in-review).
    this.triggerModeratorQueueAllocation('replaceQueueExpert');
    return result;
  }
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
      // Caller owns the transaction and its commit — it triggers the queue afterwards.
      return execute(session);
    }

    const result = await this._withTransaction(
      async (transactionSession: ClientSession) => execute(transactionSession),
    );
    // Deleting a question frees any moderator that held it — run the moderator queue so
    // that freed moderator immediately picks up another in-review/pae_submitted question.
    this.triggerModeratorQueueAllocation('deleteQuestion');
    return result;
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

  // ── Role-assignee management delegates to RoleAssigneeService ──
  async changeQuestionModerator(questionId: string, moderatorId: string) {
    return this.roleAssigneeService.changeQuestionModerator(questionId, moderatorId);
  }

  async removeQuestionModerator(questionId: string) {
    const result =
      await this.roleAssigneeService.removeQuestionModerator(questionId);
    // Removing the moderator frees them AND re-queues the question (back to an
    // unassigned in-review/pae_submitted candidate) — run the moderator queue so both
    // the question and the freed moderator are immediately re-matched.
    this.triggerModeratorQueueAllocation('removeQuestionModerator');
    return result;
  }

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
    return this.roleAssigneeService.getRoleAssigneeDashboard(userId, role, page, limit, search, startDate, endDate, dateFilterType);
  }

  async changeQuestionRoleAssignee(
    questionId: string,
    role: 'gate_keeper' | 'auditor',
    userId: string,
    actorName?: string,
  ) {
    return this.roleAssigneeService.changeQuestionRoleAssignee(questionId, role, userId, actorName);
  }

  async removeQuestionRoleAssignee(
    questionId: string,
    role: 'gate_keeper' | 'auditor',
    actorName?: string,
  ) {
    const result = await this.roleAssigneeService.removeQuestionRoleAssignee(
      questionId,
      role,
      actorName,
    );
    // Removing an assignee frees BOTH the question (back to the unassigned queue) and
    // the person — fill the role queues now so the question is re-matched and the freed
    // gate keeper / auditor can immediately receive another question.
    this.triggerRoleQueueAllocation('removeQuestionRoleAssignee');
    return result;
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
    const result = await this.allocationService.runAbsentScript();
    // The absent-expert cleanup reclaims questions from blocked experts and pushes them
    // back to in-review — run the moderator queue so free moderators pick them up.
    this.triggerModeratorQueueAllocation('runAbsentScript');
    return result;
  }

  async findAbsentExperts(session: ClientSession) {
    return this.allocationService.findAbsentExperts(session);
  }

  async cleanupQuestionSubmissions(absentExpertIds: string[], session: ClientSession) {
    return this.allocationService.cleanupQuestionSubmissions(absentExpertIds, session);
  }

  async balanceWorkload_copy() {
    return this.allocationService.balanceWorkload_copy();
  }

  async balanceWorkload(session?: ClientSession, type?: string) {
    return this.allocationService.balanceWorkload(session, type);
  }

  async getReallocationPreview(type: string) {
    return this.allocationService.getReallocationPreview(type);
  }

  async manualReallocate(assignments: {submissionId: string; expertId: string}[], inactiveExpertIds?: string[]) {
    return this.allocationService.manualReallocate(assignments, inactiveExpertIds);
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
  async balanceWorkloadSelectedQuestions(questionIds: string[]) {
    return this.allocationService.balanceWorkloadSelectedQuestions(questionIds);
  }

  //send notification to moderators for delayed questions
  async sendDelayedNotifications() {
    return this.maintenanceService.sendDelayedNotifications();
  }

  async backfillEmptyEmbeddings(batchLimit?: number) {
    return this.maintenanceService.backfillEmptyEmbeddings(batchLimit);
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
  async runModeratorQueueCron() {
    return this.moderatorQueueService.runModeratorQueueCron();
  }

  async runGateKeeperAuditorQueueCron() {
    return this.roleAssigneeService.runGateKeeperAuditorQueueCron();
  }

  async freeRoleAssigneeOnStatusChange(
    questionId: string,
    newStatus?: QuestionStatus,
    session?: ClientSession,
  ) {
    return this.roleAssigneeService.freeRoleAssigneeOnStatusChange(questionId, newStatus, session);
  }

  /** Periodic job — handles three cases for time-bound (AJRASAKHA/WHATSAPP) questions:
   *  A) Expert allocated but didn't open in 45 min → penalise + replace.
   *  B) Question never allocated → initial assignment.
   *  C) Initial answer submitted, status still open/delayed → assign reviewer. */
  async reallocateTimeBoundQuestions() {
    return this.allocationService.reallocateTimeBoundQuestions();
  }

  async reallocateManualQuestions() {
    return this.allocationService.reallocateManualQuestions();
  }

  // ── Queue Details helpers ────────────────────────────────────────────────

  /** Current assignee the cron would penalise/replace (used for STUCK items). */
  // ── Queue-details rendering delegates to QueueService ──
  async getQueueSection(
    section: QueueSectionName,
    page = 1,
    limit = 50,
    startTime?: Date,
    endTime?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ) {
    return this.queueService.getQueueSection(
      section,
      page,
      limit,
      startTime,
      endTime,
      isTrainingUser,
      isAdmin,
    );
  }

  async getQueueDetails(
    startTime?: Date,
    endTime?: Date,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
  ) {
    return this.queueService.getQueueDetails(
      startTime,
      endTime,
      isTrainingUser,
      isAdmin,
    );
  }

  /**
   * Remove the second entry from history and queue arrays in a question submission.
   * This is used for migration purposes to fix duplicate entries.
   * @param submissionId - The submission document ID
   */
  async backgroundProcessAction(userId: string) {
    return this.maintenanceService.backgroundProcessAction(userId);
  }

  async removeSubmissionHistoryEntry(questionId: string, index: number) {
    return this.maintenanceService.removeSubmissionHistoryEntry(questionId, index);
  }

  async removeSubmissionQueueEntry(questionId: string, index: number) {
    return this.maintenanceService.removeSubmissionQueueEntry(questionId, index);
  }

  async addSubmissionQueueEntry(questionId: string, expertId: string) {
    return this.maintenanceService.addSubmissionQueueEntry(questionId, expertId);
  }

  async addSubmissionHistoryEntry(questionId: string, rawEntry: Record<string, any>) {
    return this.maintenanceService.addSubmissionHistoryEntry(questionId, rawEntry);
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
  async setNormalizedDomains(entries: {'Question ID'?: string; 'Standardized Domain'?: string}[]) {
    return this.maintenanceService.setNormalizedDomains(entries);
  }

  async getClosedAnswerMismatch(startTime?: Date, endTime?: Date) {
    return this.maintenanceService.getClosedAnswerMismatch(startTime, endTime);
  }

  async backfillClosedModeratorIds(limit?: number) {
    return this.maintenanceService.backfillClosedModeratorIds(limit);
  }

  /**
   * Get feedbacks for a question (paginated)
   * Fetches from external data release service with mock data fallback
   */

  // ─────────────────────────────────────────────────────────────────────────────
  // PAE VALIDATION QUEUE CRON
  // ─────────────────────────────────────────────────────────────────────────────

  // ── PAE validation delegates to PaeValidationService ──
  async processPaeValidationQueue() {
    return this.paeValidationService.processPaeValidationQueue();
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

  async getPaeValidationQueueDetails(params?: { section?: 'waitingAuto' | 'waitingManual' | 'assigned'; page?: number; limit?: number }) {
    return this.paeValidationService.getPaeValidationQueueDetails(params);
  }
}