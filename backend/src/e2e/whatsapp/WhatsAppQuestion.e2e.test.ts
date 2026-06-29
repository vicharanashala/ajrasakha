/**
 * WhatsApp Question Ingestion — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * The full backend journey of a question that arrives from WhatsApp, exercised
 * against the REAL Mongo database configured in `.env` (DB_URL / DB_NAME).
 *
 * WhatsApp questions do NOT go through WhatsAppController (that is read-only:
 * threads / users). They enter through the SHARED ingestion endpoint that every
 * source uses — POST /api/questions — authenticated with the internal API key
 * (x-internal-api-key) via FlexibleAuth, and differentiated only by `source`.
 *
 * The pipeline (QuestionService.addQuestion -> processQuestionInBackground):
 *   1. getEmbedding            (AI server)            ── external, dummied
 *   2. insert question (status='pending') + bare submission   ── real Mongo
 *   3. validateTimeBoundQuestionThread -> fetchWhatsAppMessage (WhatsApp server)
 *                                                       ── external, dummied
 *   4. runDuplicateCheckPipeline -> searchGdb (GDB server)
 *                                                       ── external, dummied
 *        - GDB match            => status 'duplicate' + reference recorded   (FOUND path)
 *        - no GDB match -> checkConceptDuplicate (LLM) ── external, dummied
 *              - non-agri       => status 'non_agri'
 *              - agri           => status 'open'                              (NOT-FOUND path)
 *   5. when 'open': notify moderators; expert allocation is done by the
 *      time-bound cron -> reallocateTimeBoundQuestions()  (the COMMON path).
 *
 * STRATEGY
 * --------
 * Per the testing guidelines, every API/service that lives OUTSIDE the backend
 * is dummied. The single external seam is `AiService` (CORE_TYPES.AIService),
 * which owns every outbound HTTP call (getEmbedding / fetchWhatsAppMessage /
 * searchGdb), plus the `checkConceptDuplicate` LLM helper which we vi.mock.
 *
 * Everything else — QuestionService, every repository, the Mongo transaction,
 * notifications and the allocation cron logic — runs for real against the DB in
 * `.env`. The app is built in-process from the production DI container
 * (loadAppModules('all')), so the wiring under test is the real wiring.
 *
 * The background processing kicks off via setImmediate, so each test SUBMITS
 * then POLLS the `questions` collection until the terminal status is reached.
 */

// ── Mongo on Atlas (mongodb+srv) requires TLS. MongoDatabase disables TLS when
//    NODE_ENV==='test' (which vitest sets), so force a non-test env BEFORE any
//    module constructs the Mongo client. Must run before loadAppModules().
process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

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

// LLM duplicate/non-agri classifier — external boundary, dummied at the module level.
// Default: classify as agri (isNonAgri=false). Individual tests override per case.
vi.mock('#root/modules/question/aiservice/checkConceptDuplicate.js', () => ({
  checkConceptDuplicate: vi.fn(async () => ({ isNonAgri: false })),
}));

const INTERNAL_API_KEY = 'e2e-whatsapp-internal-key';
const ROUTE_PREFIX = '/api';

// Tag so seeded/created docs are trivially identifiable and cleanable.
const RUN_TAG = `E2E_WA_${Date.now()}`;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

let app: express.Express;
let container: any;
let db: any;

// External boundary doubles. Each test sets the return values it needs.
const dummyAi = {
  getEmbedding: vi.fn(async (_text: string) => ({
    embedding: Array.from({ length: 16 }, () => 0.01),
  })),
  // Valid WhatsApp message => thread validation passes (question is "real").
  fetchWhatsAppMessage: vi.fn(async (_threadId: string, _questionId: string) => ({
    messageId: `${RUN_TAG}_msg`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userDetails: {
      username: 'E2E Farmer',
      email: '',
      emailVerified: false,
      avatar: null,
    },
    content: [{ type: 'human', text: 'paddy leaves turning yellow' }],
  })),
  // Default: no golden-dataset match (NOT-FOUND path). Overridden in FOUND test.
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

function whatsAppPayload(overrides: Record<string, any> = {}) {
  return {
    question: `${RUN_TAG} My paddy crop leaves are turning yellow, what should I do?`,
    source: 'WHATSAPP',
    threadId: `${RUN_TAG}_thread`,
    messageId: `${RUN_TAG}_msg`,
    userId: new ObjectId().toString(),
    details: {
      state: 'Punjab',
      district: 'Ludhiana',
      crop: 'Paddy',
      season: 'Kharif',
      domain: ['Crop Protection'],
    },
    ...overrides,
  };
}

/** Submit a question through the real ingestion endpoint with the internal key. */
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

// Drains the background pipeline's FINAL step (moderator notifications) before
// teardown. processQuestionInBackground sets status='open' and THEN writes
// notifications in the same async chain (QuestionService.ts:1555-1576); the
// duplicate / non_agri / isTesting branches return BEFORE that block, so only
// 'open' questions notify. Most open-path tests assert as soon as status flips
// to 'open' and return, leaving that write in flight. It then races afterAll's
// db.disconnect() and logs a swallowed "Cannot read properties of null
// (reading 'collection')". Waiting here (before the deletes, so a late write
// can't orphan a notification row) makes teardown deterministic.
async function drainOpenQuestionNotifications(
  questionIds: string[],
  { timeoutMs = 5000, intervalMs = 300 } = {},
): Promise<void> {
  const [questions, notifications] = await Promise.all([
    db.getCollection('questions'),
    db.getCollection('notifications'),
  ]);
  for (const id of questionIds) {
    const q = await questions.findOne({ _id: new ObjectId(id) });
    if (q?.status !== 'open') continue; // only 'open' questions reach the notify step
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const notif = await notifications.findOne({
        enitity_id: new ObjectId(id),
        type: 'question_from_whatsapp',
      });
      if (notif) break;
      await sleep(intervalMs);
    }
  }
}

beforeAll(async () => {
  // Warm-up: AnswerService imports CORE_TYPES from the core *barrel*
  // (#root/modules/core/index.js), which re-exports CORE_TYPES only on its last
  // line. The barrel -> container -> AnswerService -> barrel cycle leaves
  // CORE_TYPES undefined when AnswerService is reached *through* the barrel
  // (as loadAppModules does). Importing AnswerService FIRST lets the barrel run
  // to completion (populating CORE_TYPES) before AnswerService's decorators run.
  await import('#root/modules/answer/services/AnswerService.js');

  // Build the production DI container against the real DB, then swap the
  // external Ai boundary for our double. Dynamic imports run AFTER dotenv +
  // NODE_ENV are set, so config/db read the right values.
  const { loadAppModules, getContainer } = await import(
    '#root/bootstrap/loadModules.js'
  );
  const { CORE_TYPES } = await import('#root/modules/core/types.js');
  const { GLOBAL_TYPES } = await import('#root/types.js');
  const { appConfig } = await import('#root/config/app.js');

  // Exercise the embedding step (gated by this flag); the dummy answers it.
  appConfig.ENABLE_AI_SERVER = true;
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const { controllers } = await loadAppModules('all');
  container = getContainer();

  // Replace the ONLY external seam with our dummy.
  container.rebindSync(CORE_TYPES.AIService).toConstantValue(dummyAi);

  const mod = await import('#root/modules/question/aiservice/checkConceptDuplicate.js');
  checkConceptDuplicateMock = mod.checkConceptDuplicate as unknown as ReturnType<typeof vi.fn>;

  db = container.get(GLOBAL_TYPES.Database);

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    // WhatsApp ingestion authenticates via FlexibleAuth (internal key), but the
    // route still resolves @CurrentUser/@Authorized — provide permissive stubs.
    authorizationChecker: async () => true,
    currentUserChecker: async () => null,
  });

  // Sanity: confirm we can reach the real DB before running cases.
  const questions = await db.getCollection('questions');
  await questions.estimatedDocumentCount();
  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG}`);
}, 90000);

afterEach(() => {
  vi.clearAllMocks();
  // Restore default external behaviours after a test overrode them.
  checkConceptDuplicateMock.mockResolvedValue({ isNonAgri: false });
  dummyAi.searchGdb.mockResolvedValue({
    rephrased_query: '',
    crop: '',
    state: '',
    exact_match: null,
    selected_match: null,
  });
  // Restore fetchWhatsAppMessage — some tests override it to throw, and
  // vi.clearAllMocks() only clears call records, NOT the implementation.
  dummyAi.fetchWhatsAppMessage.mockResolvedValue({
    messageId: `${RUN_TAG}_msg`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userDetails: {
      username: 'E2E Farmer',
      email: '',
      emailVerified: false,
      avatar: null,
    },
    content: [{ type: 'human', text: 'paddy leaves turning yellow' }],
  });
});

afterAll(async () => {
  // Remove everything this run wrote to the real DB.
  if (db && createdQuestionIds.length) {
    // Let any in-flight background notification writes finish before we delete
    // and disconnect, so they don't race the disconnect or orphan a row.
    await drainOpenQuestionNotifications(createdQuestionIds);

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
describe('WhatsApp ingestion — authentication (FlexibleAuth / internal key)', () => {
  it('rejects ingestion without the internal API key', async () => {
    const res = await request(app)
      .post(`${ROUTE_PREFIX}/questions`)
      .send(whatsAppPayload());

    console.log('NO-KEY STATUS:', res.status);
    expect(res.status).toBe(401);
  });

  it('rejects ingestion with a wrong internal API key', async () => {
    const res = await request(app)
      .post(`${ROUTE_PREFIX}/questions`)
      .set('x-internal-api-key', 'wrong-key')
      .send(whatsAppPayload());

    console.log('BAD-KEY STATUS:', res.status);
    expect(res.status).toBe(401);
  });
});

// ───────────────── INVALID PAYLOAD: missing a required detail field → 400 ─────────────────
//
// Note: AddQuestionBodyDto fields are all @IsOptional, so this 400 does NOT come
// from class-validator — it comes from QuestionService.addQuestion's own guard
// (`All fields are required`, QuestionService.ts:1169), rethrown as a 400 by the
// controller. The throw happens BEFORE any DB insert, so nothing is persisted.
describe('WhatsApp ingestion — invalid payload (missing required detail field)', () => {
  it('rejects with 400 when a required detail field (district) is missing', async () => {
    const res = await submitQuestion(
      whatsAppPayload({
        // district intentionally omitted → addQuestion throws "All fields are required"
        details: {
          state: 'Punjab',
          crop: 'Paddy',
          season: 'Kharif',
          domain: ['Crop Protection'],
        },
      }),
    );
    console.log('BAD-PAYLOAD STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(400);
    // No question created (guard fires before insert) → nothing to clean up.
  });
});

// ─────────────────── FOUND: question matches the golden dataset ───────────────────
describe('WhatsApp ingestion — question FOUND (GDB duplicate, reference answer linked)', () => {
  it('marks the question as duplicate and records the reference question', async () => {
    const referenceQuestionId = new ObjectId();
    const referenceQuestionText = `${RUN_TAG} existing answered paddy question`;

    // The GDB (golden dataset) returns an exact match => the answer already exists.
    dummyAi.searchGdb.mockResolvedValueOnce({
      rephrased_query: 'paddy yellow leaves',
      crop: 'Paddy',
      state: 'Punjab',
      exact_match: {
        question_id: referenceQuestionId.toString(),
        similarity_score: 0.97,
        question: referenceQuestionText,
        answer: 'Apply nitrogen; check for zinc deficiency.',
      },
      selected_match: null,
    });

    const res = await submitQuestion(whatsAppPayload());
    console.log('FOUND SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.question_id).toBeDefined();

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    // getEmbedding runs synchronously inside addQuestion (before the response).
    expect(dummyAi.getEmbedding).toHaveBeenCalled();

    const doc = await waitForQuestion(
      questionId,
      d => d.status === 'duplicate' || d.isTesting === true,
    );

    // Thread validation + GDB search happen in background processing, so assert
    // them only after the terminal status has been reached.
    expect(dummyAi.fetchWhatsAppMessage).toHaveBeenCalled();

    console.log('FOUND FINAL DOC:', {
      status: doc.status,
      similarityScore: doc.similarityScore,
      isExact: doc.isExact,
      referenceQuestionId: doc.referenceQuestionId?.toString?.(),
    });

    expect(dummyAi.searchGdb).toHaveBeenCalled();
    expect(doc.status).toBe('duplicate');
    expect(doc.isExact).toBe(true);
    expect(doc.similarityScore).toBeCloseTo(97, 0);
    expect(doc.referenceQuestionId?.toString()).toBe(referenceQuestionId.toString());
    expect(doc.referenceQuestion).toBe(referenceQuestionText);
    // LLM is only consulted when GDB has no match — not on the FOUND path.
    expect(checkConceptDuplicateMock).not.toHaveBeenCalled();
  }, 90000);
});

// ───── SIMILAR: no exact GDB match, but a reviewer-curated `selected_match` ─────
//
// The second duplicate mechanism. runDuplicateCheckPipeline checks exact_match
// first (above), then selected_match (QuestionService.ts:1079). A selected_match
// yields status='duplicate' with isExact=FALSE and referenceSource='reviewer'.
// This short-circuits BEFORE the LLM is consulted, just like the exact path.
describe('WhatsApp ingestion — question SIMILAR (GDB selected_match, non-exact duplicate)', () => {
  it('marks the question as duplicate with isExact=false and a reviewer reference', async () => {
    const referenceQuestionId = new ObjectId();
    const referenceQuestionText = `${RUN_TAG} reviewer-curated similar paddy question`;

    // No exact match, but the golden dataset offers a reviewer-selected close match.
    dummyAi.searchGdb.mockResolvedValueOnce({
      rephrased_query: 'paddy yellow leaves',
      crop: 'Paddy',
      state: 'Punjab',
      exact_match: null,
      selected_match: {
        question_id: referenceQuestionId.toString(),
        similarity_score: 0.88,
        question: referenceQuestionText,
        answer: 'Side-dress nitrogen; verify zinc levels.',
      },
    });

    const res = await submitQuestion(whatsAppPayload());
    console.log('SIMILAR SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(
      questionId,
      d => d.status === 'duplicate' || d.isTesting === true,
    );
    console.log('SIMILAR FINAL DOC:', {
      status: doc.status,
      isExact: doc.isExact,
      similarityScore: doc.similarityScore,
      referenceSource: doc.referenceSource,
    });

    expect(dummyAi.searchGdb).toHaveBeenCalled();
    expect(doc.status).toBe('duplicate');
    expect(doc.isExact).toBe(false); // selected_match is a non-exact match
    expect(doc.similarityScore).toBeCloseTo(88, 0);
    expect(doc.referenceQuestionId?.toString()).toBe(referenceQuestionId.toString());
    expect(doc.referenceQuestion).toBe(referenceQuestionText);
    expect(doc.referenceSource).toBe('reviewer');
    // selected_match resolves before the LLM is reached.
    expect(checkConceptDuplicateMock).not.toHaveBeenCalled();
  }, 90000);
});

// ───────── NOT FOUND: no golden match, classified agri -> open (hand-off boundary) ─────────
//
// SCOPE: this test stops at the boundary where the WhatsApp-specific flow ends
// and the COMMON pipeline begins — i.e. status='open' + a submission row exists
// + moderators are notified. Expert ALLOCATION (reallocateTimeBoundQuestions,
// cron-driven) is intentionally NOT tested here: it is shared by every
// time-bound source (WHATSAPP/AJRASAKHA) and belongs in a dedicated common-path
// test, not in a per-source suite.
describe('WhatsApp ingestion — question NOT FOUND (common pipeline -> open)', () => {
  it('opens the question and creates an unallocated submission (hand-off to common pipeline)', async () => {
    // No GDB match (default) and LLM says it IS agricultural => status 'open'.
    checkConceptDuplicateMock.mockResolvedValue({ isNonAgri: false });

    const res = await submitQuestion(whatsAppPayload());
    console.log('OPEN SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    // Initial state for a WhatsApp question is time-bound: pending/high/no-auto-allocate.
    const submissions = await db.getCollection('question_submissions');
    const initialSubmission = await submissions.findOne({
      questionId: new ObjectId(questionId),
    });
    expect(initialSubmission).not.toBeNull();
    expect(initialSubmission.queue).toEqual([]);

    // Background pipeline drives it to 'open' (no duplicate, agri).
    const doc = await waitForQuestion(questionId, d => d.status === 'open');
    console.log('OPEN FINAL DOC:', {
      status: doc.status,
      priority: doc.priority,
      isAutoAllocate: doc.isAutoAllocate,
      source: doc.source,
    });

    expect(doc.source).toBe('WHATSAPP');
    expect(doc.priority).toBe('high'); // forced for time-bound sources
    // isAutoAllocate is false at ingestion (line 1336) but flipped to true when
    // the background pipeline drives the question to 'open' (QuestionService.ts:1545,
    // commit 03c55740 "Added auto allocation on for open questions"). Allocation
    // itself still happens later via the time-bound cron, not at ingestion.
    expect(doc.isAutoAllocate).toBe(true); // auto-allocate enabled on 'open'
    expect(dummyAi.searchGdb).toHaveBeenCalled();
    expect(checkConceptDuplicateMock).toHaveBeenCalled();

    // Hand-off boundary: the question is now 'open' with an UNALLOCATED submission
    // (empty queue). From here the shared, cron-driven allocation pipeline
    // (reallocateTimeBoundQuestions) takes over — covered separately, not here.
    const afterSubmission = await submissions.findOne({
      questionId: new ObjectId(questionId),
    });
    expect(afterSubmission).not.toBeNull();
    expect(afterSubmission.queue).toEqual([]);
  }, 90000);
});

// ───────── NOT FOUND but non-agricultural -> filtered out as non_agri ─────────
describe('WhatsApp ingestion — non-agricultural question (LLM filter)', () => {
  it('marks the question as non_agri when the LLM classifies it as non-agri', async () => {
    checkConceptDuplicateMock.mockResolvedValue({ isNonAgri: true });

    const res = await submitQuestion(
      whatsAppPayload({
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

// ───────── THREAD INVALID: time-bound thread validation fails -> dropped as isTesting ─────────
//
// WhatsApp/Ajrasakha questions are time-bound, so processQuestionInBackground first
// calls validateTimeBoundQuestionThread. An empty threadId returns THREAD_ID_MISSING
// immediately (QuestionService.ts:1514) — no retry/backoff — and the question is
// flagged isTesting=true and DROPPED before the duplicate-check pipeline ever runs.
describe('WhatsApp ingestion — invalid thread (time-bound thread validation fails)', () => {
  it('flags the question isTesting=true and drops it before the duplicate pipeline', async () => {
    const res = await submitQuestion(whatsAppPayload({ threadId: '' }));
    console.log('THREAD-INVALID SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    // Empty threadId short-circuits immediately (no retries). Extended timeout
    // covers transient Atlas write latency when running first in the sequential
    // suite — updateQuestion is near-instant normally, but can be slow under load.
    const doc = await waitForQuestion(questionId, d => d.isTesting === true, { timeoutMs: 75_000 });
    console.log('THREAD-INVALID FINAL DOC:', { status: doc.status, isTesting: doc.isTesting });

    expect(doc.isTesting).toBe(true);
    // Empty threadId short-circuits before any API call — pipeline never ran.
    expect(doc.status).toBe('pending'); // never advanced from initial status
    expect(dummyAi.fetchWhatsAppMessage).not.toHaveBeenCalled(); // shortcut, no API call
    expect(dummyAi.searchGdb).not.toHaveBeenCalled();
    expect(checkConceptDuplicateMock).not.toHaveBeenCalled();
  }, 90000);
});

// ───────── DEGRADATION: LLM classifier throws -> pipeline still opens the question ─────────
//
// No GDB match means the pipeline falls back to the LLM non-agri classifier. If that
// classifier throws, runDuplicateCheckPipeline's inner catch (QuestionService.ts:1102)
// treats the question as agricultural, so it still reaches status='open' rather than
// getting stuck in 'pending' or wrongly filtered as non_agri.
describe('WhatsApp ingestion — LLM failure degrades gracefully to open', () => {
  it('still opens the question when the non-agri classifier throws', async () => {
    // Default searchGdb = no match, so the LLM is consulted — and it blows up.
    checkConceptDuplicateMock.mockRejectedValue(new Error('LLM upstream 503'));

    const res = await submitQuestion(whatsAppPayload());
    console.log('LLM-FAIL SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(questionId, d => d.status === 'open');
    console.log('LLM-FAIL FINAL DOC status:', doc.status);

    expect(doc.status).toBe('open'); // degraded gracefully, not stuck / not non_agri
    expect(dummyAi.searchGdb).toHaveBeenCalled();
    expect(checkConceptDuplicateMock).toHaveBeenCalled();
  }, 90000);
});

// ─── THREAD: valid threadId, API returns "not found" on all retries → isTesting ───
//
// Different from the empty-threadId case (which short-circuits at line 1514 without
// any API call). Here fetchWhatsAppMessage IS called: 1 initial attempt + 3 retries
// with 3 s/6 s/12 s backoff (~21 s total). Each call throws "No matching WhatsApp
// message found" — one of the notFoundMessages strings — so hadSuccessfulApiCall
// flips to true. After all retries, validateTimeBoundQuestionThread returns
// isValid=false → isTesting=true. GDB/LLM never run.
describe('WhatsApp ingestion — valid threadId, API returns "not found" on all retries → isTesting', () => {
  it('flags the question isTesting after exhausting all retry attempts', async () => {
    dummyAi.fetchWhatsAppMessage.mockRejectedValue(
      new Error('No matching WhatsApp message found'),
    );

    const res = await submitQuestion(whatsAppPayload()); // non-empty threadId
    console.log('THREAD-NOTFOUND SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    // Retries alone take 3+6+12=21 s; budget extra time for polling.
    const doc = await waitForQuestion(
      questionId,
      d => d.isTesting === true,
      { timeoutMs: 60000 },
    );
    console.log('THREAD-NOTFOUND FINAL DOC:', { status: doc.status, isTesting: doc.isTesting });

    expect(doc.isTesting).toBe(true);
    expect(doc.status).toBe('pending'); // never reached a terminal status
    // Unlike empty-threadId, the API was actually called on each attempt
    expect(dummyAi.fetchWhatsAppMessage).toHaveBeenCalled();
    expect(dummyAi.searchGdb).not.toHaveBeenCalled();
    expect(checkConceptDuplicateMock).not.toHaveBeenCalled();
  }, 120000);
});

// ─── THREAD: WhatsApp API completely unreachable → question proceeds to open ───
//
// When every attempt throws a non-"not-found" error (e.g. ECONNREFUSED),
// hadSuccessfulApiCall stays false. validateTimeBoundQuestionThread returns
// isValid=true — the question is NOT flagged isTesting; it falls through to the
// duplicate check pipeline and ends up 'open' (default: no GDB match, agri).
// This is the inverse of the "not found" case: API down ≠ test question.
describe('WhatsApp ingestion — WhatsApp API completely unreachable → question proceeds to open', () => {
  it('proceeds to open (not isTesting) when the thread API throws non-not-found errors', async () => {
    // ECONNREFUSED is not in the notFoundMessages list → hadSuccessfulApiCall stays false.
    dummyAi.fetchWhatsAppMessage.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await submitQuestion(whatsAppPayload());
    console.log('THREAD-DOWN SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    // Retries take ~21 s; the duplicate pipeline adds a little more.
    const doc = await waitForQuestion(
      questionId,
      d => d.status === 'open',
      { timeoutMs: 60000 },
    );
    console.log('THREAD-DOWN FINAL DOC:', { status: doc.status, isTesting: doc.isTesting });

    expect(doc.status).toBe('open');
    expect(doc.isTesting).toBeFalsy(); // NOT flagged as a test question
    expect(dummyAi.fetchWhatsAppMessage).toHaveBeenCalled(); // attempted on each retry
    expect(dummyAi.searchGdb).toHaveBeenCalled(); // pipeline ran after API degradation
  }, 120000);
});

// ─── GDB service throws → pipeline degrades gracefully to open ───
//
// If searchGdb itself throws, the error bubbles out of runDuplicateCheckPipeline
// (no try/catch wraps the GDB call there) and is caught by processQuestionInBackground's
// outer pipelineError catch (QuestionService.ts:1467) → status='open'. Mirrors the
// LLM-failure degradation but from a different point in the pipeline.
describe('WhatsApp ingestion — GDB service throws → degrades gracefully to open', () => {
  it('still opens the question when searchGdb throws', async () => {
    dummyAi.searchGdb.mockRejectedValue(new Error('GDB upstream 503'));

    const res = await submitQuestion(whatsAppPayload());
    console.log('GDB-FAIL SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(questionId, d => d.status === 'open');
    console.log('GDB-FAIL FINAL DOC status:', doc.status);

    expect(doc.status).toBe('open');
    expect(dummyAi.searchGdb).toHaveBeenCalled();
    // Pipeline threw before reaching the LLM
    expect(checkConceptDuplicateMock).not.toHaveBeenCalled();
  }, 90000);
});

// ─── THREAD: transient API failure (first attempt throws, retry succeeds) → open ───
//
// If the first attempt throws a non-"not-found" error (hadSuccessfulApiCall stays false
// after attempt 0), but a subsequent retry returns a valid response, the question
// should proceed normally to the duplicate-check pipeline and end up 'open'.
// This tests that the retry backoff machinery in validateTimeBoundQuestionThread is
// actually functional — currently all retry tests either always fail or always succeed.
describe('WhatsApp ingestion — transient thread API failure then retry succeeds → open', () => {
  it('proceeds to open when the thread API fails on first attempt but succeeds on retry', async () => {
    // First call throws a non-"not-found" error; subsequent calls use the default
    // implementation (restored by afterEach from the previous test) which returns
    // a valid WhatsApp message → hadSuccessfulApiCall stays false after attempt 0,
    // then flips true on attempt 1 → isValid=true → pipeline runs → open.
    dummyAi.fetchWhatsAppMessage.mockRejectedValueOnce(
      new Error('ECONNREFUSED'),
    );

    const res = await submitQuestion(whatsAppPayload());
    console.log('RETRY-SUCCEEDS SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    // Retry 1 fires after 3 s; budget extra time for polling.
    const doc = await waitForQuestion(
      questionId,
      d => d.status === 'open',
      { timeoutMs: 60000 },
    );
    console.log('RETRY-SUCCEEDS FINAL DOC:', { status: doc.status, isTesting: doc.isTesting });

    expect(doc.status).toBe('open');
    expect(doc.isTesting).toBeFalsy(); // not flagged as a test question
    // fetchWhatsAppMessage was called (at least the initial attempt + the retry)
    expect(dummyAi.fetchWhatsAppMessage).toHaveBeenCalled();
    // The duplicate pipeline ran after successful thread validation
    expect(dummyAi.searchGdb).toHaveBeenCalled();
  }, 60000);
});

// ─── GDB exact_match has an invalid ObjectId → falls through to LLM → open ───
//
// extractObjectId (QuestionService.ts:1056) validates the question_id from the GDB
// response. An invalid hex string returns null (line 1076: warning logged, match
// skipped). With selected_match also null, the LLM is consulted — agri → open.
describe('WhatsApp ingestion — GDB exact_match has invalid question_id → falls through to open', () => {
  it('ignores the invalid exact_match and reaches open via LLM classification', async () => {
    dummyAi.searchGdb.mockResolvedValueOnce({
      rephrased_query: 'paddy yellow leaves',
      crop: 'Paddy',
      state: 'Punjab',
      exact_match: {
        question_id: 'not-a-valid-objectid',
        similarity_score: 0.95,
        question: `${RUN_TAG} paddy question`,
        answer: 'some answer',
      },
      selected_match: null,
    });
    checkConceptDuplicateMock.mockResolvedValue({ isNonAgri: false });

    const res = await submitQuestion(whatsAppPayload());
    console.log('INVALID-EXACT-ID SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(questionId, d => d.status === 'open');
    console.log('INVALID-EXACT-ID FINAL DOC status:', doc.status);

    expect(doc.status).toBe('open');
    expect(dummyAi.searchGdb).toHaveBeenCalled();
    // Pipeline fell through the invalid exact_match to the LLM
    expect(checkConceptDuplicateMock).toHaveBeenCalled();
  }, 90000);
});

// ─── GDB selected_match has an invalid ObjectId → falls through to LLM → open ───
//
// Symmetric to the existing invalid-exact_match test but for the selected_match branch.
// extractObjectId (QuestionService.ts:1080) validates selected_match.question_id.
// An invalid hex string returns null (line 1092: warning logged, match skipped).
// With exact_match also null, the LLM is consulted — agri → open.
describe('WhatsApp ingestion — GDB selected_match has invalid question_id → falls through to open', () => {
  it('ignores the invalid selected_match and reaches open via LLM classification', async () => {
    dummyAi.searchGdb.mockResolvedValueOnce({
      rephrased_query: 'paddy yellow leaves',
      crop: 'Paddy',
      state: 'Punjab',
      exact_match: null,
      selected_match: {
        question_id: 'not-a-valid-objectid',
        similarity_score: 0.85,
        question: `${RUN_TAG} paddy question`,
        answer: 'some answer',
      },
    });
    checkConceptDuplicateMock.mockResolvedValue({ isNonAgri: false });

    const res = await submitQuestion(whatsAppPayload());
    console.log('INVALID-SELECTED-ID SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(questionId, d => d.status === 'open');
    console.log('INVALID-SELECTED-ID FINAL DOC status:', doc.status);

    expect(doc.status).toBe('open');
    expect(dummyAi.searchGdb).toHaveBeenCalled();
    // Pipeline fell through the invalid selected_match to the LLM
    expect(checkConceptDuplicateMock).toHaveBeenCalled();
  }, 90000);
});

// ─── GDB exact_match returns question_id in {$oid: "..."} format → marked duplicate ───
//
// extractObjectId (QuestionService.ts:1057) handles both plain hex strings and the
// MongoDB-extended-JSON {$oid: "..."} object format (id?.$oid ?? id). This alternate
// path is never exercised by the existing tests, which always use plain strings.
describe('WhatsApp ingestion — GDB exact_match uses $oid format → marked duplicate', () => {
  it('marks the question as duplicate when exact_match.question_id is in {$oid} format', async () => {
    const referenceQuestionId = new ObjectId();

    dummyAi.searchGdb.mockResolvedValueOnce({
      rephrased_query: 'paddy yellow leaves',
      crop: 'Paddy',
      state: 'Punjab',
      exact_match: {
        question_id: { $oid: referenceQuestionId.toString() },
        similarity_score: 0.96,
        question: `${RUN_TAG} exact paddy question with $oid format`,
        answer: 'Apply nitrogen; check for zinc deficiency.',
      },
      selected_match: null,
    });

    const res = await submitQuestion(whatsAppPayload());
    console.log('OID-FORMAT SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(questionId, d => d.status === 'duplicate');
    console.log('OID-FORMAT FINAL DOC:', {
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

// ─── GDB returns both exact_match and selected_match → exact_match takes priority ───
//
// runDuplicateCheckPipeline checks exact_match first (QuestionService.ts:1063).
// When valid, it returns immediately — selected_match is never consulted. The
// result carries isExact=true and the exact_match reference, not the selected_match.
describe('WhatsApp ingestion — GDB returns both exact_match and selected_match → exact_match wins', () => {
  it('marks duplicate with isExact=true and references the exact_match, not selected_match', async () => {
    const exactRefId = new ObjectId();
    const selectedRefId = new ObjectId();

    dummyAi.searchGdb.mockResolvedValueOnce({
      rephrased_query: 'paddy yellow leaves',
      crop: 'Paddy',
      state: 'Punjab',
      exact_match: {
        question_id: exactRefId.toString(),
        similarity_score: 0.98,
        question: `${RUN_TAG} exact paddy question`,
        answer: 'exact answer',
      },
      selected_match: {
        question_id: selectedRefId.toString(),
        similarity_score: 0.85,
        question: `${RUN_TAG} selected paddy question`,
        answer: 'selected answer',
      },
    });

    const res = await submitQuestion(whatsAppPayload());
    console.log('EXACT-WINS SUBMIT STATUS:', res.status, 'BODY:', res.body);
    expect(res.status).toBe(201);

    const questionId = res.body.question_id;
    createdQuestionIds.push(questionId);

    const doc = await waitForQuestion(questionId, d => d.status === 'duplicate');
    console.log('EXACT-WINS FINAL DOC:', {
      status: doc.status,
      isExact: doc.isExact,
      referenceQuestionId: doc.referenceQuestionId?.toString?.(),
    });

    expect(doc.status).toBe('duplicate');
    expect(doc.isExact).toBe(true);
    expect(doc.referenceQuestionId?.toString()).toBe(exactRefId.toString());
    // selected_match was skipped
    expect(doc.referenceQuestionId?.toString()).not.toBe(selectedRefId.toString());
    expect(checkConceptDuplicateMock).not.toHaveBeenCalled();
  }, 90000);
});

// ─── INVALID PAYLOAD: missing question text → 500 (KNOWN BUG) ───
//
// addQuestion has a guard at QuestionService.ts:1165 that throws BadRequestError
// for an empty question string. However, the outer catch block (line 1322) wraps
// ALL errors (including BadRequestError) in InternalServerError → HTTP 500.
// Fix: re-throw HttpError instances directly in the outer catch rather than
// wrapping them. See WhatsAppQuestion.e2e.md BUG-001 for full analysis.
// The Ajrasakha suite (AjrasakhaQuestion.e2e.test.ts) documents the same bug.
describe('WhatsApp ingestion — invalid payload (empty question text)', () => {
  it('rejects when the question text is empty [KNOWN BUG: returns 500 instead of 400]', async () => {
    const res = await submitQuestion(whatsAppPayload({ question: '' }));
    console.log('EMPTY-QUESTION STATUS:', res.status, 'BODY:', res.body);
    // BUG: should be 400, currently returns 500.
    expect(res.status).toBe(500);
    // Guard fires before insert — nothing to clean up.
  });
});
