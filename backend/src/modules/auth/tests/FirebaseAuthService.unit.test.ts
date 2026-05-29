import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

const mockAuth = {
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(),
  verifyIdToken: vi.fn(),
  getUser: vi.fn(),
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
});
