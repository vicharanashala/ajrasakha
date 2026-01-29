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
  GetUserByEmailType,
  IUser,
  NotificationRetentionType,
} from '#root/shared/interfaces/models.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {UserService} from '../services/UserService.js';
import {
  BlockUnblockBody,
  NotificationDeletePreferenceDTO,
  UpdatePenaltyAndIncentive,
  UsersNameResponseDto,
  ExpertReviewLevelDto,
  UpdateUserDto
} from '../classes/validators/UserValidators.js';

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

  @Get('/me')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get current user'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getUserById(@CurrentUser() currentUser: IUser): Promise<IUser> {
    const userId = currentUser._id.toString();
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }
  @Get('/review-level')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get current user review level'})
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

  @Put('/')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Update user information'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async updateUser(
    @Body() body: UpdateUserDto,
    @CurrentUser() currentUser: IUser,
  ): Promise<{firstName:string,lastName:string}> {
    const userId = currentUser._id.toString();
    const updatedUser = await this.userService.updateUser(userId, body);
    if (!updatedUser) {
      throw new NotFoundError('User not found');
    }
    return {firstName:updatedUser.firstName,lastName:updatedUser.lastName};
  }

  @Get('/admin/all')
  @HttpCode(200)
  @Authorized(['admin'])
  @OpenAPI({summary: 'Get all users with pagination (Admin)'})
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

  @Get('/all')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get all user names'})
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

  @Patch('/')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Update user information'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
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

  @Patch('/point')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Update user information'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async updateIncentiveAndPenalty(
    @Body() body: UpdatePenaltyAndIncentive,
  ): Promise<{message: string}> {
    const {type, userId} = body;
    await this.userService.updatePenaltyAndIncentive(userId, type);
    return {message: `${type} updated successfully`};
  }

  @Get('/list')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get all Experts'})
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

  @Patch('/expert')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Update user information'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async BlockAndUnblockExpert(
    @Body() body: BlockUnblockBody,
  ): Promise<{message: string}> {
    const {action, userId} = body;
    await this.userService.blockUnblockExperts(userId, action);
    return {message: `${action} Expert successfully`};
  }

  @Authorized()
  @Patch('/:id/role')
  @HttpCode(200)
  @OpenAPI({summary: 'Toggle user role between expert and moderator'})
  async toggleUserRole(
    @CurrentUser() currentUser: IUser,
    @Param('id') userId: string,
  ) {
    const updatedUser = await this.userService.toggleUserRole(
      currentUser,
      userId,
    );
    return {message: `User promoted to moderator`, user: {firstName:updatedUser.firstName,role:updatedUser.role}};
  }

  @Get('/details/:email')
  @HttpCode(200)
  @OpenAPI({summary: 'Get all user names'})
  async getUserDetails(
    @Params() params: {email: string},
  ): Promise<GetUserByEmailType | null> {
    const {email} = params;
    const result = await this.userService.getUserByEmail(email);
    return {isBlocked:result.isBlocked}
  }
}
