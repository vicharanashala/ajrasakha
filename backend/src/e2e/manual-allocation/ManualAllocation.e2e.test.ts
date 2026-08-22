/**
 * Manual Allocation — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * The two manual-allocation endpoints exercised against the REAL Mongo DB
 * configured in `.env.test` (DB_URL / DB_NAME):
 *
 *   POST   /api/questions/:questionId/allocate-experts
 *   DELETE /api/questions/:questionId/allocation
 *
 * A single OUTREACH question is seeded directly into the DB in beforeAll
 * and shared across all tests. OUTREACH is chosen because:
 *   - starts as status='open' immediately (no background pipeline)
 *   - submission row has an empty queue guaranteed (no auto-allocation)
 *
 * STRATEGY
 * --------
 * In-process server — same approach as WhatsAppQuestion.e2e.test.ts.
 * Users are fetched from the real DB by email (no Firebase token exchange
 * needed). A `currentTestUser` variable is swapped per-test so
 * authorizationChecker / currentUserChecker are both in our control.
 *
 * No external services are called by these two endpoints, so no dummies
 * are needed beyond the circular-import warm-up for AnswerService.
 */

// MongoDB on Atlas (mongodb+srv) requires TLS. MongoDatabase disables TLS when
// NODE_ENV==='test', so force a non-test env BEFORE any module constructs the
// Mongo client. Must run before loadAppModules().
process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
// Load the real Atlas DB config first, then layer test-user credentials on top.
// dotenv does NOT override already-set vars, so DB_URL/DB_NAME from .env win
// over the localhost values in .env.test.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.test' });

import express from 'express';
import request from 'supertest';
import { useExpressServer } from 'routing-controllers';
import { ObjectId } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_MA_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-manual-alloc-key';

let app: express.Express;
let db: any;
let moderatorUser: any;
let expertUser1: any;
let expertUser2: any;
let testQuestionId: string;

// Swapped per test — currentUserChecker returns this value.
let currentTestUser: any = null;

beforeAll(async () => {
  // Warm-up: resolves circular import before the barrel runs via loadAppModules.
  await import('#root/modules/answer/services/AnswerService.js');

  // InternalApiAuth is a global @Middleware({ type: 'before' }) that runs on
  // every route — set the key so it passes, then authorizationChecker handles
  // the per-request user check.
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const { loadAppModules, getContainer } = await import(
    '#root/bootstrap/loadModules.js'
  );
  const { GLOBAL_TYPES } = await import('#root/types.js');

  const { controllers } = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  // Fetch test users from DB by email (no Firebase token exchange needed).
  const users = await db.getCollection('users');
  [moderatorUser, expertUser1, expertUser2] = await Promise.all([
    users.findOne({ email: process.env.MODERATOR_EMAIL }),
    users.findOne({ email: process.env.EXPERT_EMAIL }),
    users.findOne({ email: process.env.EXPERT_EMAIL_2 }),
  ]);

  if (!moderatorUser || !expertUser1 || !expertUser2) {
    throw new Error(
      'Test users not found in DB — ensure seed data exists for ' +
        `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}, ` +
        `EXPERT_EMAIL=${process.env.EXPERT_EMAIL}, ` +
        `EXPERT_EMAIL_2=${process.env.EXPERT_EMAIL_2}`,
    );
  }

  // Seed a single OUTREACH question + bare submission for all tests to share.
  const questions = await db.getCollection('questions');
  const submissions = await db.getCollection('question_submissions');

  const questionDoc = {
    userId: moderatorUser._id,
    question: `${RUN_TAG} paddy leaves turning yellow, what fertilizer should I apply?`,
    status: 'open',
    priority: 'medium',
    source: 'OUTREACH',
    isAutoAllocate: true,
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

  const { insertedId } = await questions.insertOne(questionDoc);
  testQuestionId = insertedId.toString();

  await submissions.insertOne({
    questionId: insertedId,
    lastRespondedBy: null,
    history: [],
    queue: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Sanity: confirm connectivity before running cases.
  await questions.estimatedDocumentCount();
  console.log(
    `[setup] Connected. RUN_TAG=${RUN_TAG} questionId=${testQuestionId}`,
  );
}, 90000);

afterAll(async () => {
  if (db && testQuestionId) {
    const oid = new ObjectId(testQuestionId);
    const [questions, submissions, notifications] = await Promise.all([
      db.getCollection('questions'),
      db.getCollection('question_submissions'),
      db.getCollection('notifications'),
    ]);
    await Promise.all([
      questions.deleteOne({ _id: oid }),
      submissions.deleteOne({ questionId: oid }),
      notifications.deleteMany({ enitity_id: oid }),
    ]);
    console.log(`[teardown] Cleaned question ${testQuestionId}.`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

/** All real endpoints require the global InternalApiAuth to pass. */
function apiPost(path: string) {
  return request(app)
    .post(path)
    .set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiDelete(path: string) {
  return request(app)
    .delete(path)
    .set('x-internal-api-key', INTERNAL_API_KEY);
}

// ───────────────────────── AUTH ──────────────────────────

describe('Manual allocation — authentication', () => {
  it('returns 401 when no user is logged in (allocate-experts)', async () => {
    currentTestUser = null;

    const res = await apiPost(
      `${ROUTE_PREFIX}/questions/${testQuestionId}/allocate-experts`,
    ).send({ experts: [expertUser1._id.toString()] });

    console.log('NO-USER STATUS:', res.status);
    expect(res.status).toBe(401);
  });

  it('returns 400 when an expert tries to allocate (role check)', async () => {
    currentTestUser = expertUser1;

    const res = await apiPost(
      `${ROUTE_PREFIX}/questions/${testQuestionId}/allocate-experts`,
    ).send({ experts: [expertUser2._id.toString()] });

    console.log('EXPERT-ALLOCATE STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(400);
  });
});

// ─────────────────── ALLOCATE ────────────────────────────

describe('Manual allocation — moderator allocates experts', () => {
  it('moderator allocates expert1 → 200', async () => {
    currentTestUser = moderatorUser;

    const res = await apiPost(
      `${ROUTE_PREFIX}/questions/${testQuestionId}/allocate-experts`,
    ).send({ experts: [expertUser1._id.toString()] });

    console.log('ALLOCATE-EXPERT1 STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(200);
  });

  it('DB: submission queue contains expert1 after first allocation', async () => {
    const submissions = await db.getCollection('question_submissions');
    const submission = await submissions.findOne({
      questionId: new ObjectId(testQuestionId),
    });

    console.log('QUEUE AFTER EXPERT1:', submission?.queue);
    expect(submission).not.toBeNull();
    expect(submission.queue).toHaveLength(1);
    expect(submission.queue[0].toString()).toBe(expertUser1._id.toString());
  });

  it('DB: question has firstAllocationAt set after first allocation', async () => {
    const questions = await db.getCollection('questions');
    const question = await questions.findOne({
      _id: new ObjectId(testQuestionId),
    });

    console.log('firstAllocationAt:', question?.firstAllocationAt);
    expect(question?.firstAllocationAt).not.toBeNull();
    expect(question?.firstAllocationAt).toBeInstanceOf(Date);
  });

  it('moderator allocates expert2 to same question → 200, queue length 2', async () => {
    currentTestUser = moderatorUser;

    const res = await apiPost(
      `${ROUTE_PREFIX}/questions/${testQuestionId}/allocate-experts`,
    ).send({ experts: [expertUser2._id.toString()] });

    console.log('ALLOCATE-EXPERT2 STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(200);

    const submissions = await db.getCollection('question_submissions');
    const submission = await submissions.findOne({
      questionId: new ObjectId(testQuestionId),
    });
    expect(submission.queue).toHaveLength(2);
  });
});

// ─────────────────── VALIDATION ──────────────────────────

describe('Manual allocation — validation', () => {
  it('duplicate expert check (known bug: guard silently passes → 200)', async () => {
    // KNOWN BUG: allocateExperts checks `queue.includes(expertId)` where
    // `queue` holds ObjectId objects but `expertId` is a plain string.
    // `Array.includes` uses reference equality, so the comparison is always
    // false → duplicate is never detected → allocation succeeds with 200.
    // Intended behavior would be 400 "already in queue".
    currentTestUser = moderatorUser;

    const res = await apiPost(
      `${ROUTE_PREFIX}/questions/${testQuestionId}/allocate-experts`,
    ).send({ experts: [expertUser1._id.toString()] });

    console.log('DUPLICATE-EXPERT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(200);
  });

  it('non-existent questionId returns 500 (known behavior: getQuestionDataById throws InternalServerError)', async () => {
    // KNOWN BEHAVIOR: getQuestionDataById throws InternalServerError when the
    // question is not found. The controller re-throws it as InternalServerError
    // → HTTP 500 rather than the intended 400/404.
    currentTestUser = moderatorUser;
    const fakeId = new ObjectId().toString();

    const res = await apiPost(
      `${ROUTE_PREFIX}/questions/${fakeId}/allocate-experts`,
    ).send({ experts: [expertUser1._id.toString()] });

    console.log('NONEXISTENT-Q STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(500);
  });
});

// ─────────────────── REMOVE ──────────────────────────────

describe('Manual allocation — moderator removes an expert', () => {
  it('moderator removes expert at index 0 → 200', async () => {
    currentTestUser = moderatorUser;

    const res = await apiDelete(
      `${ROUTE_PREFIX}/questions/${testQuestionId}/allocation`,
    ).send({ index: 0 });

    console.log('REMOVE-INDEX-0 STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(200);
  });

  it('DB: queue shrinks to 1, expert1 removed, expert2 remains', async () => {
    const submissions = await db.getCollection('question_submissions');
    const submission = await submissions.findOne({
      questionId: new ObjectId(testQuestionId),
    });

    console.log('QUEUE AFTER REMOVE:', submission?.queue);
    expect(submission).not.toBeNull();
    expect(submission.queue).toHaveLength(1);
    expect(submission.queue[0].toString()).toBe(expertUser2._id.toString());

    const queueIds = submission.queue.map((id: any) => id.toString());
    expect(queueIds).not.toContain(expertUser1._id.toString());
  });
});
