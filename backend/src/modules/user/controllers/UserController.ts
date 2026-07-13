import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Put,
  Body,
  HttpCode,
  Params,
  Param,
  Authorized,
  CurrentUser,
  NotFoundError,
  Patch,
  QueryParams,
  BadRequestError,
  InternalServerError,
  ForbiddenError
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import {
  IUser,
  IUserHistory,
  NotificationRetentionType,
  UserRole,
} from '#root/shared/interfaces/models.js';
import { BadRequestErrorResponse } from '#shared/middleware/errorHandler.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import { UserService } from '#root/modules/user/services/UserService.js';
import {
  BlockUnblockBody,
  NotificationDeletePreferenceDTO,
  UpdatePenaltyAndIncentive,
  UsersNameResponseDto,
  ExpertReviewLevelDto,
  UpdateUserDto,
  ToggleUserRoleDto,
  VerifyUserBody,
  VerificationRequestDto
} from '#root/modules/user/validators/UserValidators.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { AuditAction, AuditCategory, ModeratorAuditTrail, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';

import {
  UserErrorResponse,
  UserSuccessMessageResponse,
  PaginatedUsersResponse,
  ToggleUserRoleResponse,
  UserEntryResponse,
  UserHistoryResponse,
} from '../../core/classes/validators/UserResponseValidators.js';

@OpenAPI({
  tags: ['users'],
  description: 'Operations for managing users',
})
@injectable()
@JsonController('/users')
export class UserController {
  constructor(
    @inject(GLOBAL_TYPES.UserService)
    private readonly userService: UserService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) { }

  @OpenAPI({
    summary: 'Get current user',
    description: 'Retrieves the current authenticated user profile including notification count.',
  })
  @ResponseSchema(UserEntryResponse, {
    statusCode: 200,
    description: 'Current user retrieved successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 404,
    description: 'Not found - User not found',
  })
  @Get('/me')
  @HttpCode(200)
  @Authorized()
  async getUserById(@CurrentUser() currentUser: IUser): Promise<IUser> {
    const userId = currentUser._id.toString();
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }


  // TODO: Add OpenAPI documentation 200 type definition
  @OpenAPI({
    summary: 'Get current user review level',
    description: 'Retrieves the review level statistics for the current user or moderator based on query parameters.',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 404,
    description: 'Not found - Unable to find review level for user',
  })
  @Get('/review-level')
  @HttpCode(200)
  @Authorized()
  async getUserReviewLevel(
    @QueryParams() query: ExpertReviewLevelDto,
  ): Promise<any> {
    // const {userId }= params;
    const result = await this.userService.getUserReviewLevel(query);
    if (!result) {
      throw new NotFoundError('not able to find review_levvel odf user');
    }
    return result;
  }

  @OpenAPI({
    summary: 'Update user information',
    description: 'Updates the current user profile information including name and role.',
  })
  @ResponseSchema(UserEntryResponse, {
    statusCode: 200,
    description: 'User updated successfully - Returns updated user data',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid user data or empty first/last name',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 404,
    description: 'Not found - User not found',
  })
  @Put('/')
  @HttpCode(200)
  @Authorized()
  async updateUser(
    @Body() body: UpdateUserDto,
    @CurrentUser() currentUser: IUser,
  ): Promise<IUser> {
    verifyNotTester(currentUser);
    const userId = currentUser._id.toString();
    const updatedUser = await this.userService.updateUser(userId, body);
    if (!updatedUser) {
      throw new NotFoundError('User not found');
    }
    return updatedUser;
  }

  @OpenAPI({
    summary: 'Get all users with pagination (Admin)',
    description: 'Retrieves paginated list of all users for admin users with search, sort, and filter capabilities.',
  })
  @ResponseSchema(PaginatedUsersResponse, {
    statusCode: 200,
    description: 'Users retrieved successfully with pagination',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Admin access required',
  })
  @Get('/admin/all')
  @HttpCode(200)
  @Authorized(['admin'])
  async getAllUsers(
    @CurrentUser() user: IUser,
    @QueryParams()
    query: {
      page?: number | string;
      limit?: number | string;
      search?: string;
      sort?: string;
      filter?: string;
      role?: string;
      isBlocked?: string;
      isVerified?: string;
      isSTF?: string;
    },

  ) {
    console.log("Backend Test")
    const pageNum = Number(query.page) || 1;
    const limitNum = Number(query.limit) || 10;
    const search = query.search || '';
    const sort = query.sort || '';
    const filter = query.filter || '';
    const role = query.role || 'ALL';
    const isBlocked = query.isBlocked === 'true' ? true : query.isBlocked === 'false' ? false : undefined;
    const isVerified = query.isVerified === 'true' ? true : query.isVerified === 'false' ? false : undefined;
    const isSTF = query.isSTF === 'true' ? true : query.isSTF === 'false' ? false : undefined;

    return this.userService.getAllUsers(
      pageNum,
      limitNum,
      search,
      sort,
      filter,
      role,
      isBlocked,
      isVerified,
      isSTF,
    );
  }

  @OpenAPI({
    summary: 'Get all user names',
    description: 'Retrieves paginated list of users with their names and preferences for manual selection.',
  })
  @ResponseSchema(PaginatedUsersResponse, {
    statusCode: 200,
    description: 'User names retrieved successfully with pagination',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Get('/all')
  @HttpCode(200)
  @Authorized()
  async getAllUsersName(
    @CurrentUser() user: IUser,
    @QueryParams()
    query: {
      page?: number;
      limit?: number;
      search?: string;
      sort: string;
      filter: string;
    },
  ): Promise<UsersNameResponseDto> {
    const {
      page = 1,
      limit = 10,
      search = '',
      sort = '',
      filter = '',
    } = query;
    const userId = user._id.toString();
    return await this.userService.getAllUsersforManualSelect(
      userId,
      Number(page),
      Number(limit),
      search,
      sort,
      filter,
    );
  }

  @Get('/moderators')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'List all moderators ({_id, name, email}) for filter dropdowns' })
  async getModerators() {
    return await this.userService.getModeratorsList();
  }

  @OpenAPI({
    summary: 'Get STF moderators',
    description: 'Returns non-blocked moderators that have Special Task Force enabled.',
  })
  @Get('/stf-moderators')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  async getStfModerators() {
    const { users } = await this.userService.getAllUsers(
      1,
      1000,
      '',
      '',
      'ALL',
      'moderator',
      false,
      undefined,
      true,
    );
    return users.map(u => ({
      _id: u._id?.toString(),
      name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
      email: u.email,
      // The questions this moderator currently holds, each with its denormalised status
      // ({ questionId, status }). Empty when free. Re-routed entries do not mark busy.
      assignedQuestionIds: (u.assignedQuestionIds ?? []).map((a: any) => ({
        questionId: a.questionId?.toString(),
        status: a.status,
      })),
    }));
  }

  @OpenAPI({
    summary: 'Update notification auto-delete preference',
    description: 'Updates the notification auto-delete preference for the current user (3d, 1w, 2w, 1m, never).',
  })
  @ResponseSchema(UserSuccessMessageResponse, {
    statusCode: 200,
    description: 'Notification preference updated successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid preference value',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Patch('/')
  @HttpCode(200)
  @Authorized()
  async updateAutoDeleteNotificationPreference(
    @Body() body: NotificationDeletePreferenceDTO,
    @CurrentUser() currentUser: IUser,
  ): Promise<{ message: string }> {
    verifyNotTester(currentUser);
    const userId = currentUser._id.toString();
    const { preference } = body;
    await this.userService.updateAutoDeleteNotificationPreference(
      preference,
      userId,
    );
    return { message: 'Notification preference updated successfully' };
  }

  @OpenAPI({
    summary: 'Update incentive or penalty points',
    description: 'Updates penalty or incentive points for a specific user.',
  })
  @ResponseSchema(UserSuccessMessageResponse, {
    statusCode: 200,
    description: 'Points updated successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid type or missing userId',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Patch('/point')
  @HttpCode(200)
  @Authorized()
  async updateIncentiveAndPenalty(
    @Body() body: UpdatePenaltyAndIncentive,
    @CurrentUser() currentUser: IUser,
  ): Promise<{ message: string }> {
    verifyNotTester(currentUser);
    const { type, userId } = body;
    await this.userService.updatePenaltyAndIncentive(userId, type);
    return { message: `${type} updated successfully` };
  }

  @OpenAPI({
    summary: 'Get all Experts',
    description: 'Retrieves paginated list of all expert users with search, sort, and filter capabilities.',
  })
  @ResponseSchema(PaginatedUsersResponse, {
    statusCode: 200,
    description: 'Experts retrieved successfully with pagination',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Get('/list')
  @HttpCode(200)
  @Authorized()
  async getAllExperts(
    @QueryParams()
    query: {
      page?: number;
      limit?: number;
      search?: string;
      sort: string;
      filter: string;
    },
  ) {
    const { page = 1, limit = 10, search = '', sort = '', filter = '' } = query;
    return await this.userService.findAllExperts(
      Number(page),
      Number(limit),
      search,
      sort,
      filter,
    );
  }

  @OpenAPI({
    summary: 'Block or unblock an expert',
    description: 'Blocks or unblocks an expert user based on the action provided.',
  })
  @ResponseSchema(UserSuccessMessageResponse, {
    statusCode: 200,
    description: 'Expert blocked/unblocked successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid action or missing userId',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Patch('/expert')
  @HttpCode(200)
  @Authorized()
  async BlockAndUnblockExpert(
    @Body() body: BlockUnblockBody,
    @CurrentUser() user: IUser,
  ): Promise<{ message: string }> {
    verifyNotTester(user);
    const { action, userId } = body;
    const expertDetails = await this.userService.getUserById(userId);
    if (!expertDetails) {
      throw new NotFoundError('User not found');
    }

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_MANAGEMENT,
      action: action === 'block' ? AuditAction.BLOCK_EXPERT : AuditAction.UNBLOCK_EXPERT,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        userId: userId,
        name: `${expertDetails.firstName} ${expertDetails.lastName}`,
        email: expertDetails.email,
        role: expertDetails.role,
      },
      changes: {
        before: {
          status: action === 'block' ? 'unblocked' : 'blocked',
        },
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      await this.userService.blockUnblockExperts(userId, action);
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to block/unblock expert',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to block/unblock expert',
      );
    }
    auditPayload = {
      ...auditPayload,
      changes: {
        ...auditPayload.changes,
        after: {
          status: action === 'block' ? 'blocked' : 'unblocked',
        }
      }
    }
    this.auditTrailsService.createAuditTrail(auditPayload);
    return { message: `${action} Expert successfully` };
  }

  @OpenAPI({
    summary: 'Assign or remove STF status for a user',
    description: 'Assigns or removes Special Task Force status for a user. Admin access required.',
  })
  @ResponseSchema(UserSuccessMessageResponse, {
    statusCode: 200,
    description: 'STF status updated successfully',
  })
  @Patch('/stf')
  @HttpCode(200)
  @Authorized(['admin'])
  async toggleSTFStatus(
    @Body() body: BlockUnblockBody,
    @CurrentUser() user: IUser,
  ): Promise<{ message: string }> {
    const { action, userId } = body;
    const expertDetails = await this.userService.getUserById(userId);
    if (!expertDetails) {
      throw new NotFoundError('User not found');
    }

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_MANAGEMENT,
      action: action === 'assign' ? AuditAction.ASSIGN_STF : AuditAction.REMOVE_STF,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        userId: userId,
        name: `${expertDetails.firstName} ${expertDetails.lastName}`,
        email: expertDetails.email,
        role: expertDetails.role,
      },
      changes: {
        before: {
          special_task_force: action === 'assign' ? false : true,
        },
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };

    try {
      await this.userService.updateSTFStatus(userId, action);
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to update STF status',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to update STF status');
    }

    auditPayload = {
      ...auditPayload,
      changes: {
        ...auditPayload.changes,
        after: {
          special_task_force: action === 'assign' ? true : false,
        },
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return { message: `STF status ${action === 'assign' ? 'assigned' : 'removed'} successfully` };
  }

  @OpenAPI({
    summary: 'Update expert activity status',
    description: 'Updates the activity status of an expert (active or in-active).',
  })
  @ResponseSchema(UserSuccessMessageResponse, {
    statusCode: 200,
    description: 'Expert status updated successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid status or missing userId',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Patch('/status')
  @HttpCode(200)
  @Authorized()
  async updateActivityStatus(
    @Body() body: { userId: string; status: 'active' | 'in-active' },
    @CurrentUser() user: IUser,
  ): Promise<{ message: string }> {
    verifyNotTester(user);
    const { userId, status } = body;
    const expertDetails = await this.userService.getUserById(userId);
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_MANAGEMENT,
      action: status === 'active' ? AuditAction.ACTIVATE_EXPERT : AuditAction.DEACTIVATE_EXPERT,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        userId: userId,
        name: `${expertDetails.firstName} ${expertDetails.lastName}`,
        email: expertDetails.email,
        role: expertDetails.role,
      },
      changes: {
        before: {
          status: status === 'in-active' ? 'active' : 'in-active',
        },
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      await this.userService.updateActivityStatus(userId, status);
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to update expert status',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to update expert status',
      );
    }
    auditPayload = {
      ...auditPayload,
      changes: {
        ...auditPayload.changes,
        after: {
          status: status === 'in-active' ? 'in-active' : 'active',
        }
      }
    }
    this.auditTrailsService.createAuditTrail(auditPayload);
    return { message: `Expert status updated to ${status} successfully` };
  }

  @OpenAPI({
    summary: 'Toggle user role between expert and moderator',
    description: 'Toggles the role of a user between expert and moderator. Admin access required.',
  })
  @ResponseSchema(ToggleUserRoleResponse, {
    statusCode: 200,
    description: 'User role toggled successfully - Returns updated user',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Admin access required',
  })
  @Authorized()
  @Patch('/:id/role')
  @HttpCode(200)
  async toggleUserRole(
    @CurrentUser() currentUser: IUser,
    @Param('id') userId: string,
    @Body() body: ToggleUserRoleDto
  ) {
    verifyNotTester(currentUser);
    console.log("New Role", body.role)
    let prevUserDetails = await this.userService.getUserById(userId);
    let updatedUser;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.ROLE_MANAGEMENT,
      action: AuditAction.TOGGLE_ROLE,
      actor: {
        id: currentUser._id.toString(),
        name: `${currentUser.firstName} ${currentUser.lastName}`,
        email: currentUser.email,
        role: currentUser.role,
        avatar: currentUser?.avatar || '',
      },
      context: {
        userId: userId,
        name: `${prevUserDetails.firstName} ${prevUserDetails.lastName}`,
        email: prevUserDetails.email,
        role: prevUserDetails.role,
      },
      changes: {
        before: {
          role: prevUserDetails.role,
        }
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };

    try {
      updatedUser = await this.userService.updateUserRole(
        currentUser,
        userId,
        body.role
      );
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to toggle user role',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to toggle user role',
      );
    }
    auditPayload = {
      ...auditPayload,
      changes: {
        ...auditPayload.changes,
        after: {
          role: body.role,
        }
      }
    }
    this.auditTrailsService.createAuditTrail(auditPayload);
    return { message: `User role has been changed successfully!!`, user: updatedUser };
  }

  @OpenAPI({
    summary: 'Get user details by email',
    description: 'Retrieves user details by email address.',
  })
  @ResponseSchema(UserEntryResponse, {
    statusCode: 200,
    description: 'User details retrieved successfully',
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 404,
    description: 'Not found - User with email not found',
  })
  @Get('/details/:email')
  @HttpCode(200)
  async getUserDetails(
    @Params() params: { email: string },
  ): Promise<IUser | null> {
    const { email } = params;
    return await this.userService.getUserByEmail(email);
  }

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
        before: { isVerified: targetUser?.isVerified },
      },
      createdAt: new Date(),
    };
    try {
      const updatedUser = await this.userService.verifyUser(userId, isVerified);
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        changes: {
          ...auditPayload.changes,
          after: { isVerified },
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
}
