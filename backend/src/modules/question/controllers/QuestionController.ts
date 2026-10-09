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
  NotFoundError,
  Patch,
  BadRequestError,
  UseBefore,
  InternalServerError,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { ObjectId } from 'mongodb';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import {
  IQuestion,
  IUser,
  IcheckStatusResponseDto,
} from '#root/shared/interfaces/models.js';
import { BadRequestErrorResponse } from '#shared/middleware/errorHandler.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import {
  AllocatedQuestionsBodyDto,
  DetailedQuestionsBodyDto,
  BulkDeleteQuestionDto,
  DateRangeRequest,
  GetDetailedQuestionsQuery,
  QuestionIdParam,
  QuestionResponse,
} from '../classes/validators/QuestionVaidators.js';
import { ContextIdParam } from '#root/modules/context/classes/validators/ContextValidator.js';
import { QuestionLevelResponse } from '#root/modules/question/classes/transformers/QuestionLevel.js';
import { IQuestionService } from '../interfaces/IQuestionService.js';
import { FlexibleAuth } from '#root/shared/functions/flexibleAuth.js';
import { InternalApiAuth } from '#root/shared/index.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { roleAuditActor } from './helpers/questionAuditHelper.js';

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

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  @Post('/status-summary')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get total questions count and breakdown by status' })
  async getQuestionStatusSummary(
    @QueryParams() query: GetDetailedQuestionsQuery,
    @Body() body: DetailedQuestionsBodyDto,
  ) {
    const data = await this.questionService.getQuestionStatusSummary(
      query,
      body,
    );
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
      user.role === 'admin' ||
      user.role === 'moderator' ||
      user.role === 'gate_keeper' ||
      user.role === 'auditor';
    const targetUserId =
      canViewQueue && query.user && query.user !== 'all'
        ? query.user
        : userId;

    return this.questionService.getAllocatedQuestions(
      targetUserId,
      query,
      body,
    );
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

  @Get('/')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(QuestionResponse)
  @OpenAPI({ summary: 'Get all questions and review levels' })
  async getQuestionsAndReviewlevel(
    @QueryParams() query: GetDetailedQuestionsQuery,
  ): Promise<QuestionLevelResponse> {
    return this.questionService.getQuestionAndReviewLevel(query);
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
    const results = await this.questionService.checkStatus(question_ids);
    return {
      success: true,
      data: results,
    };
  }

  @Post('/data/out-reach/date')
  @HttpCode(200)
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
      actor: roleAuditActor(user),
      context: {
        startDate: startDate,
        endDate: endDate,
        endPoint: 'outreachQuestions',
        recepients: emails,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      const result = await this.questionService.sendOutReachQuestionsMail(
        startDate,
        endDate,
        emails,
      );
      this.auditTrailsService.createAuditTrail(auditPayload);
      return result;
    } catch (error: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage:
            error?.message || 'Failed to send outreach questions email',
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      console.error('Error in outreachQuestions controller:', error);
      throw error;
    }
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
      actor: roleAuditActor(user),
      context: {
        questionIds: questionIds,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      prevQuestions = await Promise.all(
        questionIds.map(id => this.questionService.getQuestionById(id)),
      );
      response = await this.questionService.bulkDeleteQuestions(
        user._id.toString(),
        questionIds,
      );
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        changes: {
          before: {
            questions: prevQuestions,
          },
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to bulk delete questions',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
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

  @Get('/:questionId/submission-exists')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Check if a submission exists for this question' })
  async checkSubmissionExists(
    @Params() params: QuestionIdParam,
  ): Promise<{ exists: boolean }> {
    const exists = await this.questionService.checkSubmissionExists(
      params.questionId,
    );
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
    const {
      question,
      approved_moderator,
      assigned_moderator,
      assigned_gate_keeper,
      assigned_auditor,
      isAssignedModerator,
      isAssignedGateKeeper,
      isAssignedAuditor,
    } = await this.questionService.getQuestionFullData(questionId, userId);

    if (!question) {
      throw new NotFoundError(`Question with id ${questionId} not found`);
    }

    return {
      success: true,
      data: {
        ...question,
        approved_moderator,
        assigned_moderator,
        assigned_gate_keeper,
        assigned_auditor,
        isAssignedModerator,
        isAssignedGateKeeper,
        isAssignedAuditor,
      },
    };
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
    let prevQuestion: any;
    let response: any;
    let questionDetails: any;

    const isPassAction = updates.status === 'pass';

    // ─── Pass Question Audit Trail ───────────────────────────────────────────
    if (isPassAction) {
      const auditPayload: ModeratorAuditTrail = {
        category: AuditCategory.QUESTION,
        action: AuditAction.QUESTION_PASS,
        actor: roleAuditActor(user),
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
            before: {
              status: prevQuestion.status,
              question: prevQuestion.text,
            },
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
            errorStack:
              err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
              'No stack trace available',
          },
        });
        if (err instanceof InternalServerError) {
          throw new InternalServerError(err.message);
        }
        throw new BadRequestError(err?.message || 'Failed to pass question');
      }
    }

    // ─── Push to Auditor — Gate Keeper hand-off → status 'auditor_review' ─────
    if (updates.status === 'auditor_review') {
      const gateKeeperComment = (
        (updates as any).gateKeeperComment ?? ''
      ).trim();
      const auditPayload: ModeratorAuditTrail = {
        category: AuditCategory.QUESTION,
        action: AuditAction.PUSH_TO_AUDITOR,
        actor: roleAuditActor(user),
        context: { questionId, reason: gateKeeperComment },
        createdAt: new Date(),
      };

      try {
        prevQuestion = await this.questionService.getQuestionById(questionId);
        const auditorReviewType: 'dynamic' | 'duplicate' =
          prevQuestion?.status === 'dynamic' ? 'dynamic' : 'duplicate';
        const pushUpdates: Partial<IQuestion> = {
          status: 'auditor_review',
          auditorReviewType,
        };
        response = await this.questionService.updateQuestion(
          questionId,
          pushUpdates,
        );
        this.auditTrailsService.createAuditTrail({
          ...auditPayload,
          changes: {
            before: { status: prevQuestion?.status },
            after: {
              status: 'auditor_review',
              auditorReviewType,
              gateKeeperComment,
            },
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
            errorStack:
              err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
              'No stack trace available',
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
      const cancelReason = (
        (updates as any).duplicateCancelReason ?? ''
      ).trim();
      const cancelUpdates: Partial<IQuestion> = {
        status: 'open',
        isDuplicateCancelled: true,
        isAutoAllocate: updates.isAutoAllocate === true,
      };

      const auditPayload: ModeratorAuditTrail = {
        category: AuditCategory.QUESTION,
        action: AuditAction.CANCEL_DUPLICATE,
        actor: roleAuditActor(user),
        context: { questionId, reason: cancelReason },
        createdAt: new Date(),
      };

      try {
        prevQuestion = await this.questionService.getQuestionById(questionId);
        response = await this.questionService.updateQuestion(
          questionId,
          cancelUpdates,
        );
        this.auditTrailsService.createAuditTrail({
          ...auditPayload,
          changes: {
            before: {
              status: prevQuestion?.status,
              isAutoAllocate: prevQuestion?.isAutoAllocate,
            },
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
            ? {
                before: {
                  status: prevQuestion.status,
                  question: prevQuestion.text,
                },
              }
            : {},
          outcome: {
            status: OutComeStatus.FAILED,
            errorCode: err?.errorCode || 'INTERNAL_ERROR',
            errorMessage: err?.message || 'Failed to cancel duplicate',
            errorName: err?.name || 'Error',
            errorStack:
              err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
              'No stack trace available',
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
      actor: roleAuditActor(user),
      context: { questionId },
      outcome: { status: OutComeStatus.SUCCESS },
      createdAt: new Date(),
    };
    try {
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
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to update question');
    }

    const before: Record<string, any> = {};
    const after: Record<string, any> = {};
    const trackedKeys = [
      'question',
      'status',
      'priority',
      'aiInitialAnswer',
      'details',
    ] as const;
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
      return await this.questionService.updateQuestion(
        questionId,
        updates,
        true,
      );
    } catch (err: any) {
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to update question');
    }
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
    let prevQuestion: any;
    let response: any;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.QUESTION_DELETE,
      actor: roleAuditActor(user),
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
          },
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to delete question',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to delete question');
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
}
