import 'reflect-metadata';
import {
  JsonController,
  Post,
  Body,
  HttpCode,
  CurrentUser,
  Authorized,
  Get,
  QueryParams,
  Delete,
  Params,
  Patch,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {IUser} from '#root/shared/interfaces/models.js';
import { AddNotificationBody, DeleteNotificationParams, NotificationResponse } from '../classes/validators/NotificationValidators.js';
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
    const {entityId, type, message,title} = body;
    const userId = user._id.toString();
    return this.notificationService.addNotification(userId, entityId, type, message,title);
  }

   @OpenAPI({summary: 'Get all notification of a user'})
  @Get('/')
  @HttpCode(201)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getNotifications(@QueryParams() query: {page?: number; limit?: number}, @CurrentUser() user: IUser) {
    const page = Number(query.page) ?? 1;
    const limit = Number(query.limit) ?? 10;
    const userId = user._id.toString();
    return this.notificationService.getNotifications(userId,page,limit)
  }

  @OpenAPI({summary: 'Delete a notification'})
    @Delete('/:notificationId')
    @HttpCode(200)
    @Authorized()
    @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
    async deleteAnswer(@Params() params: DeleteNotificationParams) {
      const {notificationId} = params;
      console.log("noti params ",notificationId)
      return this.notificationService.deleteNotifictaion(notificationId)
    }

  @OpenAPI({summary: 'Mark notification as read'})
  @Patch('/:notificationId')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async markAsRead(
    @Params() params: DeleteNotificationParams,
  ) {
    const {notificationId} = params;
    return this.notificationService.markAsRead(notificationId)
  }

  @OpenAPI({summary: 'Mark notification as read'})
  @Patch('/')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async markAllAsRead(@CurrentUser() user: IUser
  ) {
    console.log('reached all')
    const userId = user._id.toString()
    return this.notificationService.markAllAsRead(userId)
  }
}