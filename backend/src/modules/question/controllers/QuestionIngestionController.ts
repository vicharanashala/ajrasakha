import 'reflect-metadata';
import {
  JsonController,
  Post,
  Body,
  HttpCode,
  Authorized,
  CurrentUser,
  UploadedFile,
  BadRequestError,
  UseBefore,
  InternalServerError,
  Req,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IUser } from '#root/shared/interfaces/models.js';
import type { QAMetadata } from '#root/shared/database/interfaces/ICallDetailsRepository.js';
import { BadRequestErrorResponse } from '#shared/middleware/errorHandler.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import {
  AddQuestionBodyDto,
  GeneratedQuestionResponse,
  GenerateQuestionsBody,
} from '../classes/validators/QuestionVaidators.js';
import { startBackgroundProcessing } from '#root/workers/workerManager.js';
import { UploadFileOptions } from '#root/modules/question/classes/validators/fileUploadOptions.js';
import { IQuestionService } from '../interfaces/IQuestionService.js';
import { FlexibleAuth } from '#root/shared/functions/flexibleAuth.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { parseQuestionUploadFile } from './helpers/fileUploadParser.js';
import { flattenPayload } from './helpers/questionAuditHelper.js';

@OpenAPI({
  tags: ['questions'],
  description: 'Operations for question creation, ingestion, and ACC agent HITL flow',
})
@injectable()
@JsonController('/questions')
export class QuestionIngestionController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  // ─── HITL Flow Endpoints ───────────────────────────────────────────────────

  @Post('/acc-agent/thread')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Create ACC Agent thread for HITL flow' })
  async createAccAgentThread(): Promise<{ thread_id: string }> {
    try {
      const result = await this.questionService.createAccAgentThread();
      return result;
    } catch (error) {
      console.error('[QuestionIngestionController] createAccAgentThread: Error', error);
      throw error;
    }
  }

  @Post('/acc-agent/extract')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Extract data from transcript using ACC Agent' })
  async extractAccAgentData(
    @Body() body: { threadId: string; transcript: string },
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
      const result = await this.questionService.extractAccAgentData(
        body.threadId,
        body.transcript,
      );
      return result;
    } catch (error) {
      console.error('[QuestionIngestionController] extractAccAgentData: Error', error);
      throw error;
    }
  }

  @Post('/acc-agent/update-state')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Update ACC Agent state with human corrections' })
  async updateAccAgentState(
    @Body()
    body: {
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
    },
  ): Promise<{ success: boolean }> {
    try {
      await this.questionService.updateAccAgentState(
        body.threadId,
        body.correctedData,
      );
      return { success: true };
    } catch (error) {
      console.error('[QuestionIngestionController] updateAccAgentState: Error', error);
      throw error;
    }
  }

  @Post('/acc-agent/resume')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Resume ACC Agent and get final answer' })
  async resumeAccAgentAndGetAnswer(
    @Body()
    body: {
      threadId: string;
      callUuid?: string;
      metadata?: QAMetadata;
    },
  ): Promise<any> {
    try {
      const result = await this.questionService.getAccAgentState(
        body.threadId,
        body.callUuid,
        body.metadata,
      );
      return result;
    } catch (error) {
      console.error('[QuestionIngestionController] resumeAccAgentAndGetAnswer: Error', error);
      throw error;
    }
  }

  // ─── Question Ingestion (Single / Bulk) ────────────────────────────────────

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

    const name = `${user?.firstName} ${user?.lastName}`;
    const actorPayload = userId
      ? {
          id: userId,
          name: name,
          email: user?.email,
          role: user?.role,
          avatar: user?.avatar || '',
          source: body.source,
        }
      : null;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.QUESTION_ADD,
      actor: actorPayload,
    };

    if (file) {
      let payload: any[] = [];
      const isRequiredAiInitialAnswer =
        body.isRequiredAiInitialAnswer === 'true';

      const isOutreachQuestion = body.isOutreachQuestion === 'true';

      // Read directly from req.body (multer-parsed) to avoid class-transformer dropping fields
      const rawBody = req.body || {};
      const isTrainingQuestion =
        rawBody.isTrainingQuestion === 'true' || body.isTrainingQuestion === true;
      const allocationMode =
        rawBody.allocationMode || body.allocationMode || 'expert';
      const paeExpertId: string | undefined =
        rawBody.paeExpertId || body.paeExpertId;
      console.log('[BulkUpload] rawBody:', rawBody);
      console.log(
        '[BulkUpload] allocationMode:',
        allocationMode,
        '| paeExpertId:',
        paeExpertId,
      );

      try {
        payload = parseQuestionUploadFile(file);

        console.log('Paylod: ', payload);
        const actor = {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user?.avatar || '',
        };
        setImmediate(() =>
          startBackgroundProcessing(
            actor,
            this.auditTrailsService,
            isRequiredAiInitialAnswer,
            isOutreachQuestion,
            isTrainingQuestion,
            payload,
            allocationMode,
            paeExpertId,
          ),
        );

        return {
          message: `Processing ${payload.length} question(s). Non-duplicate entries are being assigned to experts${
            isRequiredAiInitialAnswer
              ? ' with AI-generated initial answers'
              : ''
          }.`,
          count: payload.length,
          isBulkUpload: !!file,
        };
      } catch (err: any) {
        auditPayload = {
          ...auditPayload,
          action: AuditAction.QUESTION_BULK_CREATE,
          context: {
            ...flattenPayload(payload),
          },
          outcome: {
            status: OutComeStatus.FAILED,
            errorCode: err?.errorCode || 'INTERNAL_ERROR',
            errorMessage: err?.message || 'Failed to process uploaded file',
            errorName: err?.name || 'Error',
            errorStack:
              err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
              'No stack trace available',
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
        console.log('the controller body coming===', body);
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
            errorStack:
              err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
              'No stack trace available',
          },
        };
        if (actorPayload !== null) {
          this.auditTrailsService.createAuditTrail(auditPayload);
        }
        if (err instanceof InternalServerError) {
          throw new InternalServerError(err.message);
        }
        throw new BadRequestError(err?.message || 'Failed to add question');
      }

      auditPayload = {
        ...auditPayload,
        context: {
          questionId: Array(data._id.toString()),
        },
        changes: {
          after: {
            question: data.question,
            details: data.details,
          },
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
        question_id: data._id,
      };
    }
  }

  // ─── Question Generation ──────────────────────────────────────────────────

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
    return this.questionService.getQuestionFromCallContext(
      body.query,
      body.state,
      body.crop,
    );
  }

  @Post('/call-summary')
  @HttpCode(200)
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  @OpenAPI({ summary: 'Generate call summary from raw transcript' })
  async getCallSummary(@Body() body: GenerateQuestionsBody): Promise<any> {
    return this.questionService.getCallSummary(body.query);
  }
}
