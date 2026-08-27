/**
 * Context Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   POST /api/context               (create context from transcript text)
 *   POST /api/context/translate     (real Sarvam translation API call)
 *   POST /api/context/speech-to-text (proxies an uploaded file to Sarvam STT)
 *
 * `speech-to-text`'s happy path needs a real audio file and a real Sarvam STT
 * call — out of scope for this pass. Only its auth gate is covered here,
 * matching the "untestable in this environment" pattern used elsewhere
 * (`bulk-pae-allocate`, `signup/google`).
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
const RUN_TAG = `E2E_CONTEXT_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-context-key';

let app: express.Express;
let db: any;
let moderatorUser: any;

let currentTestUser: any = null;
const createdContextIds: string[] = [];

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

  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db && createdContextIds.length) {
    const contexts = await db.getCollection('contexts');
    for (const id of createdContextIds) {
      await contexts.deleteOne({_id: new ObjectId(id)}).catch(() => {});
    }
    console.log(`[teardown] Cleaned up ${createdContextIds.length} context doc(s).`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

describe('POST /context', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/context`).send({transcript: 'hello'});
    expect(res.status).toBe(401);
  });

  it('creates a context from transcript text', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/context`).send({
      transcript: `${RUN_TAG} — sample call transcript text`,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    expect(res.body.insertedId).toBeTruthy();
    createdContextIds.push(res.body.insertedId);
  });

  // BUG-020: ContextService.addContext throws BadRequestError for an empty
  // transcript, but that throw happens INSIDE the same try block whose catch
  // rewraps everything as InternalServerError — same shape as BUG-001
  // (WhatsApp/AjraSakha ingestion). Empty transcript 500s instead of 400ing.
  it('BUG-020: empty transcript 500s instead of 400ing (BadRequestError caught and rewrapped)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/context`).send({transcript: ''});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(500);
  });
});

describe('POST /context/translate', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/context/translate`).send({
      text: 'hello',
      targetLang: 'hi-IN',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a request missing text', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/context/translate`).send({targetLang: 'hi-IN'});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });

  it('rejects a request missing targetLang', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/context/translate`).send({text: 'hello'});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });

  // ENVIRONMENT ISSUE (not asserted as a code bug): SARVAM_API_KEY in .env is
  // rejected by Sarvam's API ("Invalid or missing authentication credentials")
  // in this environment. The request/response wiring up to that point is
  // exercised and correct — only the live credential is the blocker here.
  it('ENV ISSUE: SARVAM_API_KEY is rejected by Sarvam in this environment — 500 instead of a translated string', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/context/translate`).send({
      text: 'Hello, how are you?',
      targetLang: 'hi-IN',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Sarvam API error|Invalid or missing authentication/i);
  }, 30000);
});

describe('POST /context/speech-to-text', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiPost(`${ROUTE_PREFIX}/context/speech-to-text`);
    expect(res.status).toBe(401);
  });

  it('errors with no file attached (happy path needs a real audio file + live Sarvam STT call — out of scope here)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/context/speech-to-text`).field('language', 'en-IN');

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
