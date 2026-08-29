/**
 * Reviewer Queue — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * The read path that surfaces allocated questions in the expert's dashboard:
 *
 *   POST /api/questions/allocated     (expert's work queue — what they see)
 *
 * WHY THIS SUITE EXISTS
 * ---------------------
 * Allocation (auto or manual) writes the `queue` field in `question_submissions`
 * and sends an `answer_creation` notification. But if the read endpoint is broken
 * — wrong filter, premature status change, wrong user check — the expert receives
 * a notification yet sees nothing in their dashboard. This suite explicitly pins
 * the connection between "allocated" state and "visible to the right expert."
 *
 * VISIBILITY RULES (getAllocatedQuestions / QuestionRepository)
 * -------------------------------------------------------------
 * A question appears in an expert's dashboard iff:
 *   (A) historyCount = 0 AND queue[0] === userId         (authoring slot)
 *   OR
 *   (B) lastHistory.updatedBy === userId
 *       AND lastHistory.status = 'in-review'
 *       AND lastHistory.answer is absent/null             (reviewer slot)
 *
 *   PLUS question.status NOT IN ['closed', 'in-review']  (excluded statuses)
 *   PLUS review_level filter ('all', 'Author', 'Level N')
 *
 * STRATEGY
 * --------
 * Same in-process harness as the other e2e suites. Questions and submissions are
 * seeded directly into MongoDB (no API round-trip) so state is precisely
 * controlled. One test (T4 — notification-visibility consistency) also seeds a
 * notification document to verify that a notified expert can see the question.
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
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_RQ_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-reviewer-queue-key';

let app: express.Express;
let db: any;
let moderatorUser: any;
let expertUser1: any;
let expertUser2: any;
let currentTestUser: any = null;
const createdQuestionIds: ObjectId[] = [];

beforeAll(async () => {
  await import('#root/modules/answer/services/AnswerService.js');
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const { loadAppModules, getContainer } = await import(
    '#root/bootstrap/loadModules.js'
  );
  const { GLOBAL_TYPES } = await import('#root/types.js');
  const { CORE_TYPES } = await import('#root/modules/core/types.js');

  const { controllers } = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);

  const dummyAi = {
    getEmbedding: async () => ({ embedding: [] }),
    fetchWhatsAppMessage: async () => ({}),
    searchGdb: async () => ({ exact_match: null, selected_match: null }),
  };
  try {
    container.rebindSync(CORE_TYPES.AIService).toConstantValue(dummyAi);
  } catch {}

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  const users = await db.getCollection('users');
  [moderatorUser, expertUser1, expertUser2] = await Promise.all([
    users.findOne({ email: process.env.MODERATOR_EMAIL }),
    users.findOne({ email: process.env.EXPERT_EMAIL }),
    users.findOne({ email: process.env.EXPERT_EMAIL_2 }),
  ]);

  const missing = [
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
    !expertUser1 && `EXPERT_EMAIL=${process.env.EXPERT_EMAIL}`,
    !expertUser2 && `EXPERT_EMAIL_2=${process.env.EXPERT_EMAIL_2}`,
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Test users not found in DB: ${missing.join(', ')}`);
  }

  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG}`);
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
  if (db?.disconnect) await db.disconnect();
}, 60000);

// ─────────────────────── helpers ────────────────────────────────────────────

const as = (user: any) => { currentTestUser = user; };

function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiDelete(path: string) {
  return request(app).delete(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

/** Call POST /questions/allocated as the current user. review_level='all' returns all slots. */
function getAllocated() {
  // Use a high limit so seeded questions aren't pushed out by existing DB data.
  // The priority ordering change (commit 283c9c40) gives OUTREACH medium questions
  // priorityOrder=7, behind AJRASAKHA/WHATSAPP, so they land later in the sort.
  return apiPost(`${ROUTE_PREFIX}/questions/allocated`)
    .query({ review_level: 'all', limit: 1000 })
    .send({});
}

/** Seed a question + submission directly. Returns the question id string. */
async function seedQuestion(opts: {
  queue: ObjectId[];
  history?: any[];
  status?: string;
  source?: string;
}): Promise<string> {
  const questions = await db.getCollection('questions');
  const submissions = await db.getCollection('question_submissions');

  const { insertedId } = await questions.insertOne({
    userId: moderatorUser._id,
    question: `${RUN_TAG} paddy yellowing — reviewer queue test`,
    status: opts.status ?? 'open',
    priority: 'medium',
    source: opts.source ?? 'OUTREACH',
    isAutoAllocate: false,
    totalAnswersCount: 0,
    embedding: [],
    metrics: null,
    firstAllocationAt: new Date(),
    details: {
      state: 'Punjab',
      district: 'Ludhiana',
      crop: 'Paddy',
      season: 'Kharif',
      domain: 'Crop Protection',
      normalised_crop: 'Paddy',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdQuestionIds.push(insertedId);

  await submissions.insertOne({
    questionId: insertedId,
    lastRespondedBy: null,
    history: opts.history ?? [],
    queue: opts.queue,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return insertedId.toString();
}

// ════════════════════════════════════════════════════════════════════════════
// Group 1 — Author slot: question visible to queue[0] before any submission
//
// Visibility rule (Case 2): historyCount = 0 AND firstInQueue = userId.
// review_level_number = 'Author' (historyCount <= 1).
// ════════════════════════════════════════════════════════════════════════════

describe('Reviewer queue — author slot visibility', () => {
  let questionId: string;

  beforeAll(async () => {
    questionId = await seedQuestion({ queue: [expertUser1._id] });
  });

  it('question appears in POST /allocated for the allocated expert (queue[0], no history)', async () => {
    as(expertUser1);
    const res = await getAllocated();
    console.log('[G1-1] status:', res.status, 'count:', res.body?.length);
    expect(res.status).toBe(200);
    const found = res.body.find((q: any) => q.id === questionId);
    expect(found).toBeDefined();
  });

  it('review_level_number is "Author" for the authoring slot (historyCount = 0)', async () => {
    as(expertUser1);
    const res = await getAllocated();
    const found = res.body.find((q: any) => q.id === questionId);
    console.log('[G1-2] review_level_number:', found?.review_level_number);
    expect(found?.review_level_number).toBe('Author');
  });

  it('answer_creation notification entity_id matches question visible in POST /allocated (notification-visibility consistency)', async () => {
    // Seed a notification as allocation would create.
    const notifications = await db.getCollection('notifications');
    await notifications.insertOne({
      enitity_id: new ObjectId(questionId),
      userId: expertUser1._id,
      type: 'answer_creation',
      message: `${RUN_TAG} you have a new question`,
      isRead: false,
      createdAt: new Date(),
    });

    // Expert retrieves their queue.
    as(expertUser1);
    const res = await getAllocated();
    const found = res.body.find((q: any) => q.id === questionId);

    console.log('[G1-3] notification seeded, question visible:', !!found);
    expect(found).toBeDefined();

    // The notification's entity_id must resolve to a question in the allocated list —
    // this is the consistency check: "notification appears AND dashboard shows it."
    const notif = await notifications.findOne({
      enitity_id: new ObjectId(questionId),
      userId: expertUser1._id,
      type: 'answer_creation',
    });
    expect(notif).not.toBeNull();
    expect(notif.enitity_id.toString()).toBe(found.id);
  });

  it('a closed question with the same expert in queue is NOT returned', async () => {
    const closedId = await seedQuestion({
      queue: [expertUser1._id],
      status: 'closed',
    });
    as(expertUser1);
    const res = await getAllocated();
    const found = res.body.find((q: any) => q.id === closedId);
    console.log('[G1-4] closed question in result:', !!found);
    expect(found).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 2 — Reviewer slot: reviewer sees question; completed author does not
//
// Visibility rule (Case 1):
//   lastHistory.updatedBy = userId
//   AND lastHistory.status = 'in-review'
//   AND lastHistory.answer is absent / null
//
// review_level_number: historyCount=2 → 2 - 1 = 1 (number, not the string 'Level 1')
// ════════════════════════════════════════════════════════════════════════════

describe('Reviewer queue — reviewer slot visibility', () => {
  let questionId: string;

  beforeAll(async () => {
    // expertUser1 has submitted an answer (status='reviewed').
    // expertUser2 is the assigned reviewer (status='in-review', answer absent).
    // historyCount = 2 → review_level_number = 1
    questionId = await seedQuestion({
      queue: [expertUser1._id, expertUser2._id],
      history: [
        {
          updatedBy: expertUser1._id,
          answer: `${RUN_TAG} author answer for reviewer slot test`,
          status: 'reviewed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          updatedBy: expertUser2._id,
          answer: null,
          status: 'in-review',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
  });

  it('reviewer (expertUser2) sees the question in POST /allocated', async () => {
    as(expertUser2);
    const res = await getAllocated();
    console.log('[G2-1] reviewer allocated count:', res.body?.length);
    expect(res.status).toBe(200);
    const found = res.body.find((q: any) => q.id === questionId);
    expect(found).toBeDefined();
  });

  it('review_level_number is 1 for the reviewer slot (historyCount = 2)', async () => {
    as(expertUser2);
    const res = await getAllocated();
    const found = res.body.find((q: any) => q.id === questionId);
    console.log('[G2-2] review_level_number:', found?.review_level_number);
    // Repository returns historyCount - 1 (number), not the string 'Level 1'.
    expect(found?.review_level_number).toBe(1);
  });

  it('completed author (expertUser1) does NOT see the question after submitting', async () => {
    // expertUser1 is no longer the last in-review entry — they have already
    // submitted. Visibility rule Case 1 does not match (their lastHistory.status
    // is 'reviewed', not 'in-review'). Rule Case 2 does not match either
    // (historyCount ≠ 0). So they must be invisible to the author now.
    as(expertUser1);
    const res = await getAllocated();
    const found = res.body.find((q: any) => q.id === questionId);
    console.log('[G2-3] author sees question after submitting:', !!found);
    expect(found).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 3 — Status exclusion and wrong-user guard
//
// getAllocatedQuestions filters: status NOT IN ['closed', 'in-review'].
// 'in-review' means 3 approvals done and the answer is pending with moderator
// — experts have no more work to do on it, so it must disappear from their queue.
// ════════════════════════════════════════════════════════════════════════════

describe('Reviewer queue — status exclusion and wrong-user guard', () => {
  it('question with status="in-review" (awaiting moderator) is NOT in POST /allocated for any expert', async () => {
    // This is the regression guard for the production symptom:
    // "question disappears from expert dashboard after reaching moderator threshold."
    // If status was prematurely set to 'in-review' (e.g. after only 2 approvals),
    // the question would vanish from all experts' queues — a false disappearance.
    // Conversely, a correctly set 'in-review' question must also be excluded —
    // experts have finished their work on it and should not see it.
    const qId = await seedQuestion({
      queue: [expertUser1._id],
      status: 'in-review',
      history: [
        {
          updatedBy: expertUser1._id,
          answer: `${RUN_TAG} approved answer pending moderator`,
          status: 'reviewed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    as(expertUser1);
    const res = await getAllocated();
    const found = res.body.find((q: any) => q.id === qId);
    console.log('[G3-1] in-review question visible to expert:', !!found);
    expect(found).toBeUndefined();
  });

  it('expert NOT in queue cannot see the question in POST /allocated', async () => {
    // expertUser2 is not in the queue at all — they must never see this question.
    const qId = await seedQuestion({
      queue: [expertUser1._id],
      history: [],
    });

    as(expertUser2);
    const res = await getAllocated();
    const found = res.body.find((q: any) => q.id === qId);
    console.log('[G3-2] non-queue expert sees question:', !!found);
    expect(found).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 4 — STF expert sees their allocated WHATSAPP question in POST /allocated
//           (Issues #1 and #7)
//
// Production report: "STFs not receiving author level questions even when they
// are in queue" / "Despite getting a notification, question not appearing in
// the agri expert's dashboard."
//
// The ReviewerQueue suite already covers generic expert visibility (G1–G3).
// This group specifically tests time-bound (WHATSAPP/AJRASAKHA) questions
// allocated to an expert with special_task_force=true — the user population
// actually affected in production.
//
// Seeds a WHATSAPP question with an STF expert at queue[0] (no history) and
// verifies the STF expert can see it in POST /allocated. Self-skips if no
// STF expert exists in the DB.
// ════════════════════════════════════════════════════════════════════════════

describe('Reviewer queue — STF expert sees their allocated WHATSAPP question (Issues #1, #7)', () => {
  let stfExpert: any;
  let questionId: string;

  beforeAll(async () => {
    const users = await db.getCollection('users');
    stfExpert = await users.findOne({
      role: 'expert',
      isBlocked: false,
      special_task_force: true,
    });
    if (!stfExpert) {
      console.warn('[G4] No STF expert found in DB — group will self-skip.');
      return;
    }

    questionId = await seedQuestion({
      queue: [stfExpert._id],
      source: 'WHATSAPP',
      // history=[] → authoring slot; STF expert must see this at author level
    });
    console.log(`[G4] STF expert: ${stfExpert.email} — questionId: ${questionId}`);
  });

  it('STF expert sees their WHATSAPP question in POST /allocated (author slot, no history)', async () => {
    if (!stfExpert) return;
    as(stfExpert);
    const res = await getAllocated();
    console.log('[G4-1] status:', res.status, 'count:', res.body?.length);
    expect(res.status).toBe(200);
    const found = res.body.find((q: any) => q.id === questionId);
    expect(found).toBeDefined();
  });

  it('review_level_number is "Author" for the STF expert\'s authoring slot', async () => {
    if (!stfExpert) return;
    as(stfExpert);
    const res = await getAllocated();
    const found = res.body.find((q: any) => q.id === questionId);
    console.log('[G4-2] review_level_number:', found?.review_level_number);
    expect(found?.review_level_number).toBe('Author');
  });

  it('answer_creation notification for STF expert resolves to a question visible in POST /allocated (notification-visibility consistency)', async () => {
    if (!stfExpert) return;
    // Seed an answer_creation notification as the allocation path would create.
    const notifications = await db.getCollection('notifications');
    await notifications.insertOne({
      enitity_id: new ObjectId(questionId),
      userId: stfExpert._id,
      type: 'answer_creation',
      message: `${RUN_TAG} G4 STF expert has a new WhatsApp question`,
      isRead: false,
      createdAt: new Date(),
    });

    as(stfExpert);
    const res = await getAllocated();
    const found = res.body.find((q: any) => q.id === questionId);
    console.log('[G4-3] STF expert sees question after notification seeded:', !!found);
    expect(found).toBeDefined();

    // The notification entity_id must match the question in /allocated —
    // confirms "notification received" AND "question visible" are consistent.
    const notif = await notifications.findOne({
      enitity_id: new ObjectId(questionId),
      userId: stfExpert._id,
      type: 'answer_creation',
    });
    expect(notif).not.toBeNull();
    expect(notif.enitity_id.toString()).toBe(found.id);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 5 — Author-slot question appears before reviewer-slot question in
//            POST /allocated for the same STF expert (Issue #2)
//
// Production report: "STFs are getting review level questions when author level
// questions are available."
//
// When an STF expert has both:
//   (A) an author-slot question (queue[0], no history) — highest priority work
//   (B) a reviewer-slot question (lastHistory.in-review, no answer)
//
// the /allocated response must list (A) before (B) so the expert tackles author
// work first. The endpoint sorts by (priorityOrder, createdAt ASC); seeding (A)
// with an older createdAt makes both orderings agree.
//
// The FAILING variant (documenting the bug): if (A) is NEWER than (B), the
// current sort-by-createdAt-only behaviour would place (B) first — wrong. A
// slot-type sort would still place (A) first — correct. The test pins the
// EXPECTED behaviour; if it fails, the display bug is confirmed.
//
// Self-skips if no STF expert exists in the DB.
// ════════════════════════════════════════════════════════════════════════════

describe('Reviewer queue — author-slot question appears before reviewer-slot question for STF expert (Issue #2)', () => {
  let stfExpert: any;
  let authorQuestionId: string;
  let reviewerQuestionId: string;

  beforeAll(async () => {
    const users = await db.getCollection('users');
    stfExpert = await users.findOne({
      role: 'expert',
      isBlocked: false,
      special_task_force: true,
    });
    if (!stfExpert) {
      console.warn('[G5] No STF expert found in DB — group will self-skip.');
      return;
    }

    // Question A — author slot (queue[0], no history). Created NEWER (now)
    // so that if ordering is purely by createdAt, B (older) would appear first.
    // Correct behaviour: A (author) must still appear before B (reviewer).
    const authorDate = new Date(); // newer
    authorQuestionId = await seedQuestion({
      queue: [stfExpert._id],
      source: 'WHATSAPP',
      // history=[] — author slot
    });
    // Override the createdAt to "now" by re-seeding with explicit date.
    // (seedQuestion always uses new Date() internally; override via direct update.)
    const questionsCol = await db.getCollection('questions');
    await questionsCol.updateOne(
      { _id: new ObjectId(authorQuestionId) },
      { $set: { createdAt: authorDate } },
    );

    // Question B — reviewer slot. Created OLDER (2 min ago) so createdAt-only
    // sort would place it first.  STF expert is the last in-review reviewer.
    const reviewerDate = new Date(Date.now() - 120_000); // older
    reviewerQuestionId = await seedQuestion({
      queue: [expertUser1._id, stfExpert._id],
      source: 'WHATSAPP',
      history: [
        {
          updatedBy: expertUser1._id,
          answer: `${RUN_TAG} G5 author answer`,
          status: 'reviewed',
          createdAt: reviewerDate,
          updatedAt: reviewerDate,
        },
        {
          updatedBy: stfExpert._id,
          answer: null,
          status: 'in-review',
          createdAt: reviewerDate,
          updatedAt: reviewerDate,
        },
      ],
    });
    await questionsCol.updateOne(
      { _id: new ObjectId(reviewerQuestionId) },
      { $set: { createdAt: reviewerDate } },
    );

    console.log(`[G5] STF expert: ${stfExpert.email}`);
    console.log(`[G5] authorQuestion: ${authorQuestionId} (newer), reviewerQuestion: ${reviewerQuestionId} (older)`);
  });

  it('STF expert can see both the author-slot and the reviewer-slot question in POST /allocated', async () => {
    if (!stfExpert) return;
    as(stfExpert);
    const res = await getAllocated();
    console.log('[G5-1] /allocated count:', res.body?.length);
    expect(res.status).toBe(200);
    const foundAuthor = res.body.find((q: any) => q.id === authorQuestionId);
    const foundReviewer = res.body.find((q: any) => q.id === reviewerQuestionId);
    console.log('[G5-1] author visible:', !!foundAuthor, 'reviewer visible:', !!foundReviewer);
    expect(foundAuthor).toBeDefined();
    expect(foundReviewer).toBeDefined();
  });

  it('author-slot question appears before reviewer-slot question in the /allocated response', async () => {
    if (!stfExpert) return;
    as(stfExpert);
    const res = await getAllocated();
    const authorIdx = res.body.findIndex((q: any) => q.id === authorQuestionId);
    const reviewerIdx = res.body.findIndex((q: any) => q.id === reviewerQuestionId);
    console.log(
      `[G5-2] authorIdx=${authorIdx} reviewerIdx=${reviewerIdx} — ` +
      `author before reviewer: ${authorIdx < reviewerIdx}`,
    );
    // The author-slot question must appear before the reviewer-slot question.
    // If this test fails, the /allocated sort is not accounting for slot type and
    // STF experts will see reviewer work before their pending author work (Bug #2).
    expect(authorIdx).toBeGreaterThanOrEqual(0);
    expect(reviewerIdx).toBeGreaterThanOrEqual(0);
    expect(authorIdx).toBeLessThan(reviewerIdx);
  });
});
