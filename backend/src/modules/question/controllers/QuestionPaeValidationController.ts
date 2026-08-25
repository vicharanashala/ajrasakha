import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  Params,
  QueryParams,
  Authorized,
  CurrentUser,
  Param,
  BadRequestError,
  InternalServerError,
  ForbiddenError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IUser } from '#root/shared/interfaces/models.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import {
  ProcessPaeValidationRequest,
  QuestionIdParam,
} from '../classes/validators/QuestionVaidators.js';
import { IQuestionService } from '../interfaces/IQuestionService.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { UserService } from '#root/modules/user/index.js';
import { roleAuditActor, userLabel } from './helpers/questionAuditHelper.js';

@OpenAPI({
  tags: ['questions'],
  description: 'Operations for PAE validation queue, assignments, timeline, and reviews',
})
@injectable()
@JsonController('/questions')
export class QuestionPaeValidationController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,

    @inject(GLOBAL_TYPES.UserService)
    private readonly userService: UserService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  @Get('/pae/validations/assigned')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary: 'Get all questions assigned to the current PAE expert for validation',
    description:
      'Returns paginated questions assigned to the authenticated PAE expert, including their final answers and sources.',
  })
  async getPaeValidationAssignedQuestions(
    @QueryParams() query: { page?: number; limit?: number },
    @CurrentUser() user: IUser,
  ) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 10, 100);
    const userId = user._id.toString();
    return await this.questionService.getPaeValidationAssignedQuestions(
      userId,
      page,
      limit,
    );
  }

  @Post('/pae/validations/process')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary: 'Process PAE validation decision (approve/feedback)',
    description:
      'Process a PAE validation decision for an assigned question. When approved, the question is marked as completed and removed from the assignment. When feedback is provided, the question remains assigned for further work.',
  })
  async processPaeValidation(
    @Body() body: ProcessPaeValidationRequest,
    @CurrentUser() user: IUser,
  ) {
    const paeExpertId = user._id.toString();
    const {
      questionId,
      status,
      suggestionComment,
      suggestionLink,
      suggestionSourceName,
    } = body;

    return await this.questionService.processPaeValidation(
      paeExpertId,
      questionId,
      status,
      suggestionComment,
      suggestionLink,
      undefined,
      suggestionSourceName,
    );
  }

  @Get('/pae-val/queue-details')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary:
      'PAE Validation queue details — waiting/assigned questions + available reviewers',
  })
  async getPaeValidationQueueDetails(
    @CurrentUser() user: IUser,
    @QueryParams() query: { section?: string; page?: number; limit?: number },
  ) {
    console.log(
      '[QuestionPaeValidationController] getPaeValidationQueueDetails: user role:',
      user.role,
    );
    const startedAt = Date.now();
    try {
      console.log(
        `[PAE QUEUE API] Request started. user=${user._id}, role=${user.role}, query=${JSON.stringify(query)}`,
      );
      if (user.role === 'expert') {
        throw new ForbiddenError('Experts cannot view the PAE Validation queue');
      }

      const params: {
        section?: 'waitingAuto' | 'waitingManual' | 'assigned';
        page?: number;
        limit?: number;
      } = {};
      if (
        query.section &&
        ['waitingAuto', 'waitingManual', 'assigned'].includes(query.section)
      ) {
        params.section = query.section as
          | 'waitingAuto'
          | 'waitingManual'
          | 'assigned';
      }
      if (query.page) {
        params.page = Math.max(1, parseInt(String(query.page), 10) || 1);
      }
      if (query.limit) {
        params.limit = Math.min(
          100,
          Math.max(1, parseInt(String(query.limit), 10) || 50),
        );
      }

      const data =
        await this.questionService.getPaeValidationQueueDetails(params);
      console.log(
        `[PAE QUEUE API] Request completed in ${Date.now() - startedAt}ms`,
      );
      return { success: true, data };
    } catch (error) {
      console.error(
        `[PAE QUEUE API] Request FAILED after ${Date.now() - startedAt}ms`,
        {
          userId: user?._id,
          role: user?.role,
          error,
        },
      );
      throw error;
    }
  }

  @Get('/:questionId/pae-validation-timeline')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary:
      'Pae-validation-review timeline (rounds + reviewers) for a question',
  })
  async getPaeValidationTimeline(@Params() params: QuestionIdParam) {
    const data = await this.questionService.getPaeValidationTimeline(
      params.questionId,
    );
    return { success: true, data };
  }

  @Post('/:questionId/pae-val-reviewer')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Manually assign a pae validation reviewer to a question' })
  async assignPaeValidationReviewer(
    @Params() params: QuestionIdParam,
    @Body() body: { userId: string; index?: number },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    if (user.role === 'expert') {
      throw new ForbiddenError(
        'Experts cannot assign pae validation reviewers',
      );
    }
    if (!body?.userId) {
      throw new BadRequestError('userId is required');
    }
    const { questionId } = params;
    const { userId, index } = body;
    const isReassign = typeof index === 'number' && index >= 0;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.SELECT_PAE_VALIDATION_REVIEWER,
      actor: roleAuditActor(user),
      context: {
        questionId,
        operation: isReassign ? 'reassign' : 'assign',
        ...(isReassign ? { roundIndex: index } : {}),
      },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };
    let questionDetails: any;
    let prevLabel = 'Unassigned';
    let newUser: any;
    try {
      const [qd, timeline, nu] = await Promise.all([
        this.questionService.getQuestionDataById(questionId),
        this.questionService.getFeedbackTimeline(questionId),
        this.userService.getUserById(userId),
      ]);
      questionDetails = qd;
      newUser = nu;
      const prevRound = isReassign
        ? timeline?.reviews?.find((r: any) => r.index === index)
        : timeline?.reviews?.find((r: any) => !r.finishedAt && !r.closed);
      if (prevRound?.reviewerName) prevLabel = prevRound.reviewerName;

      await this.questionService.assignPaeValidationReviewerManually(
        questionId,
        userId,
        index,
      );

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { 'pae validation reviewer': prevLabel },
          after: { 'pae validation reviewer': userLabel(newUser) ?? userId },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return {
        success: true,
        message: `Pae validation reviewer ${isReassign ? 'reassigned' : 'assigned'} successfully`,
      };
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: { before: { 'pae validation reviewer': prevLabel } },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to assign pae validation reviewer',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) throw new InternalServerError(err.message);
      throw new BadRequestError(
        err?.message || 'Failed to assign pae validation reviewer',
      );
    }
  }

  @Delete('/:questionId/pae-val-reviewer')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary:
      'Remove an open pae-validation-review round (by index) from a question',
  })
  async removePaeValidationReviewer(
    @Params() params: QuestionIdParam,
    @Body() body: { index: number },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    if (user.role === 'expert') {
      throw new ForbiddenError(
        'Experts cannot remove pae validation reviewers',
      );
    }
    if (typeof body?.index !== 'number') {
      throw new BadRequestError('index is required');
    }
    const { questionId } = params;
    const { index } = body;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.DELETE_PAE_VALIDATION_REVIEWER,
      actor: roleAuditActor(user),
      context: { questionId, roundIndex: index },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };
    let questionDetails: any;
    let prevLabel = 'Unassigned';
    try {
      const [qd, timeline] = await Promise.all([
        this.questionService.getQuestionDataById(questionId),
        this.questionService.getPaeValidationTimeline(questionId),
      ]);
      questionDetails = qd;
      const prevRound = timeline?.reviews?.find((r: any) => r.index === index);
      if (prevRound?.paeName) prevLabel = prevRound.paeName;

      await this.questionService.removePaeValidationReviewer(questionId, index);

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { 'pae validation reviewer': prevLabel },
          after: { 'pae validation reviewer': 'Removed' },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return {
        success: true,
        message: 'Pae validation reviewer removed successfully',
      };
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: { before: { 'pae validation reviewer': prevLabel } },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to remove pae validation reviewer',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) throw new InternalServerError(err.message);
      throw new BadRequestError(
        err?.message || 'Failed to remove pae validation reviewer',
      );
    }
  }
}
