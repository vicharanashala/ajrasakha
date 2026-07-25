import 'reflect-metadata';
import {
  JsonController,
  Get,
  Put,
  Delete,
  Body,
  HttpCode,
  Params,
  QueryParams,
  Authorized,
  CurrentUser,
  Post,
  Param,
  QueryParam,
  NotFoundError,
  Patch,
  UploadedFile,
  BadRequestError,
  ContentType,
  Res,
  UseBefore,
  InternalServerError,
  Req,
  ForbiddenError,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { ObjectId } from 'mongodb';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import {
  IQuestion,
  IQuestionSubmission,
  IUser,
  IcheckStatusResponseDto
} from '#root/shared/interfaces/models.js';
import type { QAMetadata } from '#root/shared/database/interfaces/ICallDetailsRepository.js';
import { BadRequestErrorResponse } from '#shared/middleware/errorHandler.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import {
  AddQuestionBodyDto,
  AllocatedQuestionsBodyDto,
  DetailedQuestionsBodyDto,
  AllocateExpertsRequest,
  BulkPaeAllocateRequest,
  BulkDeleteQuestionDto,
  DateRangeRequest,
  GeneratedQuestionResponse,
  GenerateQuestionsBody,
  GetDetailedQuestionsQuery,
  QuestionIdParam,
  QuestionResponse,
  RemoveAllocateBody,
  ApproveInitialAnswerBody,
  ReplaceQueueExpertRequest,
  ReallocateExpertsSelectedQuestionsRequest,
} from '../classes/validators/QuestionVaidators.js';
import * as XLSX from 'xlsx';
import {
  getBackgroundJobs,
  getJobById,
  startBackgroundProcessing,
} from '#root/workers/workerManager.js';
import { ContextIdParam } from '#root/modules/context/classes/validators/ContextValidator.js';
import { QuestionService } from '../services/QuestionService.js';
import { UploadFileOptions } from '#root/modules/question/classes/validators/fileUploadOptions.js';
import { QuestionLevelResponse } from '#root/modules/question/classes/transformers/QuestionLevel.js';
import { IQuestionService, QueueSectionName } from '../interfaces/IQuestionService.js';
import { FlexibleAuth } from '#root/shared/functions/flexibleAuth.js';
import { InternalApiAuth } from '#root/shared/index.js';
import { AuditAction, AuditCategory, ModeratorAuditTrail, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { UserService } from '#root/modules/user/index.js';
import { IContextService } from '#root/modules/context/interfaces/index.js';
import { restoreBackupBson } from '#root/utils/DBMigration.js';

@OpenAPI({
  tags: ['questions'],
  description: 'Operations for managing questions',
})
@injectable()
@JsonController('/questions')
export class QuestionController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,

    @inject(GLOBAL_TYPES.UserService)
    private readonly userService: UserService,

    @inject(GLOBAL_TYPES.ContextService)
    private readonly contextService: IContextService,


    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) { }

  @Post('/status-summary')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get total questions count and breakdown by status' })
  async getQuestionStatusSummary(
    @QueryParams() query: GetDetailedQuestionsQuery,
    @Body() body: DetailedQuestionsBodyDto,
  ) {
    const data = await this.questionService.getQuestionStatusSummary(query, body);
    return { success: true, data };
  }

  @Get('/queue-details')
  @HttpCode(200)
  // Gate keepers and auditors get the same read-only queue visibility as moderators —
  // they work the same queues and need to see who is holding what.
  @Authorized(['admin', 'moderator', 'gate_keeper', 'auditor'])
  @OpenAPI({
    summary:
      'Queue details for moderators/admins/gate keepers/auditors. No params → all sections (counts + page 1). With ?section=&page= → one paginated section (exact count + that page of items).',
  })
  async getQueueDetails(
    @QueryParams()
    query: {
      section?: QueueSectionName;
      page?: string;
      limit?: string;
      startTime?: string;
      endTime?: string;
    },
  ) {
    const startTime = query.startTime ? new Date(query.startTime) : undefined;
    const endTime = query.endTime ? new Date(query.endTime) : undefined;

    // Single-section paginated mode (?section=&page=&limit=)
    if (query.section) {
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const data = await this.questionService.getQueueSection(
        query.section,
        page,
        limit,
        startTime,
        endTime,
      );
      return { success: true, data };
    }

    // Full snapshot: all sections, page 1.
    const data = await this.questionService.getQueueDetails(startTime, endTime);
    return { success: true, data };
  }

  @Get('/context/:contextId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get questions by context ID' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async getByContextId(@Params() params: ContextIdParam): Promise<IQuestion[]> {
    const { contextId } = params;
    return this.questionService.getByContextId(contextId);
  }

  @Post('/allocated')
  @HttpCode(200)
  @ResponseSchema(QuestionResponse, { isArray: true })
  @Authorized()
  @OpenAPI({ summary: 'Get all open status questions' })
  async getAllocatedQuestions(
    @QueryParams()
    query: GetDetailedQuestionsQuery,
    @Body() body: AllocatedQuestionsBodyDto,
    @CurrentUser() user: IUser,
  ): Promise<QuestionResponse[]> {
    const userId = user._id.toString();
    const canViewQueue =
      user.role === 'admin' || user.role === 'moderator' || user.role === 'gate_keeper' || user.role === 'auditor';
    const targetUserId =
      canViewQueue && query.user && query.user !== 'all'
        ? query.user
        : userId;

    return this.questionService.getAllocatedQuestions(targetUserId, query, body);
  }

  @Get('/allocated/page')
  @Authorized()
  @OpenAPI({ summary: 'Get particular question' })
  async getAllocatedQuestionPage(
    @QueryParams() query: { questionId: string },
    @CurrentUser() user: IUser,
  ) {
    return this.questionService.getAllocatedQuestionPage(
      user._id.toString(),
      query.questionId,
    );
  }

  @Post('/detailed')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get detailed questions with advanced filters' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async getDetailedQuestions(
    @QueryParams() query: GetDetailedQuestionsQuery,
    @Body() body: DetailedQuestionsBodyDto,
  ): Promise<{ questions: IQuestion[]; totalPages: number }> {
    return this.questionService.getDetailedQuestions(query, body);
  }

  @Post('/generate')
  @HttpCode(200)
  @ResponseSchema(GeneratedQuestionResponse, { isArray: true })
  @Authorized()
  @OpenAPI({ summary: 'Generate questions from raw transcript' })
  async getQuestionFromRawContext(
    @Body() body: GenerateQuestionsBody,
  ): Promise<GeneratedQuestionResponse[]> {
    return this.questionService.getQuestionFromRawContext(body.query);
  }

  @Post('/generate-by-call-context')
  @HttpCode(200)
  @ResponseSchema(GeneratedQuestionResponse, { isArray: true })
  @Authorized()
  @OpenAPI({ summary: 'Generate questions from call context' })
  async getQuestionFromCallContext(
    @Body() body: GenerateQuestionsBody,
  ): Promise<GeneratedQuestionResponse[]> {
    return this.questionService.getQuestionFromCallContext(body.query, body.state, body.crop);
  }

  @Post('/call-summary')
  @HttpCode(200)
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  @OpenAPI({ summary: 'Generate call summary from raw transcript' })
  async getCallSummary(
    @Body() body: GenerateQuestionsBody,
  ): Promise<any> {
    return this.questionService.getCallSummary(body.query);
  }

  // HITL Flow Endpoints
  @Post('/acc-agent/thread')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Create ACC Agent thread for HITL flow' })
  async createAccAgentThread(): Promise<{ thread_id: string }> {
    try {
      const result = await this.questionService.createAccAgentThread();
      return result;
    } catch (error) {
      console.error('[QuestionController] createAccAgentThread: Error', error);
      throw error;
    }
  }

  @Post('/acc-agent/extract')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Extract data from transcript using ACC Agent' })
  async extractAccAgentData(
    @Body() body: { threadId: string; transcript: string }
  ): Promise<{
    extracted_query: string;
    extracted_crop: string;
    extracted_state: string;
    extracted_district: string;
    extracted_domain?: string | string[];
    extracted_name?: string;
    extracted_phone?: string;
    extracted_age?: number;
    extracted_gender?: string;
    extracted_village?: string;
    extracted_block?: string;
    extracted_primary_crop?: string;
  }> {
    try {
      const result = await this.questionService.extractAccAgentData(body.threadId, body.transcript);
      return result;
    } catch (error) {
      console.error('[QuestionController] extractAccAgentData: Error', error);
      throw error;
    }
  }

  @Post('/acc-agent/update-state')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Update ACC Agent state with human corrections' })
  async updateAccAgentState(
    @Body() body: {
      threadId: string;
      correctedData: {
        query: string;
        crop: string;
        state: string;
        district: string;
        domain: string | string[];
        season: string;
        farmerName?: string;
        farmerPhone?: string;
        farmerAge?: number;
        farmerGender?: string;
        farmerVillage?: string;
        farmerBlock?: string;
        farmerPrimaryCrop?: string;
      };
    }
  ): Promise<{ success: boolean }> {
    try {
      await this.questionService.updateAccAgentState(body.threadId, body.correctedData);
      return { success: true };
    } catch (error) {
      console.error('[QuestionController] updateAccAgentState: Error', error);
      throw error;
    }
  }

  @Post('/acc-agent/resume')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Resume ACC Agent and get final answer' })
  async resumeAccAgentAndGetAnswer(
    @Body() body: { threadId: string; callUuid?: string; metadata?: QAMetadata }
  ): Promise<any> {
    try {
      // const result = await this.questionService.resumeAccAgentAndGetAnswer(body.threadId, body.callUuid, body.metadata);
      const result = await this.questionService.getAccAgentState(body.threadId, body.callUuid, body.metadata);
      return result;
    } catch (error) {
      console.error('[QuestionController] resumeAccAgentAndGetAnswer: Error', error);
      throw error;
    }
  }

  @Post('/')
  @HttpCode(201)
  @UseBefore(FlexibleAuth)
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  @OpenAPI({ summary: 'Add a new question (single or bulk upload)' })
  async addQuestion(
    @UploadedFile('file', { options: UploadFileOptions })
    file: Express.Multer.File,
    @Body() body: AddQuestionBodyDto,
    @CurrentUser() user: IUser,
    @Req() req: any,
  ): Promise<Partial<any> | { message: string }> {
    verifyNotTester(user);
    const userId = user?._id?.toString();

    const name = `${user?.firstName} ${user?.lastName}`
    const actorPayload = userId ? {
      id: userId,
      name: name,
      email: user?.email,
      role: user?.role,
      avatar: user?.avatar || '',
      source: body.source
    } : null

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.QUESTION_ADD,
      actor: actorPayload,
    };


    if (file) {
      let payload: any[] = [];
      const isRequiredAiInitialAnswer =
        body.isRequiredAiInitialAnswer === 'true';

      const isOutreachQuestion =
        body.isOutreachQuestion === 'true';

      // Read directly from req.body (multer-parsed) to avoid class-transformer dropping fields
      const rawBody = req.body || {};
      const isTrainingQuestion =
        rawBody.isTrainingQuestion === 'true' || body.isTrainingQuestion === true;
      const allocationMode = rawBody.allocationMode || body.allocationMode || 'expert';
      const paeExpertId: string | undefined = rawBody.paeExpertId || body.paeExpertId;
      console.log('[BulkUpload] rawBody:', rawBody);
      console.log('[BulkUpload] allocationMode:', allocationMode, '| paeExpertId:', paeExpertId);


      try {
        const mimetype = file.mimetype;
        const filename = file.originalname.toLowerCase();

        if (mimetype === 'application/json' || filename.endsWith('.json')) {
          const fileContent = file.buffer
            .toString('utf-8')
            .trim()
            .replace(/^\uFEFF/, '');
          payload = JSON.parse(fileContent);
        } else if (
          mimetype ===
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          mimetype === 'application/vnd.ms-excel' ||
          filename.endsWith('.xls') ||
          filename.endsWith('.xlsx')
        ) {
          const workbook = XLSX.read(file.buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          payload = XLSX.utils.sheet_to_json(worksheet);
        } else {
          throw new BadRequestError(
            'Unsupported file type. Please upload a JSON or Excel file.',
          );
        }

        if (!Array.isArray(payload)) {
          throw new BadRequestError(
            'File content must be an array of questions',
          );
        }

        console.log('Paylod: ', payload);
        const actor = {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user?.avatar || '',
        };
        setImmediate(() => startBackgroundProcessing(
          actor,
          this.auditTrailsService,
          isRequiredAiInitialAnswer,
          isOutreachQuestion,
          isTrainingQuestion,
          payload,
          allocationMode,
          paeExpertId
        ));

        return {
          message: `Processing ${payload.length} question(s). Non-duplicate entries are being assigned to experts${isRequiredAiInitialAnswer ? " with AI-generated initial answers" : ""}.`,
          count: payload.length,
          isBulkUpload: !!file,
        };
      } catch (err: any) {
        auditPayload = {
          ...auditPayload,
          action: AuditAction.QUESTION_BULK_CREATE,
          context: {
            ...this.flattenPayload(payload),
          },
          outcome: {
            status: OutComeStatus.FAILED,
            errorCode: err?.errorCode || 'INTERNAL_ERROR',
            errorMessage: err?.message || 'Failed to process uploaded file',
            errorName: err?.name || 'Error',
            errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
          },
          createdAt: new Date(),
        };

        this.auditTrailsService.createAuditTrail(auditPayload);
        throw new BadRequestError(
          err?.message || 'Failed to process uploaded file',
        );
      }
    } else {
      let data;

      try {
        console.log("the controller body coming===", body)
        const result = await this.questionService.addQuestion(userId, body);
        data = result.data;
      } catch (err: any) {
        auditPayload = {
          ...auditPayload,
          context: {
            payload: body,
          },
          outcome: {
            status: OutComeStatus.FAILED,
            errorCode: err?.errorCode || 'INTERNAL_ERROR',
            errorMessage: err?.message || 'Failed to add question',
            errorName: err?.name || 'Error',
            errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
          },
        };
        if (actorPayload !== null) {
          this.auditTrailsService.createAuditTrail(auditPayload);
        }
        if (err instanceof InternalServerError) {
          throw new InternalServerError(err.message);
        }
        throw new BadRequestError(
          err?.message || 'Failed to add question',
        );
      }

      auditPayload = {
        ...auditPayload,
        context: {
          questionId: Array(data._id.toString()),
        },
        changes: {
          after: {
            question: data.question,
            details: data.details
          }
        },

        outcome: {
          status: OutComeStatus.SUCCESS,
        },
        createdAt: new Date(),
      };



      if (actorPayload !== null) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }



      return {
        success: true,
        message: 'Question submitted successfully.',
        question_id: data._id
      };
    }
  }
  @Post('/reAllocateLessWorkload')
  @HttpCode(200)
  // @ResponseSchema(Object, {statusCode: 400})
  @OpenAPI({ summary: 'ReAllocating questions which are delayed to those who has less workload' })
  async reAllocateLessWorkload(
    @CurrentUser() user: IUser,
    @QueryParam('type') type?: string,
  ) {
    verifyNotTester(user);
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.REALLOCATE_QUESTIONS,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      createdAt: new Date(),
    };
    try {
      const result = await this.questionService.balanceWorkload(undefined, type);
      auditPayload = {
        ...auditPayload,
        changes: {
          after: {
            expertsInvolved: result.expertsInvolved,
            submissionsProcessed: result.submissionsProcessed,
          },
        },
        outcome: {
          status: OutComeStatus.SUCCESS,
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return result;
    }
    catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage: err?.message || 'Failed to process uploaded file',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      throw new BadRequestError(
        err?.message || 'Failed to process uploaded file',
      );

    }
  }

  @Get('/reallocation-preview')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get preview of questions and experts for reallocation' })
  async getReallocationPreview(@QueryParam('type') type: string) {
    return this.questionService.getReallocationPreview(type);
  }

  @Post('/reallocate-manual')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Manually reallocate questions to experts' })
  async reallocateManual(
    @Body() body: {
      assignments: { submissionId: string; expertId: string }[];
      inactiveExpertIds?: string[];
    },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.REALLOCATE_QUESTIONS,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        endPoint: 'reallocateManual',
        assignmentsCount: body.assignments?.length,
        inactiveExpertIds: body.inactiveExpertIds,
      },
      createdAt: new Date(),
    };
    try {
      const result = await this.questionService.manualReallocate(body.assignments, body.inactiveExpertIds);
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        changes: { after: { assignments: body.assignments } },
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return result;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to manually reallocate',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to manually reallocate');
    }
  }

  @Get("/download-question-report")
  @Authorized()
  @ContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @OpenAPI({ summary: 'Download question report as Excel' })
  async downloadQuestionReport(
    @QueryParams() query: { consecutiveApprovals?: string; startDate?: string; endDate?: string },
    @CurrentUser() user: IUser,
    @Res() response: any,
  ) {
    const userId = user._id.toString();
    const consecutiveApprovals = query.consecutiveApprovals
      ? parseInt(query.consecutiveApprovals, 10)
      : undefined;

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    let data;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.DOWNLOAD_REPORTS,
      action: AuditAction.DOWNLOAD,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        startDate: startDate,
        endDate: endDate,
        endPoint: "downloadQuestionReport",
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      const isAdmin = user.role === 'admin'
      data = await this.questionService.generateQuestionReport(consecutiveApprovals, startDate, endDate, user.isTrainingUser??false,isAdmin??false);
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to generate question report',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to generate question report',
      );
    }
    this.auditTrailsService.createAuditTrail(auditPayload);

    if (!data) {
      response.status(200).json({
        success: false,
        message: "No data found for the selected filters"
      });
      return;
    }

    return Buffer.from(data as ArrayBuffer);
  }

  @Get("/download-overall-report")
  @Authorized()
  @ContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @OpenAPI({ summary: 'Download overall questions report by month as Excel' })
  async downloadOverallReport(
    @QueryParams() query: { startDate?: string; endDate?: string },
    @CurrentUser() user: IUser,
    @Res() response: any,
  ) {
    const isAdmin = user.role === 'admin'
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    let data;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.DOWNLOAD_REPORTS,
      action: AuditAction.DOWNLOAD,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        startDate: startDate,
        endDate: endDate,
        endPoint: "downloadOverallReport",
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      data = await this.questionService.generateOverallQuestionReport(startDate, endDate,user.isTrainingUser??false,isAdmin??false);
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to generate overall question report',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to generate overall question report',
      );
    }
    this.auditTrailsService.createAuditTrail(auditPayload);

    if (!data) {
      response.status(200).json({
        success: false,
        message: "No data found for the selected date range"
      });
      return;
    }

    return Buffer.from(data);
  }

  @Get("/download-filtered-report")
  @Authorized()
  @ContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @OpenAPI({ summary: 'Download filtered questions report as Excel' })
  async downloadFilteredReport(
    @QueryParams() query: {
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
      moderator?: string;
    },
    @CurrentUser() user: IUser,
    @Res() response: any,
  ) {
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.DOWNLOAD_REPORTS,
      action: AuditAction.DOWNLOAD,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        filters: query,
        endPoint: "downloadFilteredReport",
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    let data;
    try {
      data = await this.questionService.generateStateCropQuestionReport({
        state: query.state,
        crop: query.crop,
        normalised_crop: query.normalised_crop,
        season: query.season,
        domain: query.domain,
        status: query.status,
        source: query.source,
        hiddenQuestions: query.hiddenQuestions,
        duplicateQuestions: query.duplicateQuestions,
        startDate: query.startDate,
        endDate: query.endDate,
        moderator: query.moderator,
      });
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to generate filtered question report',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to generate filtered question report',
      );
    }

    this.auditTrailsService.createAuditTrail(auditPayload);
    if (!data) {
      response.status(200).json({
        success: false,
        message: "No questions found for the selected filters"
      });
      return;
    }

    return Buffer.from(data);
  }

  @Get("/download-duplicate-questions-report")
  @Authorized()
  @ContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @OpenAPI({ summary: 'Download duplicate questions report as Excel' })
  async downloadDuplicateReport(
    @QueryParams() query: { startDate?: string; endDate?: string },
    @CurrentUser() user: IUser,
    @Res() response: any,
  ) {
    const isAdmin = user.role === 'admin';
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.DOWNLOAD_REPORTS,
      action: AuditAction.DOWNLOAD,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: { startDate, endDate, endPoint: 'downloadDuplicateReport' },
      createdAt: new Date(),
    };
    try {
      const data = await this.questionService.generateDuplicateQuestionReport(startDate, endDate, user.isTrainingUser ?? false, isAdmin ?? false);
      if (!data) {
        this.auditTrailsService.createAuditTrail({
          ...auditPayload,
          outcome: { status: OutComeStatus.SUCCESS },
          changes: { after: { result: 'No duplicate questions found' } },
        });
        response.status(200).json({
          success: false,
          message: "No duplicate questions found for the selected date range"
        });
        return;
      }
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return Buffer.from(data);
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to download duplicate report',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      throw err;
    }
  }

  // NOTE: must be declared BEFORE the '/:questionId' routes below, otherwise
  // routing-controllers matches '/role-dashboard' against '/:questionId' first and its
  // ObjectId validator rejects it ("Invalid params").
  @Get('/role-dashboard')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary:
      'Dashboard for the logged-in gate keeper / auditor: assigned + submitted counts and their paginated questions.',
  })
  async getRoleDashboard(
    @CurrentUser() user: IUser,
    @QueryParams()
    query: {
      page?: number;
      limit?: number;
      search?: string;
      userId?: string;
      role?: 'gate_keeper' | 'auditor';
      startDate?: string;
      endDate?: string;
      dateFilterType?: 'assigned' | 'completed' | 'both';
    },
  ) {
    // Managers (admin / moderator) may view a specific gate keeper's / auditor's
    // dashboard by passing that user's id + role. Everyone else sees their own.
    const isManager = user.role === 'admin' || user.role === 'moderator';
    const viewingOther =
      isManager &&
      !!query.userId &&
      (query.role === 'gate_keeper' || query.role === 'auditor');

    const targetUserId = viewingOther ? query.userId! : user._id.toString();
    const role = viewingOther
      ? query.role!
      : user.role === 'gate_keeper' || user.role === 'auditor'
        ? user.role
        : null;
    if (!role) {
      throw new BadRequestError(
        'This dashboard is only available for gate keepers and auditors.',
      );
    }
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 11;

    // Parse date range - ensure startDate has 00:00:00 and endDate has 23:59:59
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (query.startDate) {
      startDate = new Date(query.startDate);
      startDate.setHours(0, 0, 0, 0);
    }
    if (query.endDate) {
      endDate = new Date(query.endDate);
      endDate.setHours(23, 59, 59, 999);
    }

    return this.questionService.getRoleAssigneeDashboard(
      targetUserId,
      role,
      page,
      limit,
      query.search,
      startDate,
      endDate,
      query.dateFilterType || 'both',
    );
  }

  @Get('/:questionId/submission-exists')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Check if a submission exists for this question' })
  async checkSubmissionExists(
    @Params() params: QuestionIdParam,
  ): Promise<{ exists: boolean }> {
    const exists = await this.questionService.checkSubmissionExists(params.questionId);
    return { exists };
  }

  @Get('/:questionId')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(QuestionResponse)
  @OpenAPI({ summary: 'Get selected question by ID' })
  async getQuestionById(
    @Params() params: QuestionIdParam,
    @Body() updates: Partial<QuestionResponse>,
  ): Promise<QuestionResponse> {
    const { questionId } = params;
    return this.questionService.getQuestionById(questionId);
  }

  @Get('/:questionId/full')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get full details of selected question by ID' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async getQuestionFull(
    @Params() params: QuestionIdParam,
    @CurrentUser() user: IUser,
  ) {
    const { questionId } = params;
    const userId = user._id.toString();
    const { question, approved_moderator, assigned_moderator, assigned_gate_keeper, assigned_auditor, isAssignedModerator, isAssignedGateKeeper, isAssignedAuditor } = await this.questionService.getQuestionFullData(
      questionId,
      userId,
    );

    if (!question) {
      throw new NotFoundError(`Question with id ${questionId} not found`);
    }

    return { success: true, data: { ...question, approved_moderator, assigned_moderator, assigned_gate_keeper, assigned_auditor, isAssignedModerator, isAssignedGateKeeper, isAssignedAuditor } };
  }

  @Patch('/:questionId/toggle-auto-allocate')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Toggle auto-allocate option for the selected question' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async toggleAutoAllocate(@Params() params: QuestionIdParam, @CurrentUser() user: IUser,) {
    verifyNotTester(user);
    const { questionId } = params;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.EXPERTS_AUTO_ALLOCATE,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        questionId: questionId,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    let result;
    let questionDetails;
    let expertDetails;
    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      result = await this.questionService.toggleAutoAllocate(questionId);
      if (result?.data?.length > 0) {
        const expertIdToString = result?.data?.map(id => id.toString()) || [];
        expertDetails = await Promise.all(expertIdToString.map((id) => this.userService.getUserById(id)));
      }
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        context: {
          ...auditPayload.context,
          question: questionDetails?.question,
        },
        changes: {
          before: {
            autoAllocate: questionDetails?.isAutoAllocate,
          },
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to toggle auto-allocate',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to toggle auto-allocate',
      );
    }
    auditPayload = {
      ...auditPayload,
      context: {
        ...auditPayload.context,
        question: questionDetails.text,
      },
      changes: {
        before: {
          autoAllocate: questionDetails.isAutoAllocate,
        },
        after: {
          autoAllocate: !questionDetails.isAutoAllocate,
          expertsDetails: expertDetails?.length > 0 ? expertDetails.map(ed => ({
            name: `${ed?.firstName} ${ed?.lastName || ''}`.trim(),
            email: ed?.email,
            id: ed?._id.toString(),
          })) : [],
        },
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return result.message;
  }

  @Patch('/:questionId/moderator')
  @HttpCode(200)
  // Gate keepers and auditors triage questions onward, so they assign moderators too.
  @Authorized(['admin', 'moderator', 'gate_keeper', 'auditor'])
  @OpenAPI({ summary: 'Change the moderator assigned to a question' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async changeModerator(
    @Params() params: QuestionIdParam,
    @Body() body: { moderatorId: string },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { questionId } = params;
    const { moderatorId } = body;
    if (!moderatorId) {
      throw new BadRequestError('moderatorId is required');
    }

    let questionDetails: any;
    let prevModerator: any;
    let newModerator: any;
    const moderatorLabel = (m: any) =>
      m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() + (m.email ? ` (${m.email})` : '') : null;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.SELECT_MODERATOR,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: { questionId },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };

    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      const prevModeratorId = (questionDetails as any)?.moderatorId?.toString();
      // Guard against a malformed previous moderatorId so a bad stored value can't
      // throw a BSONError when we look up the previous moderator.
      [prevModerator, newModerator] = await Promise.all([
        prevModeratorId && ObjectId.isValid(prevModeratorId)
          ? this.userService.getUserById(prevModeratorId)
          : null,
        this.userService.getUserById(moderatorId),
      ]);

      await this.questionService.changeQuestionModerator(questionId, moderatorId);

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { moderator: moderatorLabel(prevModerator) ?? 'Unassigned' },
          after: { moderator: moderatorLabel(newModerator) ?? moderatorId },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return { success: true, message: 'Moderator updated successfully' };
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { moderator: moderatorLabel(prevModerator) ?? 'Unassigned' },
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to change moderator',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to change moderator');
    }
  }

  @Delete('/:questionId/moderator')
  @HttpCode(200)
  // Gate keepers and auditors triage questions onward, so they assign moderators too.
  @Authorized(['admin', 'moderator', 'gate_keeper', 'auditor'])
  @OpenAPI({ summary: 'Remove the moderator assigned to a question' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async removeModerator(
    @Params() params: QuestionIdParam,
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { questionId } = params;

    let questionDetails: any;
    let prevModerator: any;
    const moderatorLabel = (m: any) =>
      m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() + (m.email ? ` (${m.email})` : '') : null;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.DELETE_MODERATOR,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: { questionId },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };

    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      const prevModeratorId = (questionDetails as any)?.moderatorId?.toString();
      prevModerator = prevModeratorId ? await this.userService.getUserById(prevModeratorId) : null;

      await this.questionService.removeQuestionModerator(questionId);

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { moderator: moderatorLabel(prevModerator) ?? 'Unassigned' },
          after: { moderator: 'Unassigned' },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return { success: true, message: 'Moderator removed successfully' };
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { moderator: moderatorLabel(prevModerator) ?? 'Unassigned' },
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to remove moderator',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to remove moderator');
    }
  }

  // ── Gate keeper / auditor role assignee (re)assign, remove & allocation toggle ──

  /** Shared actor block + user label helper for role-queue audit entries. */
  private roleAuditActor(user: IUser) {
    return {
      id: user._id.toString(),
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      avatar: user?.avatar || '',
    };
  }
  private userLabel(u: any): string | null {
    return u
      ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() +
          (u.email ? ` (${u.email})` : '')
      : null;
  }

  @Patch('/:questionId/role-assignee')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Assign a gate keeper / auditor to a question' })
  async changeRoleAssignee(
    @Params() params: QuestionIdParam,
    @Body() body: { role: 'gate_keeper' | 'auditor'; userId: string },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { questionId } = params;
    const { role, userId } = body;
    if (role !== 'gate_keeper' && role !== 'auditor') {
      throw new BadRequestError("role must be 'gate_keeper' or 'auditor'");
    }
    if (!userId) throw new BadRequestError('userId is required');

    const noun = role === 'gate_keeper' ? 'gate keeper' : 'auditor';
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: role === 'gate_keeper' ? AuditAction.SELECT_GATE_KEEPER : AuditAction.SELECT_AUDITOR,
      actor: this.roleAuditActor(user),
      context: { questionId },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };
    let questionDetails: any;
    let prevUser: any;
    let newUser: any;
    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      const prevId = (questionDetails as any)?.[role === 'gate_keeper' ? 'gateKeeperId' : 'auditorId']?.toString();
      [prevUser, newUser] = await Promise.all([
        prevId && ObjectId.isValid(prevId) ? this.userService.getUserById(prevId) : null,
        this.userService.getUserById(userId),
      ]);

      await this.questionService.changeQuestionRoleAssignee(
        questionId,
        role,
        userId,
        `${user.firstName} ${user.lastName ?? ''}`.trim(),
      );

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { [noun]: this.userLabel(prevUser) ?? 'Unassigned' },
          after: { [noun]: this.userLabel(newUser) ?? userId },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return { success: true, message: `${noun} updated successfully` };
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: { before: { [noun]: this.userLabel(prevUser) ?? 'Unassigned' } },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || `Failed to change ${noun}`,
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) throw new InternalServerError(err.message);
      throw new BadRequestError(err?.message || `Failed to change ${noun}`);
    }
  }

  @Delete('/:questionId/role-assignee')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Remove the gate keeper / auditor assigned to a question' })
  async removeRoleAssignee(
    @Params() params: QuestionIdParam,
    @Body() body: { role: 'gate_keeper' | 'auditor' },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { questionId } = params;
    const { role } = body;
    if (role !== 'gate_keeper' && role !== 'auditor') {
      throw new BadRequestError("role must be 'gate_keeper' or 'auditor'");
    }

    const noun = role === 'gate_keeper' ? 'gate keeper' : 'auditor';
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: role === 'gate_keeper' ? AuditAction.DELETE_GATE_KEEPER : AuditAction.DELETE_AUDITOR,
      actor: this.roleAuditActor(user),
      context: { questionId },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };
    let questionDetails: any;
    let prevUser: any;
    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      const prevId = (questionDetails as any)?.[role === 'gate_keeper' ? 'gateKeeperId' : 'auditorId']?.toString();
      prevUser = prevId && ObjectId.isValid(prevId) ? await this.userService.getUserById(prevId) : null;

      await this.questionService.removeQuestionRoleAssignee(
        questionId,
        role,
        `${user.firstName} ${user.lastName ?? ''}`.trim(),
      );

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { [noun]: this.userLabel(prevUser) ?? 'Unassigned' },
          after: { [noun]: 'Unassigned' },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return { success: true, message: `${noun} removed successfully` };
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: { before: { [noun]: this.userLabel(prevUser) ?? 'Unassigned' } },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || `Failed to remove ${noun}`,
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) throw new InternalServerError(err.message);
      throw new BadRequestError(err?.message || `Failed to remove ${noun}`);
    }
  }

  @Patch('/:questionId/role-allocation')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Toggle gate keeper / auditor auto-allocation for a question' })
  async toggleRoleAllocation(
    @Params() params: QuestionIdParam,
    @Body() body: { role: 'gate_keeper' | 'auditor'; enabled: boolean },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { questionId } = params;
    const { role, enabled } = body;
    if (role !== 'gate_keeper' && role !== 'auditor') {
      throw new BadRequestError("role must be 'gate_keeper' or 'auditor'");
    }
    const field = role === 'gate_keeper' ? 'autoAllocateGateKeeper' : 'autoAllocateAuditor';
    const label = role === 'gate_keeper' ? 'Gate keeper' : 'Auditor';

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: role === 'gate_keeper' ? AuditAction.TOGGLE_GATE_KEEPER_ALLOCATION : AuditAction.TOGGLE_AUDITOR_ALLOCATION,
      actor: this.roleAuditActor(user),
      context: { questionId },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };
    let questionDetails: any;
    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      // Default is ON (true) unless explicitly false.
      const before = (questionDetails as any)?.[field] !== false;

      await this.questionService.updateQuestion(questionId, { [field]: enabled } as any);

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { [`${label} auto-allocation`]: before ? 'On' : 'Off' },
          after: { [`${label} auto-allocation`]: enabled ? 'On' : 'Off' },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return { success: true, message: `${label} auto-allocation turned ${enabled ? 'on' : 'off'}` };
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to toggle allocation',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) throw new InternalServerError(err.message);
      throw new BadRequestError(err?.message || 'Failed to toggle allocation');
    }
  }

  @Post('/bulk-pae-allocate')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Bulk allocate PAE experts to multiple draft questions' })
  async bulkAllocatePaeExperts(
    @Body() body: BulkPaeAllocateRequest,
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { _id: userId } = user;
    const { questionIds, paeExpertId } = body;
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.BULK_PAE_ALLOCATE,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        questionCount: questionIds?.length,
        paeExpertId,
      },
      createdAt: new Date(),
    };
    try {
      const result = await this.questionService.bulkAllocatePaeExperts(
        userId.toString(),
        questionIds,
        paeExpertId,
      );
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        changes: { after: { questionIds, paeExpertId } },
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return result;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to bulk allocate PAE experts',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to bulk allocate PAE experts');
    }
  }

  @Post('/:questionId/allocate-experts')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Manually allocate experts to a selected question' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async allocateExperts(
    @Params() params: QuestionIdParam,
    @Body() body: AllocateExpertsRequest,
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { _id: userId } = user;
    const { questionId } = params;
    const { experts } = body;
    let expertDetails;
    let questionDetails;
    let result;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.SELECT_EXPERT,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        questionId: questionId,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      expertDetails = await Promise.all(experts.map((id) => this.userService.getUserById(id)));
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      result = await this.questionService.allocateExperts(
        userId.toString(),
        questionId,
        experts,
      );
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        context: {
          ...auditPayload.context,
          question: questionDetails?.question,
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to allocate experts',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to allocate experts',
      );
    }

    auditPayload = {
      ...auditPayload,
      context: {
        ...auditPayload.context,
        question: questionDetails.question,
      },
      changes: {
        ...auditPayload.changes,
        after: {
          expertsDetails: expertDetails.map(ed => ({
            name: `${ed?.firstName} ${ed?.lastName || ''}`.trim(),
            email: ed?.email,
            role: ed?.role,
            id: ed?._id.toString(),
          })),
        },
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return result;
  }

  @Put('/:questionId')
  @HttpCode(200)
  @UseBefore(FlexibleAuth)
  @ResponseSchema(QuestionResponse, { isArray: true })
  @OpenAPI({ summary: 'Update a question by ID' })
  async updateQuestion(
    @Params() params: QuestionIdParam,
    @Body() updates: Partial<IQuestion>,
    @CurrentUser() user: IUser,
  ): Promise<{ modifiedCount: number }> {
    verifyNotTester(user);
    const { questionId } = params;
    let prevQuestion;
    let response;
    let questionDetails;

    const isPassAction = updates.status === 'pass';

    // ─── Pass Question Audit Trail ───────────────────────────────────────────
    if (isPassAction) {
      const auditPayload: ModeratorAuditTrail = {
        category: AuditCategory.QUESTION,
        action: AuditAction.QUESTION_PASS,
        actor: {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user?.avatar || '',
        },
        context: { questionId },
        createdAt: new Date(),
      };
      updates.passedBy = new ObjectId(user._id.toString());
      try {
        prevQuestion = await this.questionService.getQuestionById(questionId);
        response = await this.questionService.updateQuestion(questionId, updates);
        this.auditTrailsService.createAuditTrail({
          ...auditPayload,
          changes: {
            before: { status: prevQuestion.status, question: prevQuestion.text },
            after: { status: updates.status },
          },
          outcome: { status: OutComeStatus.SUCCESS },
        });
        return response;
      } catch (err: any) {
        this.auditTrailsService.createAuditTrail({
          ...auditPayload,
          changes: {
            before: prevQuestion
              ? { status: prevQuestion.status, question: prevQuestion.text }
              : undefined,
          },
          outcome: {
            status: OutComeStatus.FAILED,
            errorCode: err?.errorCode || 'INTERNAL_ERROR',
            errorMessage: err?.message || 'Failed to pass question',
            errorName: err?.name || 'Error',
            errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
          },
        });
        if (err instanceof InternalServerError) {
          throw new InternalServerError(err.message);
        }
        throw new BadRequestError(
          err?.message || 'Failed to pass question',
        );
      }
    }

    // ─── Push to Auditor — Gate Keeper hand-off → status 'auditor_review',
    //     audited as PUSH_TO_AUDITOR ─────────────────────────────────────────────
    if (updates.status === 'auditor_review') {
      // The comment is sent in the body for the audit trail only — neither it nor a
      // push timestamp are persisted on the question (both live in the audit trail).
      const gateKeeperComment = ((updates as any).gateKeeperComment ?? '').trim();
      const auditPayload: ModeratorAuditTrail = {
        category: AuditCategory.QUESTION,
        action: AuditAction.PUSH_TO_AUDITOR,
        actor: {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user?.avatar || '',
        },
        context: { questionId, reason: gateKeeperComment },
        createdAt: new Date(),
      };

      try {
        prevQuestion = await this.questionService.getQuestionById(questionId);
        // Record what the question was (dynamic vs duplicate) before the hand-off so the
        // Auditor can show the right action even though the status is now auditor_review.
        const auditorReviewType: 'dynamic' | 'duplicate' =
          prevQuestion?.status === 'dynamic' ? 'dynamic' : 'duplicate';
        const pushUpdates: Partial<IQuestion> = {
          status: 'auditor_review',
          auditorReviewType,
        };
        response = await this.questionService.updateQuestion(questionId, pushUpdates);
        this.auditTrailsService.createAuditTrail({
          ...auditPayload,
          changes: {
            before: { status: prevQuestion?.status },
            after: { status: 'auditor_review', auditorReviewType, gateKeeperComment },
          },
          outcome: { status: OutComeStatus.SUCCESS },
        });
        return response;
      } catch (err: any) {
        this.auditTrailsService.createAuditTrail({
          ...auditPayload,
          outcome: {
            status: OutComeStatus.FAILED,
            errorCode: err?.errorCode || 'INTERNAL_ERROR',
            errorMessage: err?.message || 'Failed to push to auditor',
            errorName: err?.name || 'Error',
            errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
          },
        });
        if (err instanceof InternalServerError) {
          throw new InternalServerError(err.message);
        }
        throw new BadRequestError(err?.message || 'Failed to push to auditor');
      }
    }

    // ─── Cancel Duplicate — reopen the question, audited as CANCEL_DUPLICATE ──
    if (updates.isDuplicateCancelled === true) {
      // Reason is sent in the body for the audit trail only — it is never persisted
      // on the question, so it is read via cast rather than from the IQuestion type.
      const cancelReason = ((updates as any).duplicateCancelReason ?? '').trim();
      // Persist only the flag + reopen the question, and set auto-allocation per the
      // moderator's confirmation choice. The cancel reason and timestamp are recorded
      // in the audit trail below, NOT stored on the question document.
      const cancelUpdates: Partial<IQuestion> = {
        status: 'open',
        isDuplicateCancelled: true,
        isAutoAllocate: updates.isAutoAllocate === true,
      };

      const auditPayload: ModeratorAuditTrail = {
        category: AuditCategory.QUESTION,
        action: AuditAction.CANCEL_DUPLICATE,
        actor: {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user?.avatar || '',
        },
        context: { questionId, reason: cancelReason },
        createdAt: new Date(),
      };

      try {
        prevQuestion = await this.questionService.getQuestionById(questionId);
        response = await this.questionService.updateQuestion(questionId, cancelUpdates);
        this.auditTrailsService.createAuditTrail({
          ...auditPayload,
          changes: {
            before: { status: prevQuestion?.status, isAutoAllocate: prevQuestion?.isAutoAllocate },
            after: {
              status: 'open',
              isDuplicateCancelled: true,
              isAutoAllocate: cancelUpdates.isAutoAllocate,
              duplicateCancelReason: cancelReason,
            },
          },
          outcome: { status: OutComeStatus.SUCCESS },
        });
        return response;
      } catch (err: any) {
        this.auditTrailsService.createAuditTrail({
          ...auditPayload,
          changes: prevQuestion
            ? { before: { status: prevQuestion.status, question: prevQuestion.text } }
            : {},
          outcome: {
            status: OutComeStatus.FAILED,
            errorCode: err?.errorCode || 'INTERNAL_ERROR',
            errorMessage: err?.message || 'Failed to cancel duplicate',
            errorName: err?.name || 'Error',
            errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
          },
        });
        if (err instanceof InternalServerError) {
          throw new InternalServerError(err.message);
        }
        throw new BadRequestError(err?.message || 'Failed to cancel duplicate');
      }
    }

    // ─── Generic update (non-pass) — audited as QUESTION_UPDATE ──────────────
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.QUESTION_UPDATE,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: { questionId },
      outcome: { status: OutComeStatus.SUCCESS },
      createdAt: new Date(),
    };
    try {
      // Snapshot the current values before applying the edit (for the before/after diff).
      prevQuestion = await this.questionService.getQuestionById(questionId);
      questionDetails = {
        question: (prevQuestion as any)?.question,
        text: prevQuestion?.text,
        details: prevQuestion?.details,
        status: prevQuestion?.status,
        priority: prevQuestion?.priority,
        aiInitialAnswer: (prevQuestion as any)?.aiInitialAnswer,
      };
      response = await this.questionService.updateQuestion(questionId, updates);
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.text },
        changes: questionDetails ? { before: questionDetails } : {},
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to update question',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to update question');
    }

    // Log only the fields that actually changed (before → after).
    const before: Record<string, any> = {};
    const after: Record<string, any> = {};
    const trackedKeys = ['question', 'status', 'priority', 'aiInitialAnswer', 'details'] as const;
    for (const key of trackedKeys) {
      const next = (updates as any)[key];
      const prev = (questionDetails as any)?.[key];
      if (next !== undefined && JSON.stringify(next) !== JSON.stringify(prev)) {
        before[key] = prev;
        after[key] = next;
      }
    }

    auditPayload = {
      ...auditPayload,
      context: { ...auditPayload.context, question: questionDetails?.text },
      changes: { before, after },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return response;
  }

  @Patch('/:questionId')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({ summary: 'Update question fields by ID using internal API key' })
  async UpdateThreadId(
    @Params() params: QuestionIdParam,
    @Body() updates: Partial<IQuestion>,
  ): Promise<{ modifiedCount: number }> {
    const { questionId } = params;
    try {
      return await this.questionService.updateQuestion(questionId, updates, true);
    } catch (err: any) {
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to update question');
    }
  }

  @Delete('/:questionId/allocation')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Remove an allocation from a question by ID' })
  async removeAllocation(
    @Params() params: QuestionIdParam,
    @Body() body: RemoveAllocateBody,
    @CurrentUser() user: IUser,
  ): Promise<IQuestionSubmission> {
    verifyNotTester(user);
    const { _id: userId } = user;
    const { questionId } = params;
    const { index } = body;
    let expertId;
    let expertDeatils;
    let questionDetails;
    let result;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.DELETE_EXPERT,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        questionId: questionId,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      }
    };
    try {
      expertId = await this.questionService.getExprtIdByIndex(questionId, index);
      expertDeatils = await this.userService.getUserById(expertId);
      questionDetails = await this.questionService.getQuestionById(questionId);
      result = await this.questionService.removeExpertFromQueue(
        userId.toString(),
        questionId,
        index,
      );

      // When no history remains after removal, the question is effectively
      // un-allocated again → clear firstAllocationAt so the allocation crons treat it
      // as never-allocated.
      if ((result?.history?.length ?? 0) === 0) {
        await this.questionService.updateQuestion(questionId, {
          firstAllocationAt: null as any,
        });
      }
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        changes: {
          before: {
            experts: expertId,
            expertName: expertDeatils ? `${expertDeatils.firstName} ${expertDeatils.lastName}` : 'Unknown',
            email: expertDeatils ? expertDeatils.email : 'Unknown',
            role: expertDeatils ? expertDeatils.role : 'Unknown',
          },
        },
        context: {
          ...auditPayload.context,
          question: questionDetails.text,
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to remove expert allocation',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to remove expert allocation',
      );
    }
    auditPayload = {
      ...auditPayload,
      changes: {
        before: {
          experts: expertId,
          expertName: expertDeatils ? `${expertDeatils.firstName} ${expertDeatils.lastName}` : 'Unknown',
          email: expertDeatils ? expertDeatils.email : 'Unknown',
          role: expertDeatils ? expertDeatils.role : 'Unknown',
        },
      },
      context: {
        ...auditPayload.context,
        question: questionDetails.text,
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return result;
  }

  @Delete('/bulk')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Bulk delete questions' })
  async bulkDeleteQuestions(
    @Body() body: BulkDeleteQuestionDto,
    @CurrentUser() user: IUser,
  ): Promise<{ message: string; jobId: string }> {
    verifyNotTester(user);
    const { questionIds } = body;
    let prevQuestions;
    let response;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.QUESTION_BULK_DELETE,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        questionIds: questionIds,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      prevQuestions = await Promise.all(questionIds.map(id => this.questionService.getQuestionById(id)));
      response = await this.questionService.bulkDeleteQuestions(user._id.toString(), questionIds);
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        changes: {
          before: {
            questions: prevQuestions,
          }
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to bulk delete questions',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to bulk delete questions',
      );
    }

    auditPayload = {
      ...auditPayload,
      changes: {
        before: {
          questions: prevQuestions,
        },
        after: {
          questions: response,
        },
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return response;
  }

  @Delete('/:questionId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Delete a question by ID' })
  async deleteQuestion(
    @Params() params: QuestionIdParam,
    @CurrentUser() user: IUser,
  ): Promise<{ deletedCount: number }> {
    verifyNotTester(user);
    const { questionId } = params;
    let prevQuestion;
    let response;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.QUESTION_DELETE,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',

      },
      context: {
        questionId: questionId,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      prevQuestion = await this.questionService.getQuestionById(questionId);
      response = await this.questionService.deleteQuestion(questionId);
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        changes: {
          before: {
            question: prevQuestion,
          }
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to delete question',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to delete question',
      );
    }

    auditPayload = {
      ...auditPayload,
      changes: {
        before: {
          question: prevQuestion,
        },
        after: {
          question: response,
        },
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return response;
  }

  @Get('/')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(QuestionResponse)
  @OpenAPI({ summary: 'Get all questions and review levels' })
  async getQuestionsAndReviewlevel(
    @QueryParams() query: GetDetailedQuestionsQuery
  ): Promise<QuestionLevelResponse> {
    return this.questionService.getQuestionAndReviewLevel(query);
  }

  @Get('/background-status')
  getAllJobs() {
    return getBackgroundJobs();
  }

  @Get('/:id')
  getJob(@Param('id') id: string) {
    const job = getJobById(id);
    if (!job) return { message: 'Job not found' };
    return job;
  }

  // @Post('/data/out-reach/date')
  // @HttpCode(200)
  // // @Authorized()
  // @OpenAPI({summary: 'Get Ajrasakha Questions '})
  // @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  // async outreachQuestions(
  //   @Body() body: DateRangeRequest,
  //   @CurrentUser() user: IUser,
  // ) {
  //   const { startDate, endDate } = body;

  //   return await this.questionService.getQuestionsByDateRange(
  //     startDate,
  //     endDate,
  //   );
  // }


  @Post('/data/out-reach/date')
  @HttpCode(200)
  // @Authorized()
  @OpenAPI({ summary: 'Send Ajrasakha Questions via Email' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async outreachQuestions(
    @Body() body: DateRangeRequest,
    @CurrentUser() user: IUser,
  ) {
    const { startDate, endDate, emails } = body;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.OUTREACH_REPORT,
      action: AuditAction.SEND_OUTREACH_REPORT,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        startDate: startDate,
        endDate: endDate,
        endPoint: "outreachQuestions",
        recepients: emails,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      }
    };
    try {
      const result = await this.questionService.sendOutReachQuestionsMail(
        startDate,
        endDate,
        emails,
      );
      this.auditTrailsService.createAuditTrail(auditPayload);
      return result;
    } catch (error) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage: error?.message || 'Failed to send outreach questions email',
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorName: error?.name || 'Error',
          errorStack: error?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      console.error('Error in outreachQuestions controller:', error);
      throw error;
    }
  }
  @Get('/:questionId/feedback')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get user feedback for a selected question by ID' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async getQuestionFeedback(
    @Params() params: QuestionIdParam,
  ) {
    const { questionId } = params;
    const data = await this.questionService.getQuestionFeedback(questionId);

    return {
      success: true,
      data,
    };
  }

  @Get('/:questionId/chatbot')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get full chatbot details of selected question by ID' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async getChatbotDetails(
    @Params() params: QuestionIdParam,
    @CurrentUser() user: IUser,
  ) {
    const { questionId } = params;
    const userId = user._id.toString();
    const data = await this.questionService.getMatchedQuestion(
      questionId,
      userId,
    );

    if (!data) {
      throw new NotFoundError(`Question with id ${questionId} not found`);
    }

    return {
      success: true, data: {
        messageId: data.messageId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        user: data.user,
        content: data.content,
      }
    };
  }

  @Post('/check-status')
  @HttpCode(200)
  @UseBefore(FlexibleAuth)
  @OpenAPI({ summary: 'Check status of multiple questions' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async checkStatus(
    @Body() body: { question_ids: string[] },
  ): Promise<IcheckStatusResponseDto> {
    const { question_ids } = body;

    if (!question_ids || !Array.isArray(question_ids)) {
      throw new BadRequestError('question_ids must be an array');
    }
    const results = await this.questionService.checkStatus(
      question_ids
    );
    return {
      success: true,
      data: results,
    };
  }

  @Post('/:questionId/check-duplicate')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Manually trigger duplicate check for a question without a reference question' })
  async manualCheckDuplicate(@Params() params: QuestionIdParam, @CurrentUser() user: IUser) {
    verifyNotTester(user);
    const { questionId } = params;
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.CHECK_DUPLICATE,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: { questionId },
      createdAt: new Date(),
    };
    try {
      const result = await this.questionService.manualCheckDuplicate(questionId);
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return result;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to check duplicate',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      throw err;
    }
  }

  @Patch('/:questionId/hold')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'To hold the question for some time' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async holdQuestion(@Params() params: QuestionIdParam, @CurrentUser() user: IUser, @Body() body: { action: "hold" | "unhold" }) {
    verifyNotTester(user);
    const { questionId } = params;
    const { action } = body;

    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: action === 'hold' ? AuditAction.QUESTION_HOLD : AuditAction.QUESTION_UNHOLD,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: { questionId },
      createdAt: new Date(),
    };

    try {
      const result = await this.questionService.holdQuestion(questionId, user._id.toString(), action);
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        changes: { after: { action, questionId } },
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return result;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage: err?.message,
        },
      });
      throw err;
    }
  }

  @Get('/:questionId/generate-answer')
  @HttpCode(200)
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  @OpenAPI({ summary: 'Generate ai-initial answer' })
  async generateAiInitialAnswer(@Params() params: QuestionIdParam, @QueryParams() query: { userId: string }) {
    const { questionId } = params;
    const { userId } = query;
    let response;
    let auditPayload: ModeratorAuditTrail;
    if (userId) {
      const user = await this.userService.getUserById(userId);
      const prevQuestion = await this.questionService.getQuestionById(questionId);
      auditPayload = {
        category: AuditCategory.AI_GENERATED,
        action: AuditAction.GENERATE_ANSWER,
        actor: {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user?.avatar || '',
        },
        context: {
          questionId: questionId,
          question: prevQuestion.text,
        },
        changes: {
          before: {
            aiInitialAnswer: prevQuestion.aiInitialAnswer || null,
          },
        },
        outcome: {
          status: OutComeStatus.SUCCESS,
        },
      };
    }
    try {
      response = await this.questionService.generateAiInitialAnswer(questionId);
    } catch (err: any) {
      if (userId) {
        auditPayload = {
          ...auditPayload,
          outcome: {
            status: OutComeStatus.FAILED,
            errorCode: err?.errorCode || 'INTERNAL_ERROR',
            errorMessage: err?.message || 'Failed to generate AI initial answer',
            errorName: err?.name || 'Error',
            errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
          },
        };
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to generate AI initial answer',
      );
    }
    if (userId) {
      auditPayload = {
        ...auditPayload,
        changes: {
          ...auditPayload.changes,
          after: {
            aiInitialAnswer: response || null,
          },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
    }
    return response;
  }

  @Post('/:questionId/approve-initial-answer')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  @OpenAPI({ summary: 'Generate ai-initial answer' })
  async approveInitialAnswer(@Params() params: QuestionIdParam, @Body() body: ApproveInitialAnswerBody, @CurrentUser() user: IUser) {
    verifyNotTester(user);
    const { questionId } = params;
    const { answer } = body;
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.APPROVE_AI_INITIAL_ANSWER,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: { questionId },
      createdAt: new Date(),
    };
    try {
      const result = await this.questionService.approveAiInitialAnswer(questionId, answer);
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        changes: { after: { answer: answer?.substring(0, 200) } },
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return result;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to approve initial answer',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to approve initial answer');
    }
  }

  @Post('/:questionId/replace-queue-expert')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Replace an expert at a specific level in the queue or the author' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async replaceQueueExpert(
    @Params() params: QuestionIdParam,
    @Body() body: ReplaceQueueExpertRequest,
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { _id: userId } = user;
    const { questionId } = params;
    const { levelIndex, newExpertId, isAuthor, reasonForChange } = body;
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.REPLACE_QUEUE_EXPERT,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: { questionId, levelIndex, isAuthor, reasonForChange },
      createdAt: new Date(),
    };
    try {
      const result = await this.questionService.replaceQueueExpert(
        userId.toString(),
        questionId,
        levelIndex + 1,
        newExpertId,
        isAuthor,
        reasonForChange,
      );
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        changes: { after: { newExpertId, levelIndex } },
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return result;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to replace queue expert',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to replace queue expert');
    }
  }

  private flattenPayload(payload: any[]) {
    const result: Record<string, any> = {};

    payload.forEach((item, index) => {
      Object.entries(item).forEach(([key, value]) => {
        result[`crop ${index + 1} (${key})`] = value;
      });
    });

    return result;
  }

  //reallocate selected question to lessworkloads expert
  @Post('/reAllocateSelectedQuestions')
  @HttpCode(200)
  @OpenAPI({ summary: 'ReAllocating selectedquestions to those who has less workload' })
  async reAllocateSelectedQuestions(
    @CurrentUser() user: IUser,
    @Body() body: ReallocateExpertsSelectedQuestionsRequest,
  ) {
    verifyNotTester(user);
    const { questionIds } = body;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.REALLOCATE_QUESTIONS,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      createdAt: new Date(),
    };
    try {
      const result = await this.questionService.balanceWorkloadSelectedQuestions(questionIds ?? []);
      auditPayload = {
        ...auditPayload,
        changes: {
          after: {
            expertsInvolved: result.expertsInvolved,
            submissionsProcessed: result.submissionsProcessed,
          },
        },
        outcome: {
          status: OutComeStatus.SUCCESS,
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return result;
    }
    catch (err: any) {
      console.log("Error in reAllocateSelectedQuestions:", err);
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage: err?.message || 'Failed to process uploaded file',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      throw new BadRequestError(
        err?.message || 'Failed to process uploaded file',
      );

    }
  }

  // ─── Time-bound question endpoints ──────────────────────────────────────────

  @Post('/reallocate-timebound')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Reallocate time-bound questions pending > 45 min to experts with < 3 active time-bound questions' })
  async reallocateTimeBound(@CurrentUser() user: IUser) {
    const result = await this.questionService.reallocateTimeBoundQuestions();
    this.auditTrailsService.createAuditTrail({
      category: AuditCategory.QUESTION,
      action: AuditAction.REALLOCATE_QUESTIONS,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      changes: { after: { type: 'timeBound', ...result } },
      outcome: { status: OutComeStatus.SUCCESS },
      createdAt: new Date(),
    });
    return result;
  }

  @Post('/:questionId/mark-opened')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Mark that the current expert has opened a time-bound question (blocks 45-min auto-reallocation)' })
  async markQuestionOpened(
    @Param('questionId') questionId: string,
    @CurrentUser() user: IUser,
  ) {
    await this.questionService.markQuestionOpened(questionId, user._id.toString());
    return { success: true };
  }

  // ─── Migration endpoints (internal API key auth) ──────────────────────────

  @Post('/background/process')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({ summary: 'Background process for repo actions' })
  async backgroundProcessAction(
    @Body() body: { submissionId: string },
  ) {
    const { submissionId } = body;
    if (!submissionId) {
      throw new BadRequestError('submissionId is required');
    }
    const result = await this.questionService.backgroundProcessAction(submissionId);
    return result;
  }
}
