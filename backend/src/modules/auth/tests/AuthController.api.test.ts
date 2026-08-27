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

  // POST /auth/signup (201 success, 400 invalid email) removed 2026-08-25 —
  // duplicated by real e2e coverage in
  // src/e2e/auth/AuthController.e2e.test.ts ("creates a new Firebase user
  // and returns 201" / "rejects an invalid email format"), which exercises
  // the real FirebaseAuthService rather than a mock. See
  // src/e2e/BUGS_REPORT.md / COVERAGE_GAP_REPORT.md.

  // ─────────────────────────────────────────────────────────
  // GOOGLE SIGNUP
  // ─────────────────────────────────────────────────────────

  // Kept (not a duplicate): the real e2e suite can only exercise this route's
  // failure path (no real Google ID token available headlessly) — this
  // mocked happy path is the only place the 201/response-shape/service-call
  // contract for a successful Google signup is verified at all.
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

  // Kept (not a duplicate): this test mocks AuthService entirely, so it only
  // verifies the CONTROLLER's own success/error-type-to-status mapping — it
  // never touches FirebaseAuthService, which is where BUG-018 actually lives
  // (request.user is never populated by any middleware, so the real service
  // call always throws). The real e2e suite demonstrates that end-to-end bug
  // for real (always 500, see BUG-018 in BUGS_REPORT.md); this test protects
  // a different, still-real piece of logic — the controller's own mapping —
  // that would matter again the moment BUG-018 is fixed.
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

  // POST /auth/forgot-password (200 success) and POST /auth/resend-verification
  // (200 success) removed 2026-08-25 — both duplicated by real e2e coverage
  // in src/e2e/auth/AuthController.e2e.test.ts, which hits the real
  // FirebaseAuthService for both routes. See BUGS_REPORT.md / COVERAGE_GAP_REPORT.md.

  // ─────────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────────

  // Kept (not a duplicate): FIREBASE_API_KEY is rejected by Google in this
  // environment (see the "Environment note" in README.md / BUGS_REPORT.md),
  // so the real e2e suite can never reach a real 200 here — this mocked
  // happy path is the only place the successful-login response shape and
  // Identity-Toolkit-response parsing are verified at all right now.
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

    // "returns 401 for invalid credentials" removed 2026-08-25 — duplicated
    // by the real e2e test "returns 401 for a wrong password against a real
    // account" in src/e2e/auth/AuthController.e2e.test.ts.
  });

  // POST /auth/sync (200 success, 401 missing token) removed 2026-08-25 —
  // both duplicated by real e2e coverage in
  // src/e2e/auth/AuthController.e2e.test.ts, which uses a real Firebase ID
  // token (see helpers/firebaseAuth.ts's getFirebaseToken) rather than a
  // mocked verifyIdToken. See BUGS_REPORT.md / COVERAGE_GAP_REPORT.md.
});
