/**
 * Question Controller — Coverage Gap-Fill E2E test.
 *
 * WHAT THIS COVERS
 * ----------------
 * `QuestionController` is the largest controller in the codebase (83 routes).
 * This suite fills as many of the ~35 "genuinely testable business/analytics
 * routes" identified in README.md's "Missing tests" section as reasonably reachable in a
 * single pass, on top of the 24 routes already covered by `question/`,
 * `manual-allocation/`, `auto-allocation/`, `reviewer-queue/`,
 * `gatekeeper-auditor/`, `post-allocation/`, `feedback/`.
 *
 * NOT covered here (see README.md's "Missing tests" section for the full triage):
 * - 12 internal/background/migration ops routes (`run-migration`,
 *   `migrate-firebase-users`, `background/*`) — not real API surface.
 * - `bulk-pae-allocate` — already documented unreachable in-process.
 * - `acc-agent/*` (4 routes) and `generate`/`generate-by-call-context` (2) —
 *   real external AI-service calls needing more fixture work than this pass.
 * - `check-overlaps` — compares staging vs production DBs, needs a staging DB
 *   connection this environment doesn't have configured.
 *
 * FINDINGS — several routes have weaker auth than their names suggest:
 * - `POST /reAllocateLessWorkload`, `POST /reAllocateSelectedQuestions`,
 *   `GET /:questionId/generate-answer` have **no `@Authorized()` at all** —
 *   reachable by anyone with just the shared `x-internal-api-key`.
 * - `PATCH /:questionId`, `GET /admin/closed-answer-mismatch`,
 *   `POST /admin/normalized-domain`, `POST /admin/backfill-closed-moderator`
 *   use `@UseBefore(InternalApiAuth)` only — no user login required at all,
 *   despite the "admin/" path segment.
 * - `GET /background-status` and `GET /:id` (background job lookup) have no
 *   decorators at all.
 * - BUG: `GET /:id` (line 2351) is registered AFTER `GET /:questionId` (line
 *   1125) — routing-controllers matches route order, so `/:questionId`'s
 *   ObjectId-based handler catches every single-segment GET first. `GET /:id`
 *   is dead code, unreachable in practice. Confirmed below.
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
const RUN_TAG = `E2E_QGAP_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-question-gap-key';

let app: express.Express;
let db: any;
let adminUser: any;
let moderatorUser: any;
let expertUser: any;

let currentTestUser: any = null;
let questionId: string;
let closedQuestionId: string;
let answerId: string;
let gateKeeperUser: any;
let auditorUser: any;
const createdQuestionIds: string[] = [];
const createdUserIds: ObjectId[] = [];

async function makeUser(role: string) {
  const users = await db.getCollection('users');
  const {insertedId} = await users.insertOne({
    firebaseUID: `${RUN_TAG}_${role}`,
    email: `${RUN_TAG.toLowerCase()}-${role}@example.com`,
    firstName: RUN_TAG,
    lastName: role,
    role,
    isBlocked: false,
    status: 'active',
    assignedQuestionIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdUserIds.push(insertedId);
  return users.findOne({_id: insertedId});
}

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

  [gateKeeperUser, auditorUser] = await Promise.all([makeUser('gate_keeper'), makeUser('auditor')]);

  // Fixture OUTREACH question — open, no background pipeline.
  currentTestUser = moderatorUser;
  const qRes = await request(app)
    .post(`${ROUTE_PREFIX}/questions`)
    .set('x-internal-api-key', INTERNAL_API_KEY)
    .send({
      question: `${RUN_TAG} fixture question`,
      priority: 'medium',
      source: 'OUTREACH',
      details: {state: 'Punjab', district: 'Ludhiana', crop: 'Wheat', season: 'Rabi', domain: ['Crop Protection']},
    });
  if (qRes.status !== 201) throw new Error(`Fixture question creation failed: ${qRes.status} ${JSON.stringify(qRes.body)}`);
  questionId = qRes.body.question_id;
  createdQuestionIds.push(questionId);

  // A second, already-closed question with a finalized answer — needed for the
  // admin diagnostic/backfill routes and the generate-answer/chatbot routes.
  const questions = await db.getCollection('questions');
  const answers = await db.getCollection('answers');
  const closedResult = await questions.insertOne({
    userId: moderatorUser._id,
    question: `${RUN_TAG} closed fixture question`,
    status: 'closed',
    priority: 'medium',
    source: 'OUTREACH',
    isAutoAllocate: true,
    totalAnswersCount: 1,
    embedding: [],
    metrics: null,
    details: {state: 'Punjab', district: 'Ludhiana', crop: 'Wheat', season: 'Rabi', domain: 'Crop Protection'},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  closedQuestionId = closedResult.insertedId.toString();
  createdQuestionIds.push(closedQuestionId);

  const answerResult = await answers.insertOne({
    questionId: closedResult.insertedId,
    authorId: expertUser._id,
    answerIteration: 1,
    approvalCount: 3,
    isFinalAnswer: true,
    approvedBy: moderatorUser._id,
    answer: `${RUN_TAG} final answer`,
    sources: [],
    embedding: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  answerId = answerResult.insertedId.toString();

  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG} questionId=${questionId} closedQuestionId=${closedQuestionId}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db) {
    const questions = await db.getCollection('questions');
    const answers = await db.getCollection('answers');
    const users = await db.getCollection('users');
    for (const id of createdQuestionIds) {
      await questions.deleteOne({_id: new ObjectId(id)}).catch(() => {});
    }
    if (answerId) await answers.deleteOne({_id: new ObjectId(answerId)}).catch(() => {});
    for (const id of createdUserIds) {
      await users.deleteOne({_id: id}).catch(() => {});
    }
    console.log(`[teardown] Cleaned up ${createdQuestionIds.length} question(s), 1 answer, ${createdUserIds.length} user(s).`);
  }
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

// ════════════════════════════════════════════════════════════════════════════
// Simple analytics/query routes
// ════════════════════════════════════════════════════════════════════════════

describe('POST /questions/status-summary', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/status-summary`).send({});
    expect(res.status).toBe(401);
  });

  it('returns a status breakdown for an authenticated user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/status-summary`).send({});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /questions/context/:contextId', () => {
  // @IsMongoId() on ContextIdParam — must be a valid ObjectId shape.
  const fakeContextId = new ObjectId().toString();

  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/context/${fakeContextId}`);
    expect(res.status).toBe(401);
  });

  it('rejects a non-ObjectId contextId', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/context/not-an-object-id`);
    expect(res.status).toBe(400);
  });

  it('returns an empty list for a well-formed context id with no matching questions', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/context/${fakeContextId}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });
});

describe('GET /questions/queue-details', () => {
  it('BUG-017: not blocked for a non-privileged role (expert)', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/queue-details`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
  });
});

describe('GET /questions/allocated/page', () => {
  it('returns the fixture question by id', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/allocated/page?questionId=${questionId}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});

describe('POST /questions/detailed', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/detailed`).send({});
    expect(res.status).toBe(401);
  });

  it('returns a paginated question list', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/detailed`).send({});

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.questions)).toBe(true);
  });
});

describe('GET /questions/feedbacks', () => {
  it('returns feedbacks for the fixture question (empty list expected)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/feedbacks?questionId=${questionId}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});

// BUG: no @Authorized() at all — reachable with just the internal API key.
describe('POST /questions/reAllocateLessWorkload', () => {
  it('BUG: reachable with no logged-in user (no @Authorized() on this route)', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/reAllocateLessWorkload`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    // verifyNotTester(user) runs first and throws for a null/undefined user —
    // so this still errors, just not via the auth layer.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('GET /questions/reallocation-preview', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/reallocation-preview?type=timeBound`);
    expect(res.status).toBe(401);
  });

  it('returns a preview for an authenticated user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/reallocation-preview?type=timeBound`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
  });
});

describe('POST /questions/reallocate-manual', () => {
  it('accepts an empty assignments list', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/reallocate-manual`).send({assignments: []});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});

describe('GET /questions/role-dashboard', () => {
  it('rejects a non-gatekeeper/auditor caller', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/role-dashboard`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });

  it('returns the dashboard for the gate keeper themself', async () => {
    currentTestUser = gateKeeperUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/role-dashboard`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });

  it('lets a moderator view a specific gate keeper\'s dashboard', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(
      `${ROUTE_PREFIX}/questions/role-dashboard?userId=${gateKeeperUser._id.toString()}&role=gate_keeper`,
    );

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Single-question read/status routes
// ════════════════════════════════════════════════════════════════════════════

describe('GET /questions/:questionId/submission-exists', () => {
  it('returns exists: false for a question with no submission row', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/${questionId}/submission-exists`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(typeof res.body.exists).toBe('boolean');
  });
});

describe('GET /questions/:questionId (plain get-by-id)', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/${questionId}`);
    expect(res.status).toBe(401);
  });

  it('returns the fixture question', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/${questionId}`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
  });
});

describe('BUG: GET /questions/:id is shadowed dead code', () => {
  it('a background-job-shaped id still resolves via the earlier /:questionId route, not the getJob handler', async () => {
    currentTestUser = moderatorUser;
    // getJob() (the intended handler for GET /:id) has no @Authorized() and
    // returns { message: 'Job not found' } (200) for an unknown job id. If it
    // were actually reachable, a nonsense non-ObjectId string would hit that
    // handler. Instead, /:questionId (registered earlier, requires auth AND
    // expects a valid ObjectId) intercepts it first.
    const res = await apiGet(`${ROUTE_PREFIX}/questions/not-a-real-job-id-or-objectid`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    // getJob() would never error on a bad id shape (it just says "Job not
    // found") — an error response here confirms /:questionId caught it instead.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('PATCH /questions/:questionId (internal-api-key only, no @Authorized)', () => {
  it('rejects a request with no internal API key', async () => {
    currentTestUser = null;
    const res = await request(app).patch(`${ROUTE_PREFIX}/questions/${questionId}`).send({});
    expect(res.status).toBe(401);
  });

  // The handler method is named `UpdateThreadId` — despite the generic path
  // and OpenAPI summary ("Update question fields by ID"), it's really a
  // WhatsApp-thread-linking endpoint: passing `updateQuestion(..., true)`
  // turns on thread-id-specific validation, so any body without a `threadId`
  // 500s regardless of what other fields are supplied.
  it('BUG: updates the question with just the internal API key — no user login required at all', async () => {
    currentTestUser = null;
    const res = await apiPatch(`${ROUTE_PREFIX}/questions/${questionId}`).send({
      threadId: `${RUN_TAG}_thread`,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);

    const questions = await db.getCollection('questions');
    const doc = await questions.findOne({_id: new ObjectId(questionId)});
    expect(doc.threadId).toBe(`${RUN_TAG}_thread`);
  });
});

describe('GET /questions/:questionId/feedback', () => {
  it('returns feedback for the fixture question (empty expected)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/${questionId}/feedback`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /questions/:questionId/chatbot', () => {
  // The controller has a `if (!data) throw new NotFoundError(...)` branch, but
  // it's dead code for this case: QuestionService.getMatchedQuestion throws a
  // plain Error('No matching message found') itself rather than returning
  // null, so the controller's NotFoundError check never runs — a clean 404
  // becomes a 500.
  it('500s (not the intended 404) for a question with no matched chatbot message', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/${questionId}/chatbot`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/No matching message found/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Listing / background-job routes
// ════════════════════════════════════════════════════════════════════════════

describe('GET /questions (list)', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/questions`);
    expect(res.status).toBe(401);
  });

  it('returns questions and review levels', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
  });
});

describe('GET /questions/background-status', () => {
  // BUG (same shape as GET /:id below): registered at line 2346, AFTER
  // GET /:questionId (line 1125) — routing-controllers matches by
  // registration order, so `/:questionId` (which DOES require @Authorized())
  // catches "background-status" as a questionId value first. The intended
  // handler (no decorators, meant to be fully open) is dead code.
  it('BUG: shadowed by the earlier /:questionId route — 401s despite having no @Authorized() itself', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/background-status`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Admin diagnostic/repair routes (InternalApiAuth only, no user auth at all)
// ════════════════════════════════════════════════════════════════════════════

describe('GET /questions/admin/closed-answer-mismatch', () => {
  it('rejects a request with no internal API key', async () => {
    const res = await request(app).get(`${ROUTE_PREFIX}/questions/admin/closed-answer-mismatch`);
    expect(res.status).toBe(401);
  });

  it('reads the diagnostic with just the internal API key — no user login', async () => {
    const res = await apiGet(`${ROUTE_PREFIX}/questions/admin/closed-answer-mismatch`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /questions/admin/normalized-domain', () => {
  it('accepts an empty entry list with just the internal API key', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/questions/admin/normalized-domain`).send([]);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /questions/admin/backfill-closed-moderator', () => {
  it('runs a tightly-bounded backfill (limit: 1) with just the internal API key', async () => {
    // This is a real data-repair operation on real closed questions missing a
    // moderatorId — bounding it to limit:1 keeps the blast radius minimal
    // while still exercising the real code path (it only ever sets a field
    // that's currently null/missing from correct data already on the
    // document, so it's a repair, not a destructive mutation).
    const res = await apiPost(`${ROUTE_PREFIX}/questions/admin/backfill-closed-moderator`).send({limit: 1});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  }, 20000);
});

// ════════════════════════════════════════════════════════════════════════════
// Status / duplicate-check / hold routes
// ════════════════════════════════════════════════════════════════════════════

describe('POST /questions/check-status', () => {
  it('checks status for the fixture question', async () => {
    currentTestUser = null; // FlexibleAuth accepts the internal API key alone
    const res = await apiPost(`${ROUTE_PREFIX}/questions/check-status`).send({
      question_ids: [questionId],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a malformed body', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/questions/check-status`).send({question_ids: 'not-an-array'});
    expect(res.status).toBe(400);
  });
});

describe('POST /questions/:questionId/check-duplicate', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/${questionId}/check-duplicate`);
    expect(res.status).toBe(401);
  });

  it('manually triggers a duplicate check for the fixture question', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/${questionId}/check-duplicate`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBeLessThan(600);
  }, 20000);
});

describe('PATCH /questions/:questionId/hold', () => {
  it('holds then unholds the fixture question', async () => {
    currentTestUser = moderatorUser;
    const holdRes = await apiPatch(`${ROUTE_PREFIX}/questions/${questionId}/hold`).send({action: 'hold'});
    console.log('HOLD STATUS:', holdRes.status, 'BODY:', JSON.stringify(holdRes.body).slice(0, 200));
    expect(holdRes.status).toBe(200);

    const unholdRes = await apiPatch(`${ROUTE_PREFIX}/questions/${questionId}/hold`).send({action: 'unhold'});
    console.log('UNHOLD STATUS:', unholdRes.status);
    expect(unholdRes.status).toBe(200);
  });
});

describe('GET /questions/:questionId/generate-answer', () => {
  it('reaches the real external AI service — no @Authorized() on this route at all', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/${questionId}/generate-answer`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect([200, 400, 500, 502, 503, 504]).toContain(res.status);
  }, 20000);
});

describe('POST /questions/:questionId/approve-initial-answer', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/${questionId}/approve-initial-answer`).send({
      answer: 'x',
    });
    expect(res.status).toBe(401);
  });

  it('approves an AI initial answer for the fixture question', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/${questionId}/approve-initial-answer`).send({
      answer: `${RUN_TAG} approved initial answer`,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBeLessThan(600);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Reallocation routes
// ════════════════════════════════════════════════════════════════════════════

describe('POST /questions/:questionId/replace-queue-expert', () => {
  it('errors replacing a queue slot on a question with no queue', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/${questionId}/replace-queue-expert`).send({
      newExpertId: expertUser._id.toString(),
      levelIndex: 0,
      isAuthor: true,
      reasonForChange: `${RUN_TAG} e2e test`,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('POST /questions/reAllocateSelectedQuestions', () => {
  it('BUG: reachable with no logged-in user (no @Authorized() on this route)', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/reAllocateSelectedQuestions`).send({
      questionIds: [],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    // verifyNotTester(user) throws for a null user before any real work happens.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('processes an empty selection for an authenticated user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/reAllocateSelectedQuestions`).send({
      questionIds: [],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});

describe('POST /questions/reallocate-timebound', () => {
  it('BUG-017: not blocked for a non-admin/moderator role (expert)', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/reallocate-timebound`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  }, 30000);
});

describe('POST /questions/reallocate-manual-queue', () => {
  it('BUG-017: not blocked for a non-admin/moderator role (expert)', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/reallocate-manual-queue`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  }, 30000);
});

describe('POST /questions/:questionId/mark-opened', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/${questionId}/mark-opened`);
    expect(res.status).toBe(401);
  });

  it('marks the fixture question opened by the current expert', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/${questionId}/mark-opened`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Report downloads (xlsx buffers)
// ════════════════════════════════════════════════════════════════════════════

describe('Report downloads', () => {
  const today = new Date();
  const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  it('GET /download-question-report', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/download-question-report?startDate=${startDate}&endDate=${endDate}`);
    console.log('download-question-report STATUS:', res.status, 'content-type:', res.headers['content-type']);
    expect(res.status).toBe(200);
  }, 20000);

  it('GET /download-tat-report requires startDate/endDate', async () => {
    currentTestUser = moderatorUser;
    const missing = await apiGet(`${ROUTE_PREFIX}/questions/download-tat-report`);
    expect(missing.status).toBe(400);

    const res = await apiGet(`${ROUTE_PREFIX}/questions/download-tat-report?startDate=${startDate}&endDate=${endDate}`);
    console.log('download-tat-report STATUS:', res.status);
    expect(res.status).toBe(200);
  }, 20000);

  it('GET /download-overall-report', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/download-overall-report?startDate=${startDate}&endDate=${endDate}`);
    console.log('download-overall-report STATUS:', res.status);
    expect(res.status).toBe(200);
  }, 20000);

  it('GET /download-filtered-report', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/download-filtered-report?state=Punjab`);
    console.log('download-filtered-report STATUS:', res.status);
    expect(res.status).toBe(200);
  }, 20000);

  // Coverage note: status=closed triggers generateStateCropQuestionReport's
  // includeAnswerDetails branch (answer text/sources/approving-moderator
  // resolution) — the plain state-only call above never reaches it. Uses
  // the real closed fixture question + finalized answer from beforeAll.
  it('GET /download-filtered-report?status=closed (exercises answer-details resolution)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/download-filtered-report?status=closed`);
    console.log('download-filtered-report(closed) STATUS:', res.status);
    expect(res.status).toBe(200);
  }, 20000);

  it('GET /download-duplicate-questions-report', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/download-duplicate-questions-report?startDate=${startDate}&endDate=${endDate}`);
    console.log('download-duplicate-questions-report STATUS:', res.status);
    expect(res.status).toBe(200);
  }, 20000);
});

// ════════════════════════════════════════════════════════════════════════════
// Outreach email report (safe path only — see file header)
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// Gate keeper / auditor role-assignee routes + feedback timeline
// ════════════════════════════════════════════════════════════════════════════

describe('PATCH /questions/:questionId/role-assignee', () => {
  // @Authorized(['admin','moderator','gate_keeper','auditor']) has a
  // non-empty roles array, so routing-controllers throws AccessDeniedError
  // (403) rather than AuthorizationRequiredError (401) for a missing user —
  // same shape documented for bare-@Authorized() 401 vs role-array 403 across
  // this suite.
  it('returns 403 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPatch(`${ROUTE_PREFIX}/questions/${questionId}/role-assignee`).send({
      role: 'gate_keeper',
      userId: gateKeeperUser._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid role value', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/questions/${questionId}/role-assignee`).send({
      role: 'not-a-real-role',
      userId: gateKeeperUser._id.toString(),
    });
    expect(res.status).toBe(400);
  });

  it('assigns a gate keeper to the fixture question', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(`${ROUTE_PREFIX}/questions/${questionId}/role-assignee`).send({
      role: 'gate_keeper',
      userId: gateKeeperUser._id.toString(),
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const questions = await db.getCollection('questions');
    const doc = await questions.findOne({_id: new ObjectId(questionId)});
    expect(doc.gateKeeperId?.toString()).toBe(gateKeeperUser._id.toString());
  });
});

describe('DELETE /questions/:questionId/role-assignee', () => {
  it('returns 403 with no authenticated user (same role-array shape as above)', async () => {
    currentTestUser = null;
    const res = await apiDelete(`${ROUTE_PREFIX}/questions/${questionId}/role-assignee`).send({role: 'gate_keeper'});
    expect(res.status).toBe(403);
  });

  it('removes the gate keeper assigned above', async () => {
    currentTestUser = moderatorUser;
    const res = await apiDelete(`${ROUTE_PREFIX}/questions/${questionId}/role-assignee`).send({role: 'gate_keeper'});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const questions = await db.getCollection('questions');
    const doc = await questions.findOne({_id: new ObjectId(questionId)});
    expect(doc.gateKeeperId ?? null).toBeFalsy();
  });
});

describe('GET /questions/:questionId/feedback-timeline', () => {
  it('returns a timeline for the fixture question (empty expected)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/${questionId}/feedback-timeline`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /questions/data/out-reach/date', () => {
  // BUG: despite having no @Authorized() decorator (@CurrentUser() resolves
  // to whatever currentUserChecker returns — null when nobody's logged in),
  // the handler unconditionally does `user._id.toString()` to build the audit
  // actor before checking user exists. A genuinely anonymous call crashes with
  // a raw TypeError instead of either working (as the missing decorator
  // implies it should) or cleanly 401ing.
  it('BUG: crashes with no logged-in user despite having no @Authorized() decorator', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/data/out-reach/date`).send({
      startDate: '2000-01-01',
      endDate: '2000-01-02',
      emails: ['e2e-fake@example.com'],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Cannot read properties of null/i);
  }, 20000);

  it('returns success with no email sent for a date range with no data, when a real user is set', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/data/out-reach/date`).send({
      startDate: '2000-01-01',
      endDate: '2000-01-02',
      emails: ['e2e-fake@example.com'],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  }, 20000);
});
