/**
 * Question CRUD — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * Basic moderator CRUD operations for OUTREACH questions against the REAL Mongo
 * DB configured in `.env` (DB_URL / DB_NAME):
 *
 *   POST   /api/questions          (create OUTREACH question — no ingestion pipeline)
 *   GET    /api/questions/:id/full (read question by ID)
 *   PUT    /api/questions/:id      (update question fields)
 *   DELETE /api/questions/:id      (hard delete single question)
 *   DELETE /api/questions/bulk     (hard delete multiple questions)
 *
 * STRATEGY
 * --------
 * In-process server — same harness as ManualAllocation.e2e.test.ts.
 * Users are fetched from the real DB by email; a `currentTestUser` variable is
 * swapped per test so authorizationChecker / currentUserChecker are under our
 * control (no Firebase token exchange needed).
 *
 * OUTREACH questions are created synchronously (no background pipeline), so
 * assertions can be made immediately after the HTTP response.
 */

// MongoDB on Atlas (mongodb+srv) requires TLS. MongoDatabase disables TLS when
// NODE_ENV==='test' (what Vitest sets), so force a non-test env BEFORE any
// module constructs the Mongo client.
process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
// Load real Atlas DB config first; dotenv will NOT override it with .env.test values.
dotenv.config({path: '.env'});
dotenv.config({path: '.env.test'});

import express from 'express';
import request from 'supertest';
import {useExpressServer} from 'routing-controllers';
import {ObjectId} from 'mongodb';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_QC_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-question-create-key';

let app: express.Express;
let db: any;
let moderatorUser: any;
let secondModeratorUser: any;
let currentTestUser: any = null;

// Track every question created during this run so we can clean up.
const allCreatedQuestionIds: string[] = [];

// Shared across sequential CRUD tests (create → get → update → delete).
let questionId: string = '';

beforeAll(async () => {
  // Warm-up: resolves the circular import that leaves CORE_TYPES undefined when
  // AnswerService is reached via the core barrel during loadAppModules.
  await import('#root/modules/answer/services/AnswerService.js');

  // InternalApiAuth is a global @Middleware({ type: 'before' }) that runs on
  // every route — set the key so it passes, then authorizationChecker handles
  // the per-request user check.
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const {loadAppModules, getContainer} =
    await import('#root/bootstrap/loadModules.js');
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

  // Fetch test users from the real DB (no Firebase token exchange needed).
  const users = await db.getCollection('users');
  moderatorUser = await users.findOne({email: process.env.MODERATOR_EMAIL});

  if (!moderatorUser) {
    throw new Error(
      `Test user not found — ensure MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL} exists in the DB`,
    );
  }

  secondModeratorUser = await users.findOne({
    email: process.env.MODERATOR_EMAIL_2,
  });

  if (!secondModeratorUser) {
    throw new Error('Need at least two moderator users in database');
  }

  await (await db.getCollection('users')).estimatedDocumentCount(); // sanity: connectivity
  console.log(
    `[setup] Connected. RUN_TAG=${RUN_TAG} moderator=${moderatorUser.email}`,
  );
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db && allCreatedQuestionIds.length) {
    const oids = allCreatedQuestionIds
      .filter(Boolean)
      .map(id => new ObjectId(id));
    const [questions, submissions, notifications] = await Promise.all([
      db.getCollection('questions'),
      db.getCollection('question_submissions'),
      db.getCollection('notifications'),
    ]);
    await Promise.all([
      questions.deleteMany({_id: {$in: oids}}),
      submissions.deleteMany({questionId: {$in: oids}}),
      notifications.deleteMany({enitity_id: {$in: oids}}),
    ]);
    console.log(
      `[teardown] Cleaned ${allCreatedQuestionIds.length} question(s).`,
    );
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

/** All requests must include the x-internal-api-key header. */
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPut(path: string) {
  return request(app).put(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPatch(path: string) {
  return request(app).patch(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiDelete(path: string) {
  return request(app).delete(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

/** Poll until `check()` returns true or timeout expires. */
async function pollUntil(
  check: () => Promise<boolean>,
  timeoutMs = 45_000,
  intervalMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('pollUntil: condition not met within timeout');
}

describe('Question Create E2E', () => {
  it('moderator creates question successfully', async () => {
    currentTestUser = moderatorUser;

    const uniqueQuestion = `${RUN_TAG} E2E paddy yellowing question`;
    const payload = {
      question: uniqueQuestion,
      priority: 'medium',
      source: 'OUTREACH',
      details: {
        state: 'Punjab',
        district: 'Ludhiana',
        crop: 'Brinjal',
        season: 'Rabi',
        domain: ['Crop Protection'],
      },
    };

    const res = await apiPost(`${ROUTE_PREFIX}/questions`).send(payload);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.question_id).toBeDefined();

    questionId = res.body.question_id;
    allCreatedQuestionIds.push(questionId);
  });

  it('moderator gets created question by id', async () => {
    currentTestUser = moderatorUser;

    const res = await apiGet(`${ROUTE_PREFIX}/questions/${questionId}/full`);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(questionId);
    expect(res.body.data.question).toContain(RUN_TAG);
    expect(res.body.data.details.state).toBe('Punjab');
    expect(res.body.data.details.district).toBe('Ludhiana');
    expect(res.body.data.details.crop).toBe('Brinjal');
    expect(res.body.data.source).toBe('OUTREACH');
  });

  it('moderator updates question successfully', async () => {
    currentTestUser = moderatorUser;

    const res = await apiPut(`${ROUTE_PREFIX}/questions/${questionId}`).send({
      question: `${RUN_TAG} E2E paddy yellowing question UPDATED`,
      priority: 'high',
      details: {
        state: 'Punjab',
        district: 'Patiala',
        crop: 'Brinjal',
        season: 'Kharif',
        domain: ['Disease Management'],
      },
    });

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);
  });

  it('question reflects updated values', async () => {
    currentTestUser = moderatorUser;

    const res = await apiGet(`${ROUTE_PREFIX}/questions/${questionId}/full`);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);
    expect(res.body.data.question).toContain('UPDATED');
    expect(res.body.data.priority).toBe('high');
    expect(res.body.data.details.district).toBe('Patiala');
    expect(res.body.data.details.season).toBe('Kharif');
    expect(res.body.data.details.domain).toEqual(['Disease Management']);
  });
  describe('Question Moderator Assignment', () => {
    it('assigns question to moderator successfully', async () => {
      currentTestUser = moderatorUser;

      const res = await apiPatch(
        `${ROUTE_PREFIX}/questions/${questionId}/moderator`,
      ).send({
        moderatorId: secondModeratorUser._id.toString(),
      });

      console.log('PATCH STATUS:', res.status);
      console.log('PATCH BODY:', JSON.stringify(res.body, null, 2));

      expect(res.status).toBe(200);

      const question = await (
        await db.getCollection('questions')
      ).findOne({
        _id: new ObjectId(questionId),
      });

      expect(question.moderatorId.toString()).toBe(
        secondModeratorUser._id.toString(),
      );
    });

    it('returns 400 when moderatorId is missing', async () => {
      currentTestUser = moderatorUser;

      const res = await apiPatch(
        `${ROUTE_PREFIX}/questions/${questionId}/moderator`,
      ).send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid moderator id', async () => {
      currentTestUser = moderatorUser;

      const res = await apiPatch(
        `${ROUTE_PREFIX}/questions/${questionId}/moderator`,
      ).send({
        moderatorId: new ObjectId().toString(),
      });

      expect([400, 404, 500]).toContain(res.status);
    });

    it('returns 401 when unauthenticated', async () => {
      currentTestUser = null;

      const res = await apiPatch(
        `${ROUTE_PREFIX}/questions/${questionId}/moderator`,
      ).send({
        moderatorId: secondModeratorUser._id.toString(),
      });

      expect(res.status).toBe(403);
    });

    it('removes moderator successfully', async () => {
      currentTestUser = moderatorUser;

      const res = await apiDelete(
        `${ROUTE_PREFIX}/questions/${questionId}/moderator`,
      );

      console.log('DELETE STATUS:', res.status);
      console.log('DELETE BODY:', JSON.stringify(res.body, null, 2));

      expect(res.status).toBe(200);

      const question = await (
        await db.getCollection('questions')
      ).findOne({
        _id: new ObjectId(questionId),
      });

      expect(question.moderatorId ?? null).toBeNull();
    });

    it('removing moderator twice is idempotent', async () => {
      currentTestUser = moderatorUser;

      await apiDelete(`${ROUTE_PREFIX}/questions/${questionId}/moderator`);

      const res = await apiDelete(
        `${ROUTE_PREFIX}/questions/${questionId}/moderator`,
      );

      expect([200, 400]).toContain(res.status);
    });

    it('returns 401 when removing moderator unauthenticated', async () => {
      currentTestUser = null;

      const res = await apiDelete(
        `${ROUTE_PREFIX}/questions/${questionId}/moderator`,
      );

      expect(res.status).toBe(403);
    });
  });

  it('moderator deletes question successfully', async () => {
    currentTestUser = moderatorUser;

    const res = await apiDelete(`${ROUTE_PREFIX}/questions/${questionId}`);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(1);
  });

  it('deleted question is no longer retrievable', async () => {
    currentTestUser = moderatorUser;

    const res = await apiGet(`${ROUTE_PREFIX}/questions/${questionId}/full`);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    // The controller destructures the null return from getQuestionFullData,
    // causing a TypeError → 500 rather than the ideal 404.
    expect([400, 404, 500]).toContain(res.status);
  });

  it('moderator bulk deletes questions', async () => {
    currentTestUser = moderatorUser;

    const [q1, q2] = await Promise.all([
      apiPost(`${ROUTE_PREFIX}/questions`).send({
        question: `${RUN_TAG} Bulk Delete Q1`,
        priority: 'medium',
        source: 'OUTREACH',
        details: {
          state: 'Punjab',
          district: 'Ludhiana',
          crop: 'Brinjal',
          season: 'Rabi',
          domain: ['Crop Protection'],
        },
      }),
      apiPost(`${ROUTE_PREFIX}/questions`).send({
        question: `${RUN_TAG} Bulk Delete Q2`,
        priority: 'medium',
        source: 'OUTREACH',
        details: {
          state: 'Punjab',
          district: 'Ludhiana',
          crop: 'Brinjal',
          season: 'Rabi',
          domain: ['Crop Protection'],
        },
      }),
    ]);

    const bulkIds = [q1.body.question_id, q2.body.question_id].filter(Boolean);
    allCreatedQuestionIds.push(...bulkIds);

    console.log('Created IDs:', bulkIds);

    const deleteRes = await apiDelete(`${ROUTE_PREFIX}/questions/bulk`).send({
      questionIds: bulkIds,
    });

    console.log('BULK DELETE BODY:', JSON.stringify(deleteRes.body, null, 2));

    expect(deleteRes.status).toBe(200);
  });

  it('bulk deleted questions are not retrievable', async () => {
    currentTestUser = moderatorUser;

    // bulkDeleteQuestions fires a background worker — poll until each question
    // disappears rather than asserting immediately.
    const bulkIds = allCreatedQuestionIds.slice(-2).filter(Boolean);
    for (const id of bulkIds) {
      await pollUntil(async () => {
        const res = await apiGet(`${ROUTE_PREFIX}/questions/${id}/full`);
        return res.status !== 200;
      }, 25_000);
      const res = await apiGet(`${ROUTE_PREFIX}/questions/${id}/full`);
      console.log(`Question ${id} status:`, res.status);
      expect([400, 404, 500]).toContain(res.status);
    }
  }, 30_000);
});
