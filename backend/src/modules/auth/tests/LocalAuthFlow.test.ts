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
    const forgot = await request(app).post('/auth/forgot-password').send({email: 'enum@test.com'});
    const resend = await request(app).post('/auth/resend-verification').send({email: 'enum@test.com'});

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
