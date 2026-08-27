/**
 * Request Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   POST /api/requests                    (create a flag request)
 *   GET  /api/requests                     (list — blocked for `expert` role)
 *   GET  /api/requests/:requestId          (diff view)
 *   PUT  /api/requests/:requestId/status   (approve/reject/in-review)
 *   PUT  /api/requests/:requestId/delete   (soft delete)
 *
 * `getAllRequests` has a REAL in-handler role check (`user.role === 'expert'` →
 * `UnauthorizedError`, i.e. 401, not the `@Authorized([roles])` pattern that
 * BUG-017 shows is unenforced) — this suite exercises that actual guard.
 *
 * FIXTURES: a real OUTREACH question (via POST /api/questions) is used as the
 * flagged entity for `entityId`.
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
const RUN_TAG = `E2E_REQUEST_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-request-key';

let app: express.Express;
let db: any;
let moderatorUser: any;
let expertUser: any;

let currentTestUser: any = null;
let questionId: string;
const createdRequestIds: string[] = [];

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
      details: {
        state: 'Punjab',
        district: 'Ludhiana',
        crop: 'Wheat',
        season: 'Rabi',
        domain: ['Crop Protection'],
      },
    });
  if (qRes.status !== 201) {
    throw new Error(`Fixture question creation failed: ${qRes.status} ${JSON.stringify(qRes.body)}`);
  }
  questionId = qRes.body.question_id;

  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG} questionId=${questionId}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db) {
    const questions = await db.getCollection('questions');
    const requests = await db.getCollection('requests');
    if (questionId) await questions.deleteOne({_id: new ObjectId(questionId)}).catch(() => {});
    for (const id of createdRequestIds) {
      await requests.deleteOne({_id: new ObjectId(id)}).catch(() => {});
    }
    console.log(`[teardown] Cleaned up fixture question + ${createdRequestIds.length} request(s).`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPut(path: string) {
  return request(app).put(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

describe('POST /requests', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/requests`).send({reason: 'x', entityId: questionId});
    expect(res.status).toBe(401);
  });

  // BUG-021: RequestRepository.createRequest returns { _id: insertedId, ...payload }
  // with raw ObjectId instances (_id, requestedBy, entityId) — never stringified.
  // routing-controllers' response serialization doesn't call ObjectId.toHexString()
  // on them, so the JSON body ships a malformed `{ buffer: { data: [...] } }` shape
  // instead of a usable hex string. Every other suite's create endpoints (Chemical,
  // Question, ...) return a clean string _id; this one doesn't. Worked around here
  // by reading the real id back from Mongo directly instead of trusting the response.
  it('BUG-021: creates a flag request, but the response _id is a malformed raw ObjectId (not a hex string)', async () => {
    currentTestUser = expertUser;
    const reason = `${RUN_TAG} — flagging for review`;
    const res = await apiPost(`${ROUTE_PREFIX}/requests`).send({
      reason,
      entityId: questionId,
      details: {requestType: 'others', details: {note: 'looks off'}},
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    expect(typeof res.body._id).not.toBe('string');
    expect(res.body._id?.buffer).toBeTruthy();

    const requests = await db.getCollection('requests');
    const doc = await requests.findOne({reason});
    expect(doc?._id).toBeTruthy();
    createdRequestIds.push(doc._id.toString());
  });
});

describe('GET /requests', () => {
  it('blocks an expert with 401 (real in-handler role check, not @Authorized([roles]))', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/requests`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(401);
  });

  it('allows a moderator and returns the created request', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/requests`);

    console.log('STATUS:', res.status, 'total:', res.body.totalCount);
    expect(res.status).toBe(200);
    expect(res.body.requests.some((r: any) => r._id === createdRequestIds[0])).toBe(true);
  });
});

describe('GET /requests/:requestId', () => {
  it('returns the diff view for an existing request', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/requests/${createdRequestIds[0]}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('responses');
  });

  it('404s for a non-existent request', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/requests/${new ObjectId().toString()}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('PUT /requests/:requestId/status', () => {
  it('rejects the request with a response, moving it to a closed state', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPut(`${ROUTE_PREFIX}/requests/${createdRequestIds[0]}/status`).send({
      status: 'rejected',
      response: 'Not actionable',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  }, 20000);

  it('rejects a further status change on an already-closed request', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPut(`${ROUTE_PREFIX}/requests/${createdRequestIds[0]}/status`).send({
      status: 'approved',
      response: 'Changed my mind',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  }, 20000);
});

describe('PUT /requests/:requestId/delete', () => {
  // BUG-022: softDelete() resolves with `undefined` (declared return type
  // `Promise<void>`) and has no `@OnUndefined()` decorator. routing-controllers'
  // own ExpressDriver treats an undefined action result as "not found" by
  // default — that framework-level check runs AFTER the handler (and the real
  // DB update) already completed, and it wins over the declared `@HttpCode(204)`.
  // Net effect: the soft delete genuinely happens, but EVERY caller — success or
  // not — sees a 404. From a real client's perspective this endpoint looks
  // completely broken.
  it('BUG-022: soft-delete succeeds server-side but the response is always 404 (undefined return, no @OnUndefined)', async () => {
    currentTestUser = expertUser;
    const reason = `${RUN_TAG} — to be deleted`;
    const createRes = await apiPost(`${ROUTE_PREFIX}/requests`).send({
      reason,
      entityId: questionId,
      details: {requestType: 'others', details: {}},
    });
    expect(createRes.status).toBe(201);

    // BUG-021 workaround — see the "creates a flag request" test above.
    const requests = await db.getCollection('requests');
    const doc = await requests.findOne({reason});
    const localId = doc._id.toString();
    createdRequestIds.push(localId);

    currentTestUser = moderatorUser;
    const res = await apiPut(`${ROUTE_PREFIX}/requests/${localId}/delete`);

    console.log('DELETE STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(404);

    const afterDelete = await requests.findOne({_id: new ObjectId(localId)});
    expect(afterDelete.isDeleted).toBe(true);
  }, 20000);
});
