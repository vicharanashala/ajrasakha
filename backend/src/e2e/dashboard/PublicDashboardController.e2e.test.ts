/**
 * Public Dashboard Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   GET    /api/public-dashboard/saturated-crops   (no auth required)
 *   GET    /api/public-dashboard/users              (no auth required)
 *   GET    /api/public-dashboard/items              (no auth required)
 *   POST   /api/public-dashboard/items               (admin only)
 *   POST   /api/public-dashboard/media                (admin only — real GCS upload, out of scope)
 *   PUT    /api/public-dashboard/items-reorder         (admin only)
 *   PUT    /api/public-dashboard/items/:id             (admin only)
 *   DELETE /api/public-dashboard/items/:id             (admin only)
 *
 * Unlike most of the codebase, `PublicDashboardController` does NOT rely solely on
 * `@Authorized(['admin'])` — every write handler also calls a private `assertAdmin()`
 * helper, with a comment explicitly noting the global authorizationChecker only
 * checks authentication (i.e. the devs already worked around BUG-017 here). This
 * suite verifies that real guard.
 *
 * `items` are stored as a single shared array document — this suite only ever adds
 * a uniquely-named test item and cleans it up, never touching well-known names like
 * "saturation limit crop" that production actually reads.
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
const RUN_TAG = `E2E_DASHBOARD_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-dashboard-key';

let app: express.Express;
let db: any;
let adminUser: any;
let expertUser: any;

let currentTestUser: any = null;
let createdItemId: string | null = null;

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
  currentTestUser = adminUser;
  if (createdItemId) {
    await request(app)
      .delete(`${ROUTE_PREFIX}/public-dashboard/items/${createdItemId}`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
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

describe('Public read routes (no user auth required)', () => {
  it('GET /saturated-crops still requires the internal API key', async () => {
    currentTestUser = null;
    const res = await request(app).get(`${ROUTE_PREFIX}/public-dashboard/saturated-crops`);
    expect(res.status).toBe(401);
  });

  it('GET /saturated-crops works with the internal key alone — no logged-in user needed', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/public-dashboard/saturated-crops`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.saturationLimit).toBeTypeOf('number');
  });

  it('GET /users works with no logged-in user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/public-dashboard/users`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /items works with no logged-in user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/public-dashboard/items`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /public-dashboard/items (admin only, real assertAdmin check)', () => {
  // routing-controllers' own ExpressDriver: when @Authorized(roles) has a
  // non-empty roles array, ANY authorizationChecker failure — including "no
  // user at all" — throws AccessDeniedError (403), not AuthorizationRequiredError
  // (401). Only bare @Authorized() (no roles) 401s on missing auth. Framework
  // behavior, not an app bug.
  it('returns 403 with no authenticated user (roles-array @Authorized behavior)', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/public-dashboard/items`).send({name: 'x', value: 'y'});
    expect(res.status).toBe(403);
  });

  it('blocks a non-admin (expert) with 403 — real in-handler check, unlike BUG-017 elsewhere', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/public-dashboard/items`).send({
      name: `${RUN_TAG}_item`,
      value: 'expert attempt',
    });

    console.log('STATUS:', res.status);
    expect(res.status).toBe(403);
  });

  it('admin adds a custom item', async () => {
    currentTestUser = adminUser;
    const res = await apiPost(`${ROUTE_PREFIX}/public-dashboard/items`).send({
      name: `${RUN_TAG}_item`,
      value: 'initial value',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`${RUN_TAG}_item`);
    createdItemId = res.body.id;
  });

  it('the new item is now visible via the public GET /items', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/public-dashboard/items`);

    expect(res.status).toBe(200);
    expect(res.body.some((i: any) => i.id === createdItemId)).toBe(true);
  });
});

describe('PUT /public-dashboard/items/:id', () => {
  it('blocks a non-admin with 403', async () => {
    currentTestUser = expertUser;
    const res = await apiPut(`${ROUTE_PREFIX}/public-dashboard/items/${createdItemId}`).send({value: 'hacked'});
    expect(res.status).toBe(403);
  });

  it('404s for a non-existent item id', async () => {
    currentTestUser = adminUser;
    const res = await apiPut(`${ROUTE_PREFIX}/public-dashboard/items/not-a-real-id`).send({value: 'x'});

    console.log('STATUS:', res.status);
    expect(res.status).toBe(404);
  });

  it('admin updates the item value', async () => {
    currentTestUser = adminUser;
    const res = await apiPut(`${ROUTE_PREFIX}/public-dashboard/items/${createdItemId}`).send({
      value: 'updated value',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('updated value');
  });
});

describe('PUT /public-dashboard/items-reorder', () => {
  it('blocks a non-admin with 403', async () => {
    currentTestUser = expertUser;
    const res = await apiPut(`${ROUTE_PREFIX}/public-dashboard/items-reorder`).send({orderedIds: []});
    expect(res.status).toBe(403);
  });

  it('admin reorders items (no-op ordering with just the one test item)', async () => {
    currentTestUser = adminUser;
    const res = await apiPut(`${ROUTE_PREFIX}/public-dashboard/items-reorder`).send({
      orderedIds: [createdItemId],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});

describe('DELETE /public-dashboard/items/:id', () => {
  it('blocks a non-admin with 403', async () => {
    currentTestUser = expertUser;
    const res = await apiDelete(`${ROUTE_PREFIX}/public-dashboard/items/${createdItemId}`);
    expect(res.status).toBe(403);
  });

  it('admin deletes the item', async () => {
    currentTestUser = adminUser;
    const res = await apiDelete(`${ROUTE_PREFIX}/public-dashboard/items/${createdItemId}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    createdItemId = null;
  });

  it('404s deleting the same item again', async () => {
    currentTestUser = adminUser;
    // re-post it once more just to have a real id to confirm double-delete 404s
    const createRes = await apiPost(`${ROUTE_PREFIX}/public-dashboard/items`).send({
      name: `${RUN_TAG}_redelete`,
      value: 'x',
    });
    const id = createRes.body.id;
    await apiDelete(`${ROUTE_PREFIX}/public-dashboard/items/${id}`);

    const res = await apiDelete(`${ROUTE_PREFIX}/public-dashboard/items/${id}`);
    console.log('STATUS:', res.status);
    expect(res.status).toBe(404);
  });
});

describe('POST /public-dashboard/media', () => {
  it('rejects a request with no file (happy path needs a real GCS upload — out of scope here)', async () => {
    currentTestUser = adminUser;
    const res = await apiPost(`${ROUTE_PREFIX}/public-dashboard/media`).field('type', 'image');

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });
});
