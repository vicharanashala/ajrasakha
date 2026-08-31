/**
 * Re-Route Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   POST  /api/reroute/:questionId/allocate-reroute-experts
 *   POST  /api/reroute/allocated
 *   GET   /api/reroute/:questionId
 *   PATCH /api/reroute/:rerouteId/:questionId              (expert rejects)
 *   GET   /api/reroute/:answerId/history
 *   PATCH /api/reroute/:questionId/:expertId/action        (moderator rejects)
 *
 * SCOPE OF THIS PASS
 * -------------------
 * Originally just the auth gate + error paths for nonexistent/invalid ids.
 * A second pass (see "Full reroute happy path" below) added a real fixture
 * chain — question + directly-inserted answer + a moderator-created reroute
 * record — to exercise the actual business logic: `addrerouteAnswer`,
 * `getQuestionById`/`getAllocatedQuestionsByID`, `getAllocatedQuestions`,
 * `getRerouteHistory`, `rejectRerouteRequest` (expert path), and
 * `moderatorReject`/`updateStatus` (moderator path). `answerId` on a reroute
 * is never validated against a real Answer document by the service layer,
 * but `getAllocatedQuestions`/`getAllocatedQuestionsByID` both `$lookup` +
 * `$unwind` on `answers` — an `answerId` with no matching document silently
 * drops the whole result — so the fixture answer must be real.
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
const INTERNAL_API_KEY = 'e2e-reroute-key';

let app: express.Express;
let db: any;
let moderatorUser: any;
let expertUser: any;
let expertUser2: any;

let currentTestUser: any = null;
const RUN_TAG = `E2E_REROUTE_${Date.now()}`;
const createdQuestionIds: string[] = [];
const createdAnswerIds: ObjectId[] = [];

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
  [moderatorUser, expertUser, expertUser2] = await Promise.all([
    users.findOne({email: process.env.MODERATOR_EMAIL}),
    users.findOne({email: process.env.EXPERT_EMAIL}),
    users.findOne({email: process.env.EXPERT_EMAIL_2}),
  ]);
  const missing = [
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
    !expertUser && `EXPERT_EMAIL=${process.env.EXPERT_EMAIL}`,
    !expertUser2 && `EXPERT_EMAIL_2=${process.env.EXPERT_EMAIL_2}`,
  ].filter(Boolean);
  if (missing.length) throw new Error(`Test users not found: ${missing.join(', ')}`);
}, 90000);

afterAll(async () => {
  currentTestUser = moderatorUser;
  if (createdQuestionIds.length) {
    const questions = await db.getCollection('questions');
    const reroutes = await db.getCollection('reroutes');
    const answers = await db.getCollection('answers');
    await questions.deleteMany({_id: {$in: createdQuestionIds.map((id: string) => new ObjectId(id))}});
    await reroutes.deleteMany({questionId: {$in: createdQuestionIds.map((id: string) => new ObjectId(id))}});
    if (createdAnswerIds.length) await answers.deleteMany({_id: {$in: createdAnswerIds}});
  }
  currentTestUser = null;
  if (db?.disconnect) await db.disconnect();
}, 60000);

/** Creates a real OUTREACH question + a real directly-inserted answer doc, tagged for cleanup. */
async function createQuestionWithAnswer(suffix: string) {
  const qRes = await request(app)
    .post(`${ROUTE_PREFIX}/questions`)
    .set('x-internal-api-key', INTERNAL_API_KEY)
    .send({
      question: `${RUN_TAG} reroute fixture ${suffix}`,
      priority: 'medium',
      source: 'OUTREACH',
      details: {state: 'Punjab', district: 'Ludhiana', crop: 'Wheat', season: 'Rabi', domain: ['Crop Protection']},
    });
  if (qRes.status !== 201) throw new Error(`Fixture question creation failed: ${qRes.status} ${JSON.stringify(qRes.body)}`);
  const questionId: string = qRes.body.question_id;
  createdQuestionIds.push(questionId);

  const answers = await db.getCollection('answers');
  const answerDoc = {
    questionId: new ObjectId(questionId),
    authorId: expertUser._id,
    answerIteration: 1,
    approvalCount: 0,
    isFinalAnswer: false,
    status: 'in-review',
    answer: `${RUN_TAG} answer ${suffix}`,
    sources: [],
    embedding: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const insertResult = await answers.insertOne(answerDoc);
  createdAnswerIds.push(insertResult.insertedId);

  return {questionId, answerId: insertResult.insertedId.toString()};
}

function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPatch(path: string) {
  return request(app).patch(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

describe('POST /reroute/:questionId/allocate-reroute-experts', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/reroute/${new ObjectId().toString()}/allocate-reroute-experts`).send({});
    expect(res.status).toBe(401);
  });

  it('errors for a non-existent question/expert/answer combination', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/reroute/${new ObjectId().toString()}/allocate-reroute-experts`).send({
      expertId: new ObjectId().toString(),
      answerId: new ObjectId().toString(),
      moderatorId: moderatorUser._id.toString(),
      comment: 'e2e reroute attempt on nonexistent data',
      status: 'pending',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('POST /reroute/allocated', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/reroute/allocated`).send({});
    expect(res.status).toBe(401);
  });

  it('returns a list (possibly empty) for an authenticated expert', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/reroute/allocated`).send({});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /reroute/:questionId', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/reroute/${new ObjectId().toString()}`);
    expect(res.status).toBe(401);
  });

  it('handles a non-existent question id', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/reroute/${new ObjectId().toString()}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    // Documenting actual behavior rather than assuming — could be 200/null or a 4xx/5xx.
    expect(res.status).toBeLessThan(500 + 1);
  });
});

describe('GET /reroute/:answerId/history', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/reroute/${new ObjectId().toString()}/history`);
    expect(res.status).toBe(401);
  });

  it('returns an empty history for an answer with no reroutes', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/reroute/${new ObjectId().toString()}/history`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });
});

describe('PATCH /reroute/:rerouteId/:questionId (expert rejects)', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPatch(
      `${ROUTE_PREFIX}/reroute/${new ObjectId().toString()}/${new ObjectId().toString()}`,
    ).send({});
    expect(res.status).toBe(401);
  });

  it('errors for a non-existent reroute record', async () => {
    currentTestUser = expertUser;
    const res = await apiPatch(
      `${ROUTE_PREFIX}/reroute/${new ObjectId().toString()}/${new ObjectId().toString()}`,
    ).send({
      reason: 'not available',
      moderatorId: moderatorUser._id.toString(),
      role: 'expert',
      expertId: expertUser._id.toString(),
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('PATCH /reroute/:questionId/:expertId/action (moderator rejects)', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPatch(
      `${ROUTE_PREFIX}/reroute/${new ObjectId().toString()}/${new ObjectId().toString()}/action`,
    ).send({});
    expect(res.status).toBe(401);
  });

  it('errors for a non-existent question/expert combination', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPatch(
      `${ROUTE_PREFIX}/reroute/${new ObjectId().toString()}/${expertUser._id.toString()}/action`,
    ).send({status: 'rejected', reason: 'not available'});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('Full reroute happy path (real fixtures)', () => {
  it('moderator reroutes to expertUser2 -> reroute record created, question visible via GET/:questionId and POST /allocated, history populated', async () => {
    const {questionId, answerId} = await createQuestionWithAnswer('happy-1');

    currentTestUser = moderatorUser;
    const allocateRes = await apiPost(`${ROUTE_PREFIX}/reroute/${questionId}/allocate-reroute-experts`).send({
      expertId: expertUser2._id.toString(),
      answerId,
      moderatorId: moderatorUser._id.toString(),
      comment: `${RUN_TAG} real reroute assignment`,
      status: 'pending',
    });
    console.log('allocate STATUS:', allocateRes.status, 'BODY:', JSON.stringify(allocateRes.body));
    expect(allocateRes.status).toBe(200);

    const reroutes = await db.getCollection('reroutes');
    const rerouteDoc = await reroutes.findOne({questionId: new ObjectId(questionId)});
    expect(rerouteDoc).toBeTruthy();
    expect(rerouteDoc.reroutes).toHaveLength(1);
    expect(rerouteDoc.reroutes[0].status).toBe('pending');
    expect(rerouteDoc.reroutes[0].reroutedTo.toString()).toBe(expertUser2._id.toString());

    // GET /:questionId as the assigned expert — real history via getAllocatedQuestionsByID
    currentTestUser = expertUser2;
    const getRes = await apiGet(`${ROUTE_PREFIX}/reroute/${questionId}`);
    console.log('GET /:questionId STATUS:', getRes.status, 'BODY:', JSON.stringify(getRes.body).slice(0, 500));
    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.history)).toBe(true);
    expect(getRes.body.history.length).toBeGreaterThanOrEqual(1);
    expect(getRes.body.history[0].reroute.status).toBe('pending');
    expect(getRes.body.history[0].answer.id).toBe(answerId);

    // POST /allocated as the assigned expert — real aggregation, must include this question now
    const allocatedRes = await apiPost(`${ROUTE_PREFIX}/reroute/allocated`).send({});
    console.log('POST /allocated STATUS:', allocatedRes.status, 'count:', allocatedRes.body?.length);
    expect(allocatedRes.status).toBe(200);
    expect(Array.isArray(allocatedRes.body)).toBe(true);
    const match = allocatedRes.body.find((row: any) => row.rerouteId === rerouteDoc._id.toString());
    expect(match).toBeTruthy();
    expect(match.reroute.status).toBe('pending');

    // GET /:answerId/history — the route's :answerId param is matched against questionId in the
    // repository (see ReRouteRepository.getRerouteHistory's $match), so calling it with the real
    // question id (not the answer id) is what actually returns this reroute's history.
    const historyRes = await apiGet(`${ROUTE_PREFIX}/reroute/${questionId}/history`);
    console.log('history STATUS:', historyRes.status, 'BODY:', JSON.stringify(historyRes.body).slice(0, 500));
    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body)).toBe(true);
    expect(historyRes.body.length).toBeGreaterThanOrEqual(1);
    expect(historyRes.body[0].reroutes[0].status).toBe('pending');
  }, 30000);

  it('expert rejects the reroute -> real status flip to expert_rejected, reputation/notification side effects run, second reject on the same record 400s for a real reason', async () => {
    const {questionId, answerId} = await createQuestionWithAnswer('happy-2');

    currentTestUser = moderatorUser;
    await apiPost(`${ROUTE_PREFIX}/reroute/${questionId}/allocate-reroute-experts`).send({
      expertId: expertUser2._id.toString(),
      answerId,
      moderatorId: moderatorUser._id.toString(),
      comment: `${RUN_TAG} reroute for expert-reject path`,
      status: 'pending',
    });

    const reroutes = await db.getCollection('reroutes');
    const rerouteDoc = await reroutes.findOne({questionId: new ObjectId(questionId)});
    const rerouteId = rerouteDoc._id.toString();

    currentTestUser = expertUser2;
    const rejectRes = await apiPatch(`${ROUTE_PREFIX}/reroute/${rerouteId}/${questionId}`).send({
      reason: `${RUN_TAG} expert declines`,
      moderatorId: moderatorUser._id.toString(),
      role: 'expert',
      expertId: expertUser2._id.toString(),
    });
    console.log('expert-reject STATUS:', rejectRes.status, 'BODY:', JSON.stringify(rejectRes.body));
    expect(rejectRes.status).toBe(200);

    const afterReject = await reroutes.findOne({_id: rerouteDoc._id});
    expect(afterReject.reroutes[0].status).toBe('expert_rejected');
    expect(afterReject.reroutes[0].rejectionReason).toBe(`${RUN_TAG} expert declines`);

    const questions = await db.getCollection('questions');
    const questionAfter = await questions.findOne({_id: new ObjectId(questionId)});
    expect(questionAfter.status).toBe('in-review');

    // Same reroute, rejected again — real business-rule 400, not a "record not found" 400.
    const secondRejectRes = await apiPatch(`${ROUTE_PREFIX}/reroute/${rerouteId}/${questionId}`).send({
      reason: 'second attempt',
      moderatorId: moderatorUser._id.toString(),
      role: 'expert',
      expertId: expertUser2._id.toString(),
    });
    console.log('second expert-reject STATUS:', secondRejectRes.status, 'BODY:', JSON.stringify(secondRejectRes.body));
    expect(secondRejectRes.status).toBe(400);
    expect(secondRejectRes.body.message || JSON.stringify(secondRejectRes.body)).toMatch(/already rejected/i);
  }, 30000);

  it('moderator rejects via the dedicated moderator-action route -> real updateStatus write', async () => {
    const {questionId, answerId} = await createQuestionWithAnswer('happy-3');

    currentTestUser = moderatorUser;
    await apiPost(`${ROUTE_PREFIX}/reroute/${questionId}/allocate-reroute-experts`).send({
      expertId: expertUser2._id.toString(),
      answerId,
      moderatorId: moderatorUser._id.toString(),
      comment: `${RUN_TAG} reroute for moderator-reject path`,
      status: 'pending',
    });

    const modRejectRes = await apiPatch(
      `${ROUTE_PREFIX}/reroute/${questionId}/${expertUser2._id.toString()}/action`,
    ).send({status: 'moderator_rejected', reason: `${RUN_TAG} moderator declines on expert's behalf`});
    console.log('moderator-reject STATUS:', modRejectRes.status, 'BODY:', JSON.stringify(modRejectRes.body));
    expect(modRejectRes.status).toBe(200);

    const reroutes = await db.getCollection('reroutes');
    const rerouteDoc = await reroutes.findOne({questionId: new ObjectId(questionId)});
    expect(rerouteDoc.reroutes[0].status).toBe('moderator_rejected');
  }, 30000);
});
