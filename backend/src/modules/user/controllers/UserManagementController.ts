import 'reflect-metadata';
import { JsonController, Get, Post, Put, Body, HttpCode, Params, Param, Authorized, CurrentUser, NotFoundError, Patch, QueryParams, BadRequestError, InternalServerError, ForbiddenError, QueryParam, ContentType, Res } from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IUser, IUserHistory, NotificationRetentionType, UserRole } from '#root/shared/interfaces/models.js';
import { BadRequestErrorResponse } from '#shared/middleware/errorHandler.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import { UserService } from '#root/modules/user/services/UserService.js';
import { BlockUnblockBody, NotificationDeletePreferenceDTO, UpdatePenaltyAndIncentive, UsersNameResponseDto, ExpertReviewLevelDto, UpdateUserDto, ToggleUserRoleDto, VerifyUserBody, VerificationRequestDto } from '#root/modules/user/validators/UserValidators.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { AuditAction, AuditCategory, ModeratorAuditTrail, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { UserErrorResponse, UserSuccessMessageResponse, PaginatedUsersResponse, ToggleUserRoleResponse, UserEntryResponse, UserHistoryResponse } from '../../core/classes/validators/UserResponseValidators.js';
import { CHATBOT_TYPES } from '#root/modules/chatbot/types.js';
import { IChatbotService } from '#root/modules/chatbot/interfaces/IChatbotService.js';
import { TrendGranularity } from '#root/shared/database/providers/mongo/repositories/UserRepository.js';

@OpenAPI({
  tags: ['users-management'],
  description: 'Operations for managing users',
})
@injectable()
@JsonController('/users')
export class UserManagementController {
  constructor(
    @inject(GLOBAL_TYPES.UserService)
    private readonly userService: UserService,

    @inject(CHATBOT_TYPES.ChatbotService)
    private readonly chatbotService: IChatbotService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) { }

  @OpenAPI({
    summary: 'Remove all allocations for an expert (Admin)',
    description:
      'Clears all queued allocations for questions where the expert appears and resets the expert workload to zero.',
  })
  @ResponseSchema(UserSuccessMessageResponse, {
    statusCode: 200,
    description: 'Expert allocations removed successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Admin access required',
  })
  @Authorized(['admin'])
  @Post('/:id/remove-allocations')
  @HttpCode(200)
  async removeExpertAllocations(
    @Param('id') expertId: string,
    @CurrentUser() currentUser: IUser,
  ): Promise<{
    message: string;
    questionsAffected: number;
    removedQueues: number;
    workloadBefore: number;
    workloadAfter: number;
    questionIds: string[];
  }> {
    verifyNotTester(currentUser);
    let expertDetails: IUser | null = null;
    let result:
      | {
        questionsAffected: number;
        removedQueues: number;
        workloadBefore: number;
        workloadAfter: number;
        questionIds: string[];
      }
      | null = null;

    const auditPayloadBase: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.REALLOCATE_QUESTIONS,
      actor: {
        id: currentUser._id.toString(),
        name: `${currentUser.firstName} ${currentUser.lastName}`,
        email: currentUser.email,
        role: currentUser.role,
        avatar: currentUser?.avatar || '',
      },
      context: {
        targetExpertId: expertId,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };

    try {
      expertDetails = await this.userService.getUserById(expertId);
      result = await this.userService.removeExpertAllocations(
        currentUser,
        expertId,
      );
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayloadBase,
        changes: {
          before: {
            targetExpert: expertDetails
              ? {
                id: expertDetails._id?.toString(),
                name: `${expertDetails.firstName} ${expertDetails.lastName || ''}`.trim(),
                email: expertDetails.email,
                role: expertDetails.role,
                workload: expertDetails.reputation_score ?? 0,
              }
              : null,
          },
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to remove expert allocations',
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
        err?.message || 'Failed to remove expert allocations',
      );
    }

    this.auditTrailsService.createAuditTrail({
      ...auditPayloadBase,
      changes: {
        before: {
          targetExpert: expertDetails
            ? {
              id: expertDetails._id?.toString(),
              name: `${expertDetails.firstName} ${expertDetails.lastName || ''}`.trim(),
              email: expertDetails.email,
              role: expertDetails.role,
              workload: result?.workloadBefore ?? 0,
            }
            : null,
        },
        after: {
          targetExpert: {
            id: expertId,
            workload: result?.workloadAfter ?? 0,
          },
          questionsAffected: result?.questionsAffected ?? 0,
          removedQueues: result?.removedQueues ?? 0,
        },
      },
      context: {
        ...auditPayloadBase.context,
        questionIds: result?.questionIds || [],
      },
    });

    return {
      message: 'Expert allocations removed successfully',
      questionsAffected: result?.questionsAffected ?? 0,
      removedQueues: result?.removedQueues ?? 0,
      workloadBefore: result?.workloadBefore ?? 0,
      workloadAfter: result?.workloadAfter ?? 0,
      questionIds: result?.questionIds || [],
    };
  }

  @OpenAPI({
    summary: 'Verify or unverify a user (Admin)',
    description: 'Allows an admin to verify or unverify a user account.',
  })
  @ResponseSchema(UserEntryResponse, {
    statusCode: 200,
    description: 'User verification status updated successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Admin access required',
  })
  @Authorized(['admin'])
  @Patch('/:id/verify')
  @HttpCode(200)
  async verifyUser(
    @Param('id') userId: string,
    @Body() body: VerifyUserBody,
    @CurrentUser() currentUser: IUser,
  ): Promise<IUser> {
    // manual admin check
  if (currentUser.role !== 'admin') {
    throw new ForbiddenError(
      'Only admins can verify users',
    );
  }
    const {isVerified} = body;
    const targetUser = await this.userService.getUserById(userId);
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.USER_MANAGEMENT,
      action: AuditAction.VERIFY_USER,
      actor: {
        id: currentUser._id.toString(),
        name: `${currentUser.firstName} ${currentUser.lastName}`,
        email: currentUser.email,
        role: currentUser.role,
        avatar: currentUser?.avatar || '',
      },
      context: {
        userId,
        name: targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : userId,
        email: targetUser?.email,
      },
      changes: {
        before: { 
          isVerified: targetUser?.isVerified,
          isBlocked: targetUser?.isBlocked,
          status: targetUser?.status,
        },
      },
      createdAt: new Date(),
    };
    try {
      const updatedUser = await this.userService.verifyUser(userId, isVerified);
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        changes: {
          ...auditPayload.changes,
          after: { 
            isVerified,
            isBlocked: false,
            status: 'active',
          },
        },
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return updatedUser;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to verify user',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      throw err;
    }
  }

  @OpenAPI({
    summary: 'Get all call agents',
    description: 'Retrieves list of all users who are call agents (experts/moderators with isCallAgent: true). Moderator access required.',
  })
  @ResponseSchema(UserEntryResponse, {
    statusCode: 200,
    description: 'Call agents retrieved successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Moderator access required',
  })
  @Get('/call-agents')
  @HttpCode(200)
  @Authorized(['admin'])
  async getCallAgents(): Promise<IUser[]> {
    return await this.userService.getCallAgents();
  }

  @OpenAPI({
    summary: 'Set user as call agent',
    description: 'Sets or removes a user as a call agent. Moderator access required.',
  })
  @ResponseSchema(UserEntryResponse, {
    statusCode: 200,
    description: 'Call agent status updated successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid user or role',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Moderator access required',
  })
  @Post('/set-call-agents')
  @HttpCode(200)
  @Authorized(['admin'])
  async setCallAgentStatus(
    @Body() body: { userId: string; isCallAgent: boolean; isCallAgentActive: boolean },
    @CurrentUser() currentUser: IUser,
  ): Promise<IUser> {
    const { userId, isCallAgent, isCallAgentActive } = body;
    try {
      const res = await this.userService.setCallAgentStatus(userId, isCallAgent, isCallAgentActive, currentUser);
      return res;
    } catch (err) {
      throw err;
    }
  }

  @OpenAPI({
    summary: 'Toggle call agent active status',
    description: 'Toggles the active status of a call agent. Moderator access required.',
  })
  @ResponseSchema(UserEntryResponse, {
    statusCode: 200,
    description: 'Call agent active status toggled successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 400,
    description: 'Bad request - User is not a call agent',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Moderator access required',
  })
  @Patch('/call-agents/:id/toggle-active')
  @HttpCode(200)
  @Authorized(['admin'])
  async toggleCallAgentActive(
    @Param('id') userId: string,
    @CurrentUser() currentUser: IUser,
  ): Promise<IUser> {
    return await this.userService.toggleCallAgentActive(userId, currentUser);
  }

  @OpenAPI({
    summary: 'Toggle call agent online/offline status',
    description: 'Sets a call agent as online or offline. Online agents are assigned an agent number and can receive calls. Offline agents release their agent number. Call agents can control their own status.',
  })
  @ResponseSchema(UserEntryResponse, {
    statusCode: 200,
    description: 'Call agent status updated successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 400,
    description: 'Bad request - User is not a call agent',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Post('/call-agents/toggle-status')
  @HttpCode(200)
  @Authorized(['call_agent'])
  async toggleAgentStatus(
    @Body() body: { online: boolean },
    @CurrentUser() currentUser: IUser,
  ): Promise<IUser> {
    const userId = currentUser._id.toString();
    if (body.online) {
      return await this.userService.setAgentOnline(userId);
    } else {
      return await this.userService.setAgentOffline(userId);
    }
  }

  @OpenAPI({
    summary: 'Update call agent heartbeat',
    description: 'Updates the last active timestamp of a call agent to prevent them from being marked offline.',
  })
  @Post('/call-agents/heartbeat')
  @HttpCode(200)
  @Authorized(['call_agent'])
  async updateHeartbeat(
    @CurrentUser() currentUser: IUser,
  ): Promise<{ success: boolean }> {
    const userId = currentUser._id.toString();
    await this.userService.updateAgentHeartbeat(userId);
    return { success: true };
  }


  @OpenAPI({
    summary: 'Mark call agent as available',
    description: 'Marks a call agent as available (not busy) if they are active and currently busy.',
  })
  @Post('/call-agents/available')
  @HttpCode(200)
  @Authorized(['call_agent'])
  async markAvailable(
    @CurrentUser() currentUser: IUser,
  ): Promise<IUser> {
    const userId = currentUser._id.toString();
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    if (user.isCallAgentActive && user.isBusy) {
      return await this.userService.markAgentAsAvailable(userId);
    }
    return user;
  }


  @OpenAPI({
    summary: 'Request account verification',
    description: 'Allows unverified users to send a verification request to all system admins.',
  })
  @ResponseSchema(UserSuccessMessageResponse, {
    statusCode: 200,
    description: 'Verification request sent successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Identifier is missing',
  })
  @Post('/verification-request')
  @HttpCode(200)
  async requestVerification(
    @Body() body: VerificationRequestDto
  ): Promise<{ message: string }> {
    const { identifier } = body;
    await this.userService.requestVerification(identifier);
    return { message: 'Verification request sent to administrators.' };
  }

  //get user history
   @OpenAPI({
    summary: 'Get user history by userId',
    description: 'Retrieves the user history for the specified user ID.',
  })
  @ResponseSchema(UserHistoryResponse, {
    statusCode: 200,
    description: 'User history retrieved successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 404,
    description: 'Not found - User not found',
  })
  @Get('/user-history')
  @HttpCode(200)
  @Authorized()
  async getUserHistoryById(@QueryParams() query: { userId: string; startDateTime?: string; endDateTime?: string;}): Promise<IUserHistory> {
    
    return await this.userService.getUserHistoryById(query);
  }

  //make user a training user
   @OpenAPI({
    summary: 'Assign or remove TMU (Training Model User) status for a user',
    description: 'Assigns or removes Training Model User status for a user. Admin access required.',
  })
  @ResponseSchema(UserSuccessMessageResponse, {
    statusCode: 200,
    description: 'TMU status updated successfully',
  })
  @Patch('/training-users')
  @HttpCode(200)
  @Authorized(['admin'])
  async toggleTrainingUserStatus(
    @Body() body: BlockUnblockBody,
    @CurrentUser() user: IUser,
  ): Promise<{ message: string }> {
    const { action, userId } = body;
    const userDetails = await this.userService.getUserById(userId);
    if (!userDetails) {
      throw new NotFoundError('User not found');
    }

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_MANAGEMENT,
      action: action === 'assign' ? AuditAction.ASSIGN_TRAINING_USER : AuditAction.REMOVE_TRAINING_USER,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        userId: userId,
        name: `${userDetails.firstName} ${userDetails.lastName}`,
        email: userDetails.email,
        role: userDetails.role,
      },
      changes: {
        before: {
          isTrainingUser: action === 'assign' ? false : true,
        },
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };

    try {
      await this.userService.updateTrainingUserStatus(userId, action);
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to update training user status',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to update training user status');
    }

    auditPayload = {
      ...auditPayload,
      changes: {
        ...auditPayload.changes,
        after: {
          isTrainingUser: action === 'assign' ? true : false,
        },
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return { message: `Training user status ${action === 'assign' ? 'assigned' : 'removed'} successfully` };
  }

   @OpenAPI({
    summary: 'Get user working hours',
    description: 'Calculates the total working hours for a user in a given time period.',
  })
  @Get('/working-hours')
  @HttpCode(200)
  @Authorized()
  async getWorkingHours(
    @QueryParams() query: { userId: string; startDateTime: string; endDateTime: string; }
  ): Promise<{ workingHours: number }> {
    return await this.userService.getWorkingHours(query);
  }

  @Get('/reviewer-lifecycle')
  @HttpCode(200)
  @Authorized()
  async getReviewerLifecycle(
    @QueryParam('userId') userId?: string,
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
  ): Promise<any> {

    // console.log("reviewer-lifecycle---", userId, startDate, endDate);
    const result = await this.chatbotService.getReviewerLifecycle(
      userId, new Date(startDate), new Date(endDate)
    );
    // console.log("result----", result);
    return result;
  }

    @Get ('/working-hours-trend')
  @HttpCode(200)
  @Authorized()
  async getWorkingHoursTrend(
    @QueryParams() query: {userId: string; startDateTime: string; endDateTime: string; granularity: TrendGranularity;}
  ): Promise<any>{
    return await this.userService.getWorkingHoursTrend(query)
  }

  @Get('/by-role')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary: '({_id, name, email}) List users filtered by roles',
  })
  async getUsersByRole(
    @QueryParams() query: { role: UserRole[] },
  ) {
    return await this.userService.getUsersByRole(query.role ?? []);
  }
}
