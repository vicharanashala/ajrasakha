import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  HttpCode,
  Params,
  Authorized,
  CurrentUser,
  Param,
  QueryParam,
  BadRequestError,
  InternalServerError,
  ForbiddenError,
  UseBefore,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IUser } from '#root/shared/interfaces/models.js';
import { BadRequestErrorResponse } from '#shared/middleware/errorHandler.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import { QuestionIdParam } from '../classes/validators/QuestionVaidators.js';
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
import { InternalApiAuth } from '#root/shared/index.js';
import { roleAuditActor, userLabel } from './helpers/questionAuditHelper.js';

@OpenAPI({
  tags: ['questions'],
  description: 'Operations for question feedbacks, reviewer management, and feedback actions',
})
@injectable()
@JsonController('/questions')
export class QuestionFeedbackController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,

    @inject(GLOBAL_TYPES.UserService)
    private readonly userService: UserService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  @Get('/feedbacks')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get feedbacks for a question' })
  async getFeedbacks(
    @QueryParam('questionId') questionId: string,
    @QueryParam('page') page: number = 1,
    @QueryParam('pageSize') pageSize: number = 5,
  ) {
    return this.questionService.getFeedbacks(questionId, page, pageSize);
  }

  @Get('/:questionId/feedback')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get user feedback for a selected question by ID' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async getQuestionFeedback(@Params() params: QuestionIdParam) {
    const { questionId } = params;
    const data = await this.questionService.getQuestionFeedback(questionId);

    return {
      success: true,
      data,
    };
  }

  @Get('/feedback/queue-details')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Feedback tab data — waiting/assigned questions + available reviewers' })
  async getFeedbackQueueDetails(@CurrentUser() user: IUser) {
    if (user.role === 'expert') {
      throw new ForbiddenError('Experts cannot view the feedback queue');
    }
    const data = await this.questionService.getFeedbackQueueDetails();
    return { success: true, data };
  }

  @Get('/:questionId/feedback-timeline')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Feedback-review timeline (rounds + reviewers) for a question' })
  async getFeedbackTimeline(@Params() params: QuestionIdParam) {
    const data = await this.questionService.getFeedbackTimeline(params.questionId);
    return { success: true, data };
  }

  @Get('/feedback/reviewers')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'List moderators/auditors assignable as a feedback reviewer' })
  async getAssignableFeedbackReviewers(@CurrentUser() user: IUser) {
    if (user.role === 'expert') {
      throw new ForbiddenError('Experts cannot manage feedback reviewers');
    }
    const data = await this.questionService.getAssignableFeedbackReviewers();
    return { success: true, data };
  }

  @Post('/:questionId/feedback-reviewer')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Manually assign a feedback reviewer to a question' })
  async assignFeedbackReviewerManually(
    @Params() params: QuestionIdParam,
    @Body() body: { userId: string; index?: number },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    if (user.role === 'expert') {
      throw new ForbiddenError('Experts cannot assign feedback reviewers');
    }
    if (!body?.userId) {
      throw new BadRequestError('userId is required');
    }
    const { questionId } = params;
    const { userId, index } = body;
    const isReassign = typeof index === 'number' && index >= 0;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.SELECT_FEEDBACK_REVIEWER,
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

      await this.questionService.assignFeedbackReviewerManually(
        questionId,
        userId,
        index,
      );

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { 'feedback reviewer': prevLabel },
          after: { 'feedback reviewer': userLabel(newUser) ?? userId },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return {
        success: true,
        message: `Feedback reviewer ${isReassign ? 'reassigned' : 'assigned'} successfully`,
      };
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: { before: { 'feedback reviewer': prevLabel } },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to assign feedback reviewer',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) throw new InternalServerError(err.message);
      throw new BadRequestError(err?.message || 'Failed to assign feedback reviewer');
    }
  }

  @Delete('/:questionId/feedback-reviewer')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Remove an open feedback-review round (by index) from a question' })
  async removeFeedbackReviewer(
    @Params() params: QuestionIdParam,
    @Body() body: { index: number },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    if (user.role === 'expert') {
      throw new ForbiddenError('Experts cannot remove feedback reviewers');
    }
    if (typeof body?.index !== 'number') {
      throw new BadRequestError('index is required');
    }
    const { questionId } = params;
    const { index } = body;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.DELETE_FEEDBACK_REVIEWER,
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
        this.questionService.getFeedbackTimeline(questionId),
      ]);
      questionDetails = qd;
      const prevRound = timeline?.reviews?.find((r: any) => r.index === index);
      if (prevRound?.reviewerName) prevLabel = prevRound.reviewerName;

      await this.questionService.removeFeedbackReviewer(questionId, index);

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { 'feedback reviewer': prevLabel },
          after: { 'feedback reviewer': 'Removed' },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return { success: true, message: 'Feedback reviewer removed successfully' };
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: { before: { 'feedback reviewer': prevLabel } },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to remove feedback reviewer',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) throw new InternalServerError(err.message);
      throw new BadRequestError(err?.message || 'Failed to remove feedback reviewer');
    }
  }

  @Post('/:questionId/:feedbackId/feedback-action')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Accept or reject an open feedback' })
  async handleFeedbackAction(
    @Param('questionId') questionId: string,
    @Param('feedbackId') feedbackId: string,
    @Body()
    body: {
      action: 'accept' | 'reject';
      reason: string;
      source: 'DATASET' | 'WEB_APPLICATION' | 'PAE_Validation';
    },
    @CurrentUser({ required: true }) user: IUser,
  ) {
    console.log('[QuestionFeedbackController] handleFeedbackAction:', {
      questionId,
      feedbackId,
      action: body.action,
      reason: body.reason,
      userId: user._id,
      source: body.source,
    });

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.FEEDBACK_ACTION,
      actor: roleAuditActor(user),
      context: { questionId, feedbackId, action: body.action },
      changes: {
        after: {
          feedback: body.action === 'accept' ? 'Accepted' : 'Rejected',
          ...(body.reason ? { reason: body.reason } : {}),
        },
      },
      outcome: { status: OutComeStatus.SUCCESS },
    };
    try {
      const result = await this.questionService.handleFeedbackAction(
        questionId,
        feedbackId,
        body.action,
        body.reason,
        user._id.toString(),
        body.source,
      );
      this.auditTrailsService.createAuditTrail(auditPayload);
      return result;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to process feedback action',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      throw err;
    }
  }

  @Patch('/feedbacks/question/:questionId')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({ summary: 'Update the status of feedbacks of a question' })
  async handleUpdateFeedbackStatus(
    @Param('questionId') questionId: string,
    @Body() body: { source: 'DATASET' | 'WEB_APPLICATION' | 'PAE_Validation' },
  ) {
    const result = await this.questionService.handleFeedbackStatusUpdate(
      questionId,
      body.source,
    );
    return result;
  }
}
