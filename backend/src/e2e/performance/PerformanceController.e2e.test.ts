/**
 * Performance Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * All 18 routes are `@Authorized()` only (no role restriction — every
 * authenticated role can call every route; an `isAdmin` flag derived from
 * `user.role === 'admin'` just widens the query scope server-side, it never
 * blocks access). Every route is a read-only analytics/reporting query against
 * real data already in the DB from every other suite that ran before this one.
 *
 *   GET  /api/performance/dashboard
 *   GET  /api/performance/overview
 *   GET  /api/performance/golden-dataset
 *   GET  /api/performance/contribution-trend
 *   GET  /api/performance/status-overview
 *   GET  /api/performance/expert-performance
 *   POST /api/performance/questions-analytics
 *   GET  /api/performance/heatMapofReviewers
 *   GET  /api/performance/workload
 *   GET  /api/performance/level-report                        (startDate/endDate required)
 *   POST /api/performance/check-in
 *   POST /api/performance/cron-snapshot/send-report             (real email — dev short-circuit, see below)
 *   GET  /api/performance/shift-based-metrics                   (startDate/shift required)
 *   GET  /api/performance/shift-based-trends                    (startDate/shift required)
 *   GET  /api/performance/shift-based-status-distribution       (startDate/shift required)
 *   GET  /api/performance/shift-based-level-distribution        (startDate/shift required)
 *   GET  /api/performance/shift-based-top-experts                (startDate/shift required)
 *   GET  /api/performance/shift-based-top-approving-experts      (startDate/shift required)
 *
 * `cron-snapshot/send-report` calls `sendCronSnapshotEmail`, which (like
 * `FirebaseAuthService`) is expected to short-circuit without sending real email
 * in dev — verified by asserting 200 rather than skipping it.
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
const INTERNAL_API_KEY = 'e2e-performance-key';

let app: express.Express;
let db: any;
let adminUser: any;
let moderatorUser: any;

let currentTestUser: any = null;

const today = new Date();
const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const endDate = today.toISOString().slice(0, 10);

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
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

describe('Auth gate (shared across all routes)', () => {
  it('GET /dashboard returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/performance/dashboard`);
    expect(res.status).toBe(401);
  });
});

describe('Simple analytics GETs (200 for both moderator and admin)', () => {
  // Most take no required params; a few have required class-validator query DTOs.
  // Enum-typed query params (union TS types resolve to `Object` design metadata
  // at runtime, so routing-controllers JSON.parses the raw query string instead
  // of treating it as a plain string) need to be sent as JSON-quoted values.
  const currentYear = String(today.getFullYear());
  const currentMonthName = today.toLocaleString('en-US', {month: 'long'});

  const routes: Record<string, string> = {
    '/dashboard':
      `?goldenDataViewType=${encodeURIComponent('"month"')}&goldenDataSelectedYear=${currentYear}&goldenDataSelectedMonth=${currentMonthName}&sourceChartTimeRange=30d&qnAnalyticsType=question`,
    '/overview': '',
    '/golden-dataset': `?viewType=${encodeURIComponent('"year"')}&selectedYear=${currentYear}`,
    '/contribution-trend': '?timeRange=30d',
    '/status-overview': '',
    '/expert-performance': '',
    '/heatMapofReviewers': '',
    '/workload': '',
  };

  for (const [route, qs] of Object.entries(routes)) {
    it(`GET ${route} — moderator`, async () => {
      currentTestUser = moderatorUser;
      const res = await apiGet(`${ROUTE_PREFIX}/performance${route}${qs}`);
      console.log(route, 'STATUS:', res.status);
      expect(res.status).toBe(200);
    }, 15000);

    it(`GET ${route} — admin (wider scope, still just needs auth)`, async () => {
      currentTestUser = adminUser;
      const res = await apiGet(`${ROUTE_PREFIX}/performance${route}${qs}`);
      expect(res.status).toBe(200);
    }, 15000);
  }
});

describe('POST /questions-analytics', () => {
  it('returns 200 for an authenticated user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/performance/questions-analytics`).send({
      startTime: new Date(startDate).toISOString(),
      endTime: new Date(endDate).toISOString(),
      type: 'question',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(200);
  });
});

describe('POST /check-in', () => {
  it('records a check-in for the current user', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/performance/check-in`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /cron-snapshot/send-report', () => {
  it('admin sends a snapshot report (no real email in dev)', async () => {
    currentTestUser = adminUser;
    const res = await apiPost(`${ROUTE_PREFIX}/performance/cron-snapshot/send-report`).send({});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  }, 20000);
});

describe('GET /level-report', () => {
  it('rejects a request missing startDate/endDate', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/performance/level-report`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });

  it('returns a report (xlsx or a "no data" JSON envelope) for a valid range', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(
      `${ROUTE_PREFIX}/performance/level-report?startDate=${startDate}&endDate=${endDate}`,
    );

    console.log('STATUS:', res.status, 'content-type:', res.headers['content-type']);
    expect(res.status).toBe(200);
  }, 20000);
});

describe('Shift-based reports (startDate + shift required)', () => {
  const routes = [
    '/shift-based-metrics',
    '/shift-based-trends',
    '/shift-based-status-distribution',
    '/shift-based-level-distribution',
    '/shift-based-top-experts',
    '/shift-based-top-approving-experts',
  ];

  for (const route of routes) {
    it(`GET ${route} — rejects a request missing startDate/shift`, async () => {
      currentTestUser = moderatorUser;
      const res = await apiGet(`${ROUTE_PREFIX}/performance${route}`);

      console.log(route, 'STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
      expect(res.status).toBe(400);
    });

    it(`GET ${route} — returns a result for a valid range`, async () => {
      currentTestUser = moderatorUser;
      const res = await apiGet(
        `${ROUTE_PREFIX}/performance${route}?startDate=${startDate}&endDate=${endDate}&shift=morning`,
      );

      console.log(route, 'STATUS:', res.status, 'content-type:', res.headers['content-type']);
      expect(res.status).toBe(200);
    }, 20000);
  }
});
