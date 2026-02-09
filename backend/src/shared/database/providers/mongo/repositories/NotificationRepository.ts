import {INotification, INotificationType, ISubscription, IUser} from '#root/shared/interfaces/models.js';
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
  private subscriptionCollection: Collection<ISubscription>
  private userCollection:Collection<IUser>
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private db: MongoDatabase,
  ) {}

  private async init() {
    this.notificationCollection = await this.db.getCollection<INotification>('notifications');
    this.subscriptionCollection = await this.db.getCollection<ISubscription>('subscriptions');
    this.userCollection = await this.db.getCollection<IUser>('users')
  }

  async addNotification(userId: string, enitity_id: string, type: string, message: string,title:string, session?: ClientSession): Promise<{ insertedId: string; }> {
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
        title,
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

  async getNotifications(userId: string,page:number,limit:number,session?: ClientSession): Promise<{notifications:NotificationResponse[]; page:number; totalCount:number; totalPages:number}> {
    try {
      await this.init()
      if (!userId || !isValidObjectId(userId)) {
        throw new BadRequestError('Invalid or missing userId');
      }
      const skip = (page - 1) * limit
      // const notification = await this.notificationCollection.findOne({userId: new ObjectId(userId)},{session})
      const [notification,totalCount] = await Promise.all([
        this.notificationCollection.find({userId: new ObjectId(userId)},{session}).sort({createdAt:-1}).skip(skip).limit(limit).toArray(),
        this.notificationCollection.countDocuments({userId: new ObjectId(userId)})
      ])
      if (!notification) return null;

      // Convert ObjectId → string

      const response = notification.map((n) => ({
        _id:n._id.toString(),
        enitity_id:n.enitity_id.toString(),
        message:n.message,
        is_read:n.is_read,
        title:n.title,
        type: n.type,
        createdAt:n.createdAt.toString()
      }))

    return {notifications:response,page,totalCount,totalPages:Math.ceil(totalCount/limit)}
    }
  catch(error){
      throw new InternalServerError(
        `Error while adding Notification, More/ ${error}`,
      );
    }
  }

async getNotificationsCount(userId: string,session?:ClientSession): Promise<number> {
    try {
      await this.init()
    const notifications = await this.notificationCollection.countDocuments({userId:new ObjectId(userId),is_read:false},{session})
      return notifications
    } catch (error) {
      throw new InternalServerError(
        `Error while getting Notification, More/ ${error}`,
      );
    }
  }

async deleteNotification(notificationId: string, session: ClientSession): Promise<{deletedCount: number}> {
    try {
      await this.init()
      if (!notificationId || !isValidObjectId(notificationId)) {
        throw new BadRequestError('Invalid or missing NotificationId');
      }
      const result =await this.notificationCollection.deleteOne({_id: new ObjectId(notificationId)},{session})
      return result
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting Notification, More/ ${error}`,
      );
    }
  }

async markAsRead(notificationId: string,session?:ClientSession): Promise<{modifiedCount: number}> {
    try {
      await this.init()
      if (!notificationId || !isValidObjectId(notificationId)) {
        throw new BadRequestError('Invalid or missing NotificationId');
      }
    const result= await this.notificationCollection.updateOne({_id:new ObjectId(notificationId)},{$set:{is_read:true}},{session})
      return result
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting Notification, More/ ${error}`,
      );
    }
  }

async markAllAsRead(userId:string,session?:ClientSession): Promise<{modifiedCount: number}> {
    try {
      await this.init()
    const result= await this.notificationCollection.updateMany({userId:new ObjectId(userId)},{$set:{is_read:true}},{session})
      return result
    } catch (error) {
      throw new InternalServerError(
        `Error while deleting Notification, More/ ${error}`,
      );
    }
  }

async saveSubscription(userId: string, subscription: any,session?:ClientSession) {
    try {
      await this.init()
      const expirytime = subscription.expirationTime || null;
      return await this.subscriptionCollection.findOneAndUpdate(
        { userId: new ObjectId(userId) },
        { $set:{userId: new ObjectId(userId),subscription:subscription, expirytime: expirytime } },{upsert: true}
      );
    } catch (error) {
      throw new InternalServerError(
        `Error while saving subscription, More/ ${error}`,
      );
    }
  }

  async getSubscriptionByUserId(userId: string) {
    await this.init()
    return this.subscriptionCollection.findOne({ userId: new ObjectId(userId) })
  }

  async autoDeleteNotifications(){
    await this.init()
    try {
      const retentionPeriods = {
        "3d": 3,
        "1w": 7,
        "2w": 14,
        "1m": 30,
        "never": null,
      };
      const users = await this.userCollection.find().toArray()
    for(const user of users){
        const retention = user.notificationRetention || 'never'
      const days =retentionPeriods[retention]
      if(!days){
          // console.log(`Skipping user ${user._id} (retention: never)`);
          continue;
        }
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60  *1000)
      const result =await this.notificationCollection.deleteMany({
        userId:new ObjectId(user._id),
        createdAt:{$lt:cutoff},
        })
        console.log(
          `Deleted ${result.deletedCount} notifications for user ${user._id} older than ${days} days.`
        );
      }
      console.log("✅ Notification cleanup complete.");
    } catch (error) {
      throw new InternalServerError(
        "Error In Cleanup"
      )
    }
  }
}