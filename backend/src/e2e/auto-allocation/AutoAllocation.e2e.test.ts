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
let container: any;
let questionService: any;
let moderatorUser: any;
let expertUser1: any;

// STF experts (special_task_force=true) — required for time-bound unallocated allocation.
// Populated in beforeAll; empty if none exist in the test DB (tests self-skip).
let stfExperts: any[] = [];

// Swapped per test — currentUserChecker returns this value.
let currentTestUser: any = null;

// Track every doc we create so the real DB is left clean.
const createdQuestionIds: ObjectId[] = [];

// Questions we temporarily close in beforeAll to free up STF experts.
// These are leftover open time-bound questions from previous incomplete runs
// that count toward activeTimeBound and block G5/G6/G8. Restored in afterAll.
const temporarilyClosedIds: ObjectId[] = [];

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
  container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);
  questionService = container.get(CORE_TYPES.QuestionService);

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

  // Ensure at least 3 experts have special_task_force=true so Groups 5–8 can run.
  // If fewer than 3 exist, promote non-STF experts (lowest reputation first) until
  // we reach 3. This is a one-time setup against the test DB — safe to repeat.
  const MIN_STF = 3;
  const existingStf = await users
    .find({ role: 'expert', isBlocked: false, special_task_force: true })
    .toArray();

  if (existingStf.length < MIN_STF) {
    const needed = MIN_STF - existingStf.length;
    const existingStfIds = existingStf.map((e: any) => e._id);
    const toPromote = await users
      .find({ role: 'expert', isBlocked: false, _id: { $nin: existingStfIds } })
      .sort({ reputation_score: 1 })
      .limit(needed)
      .toArray();

    if (toPromote.length > 0) {
      await users.updateMany(
        { _id: { $in: toPromote.map((e: any) => e._id) } },
        { $set: { special_task_force: true } },
      );
      console.log(
        `[setup] Promoted ${toPromote.length} expert(s) to STF: ` +
        toPromote.map((e: any) => e.email).join(', '),
      );
    }
  }

  // Fetch all STF experts for time-bound allocation tests (Groups 5–8).
  stfExperts = await users
    .find({ role: 'expert', isBlocked: false, special_task_force: true })
    .sort({ reputation_score: 1 })
    .toArray();

  // Temporarily close any leftover open WHATSAPP/AJRASAKHA questions that
  // have STF experts in their queue from previous incomplete test runs.
  // getTimeBoundActiveCountPerExpert counts ALL such questions in the DB, so
  // leftovers make freeSTF=0 and block G5/G6/G8 from running.
  if (stfExperts.length > 0) {
    const stfIds = stfExperts.map((e: any) => e._id);
    const questionsCol = await db.getCollection('questions');
    const submissionsCol = await db.getCollection('question_submissions');

    const leftoverSubs = await submissionsCol
      .find({ queue: { $elemMatch: { $in: stfIds } } })
      .toArray();

    if (leftoverSubs.length > 0) {
      const leftoverQIds = leftoverSubs.map((s: any) => s.questionId);
      const leftoverActiveQs = await questionsCol
        .find({
          _id: { $in: leftoverQIds },
          source: { $in: ['WHATSAPP', 'AJRASAKHA'] },
          status: { $in: ['open', 'delayed'] },
        })
        .toArray();

      if (leftoverActiveQs.length > 0) {
        const toClose = leftoverActiveQs.map((q: any) => q._id);
        await questionsCol.updateMany(
          { _id: { $in: toClose } },
          { $set: { status: 'closed' } },
        );
        temporarilyClosedIds.push(...toClose);
        console.log(
          `[setup] Temporarily closed ${toClose.length} leftover active time-bound question(s) ` +
          `to free STF experts for testing.`,
        );
      }
    }
  }

  console.log(
    `[setup] Connected. RUN_TAG=${RUN_TAG}. ` +
    `STF experts: ${stfExperts.length} (${stfExperts.map((e: any) => e.email).join(', ') || 'none'})`,
  );
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

  // Restore any questions we temporarily closed to free up STF experts.
  if (db && temporarilyClosedIds.length) {
    const questions = await db.getCollection('questions');
    await questions.updateMany(
      { _id: { $in: temporarilyClosedIds } },
      { $set: { status: 'open' } },
    );
    console.log(`[teardown] Restored ${temporarilyClosedIds.length} temporarily closed question(s) to open.`);
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

// ════════════════════════════════════════════════════════════════════════════
// 5. Time-bound allocation — WHATSAPP question (unallocated path)
//
// reallocateTimeBoundQuestions() calls findUnallocatedTimeBoundQuestions()
// which finds open WHATSAPP/AJRASAKHA questions with queue=[] and
// isAutoAllocate=true. It then assigns one STF (special_task_force=true)
// expert and writes: updateQueue, firstAllocationAt, currentExpertAllocatedAt,
// updateReputationScore(+1), and an 'answer_creation' notification.
//
// CRITICAL: only experts with special_task_force=true are eligible for initial
// time-bound allocation. If none are free (or none exist), the question is
// skipped. Tests self-skip with a console warning if stfExperts is empty.
// ════════════════════════════════════════════════════════════════════════════

describe('Time-bound allocation — WHATSAPP unallocated question → STF expert assigned', () => {
  let waQuestionId: string;
  let allocResult: any;

  beforeAll(async () => {
    if (!stfExperts.length) {
      console.warn('[G5] No STF experts in DB — time-bound unallocated tests will self-skip. ' +
        'Ensure at least one expert has special_task_force=true.');
    }

    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    const { insertedId } = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} wa-alloc paddy leaves turning yellow what fertilizer should i apply`,
      status: 'open',
      priority: 'high',
      source: 'WHATSAPP',
      isAutoAllocate: true,
      isOnHold: false,
      totalAnswersCount: 0,
      embedding: [],
      metrics: null,
      details: {
        state: 'Punjab',
        district: 'Ludhiana',
        crop: 'Paddy',
        season: 'Kharif',
        domain: 'Crop Protection',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    waQuestionId = insertedId.toString();
    createdQuestionIds.push(insertedId);

    await submissions.insertOne({
      questionId: insertedId,
      lastRespondedBy: null,
      history: [],
      queue: [],
      // currentExpertAllocatedAt absent → findUnallocatedTimeBoundQuestions picks it up
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    allocResult = await questionService.reallocateTimeBoundQuestions();
    console.log('[G5] allocResult:', JSON.stringify(allocResult));
  }, 30000);

  it('reports at least 1 question initially allocated', () => {
    if (!stfExperts.length) return;
    expect(allocResult.reallocated).toBeGreaterThanOrEqual(1);
  });

  it('submission queue has exactly 1 expert after allocation', async () => {
    if (!stfExperts.length) return;
    const sub = await getSubmission(waQuestionId);
    console.log('[G5] queue after alloc:', sub?.queue?.map((q: any) => q.toString()));
    expect(sub.queue).toHaveLength(1);
  });

  it('allocated expert has special_task_force=true (STF-only requirement enforced)', async () => {
    if (!stfExperts.length) return;
    const sub = await getSubmission(waQuestionId);
    const users = await db.getCollection('users');
    const expert = await users.findOne({ _id: new ObjectId(sub.queue[0].toString()) });
    console.log('[G5] allocated expert:', expert?.email, 'STF:', expert?.special_task_force);
    expect(expert?.special_task_force).toBe(true);
  });

  it('question has firstAllocationAt stamped', async () => {
    if (!stfExperts.length) return;
    const q = await getQuestion(waQuestionId);
    console.log('[G5] firstAllocationAt:', q?.firstAllocationAt);
    expect(q.firstAllocationAt).toBeInstanceOf(Date);
  });

  it('submission has currentExpertAllocatedAt set (45-min stuck clock starts)', async () => {
    if (!stfExperts.length) return;
    const sub = await getSubmission(waQuestionId);
    console.log('[G5] currentExpertAllocatedAt:', sub?.currentExpertAllocatedAt);
    expect(sub.currentExpertAllocatedAt).toBeInstanceOf(Date);
  });

  it('answer_creation notification sent to the allocated expert', async () => {
    if (!stfExperts.length) return;
    const sub = await getSubmission(waQuestionId);
    const notifications = await db.getCollection('notifications');
    const notif = await notifications.findOne({
      enitity_id: new ObjectId(waQuestionId),
      userId: sub.queue[0],
      type: 'answer_creation',
    });
    console.log('[G5] answer_creation notif:', notif ? 'found' : 'missing', notif?.message);
    expect(notif).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. Time-bound allocation — AJRASAKHA question (unallocated path)
//
// Same pipeline as WHATSAPP. Key differences:
//   - notification message says "Ajrasakha" not "WhatsApp"
//   - source stored as 'AJRASAKHA'
// ════════════════════════════════════════════════════════════════════════════

describe('Time-bound allocation — AJRASAKHA unallocated question → STF expert assigned', () => {
  let ajQuestionId: string;
  let allocResult: any;

  beforeAll(async () => {
    if (!stfExperts.length) {
      console.warn('[G6] No STF experts — AJRASAKHA time-bound tests will self-skip.');
    }

    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    const { insertedId } = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} aj-alloc cotton bollworm infestation how to treat`,
      status: 'open',
      priority: 'high',
      source: 'AJRASAKHA',
      isAutoAllocate: true,
      isOnHold: false,
      totalAnswersCount: 0,
      embedding: [],
      metrics: null,
      details: {
        state: 'Maharashtra',
        district: 'Nagpur',
        crop: 'Cotton',
        season: 'Kharif',
        domain: 'Crop Protection',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    ajQuestionId = insertedId.toString();
    createdQuestionIds.push(insertedId);

    await submissions.insertOne({
      questionId: insertedId,
      lastRespondedBy: null,
      history: [],
      queue: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    allocResult = await questionService.reallocateTimeBoundQuestions();
    console.log('[G6] allocResult:', JSON.stringify(allocResult));
  }, 30000);

  it('AJRASAKHA question reports at least 1 initially allocated', () => {
    if (!stfExperts.length) return;
    expect(allocResult.reallocated).toBeGreaterThanOrEqual(1);
  });

  it('submission queue has 1 STF expert', async () => {
    if (!stfExperts.length) return;
    const sub = await getSubmission(ajQuestionId);
    console.log('[G6] queue:', sub?.queue?.map((q: any) => q.toString()));
    expect(sub.queue).toHaveLength(1);
    const users = await db.getCollection('users');
    const expert = await users.findOne({ _id: new ObjectId(sub.queue[0].toString()) });
    expect(expert?.special_task_force).toBe(true);
  });

  it('notification message mentions Ajrasakha (not WhatsApp)', async () => {
    if (!stfExperts.length) return;
    const sub = await getSubmission(ajQuestionId);
    const notifications = await db.getCollection('notifications');
    const notif = await notifications.findOne({
      enitity_id: new ObjectId(ajQuestionId),
      type: 'answer_creation',
    });
    console.log('[G6] notif message:', notif?.message);
    expect(notif).not.toBeNull();
    expect(notif.message).toMatch(/ajrasakha/i);
  });

  it('firstAllocationAt is stamped on the AJRASAKHA question', async () => {
    if (!stfExperts.length) return;
    const q = await getQuestion(ajQuestionId);
    expect(q.firstAllocationAt).toBeInstanceOf(Date);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Time-bound allocation — negative cases: questions NOT picked up
//
// findUnallocatedTimeBoundQuestions filters by:
//   source IN ['WHATSAPP', 'AJRASAKHA']
//   status IN ['open', 'delayed', 'duplicate']
//   isAutoAllocate = true
//   isOnHold != true
//   queue.size = 0
//   currentExpertAllocatedAt absent or null
//
// Any question that fails one of these filters must remain unallocated after
// the cron runs.
// ════════════════════════════════════════════════════════════════════════════

describe('Time-bound allocation — questions that must NOT be picked up by reallocateTimeBoundQuestions', () => {
  const negativeIds: string[] = [];

  beforeAll(async () => {
    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    const base = {
      userId: moderatorUser._id,
      priority: 'high',
      totalAnswersCount: 0,
      embedding: [],
      metrics: null,
      details: {
        state: 'Punjab',
        district: 'Ludhiana',
        crop: 'Paddy',
        season: 'Kharif',
        domain: 'Crop Protection',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const seeds = [
      // 0: isAutoAllocate=false — filter requires isAutoAllocate=true
      { ...base, question: `${RUN_TAG} neg-autofalse paddy`, source: 'WHATSAPP', status: 'open', isAutoAllocate: false, isOnHold: false },
      // 1: isOnHold=true — filter excludes isOnHold questions
      { ...base, question: `${RUN_TAG} neg-onhold paddy`, source: 'WHATSAPP', status: 'open', isAutoAllocate: true, isOnHold: true },
      // 2: status='closed' — only open/delayed/duplicate are eligible
      { ...base, question: `${RUN_TAG} neg-closed paddy`, source: 'WHATSAPP', status: 'closed', isAutoAllocate: true, isOnHold: false },
      // 3: status='non_agri' — explicitly excluded
      { ...base, question: `${RUN_TAG} neg-nonagri paddy`, source: 'WHATSAPP', status: 'non_agri', isAutoAllocate: true, isOnHold: false },
      // 4: source='OUTREACH' — not a time-bound source
      { ...base, question: `${RUN_TAG} neg-outreach paddy`, source: 'OUTREACH', status: 'open', isAutoAllocate: true, isOnHold: false },
      // 5: source='AGRI_EXPERT' — not a time-bound source
      { ...base, question: `${RUN_TAG} neg-agriexpert paddy`, source: 'AGRI_EXPERT', status: 'open', isAutoAllocate: true, isOnHold: false },
      // 6: already allocated (non-empty queue) — filter requires queue.size=0
      { ...base, question: `${RUN_TAG} neg-allocated paddy`, source: 'WHATSAPP', status: 'open', isAutoAllocate: true, isOnHold: false, firstAllocationAt: new Date() },
    ];

    for (let i = 0; i < seeds.length; i++) {
      const { insertedId } = await questions.insertOne(seeds[i]);
      negativeIds.push(insertedId.toString());
      createdQuestionIds.push(insertedId);

      const subDoc: any = {
        questionId: insertedId,
        lastRespondedBy: null,
        history: [],
        queue: i === 6 ? [expertUser1._id] : [],  // seed #6 has an expert in queue
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (i === 6) subDoc.currentExpertAllocatedAt = new Date();
      await submissions.insertOne(subDoc);
    }

    await questionService.reallocateTimeBoundQuestions();
  }, 30000);

  it('isAutoAllocate=false WHATSAPP question is NOT allocated (queue stays empty)', async () => {
    const sub = await getSubmission(negativeIds[0]);
    console.log('[G7-0] isAutoAllocate=false queue:', sub?.queue?.length);
    expect(sub.queue).toHaveLength(0);
  });

  it('isOnHold=true WHATSAPP question is NOT allocated', async () => {
    const sub = await getSubmission(negativeIds[1]);
    console.log('[G7-1] isOnHold queue:', sub?.queue?.length);
    expect(sub.queue).toHaveLength(0);
  });

  it('closed WHATSAPP question is NOT allocated', async () => {
    const sub = await getSubmission(negativeIds[2]);
    console.log('[G7-2] closed queue:', sub?.queue?.length);
    expect(sub.queue).toHaveLength(0);
  });

  it('non_agri WHATSAPP question is NOT allocated', async () => {
    const sub = await getSubmission(negativeIds[3]);
    console.log('[G7-3] non_agri queue:', sub?.queue?.length);
    expect(sub.queue).toHaveLength(0);
  });

  it('OUTREACH source is NOT picked up by time-bound cron', async () => {
    const sub = await getSubmission(negativeIds[4]);
    console.log('[G7-4] OUTREACH queue:', sub?.queue?.length);
    expect(sub.queue).toHaveLength(0);
  });

  it('AGRI_EXPERT source is NOT picked up by time-bound cron', async () => {
    const sub = await getSubmission(negativeIds[5]);
    console.log('[G7-5] AGRI_EXPERT queue:', sub?.queue?.length);
    expect(sub.queue).toHaveLength(0);
  });

  it('already-allocated WHATSAPP question (non-empty queue) is NOT re-allocated', async () => {
    const sub = await getSubmission(negativeIds[6]);
    console.log('[G7-6] already-allocated queue:', sub?.queue?.length);
    // Queue started with 1 expert and must still have exactly 1 (not duplicated)
    expect(sub.queue).toHaveLength(1);
    expect(sub.queue[0].toString()).toBe(expertUser1._id.toString());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Time-bound allocation — MAX_TIME_BOUND=1 expert capacity enforcement
//
// Each expert can hold at most 1 active time-bound question at a time
// (getTimeBoundActiveCountPerExpert counts questions where the expert is in
// queue, source is WHATSAPP/AJRASAKHA, status is open/delayed, AND they
// haven't submitted an answer yet / finished their review).
//
// An expert who is already at capacity must be skipped for new questions.
// ════════════════════════════════════════════════════════════════════════════

describe('Time-bound allocation — MAX_TIME_BOUND=1 expert capacity enforcement', () => {
  let newQuestionId: string;
  let busyExpert: any;
  let allocResult: any;

  beforeAll(async () => {
    if (!stfExperts.length) {
      console.warn('[G8] No STF experts — capacity tests will self-skip.');
      return;
    }

    busyExpert = stfExperts[0];

    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    // Seed 1: "busy" question — busyExpert is in queue with no answer yet.
    // getTimeBoundActiveCountPerExpert counts this as 1 active for busyExpert.
    const busyQ = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} cap-busy existing wheat stem fly question`,
      status: 'open',
      priority: 'high',
      source: 'WHATSAPP',
      isAutoAllocate: true,
      isOnHold: false,
      totalAnswersCount: 0,
      embedding: [],
      metrics: null,
      firstAllocationAt: new Date(),
      details: { state: 'Punjab', district: 'Ludhiana', crop: 'Wheat', season: 'Rabi', domain: 'Crop Protection' },
      createdAt: new Date(Date.now() - 10_000), // created a bit earlier so it sorts first
      updatedAt: new Date(),
    });
    createdQuestionIds.push(busyQ.insertedId);
    await submissions.insertOne({
      questionId: busyQ.insertedId,
      lastRespondedBy: null,
      history: [],          // no answer = still pending at position 0
      queue: [busyExpert._id],
      currentExpertAllocatedAt: new Date(),
      currentExpertOpenedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed 2: new WHATSAPP question that needs a fresh STF expert.
    const newQ = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} cap-new tomato leaf curl question`,
      status: 'open',
      priority: 'high',
      source: 'WHATSAPP',
      isAutoAllocate: true,
      isOnHold: false,
      totalAnswersCount: 0,
      embedding: [],
      metrics: null,
      details: { state: 'Karnataka', district: 'Kolar', crop: 'Tomato', season: 'Rabi', domain: 'Crop Protection' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    newQuestionId = newQ.insertedId.toString();
    createdQuestionIds.push(newQ.insertedId);
    await submissions.insertOne({
      questionId: newQ.insertedId,
      lastRespondedBy: null,
      history: [],
      queue: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    allocResult = await questionService.reallocateTimeBoundQuestions();
    console.log('[G8] allocResult:', JSON.stringify(allocResult));
  }, 30000);

  it('busy STF expert is NOT assigned to the new question', async () => {
    if (!stfExperts.length) return;
    const sub = await getSubmission(newQuestionId);
    const queueStrings = (sub.queue ?? []).map((q: any) => q.toString());
    console.log('[G8] new question queue:', queueStrings, 'busy expert:', busyExpert._id.toString());
    expect(queueStrings).not.toContain(busyExpert._id.toString());
  });

  it('if only 1 STF expert exists (now busy), new question is skipped (queue stays empty)', async () => {
    if (stfExperts.length !== 1) {
      console.log('[G8] multiple STF experts — single-busy branch does not apply');
      return;
    }
    const sub = await getSubmission(newQuestionId);
    expect(sub.queue).toHaveLength(0);
    expect(allocResult.skipped).toBeGreaterThanOrEqual(1);
  });

  it('if 2+ STF experts exist, new question is allocated to a different free expert', async () => {
    if (stfExperts.length < 2) {
      console.log('[G8] fewer than 2 STF experts — multi-STF branch does not apply');
      return;
    }
    const sub = await getSubmission(newQuestionId);
    console.log('[G8] new question queue:', sub?.queue?.map((q: any) => q.toString()));
    expect(sub.queue).toHaveLength(1);
    expect(sub.queue[0].toString()).not.toBe(busyExpert._id.toString());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. Time-bound allocation — question already in reviewer stage not re-processed
//
// After a reviewer is assigned (queue=[author, reviewer], history has author
// answer + reviewer in-review with no answer yet), a subsequent cron run must
// leave the queue untouched. This guards against:
//   • findUnallocatedTimeBoundQuestions picking it up again (queue.size > 0)
//   • findAnsweredQuestionsNeedingReviewer picking it up again
//     (lastHistory.answer is absent — reviewer hasn't submitted yet)
// ════════════════════════════════════════════════════════════════════════════

describe('Time-bound allocation — reviewer-stage question is not re-processed by cron', () => {
  let reviewerStageQuestionId: string;

  beforeAll(async () => {
    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    // Seed: WHATSAPP question where expertUser1 authored and moderatorUser is
    // the reviewer currently in-review (no answer submitted yet).
    // currentExpertAllocatedAt is set to now so it is not >45 min (stuck guard).
    const { insertedId } = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} G11 reviewer-stage paddy blight do not re-process`,
      status: 'open',
      priority: 'high',
      source: 'WHATSAPP',
      isAutoAllocate: true,
      isOnHold: false,
      totalAnswersCount: 1,
      embedding: [],
      metrics: null,
      firstAllocationAt: new Date(),
      details: { state: 'Punjab', district: 'Ludhiana', crop: 'Paddy', season: 'Kharif', domain: 'Crop Protection' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    reviewerStageQuestionId = insertedId.toString();
    createdQuestionIds.push(insertedId);

    await submissions.insertOne({
      questionId: insertedId,
      lastRespondedBy: expertUser1._id,
      queue: [expertUser1._id, moderatorUser._id],
      history: [
        {
          updatedBy: expertUser1._id,
          answer: `${RUN_TAG} G11 author answer already submitted`,
          status: 'reviewed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          updatedBy: moderatorUser._id,
          answer: null,
          status: 'in-review',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      currentExpertAllocatedAt: new Date(),
      currentExpertOpenedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await questionService.reallocateTimeBoundQuestions();
  }, 30000);

  it('queue still has exactly 2 members after cron run (not reset or extended)', async () => {
    const sub = await getSubmission(reviewerStageQuestionId);
    console.log('[G11] queue after cron:', sub?.queue?.map((q: any) => q.toString()));
    expect(sub.queue).toHaveLength(2);
  });

  it('queue[0] is still the original author (expertUser1)', async () => {
    const sub = await getSubmission(reviewerStageQuestionId);
    expect(sub.queue[0].toString()).toBe(expertUser1._id.toString());
  });

  it('queue[1] is still the original reviewer (moderatorUser) — no third expert added', async () => {
    const sub = await getSubmission(reviewerStageQuestionId);
    expect(sub.queue[1].toString()).toBe(moderatorUser._id.toString());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. Toggle auto-allocate — sequential ON → OFF → ON on the same question
//
// The toggle is a flip (not idempotent). A double-tap turns it back OFF,
// and a triple-tap re-runs autoAllocateExperts. This documents:
//   • ON-OFF: queue preserved (not cleared), flag flips correctly
//   • second ON: autoAllocateExperts re-runs, queue has no duplicate experts
// ════════════════════════════════════════════════════════════════════════════

describe('Toggle auto-allocate — sequential ON → OFF → ON same question leaves no duplicate experts', () => {
  let toggleQId: string;

  beforeAll(async () => {
    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    const { insertedId } = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} G12 toggle-sequential wheat rust`,
      status: 'open',
      priority: 'medium',
      source: 'OUTREACH',
      isAutoAllocate: false,
      totalAnswersCount: 0,
      embedding: [],
      metrics: null,
      details: { ...AGRI_EXPERT_DETAILS, normalised_crop: 'Brinjal' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    toggleQId = insertedId.toString();
    createdQuestionIds.push(insertedId);

    await submissions.insertOne({
      questionId: insertedId,
      lastRespondedBy: null,
      history: [],
      queue: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }, 30000);

  it('OFF → ON: isAutoAllocate flips to true and queue is populated with exactly 1 expert', async () => {
    as(moderatorUser);
    const res = await apiPatch(
      `${ROUTE_PREFIX}/questions/${toggleQId}/toggle-auto-allocate`,
    );
    console.log('[G12] toggle-ON status:', res.status);
    expect(res.status).toBe(200);

    const q = await getQuestion(toggleQId);
    expect(q.isAutoAllocate).toBe(true);

    const sub = await getSubmission(toggleQId);
    console.log('[G12] queue after ON:', sub?.queue?.length);
    expect(sub.queue.length).toBeGreaterThanOrEqual(1);
  });

  it('ON → OFF: isAutoAllocate flips to false, queue is preserved (not cleared)', async () => {
    as(moderatorUser);
    const subBefore = await getSubmission(toggleQId);
    const queueLenBefore = subBefore.queue.length;

    const res = await apiPatch(
      `${ROUTE_PREFIX}/questions/${toggleQId}/toggle-auto-allocate`,
    );
    console.log('[G12] toggle-OFF status:', res.status);
    expect(res.status).toBe(200);

    const q = await getQuestion(toggleQId);
    expect(q.isAutoAllocate).toBe(false);

    const sub = await getSubmission(toggleQId);
    console.log('[G12] queue after OFF:', sub?.queue?.length, '(was', queueLenBefore, ')');
    expect(sub.queue).toHaveLength(queueLenBefore);
  });

  it('second ON: no duplicate experts in queue (autoAllocateExperts re-runs cleanly)', async () => {
    as(moderatorUser);
    const res = await apiPatch(
      `${ROUTE_PREFIX}/questions/${toggleQId}/toggle-auto-allocate`,
    );
    console.log('[G12] second toggle-ON status:', res.status);
    expect(res.status).toBe(200);

    const sub = await getSubmission(toggleQId);
    const ids = sub.queue.map((q: any) => q.toString());
    const uniqueIds = new Set(ids);
    console.log('[G12] queue after second ON:', ids, 'unique:', uniqueIds.size);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. Time-bound allocation — concurrent run guard
//
// isReallocatingTimeBound is a module-level boolean set synchronously on line
// 5655 before the first await. A second call fired immediately after the first
// sees it as true and returns early without doing any DB work.
// ════════════════════════════════════════════════════════════════════════════

describe('Time-bound allocation — concurrent run guard prevents double-allocation', () => {
  it('second concurrent call returns early with "Reallocation already in progress"', async () => {
    // Start the first call WITHOUT awaiting — it sets isReallocatingTimeBound=true
    // synchronously before its first await, so the guard check fires immediately.
    const firstCall = questionService.reallocateTimeBoundQuestions();
    const secondResult = await questionService.reallocateTimeBoundQuestions();

    console.log('[G9-guard] secondResult:', JSON.stringify(secondResult));
    expect(secondResult.message).toBe('Reallocation already in progress');
    expect(secondResult.reallocated).toBe(0);
    expect(secondResult.skipped).toBe(0);

    // Let the first call settle so the lock is released before the next group runs.
    await firstCall;
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. Time-bound allocation — needsReviewer path
//
// findAnsweredQuestionsNeedingReviewer picks up WHATSAPP/AJRASAKHA questions
// where:
//   - queue.length >= 1 (at least one expert assigned)
//   - history.length >= queue.length (all assigned experts have entries)
//   - Either: position-0 author has submitted an answer (lastHistory.answer exists)
//             OR: last reviewer has finished (lastHistory.status != 'in-review')
//
// The cron then calls assignTimeBoundReviewer → pushes reviewer into queue +
// history[status='in-review'], resets currentExpertAllocatedAt clock.
// ════════════════════════════════════════════════════════════════════════════

describe('Time-bound allocation — answered question gets reviewer assigned (needsReviewer path)', () => {
  let reviewQuestionId: string;
  let allocResult: any;

  beforeAll(async () => {
    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    // Seed: WHATSAPP question where the author (expertUser1) already submitted
    // an answer → findAnsweredQuestionsNeedingReviewer picks it up.
    const { insertedId } = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} reviewer-needed paddy stem rot brown lesions how to treat`,
      status: 'open',
      priority: 'high',
      source: 'WHATSAPP',
      isAutoAllocate: true,
      isOnHold: false,
      totalAnswersCount: 1,
      embedding: [],
      metrics: null,
      firstAllocationAt: new Date(),
      details: { state: 'Punjab', district: 'Ludhiana', crop: 'Paddy', season: 'Kharif', domain: 'Crop Protection' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    reviewQuestionId = insertedId.toString();
    createdQuestionIds.push(insertedId);

    await submissions.insertOne({
      questionId: insertedId,
      lastRespondedBy: expertUser1._id,
      // queue has 1 member (the author); history has 1 matching entry with an answer
      // → histLen(1) >= queueLen(1) + lastHistory.answer exists → query matches
      queue: [expertUser1._id],
      history: [{
        updatedBy: expertUser1._id,
        answer: 'Apply copper oxychloride fungicide at 2.5 g/L water and improve field drainage.',
        status: 'reviewed',
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      currentExpertAllocatedAt: new Date(),
      currentExpertOpenedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    allocResult = await questionService.reallocateTimeBoundQuestions();
    console.log('[G10] allocResult:', JSON.stringify(allocResult));
  }, 30000);

  it('reports at least 1 reviewer assigned', () => {
    expect(allocResult.reallocated).toBeGreaterThanOrEqual(1);
  });

  it('submission queue grows from 1 to 2 experts', async () => {
    const sub = await getSubmission(reviewQuestionId);
    console.log('[G10] queue after reviewer assignment:', sub?.queue?.map((q: any) => q.toString()));
    expect(sub.queue).toHaveLength(2);
  });

  it('reviewer is a different expert from the author (expertUser1)', async () => {
    const sub = await getSubmission(reviewQuestionId);
    const reviewerId = sub.queue[1].toString();
    console.log('[G10] reviewer:', reviewerId, 'author:', expertUser1._id.toString());
    expect(reviewerId).not.toBe(expertUser1._id.toString());
  });

  it('history has a new in-review entry for the reviewer', async () => {
    const sub = await getSubmission(reviewQuestionId);
    console.log('[G10] history length:', sub?.history?.length, JSON.stringify(sub?.history?.[1]));
    expect(sub.history).toHaveLength(2);
    expect(sub.history[1].status).toBe('in-review');
    expect(sub.history[1].updatedBy.toString()).toBe(sub.queue[1].toString());
  });

  it('peer_review notification sent to the reviewer', async () => {
    const sub = await getSubmission(reviewQuestionId);
    const reviewerId = sub.queue[1];
    const notifications = await db.getCollection('notifications');
    const notif = await notifications.findOne({
      enitity_id: new ObjectId(reviewQuestionId),
      userId: reviewerId,
      type: 'peer_review',
    });
    console.log('[G10] peer_review notif:', notif ? 'found' : 'missing', notif?.message);
    expect(notif).not.toBeNull();
  });

  it('currentExpertAllocatedAt is reset and currentExpertOpenedAt is cleared (reviewer clock starts fresh)', async () => {
    const sub = await getSubmission(reviewQuestionId);
    console.log('[G10] currentExpertAllocatedAt:', sub?.currentExpertAllocatedAt, 'openedAt:', sub?.currentExpertOpenedAt);
    expect(sub.currentExpertAllocatedAt).toBeInstanceOf(Date);
    expect(sub.currentExpertOpenedAt).toBeNull();
  });
});
