import { BaseService, INotification, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject, injectable } from 'inversify';
import { ClientSession, ObjectId } from 'mongodb';
import { INotificationRepository } from '#root/shared/database/interfaces/INotificationRepository.js';
import {
  AddPushSubscriptionBody,
  NotificationResponse,
  PopNotificationEventBody,
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
import axios from 'axios';
import { faqPopConfig } from '#root/config/faqPop.js';

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
    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

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
    userRole?: string,
  ): Promise<{
    notifications: NotificationResponse[];
    page: number;
    totalCount: number;
    totalPages: number;
  }> {
    return this._withTransaction(async (session: ClientSession) => {
      const result = await this.notificationRepository.getNotifications(
        userId,
        page,
        limit,
        session,
      );

      // Filter out question status notifications for call_agent role
      if (userRole === 'call_agent') {
        const questionStatusTypes = [
          'answer_creation',
          'peer_review',
          're-routed',
          'question_from_whatsapp',
          'question_from_ajrasakha',
          'question_delayed',
          'moderator_approval',
          'review_rejected',
          'review_modified',
          're-routed-answer-created',
          're-routed-rejected-expert',
          're-routed-rejected-moderator'
        ];
        
        const filteredNotifications = result.notifications.filter(
          (n) => !questionStatusTypes.includes(n.type)
        );
        
        return {
          ...result,
          notifications: filteredNotifications,
          totalCount: filteredNotifications.length,
          totalPages: Math.ceil(filteredNotifications.length / limit)
        };
      }

      return result;
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
    url?: string,
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
    }, undefined, url);
    // });
  }

  // PoP upload-queue notifications. The queue itself (upload/approve/decline/add-to-db) lives in
  // the external POP microservice, so this is only ever called by the frontend right after one of
  // those actions succeeds there — it can't be triggered from inside this backend. `entityId` on
  // saveTheNotifications is always the triggering user's own id (loosely used as a "related
  // entity" elsewhere in this file too) since PoP queue item ids aren't guaranteed to be valid
  // Mongo ObjectIds.
  // GET /dashboard/user-management/upload on the POP microservice is admin-only (`is_admin`,
  // see DataProcessingDashboard.tsx) — fine when an admin declines (admin_rejected), but
  // upload_created is fired by the uploader, who gets a 403 calling it themselves (confirmed via
  // the browser's network tab: the frontend's own getUserManagementList("upload") call 403s for
  // that role, silently swallowed by its .catch(() => {}), so approverIds never reaches here and
  // no notification is ever created). This backend is a trusted caller POP already proxies
  // production traffic for, so it fetches the list itself with an elevated role header instead of
  // depending on the triggering user's own permissions — the same shift `approved` already made by
  // resolving admins via userRepo.findAdmins() instead of asking the frontend for them.
  // POP 401s this without BOTH headers — X-User-Role alone isn't enough ("X-User-Id header is
  // required -- send the signed-in user's id"). It doesn't validate the id belongs to an actual
  // admin (confirmed: a bogus ObjectId with X-User-Role: admin still returns 200), so the actor's
  // own id is fine here — it's never exposed back to them, only used to satisfy this check.
  private async fetchPopApproverIds(actorId: string): Promise<string[]> {
    if (!faqPopConfig.popApiUrl) return [];
    try {
      const res = await axios.get(`${faqPopConfig.popApiUrl}/dashboard/user-management/upload`, {
        headers: { 'X-User-Role': 'admin', 'X-User-Id': actorId },
      });
      const entries = Array.isArray(res.data) ? res.data : [];
      return entries.map((e: { user_id?: string }) => e.user_id).filter((id: unknown): id is string => Boolean(id));
    } catch (err) {
      console.error('[NotificationService] Failed to fetch PoP approvers list', err);
      return [];
    }
  }

  async notifyPopEvent(event: PopNotificationEventBody, currentUser: IUser) {
    const actorId = currentUser._id.toString();
    // Deep-links the push notification (and, same URL shape the in-app bell already navigates to
    // on click) straight to the PoP upload queue, instead of the dead '/notifications' page.
    // TanStack Router's default search codec JSON-encodes each value (confirmed: this app passes
    // no custom parseSearch/stringifySearch to createRouter in main.tsx, so it's on the default),
    // so a bare `popQueue=1` parses back as the NUMBER 1, failing the route's `z.string()` schema
    // with "expected string, received number" — exactly what clicking this URL from the OS-level
    // push notification hit. `%221%22` is `encodeURIComponent('"1"')`, the same form the in-app
    // navigate() produces, which JSON.parses back to the STRING "1".
    const popQueueUrl = '/home?popQueue=%221%22';
    // De-duped here (not just trusted to each caller below) because it's the one place that
    // actually decides who gets pushed to — e.g. admin_added's uploaderId and approverId collapse
    // to the same person when an approver approves their own upload, and relying on every call
    // site to catch that itself is how this doubled up before.
    const notifyAll = (userIds: string[], title: string, message: string, type: string) =>
      Promise.all(
        [...new Set(userIds)]
          .filter(id => id && id !== actorId)
          .map(userId => this.saveTheNotifications(message, title, actorId, userId, type, undefined, popQueueUrl)),
      );

    switch (event.type) {
      case 'upload_created': {
        const approverIds = event.approverIds?.length ? event.approverIds : await this.fetchPopApproverIds(actorId);
        // routing-controllers' ExpressDriver throws its own NotFoundError whenever a controller
        // action resolves to `undefined` — a bare `return;` here (no recipients to notify) was
        // masquerading as an HTTP 404, even though @HttpCode(201) is set on the route. Returning
        // an empty array instead of undefined keeps "nobody to notify" a genuine no-op response.
        if (!approverIds.length) return [];
        return notifyAll(
          approverIds,
          'New PoP document awaiting approval',
          `"${event.itemName}" was uploaded and needs your approval.`,
          'pop_pending_approval',
        );
      }
      case 'approved': {
        const admins = await this.userRepo.findAdmins();
        return notifyAll(
          admins.map(a => a._id.toString()),
          'PoP document awaiting admin review',
          `"${event.itemName}" was approved and needs your review.`,
          'pop_pending_admin_review',
        );
      }
      case 'admin_rejected': {
        const approverIds = event.approverIds?.length ? event.approverIds : await this.fetchPopApproverIds(actorId);
        if (!approverIds.length) return [];
        return notifyAll(
          approverIds,
          'PoP document rejected',
          `"${event.itemName}" was rejected by the admin.`,
          'pop_upload_rejected',
        );
      }
      case 'approver_rejected': {
        if (!event.uploaderId) return [];
        return notifyAll(
          [event.uploaderId],
          'PoP document rejected',
          `"${event.itemName}" was rejected by the approver.`,
          'pop_upload_rejected',
        );
      }
      case 'admin_added': {
        const recipients = [event.uploaderId, event.approverId].filter(Boolean) as string[];
        if (!recipients.length) return [];
        return notifyAll(
          recipients,
          'PoP document published',
          `"${event.itemName}" was added to the document database.`,
          'pop_document_published',
        );
      }
    }
    // An unrecognized event.type falls through here — same undefined-return-becomes-404 pitfall
    // as the guards above.
    return [];
  }

  // Fired once a GridFS-queued PoP upload (backend/src/modules/popUploads) actually reaches PoP's
  // own upload queue — not at intake time, since the uploader's queue item doesn't exist yet
  // while the file is still sitting in GridFS waiting for the background forward (see
  // PopUploadsService.forwardOne). Unlike every other PoP notification, there's exactly one
  // recipient (the uploader) and no acting "current user" to exclude — this fires from a
  // background job, not an HTTP request.
  async notifyPopUploadQueued(uploaderId: string, itemName: string) {
    return this.saveTheNotifications(
      `"${itemName}" is now in your PoP upload queue.`,
      'PoP upload queued',
      uploaderId,
      uploaderId,
      'pop_upload_queued',
      undefined,
      '/home?popQueue=%221%22',
    );
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
