import 'reflect-metadata';
import {
  JsonController,
  Get,
  Put,
  Body,
  HttpCode,
  Params,
  Authorized,
  CurrentUser,
  NotFoundError,
  Patch,
  QueryParams,
  Post,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
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

  @Put('/')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Update user information'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async updateUser(
    @Body() body: Partial<IUser>,
    @CurrentUser() currentUser: IUser,
  ): Promise<IUser> {
    const userId = currentUser._id.toString();
    const updatedUser = await this.userService.updateUser(userId, body);
    if (!updatedUser) {
      throw new NotFoundError('User not found');
    }
    return updatedUser;
  }

  @Get('/all')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get all user names'})
  async getAllUsersName(
    @CurrentUser() user: IUser,
  ): Promise<UsersNameResponseDto> {
    const userId = user._id.toString();
    return await this.userService.getAllUsers(userId);
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
  @OpenAPI({summary: 'Get all users'})
  async getAllUsers(
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

  @Get('/details/:email')
  @HttpCode(200)
  @OpenAPI({summary: 'Get all user names'})
  async getUserDetails(
    @Params() params: {email: string},
  ): Promise<IUser | null> {
    const {email} = params;
    return await this.userService.getUserByEmail(email);
  }

  @Post('/fix-reputation')
  @HttpCode(200)
  // @Authorized() 
  @OpenAPI({summary: 'Recalculate and update reputation score of all experts'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async fixReputationScores(@CurrentUser() user: IUser) {
    // const {_id: userId} = user;

    return await this.userService.recalculateReputationScores(
      // userId.toString(),
      ""
    );
  }
}
