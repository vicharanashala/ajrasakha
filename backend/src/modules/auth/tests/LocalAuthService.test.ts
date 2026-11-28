import 'reflect-metadata';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import bcrypt from 'bcryptjs';
import {BadRequestError, HttpError, UnauthorizedError} from 'routing-controllers';

// Side-effect-free stand-ins: these modules configure web push, SMTP and Firebase Admin at import time.
vi.mock('#root/modules/notification/services/NotificationService.js', () => ({
  NotificationService: class NotificationService {},
}));
vi.mock('#root/utils/mailer.js', () => ({sendEmailNotification: vi.fn()}));
vi.mock('#root/config/firebaseAdmin.js', () => ({
  getFirebaseAuth: vi.fn(() => {
    throw new Error('Firebase Admin must not be used when ENABLE_FIREBASE_LOGIN=false');
  }),
  ensureFirebaseAdminInitialized: vi.fn(),
}));

import {
  ChangePasswordError,
  FirebaseAuthService,
} from '#root/modules/auth/services/FirebaseAuthService.js';
import {getFirebaseAuth} from '#root/config/firebaseAdmin.js';
import {sendEmailNotification} from '#root/utils/mailer.js';
import {verifyLocalAuthToken, signLocalAuthToken} from '#root/utils/localAuthToken.js';
import {isUserAccessDenied} from '#root/shared/functions/userAccess.js';
import {
  InMemoryUserRepository,
  STRONG_PASSWORD,
  createFakeDatabase,
  createFakeNotificationService,
  useLocalLoginConfig,
  type FakeNotificationService,
} from './localAuthTestKit.js';

useLocalLoginConfig();

// Returns the HTTP status and message of a rejected promise, for concise assertions.
async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error('Expected the call to fail');
    },
    (err: unknown) => err,
  );
  return {
    error,
    status: error instanceof HttpError ? error.httpCode : undefined,
    message: error instanceof Error ? error.message : String(error),
  };
}

describe('FirebaseAuthService with ENABLE_FIREBASE_LOGIN=false', () => {
  let repo: InMemoryUserRepository;
  let notifications: FakeNotificationService;
  let service: FirebaseAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new InMemoryUserRepository();
    notifications = createFakeNotificationService();
    service = new FirebaseAuthService(
      repo.asRepository(),
      createFakeDatabase(),
      notifications,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never initialises Firebase Admin', () => {
    expect(getFirebaseAuth).not.toHaveBeenCalled();
  });

  describe('signup', () => {
    it('creates a pending pae_expert with a bcrypt hash, never the plain password', async () => {
      await repo.seedUser({email: 'admin@test.com', role: 'admin'});

      const result = await service.signup({
        email: '  New.User@Test.com ',
        password: STRONG_PASSWORD,
        firstName: 'New',
        lastName: 'User',
      });

      const stored = repo.getStoredByEmail('new.user@test.com');
      expect(stored).toBeDefined();
      expect(stored.email).toBe('new.user@test.com');
      expect(stored.role).toBe('pae_expert');
      expect(stored.isVerified).toBe(false);
      expect(stored.firebaseUID).toMatch(/^local_[0-9a-f-]{36}$/);
      expect(stored.password).not.toBe(STRONG_PASSWORD);
      expect(await bcrypt.compare(STRONG_PASSWORD, stored.password)).toBe(true);
      expect(result.user.uid).toBe(stored.firebaseUID);
      expect(JSON.stringify(result)).not.toContain('password');
      expect(notifications.saveTheNotifications).toHaveBeenCalledTimes(1);
      expect(sendEmailNotification).not.toHaveBeenCalled();
    });

    it('rejects an email that already exists, ignoring letter case', async () => {
      await repo.seedUser({email: 'Existing@Test.com'}, STRONG_PASSWORD);

      const {status, message} = await rejection(
        service.signup({email: 'existing@test.com', password: STRONG_PASSWORD, firstName: 'X'}),
      );

      expect(status).toBe(400);
      expect(message).toContain('already exists');
      expect(repo.users.size).toBe(1);
    });

    it('does not let signup claim a migrated user that has no password yet', async () => {
      await repo.seedUser({email: 'migrated@test.com'});

      const {status} = await rejection(
        service.signup({email: 'migrated@test.com', password: STRONG_PASSWORD, firstName: 'X'}),
      );

      expect(status).toBe(400);
      expect(repo.getStoredByEmail('migrated@test.com').password).toBeUndefined();
    });

    it.each([
      ['weakpassword', 'uppercase letter'],
      ['A'.repeat(70) + 'a1!', 'too long'],
    ])('rejects password %j before creating anything', async (password, message) => {
      const result = await rejection(
        service.signup({email: 'weak@test.com', password, firstName: 'Weak'}),
      );

      expect(result.error).toBeInstanceOf(BadRequestError);
      expect(result.message).toContain(message);
      expect(repo.users.size).toBe(0);
    });

    it('rejects a blank or non-string name', async () => {
      for (const firstName of ['   ', {$gt: ''} as unknown as string, undefined]) {
        const {status} = await rejection(
          service.signup({email: 'name@test.com', password: STRONG_PASSWORD, firstName}),
        );
        expect(status).toBe(400);
      }
      expect(repo.users.size).toBe(0);
    });
  });

  describe('loginWithPassword', () => {
    it('returns a verifiable token and the user without its password hash', async () => {
      const seeded = await repo.seedUser({email: 'user@test.com'}, STRONG_PASSWORD);

      const result = await service.loginWithPassword('user@test.com', STRONG_PASSWORD);

      expect(verifyLocalAuthToken(result.idToken).uid).toBe(seeded.firebaseUID);
      expect(result.expiresIn).toBe(3600);
      expect(result.user.email).toBe('user@test.com');
      expect(result.user).not.toHaveProperty('password');
    });

    it('matches the email case-insensitively and ignores surrounding spaces', async () => {
      await repo.seedUser({email: 'Mixed.Case@Test.com'}, STRONG_PASSWORD);

      const result = await service.loginWithPassword('  mixed.case@test.COM ', STRONG_PASSWORD);

      expect(result.user.email).toBe('Mixed.Case@Test.com');
    });

    it('gives the same error for a wrong password, an unknown email and a user without a password', async () => {
      await repo.seedUser({email: 'user@test.com'}, STRONG_PASSWORD);
      await repo.seedUser({email: 'nopassword@test.com'});

      const wrongPassword = await rejection(service.loginWithPassword('user@test.com', 'Wr0ng!Password'));
      const unknownEmail = await rejection(service.loginWithPassword('ghost@test.com', STRONG_PASSWORD));
      const noHash = await rejection(service.loginWithPassword('nopassword@test.com', STRONG_PASSWORD));

      for (const result of [wrongPassword, unknownEmail, noHash]) {
        expect(result.status).toBe(401);
        expect(result.message).toBe('Invalid email or password');
      }
    });

    it('still runs a bcrypt comparison for unknown emails, so timing does not reveal accounts', async () => {
      const compareSpy = vi.spyOn(bcrypt, 'compare');

      await rejection(service.loginWithPassword('ghost@test.com', STRONG_PASSWORD));

      expect(compareSpy).toHaveBeenCalledTimes(1);
      compareSpy.mockRestore();
    });

    it('reports a pending account only after the correct password', async () => {
      await repo.seedUser({email: 'pending@test.com', isVerified: false}, STRONG_PASSWORD);

      const withWrongPassword = await rejection(service.loginWithPassword('pending@test.com', 'Wr0ng!Password'));
      const withRightPassword = await rejection(service.loginWithPassword('pending@test.com', STRONG_PASSWORD));

      expect(withWrongPassword.message).toBe('Invalid email or password');
      expect(withRightPassword.status).toBe(401);
      expect(withRightPassword.message).toContain('pending admin verification');
    });

    it('applies the same blocked/inactive rules as the per-request authorization check', async () => {
      const cases = [
        {email: 'blocked-pae@test.com', role: 'pae_expert', isBlocked: true, status: 'active', denied: true},
        {email: 'checked-out-expert@test.com', role: 'expert', isBlocked: true, status: 'active', denied: false},
        {email: 'inactive-expert@test.com', role: 'expert', isBlocked: false, status: 'in-active', denied: true},
        {email: 'inactive-moderator@test.com', role: 'moderator', isBlocked: false, status: 'in-active', denied: true},
      ] as const;

      for (const testCase of cases) {
        const {denied, ...user} = testCase;
        await repo.seedUser(user, STRONG_PASSWORD);
        const attempt = service.loginWithPassword(user.email, STRONG_PASSWORD);

        expect(isUserAccessDenied(user)).toBe(denied);
        if (denied) {
          const {status, message} = await rejection(attempt);
          expect(status).toBe(401);
          expect(message).toBe('User marked as Inactive Please Contact Moderator');
        } else {
          await expect(attempt).resolves.toHaveProperty('idToken');
        }
      }
    });

    it('assigns and persists an identity key for legacy records without one', async () => {
      await repo.seedUser({email: 'legacy@test.com', firebaseUID: undefined}, STRONG_PASSWORD);

      const result = await service.loginWithPassword('legacy@test.com', STRONG_PASSWORD);

      const stored = repo.getStoredByEmail('legacy@test.com');
      expect(stored.firebaseUID).toMatch(/^local_/);
      expect(verifyLocalAuthToken(result.idToken).uid).toBe(stored.firebaseUID);
    });
  });

  describe('getCurrentUserFromToken', () => {
    it('resolves the user for a valid token, without the password hash', async () => {
      await repo.seedUser({email: 'user@test.com'}, STRONG_PASSWORD);
      const {idToken} = await service.loginWithPassword('user@test.com', STRONG_PASSWORD);

      const user = await service.getCurrentUserFromToken(idToken);

      expect(user.email).toBe('user@test.com');
      expect(user).not.toHaveProperty('password');
    });

    it.each([
      ['a garbage string', 'not-a-token'],
      ['a Firebase-style RS256 token', 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJ4In0.c2ln'],
    ])('rejects %s with 401', async (_label, token) => {
      const {error} = await rejection(service.getCurrentUserFromToken(token));
      expect(error).toBeInstanceOf(UnauthorizedError);
    });

    it('rejects a valid token whose user no longer exists', async () => {
      const {token} = signLocalAuthToken('local_deleted-user', 'deleted@test.com');
      const {error} = await rejection(service.getCurrentUserFromToken(token));
      expect(error).toBeInstanceOf(UnauthorizedError);
    });

    it('revokes tokens issued before the latest password change', async () => {
      vi.useFakeTimers({toFake: ['Date']});
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));
      const seeded = await repo.seedUser({email: 'user@test.com'}, STRONG_PASSWORD);
      const {idToken} = await service.loginWithPassword('user@test.com', STRONG_PASSWORD);

      // e.g. an admin reset the password from the dashboard a minute later.
      vi.setSystemTime(new Date('2026-03-01T10:01:00Z'));
      await repo.edit(seeded._id as string, {passwordChangedAt: new Date()});

      const {error, message} = await rejection(service.getCurrentUserFromToken(idToken));
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(message).toContain('Session expired');
    });
  });

  describe('changePassword', () => {
    const NEW_PASSWORD = 'N3w!Passw0rd';

    // Logs in a seeded user and returns their session token and request user.
    async function loggedInUser() {
      await repo.seedUser({email: 'user@test.com'}, STRONG_PASSWORD);
      const {idToken, user} = await service.loginWithPassword('user@test.com', STRONG_PASSWORD);
      return {idToken, user};
    }

    it('rejects a wrong current password', async () => {
      const {user} = await loggedInUser();
      const {error, message} = await rejection(
        service.changePassword({currentPassword: 'Wr0ng!Password', newPassword: NEW_PASSWORD, newPasswordConfirm: NEW_PASSWORD}, user),
      );
      expect(error).toBeInstanceOf(ChangePasswordError);
      expect(message).toBe('Incorrect current password');
    });

    it('requires the current password', async () => {
      const {user} = await loggedInUser();
      const {message} = await rejection(
        service.changePassword({newPassword: NEW_PASSWORD, newPasswordConfirm: NEW_PASSWORD}, user),
      );
      expect(message).toBe('Incorrect current password');
    });

    it('rejects a mismatched confirmation, a weak password and reusing the current password', async () => {
      const {user} = await loggedInUser();

      const mismatch = await rejection(
        service.changePassword({currentPassword: STRONG_PASSWORD, newPassword: NEW_PASSWORD, newPasswordConfirm: 'Other!Passw0rd'}, user),
      );
      const weak = await rejection(
        service.changePassword({currentPassword: STRONG_PASSWORD, newPassword: 'weakpass', newPasswordConfirm: 'weakpass'}, user),
      );
      const reused = await rejection(
        service.changePassword({currentPassword: STRONG_PASSWORD, newPassword: STRONG_PASSWORD, newPasswordConfirm: STRONG_PASSWORD}, user),
      );

      expect(mismatch.message).toBe('New passwords do not match');
      expect(weak.error).toBeInstanceOf(BadRequestError);
      expect(reused.message).toContain('cannot be the same');
      expect(await bcrypt.compare(STRONG_PASSWORD, repo.getStoredByEmail('user@test.com').password)).toBe(true);
    });

    it('stores the new hash, revokes older tokens and returns a working replacement token', async () => {
      vi.useFakeTimers({toFake: ['Date']});
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));
      const {idToken: oldToken, user} = await loggedInUser();

      vi.setSystemTime(new Date('2026-03-01T10:05:00Z'));
      const result = await service.changePassword(
        {currentPassword: STRONG_PASSWORD, newPassword: NEW_PASSWORD, newPasswordConfirm: NEW_PASSWORD},
        user,
      );

      expect(result.success).toBe(true);
      await expect(service.getCurrentUserFromToken(oldToken)).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(service.getCurrentUserFromToken(result.idToken)).resolves.toHaveProperty('email', 'user@test.com');
      await expect(service.loginWithPassword('user@test.com', NEW_PASSWORD)).resolves.toHaveProperty('idToken');
      const oldPasswordLogin = await rejection(service.loginWithPassword('user@test.com', STRONG_PASSWORD));
      expect(oldPasswordLogin.status).toBe(401);
    });
  });

  describe('adminCreateReviewUser', () => {
    it('stores a bcrypt hash for the new coordinator and returns no password', async () => {
      const created = await service.adminCreateReviewUser({
        email: 'Coordinator@Test.com',
        name: 'District Coordinator',
        password: STRONG_PASSWORD,
        role: 'district_coordinator',
      });

      const stored = repo.getStoredByEmail('coordinator@test.com');
      expect(stored.firebaseUID).toMatch(/^local_/);
      expect(await bcrypt.compare(STRONG_PASSWORD, stored.password)).toBe(true);
      expect(created).not.toHaveProperty('password');
      expect(getFirebaseAuth).not.toHaveBeenCalled();
    });

    it('rejects a weak password before creating the user', async () => {
      const {error} = await rejection(
        service.adminCreateReviewUser({email: 'c@test.com', name: 'C', password: 'password1', role: 'block_coordinator'}),
      );
      expect(error).toBeInstanceOf(BadRequestError);
      expect(repo.users.size).toBe(0);
    });
  });

  describe('Firebase-only features', () => {
    it('rejects Google signup', async () => {
      const {status, message} = await rejection(
        service.googleSignup({email: 'g@test.com', firstName: 'G', lastName: 'User'}, 'any-token'),
      );
      expect(status).toBe(400);
      expect(message).toContain('Google login is disabled');
    });

    it('sends no verification or reset emails and does not call Firebase', async () => {
      await service.sendVerificationEmail('user@test.com');
      await service.sendPasswordResetEmail('user@test.com');
      await service.updateFirebaseUser('local_x', {firstName: 'A', lastName: 'B'});

      expect(sendEmailNotification).not.toHaveBeenCalled();
      expect(getFirebaseAuth).not.toHaveBeenCalled();
    });
  });
});
