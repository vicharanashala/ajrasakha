/**
 * Chemical CRUD — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * Auth smoke tests + full CRUD against the REAL Mongo DB configured in `.env`:
 *
 *   GET    /api/chemicals           (list; auth gate check)
 *   POST   /api/chemicals           (create — admin + moderator allowed, expert blocked)
 *   GET    /api/chemicals/:id       (read by id)
 *   PUT    /api/chemicals/:id       (update — admin + moderator allowed, expert blocked)
 *   DELETE /api/chemicals/:id       (delete — admin + moderator allowed, expert blocked)
 *
 * STRATEGY
 * --------
 * In-process server — same harness as ManualAllocation.e2e.test.ts.
 * Users are fetched from the real DB by email (no Firebase token exchange).
 * `currentTestUser` is swapped per test; authorizationChecker / currentUserChecker
 * read from it. `InternalApiAuth` (global middleware) checks `x-internal-api-key`
 * on every request.
 *
 * Auth smoke tests map to the in-process auth mechanism:
 *   - "no auth"     → no x-internal-api-key header       → 401 (InternalApiAuth)
 *   - "invalid key" → wrong x-internal-api-key value     → 401 (InternalApiAuth)
 *   - "valid auth"  → correct key + currentTestUser set  → 200
 *
 * ROLE ENFORCEMENT
 * ----------------
 * ChemicalController uses `@Authorized()` (no args) + an explicit role check
 * inside the handler body: `if (!WRITE_ROLES.includes(user.role)) throw ForbiddenError`.
 * The role check fires BEFORE any DB lookup, so 403 is returned even when the
 * target chemical no longer exists (e.g., after the admin-delete test).
 */

// MongoDB on Atlas (mongodb+srv) requires TLS. MongoDatabase disables TLS when
// NODE_ENV==='test' (what Vitest sets), so force a non-test env BEFORE any
// module constructs the Mongo client. Must be the FIRST line.
process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
// Load real Atlas DB config first; dotenv will NOT override it with .env.test values.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.test' });

import express from 'express';
import request from 'supertest';
import { useExpressServer } from 'routing-controllers';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_CH_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-chemical-crud-key';

let app: express.Express;
let db: any;
let adminUser: any;
let moderatorUser: any;
let expertUser: any;

// Swapped per request — authorizationChecker / currentUserChecker read this.
let currentTestUser: any = null;

// Every chemical created during this run is tracked here.
// afterAll deletes all of them; 404s (already deleted by a test) are ignored.
const createdChemicalIds: string[] = [];

// Module-scope chemicalId / chemicalName shared across the admin CRUD sequence
// (tests 1–6) and the moderator-creates test (test 9).
let chemicalId: string;
let chemicalName: string;

beforeAll(async () => {
  // Warm-up: resolves the circular import that leaves CORE_TYPES undefined when
  // AnswerService is reached via the core barrel during loadAppModules.
  await import('#root/modules/answer/services/AnswerService.js');

  // InternalApiAuth is a global @Middleware({ type: 'before' }) that checks
  // x-internal-api-key on every route.
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

  // Fetch test users from the real DB (no Firebase token exchange needed).
  const users = await db.getCollection('users');
  [adminUser, moderatorUser, expertUser] = await Promise.all([
    users.findOne({ email: process.env.ADMIN_EMAIL }),
    users.findOne({ email: process.env.MODERATOR_EMAIL }),
    users.findOne({ email: process.env.EXPERT_EMAIL }),
  ]);

  const missing = [
    !adminUser && `ADMIN_EMAIL=${process.env.ADMIN_EMAIL}`,
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
    !expertUser && `EXPERT_EMAIL=${process.env.EXPERT_EMAIL}`,
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Test users not found in DB — ensure seed data exists for: ${missing.join(', ')}`);
  }

  await users.estimatedDocumentCount(); // sanity: connectivity
  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG}`);
}, 90000);

afterAll(async () => {
  currentTestUser = adminUser;
  if (createdChemicalIds.length) {
    for (const id of createdChemicalIds) {
      await apiDelete(`${ROUTE_PREFIX}/chemicals/${id}`).catch(() => {});
    }
    console.log(`[teardown] Attempted cleanup of ${createdChemicalIds.length} chemical(s).`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

// ─────────────────────── helpers ────────────────────────────────────────────

/** Sends a GET request WITH the correct internal API key. */
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

// ════════════════════════════════════════════════════════════════════════════
// Authentication Smoke Tests
//
// In the in-process harness auth works through:
//   1. InternalApiAuth (global @Middleware): checks x-internal-api-key header
//      - missing/wrong key → 401
//   2. authorizationChecker: !!currentTestUser
//      - null currentTestUser → 401
// ════════════════════════════════════════════════════════════════════════════

describe('Authentication Smoke Tests', () => {
  it('returns 401 when internal API key is missing', async () => {
    currentTestUser = null;

    // Deliberately omit the x-internal-api-key header — InternalApiAuth blocks.
    const res = await request(app).get(`${ROUTE_PREFIX}/chemicals`);

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(401);
  });

  it('returns 401 when internal API key is invalid', async () => {
    currentTestUser = null;

    // Wrong key value — InternalApiAuth rejects.
    const res = await request(app)
      .get(`${ROUTE_PREFIX}/chemicals`)
      .set('x-internal-api-key', 'totally-wrong-key');

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(401);
  });

  it('returns 200 when auth is valid', async () => {
    currentTestUser = adminUser;

    const res = await apiGet(`${ROUTE_PREFIX}/chemicals`);

    console.log('STATUS:', res.status);

    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Chemical CRUD E2E
// ════════════════════════════════════════════════════════════════════════════

describe('Chemical CRUD E2E', () => {
  it('admin creates a chemical successfully', async () => {
    currentTestUser = adminUser;

    const uniqueName = `${RUN_TAG}_Admin_Create`;

    const res = await apiPost(`${ROUTE_PREFIX}/chemicals`).send({
      name: uniqueName,
      status: 'Restricted',
    });

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(uniqueName);
    expect(res.body.data.status).toBe('Restricted');

    chemicalId = res.body.data._id;
    chemicalName = res.body.data.name;
    createdChemicalIds.push(chemicalId);
  });

  it('admin gets created chemical by id', async () => {
    currentTestUser = adminUser;

    const res = await apiGet(`${ROUTE_PREFIX}/chemicals/${chemicalId}`);

    console.log(res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(chemicalId);
  });

  it('admin updates a chemical', async () => {
    currentTestUser = adminUser;

    const updatedName = `${chemicalName}_UPDATED`;

    const res = await apiPut(`${ROUTE_PREFIX}/chemicals/${chemicalId}`).send({
      name: updatedName,
      status: 'Banned',
    });

    console.log('UPDATE STATUS:', res.status);
    console.log('UPDATE BODY:', res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(updatedName);
    expect(res.body.data.status).toBe('Banned');

    chemicalName = updatedName;
  });

  it('admin gets chemical after update', async () => {
    currentTestUser = adminUser;

    const res = await apiGet(`${ROUTE_PREFIX}/chemicals/${chemicalId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toContain('_UPDATED');
    expect(res.body.data.status).toBe('Banned');
  });

  it('admin deletes a chemical', async () => {
    currentTestUser = adminUser;

    const res = await apiDelete(`${ROUTE_PREFIX}/chemicals/${chemicalId}`);

    console.log('DELETE STATUS:', res.status);
    console.log('DELETE BODY:', res.body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('admin gets 404 for deleted chemical', async () => {
    currentTestUser = adminUser;

    const res = await apiGet(`${ROUTE_PREFIX}/chemicals/${chemicalId}`);

    console.log('POST DELETE GET STATUS:', res.status);
    console.log('POST DELETE GET BODY:', res.body);

    expect(res.status).toBe(404);
  });

  it('expert cannot create chemical', async () => {
    currentTestUser = expertUser;

    const res = await apiPost(`${ROUTE_PREFIX}/chemicals`).send({
      name: `${RUN_TAG}_Expert_Create_Attempt`,
      status: 'Restricted',
    });

    console.log('STATUS:', res.status);
    console.log('BODY:', res.body);

    expect(res.status).toBe(403);
  });

  it('expert cannot update a chemical', async () => {
    // chemicalId was deleted above — role check fires before DB lookup, so 403.
    currentTestUser = expertUser;

    const res = await apiPut(`${ROUTE_PREFIX}/chemicals/${chemicalId}`).send({
      name: `${chemicalName}_EXPERT_ATTEMPT`,
      status: 'Banned',
    });

    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));

    expect(res.status).toBe(403);
  });

  it('moderator creates chemical', async () => {
    currentTestUser = moderatorUser;

    const uniqueName = `${RUN_TAG}_Mod_Create`;

    const res = await apiPost(`${ROUTE_PREFIX}/chemicals`).send({
      name: uniqueName,
      status: 'Restricted',
    });

    console.log('STATUS:', res.status);
    console.log('BODY:', res.body);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(uniqueName);
    expect(res.body.data.status).toBe('Restricted');

    chemicalId = res.body.data._id;
    chemicalName = res.body.data.name;
    createdChemicalIds.push(chemicalId);
  });

  it('moderator can update chemical', async () => {
    currentTestUser = adminUser;

    // Create a fresh chemical scoped to this test so it doesn't share state
    // with the admin-CRUD sequence above.
    const createRes = await apiPost(`${ROUTE_PREFIX}/chemicals`).send({
      name: `${RUN_TAG}_Mod_Update_Source`,
      status: 'Restricted',
    });

    expect(createRes.status).toBe(201);
    const localId = createRes.body.data._id;
    createdChemicalIds.push(localId);

    // Moderator renames it.
    currentTestUser = moderatorUser;
    const updateRes = await apiPut(`${ROUTE_PREFIX}/chemicals/${localId}`).send({
      name: `${RUN_TAG}_Updated_By_Mod`,
      status: 'Banned',
    });

    console.log('UPDATE STATUS:', updateRes.status);
    console.log('UPDATE BODY:', updateRes.body);

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);

    // Verify persisted.
    currentTestUser = adminUser;
    const getRes = await apiGet(`${ROUTE_PREFIX}/chemicals/${localId}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe(`${RUN_TAG}_Updated_By_Mod`);
    expect(getRes.body.data.status).toBe('Banned');

    // Inline cleanup — afterAll is the safety net if this errors.
    await apiDelete(`${ROUTE_PREFIX}/chemicals/${localId}`);
  });

  it('expert cannot delete chemical', async () => {
    currentTestUser = adminUser;

    const createRes = await apiPost(`${ROUTE_PREFIX}/chemicals`).send({
      name: `${RUN_TAG}_Expert_Delete_Attempt`,
      status: 'Restricted',
    });

    expect(createRes.status).toBe(201);
    const localId = createRes.body.data._id;
    createdChemicalIds.push(localId);

    // Expert attempts delete — must be rejected.
    currentTestUser = expertUser;
    const deleteRes = await apiDelete(`${ROUTE_PREFIX}/chemicals/${localId}`);

    console.log('DELETE STATUS:', deleteRes.status);
    console.log('DELETE BODY:', deleteRes.body);

    expect(deleteRes.status).toBe(403);

    // Chemical must still exist.
    currentTestUser = adminUser;
    const getRes = await apiGet(`${ROUTE_PREFIX}/chemicals/${localId}`);

    expect(getRes.status).toBe(200);

    // Inline cleanup — afterAll is the safety net.
    await apiDelete(`${ROUTE_PREFIX}/chemicals/${localId}`);
  });

  it('moderator can delete chemical', async () => {
    currentTestUser = adminUser;

    const createRes = await apiPost(`${ROUTE_PREFIX}/chemicals`).send({
      name: `${RUN_TAG}_Mod_Delete_Target`,
      status: 'Restricted',
    });

    expect(createRes.status).toBe(201);
    const localId = createRes.body.data._id;
    createdChemicalIds.push(localId);

    currentTestUser = moderatorUser;
    const deleteRes = await apiDelete(`${ROUTE_PREFIX}/chemicals/${localId}`);

    console.log('DELETE STATUS:', deleteRes.status);
    console.log('DELETE BODY:', deleteRes.body);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Verify deletion.
    currentTestUser = adminUser;
    const getRes = await apiGet(`${ROUTE_PREFIX}/chemicals/${localId}`);

    expect(getRes.status).toBe(404);
  });
});
