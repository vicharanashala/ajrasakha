/**
 * Audit Trails Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   GET /api/audit-trails                                (admin: all; others: own-scoped)
 *   GET /api/audit-trails/moderator                        (moderator-scoped)
 *   GET /api/audit-trails/shift-based-audit-action-counts
 *   GET /api/audit-trails/question/:questionId
 *
 * The controller carries a class-level `@Authorized()` — every route just needs
 * an authenticated user; `getAllAuditTrails` branches internally on `user.role`
 * for which query it runs (admin sees system-wide, everyone else moderator-scoped)
 * rather than denying access.
 *
 * Every other suite that runs before this one in a full `test:e2e` pass creates
 * plenty of real audit trail rows (Comment, Crop, Request, ... all call
 * `auditTrailsService.createAuditTrail`), so these reads exercise real data even
 * without this suite creating its own fixtures.
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
const INTERNAL_API_KEY = 'e2e-audittrails-key';

let app: express.Express;
let db: any;
let adminUser: any;
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
  [adminUser, moderatorUser] = await Promise.all([
    users.findOne({email: process.env.ADMIN_EMAIL}),
    users.findOne({email: process.env.MODERATOR_EMAIL}),
  ]);
  const missing = [
    !adminUser && `ADMIN_EMAIL=${process.env.ADMIN_EMAIL}`,
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
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

describe('GET /audit-trails', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/audit-trails`);
    expect(res.status).toBe(401);
  });

  it('admin sees the system-wide view', async () => {
    currentTestUser = adminUser;
    const res = await apiGet(`${ROUTE_PREFIX}/audit-trails?page=1&limit=5`);

    console.log('STATUS:', res.status, 'totalDocuments:', res.body.totalDocuments);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('moderator sees a moderator-scoped view (same route, different query)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/audit-trails?page=1&limit=5`);

    console.log('STATUS:', res.status, 'totalDocuments:', res.body.totalDocuments);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /audit-trails/moderator', () => {
  it('returns the moderator-scoped view', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/audit-trails/moderator?page=1&limit=5`);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /audit-trails/shift-based-audit-action-counts', () => {
  it('returns shift-based counts for an admin', async () => {
    currentTestUser = adminUser;
    const res = await apiGet(`${ROUTE_PREFIX}/audit-trails/shift-based-audit-action-counts`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
  });
});

describe('GET /audit-trails/question/:questionId', () => {
  it('returns an empty (not 404) result for a non-existent question', async () => {
    currentTestUser = adminUser;
    const res = await apiGet(`${ROUTE_PREFIX}/audit-trails/question/${new ObjectId().toString()}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.totalDocuments).toBe(0);
  });
});
