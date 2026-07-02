import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {appConfig} from '#root/config/app.js';
const mockAuth = {
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(),
  verifyIdToken: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  generateEmailVerificationLink: vi.fn(),
  generatePasswordResetLink: vi.fn(),
};

vi.mock('#root/config/firebaseAdmin.js', () => ({
  getFirebaseAuth: () => mockAuth,
}));

import {
  FirebaseAuthService,
  ChangePasswordError,
} from '../services/FirebaseAuthService.js';

describe('FirebaseAuthService', () => {
  let service: FirebaseAuthService;

  let mockUserRepository: any;
  let mockNotificationService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUserRepository = {
      create: vi.fn(),
      findAdmins: vi.fn(),
      findByFirebaseUID: vi.fn(),
      findByEmail: vi.fn(),
      edit: vi.fn(),
      findById: vi.fn(),
    };

    mockNotificationService = {
      saveTheNotifications: vi.fn(),
    };

    service = new FirebaseAuthService(
      mockUserRepository,
      {} as any,
      mockNotificationService,
    );
  });

  describe('signup', () => {
    it('creates firebase user successfully', async () => {
      mockAuth.createUser.mockResolvedValue({
        uid: 'firebase-uid',
        email: 'john@test.com',
        displayName: 'John Doe',
      });

      vi.spyOn(service, 'sendVerificationEmail').mockResolvedValue();

      const result = await service.signup({
        email: 'john@test.com',
        password: 'StrongPassword123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(mockAuth.createUser).toHaveBeenCalledWith({
        email: 'john@test.com',
        password: 'StrongPassword123!',
        displayName: 'John Doe',
        emailVerified: false,
        disabled: false,
      });

      expect(service.sendVerificationEmail).toHaveBeenCalledWith(
        'john@test.com',
      );

      expect(result.user.uid).toBe('firebase-uid');
    });

    it('throws error when firstName is blank', async () => {
      await expect(
        service.signup({
          email: 'john@test.com',
          password: 'StrongPassword123!',
          firstName: '   ',
          lastName: 'Doe',
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError when email already exists and is verified', async () => {
      mockAuth.createUser.mockRejectedValue({
        code: 'auth/email-already-exists',
      });

      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'existing-user',
        emailVerified: true,
      });

      await expect(
        service.signup({
          email: 'john@test.com',
          password: 'StrongPassword123!',
          firstName: 'John',
          lastName: 'Doe',
        }),
      ).rejects.toThrow(
        'An account with this email already exists, Please try login!',
      );
    });

    it('updates unverified existing user during re-signup', async () => {
      mockAuth.createUser.mockRejectedValue({
        code: 'auth/email-already-exists',
      });

      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'existing-user-id',
        emailVerified: false,
      });

      mockAuth.updateUser.mockResolvedValue({
        uid: 'existing-user-id',
        email: 'john@test.com',
        displayName: 'John Doe',
      });

      vi.spyOn(service, 'sendVerificationEmail').mockResolvedValue();

      const result = await service.signup({
        email: 'john@test.com',
        password: 'StrongPassword123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(mockAuth.updateUser).toHaveBeenCalledWith('existing-user-id', {
        password: 'StrongPassword123!',
        displayName: 'John Doe',
      });

      expect(result.user.uid).toBe('existing-user-id');
    });

    it('throws formatted invalid password error', async () => {
      mockAuth.createUser.mockRejectedValue({
        code: 'auth/invalid-password',
        message: 'Firebase invalid password',
      });

      await expect(
        service.signup({
          email: 'john@test.com',
          password: '123',
          firstName: 'John',
          lastName: 'Doe',
        }),
      ).rejects.toThrow('The password does not meet Firebase requirements.');
    });

    it('throws formatted invalid email error', async () => {
      mockAuth.createUser.mockRejectedValue({
        code: 'auth/invalid-email',
        message: 'Firebase invalid email',
      });

      await expect(
        service.signup({
          email: 'invalid-email',
          password: 'StrongPassword123!',
          firstName: 'John',
          lastName: 'Doe',
        }),
      ).rejects.toThrow('Invalid email format.');
    });
  });

  describe('verifyToken', () => {
    it('returns true for valid token', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-uid',
      });

      const result = await service.verifyToken('valid-token');

      expect(result).toBe(true);
    });

    // it('returns false when decoded token is null', async () => {
    //   mockAuth.verifyIdToken.mockResolvedValue(null);

    //   const result = await service.verifyToken('invalid-token');

    //   expect(result).toBe(false);
    // });
    it('throws when firebase rejects token', async () => {
      mockAuth.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      await expect(service.verifyToken('bad-token')).rejects.toThrow(
        'Invalid token',
      );
    });
  });

  describe('changePassword', () => {
    it('changes password successfully', async () => {
      mockAuth.getUser.mockResolvedValue({
        uid: 'firebase-uid',
      });

      mockAuth.updateUser.mockResolvedValue({});

      const result = await service.changePassword(
        {
          newPassword: 'NewStrongPassword123!',
          newPasswordConfirm: 'NewStrongPassword123!',
        },
        {
          firebaseUID: 'firebase-uid',
        } as any,
      );

      expect(mockAuth.updateUser).toHaveBeenCalledWith('firebase-uid', {
        password: 'NewStrongPassword123!',
      });

      expect(result.success).toBe(true);
    });

    it('throws ChangePasswordError when user not found', async () => {
      mockAuth.getUser.mockResolvedValue(null);

      await expect(
        service.changePassword(
          {
            newPassword: 'NewStrongPassword123!',
            newPasswordConfirm: 'NewStrongPassword123!',
          },
          {
            firebaseUID: 'firebase-uid',
          } as any,
        ),
      ).rejects.toThrow(ChangePasswordError);
    });

    it('throws ChangePasswordError when passwords do not match', async () => {
      mockAuth.getUser.mockResolvedValue({
        uid: 'firebase-uid',
      });

      await expect(
        service.changePassword(
          {
            newPassword: 'password1',
            newPasswordConfirm: 'password2',
          },
          {
            firebaseUID: 'firebase-uid',
          } as any,
        ),
      ).rejects.toThrow('New passwords do not match');
    });
  });

  describe('getCurrentUserFromToken', () => {
    it('returns current user successfully', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-uid',
      });

      mockUserRepository.findByFirebaseUID.mockResolvedValue({
        _id: 'mongo-id',
        firebaseUID: 'firebase-uid',
        email: 'john@test.com',
      });

      const result = await service.getCurrentUserFromToken('valid-token');

      expect(mockUserRepository.findByFirebaseUID).toHaveBeenCalledWith(
        'firebase-uid',
      );

      expect(result.email).toBe('john@test.com');
    });

    it('throws when user does not exist in database', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-uid',
      });

      mockUserRepository.findByFirebaseUID.mockResolvedValue(null);

      await expect(
        service.getCurrentUserFromToken('valid-token'),
      ).rejects.toThrow('User not found in database');
    });
  });

  describe('updateFirebaseUser', () => {
    it('updates firebase display name', async () => {
      mockAuth.updateUser.mockResolvedValue({});

      await service.updateFirebaseUser('firebase-uid', {
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(mockAuth.updateUser).toHaveBeenCalledWith('firebase-uid', {
        displayName: 'John Doe',
      });
    });
  });

  describe('findByFirebaseUID', () => {
    it('returns user from repository', async () => {
      mockUserRepository.findByFirebaseUID.mockResolvedValue({
        firebaseUID: 'firebase-uid',
        email: 'john@test.com',
      });

      const result = await service.findByFirebaseUID('firebase-uid');

      expect(mockUserRepository.findByFirebaseUID).toHaveBeenCalledWith(
        'firebase-uid',
      );

      expect(result.email).toBe('john@test.com');
    });
  });

  describe('getUserIdFromReq', () => {
    it('returns user id from request token', async () => {
      vi.spyOn(service, 'verifyToken').mockResolvedValue(true);

      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-uid',
      });

      mockUserRepository.findByFirebaseUID.mockResolvedValue({
        _id: 'mongo-user-id',
      });

      const result = await service.getUserIdFromReq({
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      expect(result).toBe('mongo-user-id');
    });

    it('throws when token is missing', async () => {
      await expect(
        service.getUserIdFromReq({
          headers: {},
        }),
      ).rejects.toThrow('No token provided');
    });

    it('throws when user not found', async () => {
      vi.spyOn(service, 'verifyToken').mockResolvedValue(true);

      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-uid',
      });

      mockUserRepository.findByFirebaseUID.mockResolvedValue(null);

      await expect(
        service.getUserIdFromReq({
          headers: {
            authorization: 'Bearer valid-token',
          },
        }),
      ).rejects.toThrow('User not found');
    });
  });
  describe('syncUserWithDb', () => {
    it('returns existing user when firebase uid already exists', async () => {
      const existingUser = {
        _id: 'user-1',
        firebaseUID: 'firebase-uid',
        email: 'john@test.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      mockUserRepository.findByFirebaseUID.mockResolvedValue(existingUser);

      const result = await service.syncUserWithDb(
        'firebase-uid',
        'john@test.com',
        'John Doe',
      );

      expect(mockUserRepository.findByFirebaseUID).toHaveBeenCalledWith(
        'firebase-uid',
      );

      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();

      expect(result).toEqual(existingUser);
    });

    it('links existing email with firebase uid', async () => {
      const existingUser = {
        _id: 'mongo-id',
        email: 'john@test.com',
      };

      const updatedUser = {
        _id: 'mongo-id',
        firebaseUID: 'firebase-uid',
        email: 'john@test.com',
      };

      mockUserRepository.findByFirebaseUID
        .mockResolvedValueOnce(null) // first lookup
        .mockResolvedValueOnce(updatedUser); // second lookup after edit

      mockUserRepository.findByEmail.mockResolvedValue(existingUser);

      mockUserRepository.edit.mockResolvedValue(updatedUser);

      const result = await service.syncUserWithDb(
        'firebase-uid',
        'john@test.com',
        'John Doe',
      );

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(
        'john@test.com',
      );

      expect(mockUserRepository.edit).toHaveBeenCalledWith('mongo-id', {
        firebaseUID: 'firebase-uid',
      });

      expect(mockUserRepository.findByFirebaseUID).toHaveBeenCalledTimes(2);

      expect(result).toEqual(updatedUser);
    });
    it('creates a new user and notifies admins when user does not exist', async () => {
      const createdUser = {
        _id: 'created-user-id',
        firebaseUID: 'firebase-uid',
        email: 'john@test.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.findByFirebaseUID
        .mockResolvedValueOnce(null) // initial lookup
        .mockResolvedValueOnce(createdUser); // lookup after creation

      mockUserRepository.findByEmail.mockResolvedValue(null);

      mockUserRepository.create.mockResolvedValue('created-user-id');

      mockUserRepository.findAdmins.mockResolvedValue([
        {
          _id: 'admin-1',
        },
        {
          _id: 'admin-2',
        },
      ]);

      mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);

      const result = await service.syncUserWithDb(
        'firebase-uid',
        'john@test.com',
        'John Doe',
      );

      expect(mockUserRepository.create).toHaveBeenCalled();

      expect(mockUserRepository.findAdmins).toHaveBeenCalled();

      expect(
        mockNotificationService.saveTheNotifications,
      ).toHaveBeenCalledTimes(2);

      expect(result).toEqual(createdUser);
    });
    it('throws when repository fails to create user', async () => {
      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.findByFirebaseUID.mockResolvedValue(null);
      mockUserRepository.findByEmail.mockResolvedValue(null);

      mockUserRepository.create.mockResolvedValue(null);

      await expect(
        service.syncUserWithDb('firebase-uid', 'john@test.com', 'John Doe'),
      ).rejects.toThrow(InternalServerError);

      expect(mockUserRepository.create).toHaveBeenCalled();

      expect(
        mockNotificationService.saveTheNotifications,
      ).not.toHaveBeenCalled();
    });
    it('throws when user cannot be found after successful creation', async () => {
      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.findByFirebaseUID
        .mockResolvedValueOnce(null) // initial lookup
        .mockResolvedValueOnce(null); // lookup after creation

      mockUserRepository.findByEmail.mockResolvedValue(null);

      mockUserRepository.create.mockResolvedValue('created-user-id');

      mockUserRepository.findAdmins.mockResolvedValue([]);

      await expect(
        service.syncUserWithDb('firebase-uid', 'john@test.com', 'John Doe'),
      ).rejects.toThrow('User syncing failed');

      expect(mockUserRepository.create).toHaveBeenCalled();

      expect(mockUserRepository.findAdmins).toHaveBeenCalled();
    });
  });

  describe('googleSignup', () => {
    it('creates a google user successfully', async () => {
      vi.spyOn(service, 'verifyToken').mockResolvedValue(true);

      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-uid',
      });

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.create.mockResolvedValue('user-id');

      mockUserRepository.findAdmins.mockResolvedValue([
        {
          _id: {
            toString: () => 'admin-1',
          },
        },
        {
          _id: {
            toString: () => 'admin-2',
          },
        },
      ]);

      mockNotificationService.saveTheNotifications.mockResolvedValue(undefined);

      await service.googleSignup(
        {
          email: 'john@test.com',
          firstName: 'John',
          lastName: 'Doe',
        } as any,
        'firebase-token',
      );

      expect(service.verifyToken).toHaveBeenCalledWith('firebase-token');

      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith('firebase-token');

      expect(mockUserRepository.create).toHaveBeenCalled();

      expect(mockUserRepository.findAdmins).toHaveBeenCalled();

      expect(
        mockNotificationService.saveTheNotifications,
      ).toHaveBeenCalledTimes(2);
    });
    it('throws when repository fails to create google user', async () => {
      vi.spyOn(service, 'verifyToken').mockResolvedValue(true);

      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-uid',
      });

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.create.mockResolvedValue(null);

      await expect(
        service.googleSignup(
          {
            email: 'john@test.com',
            firstName: 'John',
            lastName: 'Doe',
          } as any,
          'firebase-token',
        ),
      ).rejects.toThrow(InternalServerError);

      expect(mockUserRepository.create).toHaveBeenCalled();

      expect(mockUserRepository.findAdmins).not.toHaveBeenCalled();

      expect(
        mockNotificationService.saveTheNotifications,
      ).not.toHaveBeenCalled();
    });
    it('creates google user successfully when no admins exist', async () => {
      vi.spyOn(service, 'verifyToken').mockResolvedValue(true);

      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-uid',
      });

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.create.mockResolvedValue('user-id');

      mockUserRepository.findAdmins.mockResolvedValue([]);

      await service.googleSignup(
        {
          email: 'john@test.com',
          firstName: 'John',
          lastName: 'Doe',
        } as any,
        'firebase-token',
      );

      expect(mockUserRepository.create).toHaveBeenCalled();

      expect(mockUserRepository.findAdmins).toHaveBeenCalled();

      expect(
        mockNotificationService.saveTheNotifications,
      ).not.toHaveBeenCalled();
    });
    it('propagates verifyToken errors', async () => {
      vi.spyOn(service, 'verifyToken').mockRejectedValue(
        new Error('Invalid token'),
      );

      await expect(
        service.googleSignup(
          {
            email: 'john@test.com',
            firstName: 'John',
            lastName: 'Doe',
          } as any,
          'bad-token',
        ),
      ).rejects.toThrow('Invalid token');

      expect(mockAuth.verifyIdToken).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(
        mockNotificationService.saveTheNotifications,
      ).not.toHaveBeenCalled();
    });
  });
  describe('adminCreateReviewUser', () => {
    it('throws when name is empty', async () => {
      await expect(
        service.adminCreateReviewUser({
          name: '   ',
          email: 'john@test.com',
          password: 'Password123!',
          role: 'district_coordinator',
        } as any),
      ).rejects.toThrow(BadRequestError);

      expect(mockAuth.getUserByEmail).not.toHaveBeenCalled();
      expect(mockAuth.createUser).not.toHaveBeenCalled();
    });
    it('throws when role is invalid', async () => {
      await expect(
        service.adminCreateReviewUser({
          name: 'John Doe',
          email: 'john@test.com',
          password: 'Password123!',
          role: 'invalid_role',
        } as any),
      ).rejects.toThrow('Invalid review system role');

      expect(mockAuth.getUserByEmail).not.toHaveBeenCalled();
      expect(mockAuth.createUser).not.toHaveBeenCalled();
    });
    it('updates existing firebase user and creates review user', async () => {
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'firebase-uid',
        email: 'john@test.com',
      });

      mockAuth.updateUser.mockResolvedValue({});

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.findByFirebaseUID.mockResolvedValue(null);
      mockUserRepository.findByEmail.mockResolvedValue(null);

      mockUserRepository.create.mockResolvedValue('user-id');

      mockUserRepository.findById.mockResolvedValue({
        _id: 'user-id',
        firebaseUID: 'firebase-uid',
        email: 'john@test.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'district_coordinator',
      });

      const result = await service.adminCreateReviewUser({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'Password123!',
        role: 'district_coordinator',
      } as any);

      expect(mockAuth.getUserByEmail).toHaveBeenCalledWith('john@test.com');

      expect(mockAuth.updateUser).toHaveBeenCalledWith('firebase-uid', {
        password: 'Password123!',
        displayName: 'John Doe',
        emailVerified: true,
        disabled: false,
      });

      expect(mockUserRepository.create).toHaveBeenCalled();

      expect(result.email).toBe('john@test.com');
    });
    it('creates a new firebase user when one does not already exist', async () => {
      mockAuth.getUserByEmail.mockRejectedValue({
        code: 'auth/user-not-found',
      });

      mockAuth.createUser.mockResolvedValue({
        uid: 'firebase-uid',
        email: 'john@test.com',
      });

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.findByFirebaseUID.mockResolvedValue(null);
      mockUserRepository.findByEmail.mockResolvedValue(null);

      mockUserRepository.create.mockResolvedValue('user-id');

      mockUserRepository.findById.mockResolvedValue({
        _id: 'user-id',
        firebaseUID: 'firebase-uid',
        email: 'john@test.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'district_coordinator',
      });

      const result = await service.adminCreateReviewUser({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'Password123!',
        role: 'district_coordinator',
      } as any);

      expect(mockAuth.getUserByEmail).toHaveBeenCalledWith('john@test.com');

      expect(mockAuth.createUser).toHaveBeenCalledWith({
        email: 'john@test.com',
        password: 'Password123!',
        displayName: 'John Doe',
        emailVerified: true,
        disabled: false,
      });

      expect(mockAuth.updateUser).not.toHaveBeenCalled();

      expect(result.firebaseUID).toBe('firebase-uid');
    });
    it('throws when firebase getUserByEmail fails with an unexpected error', async () => {
      mockAuth.getUserByEmail.mockRejectedValue({
        code: 'auth/internal-error',
        message: 'Firebase is unavailable',
      });

      await expect(
        service.adminCreateReviewUser({
          name: 'John Doe',
          email: 'john@test.com',
          password: 'Password123!',
          role: 'district_coordinator',
        } as any),
      ).rejects.toThrow('Firebase is unavailable');

      expect(mockAuth.createUser).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });
    it('throws when firebase uid is already linked to a review user', async () => {
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'firebase-uid',
        email: 'john@test.com',
      });

      mockAuth.updateUser.mockResolvedValue({});

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.findByFirebaseUID.mockResolvedValue({
        _id: 'existing-user',
        firebaseUID: 'firebase-uid',
      });

      await expect(
        service.adminCreateReviewUser({
          name: 'John Doe',
          email: 'john@test.com',
          password: 'Password123!',
          role: 'district_coordinator',
        } as any),
      ).rejects.toThrow('Review system user with this email already exists');

      expect(mockUserRepository.findByFirebaseUID).toHaveBeenCalledWith(
        'firebase-uid',
        expect.anything(),
      );

      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
      expect(mockUserRepository.edit).not.toHaveBeenCalled();
    });
    it('throws when email is already linked to another firebase account', async () => {
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'firebase-uid',
        email: 'john@test.com',
      });

      mockAuth.updateUser.mockResolvedValue({});

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.findByFirebaseUID.mockResolvedValue(null);

      mockUserRepository.findByEmail.mockResolvedValue({
        _id: 'user-id',
        email: 'john@test.com',
        firebaseUID: 'different-firebase-uid',
      });

      await expect(
        service.adminCreateReviewUser({
          name: 'John Doe',
          email: 'john@test.com',
          password: 'Password123!',
          role: 'district_coordinator',
        } as any),
      ).rejects.toThrow(
        'Review system user with this email is already linked to another Firebase account',
      );

      expect(mockUserRepository.edit).not.toHaveBeenCalled();
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });
    it('updates an existing review user successfully', async () => {
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'firebase-uid',
        email: 'john@test.com',
      });

      mockAuth.updateUser.mockResolvedValue({});

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.findByFirebaseUID.mockResolvedValue(null);

      mockUserRepository.findByEmail.mockResolvedValue({
        _id: 'existing-user-id',
        email: 'john@test.com',
        firebaseUID: null,
      });

      const updatedUser = {
        _id: 'existing-user-id',
        firebaseUID: 'firebase-uid',
        email: 'john@test.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'district_coordinator',
      };

      mockUserRepository.edit.mockResolvedValue(updatedUser);

      const result = await service.adminCreateReviewUser({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'Password123!',
        role: 'district_coordinator',
      } as any);

      expect(mockUserRepository.edit).toHaveBeenCalledWith(
        'existing-user-id',
        {
          firebaseUID: 'firebase-uid',
          email: 'john@test.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'district_coordinator',
          isVerified: true,
          isBlocked: false,
          status: 'active',
        },
        expect.anything(),
      );

      expect(mockUserRepository.create).not.toHaveBeenCalled();

      expect(result).toEqual(updatedUser);
    });
    it('throws when updating an existing review user fails', async () => {
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'firebase-uid',
        email: 'john@test.com',
      });

      mockAuth.updateUser.mockResolvedValue({});

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.findByFirebaseUID.mockResolvedValue(null);

      mockUserRepository.findByEmail.mockResolvedValue({
        _id: 'existing-user-id',
        email: 'john@test.com',
        firebaseUID: null,
      });

      mockUserRepository.edit.mockResolvedValue(null);

      await expect(
        service.adminCreateReviewUser({
          name: 'John Doe',
          email: 'john@test.com',
          password: 'Password123!',
          role: 'district_coordinator',
        } as any),
      ).rejects.toThrow('Failed to update review system user');

      expect(mockUserRepository.edit).toHaveBeenCalled();

      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });
    it('throws when created review user cannot be found', async () => {
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: 'firebase-uid',
        email: 'john@test.com',
      });

      mockAuth.updateUser.mockResolvedValue({});

      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );

      mockUserRepository.findByFirebaseUID.mockResolvedValue(null);
      mockUserRepository.findByEmail.mockResolvedValue(null);

      mockUserRepository.create.mockResolvedValue('created-user-id');

      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        service.adminCreateReviewUser({
          name: 'John Doe',
          email: 'john@test.com',
          password: 'Password123!',
          role: 'district_coordinator',
        } as any),
      ).rejects.toThrow('Failed to create review system user');

      expect(mockUserRepository.create).toHaveBeenCalled();

      expect(mockUserRepository.findById).toHaveBeenCalledWith(
        'created-user-id',
        expect.anything(),
      );
    });
    it('rolls back newly created firebase user when database transaction fails', async () => {
      mockAuth.getUserByEmail.mockRejectedValue({
        code: 'auth/user-not-found',
      });

      mockAuth.createUser.mockResolvedValue({
        uid: 'firebase-uid',
        email: 'john@test.com',
      });

      mockAuth.deleteUser.mockResolvedValue(undefined);

      vi.spyOn(service as any, '_withTransaction').mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.adminCreateReviewUser({
          name: 'John Doe',
          email: 'john@test.com',
          password: 'Password123!',
          role: 'district_coordinator',
        } as any),
      ).rejects.toThrow('Database failure');

      expect(mockAuth.deleteUser).toHaveBeenCalledWith('firebase-uid');
    });
    it('continues throwing original error when firebase rollback fails', async () => {
      mockAuth.getUserByEmail.mockRejectedValue({
        code: 'auth/user-not-found',
      });

      mockAuth.createUser.mockResolvedValue({
        uid: 'firebase-uid',
        email: 'john@test.com',
      });

      mockAuth.deleteUser.mockRejectedValue(new Error('Rollback failed'));

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      vi.spyOn(service as any, '_withTransaction').mockRejectedValue(
        new Error('Database failure'),
      );

      await expect(
        service.adminCreateReviewUser({
          name: 'John Doe',
          email: 'john@test.com',
          password: 'Password123!',
          role: 'district_coordinator',
        } as any),
      ).rejects.toThrow('Database failure');

      expect(mockAuth.deleteUser).toHaveBeenCalledWith('firebase-uid');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to rollback Firebase user creation:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
    it('returns immediately when in development mode', async () => {
      const original = appConfig.isDevelopment;
      (appConfig as any).isDevelopment = true;

      const generateSpy = vi.spyOn(mockAuth, 'generateEmailVerificationLink');
      const mailer = await import('#root/utils/mailer.js');
      const mailSpy = vi
        .spyOn(mailer, 'sendEmailNotification')
        .mockResolvedValue(undefined as any);

      await service.sendVerificationEmail('john@test.com');

      expect(generateSpy).not.toHaveBeenCalled();
      expect(mailSpy).not.toHaveBeenCalled();

      (appConfig as any).isDevelopment = original;
      mailSpy.mockRestore();
    });
    it('sends verification email successfully', async () => {
      const original = appConfig.isDevelopment;
      (appConfig as any).isDevelopment = false;

      mockAuth.generateEmailVerificationLink.mockResolvedValue(
        'https://verify-link.com',
      );

      const mailer = await import('#root/utils/mailer.js');
      const sendEmailSpy = vi
        .spyOn(mailer, 'sendEmailNotification')
        .mockResolvedValue(undefined as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.sendVerificationEmail('john@test.com');

      expect(mockAuth.generateEmailVerificationLink).toHaveBeenCalledWith(
        'john@test.com',
      );

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'john@test.com',
        'Verify your email',
        expect.stringContaining('https://verify-link.com'),
        expect.stringContaining('https://verify-link.com'),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Verification email sent successfully to john@test.com',
      );

      (appConfig as any).isDevelopment = original;
      consoleSpy.mockRestore();
      sendEmailSpy.mockRestore();
    });
    it('throws BadRequestError when generating verification link fails', async () => {
      const original = appConfig.isDevelopment;
      (appConfig as any).isDevelopment = false;

      mockAuth.generateEmailVerificationLink.mockRejectedValue(
        new Error('Firebase failed'),
      );

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        service.sendVerificationEmail('john@test.com'),
      ).rejects.toThrow('Failed to send verification email: Firebase failed');

      expect(mockAuth.generateEmailVerificationLink).toHaveBeenCalledWith(
        'john@test.com',
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to send verification email to john@test.com:',
        expect.any(Error),
      );

      (appConfig as any).isDevelopment = original;
      consoleSpy.mockRestore();
    });
    it('throws BadRequestError when sending verification email fails', async () => {
      const original = appConfig.isDevelopment;
      (appConfig as any).isDevelopment = false;

      mockAuth.generateEmailVerificationLink.mockResolvedValue(
        'https://verify-link.com',
      );

      const mailer = await import('#root/utils/mailer.js');

      vi.spyOn(mailer, 'sendEmailNotification').mockRejectedValue(
        new Error('SMTP unavailable'),
      );

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        service.sendVerificationEmail('john@test.com'),
      ).rejects.toThrow('Failed to send verification email: SMTP unavailable');

      expect(mockAuth.generateEmailVerificationLink).toHaveBeenCalledWith(
        'john@test.com',
      );

      expect(mailer.sendEmailNotification).toHaveBeenCalled();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to send verification email to john@test.com:',
        expect.any(Error),
      );

      (appConfig as any).isDevelopment = original;
      consoleSpy.mockRestore();
    });
    it('sends password reset email successfully', async () => {
      const original = appConfig.isDevelopment;
      (appConfig as any).isDevelopment = false;

      mockAuth.generatePasswordResetLink.mockResolvedValue(
        'https://reset-link.com',
      );

      const mailer = await import('#root/utils/mailer.js');

      const sendEmailSpy = vi
        .spyOn(mailer, 'sendEmailNotification')
        .mockResolvedValue(undefined as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.sendPasswordResetEmail('john@test.com');

      expect(mockAuth.generatePasswordResetLink).toHaveBeenCalledWith(
        'john@test.com',
      );

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'john@test.com',
        'Reset your password',
        expect.stringContaining('https://reset-link.com'),
        expect.stringContaining('https://reset-link.com'),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Password reset email sent successfully to john@test.com',
      );

      (appConfig as any).isDevelopment = original;
      consoleSpy.mockRestore();
      sendEmailSpy.mockRestore();
    });
    it('logs error when password reset email fails but does not throw', async () => {
      const original = appConfig.isDevelopment;
      (appConfig as any).isDevelopment = false;

      mockAuth.generatePasswordResetLink.mockRejectedValue(
        new Error('Firebase unavailable'),
      );

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        service.sendPasswordResetEmail('john@test.com'),
      ).resolves.toBeUndefined();

      expect(mockAuth.generatePasswordResetLink).toHaveBeenCalledWith(
        'john@test.com',
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to send password reset email to john@test.com:',
        expect.any(Error),
      );

      (appConfig as any).isDevelopment = original;
      consoleSpy.mockRestore();
    });
    it('logs error when sending password reset email fails', async () => {
      const original = appConfig.isDevelopment;
      (appConfig as any).isDevelopment = false;

      mockAuth.generatePasswordResetLink.mockResolvedValue(
        'https://reset-link.com',
      );

      const mailer = await import('#root/utils/mailer.js');

      vi.spyOn(mailer, 'sendEmailNotification').mockRejectedValue(
        new Error('SMTP failed'),
      );

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        service.sendPasswordResetEmail('john@test.com'),
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to send password reset email to john@test.com:',
        expect.any(Error),
      );

      (appConfig as any).isDevelopment = original;
      consoleSpy.mockRestore();
    });
  });
});
