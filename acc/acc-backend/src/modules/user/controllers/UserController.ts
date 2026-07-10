import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Put,
  Body,
  HttpCode,
  Param,
  Authorized,
  CurrentUser,
  NotFoundError,
  Patch,
  BadRequestError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { UserService } from '../services/UserService.js';
import type { IUser } from '#shared/interfaces/models.js';

@OpenAPI({
  tags: ['users'],
  description: 'Operations for managing call agent users',
})
@injectable()
@JsonController('/users')
export class UserController {
  constructor(
    @inject(GLOBAL_TYPES.UserService) private readonly userService: UserService,
  ) {}

  @Get('/me')
  @HttpCode(200)
  @Authorized()
  async getMe(@CurrentUser() currentUser: IUser): Promise<IUser> {
    const userId = currentUser._id.toString();
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  @Get('/call-agents')
  @HttpCode(200)
  @Authorized(['admin'])
  async getCallAgents(): Promise<IUser[]> {
    return await this.userService.getCallAgents();
  }

  @Post('/set-call-agents')
  @HttpCode(200)
  @Authorized(['admin'])
  async setCallAgentStatus(
    @Body() body: { userId: string; isCallAgent: boolean; isCallAgentActive: boolean },
    @CurrentUser() currentUser: IUser,
  ): Promise<IUser> {
    const { userId, isCallAgent, isCallAgentActive } = body;
    return await this.userService.setCallAgentStatus(userId, isCallAgent, isCallAgentActive, currentUser.role);
  }

  @Patch('/call-agents/:id/toggle-active')
  @HttpCode(200)
  @Authorized(['admin'])
  async toggleCallAgentActive(
    @Param('id') userId: string,
    @CurrentUser() currentUser: IUser,
  ): Promise<IUser> {
    return await this.userService.toggleCallAgentActive(userId, currentUser.role);
  }

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

  @Put('/')
  @HttpCode(200)
  @Authorized()
  async updateUser(
    @Body() body: any,
    @CurrentUser() currentUser: IUser,
  ): Promise<IUser> {
    const userId = currentUser._id.toString();
    const updatedUser = await this.userService.updateUser(userId, body);
    if (!updatedUser) {
      throw new NotFoundError('User not found');
    }
    return updatedUser;
  }
}
