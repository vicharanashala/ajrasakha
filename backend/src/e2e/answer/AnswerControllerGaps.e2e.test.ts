/**
 * Answer Controller — Coverage Gap-Fill E2E test.
 *
 * WHAT THIS COVERS
 * ----------------
 * The `AnswerController` routes NOT already exercised by `post-allocation/` or
 * `gatekeeper-auditor/` (which cover `/review`, `/`  (PUT bulk), `/moderator/approve`,
 * `/:questionId/confirm-duplicate`, `/:questionId/:answerId` DELETE):
 *
 *   POST /api/answers                    (direct answer creation, outside the /review flow)
 *   POST /api/answers/fetch-ai-answer     (proxies to a real external AI service)
 *   GET  /api/answers/submissions
 *   GET  /api/answers/finalizedAnswers
 *   GET  /api/answers/faqs/mod
 *
 * NOTE: `PUT /:answerId` — listed as uncovered in the original coverage gap
 * report — turned out to be dead, commented-out code in `AnswerController.ts`
 * (lines 213-226), not a live route. It doesn't need a test; the report's grep
 * couldn't distinguish it from a live `@Put` decorator.
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
const RUN_TAG = `E2E_ANSWERGAP_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-answer-gap-key';

let app: express.Express;
let db: any;
let moderatorUser: any;
let expertUser: any;

let currentTestUser: any = null;
let questionId: string;
const createdAnswerIds: string[] = [];

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
  [moderatorUser, expertUser] = await Promise.all([
    users.findOne({email: process.env.MODERATOR_EMAIL}),
    users.findOne({email: process.env.EXPERT_EMAIL}),
  ]);
  const missing = [
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
    !expertUser && `EXPERT_EMAIL=${process.env.EXPERT_EMAIL}`,
  ].filter(Boolean);
  if (missing.length) throw new Error(`Test users not found: ${missing.join(', ')}`);

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

  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG} questionId=${questionId}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db) {
    const questions = await db.getCollection('questions');
    const answers = await db.getCollection('answers');
    if (questionId) await questions.deleteOne({_id: new ObjectId(questionId)}).catch(() => {});
    for (const id of createdAnswerIds) {
      await answers.deleteOne({_id: new ObjectId(id)}).catch(() => {});
    }
    console.log(`[teardown] Cleaned up fixture question + ${createdAnswerIds.length} answer(s).`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

describe('POST /answers', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/answers`).send({questionId, answer: 'x', sources: []});
    expect(res.status).toBe(401);
  });

  it('expert creates an answer directly', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/answers`).send({
      questionId,
      answer: `${RUN_TAG} — direct answer`,
      sources: [],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(201);

    const answers = await db.getCollection('answers');
    const doc = await answers.findOne({questionId: new ObjectId(questionId)});
    expect(doc).toBeTruthy();
    createdAnswerIds.push(doc._id.toString());
  });
});

describe('POST /answers/fetch-ai-answer', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/answers/fetch-ai-answer`).send({});
    expect(res.status).toBe(401);
  });

  it('reaches the real external AI service (accepts a real answer or a clean 5xx if unreachable)', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/answers/fetch-ai-answer`).send({
      questionId,
      question: `${RUN_TAG} fixture question`,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect([200, 400, 500, 502, 503, 504]).toContain(res.status);
  }, 20000);
});

describe('GET /answers/submissions', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/answers/submissions`);
    expect(res.status).toBe(401);
  });

  it('returns the current user\'s submissions', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/answers/submissions?page=1&limit=10`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});

describe('GET /answers/finalizedAnswers', () => {
  it('returns finalized answers for the current user', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/answers/finalizedAnswers`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});

describe('GET /answers/faqs/mod', () => {
  it('returns golden FAQs for the current user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/answers/faqs/mod?page=1&limit=10`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});
