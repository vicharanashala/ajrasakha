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

const as = (user: any) => { currentTestUser = user; };

function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

/** Call POST /questions/allocated as the current user. review_level='all' returns all slots. */
function getAllocated() {
  return apiPost(`${ROUTE_PREFIX}/questions/allocated`)
    .query({ review_level: 'all' })
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
// review_level_number: historyCount=2 → 2 - 1 = 1 → 'Level 1'
// ════════════════════════════════════════════════════════════════════════════

describe('Reviewer queue — reviewer slot visibility', () => {
  let questionId: string;

  beforeAll(async () => {
    // expertUser1 has submitted an answer (status='reviewed').
    // expertUser2 is the assigned reviewer (status='in-review', answer absent).
    // historyCount = 2 → review_level_number = 'Level 1'
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

  it('review_level_number is "Level 1" for the reviewer slot (historyCount = 2)', async () => {
    as(expertUser2);
    const res = await getAllocated();
    const found = res.body.find((q: any) => q.id === questionId);
    console.log('[G2-2] review_level_number:', found?.review_level_number);
    expect(found?.review_level_number).toBe('Level 1');
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
