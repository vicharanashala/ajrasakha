import { BaseService, INotification, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject, injectable } from 'inversify';
import { ClientSession, ObjectId } from 'mongodb';
import { INotificationRepository } from '#root/shared/database/interfaces/INotificationRepository.js';
import {
  AddPushSubscriptionBody,
  NotificationResponse,
} from '#root/modules/notification/validators/NotificationValidators.js';
import { BadRequestError, ForbiddenError, NotFoundError } from 'routing-controllers';
import {
  notifyUser,
  sendPushNotification,
} from '#root/utils/pushNotification.js';
import { buildEmailTemplate } from '#root/utils/buildEmailTemplate.js';
import { sendEmailNotification } from '#root/utils/mailer.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { IQuestionSubmissionRepository } from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { AnnamDatabase } from '#root/shared/database/providers/mongo/AnnamDatabase.js';
import { IUser } from '#root/shared/interfaces/models.js';

type AnnamUser = {
  _id?: ObjectId | string;
  name?: string;
  email?: string;
  firebaseUID?: string;
  userRole?: string;
  farmerProfile?: {
    district?: string;
    blockName?: string;
    villageName?: string;
  };
  assignedTo?: ObjectId | string | null;
  assignedCoordinators?: Array<ObjectId | string>;
};

type BulkUserNotificationResult = {
  targetUserId: string;
  insertedId?: string;
  success: boolean;
  error?: string;
};

@injectable()
export class NotificationService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.NotificationRepository)
    private readonly notificationRepository: INotificationRepository,
    // @inject(GLOBAL_TYPES.UserRepository)
    // private readonly userRepo: IUserRepository,

    // @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    // private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    // @inject(GLOBAL_TYPES.QuestionRepository)
    // private readonly questionRepo: IQuestionRepository,
    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
    @inject(GLOBAL_TYPES.annamanalyticsDatabase)
    private readonly annamDatabase?: AnnamDatabase,
  ) {
    super(mongoDatabase);
  }

  async addNotification(
    userId: string,
    enitity_id: string,
    type: string,
    message: string,
    title: string,
  ): Promise<{ insertedId: string }> {
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

  async getDashboardUserNotifications(
    targetUserId: string,
    page: number,
    limit: number,
  ): Promise<{
    notifications: NotificationResponse[];
    page: number;
    totalCount: number;
    totalPages: number;
  }> {
    const receiver = await this.resolveReviewUserFromDashboardUser(targetUserId);
    return this._withTransaction(async (session: ClientSession) => {
      return await this.notificationRepository.getUserNotificationHistory(
        receiver._id!.toString(),
        page,
        limit,
        session,
      );
    });
  }

  async sendUserNotification(
    targetUserId: string,
    currentUser: IUser,
    message: string,
    title?: string,
  ): Promise<{ insertedId: string }> {
    const cleanMessage = message?.trim();
    const senderName =
      [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ').trim() ||
      currentUser?.email;
    const defaultTitle = senderName
      ? `Message from ${senderName}`
      : 'Message';
    const cleanTitle = title?.trim() || defaultTitle;

    if (!targetUserId || !ObjectId.isValid(targetUserId)) {
      throw new BadRequestError('Invalid target user id');
    }
    if (!cleanMessage) {
      throw new BadRequestError('Message is required');
    }
    if (!currentUser?._id || !ObjectId.isValid(String(currentUser._id))) {
      throw new BadRequestError('Invalid sender user id');
    }

    const {targetAnnamUser, annamUsers, receiver} =
      await this.resolveDashboardAndReviewUsers(targetUserId);

    if (currentUser.role !== 'admin') {
      const currentUserEmail = currentUser.email?.trim();
      if (!currentUserEmail) {
        throw new ForbiddenError('Coordinator email is required');
      }

      const coordinatorAnnamUser = await annamUsers.findOne({
        email: new RegExp(`^${this.escapeRegex(currentUserEmail)}$`, 'i'),
      });

      if (!coordinatorAnnamUser?._id) {
        throw new ForbiddenError('Coordinator dashboard profile not found');
      }

      this.assertNotificationWithinHierarchy(
        coordinatorAnnamUser,
        targetAnnamUser,
      );

      const coordinatorId = coordinatorAnnamUser._id.toString();
      const targetId = targetAnnamUser._id?.toString();
      const targetAssignedTo = targetAnnamUser.assignedTo?.toString();
      const coordinatorAssignedUsers =
        coordinatorAnnamUser.assignedCoordinators?.map(id => id.toString()) ?? [];

      if (
        !targetId ||
        (targetAssignedTo !== coordinatorId &&
          !coordinatorAssignedUsers.includes(targetId))
      ) {
        throw new ForbiddenError(
          'Coordinators can only notify users assigned to them',
        );
      }
    }

    const receiverId = receiver._id!.toString();
    const senderId = currentUser._id.toString();

    const result = await this.addNotification(
      receiverId,
      senderId,
      'coordinator_message',
      cleanMessage,
      cleanTitle,
    );

    const subscription =
      await this.notificationRepository.getSubscriptionByUserId(receiverId);
    await notifyUser(receiverId, cleanMessage, subscription, async (endpoint: string) => {
      await this.deleteExpiredSubscriptionForUser(endpoint);
    }, cleanTitle);

    return result;
  }

  async sendBulkUserNotifications(
    targetUserIds: string[],
    currentUser: IUser,
    message: string,
    title?: string,
  ): Promise<{
    sentCount: number;
    failedCount: number;
    results: BulkUserNotificationResult[];
  }> {
    const uniqueTargetUserIds = [
      ...new Set((targetUserIds ?? []).map(id => String(id).trim()).filter(Boolean)),
    ];

    if (uniqueTargetUserIds.length === 0) {
      throw new BadRequestError('At least one target user id is required');
    }

    const results: BulkUserNotificationResult[] = [];

    for (const targetUserId of uniqueTargetUserIds) {
      try {
        const result = await this.sendUserNotification(
          targetUserId,
          currentUser,
          message,
          title,
        );
        results.push({
          targetUserId,
          insertedId: result.insertedId,
          success: true,
        });
      } catch (error: any) {
        results.push({
          targetUserId,
          success: false,
          error: error?.message || 'Failed to send notification',
        });
      }
    }

    const sentCount = results.filter(result => result.success).length;

    return {
      sentCount,
      failedCount: results.length - sentCount,
      results,
    };
  }

  private async resolveDashboardAndReviewUsers(targetUserId: string) {
    if (!this.annamDatabase) {
      throw new BadRequestError('Annam database is not configured');
    }

    const annamUsers = await this.annamDatabase.getCollection<AnnamUser>('users');
    const targetAnnamUser = await annamUsers.findOne({
      _id: new ObjectId(targetUserId),
    });

    if (!targetAnnamUser) {
      throw new NotFoundError('Target user not found');
    }

    const lookupConditions = [];
    if (targetAnnamUser.email) {
      lookupConditions.push({
        email: new RegExp(`^${this.escapeRegex(targetAnnamUser.email)}$`, 'i'),
      });
    }
    if (targetAnnamUser.firebaseUID) {
      lookupConditions.push({firebaseUID: targetAnnamUser.firebaseUID});
    }

    if (lookupConditions.length === 0) {
      throw new NotFoundError('Target user has no review-system identity');
    }

    const reviewUsers = await this.mongoDatabase.getCollection<IUser>('users');
    const receiver = await reviewUsers.findOne({$or: lookupConditions});
    if (!receiver?._id) {
      throw new NotFoundError('Notification receiver not found');
    }

    return {targetAnnamUser, annamUsers, receiver};
  }

  private async resolveReviewUserFromDashboardUser(targetUserId: string) {
    if (!targetUserId || !ObjectId.isValid(targetUserId)) {
      throw new BadRequestError('Invalid target user id');
    }

    return (await this.resolveDashboardAndReviewUsers(targetUserId)).receiver;
  }

  private assertNotificationWithinHierarchy(
    coordinator: AnnamUser,
    target: AnnamUser,
  ) {
    const coordinatorRole = coordinator.userRole;
    const targetRole = target.userRole;
    const targetRoleMap: Record<string, string> = {
      district_coordinator: 'block_coordinator',
      block_coordinator: 'village_volunteer',
      village_volunteer: 'farmer',
    };
    const expectedTargetRole = targetRoleMap[coordinatorRole || ''];

    if (!expectedTargetRole || targetRole !== expectedTargetRole) {
      throw new ForbiddenError(
        'Target user role is outside this coordinator hierarchy',
      );
    }

    const sameDistrict =
      this.normalizeLocation(coordinator.farmerProfile?.district) ===
      this.normalizeLocation(target.farmerProfile?.district);
    const sameBlock =
      this.normalizeLocation(coordinator.farmerProfile?.blockName) ===
      this.normalizeLocation(target.farmerProfile?.blockName);
    const sameVillage =
      this.normalizeLocation(coordinator.farmerProfile?.villageName) ===
      this.normalizeLocation(target.farmerProfile?.villageName);

    if (coordinatorRole === 'district_coordinator' && !sameDistrict) {
      throw new ForbiddenError(
        'District coordinators can only notify users in their district',
      );
    }

    if (
      coordinatorRole === 'block_coordinator' &&
      (!sameDistrict || !sameBlock)
    ) {
      throw new ForbiddenError(
        'Block coordinators can only notify users in their block',
      );
    }

    if (
      coordinatorRole === 'village_volunteer' &&
      (!sameDistrict || !sameBlock || !sameVillage)
    ) {
      throw new ForbiddenError(
        'Village volunteers can only notify users in their village',
      );
    }
  }

  async deleteNotifictaion(
    notificationId: string,
  ): Promise<{ deletedCount: number }> {
    return this._withTransaction(async (session: ClientSession) => {
      return await this.notificationRepository.deleteNotification(
        notificationId,
        session,
      );
    });
  }

  async markAsRead(id: string): Promise<{ modifiedCount: number }> {
    return this._withTransaction(async (session: ClientSession) => {
      return await this.notificationRepository.markAsRead(id, session);
    });
  }

  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
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

    await sendPushNotification(subscription.subscription, payload, async (endpoint: string) => {
      await this.deleteExpiredSubscriptionForUser(endpoint);
    });
    // });
  }

  // async saveTheNotifications(
  //   message: string,
  //   title: string,
  //   entityId: string,
  //   userId: string,
  //   type: string,
  //   session?:ClientSession
  // ) {
  //   // return await this._withTransaction(async (session: ClientSession) => {
  //     await this.notificationRepository.addNotification(
  //       userId,
  //       entityId,
  //       type,
  //       message,
  //       title,
  //       session,
  //     );
  //     const subscription =
  //       await this.notificationRepository.getSubscriptionByUserId(userId);
  //     await notifyUser(userId, title, subscription);
  //   // });
  // }

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

    // const [user, subscription, question, questionSubmission] =
    //   await Promise.all([
    //     this.userRepo.findById(userId.toString(), session),
    //     this.notificationRepository.getSubscriptionByUserId(userId),
    //     this.questionRepo.getById(entityId, session),
    //     this.questionSubmissionRepo.getByQuestionId(entityId, session),
    //   ]);

    // const history = questionSubmission?.history || [];

    // const involvedUserIds = [
    //   ...new Set(history.map(h => h.updatedBy?.toString()).filter(Boolean)),
    // ];

    // const allUsers = await this.userRepo.getUsersByIds(
    //   involvedUserIds,
    //   session,
    // );

    // const html = buildEmailTemplate(
    //   type,
    //   user,
    //   question,
    //   history,
    //   title,
    //   message,
    //   allUsers,
    // );
    const subscription =
      await this.notificationRepository.getSubscriptionByUserId(userId);
    // await sendEmailNotification(user.email.toString(), title, message, html);
    await notifyUser(userId, title, subscription, async (endpoint: string) => {
      await this.deleteExpiredSubscriptionForUser(endpoint)
    });
    // });
  }

  async deleteExpiredSubscriptionForUser(endpoint: string) {
    return this._withTransaction(async (session: ClientSession) => {
      return await this.notificationRepository.deleteExpiredSubscriptionForUser(endpoint, session);
    });
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizeLocation(value?: string) {
    return (value || '').trim().toLowerCase();
  }
  async deleteExpiredSubscriptions() {
    return this._withTransaction(async (session: ClientSession) => {
      return await this.notificationRepository.deleteExpiredSubscriptions(session);
    });
  }
}
