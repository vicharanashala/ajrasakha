import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as pushNotification from '#root/utils/pushNotification.js';
import {NotificationService} from '../services/NotificationService.js';

describe('NotificationService ', () => {
  let service: NotificationService;

  const mockNotificationRepository = {
    addNotification: vi.fn(),
    getNotifications: vi.fn(),
    getUserNotificationHistory: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    saveSubscription: vi.fn(),
    deleteExpiredSubscriptionForUser: vi.fn(),
    deleteExpiredSubscriptions: vi.fn(),
    getSubscriptionByUserId: vi.fn(),
  };

  const mockDatabase = {
    getCollection: vi.fn(),
  };

  const mockAnnamDatabase = {
    getCollection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new NotificationService(
      mockNotificationRepository as any,
      mockDatabase as any,
      mockAnnamDatabase as any,
    );
    vi.mock('#root/utils/pushNotification.js', () => ({
      notifyUser: vi.fn(),
      sendPushNotification: vi.fn(),
    }));

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );
  });

  describe('addNotification', () => {
    it('adds notification successfully', async () => {
      mockNotificationRepository.addNotification.mockResolvedValueOnce({
        insertedId: 'notification-1',
      });

      const result = await service.addNotification(
        'user-1',
        'entity-1',
        'comment',
        'message',
        'title',
      );

      expect(result).toEqual({
        insertedId: 'notification-1',
      });

      expect(mockNotificationRepository.addNotification).toHaveBeenCalledWith(
        'user-1',
        'entity-1',
        'comment',
        'message',
        'title',
        expect.anything(),
      );
    });
  });

  describe('getNotifications', () => {
    it('returns notifications', async () => {
      const response = {
        notifications: [],
        page: 1,
        totalCount: 0,
        totalPages: 0,
      };

      mockNotificationRepository.getNotifications.mockResolvedValueOnce(
        response,
      );

      const result = await service.getNotifications('user-1', 1, 10);

      expect(result).toEqual(response);

      expect(mockNotificationRepository.getNotifications).toHaveBeenCalledWith(
        'user-1',
        1,
        10,
        expect.anything(),
      );
    });
  });

  describe('getDashboardUserNotifications', () => {
    it('returns dashboard notifications', async () => {
      vi.spyOn(
        service as any,
        'resolveReviewUserFromDashboardUser',
      ).mockResolvedValue({
        _id: {
          toString: () => 'review-user-1',
        },
      });

      const response = {
        notifications: [],
        page: 1,
        totalCount: 2,
        totalPages: 1,
      };

      mockNotificationRepository.getUserNotificationHistory.mockResolvedValueOnce(
        response,
      );

      const result = await service.getDashboardUserNotifications(
        'dashboard-user',
        1,
        20,
      );

      expect(result).toEqual(response);

      expect(
        mockNotificationRepository.getUserNotificationHistory,
      ).toHaveBeenCalledWith('review-user-1', 1, 20, expect.anything());
    });
  });

  describe('deleteNotification', () => {
    it('deletes notification', async () => {
      mockNotificationRepository.deleteNotification.mockResolvedValueOnce({
        deletedCount: 1,
      });

      const result = await service.deleteNotifictaion('notification-1');

      expect(result).toEqual({
        deletedCount: 1,
      });

      expect(
        mockNotificationRepository.deleteNotification,
      ).toHaveBeenCalledWith('notification-1', expect.anything());
    });
  });

  describe('markAsRead', () => {
    it('marks notification as read', async () => {
      mockNotificationRepository.markAsRead.mockResolvedValueOnce({
        modifiedCount: 1,
      });

      const result = await service.markAsRead('notification-1');

      expect(result).toEqual({
        modifiedCount: 1,
      });

      expect(mockNotificationRepository.markAsRead).toHaveBeenCalledWith(
        'notification-1',
        expect.anything(),
      );
    });
  });

  describe('markAllAsRead', () => {
    it('marks all notifications as read', async () => {
      mockNotificationRepository.markAllAsRead.mockResolvedValueOnce({
        modifiedCount: 5,
      });

      const result = await service.markAllAsRead('user-1');

      expect(result).toEqual({
        modifiedCount: 5,
      });

      expect(mockNotificationRepository.markAllAsRead).toHaveBeenCalledWith(
        'user-1',
        expect.anything(),
      );
    });
  });

  describe('saveSubscription', () => {
    it('saves subscription', async () => {
      const subscription = {
        endpoint: 'https://endpoint',
      };

      mockNotificationRepository.saveSubscription.mockResolvedValueOnce({
        acknowledged: true,
      });

      await service.saveSubscription('user-1', subscription);

      expect(mockNotificationRepository.saveSubscription).toHaveBeenCalledWith(
        'user-1',
        subscription,
      );
    });
  });

  describe('deleteExpiredSubscriptionForUser', () => {
    it('deletes expired subscription', async () => {
      mockNotificationRepository.deleteExpiredSubscriptionForUser.mockResolvedValueOnce(
        {
          deletedCount: 1,
        },
      );

      const result = await service.deleteExpiredSubscriptionForUser('endpoint');

      expect(result).toEqual({
        deletedCount: 1,
      });

      expect(
        mockNotificationRepository.deleteExpiredSubscriptionForUser,
      ).toHaveBeenCalledWith('endpoint', expect.anything());
    });
  });

  describe('deleteExpiredSubscriptions', () => {
    it('deletes expired subscriptions', async () => {
      mockNotificationRepository.deleteExpiredSubscriptions.mockResolvedValueOnce(
        {
          deletedCount: 4,
        },
      );

      const result = await service.deleteExpiredSubscriptions();

      expect(result).toEqual({
        deletedCount: 4,
      });

      expect(
        mockNotificationRepository.deleteExpiredSubscriptions,
      ).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('sendUserNotification', () => {
    const targetUserId = '507f1f77bcf86cd799439011';
    const senderId = '507f191e810c19729de860ea';

    const adminUser = {
      _id: senderId,
      role: 'admin',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@test.com',
    };

    beforeEach(() => {
      vi.spyOn(
        service as any,
        'resolveDashboardAndReviewUsers',
      ).mockResolvedValue({
        targetAnnamUser: {
          _id: new Object(targetUserId),
        },
        annamUsers: {
          findOne: vi.fn(),
        },
        receiver: {
          _id: {
            toString: () => 'receiver-id',
          },
        },
      });

      vi.spyOn(service as any, 'addNotification').mockResolvedValue({
        insertedId: 'notification-id',
      });

      vi.spyOn(
        service as any,
        'deleteExpiredSubscriptionForUser',
      ).mockResolvedValue(undefined);

      mockNotificationRepository.getSubscriptionByUserId.mockResolvedValue({
        endpoint: 'endpoint',
      });

      vi.mocked(pushNotification.notifyUser).mockResolvedValue(undefined);
    });

    it('sends notification successfully as admin', async () => {
      const result = await service.sendUserNotification(
        targetUserId,
        adminUser as any,
        'Hello',
      );

      expect(result).toEqual({
        insertedId: 'notification-id',
      });

      expect(service.addNotification).toHaveBeenCalledWith(
        'receiver-id',
        senderId,
        'coordinator_message',
        'Hello',
        'Message from John Doe',
      );

      expect(
        mockNotificationRepository.getSubscriptionByUserId,
      ).toHaveBeenCalledWith('receiver-id');

      expect(pushNotification.notifyUser).toHaveBeenCalled();
    });

    it('uses custom title', async () => {
      await service.sendUserNotification(
        targetUserId,
        adminUser as any,
        'Hello',
        'Custom',
      );

      expect(service.addNotification).toHaveBeenCalledWith(
        'receiver-id',
        senderId,
        'coordinator_message',
        'Hello',
        'Custom',
      );
    });

    it('trims message', async () => {
      await service.sendUserNotification(
        targetUserId,
        adminUser as any,
        '  Hello  ',
      );

      expect(service.addNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'Hello',
        expect.anything(),
      );
    });

    it('throws for invalid target user id', async () => {
      await expect(
        service.sendUserNotification('', adminUser as any, 'Hello'),
      ).rejects.toThrow('Invalid target user id');
    });

    it('throws when message is empty', async () => {
      await expect(
        service.sendUserNotification(targetUserId, adminUser as any, ''),
      ).rejects.toThrow('Message is required');
    });

    it('throws when sender id is invalid', async () => {
      await expect(
        service.sendUserNotification(
          targetUserId,
          {
            ...adminUser,
            _id: '',
          } as any,
          'Hello',
        ),
      ).rejects.toThrow('Invalid sender user id');
    });

    it('uses email when first and last name are missing', async () => {
      await service.sendUserNotification(
        targetUserId,
        {
          _id: senderId,
          role: 'admin',
          email: 'abc@test.com',
        } as any,
        'Hello',
      );

      expect(service.addNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'Message from abc@test.com',
      );
    });

    it('uses generic title when neither name nor email exists', async () => {
      await service.sendUserNotification(
        targetUserId,
        {
          _id: senderId,
          role: 'admin',
        } as any,
        'Hello',
      );

      expect(service.addNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'Message',
      );
    });
  });

  describe('sendBulkUserNotifications', () => {
    const currentUser = {
      _id: '507f191e810c19729de860ea',
      role: 'admin',
      email: 'admin@test.com',
    };

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('sends notification to all users successfully', async () => {
      const spy = vi.spyOn(service, 'sendUserNotification').mockResolvedValue({
        insertedId: 'notification-id',
      });

      const result = await service.sendBulkUserNotifications(
        ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
        currentUser as any,
        'Hello',
        'Greetings',
      );

      expect(spy).toHaveBeenCalledTimes(2);

      expect(result).toEqual({
        sentCount: 2,
        failedCount: 0,
        results: [
          {
            targetUserId: '507f1f77bcf86cd799439011',
            insertedId: 'notification-id',
            success: true,
          },
          {
            targetUserId: '507f1f77bcf86cd799439012',
            insertedId: 'notification-id',
            success: true,
          },
        ],
      });
    });

    it('removes duplicate user ids before sending', async () => {
      const spy = vi.spyOn(service, 'sendUserNotification').mockResolvedValue({
        insertedId: 'notification-id',
      });

      await service.sendBulkUserNotifications(
        [
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439012',
        ],
        currentUser as any,
        'Hello',
      );

      expect(spy).toHaveBeenCalledTimes(2);

      expect(spy).toHaveBeenNthCalledWith(
        1,
        '507f1f77bcf86cd799439011',
        currentUser,
        'Hello',
        undefined,
      );

      expect(spy).toHaveBeenNthCalledWith(
        2,
        '507f1f77bcf86cd799439012',
        currentUser,
        'Hello',
        undefined,
      );
    });

    it('ignores empty user ids', async () => {
      const spy = vi.spyOn(service, 'sendUserNotification').mockResolvedValue({
        insertedId: 'notification-id',
      });

      await service.sendBulkUserNotifications(
        ['', '   ', '507f1f77bcf86cd799439011'],
        currentUser as any,
        'Hello',
      );

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('throws when no valid user ids are provided', async () => {
      await expect(
        service.sendBulkUserNotifications([], currentUser as any, 'Hello'),
      ).rejects.toThrow('At least one target user id is required');
    });

    it('throws when all user ids are empty', async () => {
      await expect(
        service.sendBulkUserNotifications(
          ['', ' ', '   '],
          currentUser as any,
          'Hello',
        ),
      ).rejects.toThrow('At least one target user id is required');
    });

    it('continues sending when one notification fails', async () => {
      const spy = vi
        .spyOn(service, 'sendUserNotification')
        .mockResolvedValueOnce({
          insertedId: 'notification-1',
        })
        .mockRejectedValueOnce(new Error('Failed to send'))
        .mockResolvedValueOnce({
          insertedId: 'notification-3',
        });

      const result = await service.sendBulkUserNotifications(
        [
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439013',
        ],
        currentUser as any,
        'Hello',
      );

      expect(spy).toHaveBeenCalledTimes(3);

      expect(result.sentCount).toBe(2);
      expect(result.failedCount).toBe(1);

      expect(result.results).toEqual([
        {
          targetUserId: '507f1f77bcf86cd799439011',
          insertedId: 'notification-1',
          success: true,
        },
        {
          targetUserId: '507f1f77bcf86cd799439012',
          success: false,
          error: 'Failed to send',
        },
        {
          targetUserId: '507f1f77bcf86cd799439013',
          insertedId: 'notification-3',
          success: true,
        },
      ]);
    });

    it('uses default error message when thrown error has no message', async () => {
      vi.spyOn(service, 'sendUserNotification').mockRejectedValue({});

      const result = await service.sendBulkUserNotifications(
        ['507f1f77bcf86cd799439011'],
        currentUser as any,
        'Hello',
      );

      expect(result).toEqual({
        sentCount: 0,
        failedCount: 1,
        results: [
          {
            targetUserId: '507f1f77bcf86cd799439011',
            success: false,
            error: 'Failed to send notification',
          },
        ],
      });
    });

    it('passes custom title to sendUserNotification', async () => {
      const spy = vi.spyOn(service, 'sendUserNotification').mockResolvedValue({
        insertedId: 'notification-id',
      });

      await service.sendBulkUserNotifications(
        ['507f1f77bcf86cd799439011'],
        currentUser as any,
        'Hello',
        'Important',
      );

      expect(spy).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        currentUser,
        'Hello',
        'Important',
      );
    });
  });

  describe('sendNotifications', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      vi.spyOn(
        service as any,
        'deleteExpiredSubscriptionForUser',
      ).mockResolvedValue(undefined);
    });

    it('sends push notification successfully', async () => {
      const subscription = {
        endpoint: 'https://example.com',
        keys: {},
      };

      mockNotificationRepository.getSubscriptionByUserId.mockResolvedValueOnce({
        subscription,
      });

      vi.mocked(pushNotification.sendPushNotification).mockResolvedValueOnce(
        undefined,
      );

      await service.sendNotifications('user-1', 'Hello');

      expect(
        mockNotificationRepository.getSubscriptionByUserId,
      ).toHaveBeenCalledWith('user-1');

      expect(pushNotification.sendPushNotification).toHaveBeenCalledWith(
        subscription,
        {
          title: 'Notification',
          body: 'Hello',
          url: '/notifications',
        },
        expect.any(Function),
      );
    });

    it('throws when userId is missing', async () => {
      await expect(service.sendNotifications('', 'Hello')).rejects.toThrow(
        'Fields are required',
      );
    });

    it('throws when message is missing', async () => {
      await expect(service.sendNotifications('user-1', '')).rejects.toThrow(
        'Fields are required',
      );
    });

    it('throws when both fields are missing', async () => {
      await expect(service.sendNotifications('', '')).rejects.toThrow(
        'Fields are required',
      );
    });

    it('throws NotFoundError when subscription is missing', async () => {
      mockNotificationRepository.getSubscriptionByUserId.mockResolvedValueOnce(
        null,
      );

      await expect(
        service.sendNotifications('user-1', 'Hello'),
      ).rejects.toThrow('Subscription is not found');
    });

    it('passes the delete callback to sendPushNotification', async () => {
      const subscription = {
        endpoint: 'endpoint',
      };

      mockNotificationRepository.getSubscriptionByUserId.mockResolvedValueOnce({
        subscription,
      });

      vi.mocked(pushNotification.sendPushNotification).mockImplementationOnce(
        async (_subscription, _payload, onExpired) => {
          await onExpired('endpoint');
        },
      );

      const spy = vi.spyOn(service as any, 'deleteExpiredSubscriptionForUser');

      await service.sendNotifications('user-1', 'Hello');

      expect(spy).toHaveBeenCalledWith('endpoint');
    });

    it('propagates push notification errors', async () => {
      mockNotificationRepository.getSubscriptionByUserId.mockResolvedValueOnce({
        subscription: {
          endpoint: 'endpoint',
        },
      });

      vi.mocked(pushNotification.sendPushNotification).mockRejectedValueOnce(
        new Error('Push failed'),
      );

      await expect(
        service.sendNotifications('user-1', 'Hello'),
      ).rejects.toThrow('Push failed');
    });
  });

  describe('saveTheNotifications', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mockNotificationRepository.addNotification.mockResolvedValue(undefined);

      mockNotificationRepository.getSubscriptionByUserId.mockResolvedValue({
        endpoint: 'endpoint',
      });

      vi.spyOn(
        service as any,
        'deleteExpiredSubscriptionForUser',
      ).mockResolvedValue(undefined);

      vi.mocked(pushNotification.notifyUser).mockResolvedValue(undefined);
    });

    it('adds notification and sends push notification', async () => {
      await service.saveTheNotifications(
        'Message',
        'Title',
        'question-1',
        'user-1',
        'comment',
      );

      expect(mockNotificationRepository.addNotification).toHaveBeenCalledWith(
        'user-1',
        'question-1',
        'comment',
        'Message',
        'Title',
        undefined,
      );

      expect(
        mockNotificationRepository.getSubscriptionByUserId,
      ).toHaveBeenCalledWith('user-1');

      expect(pushNotification.notifyUser).toHaveBeenCalledWith(
        'user-1',
        'Title',
        {
          endpoint: 'endpoint',
        },
        expect.any(Function),
      );
    });

    it('passes session to repository when provided', async () => {
      const session = {} as any;

      await service.saveTheNotifications(
        'Message',
        'Title',
        'question-1',
        'user-1',
        'comment',
        session,
      );

      expect(mockNotificationRepository.addNotification).toHaveBeenCalledWith(
        'user-1',
        'question-1',
        'comment',
        'Message',
        'Title',
        session,
      );
    });

    it('calls deleteExpiredSubscriptionForUser when notify callback is invoked', async () => {
      const spy = vi.spyOn(service as any, 'deleteExpiredSubscriptionForUser');

      vi.mocked(pushNotification.notifyUser).mockImplementationOnce(
        async (_userId, _title, _subscription, onExpired) => {
          await onExpired('expired-endpoint');
        },
      );

      await service.saveTheNotifications(
        'Message',
        'Title',
        'question-1',
        'user-1',
        'comment',
      );

      expect(spy).toHaveBeenCalledWith('expired-endpoint');
    });

    it('propagates repository errors', async () => {
      mockNotificationRepository.addNotification.mockRejectedValueOnce(
        new Error('Repository failed'),
      );

      await expect(
        service.saveTheNotifications(
          'Message',
          'Title',
          'question-1',
          'user-1',
          'comment',
        ),
      ).rejects.toThrow('Repository failed');
    });

    it('propagates notifyUser errors', async () => {
      vi.mocked(pushNotification.notifyUser).mockRejectedValueOnce(
        new Error('Push notification failed'),
      );

      await expect(
        service.saveTheNotifications(
          'Message',
          'Title',
          'question-1',
          'user-1',
          'comment',
        ),
      ).rejects.toThrow('Push notification failed');
    });
  });
  describe('resolveDashboardAndReviewUsers', () => {
    it('throws when annam database is not configured', async () => {
      const serviceWithoutAnnam = new NotificationService(
        mockNotificationRepository as any,
        mockDatabase as any,
        undefined,
      );

      await expect(
        (serviceWithoutAnnam as any).resolveDashboardAndReviewUsers(
          '507f1f77bcf86cd799439011',
        ),
      ).rejects.toThrow('Annam database is not configured');
    });
    it('throws when target dashboard user is not found', async () => {
      const annamUsersCollection = {
        findOne: vi.fn().mockResolvedValue(null),
      };

      mockAnnamDatabase.getCollection.mockReturnValue(annamUsersCollection);

      await expect(
        (service as any).resolveDashboardAndReviewUsers(
          '507f1f77bcf86cd799439011',
        ),
      ).rejects.toThrow('Target user not found');
    });
    it('throws when notification receiver is not found', async () => {
      const annamUsersCollection = {
        findOne: vi.fn().mockResolvedValue({
          _id: 'dashboard-user',
          email: 'abc@test.com',
        }),
      };

      const reviewUsersCollection = {
        findOne: vi.fn().mockResolvedValue(null),
      };

      mockAnnamDatabase.getCollection.mockResolvedValue(annamUsersCollection);
      mockDatabase.getCollection.mockResolvedValue(reviewUsersCollection);

      await expect(
        (service as any).resolveDashboardAndReviewUsers(
          '507f1f77bcf86cd799439011',
        ),
      ).rejects.toThrow('Notification receiver not found');

      expect(reviewUsersCollection.findOne).toHaveBeenCalledWith({
        $or: [
          {
            email: /^abc@test\.com$/i,
          },
        ],
      });
    });
    it('returns dashboard user and review user successfully', async () => {
      const targetAnnamUser = {
        _id: 'dashboard-user',
        email: 'abc@test.com',
        firebaseUID: 'firebase-123',
      };

      const receiver = {
        _id: {
          toString: () => 'review-user',
        },
        email: 'abc@test.com',
      };

      const annamUsersCollection = {
        findOne: vi.fn().mockResolvedValue(targetAnnamUser),
      };

      const reviewUsersCollection = {
        findOne: vi.fn().mockResolvedValue(receiver),
      };

      mockAnnamDatabase.getCollection.mockResolvedValue(annamUsersCollection);
      mockDatabase.getCollection.mockResolvedValue(reviewUsersCollection);

      const result = await (service as any).resolveDashboardAndReviewUsers(
        '507f1f77bcf86cd799439011',
      );

      expect(result).toEqual({
        targetAnnamUser,
        annamUsers: annamUsersCollection,
        receiver,
      });

      expect(reviewUsersCollection.findOne).toHaveBeenCalledWith({
        $or: [
          {
            email: /^abc@test\.com$/i,
          },
          {
            firebaseUID: 'firebase-123',
          },
        ],
      });
    });
    it('resolveReviewUserFromDashboardUser throws for invalid target user id', async () => {
      await expect(
        (service as any).resolveReviewUserFromDashboardUser(''),
      ).rejects.toThrow('Invalid target user id');
    });
    it('resolveReviewUserFromDashboardUser returns review user', async () => {
      const receiver = {
        _id: {
          toString: () => 'review-user',
        },
      };

      vi.spyOn(
        service as any,
        'resolveDashboardAndReviewUsers',
      ).mockResolvedValue({
        receiver,
      });

      const result = await (service as any).resolveReviewUserFromDashboardUser(
        '507f1f77bcf86cd799439011',
      );

      expect(result).toBe(receiver);

      expect(
        (service as any).resolveDashboardAndReviewUsers,
      ).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });
    it('resolveReviewUserFromDashboardUser propagates lookup errors', async () => {
      vi.spyOn(
        service as any,
        'resolveDashboardAndReviewUsers',
      ).mockRejectedValue(new Error('Lookup failed'));

      await expect(
        (service as any).resolveReviewUserFromDashboardUser(
          '507f1f77bcf86cd799439011',
        ),
      ).rejects.toThrow('Lookup failed');
    });
    it('allows district coordinator to notify block coordinator in same district', () => {
      expect(() =>
        (service as any).assertNotificationWithinHierarchy(
          {
            userRole: 'district_coordinator',
            farmerProfile: {
              district: 'Ludhiana',
            },
          },
          {
            userRole: 'block_coordinator',
            farmerProfile: {
              district: 'Ludhiana',
            },
          },
        ),
      ).not.toThrow();
    });
    it('throws when district coordinator targets another district', () => {
      expect(() =>
        (service as any).assertNotificationWithinHierarchy(
          {
            userRole: 'district_coordinator',
            farmerProfile: {
              district: 'Ludhiana',
            },
          },
          {
            userRole: 'block_coordinator',
            farmerProfile: {
              district: 'Patiala',
            },
          },
        ),
      ).toThrow(
        'District coordinators can only notify users in their district',
      );
    });
    it('allows block coordinator to notify village volunteer in same block', () => {
      expect(() =>
        (service as any).assertNotificationWithinHierarchy(
          {
            userRole: 'block_coordinator',
            farmerProfile: {
              district: 'Ludhiana',
              blockName: 'Samrala',
            },
          },
          {
            userRole: 'village_volunteer',
            farmerProfile: {
              district: 'Ludhiana',
              blockName: 'Samrala',
            },
          },
        ),
      ).not.toThrow();
    });
    it('throws when block coordinator targets another block', () => {
      expect(() =>
        (service as any).assertNotificationWithinHierarchy(
          {
            userRole: 'block_coordinator',
            farmerProfile: {
              district: 'Ludhiana',
              blockName: 'Samrala',
            },
          },
          {
            userRole: 'village_volunteer',
            farmerProfile: {
              district: 'Ludhiana',
              blockName: 'Khanna',
            },
          },
        ),
      ).toThrow('Block coordinators can only notify users in their block');
    });
    it('allows village volunteer to notify farmer in same village', () => {
      expect(() =>
        (service as any).assertNotificationWithinHierarchy(
          {
            userRole: 'village_volunteer',
            farmerProfile: {
              district: 'Ludhiana',
              blockName: 'Samrala',
              villageName: 'Village A',
            },
          },
          {
            userRole: 'farmer',
            farmerProfile: {
              district: 'Ludhiana',
              blockName: 'Samrala',
              villageName: 'Village A',
            },
          },
        ),
      ).not.toThrow();
    });
    it('throws when village volunteer targets another village', () => {
      expect(() =>
        (service as any).assertNotificationWithinHierarchy(
          {
            userRole: 'village_volunteer',
            farmerProfile: {
              district: 'Ludhiana',
              blockName: 'Samrala',
              villageName: 'Village A',
            },
          },
          {
            userRole: 'farmer',
            farmerProfile: {
              district: 'Ludhiana',
              blockName: 'Samrala',
              villageName: 'Village B',
            },
          },
        ),
      ).toThrow('Village volunteers can only notify users in their village');
    });
    it('throws when target role is outside coordinator hierarchy', () => {
      expect(() =>
        (service as any).assertNotificationWithinHierarchy(
          {
            userRole: 'district_coordinator',
            farmerProfile: {
              district: 'Ludhiana',
            },
          },
          {
            userRole: 'farmer',
            farmerProfile: {
              district: 'Ludhiana',
            },
          },
        ),
      ).toThrow('Target user role is outside this coordinator hierarchy');
    });
  });

  describe('escapeRegex', () => {
    it('escapes regex special characters', () => {
      const result = (service as any).escapeRegex('abc.*+?^${}()|[]\\');

      expect(result).toBe('abc\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });
    it('returns normal string unchanged', () => {
      expect((service as any).escapeRegex('Punjab')).toBe('Punjab');
    });
  });

  describe('normalizeLocation', () => {
    it('normalizes location', () => {
      expect((service as any).normalizeLocation('  Ludhiana  ')).toBe(
        'ludhiana',
      );
    });
    it('returns empty string for undefined', () => {
      expect((service as any).normalizeLocation(undefined)).toBe('');
    });
  });
});
