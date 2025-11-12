import {BaseService, INotification, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {
  AddPushSubscriptionBody,
  NotificationResponse,
} from '../classes/validators/NotificationValidators.js';
import {NotFoundError} from 'routing-controllers';
import {
  notifyUser,
  sendPushNotification,
} from '#root/utils/pushNotification.js';
import {sendEmailNotification} from '#root/utils/mailer.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { IQuestionSubmissionRepository } from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import { buildEmailTemplate } from '../utils/buildEmailTemplate.js';

@injectable()
export class NotificationService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.NotificationRepository)
    private readonly notificationRepository: INotificationRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async addNotification(
    userId: string,
    enitity_id: string,
    type: string,
    message: string,
    title: string,
  ): Promise<{insertedId: string}> {
    return this._withTransaction(async (session: ClientSession) => {
      return await this.notificationRepository.addNotification(
        userId,
        enitity_id,
        type,
        message,
        title,
        session,
      );
    });
  }

  async getNotifications(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{
    notifications: NotificationResponse[];
    page: number;
    totalCount: number;
    totalPages: number;
  }> {
    return this._withTransaction(async (session: ClientSession) => {
      return await this.notificationRepository.getNotifications(
        userId,
        page,
        limit,
        session,
      );
    });
  }

  async deleteNotifictaion(
    notificationId: string,
  ): Promise<{deletedCount: number}> {
    return this._withTransaction(async (session: ClientSession) => {
      return await this.notificationRepository.deleteNotification(
        notificationId,
        session,
      );
    });
  }

  async markAsRead(id: string): Promise<{modifiedCount: number}> {
    return this._withTransaction(async (session: ClientSession) => {
      return await this.notificationRepository.markAsRead(id, session);
    });
  }

  async markAllAsRead(userId: string): Promise<{modifiedCount: number}> {
    return this._withTransaction(async (session: ClientSession) => {
      return await this.notificationRepository.markAllAsRead(userId, session);
    });
  }

  async saveSubscription(userId: string, subscription: any) {
    // return this._withTransaction(async (session: ClientSession) => {
    return await this.notificationRepository.saveSubscription(
      userId,
      subscription,
      // session,
    );
    // });
  }

  async sendNotifications(userId: string, message: string) {
    // return this._withTransaction(async (session: ClientSession) => {
    if (!userId || !message) {
      throw new Error('Fields are required');
    }

    const subscription =
      await this.notificationRepository.getSubscriptionByUserId(userId);
    if (!subscription) {
      throw new NotFoundError('Subscription is not found');
    }

    const payload = {
      title: 'Notification',
      body: message,
      url: '/notifications',
    };

    await sendPushNotification(subscription.subscription, payload);
    // });
  }

  async saveTheNotifications(
    message: string,
    title: string,
    entityId: string,
    userId: string,
    type: string,
    session?: ClientSession,
  ) {
    // return await this._withTransaction(async (session: ClientSession) => {
    await this.notificationRepository.addNotification(
      userId,
      entityId,
      type,
      message,
      title,
      session,
    );
    // const user = await this.userRepo.findById(userId.toString(), session);
    // const subscription =
    //   await this.notificationRepository.getSubscriptionByUserId(userId);

    const [user, subscription, question, questionSubmission] =
      await Promise.all([
        this.userRepo.findById(userId.toString(), session),
        this.notificationRepository.getSubscriptionByUserId(userId),
        this.questionRepo.getById(entityId, session),
        this.questionSubmissionRepo.getByQuestionId(entityId, session),
      ]);

    const history = questionSubmission?.history || [];

    const involvedUserIds = [
      ...new Set(history.map(h => h.updatedBy?.toString()).filter(Boolean)),
    ];

    const allUsers = await this.userRepo
      .getUsersByIds(involvedUserIds, session)

    const html = buildEmailTemplate(
      type,
      user,
      question,
      history,
      title,
      message,
      allUsers,
    );

    await sendEmailNotification(user.email.toString(), title, message, html);
    await notifyUser(userId, title, subscription);
    // });
  }
}
