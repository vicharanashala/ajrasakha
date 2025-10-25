import {BaseService, INotification, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import { INotificationRepository } from '#root/shared/database/interfaces/INotificationRepository.js';
import { NotificationResponse } from '../classes/validators/NotificationValidators.js';

@injectable()
export class NotificationService extends BaseService {
  constructor(

    @inject(GLOBAL_TYPES.NotificationRepository)
    private readonly notificationRepository: INotificationRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }



  async addNotification(userId: string, enitity_id: string, type: string, message: string):Promise<{insertedId:string}>  {
    return this._withTransaction(async (session:ClientSession) => {
      return await this.notificationRepository.addNotification(userId,enitity_id,type,message,session)
    })
  }

  async getNotifications(userId:string,page:number,limit:number):Promise<{notifications:NotificationResponse[]; page:number; totalCount:number; totalPages:number}>{
    return this._withTransaction(async (session:ClientSession) => {
      return await this.notificationRepository.getNotifications(userId,page,limit,session)
    })
  }
}