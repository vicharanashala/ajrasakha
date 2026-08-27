/**
 * Crop Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   GET    /api/crops                 (paginated list)
 *   GET    /api/crops/bulk-status      (bulk CSV job list)
 *   GET    /api/crops/bulk-status/:jobId
 *   GET    /api/crops/download         (xlsx export)
 *   GET    /api/crops/:cropId
 *   POST   /api/crops                  (create — admin/moderator only, real in-handler check)
 *   PUT    /api/crops/:cropId          (update — admin/moderator only, real in-handler check)
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
const RUN_TAG = `E2E_CROP_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-crop-key';

let app: express.Express;
let db: any;
let adminUser: any;
let moderatorUser: any;
let expertUser: any;

let currentTestUser: any = null;
const createdCropIds: string[] = [];

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
  [adminUser, moderatorUser, expertUser] = await Promise.all([
    users.findOne({email: process.env.ADMIN_EMAIL}),
    users.findOne({email: process.env.MODERATOR_EMAIL}),
    users.findOne({email: process.env.EXPERT_EMAIL}),
  ]);
  const missing = [
    !adminUser && `ADMIN_EMAIL=${process.env.ADMIN_EMAIL}`,
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
    !expertUser && `EXPERT_EMAIL=${process.env.EXPERT_EMAIL}`,
  ].filter(Boolean);
  if (missing.length) throw new Error(`Test users not found: ${missing.join(', ')}`);

  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db && createdCropIds.length) {
    const crops = await db.getCollection('crops');
    for (const id of createdCropIds) {
      await crops.deleteOne({_id: new ObjectId(id)}).catch(() => {});
    }
    console.log(`[teardown] Cleaned up ${createdCropIds.length} crop(s).`);
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

describe('GET /crops', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/crops`);
    expect(res.status).toBe(401);
  });

  it('lists crops for an authenticated user', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/crops`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.crops)).toBe(true);
  });
});

describe('GET /crops/bulk-status', () => {
  it('returns the in-memory bulk job list', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/crops/bulk-status`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });

  it('404s for a non-existent job id', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/crops/bulk-status/not-a-real-job-id`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(404);
  });
});

describe('GET /crops/download', () => {
  it('returns an xlsx buffer', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/crops/download`);

    console.log('STATUS:', res.status, 'content-type:', res.headers['content-type']);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  }, 20000);
});

describe('POST /crops', () => {
  it('blocks an expert with 403 (real in-handler WRITE_ROLES check)', async () => {
    currentTestUser = expertUser;
    const res = await apiPost(`${ROUTE_PREFIX}/crops`).send({name: `${RUN_TAG}_expert_attempt`});

    console.log('STATUS:', res.status);
    expect(res.status).toBe(403);
  });

  it('rejects a missing crop name', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/crops`).send({});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });

  it('moderator creates a crop', async () => {
    currentTestUser = moderatorUser;
    const name = `${RUN_TAG}_crop`;
    const res = await apiPost(`${ROUTE_PREFIX}/crops`).send({name});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Crop names are normalized server-side (title-cased) — don't assume verbatim storage.
    expect(res.body.data.name.toLowerCase()).toBe(name.toLowerCase());
    createdCropIds.push(res.body.data._id);
  });
});

describe('GET /crops/:cropId', () => {
  it('gets the created crop by id', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/crops/${createdCropIds[0]}`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(createdCropIds[0]);
  });

  it('404s for a non-existent crop', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/crops/${new ObjectId().toString()}`);

    expect(res.status).toBe(404);
  });
});

describe('PUT /crops/:cropId', () => {
  it('blocks an expert with 403', async () => {
    currentTestUser = expertUser;
    const res = await apiPut(`${ROUTE_PREFIX}/crops/${createdCropIds[0]}`).send({aliases: []});

    expect(res.status).toBe(403);
  });

  it('404s for a non-existent crop', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPut(`${ROUTE_PREFIX}/crops/${new ObjectId().toString()}`).send({aliases: []});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(404);
  });

  it('moderator updates the crop aliases', async () => {
    currentTestUser = moderatorUser;
    // Alias uniqueness is enforced globally across all crops (case-insensitive),
    // not just within this one — a generic literal like "Test" risks colliding
    // with leftover data from any other run. Scope it to RUN_TAG.
    const res = await apiPut(`${ROUTE_PREFIX}/crops/${createdCropIds[0]}`).send({
      aliases: [{language: 'Hindi', region: 'North', english_representation: `${RUN_TAG}_Alias`, native_representation: 'परीक्षण'}],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Additional coverage — migrated 2026-08-25 from the mocked
// src/modules/crop/tests/CropController.api.test.ts (now deleted; see
// BUGS_REPORT.md / COVERAGE_GAP_REPORT.md for the consolidation note).
// ════════════════════════════════════════════════════════════════════════════

describe('GET /crops — search query param', () => {
  it('returns only crops matching the search term', async () => {
    currentTestUser = moderatorUser;

    const name = `${RUN_TAG}_Searchable_Crop`;
    const createRes = await apiPost(`${ROUTE_PREFIX}/crops`).send({name});
    expect(createRes.status).toBe(201);
    createdCropIds.push(createRes.body.data._id);

    const res = await apiGet(`${ROUTE_PREFIX}/crops?search=${encodeURIComponent(RUN_TAG)}_Searchable`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(200);
    expect(res.body.crops.length).toBeGreaterThan(0);
    expect(res.body.crops.every((c: any) => c.name.toLowerCase().includes('searchable'))).toBe(true);
  });
});

describe('POST/PUT /crops — admin role', () => {
  it('admin can create a crop', async () => {
    currentTestUser = adminUser;

    const name = `${RUN_TAG}_Admin_Create`;
    const res = await apiPost(`${ROUTE_PREFIX}/crops`).send({name});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    createdCropIds.push(res.body.data._id);
  });

  it('admin can update a crop', async () => {
    currentTestUser = moderatorUser;
    const createRes = await apiPost(`${ROUTE_PREFIX}/crops`).send({name: `${RUN_TAG}_Admin_Update_Source`});
    expect(createRes.status).toBe(201);
    const localId = createRes.body.data._id;
    createdCropIds.push(localId);

    currentTestUser = adminUser;
    const res = await apiPut(`${ROUTE_PREFIX}/crops/${localId}`).send({
      aliases: [{language: 'Hindi', region: 'North', english_representation: `${RUN_TAG}_Admin_Alias`, native_representation: 'प्रशासक'}],
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
