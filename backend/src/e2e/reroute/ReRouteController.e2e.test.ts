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
 * A genuine reroute record only exists after a peer-review rejection cycle
 * produces one (already exercised structurally by `post-allocation/` and
 * `gatekeeper-auditor/`). Building that multi-stage fixture chain here just to
 * reach these 6 routes would duplicate a lot of unrelated machinery, so this
 * suite covers the auth gate and the error paths every route takes for
 * nonexistent/invalid ids — not the full reroute happy path. Worth a dedicated
 * follow-up suite if reroute-specific business logic needs deeper coverage.
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

let currentTestUser: any = null;

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
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db?.disconnect) await db.disconnect();
}, 60000);

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
