import {INotification, INotificationType} from '#root/shared/interfaces/models.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import {ClientSession, Collection, ObjectId} from 'mongodb';
import {MongoDatabase} from '../MongoDatabase.js';
import {isValidObjectId} from '#root/utils/isValidObjectId.js';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import { INotificationRepository } from '#root/shared/database/interfaces/INotificationRepository.js';
import { NotificationResponse } from '#root/modules/core/classes/validators/NotificationValidators.js';

export class NotificationRepository implements INotificationRepository {
  private notificationCollection: Collection<INotification>;

  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.notificationCollection = await this.db.getCollection<INotification>('notifications');
  }

  async addNotification(userId: string, enitity_id: string, type: string, message: string, session?: ClientSession): Promise<{ insertedId: string; }> {
    try {
      await this.init();

      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }
      if (!enitity_id || !isValidObjectId(enitity_id)) {
        throw new BadRequestError('Invalid or missing entityId');
      }
      if (!type) {
        throw new BadRequestError('Type is Required');
      }
      if (!message || typeof message !== 'string') {
        throw new BadRequestError('Answer must be a non-empty string');
      }
      const doc: INotification = {
        userId: new ObjectId(userId),
        enitity_id:new ObjectId(enitity_id),
        type: type as INotificationType,
        message,
        is_read:false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      const result = await this.notificationCollection.insertOne(doc,{session})
      return {insertedId: result.insertedId.toString()};
    } catch (error) {
      throw new InternalServerError(
        `Error while adding Notification, More/ ${error}`,
      );
    }
  }

  async getNotifications(userId: string, session?: ClientSession): Promise<NotificationResponse | null> {
    try {
      await this.init()
      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }
      const notification = await this.notificationCollection.findOne({userId: new ObjectId(userId)},{session})
      if (!notification) return null;

    // Convert ObjectId → string
    const response: NotificationResponse= {
      _id: notification._id?.toString() ?? "",
      userId: notification.userId?.toString() ?? "",
      enitity_id: notification.enitity_id?.toString() ?? "",
      message: notification.message,
      is_read: notification.is_read,
      createdAt: notification.createdAt.toString(),
      updatedAt: notification.updatedAt.toString()
    };

    return response;
  }
  catch(error){
    throw new InternalServerError(
        `Error while adding Notification, More/ ${error}`,
      );
  }
}
}