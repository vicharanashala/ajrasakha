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
  QueryParams,
  Authorized,
  CurrentUser,
  Param,
  QueryParam,
  BadRequestError,
  InternalServerError,
  ForbiddenError,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { ObjectId } from 'mongodb';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IUser, IQuestionSubmission } from '#root/shared/interfaces/models.js';
import { BadRequestErrorResponse } from '#shared/middleware/errorHandler.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import {
  AllocateExpertsRequest,
  BulkPaeAllocateRequest,
  QuestionIdParam,
  RemoveAllocateBody,
  ReplaceQueueExpertRequest,
  ReallocateExpertsSelectedQuestionsRequest,
} from '../classes/validators/QuestionVaidators.js';
import { IQuestionService, QueueSectionName } from '../interfaces/IQuestionService.js';
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
  description: 'Operations for question queues, dashboards, and expert/moderator allocations',
})
@injectable()
@JsonController('/questions')
export class QuestionAllocationController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,

    @inject(GLOBAL_TYPES.UserService)
    private readonly userService: UserService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  @Get('/queue-details')
  @HttpCode(200)
  @Authorized(['admin', 'moderator', 'gate_keeper', 'auditor'])
  @OpenAPI({
    summary:
      'Queue details for moderators/admins/gate keepers/auditors. No params → all sections (counts + page 1). With ?section=&page= → one paginated section (exact count + that page of items).',
  })
  async getQueueDetails(
    @CurrentUser() user: IUser,
    @QueryParams()
    query: {
      section?: QueueSectionName;
      page?: string;
      limit?: string;
      startTime?: string;
      endTime?: string;
    },
  ) {
    const isAdmin = user.role === 'admin';
    const isTrainingUser = user.isTrainingUser === true;
    const startTime = query.startTime ? new Date(query.startTime) : undefined;
    const endTime = query.endTime ? new Date(query.endTime) : undefined;

    if (query.section) {
      const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
      const limit = Math.max(1, parseInt(query.limit || '10', 10) || 10);
      const data = await this.questionService.getQueueSection(
        query.section,
        page,
        limit,
        startTime,
        endTime,
        isTrainingUser,
        isAdmin,
      );
      return { success: true, data };
    }

    // Full snapshot: all sections, page 1.
    const data = await this.questionService.getQueueDetails(
      startTime,
      endTime,
      isTrainingUser,
      isAdmin,
    );
    return { success: true, data };
  }

  // NOTE: must be declared BEFORE the '/:questionId' routes, otherwise
  // routing-controllers matches '/role-dashboard' against '/:questionId' first
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

  @Get('/reallocation-preview')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get preview of questions and experts for reallocation' })
  async getReallocationPreview(@QueryParam('type') type: string) {
    return this.questionService.getReallocationPreview(type);
  }

  @Post('/reAllocateLessWorkload')
  @HttpCode(200)
  @OpenAPI({ summary: 'ReAllocating questions which are delayed to those who has less workload' })
  async reAllocateLessWorkload(
    @CurrentUser() user: IUser,
    @QueryParam('type') type?: string,
  ) {
    verifyNotTester(user);
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.REALLOCATE_QUESTIONS,
      actor: roleAuditActor(user),
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
    } catch (err: any) {
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

  @Post('/reallocate-manual')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Manually reallocate questions to experts' })
  async reallocateManual(
    @Body()
    body: {
      assignments: { submissionId: string; expertId: string }[];
      inactiveExpertIds?: string[];
    },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.REALLOCATE_QUESTIONS,
      actor: roleAuditActor(user),
      context: {
        endPoint: 'reallocateManual',
        assignmentsCount: body.assignments?.length,
        inactiveExpertIds: body.inactiveExpertIds,
      },
      createdAt: new Date(),
    };
    try {
      const result = await this.questionService.manualReallocate(
        body.assignments,
        body.inactiveExpertIds,
      );
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
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to manually reallocate');
    }
  }

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
      actor: roleAuditActor(user),
      createdAt: new Date(),
    };
    try {
      const result =
        await this.questionService.balanceWorkloadSelectedQuestions(
          questionIds ?? [],
        );
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
    } catch (err: any) {
      console.log('Error in reAllocateSelectedQuestions:', err);
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

  @Post('/reallocate-timebound')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({
    summary:
      'Reallocate time-bound questions pending > 45 min to experts with < 3 active time-bound questions',
  })
  async reallocateTimeBound(@CurrentUser() user: IUser) {
    const result = await this.questionService.reallocateTimeBoundQuestions();
    this.auditTrailsService.createAuditTrail({
      category: AuditCategory.QUESTION,
      action: AuditAction.REALLOCATE_QUESTIONS,
      actor: roleAuditActor(user),
      changes: { after: { type: 'timeBound', ...result } },
      outcome: { status: OutComeStatus.SUCCESS },
      createdAt: new Date(),
    });
    return result;
  }

  @Post('/reallocate-manual-queue')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({
    summary:
      'Reallocate manual-queue (AGRI_EXPERT/OUTREACH) questions — assigns authors/reviewers for the single-allocation manual flow',
  })
  async reallocateManualQueue(@CurrentUser() user: IUser) {
    const result = await this.questionService.reallocateManualQuestions();
    this.auditTrailsService.createAuditTrail({
      category: AuditCategory.QUESTION,
      action: AuditAction.REALLOCATE_QUESTIONS,
      actor: roleAuditActor(user),
      changes: { after: { type: 'manual', ...result } },
      outcome: { status: OutComeStatus.SUCCESS },
      createdAt: new Date(),
    });
    return result;
  }

  @Post('/:questionId/mark-opened')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary:
      'Mark that the current expert has opened a time-bound question (blocks 45-min auto-reallocation)',
  })
  async markQuestionOpened(
    @Param('questionId') questionId: string,
    @CurrentUser() user: IUser,
  ) {
    await this.questionService.markQuestionOpened(
      questionId,
      user._id.toString(),
    );
    return { success: true };
  }

  @Patch('/:questionId/toggle-auto-allocate')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Toggle auto-allocate option for the selected question' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async toggleAutoAllocate(
    @Params() params: QuestionIdParam,
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { questionId } = params;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.EXPERTS_AUTO_ALLOCATE,
      actor: roleAuditActor(user),
      context: {
        questionId: questionId,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    let result;
    let questionDetails: any;
    let expertDetails: any;
    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      result = await this.questionService.toggleAutoAllocate(questionId);
      if (result?.data?.length > 0) {
        const expertIdToString =
          result?.data?.map((id: any) => id.toString()) || [];
        expertDetails = await Promise.all(
          expertIdToString.map((id: string) => this.userService.getUserById(id)),
        );
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
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to toggle auto-allocate');
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
          expertsDetails:
            expertDetails?.length > 0
              ? expertDetails.map((ed: any) => ({
                  name: `${ed?.firstName} ${ed?.lastName || ''}`.trim(),
                  email: ed?.email,
                  id: ed?._id.toString(),
                }))
              : [],
        },
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return result.message;
  }

  @Patch('/:questionId/moderator')
  @HttpCode(200)
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
      m
        ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() +
          (m.email ? ` (${m.email})` : '')
        : null;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.SELECT_MODERATOR,
      actor: roleAuditActor(user),
      context: { questionId },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };

    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      const prevModeratorId = (questionDetails as any)?.moderatorId?.toString();
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
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
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
      m
        ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() +
          (m.email ? ` (${m.email})` : '')
        : null;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.DELETE_MODERATOR,
      actor: roleAuditActor(user),
      context: { questionId },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };

    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      const prevModeratorId = (questionDetails as any)?.moderatorId?.toString();
      prevModerator = prevModeratorId
        ? await this.userService.getUserById(prevModeratorId)
        : null;

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
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to remove moderator');
    }
  }

  @Patch('/:questionId/role-assignee')
  @HttpCode(200)
  @Authorized(['admin', 'moderator', 'gate_keeper', 'auditor'])
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
      action:
        role === 'gate_keeper'
          ? AuditAction.SELECT_GATE_KEEPER
          : AuditAction.SELECT_AUDITOR,
      actor: roleAuditActor(user),
      context: { questionId },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };
    let questionDetails: any;
    let prevUser: any;
    let newUser: any;
    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      const prevId = (questionDetails as any)?.[
        role === 'gate_keeper' ? 'gateKeeperId' : 'auditorId'
      ]?.toString();
      [prevUser, newUser] = await Promise.all([
        prevId && ObjectId.isValid(prevId)
          ? this.userService.getUserById(prevId)
          : null,
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
          before: { [noun]: userLabel(prevUser) ?? 'Unassigned' },
          after: { [noun]: userLabel(newUser) ?? userId },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return { success: true, message: `${noun} updated successfully` };
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: { before: { [noun]: userLabel(prevUser) ?? 'Unassigned' } },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || `Failed to change ${noun}`,
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) throw new InternalServerError(err.message);
      throw new BadRequestError(err?.message || `Failed to change ${noun}`);
    }
  }

  @Delete('/:questionId/role-assignee')
  @HttpCode(200)
  @Authorized(['admin', 'moderator', 'gate_keeper', 'auditor'])
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
      action:
        role === 'gate_keeper'
          ? AuditAction.DELETE_GATE_KEEPER
          : AuditAction.DELETE_AUDITOR,
      actor: roleAuditActor(user),
      context: { questionId },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };
    let questionDetails: any;
    let prevUser: any;
    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      const prevId = (questionDetails as any)?.[
        role === 'gate_keeper' ? 'gateKeeperId' : 'auditorId'
      ]?.toString();
      prevUser =
        prevId && ObjectId.isValid(prevId)
          ? await this.userService.getUserById(prevId)
          : null;

      await this.questionService.removeQuestionRoleAssignee(
        questionId,
        role,
        `${user.firstName} ${user.lastName ?? ''}`.trim(),
      );

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { [noun]: userLabel(prevUser) ?? 'Unassigned' },
          after: { [noun]: 'Unassigned' },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return { success: true, message: `${noun} removed successfully` };
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: { before: { [noun]: userLabel(prevUser) ?? 'Unassigned' } },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || `Failed to remove ${noun}`,
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) throw new InternalServerError(err.message);
      throw new BadRequestError(err?.message || `Failed to remove ${noun}`);
    }
  }

  @Patch('/:questionId/role-allocation')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Toggle gate keeper / auditor / feedback auto-allocation for a question' })
  async toggleRoleAllocation(
    @Params() params: QuestionIdParam,
    @Body()
    body: {
      role: 'gate_keeper' | 'auditor' | 'feedback' | 'pae_validator';
      enabled: boolean;
    },
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { questionId } = params;
    const { role, enabled } = body;
    if (
      role !== 'gate_keeper' &&
      role !== 'auditor' &&
      role !== 'feedback' &&
      role !== 'pae_validator'
    ) {
      throw new BadRequestError(
        "role must be 'gate_keeper', 'auditor', 'feedback' or 'pae_validator'",
      );
    }
    if (user.role === 'expert') {
      throw new ForbiddenError('Experts cannot change auto-allocation');
    }
    if (
      role !== 'feedback' &&
      role !== 'pae_validator' &&
      !['admin', 'moderator', 'gate_keeper', 'auditor'].includes(user.role)
    ) {
      throw new ForbiddenError(
        'Only admins, moderators, gate keepers or auditors can change gate keeper / auditor allocation',
      );
    }
    const field =
      role === 'gate_keeper'
        ? 'autoAllocateGateKeeper'
        : role === 'auditor'
          ? 'autoAllocateAuditor'
          : role === 'pae_validator'
            ? 'autoAllocatePaeValidationExpert'
            : 'autoAllocateFeedback';
    const label =
      role === 'gate_keeper'
        ? 'Gate keeper'
        : role === 'auditor'
          ? 'Auditor'
          : role === 'pae_validator'
            ? 'PAE Validator'
            : 'Feedback';

    const toggleAction =
      role === 'gate_keeper'
        ? AuditAction.TOGGLE_GATE_KEEPER_ALLOCATION
        : role === 'auditor'
          ? AuditAction.TOGGLE_AUDITOR_ALLOCATION
          : role === 'pae_validator'
            ? AuditAction.TOGGLE_PAE_VALIDATOR_ALLOCATION
            : AuditAction.TOGGLE_FEEDBACK_ALLOCATION;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: toggleAction,
      actor: roleAuditActor(user),
      context: { questionId },
      changes: {},
      outcome: { status: OutComeStatus.SUCCESS },
    };
    let questionDetails: any;
    try {
      questionDetails = await this.questionService.getQuestionDataById(questionId);
      const before = (questionDetails as any)?.[field] !== false;

      await this.questionService.updateQuestion(questionId, { [field]: enabled } as any);

      // When enabling PAE validator auto-allocation, trigger the queue processor immediately
      // so the question gets assigned to an available PAE expert right away
      if (role === 'pae_validator' && enabled) {
        setImmediate(async () => {
          try {
            await this.questionService.processPaeValidationQueue();
          } catch (err) {
            console.error('[PAE Validation Queue] Trigger failed after toggle:', err);
          }
        });
      }

      auditPayload = {
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        changes: {
          before: { [`${label} auto-allocation`]: before ? 'On' : 'Off' },
          after: { [`${label} auto-allocation`]: enabled ? 'On' : 'Off' },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      return {
        success: true,
        message: `${label} auto-allocation turned ${enabled ? 'on' : 'off'}`,
      };
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        context: { ...auditPayload.context, question: questionDetails?.question },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to toggle allocation',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
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
      actor: roleAuditActor(user),
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
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to bulk allocate PAE experts',
      );
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
    let questionDetails: any;
    let result;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.SELECT_EXPERT,
      actor: roleAuditActor(user),
      context: {
        questionId: questionId,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      expertDetails = await Promise.all(
        experts.map(id => this.userService.getUserById(id)),
      );
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
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to allocate experts');
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
          expertsDetails: expertDetails.map((ed: any) => ({
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
    let expertId: any;
    let expertDeatils: any;
    let questionDetails: any;
    let result: any;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.DELETE_EXPERT,
      actor: roleAuditActor(user),
      context: {
        questionId: questionId,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
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
            expertName: expertDeatils
              ? `${expertDeatils.firstName} ${expertDeatils.lastName}`
              : 'Unknown',
            email: expertDeatils ? expertDeatils.email : 'Unknown',
            role: expertDeatils ? expertDeatils.role : 'Unknown',
          },
        },
        context: {
          ...auditPayload.context,
          question: questionDetails?.text,
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to remove expert allocation',
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
        err?.message || 'Failed to remove expert allocation',
      );
    }
    auditPayload = {
      ...auditPayload,
      changes: {
        before: {
          experts: expertId,
          expertName: expertDeatils
            ? `${expertDeatils.firstName} ${expertDeatils.lastName}`
            : 'Unknown',
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
      actor: roleAuditActor(user),
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
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to replace queue expert');
    }
  }
}
