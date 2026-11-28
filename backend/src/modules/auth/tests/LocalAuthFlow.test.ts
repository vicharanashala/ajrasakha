import 'reflect-metadata';
import {describe, it, expect, vi, beforeAll, beforeEach, afterEach} from 'vitest';

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

import express from 'express';
import bodyParser from 'body-parser';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {Container, injectable} from 'inversify';
import {
  Authorized,
  CurrentUser,
  Get,
  JsonController,
  UseBefore,
  useContainer,
  useExpressServer,
} from 'routing-controllers';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {AuthController} from '#root/modules/auth/controllers/AuthController.js';
import {FirebaseAuthService} from '#root/modules/auth/services/FirebaseAuthService.js';
import {AUTH_TYPES} from '#root/modules/auth/types.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {authorizationChecker} from '#root/shared/functions/authorizationChecker.js';
import {currentUserChecker} from '#root/shared/functions/currentUserChecker.js';
import {FlexibleAuth} from '#root/shared/functions/flexibleAuth.js';
import {HttpErrorHandler} from '#root/shared/middleware/errorHandler.js';
import {stripSensitiveResponseFields} from '#root/utils/sensitiveResponseFields.js';
import {requestValidationOptions} from '#root/config/validation.js';
import {getFirebaseAuth} from '#root/config/firebaseAdmin.js';
import {sendEmailNotification} from '#root/utils/mailer.js';
import type {IUser} from '#root/shared/interfaces/models.js';
import {
  InMemoryUserRepository,
  STRONG_PASSWORD,
  createFakeDatabase,
  createFakeNotificationService,
  useLocalLoginConfig,
} from './localAuthTestKit.js';

useLocalLoginConfig();
const INTERNAL_API_KEY = 'test-internal-api-key';
process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

/** Minimal routes that exercise the real per-request auth checks. */
@JsonController('/probe')
@injectable()
class AuthProbeController {
  @Authorized()
  @Get('/me')
  me(@CurrentUser() user: IUser) {
    return {user};
  }

  @UseBefore(FlexibleAuth)
  @Get('/flexible')
  flexible() {
    return {ok: true};
  }

  // Simulates an endpoint that returns raw Mongo user documents.
  @Get('/raw-users')
  rawUsers() {
    return {
      user: {email: 'raw@test.com', password: '$2a$10$hash-that-must-not-leak'},
      list: [{nested: {password: 'nested-hash'}, email: 'n@test.com'}],
    };
  }
}

const repo = new InMemoryUserRepository();
const notifications = createFakeNotificationService();
let app: express.Express;

// Builds the app the way index.ts does: global body parser, JSON replacer, real controllers and checkers.
function buildApp(): express.Express {
  const container = new Container();
  container.bind(GLOBAL_TYPES.UserRepository).toConstantValue(repo.asRepository());
  container.bind(GLOBAL_TYPES.Database).toConstantValue(createFakeDatabase());
  container.bind(GLOBAL_TYPES.NotificationService).toConstantValue(notifications);
  container.bind(FirebaseAuthService).toSelf().inSingletonScope();
  container.bind(AUTH_TYPES.AuthService).toService(FirebaseAuthService);
  container.bind(AuthController).toSelf().inSingletonScope();
  container.bind(AuthProbeController).toSelf().inSingletonScope();
  container.bind(FlexibleAuth).toSelf().inSingletonScope();
  container.bind(HttpErrorHandler).toSelf().inSingletonScope();
  useContainer(new InversifyAdapter(container));

  const server = express();
  server.set('json replacer', stripSensitiveResponseFields);
  server.use(bodyParser.json());
  useExpressServer(server, {
    controllers: [AuthController, AuthProbeController],
    middlewares: [HttpErrorHandler],
    defaultErrorHandler: false,
    validation: requestValidationOptions,
    authorizationChecker,
    currentUserChecker,
  });
  return server;
}

// Logs in through the HTTP API and returns the issued token.
async function loginToken(email: string, password = STRONG_PASSWORD): Promise<string> {
  const res = await request(app).post('/auth/login').send({email, password});
  expect(res.status).toBe(200);
  return res.body.idToken;
}

const bearer = (token: string) => ({Authorization: `Bearer ${token}`});

describe('Auth HTTP flow with ENABLE_FIREBASE_LOGIN=false', () => {
  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('signup → pending → admin approval → login → authenticated requests', async () => {
    await repo.seedUser({email: 'flow-admin@test.com', role: 'admin'});

    const signup = await request(app)
      .post('/auth/signup')
      .send({email: 'Flow.User@Test.com', password: STRONG_PASSWORD, firstName: 'Flow'});
    expect(signup.status).toBe(201);
    expect(signup.body.message).toContain('admin approval');
    expect(JSON.stringify(signup.body)).not.toContain('password');
    expect(notifications.saveTheNotifications).toHaveBeenCalledTimes(1);

    const pending = await request(app)
      .post('/auth/login')
      .send({email: 'flow.user@test.com', password: STRONG_PASSWORD});
    expect(pending.status).toBe(401);
    expect(pending.body.message).toContain('pending admin verification');

    // What UserService.verifyUser does when an admin approves the account.
    const stored = repo.getStoredByEmail('flow.user@test.com');
    await repo.edit(stored._id as string, {isVerified: true, isBlocked: false, status: 'active'});

    const login = await request(app)
      .post('/auth/login')
      .send({email: 'FLOW.USER@test.com', password: STRONG_PASSWORD});
    expect(login.status).toBe(200);
    expect(login.body.idToken).toEqual(expect.any(String));
    expect(login.body.localId).toBe(stored.firebaseUID);
    expect(login.body.user.email).toBe('flow.user@test.com');
    expect(JSON.stringify(login.body)).not.toContain(stored.password);
    expect(login.body.user).not.toHaveProperty('password');

    const me = await request(app).get('/probe/me').set(bearer(login.body.idToken));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('flow.user@test.com');
    expect(me.body.user).not.toHaveProperty('password');

    const sync = await request(app).post('/auth/sync').set(bearer(login.body.idToken));
    expect(sync.status).toBe(200);
    expect(sync.body.user.email).toBe('flow.user@test.com');
    expect(sync.body.user).not.toHaveProperty('password');

    expect(getFirebaseAuth).not.toHaveBeenCalled();
  });

  it('rejects protected requests without a genuine token', async () => {
    await repo.seedUser({email: 'tokens@test.com'}, STRONG_PASSWORD);
    const token = await loginToken('tokens@test.com');
    const [header, payload, signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({uid: 'local_someone-else', email: 'x', iat: 0, exp: 9999999999}),
    ).toString('base64url');

    const attempts = [
      {},
      {Authorization: 'Bearer'},
      {Authorization: 'Bearer not-a-token'},
      bearer(`${header}.${forgedPayload}.${signature}`),
      bearer(`${header}.${payload}.${signature.slice(0, -2)}xx`),
      bearer('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJ4In0.c2ln'),
    ];
    for (const headers of attempts) {
      const res = await request(app).get('/probe/me').set(headers);
      expect(res.status).toBe(401);
    }
  });

  it('stops accepting a valid token as soon as the user is blocked', async () => {
    const user = await repo.seedUser({email: 'soon-blocked@test.com'}, STRONG_PASSWORD);
    const token = await loginToken('soon-blocked@test.com');

    await repo.edit(user._id as string, {isBlocked: true});

    const res = await request(app).get('/probe/me').set(bearer(token));
    expect(res.status).toBe(401);
  });

  it('gives identical responses for a wrong password and an unknown email', async () => {
    await repo.seedUser({email: 'enum@test.com'}, STRONG_PASSWORD);

    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({email: 'enum@test.com', password: 'Wr0ng!Password'});
    const unknownEmail = await request(app)
      .post('/auth/login')
      .send({email: 'nobody@test.com', password: 'Wr0ng!Password'});

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe('Invalid email or password');
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });

  it('rejects NoSQL-operator payloads at validation, before any database lookup', async () => {
    const findByEmail = vi.spyOn(repo, 'findByEmail');

    const res = await request(app)
      .post('/auth/login')
      .send({email: {$ne: null}, password: {$ne: null}});

    expect(res.status).toBe(400);
    expect(findByEmail).not.toHaveBeenCalled();
    findByEmail.mockRestore();
  });

  it('does not echo a rejected password back in validation errors', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({email: 'echo@test.com', password: 'Sh0rt!'});

    expect(res.status).toBe(400);
    expect(res.text).not.toContain('Sh0rt!');
  });

  it('locks an account after 10 failed logins, without affecting other accounts', async () => {
    await repo.seedUser({email: 'target@test.com'}, STRONG_PASSWORD);
    await repo.seedUser({email: 'bystander@test.com'}, STRONG_PASSWORD);

    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await request(app)
        .post('/auth/login')
        .send({email: 'target@test.com', password: `Wr0ng!Guess${attempt}`});
      expect(res.status).toBe(401);
    }

    // Even the correct password is refused while locked, and case/space variants share the lock.
    const locked = await request(app)
      .post('/auth/login')
      .send({email: '  TARGET@test.com ', password: STRONG_PASSWORD});
    expect(locked.status).toBe(429);
    expect(locked.body.message).toContain('Too many failed login attempts');

    await loginToken('bystander@test.com');
  });

  it('does not count successful logins toward the lockout', async () => {
    await repo.seedUser({email: 'frequent@test.com'}, STRONG_PASSWORD);

    for (let attempt = 0; attempt < 12; attempt++) {
      await loginToken('frequent@test.com');
    }
  });

  it('changes the password, revokes the old session and keeps the user logged in', async () => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(new Date('2026-04-01T09:00:00Z'));
    await repo.seedUser({email: 'changer@test.com'}, STRONG_PASSWORD);
    const oldToken = await loginToken('changer@test.com');
    const NEW_PASSWORD = 'N3w!Passw0rd';

    const wrongCurrent = await request(app)
      .patch('/auth/change-password')
      .set(bearer(oldToken))
      .send({currentPassword: 'Wr0ng!Password', newPassword: NEW_PASSWORD, newPasswordConfirm: NEW_PASSWORD});
    expect(wrongCurrent.status).toBe(400);
    expect(wrongCurrent.body.message).toBe('Incorrect current password');

    const weak = await request(app)
      .patch('/auth/change-password')
      .set(bearer(oldToken))
      .send({currentPassword: STRONG_PASSWORD, newPassword: 'weakpass', newPasswordConfirm: 'weakpass'});
    expect(weak.status).toBe(400);
    expect(weak.body.message).toContain('uppercase letter');

    vi.setSystemTime(new Date('2026-04-01T09:10:00Z'));
    const changed = await request(app)
      .patch('/auth/change-password')
      .set(bearer(oldToken))
      .send({currentPassword: STRONG_PASSWORD, newPassword: NEW_PASSWORD, newPasswordConfirm: NEW_PASSWORD});
    expect(changed.status).toBe(200);
    expect(changed.body.idToken).toEqual(expect.any(String));

    expect((await request(app).get('/probe/me').set(bearer(oldToken))).status).toBe(401);
    expect((await request(app).get('/probe/me').set(bearer(changed.body.idToken))).status).toBe(200);

    const oldPasswordLogin = await request(app)
      .post('/auth/login')
      .send({email: 'changer@test.com', password: STRONG_PASSWORD});
    expect(oldPasswordLogin.status).toBe(401);
    await loginToken('changer@test.com', NEW_PASSWORD);
  });

  it('requires authentication to change a password', async () => {
    const res = await request(app)
      .patch('/auth/change-password')
      .send({currentPassword: STRONG_PASSWORD, newPassword: 'N3w!Passw0rd', newPasswordConfirm: 'N3w!Passw0rd'});
    expect(res.status).toBe(401);
  });

  it('only lets admins create review system users', async () => {
    await repo.seedUser({email: 'not-admin@test.com', role: 'pae_expert'}, STRONG_PASSWORD);
    await repo.seedUser({email: 'real-admin@test.com', role: 'admin'}, STRONG_PASSWORD);
    const body = {
      email: 'new-coordinator@test.com',
      name: 'New Coordinator',
      password: STRONG_PASSWORD,
      role: 'district_coordinator',
    };

    const asExpert = await request(app)
      .post('/auth/admin/review-users')
      .set(bearer(await loginToken('not-admin@test.com')))
      .send(body);
    expect(asExpert.status).toBe(403);
    expect(repo.getStoredByEmail('new-coordinator@test.com')).toBeUndefined();

    const asAdmin = await request(app)
      .post('/auth/admin/review-users')
      .set(bearer(await loginToken('real-admin@test.com')))
      .send(body);
    expect(asAdmin.status).toBe(201);
    expect(asAdmin.body.user).not.toHaveProperty('password');
    const created = repo.getStoredByEmail('new-coordinator@test.com');
    expect(await bcrypt.compare(STRONG_PASSWORD, created.password)).toBe(true);
  });

  it('rejects Google signup and sends no Firebase emails', async () => {
    const google = await request(app)
      .post('/auth/signup/google')
      .send({email: 'g@test.com', firstName: 'G', lastName: 'User'});
    const forgot = await request(app).post('/auth/forgot-password').send({email: 'no-account@test.com'});
    const resend = await request(app).post('/auth/resend-verification').send({email: 'no-account@test.com'});

    expect(google.status).toBe(400);
    expect(forgot.status).toBe(200);
    expect(resend.status).toBe(200);
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });

  it('never serialises a password field, at any depth', async () => {
    const res = await request(app).get('/probe/raw-users');

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('raw@test.com');
    expect(res.text).not.toContain('password');
    expect(res.text).not.toContain('must-not-leak');
  });

  it('FlexibleAuth accepts local tokens and internal API keys, and nothing else', async () => {
    await repo.seedUser({email: 'flex@test.com'}, STRONG_PASSWORD);
    const token = await loginToken('flex@test.com');

    expect((await request(app).get('/probe/flexible').set(bearer(token))).status).toBe(200);
    expect((await request(app).get('/probe/flexible').set('x-internal-api-key', INTERNAL_API_KEY)).status).toBe(200);
    expect((await request(app).get('/probe/flexible').set(bearer(`${token}x`))).status).toBe(401);
    expect((await request(app).get('/probe/flexible').set('x-internal-api-key', 'wrong-key')).status).toBe(401);
    expect((await request(app).get('/probe/flexible')).status).toBe(401);
  });
});

/** Reads the 6 digit code out of the last reset email that was "sent". */
function lastSentOtp(): string {
  const calls = vi.mocked(sendEmailNotification).mock.calls;
  const text = calls[calls.length - 1][2] as string;
  return text.match(/\b\d{6}\b/)![0];
}

describe('Forgot password with ENABLE_FIREBASE_LOGIN=false', () => {
  const NEW_PASSWORD = 'N3w!Secret#Pass';

  beforeAll(() => {
    app = app ?? buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Requests a code for the email and returns it.
  async function requestOtp(email: string): Promise<string> {
    const res = await request(app).post('/auth/forgot-password').send({email});
    expect(res.status).toBe(200);
    return lastSentOtp();
  }

  // Posts the reset form with sensible defaults.
  const reset = (email: string, otp: string, overrides: Record<string, string> = {}) =>
    request(app)
      .post('/auth/reset-password')
      .send({email, otp, newPassword: NEW_PASSWORD, newPasswordConfirm: NEW_PASSWORD, ...overrides});

  it('emails an HTML code, stores only its hash, and lets the user log in with the new password', async () => {
    await repo.seedUser({email: 'reset1@test.com'}, STRONG_PASSWORD);
    const oldToken = await loginToken('reset1@test.com');
    await new Promise(resolve => setTimeout(resolve, 1100));

    const otp = await requestOtp('reset1@test.com');
    const [to, subject, , html] = vi.mocked(sendEmailNotification).mock.calls[0];
    expect(to).toBe('reset1@test.com');
    expect(subject).toContain('password reset');
    expect(html).toContain('<html');
    expect(html).toContain(otp);

    const stored = repo.getStoredByEmail('reset1@test.com');
    expect(JSON.stringify(stored.passwordReset)).not.toContain(otp);
    expect(await bcrypt.compare(otp, stored.passwordReset!.otpHash)).toBe(true);

    const res = await reset('reset1@test.com', otp);
    expect(res.status).toBe(200);

    const after = repo.getStoredByEmail('reset1@test.com');
    expect(after.passwordReset).toBeNull();
    expect(after.password).not.toBe(NEW_PASSWORD);
    expect(await bcrypt.compare(NEW_PASSWORD, after.password)).toBe(true);

    expect((await request(app).post('/auth/login').send({email: 'reset1@test.com', password: STRONG_PASSWORD})).status).toBe(401);
    expect((await request(app).post('/auth/login').send({email: 'reset1@test.com', password: NEW_PASSWORD})).status).toBe(200);
    // Sessions created before the reset are revoked.
    expect((await request(app).get('/probe/me').set(bearer(oldToken))).status).toBe(401);
  });

  it('answers the same for unknown, unverified and inactive accounts and sends nothing', async () => {
    await repo.seedUser({email: 'pending-reset@test.com', isVerified: false}, STRONG_PASSWORD);
    await repo.seedUser({email: 'blocked-reset@test.com', isBlocked: true}, STRONG_PASSWORD);
    const known = await request(app).post('/auth/forgot-password').send({email: 'nobody-reset@test.com'});

    for (const email of ['nobody-reset@test.com', 'pending-reset@test.com', 'blocked-reset@test.com']) {
      const res = await request(app).post('/auth/forgot-password').send({email});
      expect(res.status).toBe(200);
      expect(res.body).toEqual(known.body);
    }
    expect(sendEmailNotification).not.toHaveBeenCalled();
  });

  it('does not resend within the cooldown', async () => {
    await repo.seedUser({email: 'cooldown@test.com'}, STRONG_PASSWORD);
    await requestOtp('cooldown@test.com');
    await request(app).post('/auth/forgot-password').send({email: 'cooldown@test.com'});

    expect(sendEmailNotification).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong code, an expired code and a reused code with the same message', async () => {
    await repo.seedUser({email: 'codes@test.com'}, STRONG_PASSWORD);
    const otp = await requestOtp('codes@test.com');
    const wrong = otp === '000000' ? '111111' : '000000';

    const wrongRes = await reset('codes@test.com', wrong);
    expect(wrongRes.status).toBe(400);

    const stored = repo.getStoredByEmail('codes@test.com');
    await repo.edit(stored._id as string, {passwordReset: {...stored.passwordReset!, expiresAt: new Date(Date.now() - 1000)}});
    const expiredRes = await reset('codes@test.com', otp);
    expect(expiredRes.status).toBe(400);
    expect(expiredRes.body.message).toBe(wrongRes.body.message);

    const unknownRes = await reset('nobody-codes@test.com', otp);
    expect(unknownRes.status).toBe(400);
    expect(unknownRes.body.message).toBe(wrongRes.body.message);

    await repo.edit(stored._id as string, {passwordReset: {...stored.passwordReset!, expiresAt: new Date(Date.now() + 60000)}});
    expect((await reset('codes@test.com', otp)).status).toBe(200);
    expect((await reset('codes@test.com', otp)).status).toBe(400);
  });

  it('locks the code after too many wrong attempts, even if the right code follows', async () => {
    await repo.seedUser({email: 'lock@test.com'}, STRONG_PASSWORD);
    const otp = await requestOtp('lock@test.com');
    const wrong = otp === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await reset('lock@test.com', wrong)).status).toBe(400);
    }
    expect((await reset('lock@test.com', otp)).status).toBe(400);
    const stored = repo.getStoredByEmail('lock@test.com');
    expect(await bcrypt.compare(STRONG_PASSWORD, stored.password)).toBe(true);
  });

  it('validates the new password and the request shape', async () => {
    await repo.seedUser({email: 'validate@test.com'}, STRONG_PASSWORD);
    const otp = await requestOtp('validate@test.com');

    expect((await reset('validate@test.com', otp, {newPassword: 'weakpass', newPasswordConfirm: 'weakpass'})).status).toBe(400);
    expect((await reset('validate@test.com', otp, {newPasswordConfirm: 'Different1!Pass'})).status).toBe(400);
    expect((await reset('validate@test.com', otp, {newPassword: 'Aa1!' + 'x'.repeat(80), newPasswordConfirm: 'Aa1!' + 'x'.repeat(80)})).status).toBe(400);
    expect((await reset('validate@test.com', '12ab56')).status).toBe(400);
    expect((await reset('not-an-email', otp)).status).toBe(400);

    // None of the rejected attempts used up or changed anything.
    expect((await reset('validate@test.com', otp)).status).toBe(200);
  });

  it('never returns the stored code hash from any endpoint', async () => {
    await repo.seedUser({email: 'leak@test.com'}, STRONG_PASSWORD);
    await requestOtp('leak@test.com');
    const token = await loginToken('leak@test.com');

    const me = await request(app).get('/probe/me').set(bearer(token));
    const sync = await request(app).post('/auth/sync').set(bearer(token));
    expect(me.text).not.toContain('otpHash');
    expect(sync.text).not.toContain('otpHash');
  });

  it('rate limits reset attempts per email', async () => {
    await repo.seedUser({email: 'limit-reset@test.com'}, STRONG_PASSWORD);
    let lastStatus = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      lastStatus = (await reset('limit-reset@test.com', '000000')).status;
    }
    expect(lastStatus).toBe(429);
  });
});
