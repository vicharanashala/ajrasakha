/**
 * Farmer Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   GET    /api/farmer            (list all)
 *   GET    /api/farmer/:phoneNo
 *   POST   /api/farmer             (create)
 *   PUT    /api/farmer/:phoneNo    (update)
 *   DELETE /api/farmer/:phoneNo    (delete)
 *
 * All 5 routes are `@Authorized()` only — no role restriction.
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
const INTERNAL_API_KEY = 'e2e-farmer-key';
const TEST_PHONE_NO = `9990${Date.now().toString().slice(-6)}`;

let app: express.Express;
let db: any;
let moderatorUser: any;

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
  moderatorUser = await users.findOne({email: process.env.MODERATOR_EMAIL});
  if (!moderatorUser) throw new Error(`Test user not found: MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`);
}, 90000);

afterAll(async () => {
  currentTestUser = moderatorUser;
  await request(app)
    .delete(`${ROUTE_PREFIX}/farmer/${TEST_PHONE_NO}`)
    .set('x-internal-api-key', INTERNAL_API_KEY)
    .catch(() => {});
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

describe('GET /farmer', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/farmer`);
    expect(res.status).toBe(401);
  });

  it('lists farmers for an authenticated user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/farmer`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /farmer/:phoneNo', () => {
  // A `null` return with no @OnUndefined/@OnNull override ships as 204 No
  // Content (empty body) rather than 200+null — no NotFoundError is thrown.
  it('returns 204 for a non-existent farmer (no NotFoundError thrown)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/farmer/${TEST_PHONE_NO}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(204);
  });
});

describe('POST /farmer', () => {
  it('creates a farmer profile', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/farmer`).send({
      phoneNo: TEST_PHONE_NO,
      profile: {name: 'E2E Test Farmer', state: 'Punjab', crop: 'Wheat'},
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
  });

  it('the created farmer is now retrievable', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/farmer/${TEST_PHONE_NO}`);

    expect(res.status).toBe(200);
    expect(res.body.phoneNo).toBe(TEST_PHONE_NO);
    expect(res.body.profile.name).toBe('E2E Test Farmer');
  });
});

describe('PUT /farmer/:phoneNo', () => {
  it('updates the farmer profile', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPut(`${ROUTE_PREFIX}/farmer/${TEST_PHONE_NO}`).send({
      profile: {name: 'E2E Test Farmer Updated', state: 'Haryana', crop: 'Rice'},
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body).toBe(true);

    const getRes = await apiGet(`${ROUTE_PREFIX}/farmer/${TEST_PHONE_NO}`);
    expect(getRes.body.profile.name).toBe('E2E Test Farmer Updated');
  });
});

describe('DELETE /farmer/:phoneNo', () => {
  it('deletes the farmer profile', async () => {
    currentTestUser = moderatorUser;
    const res = await apiDelete(`${ROUTE_PREFIX}/farmer/${TEST_PHONE_NO}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body).toBe(true);

    const getRes = await apiGet(`${ROUTE_PREFIX}/farmer/${TEST_PHONE_NO}`);
    expect(getRes.status).toBe(204);
  });
});
