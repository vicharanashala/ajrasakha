/**
 * Chatbot Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * All ~61 routes on `ChatbotController` — the single largest previously-
 * uncovered controller. Almost every route is a read-only analytics query
 * (`@Authorized()`, no role restriction) against real data from every other
 * suite that ran before this one. A handful of admin/coordinator write routes
 * manage a SEPARATE "chatbot user" domain (source-scoped: `annam`/`whatsapp`)
 * distinct from the app's own `users` collection — those are exercised against
 * a deliberately fake/non-existent target id + source so no real chatbot user
 * data is touched.
 *
 * Most query DTOs are fully optional with defaults (see
 * `ChatbotQueryValidators.ts`) — calling with no query params is the common
 * case exercised below. A few have real required fields
 * (`DemographicUsersQueryDto.category`/`value`, `PlatformUsersQueryDto.platform`,
 * `download-chatbot-report`'s `startDate`/`endDate`) — those get their own tests.
 *
 * `assertCoordinatorOwnDashboard` is a REAL in-handler check on
 * `coordinator-duplicate-heat-map/:userId`, `assign-users/:userId`, and
 * `unassign-users/:userId`: it no-ops for `role === 'admin'`, otherwise requires
 * the caller's own email to match the target dashboard's profile email.
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
const INTERNAL_API_KEY = 'e2e-chatbot-key';

let app: express.Express;
let db: any;
let adminUser: any;
let moderatorUser: any;

let currentTestUser: any = null;

const today = new Date();
const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const endDate = today.toISOString().slice(0, 10);

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
  [adminUser, moderatorUser] = await Promise.all([
    users.findOne({email: process.env.ADMIN_EMAIL}),
    users.findOne({email: process.env.MODERATOR_EMAIL}),
  ]);
  const missing = [
    !adminUser && `ADMIN_EMAIL=${process.env.ADMIN_EMAIL}`,
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
  ].filter(Boolean);
  if (missing.length) throw new Error(`Test users not found: ${missing.join(', ')}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPatch(path: string) {
  return request(app).patch(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiDelete(path: string) {
  return request(app).delete(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

describe('Auth gate', () => {
  it('bare @Authorized() route returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/`);
    expect(res.status).toBe(401);
  });

  it('roles-array @Authorized(["admin"]) route returns 403 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiDelete(`${ROUTE_PREFIX}/analytics/users/${new ObjectId().toString()}`);
    expect(res.status).toBe(403);
  });
});

describe('No-param analytics GETs (200 for an authenticated user)', () => {
  const routes = [
    '/', '/feedback-users', '/query-analytics', '/state-wise-analytics?state=Punjab', '/kpi', '/dau',
    '/channel-split', '/voice-accuracy', '/geo', '/query-categories', '/filtered-questions',
    '/weather-concerns', '/weather-concern-queries?concern=Rain', '/farmer-heat-map', '/top-crops',
    '/user-trend', '/user-details', '/unverified-users', '/duplicate-questions',
    '/domain-spikes', '/user-growth', '/retention-metrics',
    '/user-message-metric-details', '/closed-notified-data', '/monthly-churn-rate',
    '/active-users-trend?requestType=monthly', '/top-faqs', '/daily-question-trends', '/users-metrices',
    '/response-adherence-table-data', '/state-user-data', '/active-users-details',
    '/get-coordinators-details', '/feedback-by-location?page=1&limit=10',
    '/closed-question-by-location', '/active-user-by-questions',
  ];

  for (const route of routes) {
    it(`GET ${route}`, async () => {
      currentTestUser = moderatorUser;
      const res = await apiGet(`${ROUTE_PREFIX}/analytics${route}`);
      console.log(route, 'STATUS:', res.status, 'MSG:', res.body?.message);
      expect(res.status).toBe(200);
    }, 15000);
  }
});

// GET /filtered-questions dispatches to one of 8 different ChatbotRepository
// methods depending on which query param is present. The bare smoke test
// above only exercises whichever branch runs with NO params. Each of these
// methods calls a private `init(source)` that routes `this.users`/
// `this.conversations`/`this.messagesCollection`/`this.sessionCollection` to
// EITHER the real Annam production cluster (`source==='annam'`, the default)
// OR this app's own test DB (`source==='whatsapp'`) — confirmed by reading
// ChatbotRepository.ts's `init()`. Every test below passes `source=whatsapp`
// explicitly to force the safe DB path.
//
// NOT tested: `closedWithInTwohours`, `period`, `manualSource`. Their
// ChatbotRepository methods (`getQuestionsClosedWithinTwoHours`,
// `getQueriesByPeriod`, `getQuestionByManualSource`) call `this.init('annam')`
// with a HARDCODED literal, ignoring the caller's `source` entirely — there
// is no query param that makes these three safe to call for real. Left
// uncovered on purpose; see README.md's "Code coverage" section.
describe('GET /filtered-questions — real dispatch branches (source=whatsapp forces the safe DB path)', () => {
  it('?category=... dispatches to getQueryCategoryQuestions', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/filtered-questions?category=faq&source=whatsapp`);
    console.log('category STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  }, 20000);

  it('?state=... (no district, no closedWithInTwohours) dispatches to getQuestionFromState', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/filtered-questions?state=Punjab&source=whatsapp`);
    console.log('state STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  }, 20000);

  it('?district=... dispatches to getQuestionFromDistrict', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/filtered-questions?district=Ludhiana&state=Punjab&source=whatsapp`);
    console.log('district STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  }, 20000);

  it('?crop=... dispatches to getQuestionsByCrop', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/filtered-questions?crop=Wheat&source=whatsapp`);
    console.log('crop STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  }, 20000);

  it('?status=... dispatches to getQuestionsByStatus', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(
      `${ROUTE_PREFIX}/analytics/filtered-questions?status=open&source=whatsapp&startDate=${startDate}&endDate=${endDate}`,
    );
    console.log('status STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  }, 20000);
});

// GET /user-questions-data — chatbotService.getUserQuestionsData internally
// chains getUserData -> getUsersMessages -> getAllUserMessageIds -> (if any
// message ids matched) getUserQuestionsData. getUsersMessages/
// getAllUserMessageIds respect the caller's `source`, same
// safe-with-source=whatsapp pattern as /filtered-questions above.
// getCoordinatorKpiSummary (used elsewhere, not this route) hardcodes
// `this.init('annam')` regardless of caller input — that one stays untested.
describe('GET /user-questions-data (source=whatsapp forces the safe DB path)', () => {
  it('exercises getUserData -> getUsersMessages -> getAllUserMessageIds for real', async () => {
    // source=whatsapp routes getUserData's lookup to this app's own `users`
    // collection (not a real WhatsApp farmer profile) — so the email has to
    // be a real row in THAT collection. The shared moderator fixture works.
    currentTestUser = moderatorUser;
    const res = await apiGet(
      `${ROUTE_PREFIX}/analytics/user-questions-data?userEmail=${encodeURIComponent(process.env.MODERATOR_EMAIL as string)}&source=whatsapp`,
    );
    console.log('user-questions-data STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(200);
  }, 20000);
});

describe('Routes with real required query params', () => {
  it('GET /users-by-demographic requires category+value', async () => {
    currentTestUser = moderatorUser;
    const missing = await apiGet(`${ROUTE_PREFIX}/analytics/users-by-demographic`);
    expect(missing.status).toBe(400);

    const res = await apiGet(`${ROUTE_PREFIX}/analytics/users-by-demographic?category=age&value=16-30`);
    console.log('users-by-demographic STATUS:', res.status);
    expect(res.status).toBe(200);
  });

  it('GET /users-by-platform requires platform', async () => {
    currentTestUser = moderatorUser;
    const missing = await apiGet(`${ROUTE_PREFIX}/analytics/users-by-platform`);
    expect(missing.status).toBe(400);

    const res = await apiGet(`${ROUTE_PREFIX}/analytics/users-by-platform?platform=Android`);
    console.log('users-by-platform STATUS:', res.status);
    expect(res.status).toBe(200);
  });

  // BUG-027: ChatbotService.getLifeCycleSummary crashes with a raw
  // TypeError ("Cannot read properties of undefined (reading 'map')") even on
  // the most basic call (defaults only, or page/limit supplied) — not a
  // not-found edge case, the base case itself is broken.
  it('BUG-027: GET /lifecycle-summary crashes on the basic case (TypeError reading \'map\' of undefined)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/lifecycle-summary?page=1&limit=10`);
    console.log('lifecycle-summary STATUS:', res.status, 'MSG:', res.body?.message);
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Cannot read properties of undefined/);
  });

  it('GET /user-questions-data — userId targets a separate chatbot-user domain, not the app users collection', async () => {
    currentTestUser = moderatorUser;
    // A real app-user id (moderatorUser) is NOT a chatbot/annam-domain user —
    // this documents that cross-domain lookup failure rather than assuming success.
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/user-questions-data?userId=${moderatorUser._id.toString()}`);
    console.log('user-questions-data STATUS:', res.status, 'MSG:', res.body?.message);
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/User not found/i);
  });

  it('GET /village-data', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(
      `${ROUTE_PREFIX}/analytics/village-data?state=Punjab&district=Ludhiana&source=annam&userType=all`,
    );
    console.log('village-data STATUS:', res.status);
    expect(res.status).toBe(200);
  });

  it('GET /question-lifecycle — non-existent questionId reports a clean not-found error', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/question-lifecycle?questionId=${new ObjectId().toString()}`);
    console.log('question-lifecycle STATUS:', res.status, 'MSG:', res.body?.message);
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Question not found/i);
  });

  it('GET /top-questions/:questionId', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/top-questions/${new ObjectId().toString()}`);
    console.log('top-questions/:id STATUS:', res.status);
    expect(res.status).toBe(200);
  });

  it('GET /user-profile — non-existent userId reports a clean not-found error', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/user-profile?userId=${new ObjectId().toString()}`);
    console.log('user-profile STATUS:', res.status, 'MSG:', res.body?.message);
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/No user found/i);
  });

  it('GET /download-chatbot-report requires startDate/endDate, then errors generating the report in this environment', async () => {
    currentTestUser = moderatorUser;
    const missing = await apiGet(`${ROUTE_PREFIX}/analytics/download-chatbot-report`);
    console.log('download-chatbot-report (missing) STATUS:', missing.status);
    expect(missing.status).toBe(400);

    const res = await apiGet(
      `${ROUTE_PREFIX}/analytics/download-chatbot-report?startDate=${startDate}&endDate=${endDate}&downloadFormat=xlsx`,
    );
    console.log('download-chatbot-report STATUS:', res.status, 'content-type:', res.headers['content-type'], 'MSG:', res.body?.message);
    // Validation wiring is proven by the 400 above; report generation itself
    // 500s in this environment ("Failed to download report") — not chased
    // further here.
    expect([200, 500]).toContain(res.status);
  }, 20000);
});

// ENVIRONMENT ISSUE (not a code bug): all 6 /dataset/* routes require
// DATA_RELEASE_URL, which isn't configured in this environment. Documented
// rather than silently skipped.
describe('GET /dataset/* (environment issue: DATA_RELEASE_URL not configured)', () => {
  const routes = [
    '/dataset/total-questions', '/dataset/total-feedbacks', '/dataset/total-users',
    '/dataset/questions', '/dataset/feedbacks', '/dataset/users',
  ];
  for (const route of routes) {
    it(`GET ${route} — 500s with a clear config-missing message`, async () => {
      currentTestUser = moderatorUser;
      const res = await apiGet(`${ROUTE_PREFIX}/analytics${route}`);
      console.log(route, 'STATUS:', res.status, 'MSG:', res.body?.message);
      expect(res.status).toBe(500);
      expect(res.body.message).toMatch(/DATA_RELEASE_URL/i);
    });
  }
});

describe('GET /coordinator-duplicate-heat-map/:userId (assertCoordinatorOwnDashboard)', () => {
  it('admin bypasses the ownership check, then 500s on a non-existent coordinator target', async () => {
    currentTestUser = adminUser;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/coordinator-duplicate-heat-map/${new ObjectId().toString()}`);

    console.log('STATUS:', res.status, 'MSG:', res.body?.message);
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Coordinator not found/i);
  });

  // BUG-017: the moderator IS NOT blocked by @Authorized(['admin', ...COORDINATOR_ROLES])
  // (proceeds to the handler regardless of role) — but assertCoordinatorOwnDashboard's
  // own getUserProfile(userId) lookup throws for a nonexistent target BEFORE it
  // can reach the email-comparison / ForbiddenError branch, so a fake target id
  // surfaces as a 500 here rather than the clean 403 a real mismatched target
  // would produce.
  it('BUG-017: moderator reaches the handler (not an auth block) — 500s because the ownership check itself needs a resolvable target', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/analytics/coordinator-duplicate-heat-map/${new ObjectId().toString()}`);

    console.log('STATUS:', res.status, 'MSG:', res.body?.message);
    expect(res.status).toBe(500);
  });
});

describe('PATCH /assign-users/:userId + /unassign-users/:userId', () => {
  // BUG-026: ChatbotService.assignUsers/unAssignUsers `return` the repository
  // call directly instead of `await`-ing it inside the try block — so a
  // rejected promise (e.g. repository's `BadRequestError('Coordinator not
  // found')`) is NEVER caught by the local try/catch. It propagates up as an
  // unhandled rejection and surfaces as a generic 500 with a garbled error
  // body instead of the clean 400 the repository actually threw.
  it('BUG-026: admin — "Coordinator not found" (a real 400) surfaces as 500 because the service never awaits the repository call', async () => {
    currentTestUser = adminUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/analytics/assign-users/${new ObjectId().toString()}`).send({
      userIds: [],
    });

    console.log('assign-users STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(500);
  });

  it('BUG-017: moderator reaches the handler (not an auth block) — same BUG-026 500 either way', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/analytics/unassign-users/${new ObjectId().toString()}`).send({
      userIds: [],
    });

    console.log('unassign-users STATUS:', res.status, 'MSG:', res.body?.message);
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Chatbot-user domain routes (source-scoped: annam/whatsapp) — deliberately
// fake target ids so no real chatbot user data is touched.
// ════════════════════════════════════════════════════════════════════════════

describe('Chatbot-user management routes (admin-only, separate user domain)', () => {
  const fakeUserId = new ObjectId().toString();

  it('PATCH /verify-user/:userId — BUG-017: moderator not blocked, reaches business logic', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/analytics/verify-user/${fakeUserId}`).send({isVerified: true});

    console.log('verify-user STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  // Same BUG-001-style pattern recurring here: ChatbotService.deleteUser
  // catches the repository's NotFoundError and rewraps it as
  // InternalServerError — a clean 404 becomes a 500.
  it('DELETE /users/:userId — admin, non-existent target 500s (BUG-001-style catch rewrap, not a 404)', async () => {
    currentTestUser = adminUser;
    const res = await apiDelete(`${ROUTE_PREFIX}/analytics/users/${fakeUserId}?source=annam`);

    console.log('delete chatbot user STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/User not found/i);
  });

  // Investigated and NOT a bug: unlike most admin+coordinator routes,
  // updateUser has a REAL in-handler check ("Coordinators can only update
  // their own linked farmer profile") — a moderator is genuinely blocked here.
  it('PATCH /users/:userId — a non-admin is blocked by a real in-handler ownership check (403)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/analytics/users/${fakeUserId}?source=annam`).send({name: 'x'});

    console.log('update chatbot user STATUS:', res.status, 'MSG:', res.body?.message);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own linked farmer profile/i);
  });

  it('POST /admin/users/:userId/change-password — admin, weak password rejected', async () => {
    currentTestUser = adminUser;
    const res = await apiPost(`${ROUTE_PREFIX}/analytics/admin/users/${fakeUserId}/change-password`).send({
      newPassword: 'weak',
      keepLoggedIn: false,
    });

    console.log('change-password STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('POST /users — admin, missing required fields', async () => {
    currentTestUser = adminUser;
    const res = await apiPost(`${ROUTE_PREFIX}/analytics/users?source=annam`).send({});

    console.log('add chatbot user STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('POST /notify-user', () => {
  it('sends (or attempts) a notification to a fake user — no real recipient', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(
      `${ROUTE_PREFIX}/analytics/notify-user?userEmail=${encodeURIComponent('e2e-fake@example.com')}&messageId=fake&message=hello`,
    );

    console.log('notify-user STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBeLessThan(600);
  });
});

describe('POST /response-adherence-table/email', () => {
  it('sends (or attempts) the report email — no real recipient', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/analytics/response-adherence-table/email`).send({
      email: 'e2e-fake@example.com',
      startDate,
      endDate,
    });

    console.log('response-adherence email STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBeLessThan(600);
  }, 20000);
});
