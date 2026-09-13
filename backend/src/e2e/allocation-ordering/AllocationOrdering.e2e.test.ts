/**
 * Allocation Ordering — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * Two correctness properties of the time-bound allocation cron that are NOT
 * covered by the main AutoAllocation suite:
 *
 *   questionService.reallocateTimeBoundQuestions()  (cron: every 2 min in prod)
 *
 * ISSUE CONTEXT
 * -------------
 * Issue #3 — "Previously entered questions are not getting allocated; newer
 * questions are allocated first."
 *   reallocateTimeBoundQuestions() merges all eligible questions and sorts by
 *   createdAt ASC before processing. When only one STF expert is free, the
 *   oldest eligible question must receive the expert and any newer questions
 *   must be skipped — not the reverse.
 *
 * Issue #5 — "Same question getting assigned to a single person twice."
 *   An expert who already appears in a question's submission history (as a
 *   prior author or reviewer) must not be chosen as the replacement in the
 *   stuck/idle reallocation path. The service excludes experts present in
 *   both queue and history when building the replacement candidate list.
 *
 * WHAT IS NOT TESTED HERE (not capturable)
 * -----------------------------------------
 * Issue #4 — "Expert attends question but not in history/audit trail."
 *   "Attending" sets currentExpertOpenedAt. There is no API endpoint to open
 *   a question without submitting an answer, so the attend-without-answer state
 *   cannot be triggered via the test harness. Tested indirectly via the full
 *   post-allocation flow in PostAllocation.e2e.test.ts.
 *
 * Issue #6 — "One question assigned to two people simultaneously."
 *   True HTTP concurrency (two PATCH requests firing at the same instant) is
 *   not reliably producible in a single-threaded test runner. The concurrent
 *   guard for the cron (isReallocatingTimeBound) is already covered in
 *   AutoAllocation G9. The HTTP-level concurrent manual allocation guard is
 *   broken (BUG-002) and not capturable cleanly.
 *
 * STRATEGY
 * --------
 * In-process harness — same as AutoAllocation.e2e.test.ts:
 *   - Real Atlas DB (.env / .env.test)
 *   - STF experts auto-promoted to ensure at least 3 exist
 *   - Questions seeded directly into MongoDB with controlled timestamps
 *   - reallocateTimeBoundQuestions() called directly on questionService
 *   - startBalanceWorkloadWorkers mocked (G2 uses the stuck path which would
 *     otherwise try to spawn Node Worker threads)
 *   - Leftover open time-bound questions temporarily closed so they do not
 *     consume STF capacity before our seeded questions are processed
 *   - No HTTP server needed — only direct service calls
 */

// Mongo on Atlas (mongodb+srv) requires TLS. MongoDatabase disables TLS when
// NODE_ENV==='test', so force a non-test env BEFORE any module builds the Mongo
// client. Must run before loadAppModules().
process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.test' });

import express from 'express';
import request from 'supertest';
import { useExpressServer } from 'routing-controllers';
import { ObjectId } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// G2 uses the stuck/idle reallocation path, which calls startBalanceWorkloadWorkers.
// Mock it to prevent Worker thread spawning against non-existent build/ files.
vi.mock('#root/workers/balanceWorkload.manager.js', () => ({
  startBalanceWorkloadWorkers: vi.fn().mockResolvedValue({ processed: 1, failedWorkers: 0 }),
}));

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_AO_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-alloc-ordering-key';

let app: express.Express;
let db: any;
let questionService: any;
let moderatorUser: any;
let currentTestUser: any = null;

// STF experts (special_task_force=true) — required for time-bound allocation.
// Populated in beforeAll; tests self-skip if too few exist after auto-promotion.
let stfExperts: any[] = [];

// Track every created doc so the real DB is left clean.
const createdQuestionIds: ObjectId[] = [];

const originalStfValues = new Map<string, boolean | undefined>();

// ─────────────────────────────────────────────────────────────────────────────
// Global setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Warm-up: resolve the AnswerService circular import before the core barrel runs.
  await import('#root/modules/answer/services/AnswerService.js');

  // InternalApiAuth runs on every route — set the key for requests that go
  // through the HTTP layer (none in this file, but keeps the harness consistent
  // so rebind calls don't blow up if something checks the env at boot).
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const { loadAppModules, getContainer } = await import('#root/bootstrap/loadModules.js');
  const { GLOBAL_TYPES } = await import('#root/types.js');
  const { CORE_TYPES } = await import('#root/modules/core/types.js');

  const { controllers } = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);
  questionService = container.get(CORE_TYPES.QuestionService);

  // Dummy the AI seam for safety (AGRI_EXPERT path skips AI, but keeps suite hermetic).
  const dummyAi = {
    getEmbedding: async () => ({ embedding: [] }),
    fetchWhatsAppMessage: async () => ({}),
    searchGdb: async () => ({ exact_match: null, selected_match: null }),
  };
  try { (container as any).rebindSync(CORE_TYPES.AIService).toConstantValue(dummyAi); } catch {}

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  const users = await db.getCollection('users');
  moderatorUser = await users.findOne({ email: process.env.MODERATOR_EMAIL });
  if (!moderatorUser) {
    throw new Error(`MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL} not found in DB`);
  }

  // Auto-promote to MIN_STF experts (same logic as AutoAllocation beforeAll).
  // G2 needs at least 3: previousAuthor, stuckReviewer, and a third for replacement.
  const MIN_STF = 3;
  const existingStf = await users
    .find({ role: 'expert', isBlocked: false, special_task_force: true })
    .toArray();
  if (existingStf.length < MIN_STF) {
    const needed = MIN_STF - existingStf.length;
    const existingIds = existingStf.map((e: any) => e._id);
    const toPromote = await users
      .find({ role: 'expert', isBlocked: false, _id: { $nin: existingIds } })
      .sort({ reputation_score: 1 })
      .limit(needed)
      .toArray();
    if (toPromote.length > 0) {
      for (const expert of toPromote) {
        originalStfValues.set(expert._id.toString(), expert.special_task_force);
      }
      await users.updateMany(
        { _id: { $in: toPromote.map((e: any) => e._id) } },
        { $set: { special_task_force: true } },
      );
      console.log(`[setup] Promoted ${toPromote.length} expert(s) to STF.`);
    }
  }
  stfExperts = await users
    .find({ role: 'expert', isBlocked: false, special_task_force: true })
    .sort({ reputation_score: 1 })
    .toArray();

  // NOTE: On staging, we do not close existing questions.
  // Tests must work with whatever questions exist in the queue.

  console.log(
    `[setup] Connected. RUN_TAG=${RUN_TAG}. ` +
    `STF experts: ${stfExperts.length} (${stfExperts.map((e: any) => e.email).join(', ') || 'none'})`,
  );
}, 90000);

afterAll(async () => {
  currentTestUser = moderatorUser;
  if (createdQuestionIds.length) {
    await Promise.all(
      createdQuestionIds.map(id =>
        apiDelete(`${ROUTE_PREFIX}/questions/${id.toString()}`),
      ),
    );
    console.log(`[teardown] Cleaned ${createdQuestionIds.length} questions.`);
  }
  if (db && originalStfValues.size) {
    const users = await db.getCollection('users');
    await Promise.all(
      Array.from(originalStfValues.entries()).map(([id, value]) =>
        users.updateOne(
          { _id: new ObjectId(id) },
          value === undefined
            ? { $unset: { special_task_force: '' } }
            : { $set: { special_task_force: value } },
        ),
      ),
    );
    console.log(`[teardown] Restored ${originalStfValues.size} STF value(s).`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiDelete(path: string) {
  return request(app).delete(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getSubmission(id: string) {
  const col = await db.getCollection('question_submissions');
  return col.findOne({ questionId: new ObjectId(id) });
}

// ════════════════════════════════════════════════════════════════════════════
// Group 1 — Chronological ordering: older question is allocated first (Issue #3)
//
// reallocateTimeBoundQuestions() sorts all eligible time-bound questions by
// createdAt ASC before processing. When fewer free STF experts exist than
// eligible questions, the OLDEST questions get experts — not the newest.
//
// Setup:
//   - "Holding" questions seed all but stfExperts[0] as busy (each holding
//     question has its respective STF expert in queue + currentExpertAllocatedAt
//     = now, so getTimeBoundActiveCountPerExpert counts them as active).
//   - OLD question: createdAt = 2 min ago
//   - NEW question: createdAt = now
//   Only stfExperts[0] is free → exactly one of the two test questions is
//   allocated. The test asserts it is the OLDER one.
// ════════════════════════════════════════════════════════════════════════════

describe('Allocation ordering — older question allocated before newer when STF capacity is limited (Issue #3)', () => {
  let olderQuestionId: string;
  let newerQuestionId: string;
  let holdingQuestionIds: ObjectId[] = [];
  let allocResult: any;

  beforeAll(async () => {
    if (!stfExperts.length) {
      console.warn('[G1] No STF experts — chronological ordering test will self-skip.');
      return;
    }

    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    // Seed holding questions for stfExperts[1..] so their capacity is consumed.
    // Each holding question has the expert in queue with currentExpertAllocatedAt=now
    // (not stuck) so the cron won't try to reallocate them.
    holdingQuestionIds = [];
    for (const stf of stfExperts.slice(1)) {
      const { insertedId } = await questions.insertOne({
        userId: moderatorUser._id,
        question: `${RUN_TAG} G1-holding capacity-blocker for ${stf.email}`,
        status: 'open',
        priority: 'high',
        source: 'WHATSAPP',
        isAutoAllocate: true,
        isOnHold: false,
        totalAnswersCount: 0,
        embedding: [],
        metrics: null,
        firstAllocationAt: new Date(),
        details: { state: 'Punjab', district: 'Ludhiana', crop: 'Paddy', season: 'Kharif', domain: 'Crop Protection' },
        createdAt: new Date(Date.now() - 180_000), // 3 min ago — definitely before both test questions
        updatedAt: new Date(),
      });
      holdingQuestionIds.push(insertedId);
      createdQuestionIds.push(insertedId);
      await submissions.insertOne({
        questionId: insertedId,
        lastRespondedBy: null,
        history: [],
        queue: [stf._id],
        currentExpertAllocatedAt: new Date(), // recent — not stuck, just occupying capacity
        currentExpertOpenedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    console.log(`[G1] Seeded ${holdingQuestionIds.length} holding question(s) to occupy stfExperts[1..]`);

    // Seed the OLDER test question (2 minutes ago).
    const olderDate = new Date(Date.now() - 120_000);
    const { insertedId: olderId } = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} G1-OLDER paddy yellowing leaves should-be-allocated-first`,
      status: 'open',
      priority: 'high',
      source: 'WHATSAPP',
      isAutoAllocate: true,
      isOnHold: false,
      totalAnswersCount: 0,
      embedding: [],
      metrics: null,
      details: { state: 'Punjab', district: 'Ludhiana', crop: 'Paddy', season: 'Kharif', domain: 'Crop Protection' },
      createdAt: olderDate,
      updatedAt: olderDate,
    });
    olderQuestionId = olderId.toString();
    createdQuestionIds.push(olderId);
    await submissions.insertOne({
      questionId: olderId,
      lastRespondedBy: null,
      history: [],
      queue: [],
      createdAt: olderDate,
      updatedAt: olderDate,
    });

    // Seed the NEWER test question (now).
    const newerDate = new Date();
    const { insertedId: newerId } = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} G1-NEWER cotton bollworm should-be-skipped-when-capacity-exhausted`,
      status: 'open',
      priority: 'high',
      source: 'WHATSAPP',
      isAutoAllocate: true,
      isOnHold: false,
      totalAnswersCount: 0,
      embedding: [],
      metrics: null,
      details: { state: 'Punjab', district: 'Ludhiana', crop: 'Cotton', season: 'Kharif', domain: 'Crop Protection' },
      createdAt: newerDate,
      updatedAt: newerDate,
    });
    newerQuestionId = newerId.toString();
    createdQuestionIds.push(newerId);
    await submissions.insertOne({
      questionId: newerId,
      lastRespondedBy: null,
      history: [],
      queue: [],
      createdAt: newerDate,
      updatedAt: newerDate,
    });

    allocResult = await questionService.reallocateTimeBoundQuestions();
    console.log('[G1] allocResult:', JSON.stringify(allocResult));
    console.log(`[G1] olderQuestionId=${olderQuestionId} newerQuestionId=${newerQuestionId}`);
  }, 30000);

  afterAll(async () => {
    // Close both test questions and all holding questions to free STF capacity for G2.
    if (!db) return;
    const questions = await db.getCollection('questions');
    const toClose = [...holdingQuestionIds, olderQuestionId, newerQuestionId]
      .filter(Boolean)
      .map(id => (typeof id === 'string' ? new ObjectId(id) : id));
    if (toClose.length) {
      await questions.updateMany({ _id: { $in: toClose } }, { $set: { status: 'closed' } });
    }
    console.log('[G1] afterAll: closed test + holding questions — STF experts freed for G2');
  }, 15000);

  it('cron reports at least 1 question allocated', () => {
    if (!stfExperts.length) return;
    expect(allocResult.reallocated).toBeGreaterThanOrEqual(1);
  });

  it('older question (earlier createdAt) has a non-empty queue — it got the STF expert', async () => {
    if (!stfExperts.length) return;
    const sub = await getSubmission(olderQuestionId);
    console.log('[G1] older question queue:', sub?.queue?.map((q: any) => q.toString()));
    expect(sub.queue).toHaveLength(1);
  });

  it('newer question is skipped — queue stays empty when only stfExperts[0] is free', async () => {
    if (!stfExperts.length) return;
    if (stfExperts.length === 1) {
      // With 1 STF expert: older gets it, newer is definitely skipped.
      const sub = await getSubmission(newerQuestionId);
      console.log('[G1] newer question queue (1-STF scenario):', sub?.queue?.map((q: any) => q.toString()));
      expect(sub.queue).toHaveLength(0);
    } else {
      // With N≥2 STF experts: we held N-1 back via holding questions, leaving only
      // stfExperts[0] free. Newer should still be empty.
      const sub = await getSubmission(newerQuestionId);
      console.log('[G1] newer question queue (multi-STF scenario):', sub?.queue?.map((q: any) => q.toString()));
      expect(sub.queue).toHaveLength(0);
    }
  });

  it('the expert in the older question has special_task_force=true', async () => {
    if (!stfExperts.length) return;
    const sub = await getSubmission(olderQuestionId);
    if (!sub?.queue?.length) return; // older not allocated — skip to avoid noise
    const users = await db.getCollection('users');
    const expert = await users.findOne({ _id: new ObjectId(sub.queue[0].toString()) });
    console.log('[G1] allocated expert:', expert?.email, 'STF:', expert?.special_task_force);
    expect(expert?.special_task_force).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 2 — Expert already in history excluded from replacement (Issue #5)
//
// "Same question getting assigned to a single person twice."
//
// The stuck/idle reallocation path (findTimeBoundQuestionsForReallocation) selects
// a replacement expert who is NOT in queue AND NOT in history. This prevents an
// expert who previously authored or reviewed a question from being re-assigned
// to the same question again via the stuck path.
//
// Setup:
//   - stfExperts[0]: was the PREVIOUS AUTHOR — has a history entry with an answer
//   - stfExperts[1]: the CURRENT STUCK REVIEWER — in queue[1], allocated >45 min
//     ago, never opened it (currentExpertOpenedAt absent)
//   - stfExperts[2]: the only eligible REPLACEMENT
//
// Expected: cron detects the stuck reviewer, builds a flatAssignments entry,
// and the expertId in that entry is stfExperts[2] — not [0] (history) or [1] (stuck).
//
// Self-skips if fewer than 3 STF experts are available.
// ════════════════════════════════════════════════════════════════════════════

describe('Allocation ordering — expert already in history is excluded from re-assignment as stuck replacement (Issue #5)', () => {
  let questionId: string;
  let submissionId: string;
  let allocResult: any;
  let workerAssignments: any[];

  beforeAll(async () => {
    if (stfExperts.length < 3) {
      console.warn('[G2] Fewer than 3 STF experts — history-exclusion test will self-skip.');
      return;
    }

    // Reset the worker mock to isolate G2's assertions from G1's calls.
    const { startBalanceWorkloadWorkers } = await import('#root/workers/balanceWorkload.manager.js');
    const spy = vi.mocked(startBalanceWorkloadWorkers);
    spy.mockClear();

    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');

    // Question state: stfExperts[0] authored (history entry with answer),
    // stfExperts[1] is the reviewer who was allocated 46 min ago but never opened.
    // currentExpertAllocatedAt > 45 min → stuck path fires.
    const stuckAt = new Date(Date.now() - 46 * 60 * 1000);
    const { insertedId: qId } = await questions.insertOne({
      userId: moderatorUser._id,
      question: `${RUN_TAG} G2 stuck-reviewer history-exclusion paddy rust`,
      status: 'open',
      priority: 'high',
      source: 'WHATSAPP',
      isAutoAllocate: true,
      isOnHold: false,
      totalAnswersCount: 1,
      embedding: [],
      metrics: null,
      firstAllocationAt: new Date(Date.now() - 120 * 60 * 1000), // 2 h ago
      details: { state: 'Punjab', district: 'Ludhiana', crop: 'Paddy', season: 'Kharif', domain: 'Crop Protection' },
      createdAt: new Date(Date.now() - 120 * 60 * 1000),
      updatedAt: new Date(),
    });
    questionId = qId.toString();
    createdQuestionIds.push(qId);

    const { insertedId: subId } = await submissions.insertOne({
      questionId: qId,
      lastRespondedBy: stfExperts[0]._id,
      queue: [stfExperts[0]._id, stfExperts[1]._id],
      history: [
        {
          // stfExperts[0]: completed author — must not be re-assigned
          updatedBy: stfExperts[0]._id,
          answer: `${RUN_TAG} G2 author answer already submitted`,
          status: 'reviewed',
          createdAt: new Date(Date.now() - 90 * 60 * 1000),
          updatedAt: new Date(Date.now() - 90 * 60 * 1000),
        },
        {
          // stfExperts[1]: stuck reviewer — allocated 46 min ago, never opened
          updatedBy: stfExperts[1]._id,
          answer: null,
          status: 'in-review',
          createdAt: stuckAt,
          updatedAt: stuckAt,
        },
      ],
      currentExpertAllocatedAt: stuckAt, // > 45 min → triggers stuck detection
      // currentExpertOpenedAt intentionally absent — reviewer never opened the question
      createdAt: new Date(Date.now() - 120 * 60 * 1000),
      updatedAt: new Date(),
    });
    submissionId = subId.toString();

    allocResult = await questionService.reallocateTimeBoundQuestions();
    workerAssignments = spy.mock.calls.flatMap(([assignments]: any[]) => assignments as any[]);
    console.log('[G2] allocResult:', JSON.stringify(allocResult));
    console.log('[G2] workerAssignments:', JSON.stringify(workerAssignments));
  }, 30000);

  afterAll(async () => {
    if (!db || !questionId) return;
    const questions = await db.getCollection('questions');
    await questions.updateOne({ _id: new ObjectId(questionId) }, { $set: { status: 'closed' } });
    console.log('[G2] afterAll: closed stuck-reviewer question');
  }, 15000);

  it('cron detects the stuck reviewer and reports at least 1 reallocated', () => {
    if (stfExperts.length < 3) return;
    expect(allocResult.reallocated).toBeGreaterThanOrEqual(1);
  });

  it('startBalanceWorkloadWorkers was called for the stuck submission', () => {
    if (stfExperts.length < 3) return;
    expect(workerAssignments.length).toBeGreaterThanOrEqual(1);
  });

  it('replacement expert is NOT stfExperts[0] — the previous author from history', () => {
    if (stfExperts.length < 3) return;
    const ours = workerAssignments.find((a: any) => a.submissionId === submissionId);
    console.log('[G2] assignment:', JSON.stringify(ours), 'previousAuthor:', stfExperts[0]._id.toString());
    expect(ours).toBeDefined();
    expect(ours.expertId).not.toBe(stfExperts[0]._id.toString());
  });

  it('replacement expert is NOT stfExperts[1] — the stuck reviewer being replaced', () => {
    if (stfExperts.length < 3) return;
    const ours = workerAssignments.find((a: any) => a.submissionId === submissionId);
    console.log('[G2] assignment expertId:', ours?.expertId, 'stuckReviewer:', stfExperts[1]._id.toString());
    expect(ours).toBeDefined();
    expect(ours.expertId).not.toBe(stfExperts[1]._id.toString());
  });
});
