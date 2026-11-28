import 'reflect-metadata';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {NextFunction, Request, Response} from 'express';

const fakeFirebaseAuth = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(),
  generateEmailVerificationLink: vi.fn(async () => 'https://verify.example/link'),
}));

vi.mock('#root/modules/notification/services/NotificationService.js', () => ({
  NotificationService: class NotificationService {},
}));
vi.mock('#root/utils/mailer.js', () => ({sendEmailNotification: vi.fn()}));
vi.mock('#root/config/firebaseAdmin.js', () => ({
  getFirebaseAuth: vi.fn(() => fakeFirebaseAuth),
  ensureFirebaseAdminInitialized: vi.fn(),
}));

import {appConfig} from '#root/config/app.js';
import {FirebaseAuthService} from '#root/modules/auth/services/FirebaseAuthService.js';
import {getFirebaseAuth} from '#root/config/firebaseAdmin.js';
import {LocalLoginRateLimiter} from '#root/shared/middleware/rateLimiter.js';
import {signLocalAuthToken} from '#root/utils/localAuthToken.js';
import {
  InMemoryUserRepository,
  TEST_JWT_SECRET,
  createFakeDatabase,
  createFakeNotificationService,
} from './localAuthTestKit.js';

appConfig.enableFirebaseLogin = true;
// Set only so the test can mint a local token and prove Firebase mode rejects it.
appConfig.localAuth.jwtSecret = TEST_JWT_SECRET;

const FIREBASE_TOKEN = 'firebase-id-token';

describe('ENABLE_FIREBASE_LOGIN=true keeps the existing Firebase flow', () => {
  let repo: InMemoryUserRepository;
  let service: FirebaseAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeFirebaseAuth.verifyIdToken.mockImplementation(async (token: string) => {
      if (token === FIREBASE_TOKEN) {
        return {uid: 'fb-uid-1', email: 'fb@test.com', email_verified: true, name: 'Fire Base', iat: 1700000000};
      }
      throw Object.assign(new Error('Decoding Firebase ID token failed'), {code: 'auth/argument-error'});
    });
    repo = new InMemoryUserRepository();
    service = new FirebaseAuthService(
      repo.asRepository(),
      createFakeDatabase(),
      createFakeNotificationService(),
    );
  });

  it('initialises Firebase Admin', () => {
    expect(getFirebaseAuth).toHaveBeenCalledTimes(1);
  });

  it('verifies Firebase ID tokens and resolves the MongoDB user by firebaseUID', async () => {
    await repo.seedUser({email: 'fb@test.com', firebaseUID: 'fb-uid-1'});

    const user = await service.getCurrentUserFromToken(FIREBASE_TOKEN);

    expect(fakeFirebaseAuth.verifyIdToken).toHaveBeenCalledWith(FIREBASE_TOKEN);
    expect(user.email).toBe('fb@test.com');
  });

  it('does not offer the code based password reset', async () => {
    await expect(
      service.resetPasswordWithOtp({
        email: 'fb@test.com',
        otp: '123456',
        newPassword: 'N3w!Secret#Pass',
        newPasswordConfirm: 'N3w!Secret#Pass',
      }),
    ).rejects.toMatchObject({httpCode: 404});
  });

  it('maps Firebase claims onto the provider-neutral token shape', async () => {
    await expect(service.decodeToken(FIREBASE_TOKEN)).resolves.toEqual({
      uid: 'fb-uid-1',
      email: 'fb@test.com',
      emailVerified: true,
      name: 'Fire Base',
      issuedAt: 1700000000,
    });
  });

  it('does not accept tokens signed for local login', async () => {
    await repo.seedUser({email: 'fb@test.com', firebaseUID: 'fb-uid-1'});
    const {token} = signLocalAuthToken('fb-uid-1', 'fb@test.com');

    await expect(service.getCurrentUserFromToken(token)).rejects.toThrow();
    expect(fakeFirebaseAuth.verifyIdToken).toHaveBeenCalledWith(token);
  });

  it('creates signups in Firebase (its own password rules) and stores no password in MongoDB', async () => {
    fakeFirebaseAuth.createUser.mockResolvedValue({uid: 'fb-new', email: 'new@test.com', displayName: 'New User'});

    const result = await service.signup({email: 'new@test.com', password: 'weakpass1', firstName: 'New', lastName: 'User'});

    expect(fakeFirebaseAuth.createUser).toHaveBeenCalledWith(
      expect.objectContaining({email: 'new@test.com', password: 'weakpass1', emailVerified: false}),
    );
    expect(result.user.uid).toBe('fb-new');
    expect(repo.users.size).toBe(0);
  });

  it('keeps Google signup working through Firebase', async () => {
    await service.googleSignup({email: 'fb@test.com', firstName: 'Fire', lastName: 'Base'}, FIREBASE_TOKEN);

    expect(repo.getStoredByEmail('fb@test.com').firebaseUID).toBe('fb-uid-1');
  });

  it('leaves login rate limiting to Firebase', () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = {body: {email: 'someone@test.com'}} as Request;

    for (let attempt = 0; attempt < 30; attempt++) {
      LocalLoginRateLimiter(req, {} as Response, next);
    }

    expect(next).toHaveBeenCalledTimes(30);
  });
});
