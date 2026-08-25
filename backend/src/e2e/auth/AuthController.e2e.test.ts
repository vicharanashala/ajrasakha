/**
 * Auth Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * All 8 routes on AuthController, against the REAL Mongo DB configured in `.env`
 * AND the real Firebase project configured via FIREBASE_* env vars:
 *
 *   POST   /api/auth/signup                       (Firebase user creation)
 *   POST   /api/auth/signup/google                (Google-token signup — happy path untestable, see below)
 *   POST   /api/auth/admin/review-users            (admin-only coordinator creation)
 *   PATCH  /api/auth/change-password               (authenticated password change)
 *   POST   /api/auth/resend-verification
 *   POST   /api/auth/forgot-password
 *   POST   /api/auth/login                         (real Firebase Identity Toolkit call)
 *   POST   /api/auth/sync                          (real Firebase ID token verification)
 *
 * STRATEGY
 * --------
 * Same in-process harness as every other e2e suite (`loadAppModules('all')` against
 * the real DB), BUT unlike every other suite this one also makes REAL network calls
 * to Firebase — both the Admin SDK (`getFirebaseAuth()`, same helper `FirebaseAuthService`
 * uses internally) and the public Identity Toolkit REST API (`helpers/firebaseAuth.ts`,
 * previously unused dead code from before the in-process conversion — this suite is
 * exactly what it was written for).
 *
 * SIDE-EFFECT SAFETY
 * -------------------
 * `FirebaseAuthService.sendVerificationEmail` / `sendPasswordResetEmail` both
 * short-circuit at the top with `if (appConfig.isDevelopment) return;`. The harness
 * forces `NODE_ENV=development` (see below), so **no real email is ever sent** by
 * this suite — signup/resend-verification/forgot-password are safe to exercise for
 * real.
 *
 * `signup` and `admin/review-users` DO create real Firebase Auth users. Every UID
 * created is tracked in `createdFirebaseUids` and deleted via the Admin SDK in
 * `afterAll`. `admin/review-users` also creates a real Mongo `users` doc — tracked
 * in `createdDbUserIds` and deleted the same way.
 *
 * The shared fixture accounts (`ADMIN_EMAIL`/`MODERATOR_EMAIL`/etc.) are NEVER
 * mutated — `change-password` is exercised against a throwaway account created by
 * this suite's own `admin/review-users` test, not against the shared fixtures other
 * suites depend on.
 */

process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({path: '.env'});
dotenv.config({path: '.env.test'});

import express from 'express';
import request from 'supertest';
import {useExpressServer} from 'routing-controllers';
import {ObjectId} from 'mongodb';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {getFirebaseToken} from '../helpers/firebaseAuth.js';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_AUTH_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-auth-key';

let app: express.Express;
let db: any;
let firebaseAuth: any;
let adminUser: any;
let moderatorUser: any;

let currentTestUser: any = null;

const createdFirebaseUids: string[] = [];
const createdDbUserIds: string[] = [];

// Throwaway account created via /signup, reused by the /signup duplicate-email
// and /resend-verification tests.
const signupEmail = `${RUN_TAG.toLowerCase()}-signup@example.com`;
let signupUid: string;

// Throwaway coordinator account created via /admin/review-users, reused by
// /change-password (so the shared fixture accounts are never mutated).
const reviewUserEmail = `${RUN_TAG.toLowerCase()}-review@example.com`;
const reviewUserPassword = 'Initial#Pass1';
let reviewUserFirebaseUser: any;

beforeAll(async () => {
  await import('#root/modules/answer/services/AnswerService.js');

  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const {loadAppModules, getContainer} =
    await import('#root/bootstrap/loadModules.js');
  const {GLOBAL_TYPES} = await import('#root/types.js');
  const {getFirebaseAuth} = await import('#root/config/firebaseAdmin.js');

  const {controllers} = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);
  firebaseAuth = getFirebaseAuth();

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  const users = await db.getCollection('users');
  [adminUser, moderatorUser] = await Promise.all([
    users.findOne({email: process.env.ADMIN_EMAIL}),
    users.findOne({email: process.env.MODERATOR_EMAIL}),
  ]);

  const missing = [
    !adminUser && `ADMIN_EMAIL=${process.env.ADMIN_EMAIL}`,
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Test users not found in DB — ensure seed data exists for: ${missing.join(', ')}`,
    );
  }

  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;

  for (const uid of createdFirebaseUids) {
    await firebaseAuth.deleteUser(uid).catch(() => {});
  }
  console.log(
    `[teardown] Attempted cleanup of ${createdFirebaseUids.length} Firebase user(s).`,
  );

  if (db && createdDbUserIds.length) {
    const users = await db.getCollection('users');
    for (const id of createdDbUserIds) {
      await users.deleteOne({_id: new ObjectId(id)}).catch(() => {});
    }
    console.log(
      `[teardown] Attempted cleanup of ${createdDbUserIds.length} DB user doc(s).`,
    );
  }

  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPatch(path: string) {
  return request(app).patch(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

// ════════════════════════════════════════════════════════════════════════════
// Global auth gate — InternalApiAuth applies to /auth routes too
// ════════════════════════════════════════════════════════════════════════════

describe('Global auth gate', () => {
  it('returns 401 when internal API key is missing (even on a public auth route)', async () => {
    const res = await request(app)
      .post(`${ROUTE_PREFIX}/auth/login`)
      .send({email: 'x@example.com', password: 'irrelevant'});

    console.log('STATUS:', res.status);
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /auth/signup
// ════════════════════════════════════════════════════════════════════════════

describe('POST /auth/signup', () => {
  it('rejects a blank first name before any Firebase call (no side effect)', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/signup`).send({
      email: `${RUN_TAG.toLowerCase()}-blankname@example.com`,
      password: 'StrongPass123!',
      firstName: '   ',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid email format', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/signup`).send({
      email: 'not-an-email',
      password: 'StrongPass123!',
      firstName: 'Test',
    });

    expect(res.status).toBe(400);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/signup`).send({
      email: `${RUN_TAG.toLowerCase()}-shortpw@example.com`,
      password: 'short',
      firstName: 'Test',
    });

    expect(res.status).toBe(400);
  });

  it('creates a new Firebase user and returns 201', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/signup`).send({
      email: signupEmail,
      password: 'StrongPass123!',
      firstName: 'E2E',
      lastName: 'Signup',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(signupEmail);
    expect(res.body.user.uid).toBeTruthy();

    signupUid = res.body.user.uid;
    createdFirebaseUids.push(signupUid);
  });

  it('re-signup with the same still-unverified email updates the existing Firebase user (201, not a conflict)', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/signup`).send({
      email: signupEmail,
      password: 'StrongPass123!New',
      firstName: 'E2E',
      lastName: 'SignupUpdated',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));

    // FirebaseAuthService.signup: an unverified existing account is updated in
    // place and re-signup succeeds — only a VERIFIED existing account 400s.
    expect(res.status).toBe(201);
    expect(res.body.user.uid).toBe(signupUid);
  });

  it('rejects signup with an email that already belongs to a VERIFIED account', async () => {
    // Build our own verified fixture rather than reusing a shared test account —
    // ADMIN_EMAIL/MODERATOR_EMAIL are unverified in this Firebase project, so
    // signup against them would take the "update unverified user" branch instead
    // (and mutate a password other suites depend on — do not do that here).
    const verifiedEmail = `${RUN_TAG.toLowerCase()}-verified@example.com`;
    const created = await firebaseAuth.createUser({
      email: verifiedEmail,
      password: 'FixtureOnly123!',
      emailVerified: true,
    });
    createdFirebaseUids.push(created.uid);

    const res = await apiPost(`${ROUTE_PREFIX}/auth/signup`).send({
      email: verifiedEmail,
      password: 'StrongPass123!',
      firstName: 'Impersonator',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /auth/signup/google
// ════════════════════════════════════════════════════════════════════════════

describe('POST /auth/signup/google', () => {
  it('errors when no Authorization header is present (happy path needs a real Google ID token — untestable headlessly)', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/signup/google`).send({
      email: 'nobody@example.com',
      firstName: 'Nobody',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    // googleSignup() has no try/catch in the controller — verifyIdToken(undefined)
    // throws, and defaultErrorHandler turns any non-HttpError into 500.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /auth/admin/review-users
// ════════════════════════════════════════════════════════════════════════════

describe('POST /auth/admin/review-users', () => {
  // BUG-017 (see README "Known bugs"): the production authorizationChecker never
  // reads the `roles` array routing-controllers passes for `@Authorized(['admin'])`
  // — it only checks that SOME authenticated user is present. So despite the
  // decorator, a moderator can call this admin-only endpoint successfully. This
  // test documents the actual (buggy) behavior rather than the intended one.
  it('BUG-017: a non-admin (moderator) is NOT blocked — @Authorized(["admin"]) role array is not enforced', async () => {
    currentTestUser = moderatorUser;
    const email = `${RUN_TAG.toLowerCase()}-nonadmin-created@example.com`;

    const res = await apiPost(`${ROUTE_PREFIX}/auth/admin/review-users`).send({
      email,
      name: 'Non Admin Created',
      password: 'StrongPass123!',
      role: 'village_volunteer',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);

    // Clean up — track by looking the created doc up in Mongo (firebaseUID is
    // stripped from the API response by UserRepository.findById's projection).
    const users = await db.getCollection('users');
    const doc = await users.findOne({email});
    if (doc) {
      createdFirebaseUids.push(doc.firebaseUID);
      createdDbUserIds.push(doc._id.toString());
    }
  });

  it('rejects an invalid coordinator role', async () => {
    currentTestUser = adminUser;

    const res = await apiPost(`${ROUTE_PREFIX}/auth/admin/review-users`).send({
      email: 'bad-role@example.com',
      name: 'Bad Role',
      password: 'StrongPass123!',
      role: 'not_a_real_role',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });

  it('admin creates a review-system (coordinator) user — 201', async () => {
    currentTestUser = adminUser;

    const res = await apiPost(`${ROUTE_PREFIX}/auth/admin/review-users`).send({
      email: reviewUserEmail,
      name: 'E2E Review User',
      password: reviewUserPassword,
      role: 'village_volunteer',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(reviewUserEmail);
    expect(res.body.user.role).toBe('village_volunteer');
    // firebaseUID is deliberately stripped from the API response by
    // UserRepository.findById's projection ({ firebaseUID: 0 }) — fetch the
    // real doc from Mongo directly for cleanup + to use as currentTestUser below.
    const users = await db.getCollection('users');
    const doc = await users.findOne({email: reviewUserEmail});
    expect(doc?.firebaseUID).toBeTruthy();

    reviewUserFirebaseUser = doc;
    createdFirebaseUids.push(doc.firebaseUID);
    createdDbUserIds.push(doc._id.toString());
  });

  it('rejects creating the same review user twice (already exists)', async () => {
    currentTestUser = adminUser;

    const res = await apiPost(`${ROUTE_PREFIX}/auth/admin/review-users`).send({
      email: reviewUserEmail,
      name: 'E2E Review User Dup',
      password: reviewUserPassword,
      role: 'village_volunteer',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /auth/change-password
// ════════════════════════════════════════════════════════════════════════════

describe('PATCH /auth/change-password', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;

    const res = await apiPatch(`${ROUTE_PREFIX}/auth/change-password`).send({
      newPassword: 'Whatever123!',
      newPasswordConfirm: 'Whatever123!',
    });

    expect(res.status).toBe(401);
  });

  // BUG-018 (see README "Known bugs"): changePassword() reads the current user via
  // @Req() request.user (raw Express), NOT @CurrentUser(). No middleware in this
  // codebase ever sets req.user (the one place that did, modules/auth/index.ts's
  // authModuleOptions, is dead code — never imported/wired into the real app's
  // bootstrap in src/index.ts). So requestUser is always undefined, `.firebaseUID`
  // throws a TypeError, and the outer catch's `error instanceof Error` branch
  // turns that into a 500 — for EVERY call, mismatched passwords or not, in the
  // real app too. This is not a test-harness artifact.
  it('BUG-018: always 500s regardless of input — request.user is never populated (@Req() reads raw Express req.user, which no middleware sets)', async () => {
    currentTestUser = reviewUserFirebaseUser;

    const res = await apiPatch(`${ROUTE_PREFIX}/auth/change-password`).send({
      newPassword: 'NewPass123!',
      newPasswordConfirm: 'DoesNotMatch123!',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(500);
  });

  it('BUG-018: even with matching passwords and a real authenticated user, still 500s', async () => {
    currentTestUser = reviewUserFirebaseUser;

    const res = await apiPatch(`${ROUTE_PREFIX}/auth/change-password`).send({
      newPassword: 'RotatedPass123!',
      newPasswordConfirm: 'RotatedPass123!',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /auth/resend-verification
// ════════════════════════════════════════════════════════════════════════════

describe('POST /auth/resend-verification', () => {
  it('rejects a malformed email', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/resend-verification`).send({
      email: 'not-an-email',
    });

    expect(res.status).toBe(400);
  });

  it('returns 200 for a well-formed email (no email actually sent — dev short-circuit)', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/resend-verification`).send({
      email: signupEmail,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /auth/forgot-password
// ════════════════════════════════════════════════════════════════════════════

describe('POST /auth/forgot-password', () => {
  it('rejects a malformed email', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/forgot-password`).send({
      email: 'not-an-email',
    });

    expect(res.status).toBe(400);
  });

  it('returns 200 for a registered email', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/forgot-password`).send({
      email: process.env.ADMIN_EMAIL,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('also returns 200 for a non-existent email (enumeration protection)', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/forgot-password`).send({
      email: `${RUN_TAG.toLowerCase()}-nobody@example.com`,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /auth/login  (real Firebase Identity Toolkit call)
// ════════════════════════════════════════════════════════════════════════════

describe('POST /auth/login', () => {
  it('rejects a malformed email', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/login`).send({
      email: 'not-an-email',
      password: 'whatever',
    });

    expect(res.status).toBe(400);
  });

  it('returns 401 for a wrong password against a real account', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/login`).send({
      email: process.env.ADMIN_EMAIL,
      password: 'definitely-the-wrong-password',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(401);
  }, 30000);

  // ENVIRONMENT ISSUE (not asserted as a code bug — see AuthController.e2e.md):
  // this route calls Identity Toolkit using appConfig.firebase.apiKey, sourced
  // from FIREBASE_API_KEY in .env. In THIS environment that key is rejected by
  // Google ("API key not valid") even with fully correct credentials — while
  // FIREBASE_WEB_API_KEY (a separate env var, used only by helpers/firebaseAuth.ts
  // and by getFirebaseAuth()'s callers) works fine, as proven by the /sync test
  // below succeeding with a token minted via that key. Worth checking whether
  // FIREBASE_API_KEY in .env is stale — right now, in this environment, NO ONE
  // can log in through POST /auth/login regardless of credentials.
  it('ENV ISSUE: correct credentials still 401 — FIREBASE_API_KEY (used by this route) is rejected by Google in this environment', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/login`).send({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/API key not valid/i);
  }, 30000);
});

// ════════════════════════════════════════════════════════════════════════════
// POST /auth/sync  (real Firebase ID token verification)
// ════════════════════════════════════════════════════════════════════════════

describe('POST /auth/sync', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/sync`);

    expect(res.status).toBe(401);
  });

  it('returns 500 for a garbage token (verifyIdToken throws a non-HttpError)', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/auth/sync`).set(
      'Authorization',
      'Bearer this-is-not-a-real-token',
    );

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(500);
  });

  it('syncs successfully with a real, valid Firebase ID token', async () => {
    const token = await getFirebaseToken(
      process.env.ADMIN_EMAIL!,
      process.env.ADMIN_PASSWORD!,
    );

    const res = await apiPost(`${ROUTE_PREFIX}/auth/sync`).set(
      'Authorization',
      `Bearer ${token}`,
    );

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(process.env.ADMIN_EMAIL);

    // BUG-019 (see README "Known bugs"): syncUserWithDb() returns the raw Mongo
    // user doc — including the bcrypt password hash — and the controller ships
    // it straight to the client. Documented here rather than silently ignored.
    expect(res.body.user.password).toBeTruthy();
  }, 30000);
});
