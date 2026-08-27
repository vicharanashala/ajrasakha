/**
 * Location (LGD) Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   GET    /api/location/states
 *   PUT    /api/location/states/:stateCode/aliases     (admin/moderator only, real in-handler check)
 *   POST   /api/location/states                         (admin/moderator only)
 *   DELETE /api/location/states/:stateCode
 *   GET    /api/location/districts
 *   GET    /api/location/districts/all
 *   PUT    /api/location/districts/:districtCode/aliases
 *   POST   /api/location/districts
 *   POST   /api/location/districts/all
 *   DELETE /api/location/districts/:districtCode
 *   GET    /api/location/audits
 *   GET    /api/location/blocks
 *   GET    /api/location/villages
 *   GET    /api/location/kvks
 *   GET    /api/location/download
 *
 * NOT COVERED: `POST /kvks/sync` — runs a real script (`create-lgd-kvks-collection.mjs
 * --apply`) reading a CSV and upserting the real `kvks` collection. Its `@Authorized()`
 * is commented out in the controller (no auth at all, currently). Exercising it for
 * real risks a long-running mutation against real reference data — out of scope here,
 * same reasoning as `bulk-pae-allocate`.
 *
 * FIXTURES: this suite creates its own throwaway state/district using an
 * out-of-range `stateCode`/`districtCode` (900000+) that cannot collide with real
 * LGD codes, and deletes them via the controller's own DELETE routes in `afterAll`
 * — real state/district reference data is never touched.
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
const RUN_TAG = `E2E_LGD_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-lgd-key';
// LocationService.addState/addDistrict auto-assign the next sequential code
// (max existing + 1) — any `code` field sent in the request body is ignored.
// These are populated from the real response after creation.
let TEST_STATE_CODE: number;
let TEST_DISTRICT_CODE: number;

let app: express.Express;
let db: any;
let moderatorUser: any;
let expertUser: any;

let currentTestUser: any = null;
let stateCreated = false;
let districtCreated = false;

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
  currentTestUser = moderatorUser;
  if (districtCreated) {
    await request(app)
      .delete(`${ROUTE_PREFIX}/location/districts/${TEST_DISTRICT_CODE}`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .send({reason: 'e2e cleanup'})
      .catch(() => {});
  }
  if (stateCreated) {
    await request(app)
      .delete(`${ROUTE_PREFIX}/location/states/${TEST_STATE_CODE}`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .send({reason: 'e2e cleanup'})
      .catch(() => {});
  }
  currentTestUser = null;
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
function apiDelete(path: string) {
  return request(app).delete(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

describe('GET /location/states', () => {
  it('requires the internal API key but no logged-in user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/location/states`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /location/states', () => {
  it('returns 401 with no authenticated user (bare @Authorized())', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/location/states`).send({name: 'x', reason: 'x'});
    expect(res.status).toBe(401);
  });

  it('blocks an expert with 403 (real assertCanManage check)', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/location/states`).send({
      name: `${RUN_TAG}_state`,
      reason: 'expert attempt',
    });

    console.log('STATUS:', res.status);
    expect(res.status).toBe(403);
  });

  it('moderator creates a throwaway state', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/location/states`).send({
      name: `${RUN_TAG}_state`,
      reason: 'e2e fixture',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    // The stateCode is auto-assigned server-side (max existing + 1) — any
    // `code` sent in the request body is ignored. Capture the real one.
    TEST_STATE_CODE = res.body.stateCode;
    expect(TEST_STATE_CODE).toBeTypeOf('number');
    stateCreated = true;
  });
});

describe('GET /location/districts + /districts/all', () => {
  it('lists districts for a state (stateCode is required)', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/location/districts?stateCode=${TEST_STATE_CODE}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('lists all districts across states', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/location/districts/all`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /location/audits', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/location/audits`);
    expect(res.status).toBe(401);
  });

  it('blocks an expert with 403', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/location/audits`);
    expect(res.status).toBe(403);
  });

  it('moderator sees the audit trail, including the state-creation entry', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/location/audits?limit=50`);

    console.log('STATUS:', res.status, 'count:', res.body?.length);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /location/blocks, /villages, /kvks', () => {
  it('returns blocks for a district (no auth required)', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/location/blocks?districtCode=1`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns villages for a block (no auth required)', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/location/villages?blockCode=1`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns kvks for a district (no auth required)', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/location/kvks?districtCode=1`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /location/download', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/location/download?type=state`);
    expect(res.status).toBe(401);
  });

  it('returns an xlsx buffer for an authenticated user', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/location/download?type=state`);

    console.log('STATUS:', res.status, 'content-type:', res.headers['content-type']);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  }, 20000);
});

describe('PUT /location/states/:stateCode/aliases', () => {
  it('blocks an expert with 403', async () => {
    currentTestUser = expertUser;
    const res = await apiPut(`${ROUTE_PREFIX}/location/states/${TEST_STATE_CODE}/aliases`).send({
      aliases: ['Nickname'],
    });
    expect(res.status).toBe(403);
  });

  it('rejects a non-array aliases payload', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPut(`${ROUTE_PREFIX}/location/states/${TEST_STATE_CODE}/aliases`).send({
      aliases: 'not-an-array',
    });

    console.log('STATUS:', res.status);
    expect(res.status).toBe(400);
  });

  it('moderator updates state aliases', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPut(`${ROUTE_PREFIX}/location/states/${TEST_STATE_CODE}/aliases`).send({
      aliases: ['E2E Alias'],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });
});

describe('POST /location/districts', () => {
  it('blocks an expert with 403', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/location/districts`).send({
      stateCode: TEST_STATE_CODE,
      name: `${RUN_TAG}_district`,
      reason: 'expert attempt',
    });
    expect(res.status).toBe(403);
  });

  it('moderator creates a throwaway district under the fixture state', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/location/districts`).send({
      stateCode: TEST_STATE_CODE,
      name: `${RUN_TAG}_district`,
      reason: 'e2e fixture',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    TEST_DISTRICT_CODE = res.body.districtCode;
    expect(TEST_DISTRICT_CODE).toBeTypeOf('number');
    districtCreated = true;
  });
});

describe('PUT /location/districts/:districtCode/aliases', () => {
  it('moderator updates district aliases', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPut(`${ROUTE_PREFIX}/location/districts/${TEST_DISTRICT_CODE}/aliases`).send({
      aliases: ['E2E District Alias'],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });
});

describe('DELETE /location/districts/:districtCode + /location/states/:stateCode', () => {
  it('blocks an expert from deleting the district', async () => {
    currentTestUser = expertUser;
    const res = await apiDelete(`${ROUTE_PREFIX}/location/districts/${TEST_DISTRICT_CODE}`).send({reason: 'x'});
    expect(res.status).toBe(403);
  });

  it('moderator deletes the fixture district', async () => {
    currentTestUser = moderatorUser;
    const res = await apiDelete(`${ROUTE_PREFIX}/location/districts/${TEST_DISTRICT_CODE}`).send({
      reason: 'e2e cleanup',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    districtCreated = false;
  });

  it('moderator deletes the fixture state', async () => {
    currentTestUser = moderatorUser;
    const res = await apiDelete(`${ROUTE_PREFIX}/location/states/${TEST_STATE_CODE}`).send({
      reason: 'e2e cleanup',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    stateCreated = false;
  });
});
