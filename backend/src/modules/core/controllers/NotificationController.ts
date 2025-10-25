import 'reflect-metadata';
import {
  JsonController,
  Post,
  Body,
  HttpCode,
  CurrentUser,
  Authorized,
  Get,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {IUser} from '#root/shared/interfaces/models.js';
import { AddNotificationBody, NotificationResponse } from '../classes/validators/NotificationValidators.js';
import { NotificationService } from '../services/NotificationService.js';

@OpenAPI({
  tags: ['Notifications'],
  description: 'Operations related to answers',
})
@JsonController('/notifications')
export class NotificationController {
  constructor(
    @inject(GLOBAL_TYPES.NotificationService)
    private readonly notificationService : NotificationService
  ) {}

  @OpenAPI({summary: 'Add a new notification to a user'})
  @Post('/')
  @HttpCode(201)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async addAnswer(@Body() body: AddNotificationBody, @CurrentUser() user: IUser) {
    const {entityId, type, message} = body;
    const userId = user._id.toString();
    return this.notificationService.addNotification(userId, entityId, type, message);
  }

   @OpenAPI({summary: 'Add a new notification to a user'})
  @Get('/')
  @HttpCode(201)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getNotifications( @CurrentUser() user: IUser):Promise<NotificationResponse> {
    const userId = user._id.toString();
    return this.notificationService.getNotifications(userId)
  }
}