import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { buildHttpTestApp } from '../helpers/http-app.js';

// Roadmap item 4 (broader auth/authz tests). Scope: UserController is the
// only controller in the app using the role-array form of the decorator
// (`@Authorized(['admin'])` / `@Authorized(['call_agent'])`) - every other
// controller in the codebase uses bare `@Authorized()`, which this app's
// authorizationChecker was always meant to handle (any authenticated,
// active, non-blocked user). So UserController is the entire surface for
// the finding below.
vi.mock('plivo', () => ({
  default: {
    Client: vi.fn().mockImplementation(() => ({ calls: { list: vi.fn() } })),
  },
}));

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('#root/config/firebaseAdmin.js', () => ({
  getFirebaseAuth: () => ({ verifyIdToken }),
  ensureFirebaseAdminInitialized: () => {},
}));

describe('ACC user role authorization (real Express + routing-controllers + MongoDB)', () => {
  let app: Express;
  let stop: () => Promise<void>;
  let getContainer: () => { get: (id: unknown) => any };
  let GLOBAL_TYPES: any;
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    // UserService methods run inside BaseService._withTransaction
    // (session.startTransaction()), which a standalone mongodb-memory-server
    // rejects outright - same gotcha as the WS harness. Use a real 1-node
    // replica set here too, matching how production Mongo (Atlas) is
    // deployed.
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const built = await buildHttpTestApp({ mongoUri: replSet.getUri() });
    app = built.app;
    stop = built.stop;
    ({ getContainer } = await import('#root/bootstrap/loadModules.js'));
    ({ GLOBAL_TYPES } = await import('#root/types.js'));
  }, 60000);

  afterAll(async () => {
    await stop();
    await replSet.stop();
  });

  beforeEach(async () => {
    verifyIdToken.mockReset();
    const database = getContainer().get(GLOBAL_TYPES.Database);
    const db = await database.init();
    await db.collection('users').deleteMany({});
  });

  async function seedUser(overrides: Record<string, unknown>) {
    const database = getContainer().get(GLOBAL_TYPES.Database);
    const db = await database.init();
    const result = await db.collection('users').insertOne({
      email: 'user@example.test',
      firstName: 'User',
      isBlocked: false,
      ...overrides,
    });
    return result.insertedId;
  }

  function authAs(firebaseUID: string) {
    verifyIdToken.mockResolvedValue({ uid: firebaseUID });
    return { Authorization: 'Bearer fake-token-for-' + firebaseUID };
  }

  // FINDING (severity: high, not fixed - see feedback_testers_only_no_app_fixes
  // in memory): shared/functions/authorizationChecker.ts is declared as
  // `authorizationChecker(action)` - a single parameter. routing-controllers'
  // ExpressDriver always calls it as
  // `authorizationChecker(action, actionMetadata.authorizedRoles)` and treats
  // its return value as the *entire* authorization decision (see
  // driver/express/ExpressDriver.js registerAction: `handleError(checkResult)`
  // has no further role comparison of its own). Because this app's checker
  // never reads its second parameter, `@Authorized(['admin'])` and
  // `@Authorized(['call_agent'])` are functionally identical to bare
  // `@Authorized()` everywhere they're used - any authenticated, active,
  // non-blocked user of ANY role passes, regardless of the role array.
  //
  // UserController is the only controller using the role-array form, on 6
  // routes. Four of them happen to be independently guarded by an explicit
  // role check inside UserService (defense in depth: setCallAgentStatus/
  // toggleCallAgentActive check `requestingUserRole !== 'admin'`;
  // setAgentOnline/setAgentOffline/updateAgentHeartbeat check
  // `user.role !== 'call_agent'`), so they're not exploitable in practice.
  // The remaining two - `GET /users/call-agents` and `GET /users/list`, both
  // intended to be admin-only - have NO such service-level check, so they
  // are a genuine information-disclosure vulnerability: any authenticated
  // user, of any role, can list every call agent and every
  // expert/user in the system.
  describe('KNOWN FINDING: @Authorized(["admin"]) does not enforce the admin role', () => {
    it('lets a non-admin (role: expert) list all call agents via the admin-only /call-agents route', async () => {
      await seedUser({ firebaseUID: 'fb-expert', role: 'expert' });
      const headers = authAs('fb-expert');

      const res = await request(app).get('/api/users/call-agents').set(headers);

      expect(res.status).toBe(200);
    });

    it('lets a non-admin (role: expert) list all users via the admin-only /list route', async () => {
      await seedUser({ firebaseUID: 'fb-expert', role: 'expert' });
      const headers = authAs('fb-expert');

      const res = await request(app).get('/api/users/list').set(headers);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('experts');
    });
  });

  describe('routes still protected in practice by a service-level role check (defense in depth)', () => {
    it('rejects a non-admin from /set-call-agents with 403, even though @Authorized(["admin"]) itself would have let them through', async () => {
      const targetId = await seedUser({ firebaseUID: 'fb-target', role: 'expert', agent: 'not_available' });
      await seedUser({ firebaseUID: 'fb-expert', role: 'expert' });
      const headers = authAs('fb-expert');

      const res = await request(app)
        .post('/api/users/set-call-agents')
        .set(headers)
        .send({ userId: targetId.toString(), isCallAgent: true, isCallAgentActive: true });

      expect(res.status).toBe(403);
    });

    it('rejects a non-call_agent from /call-agents/toggle-status with 400, even though @Authorized(["call_agent"]) itself would have let them through', async () => {
      await seedUser({ firebaseUID: 'fb-admin', role: 'admin' });
      const headers = authAs('fb-admin');

      const res = await request(app)
        .post('/api/users/call-agents/toggle-status')
        .set(headers)
        .send({ online: true });

      expect(res.status).toBe(400);
    });
  });

  describe('the authorizationChecker mechanism itself still works for authentication', () => {
    // Deliberately using /me (bare @Authorized(), authorizedRoles: []) rather
    // than a role-array route here: routing-controllers' ExpressDriver maps
    // a falsy checkResult to AuthorizationRequiredError (401) only when
    // authorizedRoles.length === 0, and to AccessDeniedError (403) whenever
    // it's non-empty - regardless of whether the actual reason was "no
    // token" or "wrong role". So /list (@Authorized(['admin'])) returns 403
    // for an unauthenticated request too, which would conflate this
    // assertion with the finding above rather than testing authentication
    // in isolation.
    it('rejects an unauthenticated request to an @Authorized() route with 401', async () => {
      const res = await request(app).get('/api/users/me');

      expect(res.status).toBe(401);
    });

    it('rejects a request whose Firebase token fails verification with 401', async () => {
      verifyIdToken.mockRejectedValue(new Error('invalid token'));

      const res = await request(app).get('/api/users/me').set({ Authorization: 'Bearer garbage' });

      expect(res.status).toBe(401);
    });

    it('rejects a blocked user with 401 even with a valid token', async () => {
      // authorizationChecker only reads `isBlocked` for roles other than
      // 'moderator'/'expert' (those two are gated by `status === 'in-active'`
      // instead) - use 'call_agent' here so the isBlocked branch is the one
      // actually exercised.
      await seedUser({ firebaseUID: 'fb-blocked', role: 'call_agent', isBlocked: true });
      const headers = authAs('fb-blocked');

      const res = await request(app).get('/api/users/me').set(headers);

      expect(res.status).toBe(401);
    });
  });
});
