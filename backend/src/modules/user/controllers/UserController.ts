import 'reflect-metadata';
import {
  JsonController,
  Get,
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
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  IUser,
  NotificationRetentionType,
} from '#root/shared/interfaces/models.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {UserService} from '#root/modules/user/services/UserService.js';
import {
  BlockUnblockBody,
  NotificationDeletePreferenceDTO,
  UpdatePenaltyAndIncentive,
  UsersNameResponseDto,
  ExpertReviewLevelDto,
  UpdateUserDto
} from '../validators/UserValidators.js';
import {
  UserErrorResponse,
  UserSuccessMessageResponse,
  PaginatedUsersResponse,
  ToggleUserRoleResponse,
  UserEntryResponse,
  ExpertAutoCompleteResponse,
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
  ) {}

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
    },
    
  ) {
    const pageNum = Number(query.page) || 1;
    const limitNum = Number(query.limit) || 10;
    const search = query.search || '';
    const sort = query.sort || '';
    const filter = query.filter || '';

    return this.userService.getAllUsers(
      pageNum,
      limitNum,
      search,
      sort,
      filter,
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
  ): Promise<{message: string}> {
    const userId = currentUser._id.toString();
    const {preference} = body;
    await this.userService.updateAutoDeleteNotificationPreference(
      preference,
      userId,
    );
    return {message: 'Notification preference updated successfully'};
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
  ): Promise<{message: string}> {
    const {type, userId} = body;
    await this.userService.updatePenaltyAndIncentive(userId, type);
    return {message: `${type} updated successfully`};
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
    const {page = 1, limit = 10, search = '', sort = '', filter = ''} = query;
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
  ): Promise<{message: string}> {
    const {action, userId} = body;
    await this.userService.blockUnblockExperts(userId, action);
    return {message: `${action} Expert successfully`};
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
    @Body() body: {userId: string; status: 'active' | 'in-active'},
  ): Promise<{message: string}> {
    const {userId, status} = body;
    await this.userService.updateActivityStatus(userId, status);
    return {message: `Expert status updated to ${status} successfully`};
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
  ) {
    const updatedUser = await this.userService.toggleUserRole(
      currentUser,
      userId,
    );
    return {message: `User promoted to moderator`, user: updatedUser};
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
    @Params() params: {email: string},
  ): Promise<IUser | null> {
    const {email} = params;
    return await this.userService.getUserByEmail(email);
  }

  // get user autocomplete options
  @OpenAPI({
    summary: 'Get expert autocomplete options',
    description: 'Retrieves autocomplete options for expert users based on a search query.',
  })
  @ResponseSchema(ExpertAutoCompleteResponse, {
    statusCode: 200,
    description: 'Expert autocomplete options retrieved successfully',
    isArray: true,
  })
  @ResponseSchema(UserErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Get('/autocomplete')
  @HttpCode(200)
  @Authorized()
  async getExpertAutoCompleteOptions(
    @QueryParams()
    query: {
      search?: string;
    },
    @CurrentUser() currentUser: IUser,
  ): Promise<{_id: string; userName: string; email: string}[]> {
    const {search = ''} = query;
    const userRole = currentUser?.role;
    return await this.userService.getExpertAutoCompleteOptions(
      search,
      userRole,
    );
  }
}
