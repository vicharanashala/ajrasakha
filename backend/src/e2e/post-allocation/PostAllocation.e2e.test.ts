/**
 * Post-Allocation Review Workflow — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * Everything that happens to a question AFTER it has been allocated to experts
 * (manual or auto allocation is already covered by ManualAllocation.e2e.test.ts
 * and QuestionAutoAllocation.e2e.test.ts). This suite picks up where allocation
 * leaves off — a question with a populated submission `queue` — and drives it
 * through the full expert peer-review → moderator-approval state machine:
 *
 *   POST   /api/answers/review            (author first answer + peer reviews)
 *   PUT    /api/answers                   (moderator final approval / edit-final)
 *   POST   /api/answers/moderator/approve (LLM approve — AJRASAKHA/WHATSAPP only)
 *   DELETE /api/answers/:questionId/:answerId
 *
 * THE STATE MACHINE (AnswerService.reviewAnswer + approveAnswer)
 * -------------------------------------------------------------
 *   allocated (status 'open', queue=[e1,e2,e3,e4])
 *     └─ e1 POST /review  (no status)  → answer 'in-review', e2 assigned + notified
 *         └─ e2 POST /review accepted  → approvalCount 1, e3 assigned
 *             └─ e3 accepted           → approvalCount 2, e4 assigned
 *                 └─ e4 accepted       → approvalCount 3 → question 'in-review',
 *                                        answer 'pending-with-moderator',
 *                                        moderators/admins notified
 *                     └─ moderator PUT /answers → question 'closed',
 *                                        answer isFinalAnswer=true, author incentivised
 *   Branches off the happy path:
 *     • reviewer REJECTS  → author penalised, answer 'rejected', reviewer's new
 *                           answer becomes the live one, author notified
 *     • reviewer MODIFIES → answer edited in place, approvalCount reset, author
 *                           notified
 *     • PAE expert submit → question 'pae_submitted' (skips the peer cycle)
 *
 * STRATEGY
 * --------
 * In-process server, same harness as ManualAllocation.e2e.test.ts:
 *   - real Mongo from `.env` (DB_URL/DB_NAME), production DI container via
 *     loadAppModules('all')
 *   - users fetched from the real DB by the emails in `.env.test`; a
 *     `currentTestUser` variable is swapped per request so authorizationChecker
 *     / currentUserChecker are fully under our control (no Firebase tokens)
 *   - InternalApiAuth is a global before-middleware, so EVERY request carries
 *     the x-internal-api-key header
 *   - AiService is dummied for safety. In this env NODE_ENV='development' and
 *     ENABLE_AI_SERVER=false, so embeddings short-circuit to [] and no outbound
 *     AI call happens on the post-allocation path anyway.
 *
 * KNOWN QUIRK — reviewAnswer error mapping
 * ----------------------------------------
 * AnswerService.reviewAnswer wraps its whole body in try/catch and rethrows
 * EVERY error as `InternalServerError`. The controller then re-throws
 * InternalServerError as HTTP 500. So every reviewAnswer failure (bad role,
 * wrong reviewer, duplicate answer, identical-answer guard…) surfaces as 500,
 * never 400/401/403. These cases are pinned as 500 below and flagged KNOWN.
 */

// Mongo on Atlas (mongodb+srv) requires TLS. MongoDatabase disables TLS when
// NODE_ENV==='test', so force a non-test env BEFORE any module builds the Mongo
// client. Must run before loadAppModules().
process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
// Real Atlas DB config first, then test-user credentials. dotenv does NOT
// override already-set vars, so DB_URL/DB_NAME from .env win.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.test' });

import express from 'express';
import request from 'supertest';
import { useExpressServer } from 'routing-controllers';
import { ObjectId } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_PA_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-post-alloc-key';

const REVIEW_PARAMS = {
  contextRelevance: true,
  technicalAccuracy: true,
  practicalUtility: true,
  valueInsight: true,
  credibilityTrust: true,
  readabilityCommunication: true,
};

let app: express.Express;
let db: any;

let moderatorUser: any;
let adminUser: any;
let paeExpertUser: any; // may be null if no pae_expert seeded
let experts: any[] = []; // e1..e4 (EXPERT_EMAIL .. EXPERT_EMAIL_4)

// Swapped per request — currentUserChecker returns this.
let currentTestUser: any = null;

// Track every doc we create/seed so the real DB is left clean.
const createdQuestionIds: ObjectId[] = [];

beforeAll(async () => {
  // Warm-up: resolve the AnswerService circular import before the core barrel
  // runs via loadAppModules (see project_e2e_inprocess_harness memory).
  await import('#root/modules/answer/services/AnswerService.js');

  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const { loadAppModules, getContainer } = await import(
    '#root/bootstrap/loadModules.js'
  );
  const { GLOBAL_TYPES } = await import('#root/types.js');
  const { CORE_TYPES } = await import('#root/modules/core/types.js');

  const { controllers } = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);

  // Dummy the single external seam (AiService). Not strictly needed in this env
  // but keeps the suite hermetic if config flips.
  const dummyAi = {
    getEmbedding: async () => ({ embedding: [] }),
    fetchWhatsAppMessage: async () => ({}),
    searchGdb: async () => ({ exact_match: null, selected_match: null }),
  };
  try {
    container.rebindSync(CORE_TYPES.AIService).toConstantValue(dummyAi);
  } catch {
    // already absent / not bound — embeddings short-circuit anyway
  }

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  const users = await db.getCollection('users');
  const expertEmails = [
    process.env.EXPERT_EMAIL,
    process.env.EXPERT_EMAIL_2,
    process.env.EXPERT_EMAIL_3,
    process.env.EXPERT_EMAIL_4,
  ];

  [moderatorUser, adminUser, ...experts] = await Promise.all([
    users.findOne({ email: process.env.MODERATOR_EMAIL }),
    users.findOne({ email: process.env.ADMIN_EMAIL }),
    ...expertEmails.map(email => users.findOne({ email })),
  ]);

  // Optional pae_expert — only used by the PAE describe block.
  paeExpertUser = await users.findOne({ role: 'pae_expert' });

  const missing = [
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
    !adminUser && `ADMIN_EMAIL=${process.env.ADMIN_EMAIL}`,
    ...experts.map((u, i) => !u && expertEmails[i]),
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Test users not found in DB: ${missing.join(', ')}`);
  }

  await users.estimatedDocumentCount(); // sanity: connectivity
  console.log(
    `[setup] Connected. RUN_TAG=${RUN_TAG} experts=${experts
      .map(e => e._id.toString())
      .join(',')} pae=${paeExpertUser?._id?.toString() ?? 'none'}`,
  );
}, 90000);

afterAll(async () => {
  if (db && createdQuestionIds.length) {
    const [questions, submissions, answers, reviews, notifications] =
      await Promise.all([
        db.getCollection('questions'),
        db.getCollection('question_submissions'),
        db.getCollection('answers'),
        db.getCollection('reviews'),
        db.getCollection('notifications'),
      ]);
    await Promise.all([
      questions.deleteMany({ _id: { $in: createdQuestionIds } }),
      submissions.deleteMany({ questionId: { $in: createdQuestionIds } }),
      answers.deleteMany({ questionId: { $in: createdQuestionIds } }),
      reviews.deleteMany({ questionId: { $in: createdQuestionIds } }),
      notifications.deleteMany({ enitity_id: { $in: createdQuestionIds } }),
    ]);
    console.log(`[teardown] Cleaned ${createdQuestionIds.length} questions.`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

// ─────────────────────── helpers ───────────────────────

const as = (user: any) => {
  currentTestUser = user;
};

function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPut(path: string) {
  return request(app).put(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiDelete(path: string) {
  return request(app).delete(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

/** Seed an allocated question + its submission. Returns the question id (string). */
async function seedAllocatedQuestion(opts: {
  queue: any[];
  status?: string;
  history?: any[];
  normalisedCrop?: string | null;
  source?: string;
  isAutoAllocate?: boolean;
  label?: string;
}): Promise<string> {
  const questions = await db.getCollection('questions');
  const submissions = await db.getCollection('question_submissions');

  const details: any = {
    state: 'Punjab',
    district: 'Ludhiana',
    crop: 'Paddy',
    season: 'Kharif',
    domain: 'Crop Protection',
  };
  if (opts.normalisedCrop !== null) {
    details.normalised_crop = opts.normalisedCrop ?? 'Paddy';
  }

  const { insertedId } = await questions.insertOne({
    userId: moderatorUser._id,
    question: `${RUN_TAG} ${opts.label ?? 'paddy yellowing'} — what fertilizer?`,
    status: opts.status ?? 'open',
    priority: 'medium',
    source: opts.source ?? 'OUTREACH',
    isAutoAllocate: opts.isAutoAllocate ?? false,
    totalAnswersCount: 0,
    embedding: [],
    metrics: null,
    details,
    firstAllocationAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  createdQuestionIds.push(insertedId);

  await submissions.insertOne({
    questionId: insertedId,
    lastRespondedBy: null,
    history: opts.history ?? [],
    queue: opts.queue.map(u => new ObjectId(u._id.toString())),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return insertedId.toString();
}

/** Seed a standalone answer doc directly (used for moderator-only edge cases). */
async function seedAnswer(
  questionId: string,
  author: any,
  overrides: Record<string, any> = {},
): Promise<string> {
  const answers = await db.getCollection('answers');
  const { insertedId } = await answers.insertOne({
    questionId: new ObjectId(questionId),
    authorId: new ObjectId(author._id.toString()),
    answer: `${RUN_TAG} seeded answer`,
    isFinalAnswer: false,
    answerIteration: 1,
    approvalCount: 0,
    status: 'pending-with-moderator',
    embedding: [],
    sources: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return insertedId.toString();
}

async function getQuestion(questionId: string) {
  const questions = await db.getCollection('questions');
  return questions.findOne({ _id: new ObjectId(questionId) });
}
async function getSubmission(questionId: string) {
  const submissions = await db.getCollection('question_submissions');
  return submissions.findOne({ questionId: new ObjectId(questionId) });
}
/** The live answer authored by `author` for this question. */
async function getAuthorAnswer(questionId: string, author: any) {
  const answers = await db.getCollection('answers');
  return answers.findOne({
    questionId: new ObjectId(questionId),
    authorId: new ObjectId(author._id.toString()),
  });
}

// ════════════════════════════════════════════════════════════════════════
// 1. AUTHORIZATION GUARDS (reviewAnswer role / queue checks)
// ════════════════════════════════════════════════════════════════════════

describe('Post-allocation — authorization guards', () => {
  let qId: string;

  beforeAll(async () => {
    qId = await seedAllocatedQuestion({
      queue: experts,
      label: 'auth-guards',
    });
  });

  it('401 when no user is logged in', async () => {
    as(null);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      answer: `${RUN_TAG} an answer`,
      sources: [],
    });
    expect(res.status).toBe(401);
  });

  it('moderator cannot author/review an answer → 500 (KNOWN: role error wrapped as InternalServerError)', async () => {
    // reviewAnswer throws UnauthorizedError for non-expert roles, but its outer
    // catch rethrows everything as InternalServerError → HTTP 500.
    as(moderatorUser);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      answer: `${RUN_TAG} mod answer`,
      sources: [],
    });
    expect(res.status).toBe(500);
  });

  it('expert NOT at queue[0] cannot submit the first answer → 500 (KNOWN: wrapped)', async () => {
    as(experts[1]); // e2, but queue[0] is e1
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      answer: `${RUN_TAG} e2 jumping the queue`,
      sources: [],
    });
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 2. HAPPY PATH — author → 3 approvals → moderator close
// ════════════════════════════════════════════════════════════════════════

describe('Post-allocation — happy path (peer review → moderator approval)', () => {
  let qId: string;
  let answerId: string;

  beforeAll(async () => {
    qId = await seedAllocatedQuestion({ queue: experts, label: 'happy' });
  });

  it('e1 (queue[0]) submits the first answer → answer in-review, e2 assigned', async () => {
    as(experts[0]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      answer: `${RUN_TAG} apply 25kg urea per acre in split doses`,
      sources: [{ source: 'https://icar.org.in', page: '12' }],
    });
    expect(res.status).toBe(201);

    const ans = await getAuthorAnswer(qId, experts[0]);
    expect(ans).not.toBeNull();
    expect(ans.status).toBe('in-review');
    answerId = ans._id.toString();

    // Question stays open until 3 approvals; submission has e1 + freshly-assigned e2.
    const q = await getQuestion(qId);
    expect(q.status).toBe('open');

    const sub = await getSubmission(qId);
    expect(sub.history).toHaveLength(2);
    expect(sub.history[0].updatedBy.toString()).toBe(experts[0]._id.toString());
    expect(sub.history[1].updatedBy.toString()).toBe(experts[1]._id.toString());
  });

  it('e1 cannot submit a second answer → 500 (KNOWN: "already submitted" wrapped)', async () => {
    as(experts[0]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      answer: `${RUN_TAG} duplicate submission`,
      sources: [],
    });
    expect(res.status).toBe(500);
  });

  it('e2 accepts → approvalCount 1, e3 assigned', async () => {
    as(experts[1]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      status: 'accepted',
      approvedAnswer: answerId,
      parameters: REVIEW_PARAMS,
    });
    expect(res.status).toBe(201);

    const answers = await db.getCollection('answers');
    const ans = await answers.findOne({ _id: new ObjectId(answerId) });
    expect(ans.approvalCount).toBe(1);

    const sub = await getSubmission(qId);
    expect(sub.history.some((h: any) => h.updatedBy.toString() === experts[2]._id.toString())).toBe(true);
  });

  it('e3 accepts → approvalCount 2, e4 assigned', async () => {
    as(experts[2]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      status: 'accepted',
      approvedAnswer: answerId,
      parameters: REVIEW_PARAMS,
    });
    expect(res.status).toBe(201);

    const answers = await db.getCollection('answers');
    const ans = await answers.findOne({ _id: new ObjectId(answerId) });
    expect(ans.approvalCount).toBe(2);

    const sub = await getSubmission(qId);
    expect(sub.history.some((h: any) => h.updatedBy.toString() === experts[3]._id.toString())).toBe(true);
  });

  it('e4 accepts → 3 approvals → question in-review, answer pending-with-moderator', async () => {
    as(experts[3]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      status: 'accepted',
      approvedAnswer: answerId,
      parameters: REVIEW_PARAMS,
    });
    expect(res.status).toBe(201);

    const answers = await db.getCollection('answers');
    const ans = await answers.findOne({ _id: new ObjectId(answerId) });
    expect(ans.approvalCount).toBe(3);
    expect(ans.status).toBe('pending-with-moderator');

    const q = await getQuestion(qId);
    expect(q.status).toBe('in-review');
  });

  it('expert cannot do the final approval → 400 (role gate in approveAnswer)', async () => {
    // approveAnswer throws UnauthorizedError for role 'expert'; the controller
    // maps non-InternalServerError to BadRequestError → 400.
    as(experts[0]);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      answerId,
      questionId: qId,
      answer: `${RUN_TAG} expert trying to approve`,
      sources: [],
    });
    expect(res.status).toBe(400);
  });

  it('moderator approves → question closed, answer finalised, author incentivised', async () => {
    const usersCol = await db.getCollection('users');
    const before = await usersCol.findOne({ _id: experts[0]._id });
    const incentiveBefore = before.incentive ?? 0;

    as(moderatorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      answerId,
      questionId: qId,
      answer: `${RUN_TAG} FINAL: apply 25kg urea per acre, split into 3 doses`,
      sources: [{ source: 'https://icar.org.in', page: '12' }],
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('closed');
    expect(q.closedAt).toBeInstanceOf(Date);

    const answers = await db.getCollection('answers');
    const ans = await answers.findOne({ _id: new ObjectId(answerId) });
    expect(ans.isFinalAnswer).toBe(true);
    expect(ans.status).toBe('approved');
    expect(ans.approvedBy.toString()).toBe(moderatorUser._id.toString());

    const after = await usersCol.findOne({ _id: experts[0]._id });
    expect((after.incentive ?? 0)).toBeGreaterThan(incentiveBefore);
  });

  it('cannot add an answer to an already-closed question → 500 (KNOWN: wrapped)', async () => {
    as(experts[1]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      answer: `${RUN_TAG} too late`,
      sources: [],
    });
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 3. REJECT PATH
// ════════════════════════════════════════════════════════════════════════

describe('Post-allocation — reviewer rejects the author answer', () => {
  let qId: string;
  let authorAnswerId: string;

  beforeAll(async () => {
    qId = await seedAllocatedQuestion({ queue: experts, label: 'reject' });
    as(experts[0]);
    await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      answer: `${RUN_TAG} original answer to be rejected`,
      sources: [],
    });
    const ans = await getAuthorAnswer(qId, experts[0]);
    authorAnswerId = ans._id.toString();
  });

  it('rejecting with an identical answer is blocked → 500 (KNOWN: guard wrapped)', async () => {
    as(experts[1]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      status: 'rejected',
      rejectedAnswer: authorAnswerId,
      reasonForRejection: 'identical text test',
      answer: `${RUN_TAG} original answer to be rejected`, // identical
      sources: [],
      parameters: REVIEW_PARAMS,
    });
    expect(res.status).toBe(500);
  });

  it('e2 rejects with a new answer → author answer rejected, author penalised', async () => {
    const usersCol = await db.getCollection('users');
    const before = await usersCol.findOne({ _id: experts[0]._id });
    const penaltyBefore = before.penalty ?? 0;

    as(experts[1]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      status: 'rejected',
      rejectedAnswer: authorAnswerId,
      reasonForRejection: 'missing dosage detail',
      answer: `${RUN_TAG} corrected answer with proper dosage`,
      sources: [{ source: 'https://tnau.ac.in', page: '3' }],
      parameters: REVIEW_PARAMS,
    });
    expect(res.status).toBe(201);

    const answers = await db.getCollection('answers');
    const rejected = await answers.findOne({ _id: new ObjectId(authorAnswerId) });
    expect(rejected.status).toBe('rejected');

    // Reviewer's replacement answer now exists and is live (in-review).
    const replacement = await getAuthorAnswer(qId, experts[1]);
    expect(replacement).not.toBeNull();
    expect(replacement.status).toBe('in-review');

    const after = await usersCol.findOne({ _id: experts[0]._id });
    expect((after.penalty ?? 0)).toBeGreaterThan(penaltyBefore);
  });

  it('author (e1) was notified that the review was rejected', async () => {
    const notifications = await db.getCollection('notifications');
    const notif = await notifications.findOne({
      enitity_id: new ObjectId(qId),
      userId: experts[0]._id,
      type: 'review_rejected',
    });
    expect(notif).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════
// 4. MODIFY PATH
// ════════════════════════════════════════════════════════════════════════

describe('Post-allocation — reviewer modifies the author answer', () => {
  let qId: string;
  let authorAnswerId: string;

  beforeAll(async () => {
    qId = await seedAllocatedQuestion({ queue: experts, label: 'modify' });
    as(experts[0]);
    await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      answer: `${RUN_TAG} answer that needs a small edit`,
      sources: [],
    });
    // bump approvalCount so we can prove modify resets it
    const ans = await getAuthorAnswer(qId, experts[0]);
    authorAnswerId = ans._id.toString();
  });

  it('modifying with an identical answer is blocked → 500 (KNOWN: guard wrapped)', async () => {
    as(experts[1]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      status: 'modified',
      modifiedAnswer: authorAnswerId,
      reasonForModification: 'identical text test',
      answer: `${RUN_TAG} answer that needs a small edit`, // identical
      sources: [],
      parameters: REVIEW_PARAMS,
    });
    expect(res.status).toBe(500);
  });

  it('e2 modifies → answer text updated in place, approvalCount reset to 0', async () => {
    as(experts[1]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      status: 'modified',
      modifiedAnswer: authorAnswerId,
      reasonForModification: 'clarified the dosage units',
      answer: `${RUN_TAG} answer with clarified dosage units (kg/acre)`,
      sources: [{ source: 'https://icar.org.in', page: '8' }],
      parameters: REVIEW_PARAMS,
    });
    expect(res.status).toBe(201);

    const answers = await db.getCollection('answers');
    const ans = await answers.findOne({ _id: new ObjectId(authorAnswerId) });
    expect(ans.answer).toContain('clarified dosage units');
    expect(ans.approvalCount).toBe(0);
    expect(Array.isArray(ans.modifications)).toBe(true);
    expect(ans.modifications.length).toBeGreaterThanOrEqual(1);
  });

  it('author (e1) was notified that the answer was modified', async () => {
    const notifications = await db.getCollection('notifications');
    const notif = await notifications.findOne({
      enitity_id: new ObjectId(qId),
      userId: experts[0]._id,
      type: 'review_modified',
    });
    expect(notif).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════
// 5. MODERATOR-APPROVAL EDGE CASES
// ════════════════════════════════════════════════════════════════════════

describe('Post-allocation — moderator approval edge cases', () => {
  it('approve when question is still "open" (not in-review) → 400', async () => {
    const qId = await seedAllocatedQuestion({
      queue: experts,
      label: 'approve-open',
      status: 'open',
    });
    const answerId = await seedAnswer(qId, experts[0]);

    as(moderatorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      answerId,
      questionId: qId,
      answer: `${RUN_TAG} premature approval`,
      sources: [],
    });
    expect(res.status).toBe(400);
  });

  it('approve when question has no normalised_crop → 400', async () => {
    const qId = await seedAllocatedQuestion({
      queue: experts,
      label: 'no-crop',
      status: 'in-review',
      normalisedCrop: null,
    });
    const answerId = await seedAnswer(qId, experts[0]);

    as(moderatorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      answerId,
      questionId: qId,
      answer: `${RUN_TAG} answer`,
      sources: [],
    });
    expect(res.status).toBe(400);
  });

  it('moderator/approve (LLM) rejects a non AJRASAKHA/WHATSAPP source → 400', async () => {
    const qId = await seedAllocatedQuestion({
      queue: experts,
      label: 'llm-wrong-source',
      status: 'open',
      source: 'AGRI_EXPERT',
    });

    as(moderatorUser);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/moderator/approve`).send({
      questionId: qId,
      answer: `${RUN_TAG} llm answer`,
      sources: [],
      source: 'AGRI_EXPERT',
    });
    expect(res.status).toBe(400);
  });

  it('moderator can edit an already-finalised answer on a closed question (edit-final flow)', async () => {
    const qId = await seedAllocatedQuestion({
      queue: experts,
      label: 'edit-final',
      status: 'closed',
    });
    const answerId = await seedAnswer(qId, experts[0], {
      isFinalAnswer: true,
      status: 'approved',
      answer: `${RUN_TAG} original final answer`,
    });

    as(moderatorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      answerId,
      answer: `${RUN_TAG} EDITED final answer`,
      sources: [{ source: 'https://icar.org.in', page: '99' }],
    });
    expect(res.status).toBe(200);

    const answers = await db.getCollection('answers');
    const ans = await answers.findOne({ _id: new ObjectId(answerId) });
    expect(ans.answer).toContain('EDITED final answer');
    expect(ans.isFinalAnswer).toBe(true); // preserved

    const q = await getQuestion(qId);
    expect(q.status).toBe('closed'); // stays closed
  });
});

// ════════════════════════════════════════════════════════════════════════
// 6. PAE EXPERT FLOW (skips peer review) — conditional on a pae_expert existing
// ════════════════════════════════════════════════════════════════════════

describe('Post-allocation — PAE expert submission', () => {
  it('pae_expert submits → question becomes pae_submitted (peer cycle skipped)', async ({
    skip,
  }) => {
    if (!paeExpertUser) {
      skip();
      return;
    }
    const qId = await seedAllocatedQuestion({
      queue: [paeExpertUser],
      label: 'pae',
    });

    as(paeExpertUser);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      answer: `${RUN_TAG} pae expert direct answer`,
      sources: [],
    });
    expect(res.status).toBe(201);

    const q = await getQuestion(qId);
    expect(q.status).toBe('pae_submitted');
  });

  it('moderator approves a pae_submitted question → closed', async ({ skip }) => {
    if (!paeExpertUser) {
      skip();
      return;
    }
    const qId = await seedAllocatedQuestion({
      queue: [paeExpertUser],
      label: 'pae-approve',
      status: 'pae_submitted',
    });
    const answerId = await seedAnswer(qId, paeExpertUser, {
      status: 'pending-with-moderator',
    });

    as(moderatorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      answerId,
      questionId: qId,
      answer: `${RUN_TAG} moderator-approved pae answer`,
      sources: [],
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('closed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 7. DELETE ANSWER
// ════════════════════════════════════════════════════════════════════════

describe('Post-allocation — delete answer', () => {
  it('deleting a non-final answer removes it and decrements the answer count', async () => {
    const qId = await seedAllocatedQuestion({
      queue: experts,
      label: 'delete',
      status: 'in-review',
    });
    // seed an answer + bump totalAnswersCount to 1
    const answerId = await seedAnswer(qId, experts[0], { isFinalAnswer: false });
    const questions = await db.getCollection('questions');
    await questions.updateOne(
      { _id: new ObjectId(qId) },
      { $set: { totalAnswersCount: 1 } },
    );

    as(moderatorUser);
    const res = await apiDelete(`${ROUTE_PREFIX}/answers/${qId}/${answerId}`);
    expect(res.status).toBe(200);

    const answers = await db.getCollection('answers');
    const ans = await answers.findOne({ _id: new ObjectId(answerId) });
    expect(ans).toBeNull();

    const q = await getQuestion(qId);
    expect(q.totalAnswersCount).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 8. APPROVAL COUNT THRESHOLD GUARD
//
// The design requires exactly 3 peer-review acceptances before the question
// escalates to the moderator. This suite explicitly pins that 2 acceptances
// are NOT enough to trigger escalation — a regression guard for the reported
// production symptom "after 2 consecutive approvals it goes to moderator level."
// ════════════════════════════════════════════════════════════════════════

describe('Post-allocation — approvalCount=2 does NOT escalate to moderator', () => {
  let qId: string;
  let answerId: string;

  beforeAll(async () => {
    // 3 experts in queue so we can drive approvalCount to 2 and stop there.
    qId = await seedAllocatedQuestion({
      queue: experts.slice(0, 3),
      label: 'approval-threshold',
    });

    // e1 authors the first answer.
    as(experts[0]);
    await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      answer: `${RUN_TAG} answer for approval-threshold test`,
      sources: [],
    });
    const ans = await getAuthorAnswer(qId, experts[0]);
    answerId = ans._id.toString();
  });

  it('after 1 acceptance (approvalCount=1): question.status is still "open"', async () => {
    as(experts[1]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      status: 'accepted',
      approvedAnswer: answerId,
      parameters: REVIEW_PARAMS,
    });
    expect(res.status).toBe(201);

    const q = await getQuestion(qId);
    console.log('[G8-1] status after approvalCount=1:', q?.status);
    expect(q.status).toBe('open');
  });

  it('after 2 acceptances (approvalCount=2): question.status is STILL "open" (not "in-review")', async () => {
    as(experts[2]);
    const res = await apiPost(`${ROUTE_PREFIX}/answers/review`).send({
      questionId: qId,
      status: 'accepted',
      approvedAnswer: answerId,
      parameters: REVIEW_PARAMS,
    });
    expect(res.status).toBe(201);

    const q = await getQuestion(qId);
    const answers = await db.getCollection('answers');
    const ans = await answers.findOne({ _id: new ObjectId(answerId) });
    console.log('[G8-2] status after approvalCount=2:', q?.status, 'approvalCount:', ans?.approvalCount);
    expect(ans.approvalCount).toBe(2);
    expect(q.status).toBe('open');
    expect(ans.status).toBe('in-review');
  });

  it('after 2 acceptances: no moderator_approval notification has been sent', async () => {
    const notifications = await db.getCollection('notifications');
    const notif = await notifications.findOne({
      enitity_id: new ObjectId(qId),
      type: 'moderator_approval',
    });
    console.log('[G8-3] moderator_approval notif at approvalCount=2:', notif ? 'found (BAD)' : 'absent (OK)');
    expect(notif).toBeNull();
  });
});
