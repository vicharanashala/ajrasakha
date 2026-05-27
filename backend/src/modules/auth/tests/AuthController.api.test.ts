import 'reflect-metadata';
import request from 'supertest';
import Express from 'express';
import {Container} from 'inversify';
import {describe, it, expect, beforeAll, beforeEach, vi} from 'vitest';
import {useContainer, useExpressServer, HttpError} from 'routing-controllers';

import admin from 'firebase-admin';

import {AuthController} from '../controllers/AuthController.js';
import {AUTH_TYPES} from '#auth/types.js';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {HttpErrorHandler} from '#shared/index.js';
import {ChangePasswordError} from '#auth/services/FirebaseAuthService.js';

// ─────────────────────────────────────────────────────────────
// Mock firebase-admin
// ─────────────────────────────────────────────────────────────

vi.mock('firebase-admin', () => ({
  default: {
    auth: vi.fn(() => ({
      verifyIdToken: vi.fn(),
    })),
  },
}));

// ─────────────────────────────────────────────────────────────
// Mock fetch
// ─────────────────────────────────────────────────────────────

global.fetch = vi.fn();

// ─────────────────────────────────────────────────────────────
// Mock Auth Service
// ─────────────────────────────────────────────────────────────

const mockAuthService = {
  signup: vi.fn(),
  googleSignup: vi.fn(),
  changePassword: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  syncUserWithDb: vi.fn(),
};

// ─────────────────────────────────────────────────────────────
// Shared test data
// ─────────────────────────────────────────────────────────────

const mockUser = {
  _id: '664f000000000000000000001',
  email: 'john@test.com',
  firstName: 'John',
  lastName: 'Doe',
  role: 'user',
  isVerified: true,
};

// ─────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────

describe('AuthController API', () => {
  let app: any;

  beforeAll(() => {
    const container = new Container();

    container.bind(AuthController).toSelf().inSingletonScope();

    container.bind(AUTH_TYPES.AuthService).toConstantValue(mockAuthService);

    container.bind(HttpErrorHandler).toSelf().inSingletonScope();

    useContainer(new InversifyAdapter(container));

    app = useExpressServer(Express(), {
      controllers: [AuthController],
      middlewares: [HttpErrorHandler],
      validation: true,
      defaultErrorHandler: false,

      authorizationChecker: async () => true,

      currentUserChecker: async () => mockUser,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // SIGNUP
  // ─────────────────────────────────────────────────────────

  describe('POST /auth/signup', () => {
    it('returns 201 on successful signup', async () => {
      mockAuthService.signup.mockResolvedValue({
        userId: 'user-123',
      });

      const response = await request(app).post('/auth/signup').send({
        email: 'john@test.com',
        password: 'StrongPass123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(response.status).toBe(201);

      expect(response.body.success).toBe(true);

      expect(mockAuthService.signup).toHaveBeenCalled();
    });

    it('returns 400 for invalid email', async () => {
      const response = await request(app).post('/auth/signup').send({
        email: 'invalid-email',
        password: 'StrongPass123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(response.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────
  // GOOGLE SIGNUP
  // ─────────────────────────────────────────────────────────

  describe('POST /auth/signup/google', () => {
    it('returns 201 for google signup', async () => {
      mockAuthService.googleSignup.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/auth/signup/google')
        .set('Authorization', 'Bearer fake-token')
        .send({
          email: 'john@test.com',
          firstName: 'John',
          lastName: 'Doe',
        });

      console.log('response.body:', response.body);

      expect(response.status).toBe(201);

      expect(mockAuthService.googleSignup).toHaveBeenCalledWith(
        {
          email: 'john@test.com',
          firstName: 'John',
          lastName: 'Doe',
        },
        'fake-token',
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // CHANGE PASSWORD
  // ─────────────────────────────────────────────────────────

  describe('PATCH /auth/change-password', () => {
    it('returns 200 on successful password change', async () => {
      mockAuthService.changePassword.mockResolvedValue({
        message: 'Password updated successfully',
      });

      const response = await request(app).patch('/auth/change-password').send({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      });

      expect(response.status).toBe(200);

      expect(response.body.success).toBe(true);
    });

    it('returns 400 for ChangePasswordError', async () => {
      mockAuthService.changePassword.mockRejectedValue(
        new ChangePasswordError('Password mismatch'),
      );

      const response = await request(app).patch('/auth/change-password').send({
        currentPassword: 'wrong',
        newPassword: 'new',
      });

      expect(response.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────
  // FORGOT PASSWORD
  // ─────────────────────────────────────────────────────────

  describe('POST /auth/forgot-password', () => {
    it('returns 200 successfully', async () => {
      mockAuthService.sendPasswordResetEmail.mockResolvedValue(undefined);

      const response = await request(app).post('/auth/forgot-password').send({
        email: 'john@test.com',
      });

      expect(response.status).toBe(200);

      expect(mockAuthService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'john@test.com',
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // RESEND VERIFICATION
  // ─────────────────────────────────────────────────────────

  describe('POST /auth/resend-verification', () => {
    it('returns 200 successfully', async () => {
      mockAuthService.sendVerificationEmail.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/auth/resend-verification')
        .send({
          email: 'john@test.com',
        });

      expect(response.status).toBe(200);

      expect(mockAuthService.sendVerificationEmail).toHaveBeenCalledWith(
        'john@test.com',
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('returns 200 on successful login', async () => {
      vi.mocked(global.fetch)

        // signInWithPassword
        .mockResolvedValueOnce({
          json: async () => ({
            idToken: 'firebase-token',
            refreshToken: 'refresh-token',
          }),
        } as any)

        // lookup
        .mockResolvedValueOnce({
          json: async () => ({
            users: [
              {
                localId: 'firebase-uid',
                email: 'john@test.com',
                emailVerified: true,
                displayName: 'John Doe',
              },
            ],
          }),
        } as any);

      mockAuthService.syncUserWithDb.mockResolvedValue(mockUser);

      const response = await request(app).post('/auth/login').send({
        email: 'john@test.com',
        password: 'StrongPass123!',
      });

      expect(response.status).toBe(200);

      expect(response.body.idToken).toBeDefined();
    });

    it('returns 401 for invalid credentials', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        json: async () => ({
          error: {
            message: 'INVALID_PASSWORD',
          },
        }),
      } as any);

      const response = await request(app).post('/auth/login').send({
        email: 'john@test.com',
        password: 'wrong-password',
      });

      expect(response.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────
  // SYNC ACCOUNT
  // ─────────────────────────────────────────────────────────

  describe('POST /auth/sync', () => {
    it('returns 200 on successful sync', async () => {
      vi.mocked(admin.auth).mockReturnValue({
        verifyIdToken: vi.fn().mockResolvedValue({
          uid: 'firebase-uid',
          email: 'john@test.com',
          email_verified: true,
          name: 'John Doe',
        }),
      } as any);

      mockAuthService.syncUserWithDb.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/auth/sync')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);

      expect(response.body.success).toBe(true);
    });

    it('returns 401 when token missing', async () => {
      const response = await request(app).post('/auth/sync');

      expect(response.status).toBe(401);
    });
  });
});
