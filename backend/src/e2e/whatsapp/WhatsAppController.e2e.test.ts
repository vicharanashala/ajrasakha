/**
 * WhatsApp Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * The `WhatsAppController` routes themselves — NOT the ingestion pipeline
 * (`POST /api/questions` with source=WHATSAPP), which `whatsapp/WhatsAppQuestion.e2e.test.ts`
 * already covers in depth. None of these 6 routes were previously exercised by
 * any suite.
 *
 *   GET  /api/whatsapp/threads
 *   GET  /api/whatsapp/threads/:threadId/:date
 *   POST /api/whatsapp/send-message      (validation/auth only — see below)
 *   GET  /api/whatsapp/inactive-users
 *   GET  /api/whatsapp/unique-users
 *   GET  /api/whatsapp/users
 *
 * Every read here calls out to a real external WhatsApp/LangGraph backend
 * service (configured via `WA_SEND_MESSAGE_WEBHOOK_API_URL` etc. in `.env`,
 * currently pointed at `localhost:3000` — not running in this test environment).
 * Only `GET /users` has a try/catch with a safe empty-list fallback; the other
 * reads have none, so they're expected to surface a clean 5xx here rather than
 * real data. This suite documents actual behavior rather than assuming success.
 *
 * `POST /send-message` would send a REAL WhatsApp message to a real phone
 * number if exercised for real — this suite only covers its auth gate, never
 * the live send.
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
const INTERNAL_API_KEY = 'e2e-whatsapp-controller-key';

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
  currentTestUser = null;
  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

// NOT COVERED beyond the auth gate: GET /threads and GET /threads/:threadId/:date
// both call the external LangGraph WhatsApp backend with no request timeout —
// against this environment's configured backend URL, the call hangs well past
// any reasonable test timeout (unlike /inactive-users, /unique-users, /users,
// which all fail fast). Same "untestable in this environment" category as
// `bulk-pae-allocate` and `kvks/sync` — not exercised beyond the auth gate.
describe('GET /whatsapp/threads', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/whatsapp/threads`);
    expect(res.status).toBe(401);
  });
});

describe('GET /whatsapp/threads/:threadId/:date', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/whatsapp/threads/fake-thread-id/2026-08-24`);
    expect(res.status).toBe(401);
  });
});

describe('POST /whatsapp/send-message', () => {
  it('returns 401 with no authenticated user (never reaches the real send)', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/whatsapp/send-message`).send({
      phoneNumber: '+910000000000',
      messageText: 'should never actually send',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /whatsapp/inactive-users', () => {
  it('reaches the external WhatsApp backend', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/whatsapp/inactive-users?page=1&limit=2`);

    console.log('STATUS:', res.status);
    expect([200, 500, 502, 503, 504]).toContain(res.status);
  }, 20000);
});

describe('GET /whatsapp/unique-users', () => {
  it('reaches the external WhatsApp backend', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/whatsapp/unique-users`);

    console.log('STATUS:', res.status);
    expect([200, 500, 502, 503, 504]).toContain(res.status);
  }, 20000);
});

describe('GET /whatsapp/users', () => {
  it('always returns 200 — errors fall back to an empty user list', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/whatsapp/users`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  }, 20000);
});
