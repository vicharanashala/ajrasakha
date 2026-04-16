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
import { AddNotificationBody, AddPushSubscriptionBody, DeleteNotificationParams, MessageBody, NotificationResponse } from '../classes/validators/NotificationValidators.js';
import { NotificationService } from '../services/NotificationService.js';
import {
  NotificationErrorResponse,
  InsertedIdResponse,
  PaginatedNotificationsResponse,
  DeletedCountResponse,
  ModifiedCountResponse,
  SuccessMessageResponse,
} from '../classes/validators/NotificationResponseValidators.js';

@OpenAPI({
  tags: ['Notifications'],
  description: 'Operations for managing notifications',
})
@JsonController('/notifications')
export class NotificationController {
  constructor(
    @inject(GLOBAL_TYPES.NotificationService)
    private readonly notificationService : NotificationService
  ) {}

  @OpenAPI({
    summary: 'Add a new notification to a user',
    description: 'Creates a new notification for the current user with entity reference, type, message, and title.',
  })
  @ResponseSchema(InsertedIdResponse, {
    statusCode: 201,
    description: 'Notification created successfully - Returns the inserted notification ID',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid notification data',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to create notification',
  })
  @Post('/')
  @HttpCode(201)
  @Authorized()
  async addAnswer(@Body() body: AddNotificationBody, @CurrentUser() user: IUser) {
    const {entityId, type, message,title} = body;
    const userId = user._id.toString();
    return this.notificationService.addNotification(userId, entityId, type, message,title);
  }

  @OpenAPI({
    summary: 'Get all notifications of a user',
    description: 'Retrieves paginated notifications for the current user with pagination metadata.',
  })
  @ResponseSchema(PaginatedNotificationsResponse, {
    statusCode: 200,
    description: 'Notifications retrieved successfully with pagination info',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch notifications',
  })
  @Get('/')
  @HttpCode(200)
  @Authorized()
  async getNotifications(@QueryParams() query: {page?: number; limit?: number}, @CurrentUser() user: IUser) {
    const page = Number(query.page) ?? 1;
    const limit = Number(query.limit) ?? 10;
    const userId = user._id.toString();
    return this.notificationService.getNotifications(userId,page,limit)
  }

  @OpenAPI({
    summary: 'Delete a notification',
    description: 'Deletes a specific notification by its ID.',
  })
  @ResponseSchema(DeletedCountResponse, {
    statusCode: 200,
    description: 'Notification deleted successfully - Returns the count of deleted documents',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid notification ID format',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 404,
    description: 'Not found - Notification not found',
  })
  @Delete('/:notificationId')
  @HttpCode(200)
  @Authorized()
  async deleteAnswer(@Params() params: DeleteNotificationParams) {
      const {notificationId} = params;
      return this.notificationService.deleteNotifictaion(notificationId)
    }

  @OpenAPI({
    summary: 'Mark notification as read',
    description: 'Marks a specific notification as read by its ID.',
  })
  @ResponseSchema(ModifiedCountResponse, {
    statusCode: 200,
    description: 'Notification marked as read - Returns the count of modified documents',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid notification ID format',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 404,
    description: 'Not found - Notification not found',
  })
  @Patch('/:notificationId')
  @HttpCode(200)
  @Authorized()
  async markAsRead(
    @Params() params: DeleteNotificationParams,
  ) {
    const {notificationId} = params;
    return this.notificationService.markAsRead(notificationId)
  }

  @OpenAPI({
    summary: 'Mark all notifications as read',
    description: 'Marks all notifications for the current user as read.',
  })
  @ResponseSchema(ModifiedCountResponse, {
    statusCode: 200,
    description: 'All notifications marked as read - Returns the count of modified documents',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to mark notifications as read',
  })
  @Patch('/')
  @HttpCode(200)
  @Authorized()
  async markAllAsRead(@CurrentUser() user: IUser) {
    const userId = user._id.toString()
    return this.notificationService.markAllAsRead(userId)
  }

  @OpenAPI({
    summary: 'Save subscription for push notification',
    description: 'Saves a push notification subscription for the current user.',
  })
  @ResponseSchema(SuccessMessageResponse, {
    statusCode: 201,
    description: 'Push subscription saved successfully',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid subscription data',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to save subscription',
  })
  @Post('/subscriptions')
  @HttpCode(201)
  @Authorized()
  async saveSubscription(@Body() body: AddPushSubscriptionBody, @CurrentUser() user: IUser) {
    const {subscription} = body;
    const userId = user._id.toString();
    return this.notificationService.saveSubscription(userId,subscription)
  }

  @OpenAPI({
    summary: 'Send push notification to user',
    description: 'Sends a push notification to the current user.',
  })
  @ResponseSchema(SuccessMessageResponse, {
    statusCode: 201,
    description: 'Push notification sent successfully',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid message or missing fields',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 404,
    description: 'Not found - Subscription not found for user',
  })
  @ResponseSchema(NotificationErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to send notification',
  })
  @Post('/send-notification')
  @HttpCode(201)
  @Authorized()
  async sendNotifications(@Body() body: MessageBody, @CurrentUser() user: IUser) {
    const {message} = body;
    const userId = user._id.toString();
    return this.notificationService.sendNotifications(userId,message)
  }
}