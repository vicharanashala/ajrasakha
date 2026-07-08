import 'reflect-metadata';

import {beforeEach, describe, expect, it, vi} from 'vitest';

import {UserService} from '../services/UserService.js';
import {getFromContainer} from 'class-validator';
import {IUser} from '#root/shared/index.js';
import {sendEmailNotification} from '#root/utils/mailer.js';
// Mock external modules
vi.mock('#root/modules/notification/services/NotificationService.js', () => ({
  NotificationService: class {},
}));

vi.mock('#root/utils/mailer.js', () => ({
  sendEmailNotification: vi.fn(),
}));

vi.mock('class-validator', async () => {
  const actual =
    await vi.importActual<typeof import('class-validator')>('class-validator');

  return {
    ...actual,
    getFromContainer: vi.fn(),
  };
});

describe('UserService', () => {
  // ==========================================================
  // Shared Constants
  // ==========================================================

  const adminId = '507f1f77bcf86cd799439011';
  const moderatorId = '507f1f77bcf86cd799439012';
  const expertId = '507f1f77bcf86cd799439013';
  const userId = '507f1f77bcf86cd799439014';
  const questionId = '507f1f77bcf86cd799439015';
  const adminUser = {
    _id: '507f1f77bcf86cd799439099',
    role: 'admin',
  } as IUser;

  // ==========================================================
  // Repository Mocks
  // ==========================================================

  const mockUserRepo = {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findModerators: vi.fn(),
    findAdmins: vi.fn(),
    findAllUsers: vi.fn(),
    findAll: vi.fn(),
    findAllExperts: vi.fn(),
    findCallAgents: vi.fn(),

    edit: vi.fn(),

    updateAutoDeleteNotificationPreference: vi.fn(),
    updatePenaltyAndIncentive: vi.fn(),
    updateIsBlocked: vi.fn(),
    updateSTFStatus: vi.fn(),
    updateActivityStatus: vi.fn(),
    updateReputationScore: vi.fn(),
    setReputationScore: vi.fn(),
    setCallAgentStatus: vi.fn(),
    toggleCallAgentActive: vi.fn(),

    countNonBlockedExperts: vi.fn(),
    countActiveExperts: vi.fn(),

    findByQueuedExpertId: vi.fn(),
    updateSubmissionState: vi.fn(),
  };

  const mockNotificationRepository = {
    getNotificationsCount: vi.fn(),
  };

  const mockQuestionSubmissionRepo = {
    getModeratorReviewLevel: vi.fn(),
    getUserReviewLevel: vi.fn(),
    findByQueuedExpertId: vi.fn(),
    updateSubmissionState: vi.fn(),
  };

  const mockQuestionRepo = {
    getById: vi.fn(),
    updateQuestion: vi.fn(),
  };

  const mockNotificationService = {
    saveTheNotifications: vi.fn(),
  };

  const mockMongoDatabase = {};

  // ==========================================================
  // Service
  // ==========================================================

  let service: UserService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new UserService(
      mockUserRepo as any,
      mockNotificationRepository as any,
      mockMongoDatabase as any,
      mockQuestionSubmissionRepo as any,
      mockQuestionRepo as any,
      mockNotificationService as any,
    );

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );
  });

  // ==========================================================
  // Helper Functions
  // ==========================================================

  function setupGetModeratorsList() {
    mockUserRepo.findModerators.mockResolvedValue([
      {
        _id: moderatorId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
      },
      {
        _id: '507f1f77bcf86cd799439099',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@test.com',
      },
    ]);
  }

  function setupGetUserById() {
    mockUserRepo.findById.mockResolvedValue({
      _id: userId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@test.com',
      role: 'expert',
    });

    mockNotificationRepository.getNotificationsCount.mockResolvedValue(7);
  }
  function setupGetUserReviewLevel() {
    mockQuestionSubmissionRepo.getUserReviewLevel.mockResolvedValue({
      reviewLevel: 2,
      totalReviewed: 48,
      totalApproved: 44,
    });
  }

  function setupUpdateUser() {
    mockUserRepo.edit.mockResolvedValue({
      _id: userId,
      firebaseUID: 'firebase-123',
      firstName: 'John',
      lastName: 'Doe',
      mobile: '9999999999',
      university: 'ABC University',
    });

    const mockAuthService = {
      updateFirebaseUser: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(getFromContainer).mockReturnValue(mockAuthService as any);

    return mockAuthService;
  }
  function setupUpdateUserRole() {
    mockUserRepo.findById.mockResolvedValue({
      _id: userId,
      role: 'expert',
      email: 'expert@test.com',
    });

    mockUserRepo.edit.mockResolvedValue({
      _id: userId,
      role: 'moderator',
      email: 'expert@test.com',
    });
  }

  function setupGetAllUsers() {
    mockUserRepo.findAllUsers.mockResolvedValue({
      users: [
        {
          _id: userId,
          firstName: 'John',
          lastName: 'Doe',
          role: 'expert',
        },
      ],
      totalUsers: 1,
      totalPages: 1,
    });
  }

  function setupGetAllUsersForManualSelect() {
    mockUserRepo.findById.mockResolvedValue({
      _id: userId,
      firstName: 'John',
      lastName: 'Doe',
      preference: {
        state: 'Punjab',
        crop: 'Wheat',
        domain: 'Agriculture',
      },
    });

    mockUserRepo.findAll.mockResolvedValue([
      {
        _id: userId,
        firstName: 'John',
        lastName: 'Doe',
        role: 'expert',
        email: 'john@test.com',
        preference: {
          state: 'Punjab',
          crop: 'Wheat',
          domain: 'Agriculture',
        },
        reputation_score: 10,
        incentive: 100,
        penalty: 5,
        isBlocked: false,
        special_task_force: false,
        special_task_force_moderator: false,
        assignedQuestionIds: [],
      },
      {
        _id: moderatorId,
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'moderator',
        email: 'jane@test.com',
        preference: {
          state: 'Haryana',
          crop: 'Rice',
          domain: 'Soil',
        },
        reputation_score: 20,
        incentive: 200,
        penalty: 0,
        isBlocked: false,
        special_task_force: false,
        special_task_force_moderator: false,
        assignedQuestionIds: [],
      },
    ]);
  }
  function setupUpdateAutoDeleteNotificationPreference() {
    mockUserRepo.updateAutoDeleteNotificationPreference.mockResolvedValue(
      undefined,
    );
  }

  function setupUpdatePenaltyAndIncentive() {
    mockUserRepo.updatePenaltyAndIncentive.mockResolvedValue(undefined);
  }
  function setupFindAllExperts() {
    mockUserRepo.findAllExperts.mockResolvedValue({
      experts: [
        {
          _id: userId,
          firstName: 'John',
          lastName: 'Doe',
          role: 'expert',
        },
      ],
      totalExperts: 1,
      totalPages: 1,
    });
  }
  function setupBlockUnblockExperts() {
    mockUserRepo.findById.mockResolvedValue({
      _id: userId,
      role: 'expert',
    });

    mockUserRepo.countNonBlockedExperts.mockResolvedValue(11);

    mockUserRepo.updateIsBlocked.mockResolvedValue({
      _id: userId,
      isBlocked: true,
    });
  }

  function setupUpdateSTFStatus() {
    mockUserRepo.updateSTFStatus.mockResolvedValue(undefined);
  }

  function setupUpdateActivityStatus() {
    mockUserRepo.countActiveExperts.mockResolvedValue(11);

    mockUserRepo.updateActivityStatus.mockResolvedValue({
      _id: userId,
      status: 'active',
    });
  }

  //   function setupGetUserByEmail() {
  //     mockUserRepo.findByEmail.mockResolvedValue({
  //       _id: userId,
  //       email: 'john@example.com',
  //       firstName: 'John',
  //       lastName: 'Doe',
  //     });
  //   }

  //   function setupVerifyUser() {
  //     mockUserRepo.edit.mockResolvedValue({
  //       _id: userId,
  //       isVerified: true,
  //     });
  //   }

  function setupRemoveExpertAllocations() {
    mockUserRepo.findById.mockResolvedValue({
      _id: expertId,
      role: 'expert',
      reputation_score: 5,
    });

    mockQuestionSubmissionRepo.findByQueuedExpertId.mockResolvedValue([
      {
        questionId,
        queue: [expertId],
        history: [],
      },
    ]);

    mockQuestionSubmissionRepo.updateSubmissionState.mockResolvedValue(
      undefined,
    );

    mockQuestionRepo.updateQuestion.mockResolvedValue(undefined);

    mockQuestionRepo.getById.mockResolvedValue({
      question: 'Sample question',
    });

    mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);

    mockUserRepo.updateReputationScore.mockResolvedValue(undefined);

    mockUserRepo.setReputationScore.mockResolvedValue(undefined);
  }

  function setupRequestVerification() {
    mockUserRepo.findAdmins.mockResolvedValue([
      {
        email: 'admin1@test.com',
      },
      {
        email: 'admin2@test.com',
      },
    ]);

    vi.mocked(sendEmailNotification).mockResolvedValue(undefined);
  }

  function setupGetCallAgents() {
    mockUserRepo.findCallAgents.mockResolvedValue([
      {
        _id: expertId,
        email: 'agent@example.com',
        role: 'call_agent',
        isCallAgent: true,
        isCallAgentActive: true,
      },
    ]);
  }

  function setupSetCallAgentStatus() {
    mockUserRepo.findById.mockResolvedValue({
      _id: expertId,
      role: 'expert',
    });

    mockUserRepo.setCallAgentStatus.mockResolvedValue({
      _id: expertId,
      role: 'call_agent',
      isCallAgent: true,
      isCallAgentActive: true,
    });
  }

  function setupToggleCallAgentActive() {}

  // ==========================================================
  // getModeratorsList
  // ==========================================================

  describe('getModeratorsList', () => {
    it('returns moderator list successfully', async () => {
      setupGetModeratorsList();

      const result = await service.getModeratorsList();

      expect(mockUserRepo.findModerators).toHaveBeenCalled();

      expect(result).toEqual([
        {
          _id: moderatorId,
          name: 'John Doe',
          email: 'john@test.com',
        },
        {
          _id: '507f1f77bcf86cd799439099',
          name: 'Jane Smith',
          email: 'jane@test.com',
        },
      ]);
    });

    it('returns an empty array when there are no moderators', async () => {
      mockUserRepo.findModerators.mockResolvedValue([]);

      const result = await service.getModeratorsList();

      expect(result).toEqual([]);
    });

    it('uses email when first and last name are missing', async () => {
      mockUserRepo.findModerators.mockResolvedValue([
        {
          _id: moderatorId,
          email: 'moderator@test.com',
        },
      ]);

      const result = await service.getModeratorsList();

      expect(result).toEqual([
        {
          _id: moderatorId,
          name: 'moderator@test.com',
          email: 'moderator@test.com',
        },
      ]);
    });

    it('filters moderators without ids', async () => {
      mockUserRepo.findModerators.mockResolvedValue([
        {
          _id: null,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
        },
      ]);

      const result = await service.getModeratorsList();

      expect(result).toEqual([]);
    });
  });

  // ==========================================================
  // getUserById
  // ==========================================================

  describe('getUserById', () => {
    it('returns user with notification count', async () => {
      setupGetUserById();

      const result = await service.getUserById(userId);

      expect(mockUserRepo.findById).toHaveBeenCalledWith(
        userId,
        expect.anything(),
      );

      expect(
        mockNotificationRepository.getNotificationsCount,
      ).toHaveBeenCalledWith(userId, expect.anything());

      expect(result).toEqual({
        _id: userId,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        role: 'expert',
        notifications: 7,
      });
    });
    it('throws when user id is missing', async () => {
      await expect(service.getUserById('')).rejects.toThrow(
        `Failed to fetch user with ID :`,
      );

      expect(mockUserRepo.findById).not.toHaveBeenCalled();
    });
    it('throws when user is not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(service.getUserById(userId)).rejects.toThrow(
        `User with ID ${userId} not found`,
      );

      expect(
        mockNotificationRepository.getNotificationsCount,
      ).not.toHaveBeenCalled();
    });
    it('propagates repository errors', async () => {
      mockUserRepo.findById.mockRejectedValue(new Error('Database failure'));

      await expect(service.getUserById(userId)).rejects.toThrow(
        'Database failure',
      );
    });
  });

  // ==========================================================
  // getUserReviewLevel
  // ==========================================================

  describe('getUserReviewLevel', () => {
    it('returns expert review level successfully', async () => {
      setupGetUserReviewLevel();

      const query = {
        userId,
        role: 'expert',
      };

      const result = await service.getUserReviewLevel(query as any);

      expect(
        mockQuestionSubmissionRepo.getUserReviewLevel,
      ).toHaveBeenCalledWith(query);

      expect(result).toEqual({
        reviewLevel: 2,
        totalReviewed: 48,
        totalApproved: 44,
      });
    });

    it('returns moderator review level successfully', async () => {
      mockQuestionSubmissionRepo.getModeratorReviewLevel.mockResolvedValue({
        reviewLevel: 3,
        totalReviewed: 120,
      });

      const query = {
        userId,
        role: 'moderator',
      };

      const result = await service.getUserReviewLevel(query as any);

      expect(
        mockQuestionSubmissionRepo.getModeratorReviewLevel,
      ).toHaveBeenCalledWith(query);

      expect(result).toEqual({
        reviewLevel: 3,
        totalReviewed: 120,
      });

      expect(
        mockQuestionSubmissionRepo.getUserReviewLevel,
      ).not.toHaveBeenCalled();
    });

    it('returns null when no review level exists', async () => {
      mockQuestionSubmissionRepo.getUserReviewLevel.mockResolvedValue(null);

      const query = {
        userId,
        role: 'expert',
      };

      const result = await service.getUserReviewLevel(query as any);

      expect(result).toBeNull();
    });

    it('propagates repository errors', async () => {
      mockQuestionSubmissionRepo.getUserReviewLevel.mockRejectedValue(
        new Error('Database failure'),
      );

      const query = {
        userId,
        role: 'expert',
      };

      await expect(service.getUserReviewLevel(query as any)).rejects.toThrow(
        'Database failure',
      );
    });
  });

  // ==========================================================
  // updateUser
  // ==========================================================

  describe('updateUser', () => {
    it('updates editable user fields successfully', async () => {
      const authService = setupUpdateUser();

      const body = {
        firstName: 'Jane',
        lastName: 'Smith',
        mobile: '9876543210',
      };

      const result = await service.updateUser(userId, body);

      expect(mockUserRepo.edit).toHaveBeenCalledWith(
        userId,
        body,
        expect.anything(),
      );

      expect(authService.updateFirebaseUser).toHaveBeenCalledWith(
        'firebase-123',
        {
          firstName: 'Jane',
          lastName: 'Smith',
        },
      );

      expect(result.firstName).toBe('John');
    });

    it('updates only editable fields', async () => {
      setupUpdateUser();

      await service.updateUser(userId, {
        firstName: 'Jane',
        email: 'new@test.com',
        role: 'admin',
      } as any);

      expect(mockUserRepo.edit).toHaveBeenCalledWith(
        userId,
        {
          firstName: 'Jane',
        },
        expect.anything(),
      );
    });

    it('does not call firebase when only non-name fields change', async () => {
      const authService = setupUpdateUser();

      await service.updateUser(userId, {
        mobile: '9999999999',
      });

      expect(authService.updateFirebaseUser).not.toHaveBeenCalled();
    });

    it('throws when user id is missing', async () => {
      await expect(
        service.updateUser('', {
          firstName: 'John',
        }),
      ).rejects.toThrow('Failed to update user with ID');
    });

    it('throws when no editable fields are provided', async () => {
      await expect(
        service.updateUser(userId, {
          email: 'abc@test.com',
        } as any),
      ).rejects.toThrow('Failed to update user');
    });

    it('throws when first name is blank', async () => {
      await expect(
        service.updateUser(userId, {
          firstName: '   ',
        }),
      ).rejects.toThrow('Failed to update user');
    });

    it('throws when mobile is blank', async () => {
      await expect(
        service.updateUser(userId, {
          mobile: '   ',
        }),
      ).rejects.toThrow('Failed to update user');
    });

    it('throws when university is blank', async () => {
      await expect(
        service.updateUser(userId, {
          university: '   ',
        }),
      ).rejects.toThrow('Failed to update user');
    });

    it('throws when user is not found', async () => {
      setupUpdateUser();

      mockUserRepo.edit.mockResolvedValue(null);

      await expect(
        service.updateUser(userId, {
          firstName: 'Jane',
        }),
      ).rejects.toThrow('User with ID');
    });

    it('propagates repository errors', async () => {
      setupUpdateUser();

      mockUserRepo.edit.mockRejectedValue(new Error('Database failure'));

      await expect(
        service.updateUser(userId, {
          firstName: 'Jane',
        }),
      ).rejects.toThrow('Database failure');
    });
  });

  // ==========================================================
  // updateUserRole
  // ==========================================================

  describe('updateUserRole', () => {
    const adminUser = {
      _id: adminId,
      role: 'admin',
    } as any;

    it('updates a user role successfully', async () => {
      setupUpdateUserRole();

      const result = await service.updateUserRole(
        adminUser,
        userId,
        'moderator',
      );

      expect(mockUserRepo.findById).toHaveBeenCalledWith(
        userId,
        expect.anything(),
      );

      expect(mockUserRepo.edit).toHaveBeenCalledWith(
        userId,
        {
          role: 'moderator',
        },
        expect.anything(),
      );

      expect(result).toEqual({
        _id: userId,
        role: 'moderator',
        email: 'expert@test.com',
      });
    });

    it('throws when current user is not an admin', async () => {
      await expect(
        service.updateUserRole(
          {
            _id: moderatorId,
            role: 'moderator',
          } as any,
          userId,
          'moderator',
        ),
      ).rejects.toThrow('Only admin can switch user roles');

      expect(mockUserRepo.findById).not.toHaveBeenCalled();
    });

    it('throws when current user is missing', async () => {
      await expect(
        service.updateUserRole(null as any, userId, 'moderator'),
      ).rejects.toThrow('Only admin can switch user roles');

      expect(mockUserRepo.findById).not.toHaveBeenCalled();
    });

    it('throws when user id is missing', async () => {
      await expect(
        service.updateUserRole(adminUser, '', 'moderator'),
      ).rejects.toThrow('User ID is required');

      expect(mockUserRepo.findById).not.toHaveBeenCalled();
    });

    it('throws when user is not found', async () => {
      setupUpdateUserRole();

      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateUserRole(adminUser, userId, 'moderator'),
      ).rejects.toThrow(`User with ID ${userId} not found`);

      expect(mockUserRepo.edit).not.toHaveBeenCalled();
    });

    it('throws when user already has the requested role', async () => {
      setupUpdateUserRole();

      mockUserRepo.findById.mockResolvedValue({
        _id: userId,
        role: 'moderator',
      });

      await expect(
        service.updateUserRole(adminUser, userId, 'moderator'),
      ).rejects.toThrow('User already has role moderator');

      expect(mockUserRepo.edit).not.toHaveBeenCalled();
    });

    it('throws when repository fails to update the role', async () => {
      setupUpdateUserRole();

      mockUserRepo.edit.mockResolvedValue(null);

      await expect(
        service.updateUserRole(adminUser, userId, 'moderator'),
      ).rejects.toThrow('Failed to update user role');
    });

    it('wraps unexpected repository errors', async () => {
      setupUpdateUserRole();

      mockUserRepo.edit.mockRejectedValue(new Error('Database failure'));
      // updateUserRole returns the transaction promise directly,
      // so unexpected repository errors propagate without being wrapped.
      await expect(
        service.updateUserRole(adminUser, userId, 'moderator'),
      ).rejects.toThrow('Database failure');
    });
  });
  describe('getAllUsers', () => {
    it('returns paginated users successfully', async () => {
      setupGetAllUsers();

      const result = await service.getAllUsers(
        1,
        10,
        '',
        'createdAt',
        '',
        'expert',
        false,
        true,
        false,
      );

      expect(mockUserRepo.findAllUsers).toHaveBeenCalledWith(
        1,
        10,
        '',
        'createdAt',
        '',
        'expert',
        false,
        true,
        false,
      );

      expect(result).toEqual({
        users: [
          expect.objectContaining({
            _id: userId,
            firstName: 'John',
          }),
        ],
        totalUsers: 1,
        totalPages: 1,
      });
    });

    it('returns an empty result when no users exist', async () => {
      mockUserRepo.findAllUsers.mockResolvedValue({
        users: [],
        totalUsers: 0,
        totalPages: 0,
      });

      const result = await service.getAllUsers(1, 10, '', 'createdAt', '');

      expect(result).toEqual({
        users: [],
        totalUsers: 0,
        totalPages: 0,
      });
    });

    it('propagates repository errors', async () => {
      mockUserRepo.findAllUsers.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.getAllUsers(1, 10, '', 'createdAt', ''),
      ).rejects.toThrow('Database failure');
    });
  });
  describe('getAllUsersforManualSelect', () => {
    it('returns users for manual selection successfully', async () => {
      setupGetAllUsersForManualSelect();

      const result = await service.getAllUsersforManualSelect(
        userId,
        1,
        10,
        '',
        '',
        '',
      );

      expect(mockUserRepo.findById).toHaveBeenCalledWith(
        userId,
        expect.anything(),
      );

      expect(mockUserRepo.findAll).toHaveBeenCalledWith(expect.anything());

      expect(result.myPreference).toEqual({
        state: 'Punjab',
        crop: 'Wheat',
        domain: 'Agriculture',
      });

      expect(result.users).toHaveLength(1);

      expect(result.totalUsers).toBe(2);

      expect(result.totalPages).toBe(5);
    });
    it('does not include the current user in the returned list', async () => {
      setupGetAllUsersForManualSelect();

      const result = await service.getAllUsersforManualSelect(
        userId,
        1,
        10,
        '',
        '',
        '',
      );

      expect(result.users.some(u => u._id === userId)).toBe(false);

      expect(result.users[0]._id).toBe(moderatorId);
    });
    it('uses null preference values when current user has no preference', async () => {
      setupGetAllUsersForManualSelect();

      mockUserRepo.findById.mockResolvedValue({
        _id: userId,
        preference: undefined,
      });

      const result = await service.getAllUsersforManualSelect(
        userId,
        1,
        10,
        '',
        '',
        '',
      );

      expect(result.myPreference).toEqual({
        state: null,
        crop: null,
        domain: null,
      });
    });
    it('wraps repository errors', async () => {
      mockUserRepo.findById.mockRejectedValue(new Error('Database failure'));

      await expect(
        service.getAllUsersforManualSelect(userId, 1, 10, '', '', ''),
      ).rejects.toThrow('Failed to fetch users');
    });
  });
  describe('updateAutoDeleteNotificationPreference', () => {
    it('updates notification preference successfully', async () => {
      setupUpdateAutoDeleteNotificationPreference();

      await service.updateAutoDeleteNotificationPreference(
        '7_days' as any,
        userId,
      );

      expect(
        mockUserRepo.updateAutoDeleteNotificationPreference,
      ).toHaveBeenCalledWith('7_days', userId, expect.anything());
    });

    it('propagates repository errors', async () => {
      mockUserRepo.updateAutoDeleteNotificationPreference.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.updateAutoDeleteNotificationPreference('7_days' as any, userId),
      ).rejects.toThrow('Database failure');
    });
  });
  describe('updatePenaltyAndIncentive', () => {
    it('updates user penalty successfully', async () => {
      setupUpdatePenaltyAndIncentive();

      await service.updatePenaltyAndIncentive(userId, 'penalty');

      expect(mockUserRepo.updatePenaltyAndIncentive).toHaveBeenCalledWith(
        userId,
        'penalty',
        expect.anything(),
      );
    });

    it('updates user incentive successfully', async () => {
      setupUpdatePenaltyAndIncentive();

      await service.updatePenaltyAndIncentive(userId, 'incentive');

      expect(mockUserRepo.updatePenaltyAndIncentive).toHaveBeenCalledWith(
        userId,
        'incentive',
        expect.anything(),
      );
    });

    it('propagates repository errors', async () => {
      mockUserRepo.updatePenaltyAndIncentive.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.updatePenaltyAndIncentive(userId, 'penalty'),
      ).rejects.toThrow('Database failure');
    });
  });
  describe('findAllExperts', () => {
    it('returns experts successfully', async () => {
      setupFindAllExperts();

      const result = await service.findAllExperts(1, 10, '', 'createdAt', '');

      expect(mockUserRepo.findAllExperts).toHaveBeenCalledWith(
        1,
        10,
        '',
        'createdAt',
        '',
        expect.anything(),
      );

      expect(result).toEqual({
        experts: [
          expect.objectContaining({
            _id: userId,
            firstName: 'John',
          }),
        ],
        totalExperts: 1,
        totalPages: 1,
      });
    });

    it('returns an empty result when no experts exist', async () => {
      mockUserRepo.findAllExperts.mockResolvedValue({
        experts: [],
        totalExperts: 0,
        totalPages: 0,
      });

      const result = await service.findAllExperts(1, 10, '', 'createdAt', '');

      expect(result).toEqual({
        experts: [],
        totalExperts: 0,
        totalPages: 0,
      });
    });

    it('propagates repository errors', async () => {
      mockUserRepo.findAllExperts.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.findAllExperts(1, 10, '', 'createdAt', ''),
      ).rejects.toThrow('Database failure');
    });
  });
  describe('blockUnblockExperts', () => {
    it('blocks an expert successfully', async () => {
      setupBlockUnblockExperts();

      const result = await service.blockUnblockExperts(userId, 'block');

      expect(mockUserRepo.findById).toHaveBeenCalledWith(
        userId,
        expect.anything(),
      );

      expect(mockUserRepo.countNonBlockedExperts).toHaveBeenCalledWith(
        expect.anything(),
      );

      expect(mockUserRepo.updateIsBlocked).toHaveBeenCalledWith(
        userId,
        'block',
        expect.anything(),
      );

      expect(result).toEqual({
        _id: userId,
        isBlocked: true,
      });
    });

    it('does not check minimum experts when blocking a moderator', async () => {
      setupBlockUnblockExperts();

      mockUserRepo.findById.mockResolvedValue({
        _id: userId,
        role: 'moderator',
      });

      await service.blockUnblockExperts(userId, 'block');

      expect(mockUserRepo.countNonBlockedExperts).not.toHaveBeenCalled();

      expect(mockUserRepo.updateIsBlocked).toHaveBeenCalled();
    });

    it('throws when blocking would reduce experts below minimum', async () => {
      setupBlockUnblockExperts();

      mockUserRepo.countNonBlockedExperts.mockResolvedValue(10);

      await expect(
        service.blockUnblockExperts(userId, 'block'),
      ).rejects.toThrow(
        'Minimum 10 active experts required. Cannot block more experts.',
      );

      expect(mockUserRepo.updateIsBlocked).not.toHaveBeenCalled();
    });

    it('unblocks a user without checking expert count', async () => {
      setupBlockUnblockExperts();

      await service.blockUnblockExperts(userId, 'unblock');

      expect(mockUserRepo.findById).not.toHaveBeenCalled();

      expect(mockUserRepo.countNonBlockedExperts).not.toHaveBeenCalled();

      expect(mockUserRepo.updateIsBlocked).toHaveBeenCalledWith(
        userId,
        'unblock',
        expect.anything(),
      );
    });

    it('propagates repository errors', async () => {
      setupBlockUnblockExperts();

      mockUserRepo.updateIsBlocked.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.blockUnblockExperts(userId, 'block'),
      ).rejects.toThrow('Database failure');
    });
  });
  describe('updateSTFStatus', () => {
    it('updates STF status successfully', async () => {
      setupUpdateSTFStatus();

      await service.updateSTFStatus(userId, 'enable');

      expect(mockUserRepo.updateSTFStatus).toHaveBeenCalledWith(
        userId,
        'enable',
        expect.anything(),
      );
    });

    it('propagates repository errors', async () => {
      mockUserRepo.updateSTFStatus.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(service.updateSTFStatus(userId, 'enable')).rejects.toThrow(
        'Database failure',
      );
    });
  });
  describe('updateActivityStatus', () => {
    it('updates activity status successfully', async () => {
      setupUpdateActivityStatus();

      const result = await service.updateActivityStatus(userId, 'active');

      expect(mockUserRepo.updateActivityStatus).toHaveBeenCalledWith(
        userId,
        'active',
        expect.anything(),
      );

      expect(result).toEqual({
        _id: userId,
        status: 'active',
      });
    });

    it('checks active expert count before marking inactive', async () => {
      setupUpdateActivityStatus();

      await service.updateActivityStatus(userId, 'in-active');

      expect(mockUserRepo.countActiveExperts).toHaveBeenCalledWith(
        expect.anything(),
      );

      expect(mockUserRepo.updateActivityStatus).toHaveBeenCalledWith(
        userId,
        'in-active',
        expect.anything(),
      );
    });

    it('throws when active experts would fall below minimum', async () => {
      setupUpdateActivityStatus();

      mockUserRepo.countActiveExperts.mockResolvedValue(10);

      await expect(
        service.updateActivityStatus(userId, 'in-active'),
      ).rejects.toThrow(
        'Minimum 10 active experts required. Cannot mark more experts inactive.',
      );

      expect(mockUserRepo.updateActivityStatus).not.toHaveBeenCalled();
    });

    it('propagates repository errors', async () => {
      setupUpdateActivityStatus();

      mockUserRepo.updateActivityStatus.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.updateActivityStatus(userId, 'active'),
      ).rejects.toThrow('Database failure');
    });
  });
  describe('removeExpertAllocations', () => {
    it('throws when current user is not an admin', async () => {
      const moderator = {
        _id: moderatorId,
        role: 'moderator',
      };

      await expect(
        service.removeExpertAllocations(moderator as any, expertId),
      ).rejects.toThrow('Only admins can remove expert allocations');

      expect(mockUserRepo.findById).not.toHaveBeenCalled();
    });
    it('throws when expert does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.removeExpertAllocations(adminUser as any, expertId),
      ).rejects.toThrow(`User with ID ${expertId} not found`);
    });
    it('throws when user is not an expert', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'moderator',
      });

      await expect(
        service.removeExpertAllocations(adminUser as any, expertId),
      ).rejects.toThrow('Allocations can only be removed for expert users');
    });
    it('returns zero allocations when expert has no submissions', async () => {
      setupRemoveExpertAllocations();

      mockQuestionSubmissionRepo.findByQueuedExpertId.mockResolvedValue([]);

      const result = await service.removeExpertAllocations(
        adminUser as any,
        expertId,
      );

      expect(mockUserRepo.setReputationScore).toHaveBeenCalledWith(
        expertId,
        0,
        expect.anything(),
      );

      expect(result).toEqual({
        questionsAffected: 0,
        removedQueues: 0,
        workloadBefore: 5,
        workloadAfter: 0,
        questionIds: [],
      });
    });
    it('removes one allocation successfully', async () => {
      setupRemoveExpertAllocations();

      const result = await service.removeExpertAllocations(
        adminUser as any,
        expertId,
      );

      expect(
        mockQuestionSubmissionRepo.updateSubmissionState,
      ).toHaveBeenCalled();

      expect(mockQuestionRepo.updateQuestion).toHaveBeenCalled();

      expect(mockNotificationService.saveTheNotifications).toHaveBeenCalled();

      expect(mockUserRepo.setReputationScore).toHaveBeenCalledWith(
        expertId,
        0,
        expect.anything(),
      );

      expect(result.questionsAffected).toBe(1);

      expect(result.removedQueues).toBe(1);
    });
  }); // ==========================================================
  // requestVerification
  // ==========================================================

  describe('requestVerification', () => {
    it('sends verification email to all admins', async () => {
      setupRequestVerification();

      await service.requestVerification('user@test.com');

      expect(mockUserRepo.findAdmins).toHaveBeenCalledWith(expect.anything());

      expect(sendEmailNotification).toHaveBeenCalledWith(
        ['admin1@test.com', 'admin2@test.com'],
        'New Verification Request',
        '',
        expect.stringContaining('user@test.com'),
      );
    });

    it('does not send email when there are no admins', async () => {
      mockUserRepo.findAdmins.mockResolvedValue([]);

      await service.requestVerification('user@test.com');

      expect(sendEmailNotification).not.toHaveBeenCalled();
    });

    it('does not send email when admins have no email addresses', async () => {
      mockUserRepo.findAdmins.mockResolvedValue([
        {
          email: '',
        },
        {
          email: null,
        },
      ]);

      await service.requestVerification('user@test.com');

      expect(sendEmailNotification).not.toHaveBeenCalled();
    });

    it('throws when identifier is empty', async () => {
      await expect(service.requestVerification('')).rejects.toThrow(
        'Identifier is required',
      );

      expect(mockUserRepo.findAdmins).not.toHaveBeenCalled();
    });

    it('wraps email sending errors', async () => {
      setupRequestVerification();

      vi.mocked(sendEmailNotification).mockRejectedValue(
        new Error('SMTP failure'),
      );

      await expect(
        service.requestVerification('user@test.com'),
      ).rejects.toThrow(
        'Failed to send verification request for identifier user@test.com',
      );
    });
  });
  describe('getCallAgents', () => {
    it('returns all call agents', async () => {
      setupGetCallAgents();

      const result = await service.getCallAgents();

      expect(mockUserRepo.findCallAgents).toHaveBeenCalledWith(
        expect.anything(),
      );

      expect(result).toEqual([
        expect.objectContaining({
          role: 'call_agent',
        }),
      ]);
    });

    it('returns an empty array when there are no call agents', async () => {
      mockUserRepo.findCallAgents.mockResolvedValue([]);

      const result = await service.getCallAgents();

      expect(result).toEqual([]);
    });

    it('throws when repository fails', async () => {
      mockUserRepo.findCallAgents.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(service.getCallAgents()).rejects.toThrow('Database failure');
    });
  });
  describe('setCallAgentStatus', () => {
    it('sets an expert as a call agent', async () => {
      setupSetCallAgentStatus();

      const result = await service.setCallAgentStatus(
        expertId,
        true,
        true,
        'admin',
      );

      expect(mockUserRepo.findById).toHaveBeenCalledWith(
        expertId,
        expect.anything(),
      );

      expect(mockUserRepo.setCallAgentStatus).toHaveBeenCalledWith(
        expertId,
        true,
        true,
        expect.anything(),
      );

      expect(result).toEqual(
        expect.objectContaining({
          role: 'call_agent',
        }),
      );
    });

    it('throws when requester is not an admin', async () => {
      await expect(
        service.setCallAgentStatus(expertId, true, true, 'expert'),
      ).rejects.toThrow('Only admin can manage call agents');
    });

    it('throws when user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.setCallAgentStatus(expertId, true, true, 'admin'),
      ).rejects.toThrow(`User with ID ${expertId} not found`);
    });

    it('throws when assigning call agent role to a non-expert', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'moderator',
      });

      await expect(
        service.setCallAgentStatus(expertId, true, true, 'admin'),
      ).rejects.toThrow('Only experts can be set as call agents');
    });

    it('throws when removing call agent status from a non-call-agent', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      await expect(
        service.setCallAgentStatus(expertId, false, false, 'admin'),
      ).rejects.toThrow('User is not a call agent');
    });

    it('removes call agent status successfully', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'call_agent',
      });

      mockUserRepo.setCallAgentStatus.mockResolvedValue({
        _id: expertId,
        role: 'expert',
        isCallAgent: false,
        isCallAgentActive: false,
      });

      const result = await service.setCallAgentStatus(
        expertId,
        false,
        false,
        'admin',
      );

      expect(mockUserRepo.setCallAgentStatus).toHaveBeenCalledWith(
        expertId,
        false,
        false,
        expect.anything(),
      );

      expect(result).toEqual(
        expect.objectContaining({
          role: 'expert',
        }),
      );
    });

    it('throws when repository update fails', async () => {
      setupSetCallAgentStatus();

      mockUserRepo.setCallAgentStatus.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.setCallAgentStatus(expertId, true, true, 'admin'),
      ).rejects.toThrow('Database failure');
    });
  });
  describe('toggleCallAgentActive', () => {
    it('toggles call agent active status successfully', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'call_agent',
        isCallAgentActive: true,
      });

      mockUserRepo.toggleCallAgentActive.mockResolvedValue({
        _id: expertId,
        role: 'call_agent',
        isCallAgentActive: false,
      });

      const result = await service.toggleCallAgentActive(expertId, 'admin');

      expect(mockUserRepo.findById).toHaveBeenCalledWith(
        expertId,
        expect.anything(),
      );

      expect(mockUserRepo.toggleCallAgentActive).toHaveBeenCalledWith(
        expertId,
        expect.anything(),
      );

      expect(result).toEqual(
        expect.objectContaining({
          role: 'call_agent',
        }),
      );
    });

    it('throws when requester is not an admin', async () => {
      await expect(
        service.toggleCallAgentActive(expertId, 'expert'),
      ).rejects.toThrow('Only admin can manage call agents');

      expect(mockUserRepo.findById).not.toHaveBeenCalled();
    });

    it('throws when user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.toggleCallAgentActive(expertId, 'admin'),
      ).rejects.toThrow(`User with ID ${expertId} not found`);

      expect(mockUserRepo.toggleCallAgentActive).not.toHaveBeenCalled();
    });

    it('throws when user is not a call agent', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'expert',
      });

      await expect(
        service.toggleCallAgentActive(expertId, 'admin'),
      ).rejects.toThrow('User is not a call agent');

      expect(mockUserRepo.toggleCallAgentActive).not.toHaveBeenCalled();
    });

    it('throws when repository fails', async () => {
      mockUserRepo.findById.mockResolvedValue({
        _id: expertId,
        role: 'call_agent',
      });

      mockUserRepo.toggleCallAgentActive.mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.toggleCallAgentActive(expertId, 'admin'),
      ).rejects.toThrow('Database failure');
    });
  });
});
