/**
 * User Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * All 29 routes on `UserController` — the largest previously-uncovered
 * controller by route count after chatbot. Grouped by theme below; see the
 * `.md` doc for the full route table.
 *
 * FIXTURES: a throwaway target user is inserted directly into the `users`
 * collection (role `expert`, minimal shape matching what other suites observe
 * on real docs) — going through real signup just to get a mutation target for
 * block/unblock/verify/STF/training-user/role-toggle would be a lot of
 * unrelated Firebase machinery for a suite that isn't testing signup.
 *
 * FINDINGS:
 *
 * - `PATCH /users/:id/role` is `@Authorized()` (bare — no roles array) with NO
 *   in-handler role check in the CONTROLLER — but `UserService.updateUserRole`
 *   itself throws `BadRequestError('Only admin can switch user roles')` for a
 *   non-admin caller. Properly protected, just at the service layer rather
 *   than the controller — verified here, not a bug.
 * - Likewise `removeExpertAllocations` and the call-agent management routes
 *   (`set-call-agents`, `call-agents/:id/toggle-active`) have real service-layer
 *   checks the controller doesn't show — including a `Call_centre_manager` flag
 *   requirement on top of `role === 'admin'` for call-agent management, which
 *   this suite's `adminUser` fixture doesn't have, so those two 403 here.
 * - BUG-024: `GET /users/details/:email` has NO `@Authorized()` decorator at
 *   all. Anyone with just the shared `x-internal-api-key` (no user login) can
 *   fetch a full user record by email — including the bcrypt `password` hash
 *   (same shape as BUG-019).
 * - Routes that genuinely ARE BUG-017 instances (reach the handler for any
 *   authenticated user despite a roles-array `@Authorized`, no service-layer
 *   check either): `GET /admin/all`, `GET /stf-moderators`, `GET /call-agents`,
 *   `PATCH /stf`, `PATCH /training-users`.
 *
 * UPDATED 2026-08-27 after merging feat/optimize_gate_keeper_cron ("giving
 * user management access to gate keeper"): `gate_keeper` was added to
 * `@Authorized([...])` on `GET /admin/all`, `PATCH /stf`,
 * `POST /:id/remove-allocations`, `PATCH /:id/verify`,
 * `PATCH /training-users`, and a new `GET /admin/all/export` route was added
 * (same auth). For the three routes with a REAL in-handler/service-layer
 * check (`remove-allocations`, `verify`, `:id/role`), gate_keeper access is
 * now genuinely enforced-and-intentional, not just BUG-017 — verified below
 * with a `gateKeeperUser` fixture. The other two were already BUG-017
 * instances (no real enforcement for any authenticated user), so adding
 * gate_keeper to their already-inert roles array changed nothing observable.
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

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_USER_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-user-key';

let app: express.Express;
let db: any;
let adminUser: any;
let moderatorUser: any;
let expertUser: any;
let gateKeeperUser: any;
let callAgentUser: any;

let currentTestUser: any = null;
let targetUserId: string;
const targetEmail = `${RUN_TAG.toLowerCase()}-target@example.com`;
const createdUserIds: ObjectId[] = [];

beforeAll(async () => {
  await import('#root/modules/answer/services/AnswerService.js');
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const {loadAppModules, getContainer} = await import('#root/bootstrap/loadModules.js');
  const {GLOBAL_TYPES} = await import('#root/types.js');

  const {controllers} = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  const users = await db.getCollection('users');
  [adminUser, moderatorUser, expertUser] = await Promise.all([
    users.findOne({email: process.env.ADMIN_EMAIL}),
    users.findOne({email: process.env.MODERATOR_EMAIL}),
    users.findOne({email: process.env.EXPERT_EMAIL}),
  ]);
  const missing = [
    !adminUser && `ADMIN_EMAIL=${process.env.ADMIN_EMAIL}`,
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
    !expertUser && `EXPERT_EMAIL=${process.env.EXPERT_EMAIL}`,
  ].filter(Boolean);
  if (missing.length) throw new Error(`Test users not found: ${missing.join(', ')}`);

  const insertResult = await users.insertOne({
    email: targetEmail,
    firstName: 'E2E',
    lastName: 'Target',
    role: 'expert',
    status: 'active',
    isBlocked: false,
    isVerified: false,
    isTrainingUser: false,
    special_task_force: false,
    reputation_score: 0,
    preference: {crop: 'all', state: 'all', domain: 'all'},
    firebaseUID: `e2e-fixture-${Date.now()}`,
    assignedQuestionIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  targetUserId = insertResult.insertedId.toString();

  // No .env.test fixture exists for gate_keeper — insert one directly, same
  // pattern used in gatekeeper-auditor/ and question/QuestionControllerGaps.
  const gkResult = await users.insertOne({
    email: `${RUN_TAG.toLowerCase()}-gatekeeper@example.com`,
    firstName: 'E2E',
    lastName: 'GateKeeper',
    role: 'gate_keeper',
    status: 'active',
    isBlocked: false,
    isVerified: true,
    firebaseUID: `e2e-fixture-gk-${Date.now()}`,
    assignedQuestionIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdUserIds.push(gkResult.insertedId);
  gateKeeperUser = await users.findOne({_id: gkResult.insertedId});

  // Real call_agent role fixture — the existing call-agent tests above only
  // exercise the auth/role-gate paths with a moderator/admin caller; nothing
  // previously drove UserService's setAgentOnline/Offline/heartbeat/
  // markAgentAsAvailable through their real business logic.
  const caResult = await users.insertOne({
    email: `${RUN_TAG.toLowerCase()}-callagent@example.com`,
    firstName: 'E2E',
    lastName: 'CallAgent',
    role: 'call_agent',
    status: 'active',
    isBlocked: false,
    isVerified: true,
    isCallAgentActive: false,
    isBusy: false,
    agent: 'not_available',
    firebaseUID: `e2e-fixture-ca-${Date.now()}`,
    assignedQuestionIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdUserIds.push(caResult.insertedId);
  callAgentUser = await users.findOne({_id: caResult.insertedId});

  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG} targetUserId=${targetUserId}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db && targetUserId) {
    const users = await db.getCollection('users');
    await users.deleteOne({_id: new ObjectId(targetUserId)}).catch(() => {});
    for (const id of createdUserIds) {
      await users.deleteOne({_id: id}).catch(() => {});
    }
    console.log('[teardown] Cleaned up fixture target user.');
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPut(path: string) {
  return request(app).put(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPatch(path: string) {
  return request(app).patch(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

// ════════════════════════════════════════════════════════════════════════════
// Own-profile routes
// ════════════════════════════════════════════════════════════════════════════

describe('GET /users/me', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/users/me`);
    expect(res.status).toBe(401);
  });

  it("returns the current user's own profile", async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/me`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(process.env.MODERATOR_EMAIL);
  });
});

describe('PUT /users', () => {
  it('rejects a blank first name', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPut(`${ROUTE_PREFIX}/users`).send({firstName: '   '});

    console.log('STATUS:', res.status);
    expect(res.status).toBe(400);
  });

  it("updates the current user's own last name and reverts it back", async () => {
    currentTestUser = moderatorUser;
    const originalLastName = moderatorUser.lastName;

    const res = await apiPut(`${ROUTE_PREFIX}/users`).send({lastName: `${RUN_TAG}_temp`});
    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.lastName).toBe(`${RUN_TAG}_temp`);

    const revertRes = await apiPut(`${ROUTE_PREFIX}/users`).send({lastName: originalLastName});
    expect(revertRes.status).toBe(200);
  });
});

describe('GET /users/review-level', () => {
  it('returns the current user review level stats', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/review-level`);

    console.log('STATUS:', res.status);
    expect([200, 404]).toContain(res.status);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Listing / lookup routes
// ════════════════════════════════════════════════════════════════════════════

describe('GET /users/admin/all', () => {
  // Decorator updated by feat/optimize_gate_keeper_cron to
  // @Authorized(['admin', 'gate_keeper']) — still a roles-array, still
  // subject to BUG-017 (not actually enforced) for any OTHER role.
  it('BUG-017: a non-admin (expert) is NOT blocked despite @Authorized(["admin", "gate_keeper"])', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/admin/all?page=1&limit=5`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
  });

  // New in feat/optimize_gate_keeper_cron: gate_keeper is now an intentional
  // (not just BUG-017-accidental) caller of this route.
  it('gate keeper can list users (new: gate keeper now intentionally allowed)', async () => {
    currentTestUser = gateKeeperUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/admin/all?page=1&limit=5`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
  });

  // New filter param in feat/optimize_gate_keeper_cron (isTMU = "training
  // moderator user", alongside the pre-existing isSTF).
  it('accepts the new isTMU filter param', async () => {
    currentTestUser = adminUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/admin/all?page=1&limit=5&isTMU=true`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});

// New route in feat/optimize_gate_keeper_cron — xlsx export of the same
// admin/all listing, with the same filters.
describe('GET /users/admin/all/export', () => {
  // @Authorized(['admin', 'gate_keeper']) has a non-empty roles array, so
  // routing-controllers throws AccessDeniedError (403) for a missing user,
  // not AuthorizationRequiredError (401) — same quirk documented elsewhere
  // in this suite (only bare @Authorized() 401s on missing auth).
  it('returns 403 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/users/admin/all/export`);
    expect(res.status).toBe(403);
  });

  it('returns an xlsx buffer for an admin', async () => {
    currentTestUser = adminUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/admin/all/export`);

    console.log('STATUS:', res.status, 'content-type:', res.headers['content-type']);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  }, 20000);

  it('gate keeper can also export users', async () => {
    currentTestUser = gateKeeperUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/admin/all/export`);

    console.log('STATUS:', res.status, 'content-type:', res.headers['content-type']);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  }, 20000);
});

describe('Simple listing GETs (any authenticated user)', () => {
  const routes = ['/all', '/moderators', '/pae-val-experts', '/list'];
  for (const route of routes) {
    it(`GET ${route} returns 200 for an authenticated user`, async () => {
      currentTestUser = expertUser;
      const res = await apiGet(`${ROUTE_PREFIX}/users${route}`);
      console.log(route, 'STATUS:', res.status);
      expect(res.status).toBe(200);
    });
  }

  it('GET /by-role requires a role query param', async () => {
    currentTestUser = expertUser;
    const missing = await apiGet(`${ROUTE_PREFIX}/users/by-role`);
    expect(missing.status).toBe(400);
  });

  // BUG-025: UserRepository.getUsersByRole does `{ role: { $in: roles } }`
  // without normalizing a single value into an array first. Express's default
  // query parser gives a plain string for one occurrence of `?role=expert` (as
  // opposed to an array for `?role=expert&role=moderator`), so the single-role
  // case — the most natural way to call this — 500s with a raw MongoDB error
  // ("$in needs an array") instead of working or 400ing cleanly.
  it('BUG-025: a single role value 500s (MongoDB "$in needs an array") — only repeated/array query params work', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/by-role?role=expert`);

    console.log('/by-role (single) STATUS:', res.status);
    expect(res.status).toBe(500);
  });

  it('GET /by-role works when the query param is sent as a real array (repeated key)', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/by-role?role=expert&role=moderator`);

    console.log('/by-role (array) STATUS:', res.status);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /users/stf-moderators', () => {
  it('BUG-017: not blocked for a role outside the declared array (none here, but consistent no-op check)', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/stf-moderators`);

    console.log('STATUS:', res.status);
    // expert is NOT in @Authorized(['admin','moderator','gate_keeper','auditor'])
    expect(res.status).toBe(200);
  });
});

describe('GET /users/details/:email', () => {
  it('BUG-024: reachable with NO @Authorized() at all — just the internal API key, no logged-in user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/users/details/${encodeURIComponent(process.env.ADMIN_EMAIL!)}`);

    console.log('STATUS:', res.status, 'has password field:', !!res.body?.password);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(process.env.ADMIN_EMAIL);
    // Same shape as BUG-019 — the raw doc (incl. password hash) is returned.
    expect(res.body.password).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Target-user mutation routes (against the throwaway fixture)
// ════════════════════════════════════════════════════════════════════════════

describe('PATCH /users/point', () => {
  it('rejects an invalid type', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/point`).send({type: 'bogus', userId: targetUserId});
    expect(res.status).toBe(400);
  });

  it('updates incentive points for the target user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/point`).send({type: 'incentive', userId: targetUserId});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /users/expert (block/unblock)', () => {
  it('blocks the target expert', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/expert`).send({action: 'block', userId: targetUserId});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });

  it('unblocks the target expert', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/expert`).send({action: 'unblock', userId: targetUserId});

    expect(res.status).toBe(200);
  });
});

describe('PATCH /users/stf', () => {
  it('BUG-017: assigns STF even from a moderator caller (admin-only declared, unenforced)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/stf`).send({action: 'assign', userId: targetUserId});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /users/status', () => {
  it('deactivates then reactivates the target user', async () => {
    currentTestUser = moderatorUser;
    const deactivate = await apiPatch(`${ROUTE_PREFIX}/users/status`).send({
      userId: targetUserId,
      status: 'in-active',
    });
    expect(deactivate.status).toBe(200);

    const reactivate = await apiPatch(`${ROUTE_PREFIX}/users/status`).send({
      userId: targetUserId,
      status: 'active',
    });
    expect(reactivate.status).toBe(200);
  });
});

describe('PATCH /users/:id/role', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/${targetUserId}/role`).send({role: 'moderator'});
    expect(res.status).toBe(401);
  });

  // Message updated by feat/optimize_gate_keeper_cron (merged 2026-08-27):
  // UserService.updateUserRole's role check now allows 'admin' OR
  // 'gate_keeper' (previously admin-only) — part of "giving user management
  // access to gate keeper". The old message text no longer matches.
  it('blocks a non-admin (expert) with 400 — real service-layer check, not the controller', async () => {
    currentTestUser = expertUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/${targetUserId}/role`).send({role: 'moderator'});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only admin or gate keeper can switch user roles/i);
  });

  it('admin promotes the target to moderator, then reverts it', async () => {
    currentTestUser = adminUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/${targetUserId}/role`).send({role: 'moderator'});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(200);

    const users = await db.getCollection('users');
    const doc = await users.findOne({_id: new ObjectId(targetUserId)});
    expect(doc.role).toBe('moderator');

    const revertRes = await apiPatch(`${ROUTE_PREFIX}/users/${targetUserId}/role`).send({role: 'expert'});
    expect(revertRes.status).toBe(200);
  });

  // New in feat/optimize_gate_keeper_cron: a gate keeper can now do this too.
  it('gate keeper promotes the target to moderator, then reverts it (new: gate keeper now allowed)', async () => {
    currentTestUser = gateKeeperUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/${targetUserId}/role`).send({role: 'moderator'});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(200);

    const users = await db.getCollection('users');
    const doc = await users.findOne({_id: new ObjectId(targetUserId)});
    expect(doc.role).toBe('moderator');

    const revertRes = await apiPatch(`${ROUTE_PREFIX}/users/${targetUserId}/role`).send({role: 'expert'});
    expect(revertRes.status).toBe(200);
  });
});

describe('PATCH /users/training-users', () => {
  it('BUG-017: assigns TMU status even from a moderator caller (admin-only declared, unenforced)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/training-users`).send({
      action: 'assign',
      userId: targetUserId,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /users/:id/verify', () => {
  it('blocks a non-admin (moderator) with 403 — real in-handler check', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/${targetUserId}/verify`).send({isVerified: true});

    console.log('STATUS:', res.status);
    expect(res.status).toBe(403);
  });

  it('admin verifies the target user', async () => {
    currentTestUser = adminUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/${targetUserId}/verify`).send({isVerified: true});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.isVerified).toBe(true);
  });

  // New in feat/optimize_gate_keeper_cron: the in-handler check
  // (`currentUser.role !== 'admin' && currentUser.role !== 'gate_keeper'`)
  // now allows gate_keeper too — part of "giving user management access to
  // gate keeper".
  it('gate keeper can also verify the target user (new: gate keeper now allowed)', async () => {
    currentTestUser = gateKeeperUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/${targetUserId}/verify`).send({isVerified: false});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.isVerified).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Notification preference / misc own-user routes
// ════════════════════════════════════════════════════════════════════════════

describe('PATCH /users (notification preference)', () => {
  it('rejects an invalid preference value', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users`).send({preference: 'not-a-real-value'});
    expect(res.status).toBe(400);
  });

  it('updates the notification preference', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users`).send({preference: 'never'});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Call-agent routes
// ════════════════════════════════════════════════════════════════════════════

describe('Call-agent admin routes', () => {
  it('GET /call-agents — BUG-017: not blocked for a moderator caller', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/call-agents`);
    expect(res.status).toBe(200);
  });

  // UserService requires the caller to be an admin AND have a
  // `Call_centre_manager` flag set — a real, additional constraint this
  // suite's plain `adminUser` fixture doesn't satisfy.
  it('POST /set-call-agents blocks a plain admin lacking the Call_centre_manager flag', async () => {
    currentTestUser = adminUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/set-call-agents`).send({
      userId: targetUserId,
      isCallAgent: true,
      isCallAgentActive: false,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(403);
  });

  it('PATCH /call-agents/:id/toggle-active — same Call_centre_manager gate', async () => {
    currentTestUser = adminUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/users/call-agents/${targetUserId}/toggle-active`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(403);
  });
});

describe('Call-agent self-service routes (call_agent role only)', () => {
  // roles-array @Authorized(['call_agent']): no user at all -> AccessDeniedError
  // (403), same framework behavior documented in dashboard/notification suites.
  it('POST /call-agents/toggle-status — 403 with no auth (roles-array @Authorized behavior)', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/users/call-agents/toggle-status`).send({online: true});
    expect(res.status).toBe(403);
  });

  // BUG-017: a moderator (not call_agent) is NOT blocked — the request reaches
  // business logic, which then legitimately rejects it because the moderator
  // isn't actually a call agent (400 for toggle-status/heartbeat; `available`
  // has no such guard and just returns the user unchanged).
  it('POST /call-agents/toggle-status — BUG-017: moderator reaches business logic (400, not an auth block)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/call-agents/toggle-status`).send({online: true});
    console.log('STATUS:', res.status);
    expect(res.status).toBe(400);
  });

  it('POST /call-agents/heartbeat — BUG-017: moderator reaches business logic (400)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/call-agents/heartbeat`);
    expect(res.status).toBe(400);
  });

  it('POST /call-agents/available — BUG-017: moderator reaches business logic (200, no-op for a non-call-agent)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/call-agents/available`);
    expect(res.status).toBe(200);
  });
});

describe('Call-agent self-service — real call_agent happy path', () => {
  it('toggle-status(online:true) assigns agent_1 and sets isCallAgentActive', async () => {
    currentTestUser = callAgentUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/call-agents/toggle-status`).send({online: true});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.isCallAgentActive).toBe(true);
    expect(res.body.agent).toBe('agent_1');
    expect(res.body.isBusy).toBe(false);
  });

  it('heartbeat updates lastAgentActiveAt for the now-online agent', async () => {
    currentTestUser = callAgentUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/call-agents/heartbeat`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const users = await db.getCollection('users');
    const updated = await users.findOne({_id: callAgentUser._id});
    expect(updated.lastAgentActiveAt).toBeTruthy();
  });

  it('available marks a busy agent as not busy (no-op for an already-free agent)', async () => {
    const users = await db.getCollection('users');
    await users.updateOne({_id: callAgentUser._id}, {$set: {isBusy: true, currentCallUuid: 'fake-call-uuid'}});

    currentTestUser = callAgentUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/call-agents/available`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.isBusy).toBe(false);
    expect(res.body.currentCallUuid).toBeFalsy();
  });

  it('toggle-status(online:false) releases the agent slot back to not_available', async () => {
    currentTestUser = callAgentUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/call-agents/toggle-status`).send({online: false});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.isCallAgentActive).toBe(false);
    expect(res.body.agent).toBe('not_available');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Public / misc routes
// ════════════════════════════════════════════════════════════════════════════

describe('POST /users/verification-request', () => {
  it('rejects a request missing identifier', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/users/verification-request`).send({});
    expect(res.status).toBe(400);
  });

  it('sends a verification request with no logged-in user (no @Authorized at all)', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/users/verification-request`).send({identifier: targetEmail});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });
});

describe('GET /users/user-history', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/users/user-history?userId=${targetUserId}`);
    expect(res.status).toBe(401);
  });

  it('returns history for the target user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/users/user-history?userId=${targetUserId}`);

    console.log('STATUS:', res.status);
    expect([200, 404]).toContain(res.status);
  });
});

describe('GET /users/working-hours', () => {
  it('computes working hours for the target user over a date range', async () => {
    currentTestUser = moderatorUser;
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const res = await apiGet(
      `${ROUTE_PREFIX}/users/working-hours?userId=${targetUserId}&startDateTime=${from}&endDateTime=${to}`,
    );

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });
});

describe('GET /users/working-hours-trend', () => {
  it('computes a working-hours trend for the target user', async () => {
    currentTestUser = moderatorUser;
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const res = await apiGet(
      `${ROUTE_PREFIX}/users/working-hours-trend?userId=${targetUserId}&startDateTime=${from}&endDateTime=${to}&granularity=day`,
    );

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
  });
});

describe('GET /users/reviewer-lifecycle', () => {
  it('returns lifecycle data for the target user over a date range', async () => {
    currentTestUser = moderatorUser;
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const res = await apiGet(
      `${ROUTE_PREFIX}/users/reviewer-lifecycle?userId=${targetUserId}&startDate=${from}&endDate=${to}`,
    );

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
  });
});

describe('POST /users/:id/remove-allocations', () => {
  // Message updated by feat/optimize_gate_keeper_cron (merged 2026-08-27):
  // UserService.removeExpertAllocations now allows 'admin' OR 'gate_keeper'
  // (previously admin-only). The old message text no longer matches.
  it('blocks a non-admin (moderator) with 400 — real service-layer check', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/${targetUserId}/remove-allocations`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only admin or gate keeper can remove expert allocations/i);
  });

  it('admin removes (zero) allocations for the target', async () => {
    currentTestUser = adminUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/${targetUserId}/remove-allocations`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });

  // New in feat/optimize_gate_keeper_cron: a gate keeper can now do this too.
  it('gate keeper removes (zero) allocations for the target (new: gate keeper now allowed)', async () => {
    currentTestUser = gateKeeperUser;
    const res = await apiPost(`${ROUTE_PREFIX}/users/${targetUserId}/remove-allocations`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});
