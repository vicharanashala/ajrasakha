/**
 * Plivo Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   GET  /api/plivo/history        (real Plivo call-list API, no @Authorized at all)
 *   POST /api/plivo/send-message   (validation only — NEVER exercises the happy
 *                                    path, which would send a real SMS via Fast2SMS
 *                                    to a real phone number)
 *   GET  /api/plivo/analytics      (call_agent only, real in-handler check)
 *   GET  /api/plivo/acc-analytics  (admin only, real in-handler check)
 *
 * NOT COVERED: `POST /answer` — the inbound-call webhook Plivo itself calls.
 * Exercising it for real would mark a real agent user as busy and requires
 * simulating Plivo's own request shape; out of scope for this pass.
 *
 * FINDING: `GET /history` has no `@Authorized()` decorator at all — unlike every
 * other read route in this module, it's reachable with just the shared
 * `x-internal-api-key` and no per-user login. Documented, not fixed.
 */

process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({path: '.env'});
dotenv.config({path: '.env.test'});

import express from 'express';
import request from 'supertest';
import {useExpressServer} from 'routing-controllers';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';

const ROUTE_PREFIX = '/api';
const INTERNAL_API_KEY = 'e2e-plivo-key';

let app: express.Express;
let db: any;
let adminUser: any;
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
  [adminUser, expertUser] = await Promise.all([
    users.findOne({email: process.env.ADMIN_EMAIL}),
    users.findOne({email: process.env.EXPERT_EMAIL}),
  ]);
  const missing = [
    !adminUser && `ADMIN_EMAIL=${process.env.ADMIN_EMAIL}`,
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

describe('GET /plivo/history', () => {
  it('has no @Authorized() — reachable with just the internal API key, no logged-in user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/plivo/history?limit=5`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    // Real call against the live Plivo API — accept either a real result or a
    // clean 500 if the configured Plivo credentials can't reach the account.
    expect([200, 500]).toContain(res.status);
  }, 20000);
});

describe('POST /plivo/send-message', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/plivo/send-message`).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a request missing destination/text — never reaches the real Fast2SMS call', async () => {
    currentTestUser = adminUser;
    const res = await apiPost(`${ROUTE_PREFIX}/plivo/send-message`).send({});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /plivo/analytics', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/plivo/analytics`);
    expect(res.status).toBe(401);
  });

  it('rejects a non-call_agent (expert) with 400 (real in-handler role check)', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/plivo/analytics`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });
});

describe('GET /plivo/acc-analytics', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/plivo/acc-analytics`);
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin (expert) with 400 (real in-handler role check)', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/plivo/acc-analytics`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });

  it('admin gets ACC analytics', async () => {
    currentTestUser = adminUser;
    const res = await apiGet(`${ROUTE_PREFIX}/plivo/acc-analytics`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});
