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
  QueryParams,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IUser} from '#root/shared/interfaces/models.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {UserService} from '../services/UserService.js';
import {UsersNameResponseDto} from '../classes/validators/UserValidators.js';

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
    return await this.userService.getAllUserNames(userId);
  }

  @Get('/')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get All Users'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getAllUsers( @QueryParams() query: {page?: number; limit?: number; filter?:string; search?:string},): Promise<IUser[]> {
    const page = Number(query.page) ?? 1;
    const limit = Number(query.limit) ?? 10;
    const filter = query.filter ?? 'all';
    const search = query.search ?? '';
    const user = await this.userService.getAllUsers(page,limit,filter,search)
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

}
