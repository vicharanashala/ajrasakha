/**
 * Auto Allocation — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * The auto-allocation path exercised against the REAL Mongo DB configured in
 * `.env.test` (DB_URL / DB_NAME):
 *
 *   POST   /api/questions                              (AGRI_EXPERT → background queue population)
 *   POST   /api/questions                              (OUTREACH → no background allocation)
 *   PATCH  /api/questions/:questionId/toggle-auto-allocate
 *
 * THE TWO AUTO-ALLOCATION PATHS
 * -----------------------------
 * 1. AGRI_EXPERT at creation:
 *    addQuestion() kicks off processQuestionInBackground() via setImmediate.
 *    findExpertsByPreference() scores all non-blocked experts by question details
 *    (state +3, domain +2, crop +1; then workload tiebreak), then places
 *    DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT=1 expert at queue[0].
 *    firstAllocationAt is stamped and an 'answer_creation' notification is sent
 *    to queue[0].
 *
 * 2. Toggle auto-allocate OFF → ON:
 *    PATCH /:questionId/toggle-auto-allocate calls toggleAutoAllocate(), which
 *    — when the flag was previously false — calls autoAllocateExperts() to fill
 *    the queue synchronously within the same request.
 *
 * STRATEGY
 * --------
 * In-process server — same harness as ManualAllocation.e2e.test.ts.
 * Users are fetched from the real DB by email (no Firebase token exchange).
 * A `currentTestUser` variable is swapped per test; both authorizationChecker
 * and currentUserChecker read from it.
 * Background processing for AGRI_EXPERT runs via setImmediate — tests poll the
 * DB directly until the queue is populated.
 * AiService is dummied for safety; the AGRI_EXPERT path never calls AI anyway.
 */

// Mongo on Atlas (mongodb+srv) requires TLS. MongoDatabase disables TLS when
// NODE_ENV==='test', so force a non-test env BEFORE any module builds the Mongo
// client. Must run before loadAppModules().
process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
// Real Atlas DB config first, then test-user credentials. dotenv does NOT
// override already-set vars, so DB_URL/DB_NAME from .env win.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.test' });

import express from 'express';
import request from 'supertest';
import { useExpressServer } from 'routing-controllers';
import { ObjectId } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_AA_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-auto-alloc-key';

let app: express.Express;
let db: any;
let moderatorUser: any;
let expertUser1: any;

// Swapped per test — currentUserChecker returns this value.
let currentTestUser: any = null;

// Track every doc we create so the real DB is left clean.
const createdQuestionIds: ObjectId[] = [];

beforeAll(async () => {
  // Warm-up: resolve the AnswerService circular import before the core barrel
  // runs via loadAppModules (see project_e2e_inprocess_harness memory).
  await import('#root/modules/answer/services/AnswerService.js');

  // InternalApiAuth is a global @Middleware({ type: 'before' }) that runs on
  // every route — set the key so it passes, then authorizationChecker handles
  // the per-request user check.
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const { loadAppModules, getContainer } = await import(
    '#root/bootstrap/loadModules.js'
  );
  const { GLOBAL_TYPES } = await import('#root/types.js');
  const { CORE_TYPES } = await import('#root/modules/core/types.js');

  const { controllers } = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);

  // Dummy the AI seam. The AGRI_EXPERT path does not call AI (no embedding or
  // GDB query), but dummying keeps the suite hermetic if config ever changes.
  const dummyAi = {
    getEmbedding: async () => ({ embedding: [] }),
    fetchWhatsAppMessage: async () => ({}),
    searchGdb: async () => ({ exact_match: null, selected_match: null }),
  };
  try {
    container.rebindSync(CORE_TYPES.AIService).toConstantValue(dummyAi);
  } catch {
    // absent / not bound — short-circuit path is fine
  }

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  // Fetch test users from DB by email (no Firebase token exchange needed).
  const users = await db.getCollection('users');
  [moderatorUser, expertUser1] = await Promise.all([
    users.findOne({ email: process.env.MODERATOR_EMAIL }),
    users.findOne({ email: process.env.EXPERT_EMAIL }),
  ]);

  if (!moderatorUser || !expertUser1) {
    throw new Error(
      'Test users not found in DB — ensure seed data exists for ' +
        `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}, ` +
        `EXPERT_EMAIL=${process.env.EXPERT_EMAIL}`,
    );
  }

  await (await db.getCollection('users')).estimatedDocumentCount(); // sanity: connectivity
  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG}`);
}, 90000);

afterAll(async () => {
  if (db && createdQuestionIds.length) {
    const [questions, submissions, notifications] = await Promise.all([
      db.getCollection('questions'),
      db.getCollection('question_submissions'),
      db.getCollection('notifications'),
    ]);
    await Promise.all([
      questions.deleteMany({ _id: { $in: createdQuestionIds } }),
      submissions.deleteMany({ questionId: { $in: createdQuestionIds } }),
      notifications.deleteMany({ enitity_id: { $in: createdQuestionIds } }),
    ]);
    console.log(`[teardown] Cleaned ${createdQuestionIds.length} questions.`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

// ─────────────────────── helpers ────────────────────────────────────────────

const as = (user: any) => {
  currentTestUser = user;
};

function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPatch(path: string) {
  return request(app).patch(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

/** Poll the DB until `check()` returns true or `timeoutMs` is exceeded. */
async function pollUntil(
  check: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 300,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('pollUntil: condition not met within timeout');
}

async function getQuestion(id: string) {
  const col = await db.getCollection('questions');
  return col.findOne({ _id: new ObjectId(id) });
}
async function getSubmission(id: string) {
  const col = await db.getCollection('question_submissions');
  return col.findOne({ questionId: new ObjectId(id) });
}

// Question details that match experttest1's stored preferences
// (state=Punjab, domain=Crop Protection, crop=Brinjal → 6-point score).
const AGRI_EXPERT_DETAILS = {
  state: 'Punjab',
  district: 'Ludhiana',
  crop: 'Brinjal',
  season: 'Rabi',
  domain: 'Crop Protection',
};

// ════════════════════════════════════════════════════════════════════════════
// 1. AGRI_EXPERT — auto-allocation fires in background at creation
// ════════════════════════════════════════════════════════════════════════════

describe('Auto allocation — AGRI_EXPERT question: background allocates one expert', () => {
  let questionId: string;

  beforeAll(async () => {
    as(moderatorUser);
    const res = await apiPost(`${ROUTE_PREFIX}/questions`).send({
      question: `${RUN_TAG} brinjal yellowing — auto-alloc basic test`,
      source: 'AGRI_EXPERT',
      priority: 'medium',
      details: AGRI_EXPERT_DETAILS,
    });
    console.log('[G1] CREATE STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    questionId = res.body.question_id;
    createdQuestionIds.push(new ObjectId(questionId));
  }, 30000);

  it('question is immediately open with isAutoAllocate=true', async () => {
    const q = await getQuestion(questionId);
    console.log('[G1] question:', JSON.stringify({ status: q?.status, isAutoAllocate: q?.isAutoAllocate }));
    expect(q.status).toBe('open');
    expect(q.isAutoAllocate).toBe(true);
  });

  it('background process populates submission queue with exactly 1 expert', async () => {
    await pollUntil(async () => {
      const sub = await getSubmission(questionId);
      return (sub?.queue?.length ?? 0) > 0;
    });
    const sub = await getSubmission(questionId);
    console.log('[G1] queue length:', sub?.queue?.length);
    expect(sub.queue).toHaveLength(1);
  });

  it('question has firstAllocationAt stamped after background allocation', async () => {
    const q = await getQuestion(questionId);
    console.log('[G1] firstAllocationAt:', q?.firstAllocationAt);
    expect(q.firstAllocationAt).toBeInstanceOf(Date);
  });

  it('answer_creation notification is sent to queue[0] expert', async () => {
    const sub = await getSubmission(questionId);
    const allocatedExpertId = sub.queue[0];

    const notifications = await db.getCollection('notifications');
    const notif = await notifications.findOne({
      enitity_id: new ObjectId(questionId),
      userId: allocatedExpertId,
      type: 'answer_creation',
    });
    console.log('[G1] answer_creation notif:', notif ? 'found' : 'missing');
    expect(notif).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. AGRI_EXPERT — preference scoring selects the highest-ranked expert
// ════════════════════════════════════════════════════════════════════════════

describe('Auto allocation — AGRI_EXPERT: preference scoring allocates the best expert', () => {
  let questionId: string;

  beforeAll(async () => {
    // experttest1 (EXPERT_EMAIL) is expected to have preferences matching
    // state=Punjab + domain=Crop Protection + crop=Brinjal, yielding the
    // maximum preference score (6 pts) for this question and placing them
    // first in findExpertsByPreference(). See UserRepository.findExpertsByPreference.
    as(moderatorUser);
    const res = await apiPost(`${ROUTE_PREFIX}/questions`).send({
      question: `${RUN_TAG} brinjal stem borer — preference scoring test`,
      source: 'AGRI_EXPERT',
      priority: 'medium',
      details: AGRI_EXPERT_DETAILS,
    });
    expect(res.status).toBe(201);
    questionId = res.body.question_id;
    createdQuestionIds.push(new ObjectId(questionId));

    // Wait for background allocation before the test assertion runs.
    await pollUntil(async () => {
      const sub = await getSubmission(questionId);
      return (sub?.queue?.length ?? 0) > 0;
    });
  }, 30000);

  it('queue[0] is experttest1 (highest-scoring for Punjab / Crop Protection / Brinjal)', async () => {
    const sub = await getSubmission(questionId);
    const allocatedId = sub.queue[0].toString();
    console.log('[G2] allocated:', allocatedId, 'expertUser1._id:', expertUser1._id.toString());
    expect(allocatedId).toBe(expertUser1._id.toString());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. OUTREACH — no background allocation at creation
// ════════════════════════════════════════════════════════════════════════════

describe('Auto allocation — OUTREACH question: queue stays empty at creation', () => {
  let questionId: string;

  beforeAll(async () => {
    as(moderatorUser);
    const res = await apiPost(`${ROUTE_PREFIX}/questions`).send({
      question: `${RUN_TAG} paddy leaves yellowing — outreach creation test`,
      source: 'OUTREACH',
      priority: 'medium',
      details: AGRI_EXPERT_DETAILS,
    });
    console.log('[G3] CREATE STATUS:', res.status);
    expect(res.status).toBe(201);
    questionId = res.body.question_id;
    createdQuestionIds.push(new ObjectId(questionId));
  }, 30000);

  it('question is open with isAutoAllocate=true (flag only — no background expert assignment)', async () => {
    const q = await getQuestion(questionId);
    expect(q.status).toBe('open');
    expect(q.isAutoAllocate).toBe(true);
  });

  it('submission queue is empty immediately after creation', async () => {
    const sub = await getSubmission(questionId);
    console.log('[G3] queue immediately after create:', sub?.queue?.length);
    expect(sub.queue).toHaveLength(0);
  });

  it('queue remains empty after a brief wait (no cron running in test)', async () => {
    // Give any hypothetical background process 1 s to run — nothing should
    // touch OUTREACH queues at creation time.
    await new Promise(r => setTimeout(r, 1000));
    const sub = await getSubmission(questionId);
    console.log('[G3] queue after 1 s:', sub?.queue?.length);
    expect(sub.queue).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Toggle auto-allocate
// ════════════════════════════════════════════════════════════════════════════

describe('Auto allocation — toggle-auto-allocate endpoint', () => {
  it('returns 401 when no user is logged in', async () => {
    as(null);
    const fakeId = new ObjectId().toString();
    const res = await apiPatch(
      `${ROUTE_PREFIX}/questions/${fakeId}/toggle-auto-allocate`,
    );
    console.log('[G4] NO-USER STATUS:', res.status);
    expect(res.status).toBe(401);
  });

  it('OFF → ON: toggles flag to true and fills queue via autoAllocateExperts', async () => {
    // Seed directly: OUTREACH question, isAutoAllocate=false, empty queue.
    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    const { insertedId } = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} toggle-on — paddy blight`,
      status: 'open',
      priority: 'medium',
      source: 'OUTREACH',
      isAutoAllocate: false,
      totalAnswersCount: 0,
      embedding: [],
      metrics: null,
      details: {
        ...AGRI_EXPERT_DETAILS,
        normalised_crop: 'Brinjal',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    createdQuestionIds.push(insertedId);
    await submissions.insertOne({
      questionId: insertedId,
      lastRespondedBy: null,
      history: [],
      queue: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    as(moderatorUser);
    const res = await apiPatch(
      `${ROUTE_PREFIX}/questions/${insertedId.toString()}/toggle-auto-allocate`,
    );
    console.log('[G4] TOGGLE-ON STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);

    // Flag was flipped.
    const q = await getQuestion(insertedId.toString());
    expect(q.isAutoAllocate).toBe(true);

    // autoAllocateExperts was called synchronously inside toggleAutoAllocate,
    // so the queue should already be populated by the time the response returns.
    const sub = await getSubmission(insertedId.toString());
    console.log('[G4] queue after toggle-on:', sub?.queue?.length);
    expect(sub.queue.length).toBeGreaterThanOrEqual(1);
  });

  it('ON → OFF: toggles flag to false and leaves queue untouched', async () => {
    // Seed: question with isAutoAllocate=true and expertUser1 already in queue.
    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    const { insertedId } = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} toggle-off — wheat rust`,
      status: 'open',
      priority: 'medium',
      source: 'OUTREACH',
      isAutoAllocate: true,
      totalAnswersCount: 0,
      embedding: [],
      metrics: null,
      details: {
        ...AGRI_EXPERT_DETAILS,
        crop: 'Wheat',
        normalised_crop: 'Wheat',
      },
      firstAllocationAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    createdQuestionIds.push(insertedId);
    await submissions.insertOne({
      questionId: insertedId,
      lastRespondedBy: null,
      history: [],
      queue: [expertUser1._id],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    as(moderatorUser);
    const res = await apiPatch(
      `${ROUTE_PREFIX}/questions/${insertedId.toString()}/toggle-auto-allocate`,
    );
    console.log('[G4] TOGGLE-OFF STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);

    // Flag flipped to false.
    const q = await getQuestion(insertedId.toString());
    expect(q.isAutoAllocate).toBe(false);

    // Queue is untouched — toggling OFF does not call autoAllocateExperts.
    const sub = await getSubmission(insertedId.toString());
    expect(sub.queue).toHaveLength(1);
    expect(sub.queue[0].toString()).toBe(expertUser1._id.toString());
  });
});
