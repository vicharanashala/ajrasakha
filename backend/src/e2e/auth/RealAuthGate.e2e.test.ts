/**
 * Real production auth-gate E2E test.
 *
 * WHAT THIS COVERS
 * ----------------
 * Every other e2e suite in this repo (all ~29 of them) builds its
 * `useExpressServer` instance with FAKE `authorizationChecker`/
 * `currentUserChecker` overrides (`async () => !!currentTestUser`) for
 * speed and determinism — see README.md's harness section. That means the
 * REAL production auth-gate functions are essentially never exercised by
 * the rest of the suite:
 *
 *   - `shared/functions/authorizationChecker.ts`
 *   - `shared/functions/currentUserChecker.ts`
 *   - `shared/functions/flexibleAuth.ts` (the Firebase-JWT fallback branch
 *     specifically — its internal-api-key fast path IS covered elsewhere,
 *     since almost every suite authenticates via `x-internal-api-key`)
 *
 * This suite builds its `useExpressServer` app WITHOUT overriding either
 * checker — using the exact same `authorizationChecker`/`currentUserChecker`
 * imports `src/index.ts` wires up for the real server — and drives them
 * with a real Firebase ID token (same `getFirebaseToken` helper the auth
 * suite's `/sync` test already uses against the real Firebase project).
 *
 * NOT covered: the `isBlocked`/`status === 'in-active'` role-specific deny
 * branches inside `authorizationChecker`/`flexibleAuth` — that needs a real
 * Firebase-linked fixture account in a blocked/inactive state, which none
 * of the `.env.test` accounts are. Left as a real gap, not faked.
 *
 * FINDING: `FlexibleAuth`'s Firebase-JWT fallback branch (the `else` half
 * of "accepts either an internal API key or a Firebase JWT") is
 * structurally unreachable in this app's actual configuration. The global
 * `InternalApiAuth` `@Middleware({type:'before'})` runs before ANY
 * route-specific `@UseBefore(FlexibleAuth)` and unconditionally 401s any
 * request missing a valid `x-internal-api-key` — so no request can ever
 * reach `FlexibleAuth` without one, and a present `x-internal-api-key` that
 * doesn't exactly match `FlexibleAuth`'s own comparison 401s inside
 * `FlexibleAuth` itself before the JWT branch runs. In practice, every
 * caller that clears the global gate takes `FlexibleAuth`'s api-key branch,
 * not its JWT branch. This suite documents that rather than asserting a
 * success case that cannot actually happen — see the test below.
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
import {getFirebaseToken} from '../helpers/firebaseAuth.js';

const ROUTE_PREFIX = '/api';
const INTERNAL_API_KEY = 'e2e-real-auth-gate-key';

let app: express.Express;
let db: any;
let moderatorToken: string;

beforeAll(async () => {
  await import('#root/modules/answer/services/AnswerService.js');
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const {loadAppModules, getContainer} = await import('#root/bootstrap/loadModules.js');
  const {GLOBAL_TYPES} = await import('#root/types.js');
  const {authorizationChecker} = await import('#root/shared/functions/authorizationChecker.js');
  const {currentUserChecker} = await import('#root/shared/functions/currentUserChecker.js');

  const {controllers} = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker,
    currentUserChecker,
  });

  moderatorToken = await getFirebaseToken(
    process.env.MODERATOR_EMAIL as string,
    process.env.MODERATOR_PASSWORD as string,
  );
}, 90000);

afterAll(async () => {
  if (db?.disconnect) await db.disconnect();
}, 60000);

describe('Real authorizationChecker + currentUserChecker (no fake override)', () => {
  it('GET /users/me with a real Firebase ID token — real checker chain resolves the moderator user', async () => {
    const res = await request(app)
      .get(`${ROUTE_PREFIX}/users/me`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .set('Authorization', `Bearer ${moderatorToken}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(process.env.MODERATOR_EMAIL);
  }, 20000);

  it('GET /users/me with no Authorization header — real authorizationChecker returns false, real 401', async () => {
    const res = await request(app)
      .get(`${ROUTE_PREFIX}/users/me`)
      .set('x-internal-api-key', INTERNAL_API_KEY);

    console.log('STATUS:', res.status);
    expect(res.status).toBe(401);
  }, 20000);

  it('GET /users/me with a garbage token — real verifyIdToken rejection propagates as an error response', async () => {
    const res = await request(app)
      .get(`${ROUTE_PREFIX}/users/me`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .set('Authorization', 'Bearer not-a-real-firebase-token');

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    // Documenting actual behavior: authorizationChecker's two
    // getCurrentUserFromToken calls are outside its try/catch, so a
    // verifyIdToken rejection propagates as an unhandled error from the
    // checker itself rather than a clean false → 401.
    expect(res.status).toBeGreaterThanOrEqual(400);
  }, 20000);
});

describe('FlexibleAuth — real behavior with the global InternalApiAuth gate in front of it', () => {
  it('a real Firebase Bearer token ALONE (no x-internal-api-key) never reaches FlexibleAuth — the global gate 401s first', async () => {
    const res = await request(app)
      .post(`${ROUTE_PREFIX}/questions`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({
        question: 'should never be created — documents the global-gate finding above',
        priority: 'medium',
        source: 'AJRASAKHA',
        details: {state: 'Punjab', district: 'Ludhiana', crop: 'Wheat', season: 'Rabi', domain: ['Crop Protection']},
      });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(401);
  }, 20000);

  it('a valid x-internal-api-key succeeds via FlexibleAuth\'s api-key branch regardless of any Bearer token present', async () => {
    const RUN_TAG = `E2E_REALAUTH_${Date.now()}`;
    const res = await request(app)
      .post(`${ROUTE_PREFIX}/questions`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({
        question: `${RUN_TAG} real flexible-auth api-key branch`,
        priority: 'medium',
        source: 'AJRASAKHA',
        details: {state: 'Punjab', district: 'Ludhiana', crop: 'Wheat', season: 'Rabi', domain: ['Crop Protection']},
      });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBe(201);

    if (res.body.question_id) {
      // AJRASAKHA goes through the async background pipeline (thread
      // validation etc., same as ajrasakha/AjrasakhaQuestion.e2e.test.ts) —
      // give it a moment before cleanup so nothing is mid-write on disconnect.
      await new Promise(resolve => setTimeout(resolve, 1500));
      const {ObjectId} = await import('mongodb');
      const questionObjId = new ObjectId(res.body.question_id);
      const questions = await db.getCollection('questions');
      const submissions = await db.getCollection('question_submissions');
      await questions.deleteOne({_id: questionObjId}).catch(() => {});
      await submissions.deleteOne({questionId: questionObjId}).catch(() => {});
    }
  }, 30000);

  it('rejects with neither an internal API key nor a Bearer token', async () => {
    const res = await request(app).post(`${ROUTE_PREFIX}/questions`).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a garbage internal API key', async () => {
    const res = await request(app)
      .post(`${ROUTE_PREFIX}/questions`)
      .set('x-internal-api-key', 'not-the-real-key')
      .send({});
    expect(res.status).toBe(401);
  });
});
