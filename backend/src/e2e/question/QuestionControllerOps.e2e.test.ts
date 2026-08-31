/**
 * Question Controller — Internal Ops/Background Routes E2E test.
 *
 * WHAT THIS COVERS
 * ----------------
 * The internal data-repair/ops routes deliberately excluded from
 * `QuestionControllerGaps.e2e.test.ts` (see that file's docblock and
 * README.md's "Missing tests" section) — not because they're unsafe to
 * test, but because they're not real client-facing API surface. Added here
 * specifically to close the gap between route-level coverage (which a test
 * hitting any of these would satisfy) and real *code* coverage — measured
 * via `pnpm run test:e2e:code-coverage` — which was still low for
 * `QuestionMaintenanceService`/`AllocationService` even after the main gap
 * suite existed, because those services' internal branches were never
 * actually exercised.
 *
 *   POST /questions/background/process                  (clears a user's assignedQuestionIds)
 *   POST /questions/background/remove-history-entry
 *   POST /questions/background/remove-queue-entry
 *   POST /questions/background/add-queue-entry
 *   POST /questions/background/add-history-entry
 *   POST /questions/background/normalize-state           (global — see SAFETY note)
 *   POST /questions/background/normalize-district         (global — see SAFETY note)
 *   GET  /questions/background/unknown-geo                (read-only audit)
 *   GET  /questions/queue-details?section=&page=          (paginated single-section variant)
 *   POST /questions/reAllocateLessWorkload                (real logged-in-user path, not just the no-auth crash)
 *
 * SAFETY — `normalize-state` and `normalize-district` operate GLOBALLY
 * across ALL questions matching the given state/district name, not scoped
 * to one question. Both tests below use a RUN_TAG-scoped fake name that
 * cannot possibly match any real question, so `matched`/`modified` is
 * always 0 — this exercises the real validation + query + response-shape
 * code path with zero risk to real data. `background/process` mutates a
 * real user's `assignedQuestionIds`, so it's tested against a throwaway
 * fixture user created for this run, never a shared `.env.test` account.
 *
 * NOT covered here:
 * - `POST /check-overlaps`, `/run-migration`, `/migrate-firebase-users` —
 *   genuinely destructive/staging-DB-dependent, see README.md.
 * - `QuestionService.runAbsentScript()` / `.allocateFeedbackQuestions()` —
 *   these have no HTTP route (only called from `src/bootstrap/jobs/*Cron.ts`)
 *   and were tried as direct DI-container invocations, then REMOVED: unlike
 *   `runGateKeeperAuditorQueueCron()`/`runPaeValidationQueueCron()` (which
 *   `gatekeeper-auditor`/`feedback` call safely), both operate on WHATEVER
 *   real data currently exists across the whole shared Atlas DB, with no
 *   questionId/userId scoping. Running `runAbsentScript()` once during this
 *   file's development genuinely removed real experts from real,
 *   non-fixture question queues, which broke `post-allocation`/
 *   `auto-allocation`'s shared-state assumptions later in the same
 *   sequential suite run (13 and 11 cascading failures). Same risk class as
 *   `check-overlaps`/`run-migration`, just not obvious from the name.
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
const RUN_TAG = `E2E_QOPS_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-question-ops-key';

let app: express.Express;
let db: any;
let moderatorUser: any;
let expertUser: any;

let currentTestUser: any = null;
const createdQuestionIds: string[] = [];
const createdUserIds: ObjectId[] = [];
let opsQuestionId: string;

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

  // Fixture question + a matching submission doc with a real history/queue
  // entry, for the questionId-scoped background routes.
  currentTestUser = moderatorUser;
  const qRes = await request(app)
    .post(`${ROUTE_PREFIX}/questions`)
    .set('x-internal-api-key', INTERNAL_API_KEY)
    .send({
      question: `${RUN_TAG} ops fixture question`,
      priority: 'medium',
      source: 'OUTREACH',
      details: {state: 'Punjab', district: 'Ludhiana', crop: 'Wheat', season: 'Rabi', domain: ['Crop Protection']},
    });
  if (qRes.status !== 201) throw new Error(`Fixture question creation failed: ${qRes.status} ${JSON.stringify(qRes.body)}`);
  opsQuestionId = qRes.body.question_id;
  createdQuestionIds.push(opsQuestionId);

  const submissions = await db.getCollection('question_submissions');
  await submissions.updateOne(
    {questionId: new ObjectId(opsQuestionId)},
    {
      $set: {
        queue: [expertUser._id],
        history: [
          {
            updatedBy: expertUser._id,
            status: 'in-review',
            answer: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    },
    {upsert: true},
  );

  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG} opsQuestionId=${opsQuestionId}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db) {
    const questions = await db.getCollection('questions');
    const submissions = await db.getCollection('question_submissions');
    const users = await db.getCollection('users');
    for (const id of createdQuestionIds) {
      await questions.deleteOne({_id: new ObjectId(id)}).catch(() => {});
      await submissions.deleteOne({questionId: new ObjectId(id)}).catch(() => {});
    }
    for (const id of createdUserIds) {
      await users.deleteOne({_id: id}).catch(() => {});
    }
    console.log(`[teardown] Cleaned up ${createdQuestionIds.length} question(s), ${createdUserIds.length} user(s).`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

// ════════════════════════════════════════════════════════════════════════════
// GET /queue-details?section= (paginated single-section variant)
// ════════════════════════════════════════════════════════════════════════════

describe('GET /questions/queue-details?section=', () => {
  it('returns a single paginated section instead of the full snapshot', async () => {
    currentTestUser = moderatorUser;
    const res = await apiGet(`${ROUTE_PREFIX}/questions/queue-details?section=received&page=1&limit=5`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /reAllocateLessWorkload (real logged-in-user path)
// ════════════════════════════════════════════════════════════════════════════

describe('POST /questions/reAllocateLessWorkload (real path)', () => {
  it('runs for a real logged-in moderator (not just the no-auth crash already covered)', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/questions/reAllocateLessWorkload`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 300));
    expect(res.status).toBeLessThan(500);
  }, 20000);
});

// ════════════════════════════════════════════════════════════════════════════
// Background/ops routes — questionId-scoped (safe: disposable fixture)
// ════════════════════════════════════════════════════════════════════════════

describe('POST /questions/background/remove-history-entry + add-history-entry', () => {
  it('rejects a missing questionId', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/questions/background/remove-history-entry`).send({index: 0});
    expect(res.status).toBe(400);
  });

  it('removes the fixture history entry by index, then adds a fresh one back', async () => {
    const removeRes = await apiPost(`${ROUTE_PREFIX}/questions/background/remove-history-entry`).send({
      questionId: opsQuestionId,
      index: 0,
    });
    console.log('REMOVE STATUS:', removeRes.status, 'BODY:', JSON.stringify(removeRes.body));
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.historyLength).toBe(0);

    const addRes = await apiPost(`${ROUTE_PREFIX}/questions/background/add-history-entry`).send({
      questionId: opsQuestionId,
      entry: {
        updatedBy: expertUser._id.toString(),
        status: 'in-review',
      },
    });
    console.log('ADD STATUS:', addRes.status, 'BODY:', JSON.stringify(addRes.body));
    expect(addRes.status).toBe(200);
    expect(addRes.body.historyLength).toBe(1);
  });
});

describe('POST /questions/background/remove-queue-entry + add-queue-entry', () => {
  it('rejects a missing expertId on add', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/questions/background/add-queue-entry`).send({
      questionId: opsQuestionId,
    });
    expect(res.status).toBe(400);
  });

  it('removes the fixture queue entry by index, then adds it back', async () => {
    const removeRes = await apiPost(`${ROUTE_PREFIX}/questions/background/remove-queue-entry`).send({
      questionId: opsQuestionId,
      index: 0,
    });
    console.log('REMOVE STATUS:', removeRes.status, 'BODY:', JSON.stringify(removeRes.body));
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.queueLength).toBe(0);

    const addRes = await apiPost(`${ROUTE_PREFIX}/questions/background/add-queue-entry`).send({
      questionId: opsQuestionId,
      expertId: expertUser._id.toString(),
    });
    console.log('ADD STATUS:', addRes.status, 'BODY:', JSON.stringify(addRes.body));
    expect(addRes.status).toBe(200);
    expect(addRes.body.queueLength).toBe(1);
  });
});

describe('POST /questions/background/process', () => {
  it('clears a throwaway user\'s assignedQuestionIds', async () => {
    const users = await db.getCollection('users');
    const {insertedId} = await users.insertOne({
      firebaseUID: `${RUN_TAG}_ops_target`,
      email: `${RUN_TAG.toLowerCase()}-ops-target@example.com`,
      firstName: RUN_TAG,
      lastName: 'OpsTarget',
      role: 'moderator',
      isBlocked: false,
      status: 'active',
      assignedQuestionIds: [new ObjectId(opsQuestionId)],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    createdUserIds.push(insertedId);

    const res = await apiPost(`${ROUTE_PREFIX}/questions/background/process`).send({
      userId: insertedId.toString(),
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);

    const updated = await users.findOne({_id: insertedId});
    expect((updated.assignedQuestionIds ?? []).length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Background/ops routes — global operations (safe: RUN_TAG-scoped fake names
// that cannot match any real data, see SAFETY note in the file header)
// ════════════════════════════════════════════════════════════════════════════

describe('POST /questions/background/normalize-state (global — fake name, zero real matches)', () => {
  it('runs safely against a state name that cannot match any real question', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/questions/background/normalize-state`).send({
      current: [`${RUN_TAG}_NoSuchState`],
      standardizedTo: `${RUN_TAG}_StandardState`,
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(0);
    expect(res.body.modified).toBe(0);
  });

  it('rejects an empty current array', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/questions/background/normalize-state`).send({
      current: [],
      standardizedTo: 'X',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /questions/background/normalize-district (global — fake name, zero real matches)', () => {
  it('runs safely against a district name that cannot match any real question', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/questions/background/normalize-district`).send([
      {existingName: `${RUN_TAG}_NoSuchDistrict`, standardiseTo: `${RUN_TAG}_StandardDistrict`},
    ]);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
  });

  it('rejects an empty mappings array', async () => {
    const res = await apiPost(`${ROUTE_PREFIX}/questions/background/normalize-district`).send([]);
    expect(res.status).toBe(400);
  });
});

describe('GET /questions/background/unknown-geo (read-only audit)', () => {
  it('returns the unknown-geo audit shape', async () => {
    const res = await apiGet(`${ROUTE_PREFIX}/questions/background/unknown-geo`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.unknownStates)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// NOT covered here: `runAbsentScript()` / `allocateFeedbackQuestions()` —
// these were tried as direct cron-entry-point invocations (same pattern
// gatekeeper-auditor/feedback suites use for their own cron functions), then
// REMOVED. Unlike `runGateKeeperAuditorQueueCron()`/`runPaeValidationQueueCron()`
// (which those suites call safely), both operate on WHATEVER real, non-fixture
// data currently exists in the whole shared Atlas DB — no questionId/userId
// scoping at all. Running `runAbsentScript()` once during this file's
// development genuinely removed real experts from real (non-fixture)
// question queues ("Removing expert from question ... at index ..." in the
// log, on question ids this suite never created), which then broke
// `post-allocation`/`auto-allocation`'s shared-state assumptions later in
// the same sequential run (13 and 11 cascading failures respectively). This
// is the same category of risk already documented for `check-overlaps`/
// `run-migration` — a real, unscoped, state-mutating operation — just not
// obviously so from the name. Left uncovered rather than run again.
// ════════════════════════════════════════════════════════════════════════════
