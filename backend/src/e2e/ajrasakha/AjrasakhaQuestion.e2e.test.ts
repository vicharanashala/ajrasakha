/**
 * Ajrasakha (Webapp) Question Ingestion — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * The full backend journey of a question submitted through the Ajrasakha web
 * app (source='AJRASAKHA'), exercised against the REAL Mongo database in `.env`.
 *
 * AJRASAKHA questions enter through the SHARED ingestion endpoint used by all
 * sources — POST /api/questions — but authenticated with a Firebase JWT
 * (Authorization: Bearer <token>) via FlexibleAuth. The userId is taken from
 * @CurrentUser(), NOT from the request body (unlike WhatsApp/internal sources).
 *
 * The pipeline (QuestionService.addQuestion -> processQuestionInBackground):
 *   1. getEmbedding         (AI server)                  ── external, dummied
 *   2. insert question (status='pending') + bare submission  ── real Mongo
 *   3. validateTimeBoundQuestionThread -> getMatchedQuestion
 *        -> fetchWhatsAppMessage (shared with WhatsApp when threadId is set)
 *                                                         ── external, dummied
 *   4. runDuplicateCheckPipeline -> searchGdb             ── external, dummied
 *        - GDB match     => status 'duplicate'
 *        - no GDB match  -> checkConceptDuplicate (LLM)   ── external, mocked
 *              - non-agri  => status 'non_agri'
 *              - agri      => status 'open'
 *   5. when 'open': notify moderators with type 'question_from_ajrasakha'
 *
 * KEY DIFFERENCES FROM WHATSAPP
 * ------------------------------
 * - Auth: Firebase JWT (or internal key for convenience in tests); user is
 *   resolved via @CurrentUser() — userId comes from the authenticated user, not body
 * - source stored as 'AJRASAKHA'
 * - notification type: 'question_from_ajrasakha'
 * - priority forced to 'high'; isAutoAllocate=false (same as WHATSAPP)
 *
 * STRATEGY
 * --------
 * In-process server (same pattern as WhatsAppQuestion.e2e.test.ts and
 * ManualAllocation.e2e.test.ts). A test user (moderator) is fetched from the
 * real DB and injected via a currentUserChecker stub — no Firebase token
 * exchange needed. FlexibleAuth still gates the endpoint via the internal API
 * key header, so 401 auth tests work correctly.
 *
 * All external services are dummied: AiService (CORE_TYPES.AIService) is
 * rebound to a vi.fn() double; checkConceptDuplicate is vi.mock'd at the
 * module level.
 *
 * The WhatsApp test suite already exhaustively covers all GDB/LLM/thread-retry
 * edge cases that are SHARED between AJRASAKHA and WHATSAPP. This suite
 * focuses on:
 *   - Auth failure paths (no token / wrong key)
 *   - AJRASAKHA-specific field values (source, userId, priority, isAutoAllocate,
 *     notification type)
 *   - Representative pipeline outcomes (open, duplicate, non_agri, invalid thread)
 *   - Payload validation
 */

// MongoDB on Atlas (mongodb+srv) requires TLS. MongoDatabase disables TLS when
// NODE_ENV==='test', so force a non-test env BEFORE any module constructs the
// Mongo client. Must run before loadAppModules().
process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
// Load real Atlas DB config first; dotenv won't override it with .env.test values.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.test' });

import express from 'express';
import request from 'supertest';
import { useExpressServer } from 'routing-controllers';
import { ObjectId } from 'mongodb';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from 'vitest';

// LLM duplicate/non-agri classifier — dummied at module level.
// Default: classify as agri (isNonAgri=false). Individual tests override per case.
vi.mock('#root/modules/question/aiservice/checkConceptDuplicate.js', () => ({
  checkConceptDuplicate: vi.fn(async () => ({ isNonAgri: false })),
}));

const INTERNAL_API_KEY = 'e2e-ajrasakha-internal-key';
const ROUTE_PREFIX = '/api';

// Tag so seeded/created docs are trivially identifiable and cleanable.
const RUN_TAG = `E2E_AJ_${Date.now()}`;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

let app: express.Express;
let container: any;
let db: any;

// Swapped per test — currentUserChecker returns this value.
// Simulates a logged-in webapp user without Firebase token exchange.
let currentTestUser: any = null;

// External boundary doubles — same as the WhatsApp suite.
const dummyAi = {
  getEmbedding: vi.fn(async (_text: string) => ({
    embedding: Array.from({ length: 16 }, () => 0.01),
  })),
  // Valid thread response — thread validation passes.
  fetchWhatsAppMessage: vi.fn(async (_threadId: string, _questionId: string) => ({
    messageId: `${RUN_TAG}_msg`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userDetails: {
      username: 'E2E Webapp User',
      email: '',
      emailVerified: false,
      avatar: null,
    },
    content: [{ type: 'human', text: 'paddy leaves turning yellow' }],
  })),
  // Default: no GDB match (NOT-FOUND path). Overridden in FOUND test.
  searchGdb: vi.fn(async (params: any) => ({
    rephrased_query: params.rephrased_query,
    crop: params.crop,
    state: params.state,
    exact_match: null,
    selected_match: null,
  })),
};

let checkConceptDuplicateMock: ReturnType<typeof vi.fn>;

/** Track everything we create so the real DB is left clean. */
const createdQuestionIds: string[] = [];

function ajrasakhaPayload(overrides: Record<string, any> = {}) {
  return {
    question: `${RUN_TAG} My paddy crop leaves are turning yellow, what should I do?`,
    source: 'AJRASAKHA',
    threadId: `${RUN_TAG}_thread`,
    details: {
      state: 'Punjab',
      district: 'Ludhiana',
      crop: 'Paddy',
      season: 'Kharif',
      domain: 'Crop Protection',
    },
    ...overrides,
  };
}

/** Submit a question through the ingestion endpoint with the internal key. */
async function submitQuestion(payload: Record<string, any>) {
  return request(app)
    .post(`${ROUTE_PREFIX}/questions`)
    .set('x-internal-api-key', INTERNAL_API_KEY)
    .send(payload);
}

/** Poll the questions collection until `predicate` holds or we time out. */
async function waitForQuestion(
  questionId: string,
  predicate: (doc: any) => boolean,
  { timeoutMs = 40000, intervalMs = 750 } = {},
): Promise<any> {
  const collection = await db.getCollection('questions');
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await collection.findOne({ _id: new ObjectId(questionId) });
    if (last && predicate(last)) return last;
    await sleep(intervalMs);
  }
  throw new Error(
    `Timed out waiting for question ${questionId}. Last status='${last?.status}', isTesting=${last?.isTesting}`,
  );
}

beforeAll(async () => {
  // Warm-up: resolves the circular import that leaves CORE_TYPES undefined when
  // AnswerService is reached via the core barrel during loadAppModules.
  await import('#root/modules/answer/services/AnswerService.js');

  const { loadAppModules, getContainer } = await import(
    '#root/bootstrap/loadModules.js'
  );
  const { CORE_TYPES } = await import('#root/modules/core/types.js');
  const { GLOBAL_TYPES } = await import('#root/types.js');
  const { appConfig } = await import('#root/config/app.js');

  appConfig.ENABLE_AI_SERVER = true;
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const { controllers } = await loadAppModules('all');
  container = getContainer();

  // Replace the only external seam with our double.
  container.rebindSync(CORE_TYPES.AIService).toConstantValue(dummyAi);

  const mod = await import(
    '#root/modules/question/aiservice/checkConceptDuplicate.js'
  );
  checkConceptDuplicateMock =
    mod.checkConceptDuplicate as unknown as ReturnType<typeof vi.fn>;

  db = container.get(GLOBAL_TYPES.Database);

  // Fetch a real non-tester user from the DB to use as the authenticated webapp user.
  const users = await db.getCollection('users');
  const moderatorUser = await users.findOne({
    email: process.env.MODERATOR_EMAIL,
  });
  if (!moderatorUser) {
    throw new Error(
      `Test user not found — ensure ${process.env.MODERATOR_EMAIL} exists in the DB`,
    );
  }
  currentTestUser = moderatorUser;

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    // FlexibleAuth gates the endpoint via headers. currentUserChecker/
    // authorizationChecker are called after FlexibleAuth passes — we control
    // the returned user to simulate a logged-in webapp user.
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  const questions = await db.getCollection('questions');
  await questions.estimatedDocumentCount();
  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG}. User=${moderatorUser.email}`);
}, 90000);

afterEach(() => {
  vi.clearAllMocks();
  checkConceptDuplicateMock.mockResolvedValue({ isNonAgri: false });
  dummyAi.searchGdb.mockResolvedValue({
    rephrased_query: '',
    crop: '',
    state: '',
    exact_match: null,
    selected_match: null,
  });
  dummyAi.fetchWhatsAppMessage.mockResolvedValue({
    messageId: `${RUN_TAG}_msg`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userDetails: {
      username: 'E2E Webapp User',
      email: '',
      emailVerified: false,
      avatar: null,
    },
    content: [{ type: 'human', text: 'paddy leaves turning yellow' }],
  });
});

afterAll(async () => {
  if (db && createdQuestionIds.length) {
    const oids = createdQuestionIds.map(id => new ObjectId(id));
    const [questions, submissions, notifications, duplicates] = await Promise.all([
      db.getCollection('questions'),
      db.getCollection('question_submissions'),
      db.getCollection('notifications'),
      db.getCollection('duplicate_questions'),
    ]);
    await Promise.all([
      questions.deleteMany({ _id: { $in: oids } }),
      submissions.deleteMany({ questionId: { $in: oids } }),
      notifications.deleteMany({ enitity_id: { $in: oids } }),
      duplicates.deleteMany({ question: { $regex: RUN_TAG } }),
    ]);
    console.log(`[teardown] Cleaned ${createdQuestionIds.length} question(s).`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

// ───────────────────────── AUTH ─────────────────────────
//
// FlexibleAuth gates POST /questions. It accepts either a valid internal API
// key (x-internal-api-key) or a valid Firebase JWT. Both missing or wrong →
// 401 before the handler is ever called.
describe('Ajrasakha ingestion — authentication (FlexibleAuth)', () => {
  it('rejects ingestion when no auth header is provided', async () => {
    const res = await request(app)
      .post(`${ROUTE_PREFIX}/questions`)
      .send(ajrasakhaPayload());

    console.log('NO-AUTH STATUS:', res.status);
    expect(res.status).toBe(401);
  });

  it('rejects ingestion when an incorrect internal API key is provided', async () => {
    const res = await request(app)
      .post(`${ROUTE_PREFIX}/questions`)
      .set('x-internal-api-key', 'wrong-key')
      .send(ajrasakhaPayload());

    console.log('BAD-KEY STATUS:', res.status);
    expect(res.status).toBe(401);
  });
});

// ───────────────────────── HAPPY PATH ─────────────────────────
//
// An AJRASAKHA question submitted by an authenticated webapp user:
//   - thread validates (fetchWhatsAppMessage succeeds)
//   - GDB returns no match, LLM says agricultural → status 'open'
// Verifies all AJRASAKHA-specific field values and that the question's userId
// is taken from the authenticated @CurrentUser(), not from the request body.
describe('Ajrasakha ingestion — happy path (open, agri, thread valid)', () => {
  it('creates an open question attributed to the authenticated user with AJRASAKHA-specific fields', async () => {
    const res = await submitQuestion(ajrasakhaPayload());
    console.log('HAPPY SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.question_id).toBeDefined();

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    // Background pipeline: thread valid (fetchWhatsAppMessage succeeds),
    // no GDB match, LLM says agri → open.
    // We wait for the terminal status first, THEN verify static fields —
    // background processing via setImmediate can complete before a DB read
    // returns, so asserting status='pending' on the initial read is a race.
    const doc = await waitForQuestion(questionId, d => d.status === 'open');
    console.log('HAPPY FINAL DOC:', {
      status: doc.status,
      source: doc.source,
      priority: doc.priority,
      isAutoAllocate: doc.isAutoAllocate,
      userId: doc.userId?.toString(),
    });

    expect(doc.status).toBe('open');
    expect(doc.source).toBe('AJRASAKHA');
    expect(doc.priority).toBe('high');
    expect(doc.isAutoAllocate).toBe(false);
    expect(doc.userId?.toString()).toBe(currentTestUser._id.toString());
    expect(dummyAi.fetchWhatsAppMessage).toHaveBeenCalled();
    expect(dummyAi.searchGdb).toHaveBeenCalled();
    expect(checkConceptDuplicateMock).toHaveBeenCalled();

    // Moderator notifications should use the Ajrasakha-specific type.
    // Notifications are written after the status update in the same async
    // chain, so poll briefly until one appears.
    const notifications = await db.getCollection('notifications');
    const deadline = Date.now() + 5000;
    let notif: any = null;
    while (Date.now() < deadline) {
      notif = await notifications.findOne({
        enitity_id: new ObjectId(questionId),
        type: 'question_from_ajrasakha',
      });
      if (notif) break;
      await sleep(300);
    }
    expect(notif).not.toBeNull();
  }, 90000);
});

// ───────────────────────── FOUND (DUPLICATE) ─────────────────────────
describe('Ajrasakha ingestion — question FOUND (GDB exact match → duplicate)', () => {
  it('marks the question as duplicate and records the reference', async () => {
    const referenceQuestionId = new ObjectId();

    dummyAi.searchGdb.mockResolvedValueOnce({
      rephrased_query: 'paddy yellow leaves',
      crop: 'Paddy',
      state: 'Punjab',
      exact_match: {
        question_id: referenceQuestionId.toString(),
        similarity_score: 0.96,
        question: `${RUN_TAG} existing answered paddy question`,
        answer: 'Apply nitrogen; check for zinc deficiency.',
      },
      selected_match: null,
    });

    const res = await submitQuestion(ajrasakhaPayload());
    console.log('FOUND SUBMIT STATUS:', res.status);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(
      questionId,
      d => d.status === 'duplicate' || d.isTesting === true,
    );
    console.log('FOUND FINAL DOC:', {
      status: doc.status,
      isExact: doc.isExact,
      referenceQuestionId: doc.referenceQuestionId?.toString?.(),
    });

    expect(doc.status).toBe('duplicate');
    expect(doc.isExact).toBe(true);
    expect(doc.referenceQuestionId?.toString()).toBe(referenceQuestionId.toString());
    expect(checkConceptDuplicateMock).not.toHaveBeenCalled();
  }, 90000);
});

// ───────────────────────── NON-AGRICULTURAL ─────────────────────────
describe('Ajrasakha ingestion — non-agricultural question (LLM filter)', () => {
  it('marks the question as non_agri when the LLM classifies it as non-agri', async () => {
    checkConceptDuplicateMock.mockResolvedValue({ isNonAgri: true });

    const res = await submitQuestion(
      ajrasakhaPayload({
        question: `${RUN_TAG} What is the capital of France?`,
      }),
    );
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(questionId, d => d.status === 'non_agri');
    console.log('NON_AGRI FINAL DOC status:', doc.status);

    expect(doc.status).toBe('non_agri');
    expect(checkConceptDuplicateMock).toHaveBeenCalled();
  }, 90000);
});

// ───────────────────────── INVALID PAYLOAD ─────────────────────────
//
// addQuestion validates required detail fields before doing any DB write.
// A missing district triggers the class-validator on QuestionDetailsDto → 400.
describe('Ajrasakha ingestion — invalid payload (missing required detail field)', () => {
  it('rejects with 400 when a required detail field (district) is missing', async () => {
    const res = await submitQuestion(
      ajrasakhaPayload({
        details: {
          state: 'Punjab',
          // district intentionally omitted
          crop: 'Paddy',
          season: 'Kharif',
          domain: 'Crop Protection',
        },
      }),
    );
    console.log('BAD-PAYLOAD STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(400);
    // Guard fires before insert — nothing to clean up.
  });
});

// Empty question text — KNOWN BUG: QuestionService.addQuestion throws
// BadRequestError for empty question, but the outer catch wraps it in
// InternalServerError → controller returns 500 instead of 400. See WhatsApp
// test BUG-001 for the full analysis. The assertion below documents current
// behaviour; fix is: re-throw HttpErrors as-is in the addQuestion catch block.
describe('Ajrasakha ingestion — invalid payload (empty question text)', () => {
  it('rejects when the question text is empty [KNOWN BUG: returns 500 instead of 400]', async () => {
    const res = await submitQuestion(ajrasakhaPayload({ question: '' }));
    console.log('EMPTY-QUESTION STATUS:', res.status, 'BODY:', res.body);
    // BUG: should be 400, currently returns 500.
    expect(res.status).toBe(500);
    // Guard fires before insert — nothing to clean up.
  });
});

// ───────────────────────── THREAD VALIDATION ─────────────────────────
//
// AJRASAKHA questions are time-bound: validateTimeBoundQuestionThread is called
// before the duplicate pipeline. An empty threadId short-circuits immediately
// (THREAD_ID_MISSING) — no API call, question flagged isTesting=true.
describe('Ajrasakha ingestion — invalid thread (empty threadId → isTesting)', () => {
  it('flags the question isTesting=true when threadId is empty, before any pipeline step', async () => {
    const res = await submitQuestion(ajrasakhaPayload({ threadId: '' }));
    console.log('THREAD-INVALID SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(questionId, d => d.isTesting === true);
    console.log('THREAD-INVALID FINAL DOC:', {
      status: doc.status,
      isTesting: doc.isTesting,
    });

    expect(doc.isTesting).toBe(true);
    expect(doc.status).toBe('pending');
    expect(dummyAi.fetchWhatsAppMessage).not.toHaveBeenCalled();
    expect(dummyAi.searchGdb).not.toHaveBeenCalled();
    expect(checkConceptDuplicateMock).not.toHaveBeenCalled();
  }, 90000);
});

// ─────────────── DEGRADATION: LLM failure degrades gracefully ───────────────
//
// When GDB finds no match and the LLM non-agri classifier throws, the pipeline
// catch (QuestionService.ts processQuestionInBackground) treats the question as
// agricultural → status 'open'. Mirrors the WhatsApp degradation test.
describe('Ajrasakha ingestion — LLM failure degrades gracefully to open', () => {
  it('still opens the question when the non-agri classifier throws', async () => {
    checkConceptDuplicateMock.mockRejectedValue(new Error('LLM upstream 503'));

    const res = await submitQuestion(ajrasakhaPayload());
    console.log('LLM-FAIL SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(questionId, d => d.status === 'open');
    console.log('LLM-FAIL FINAL DOC status:', doc.status);

    expect(doc.status).toBe('open');
    expect(dummyAi.searchGdb).toHaveBeenCalled();
    expect(checkConceptDuplicateMock).toHaveBeenCalled();
  }, 90000);
});
