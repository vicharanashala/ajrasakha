/**
 * Gate Keeper / Auditor Workflow — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * The new triage → hand-off → finalize workflow introduced alongside the
 * 'gate_keeper' and 'auditor' roles (merge: origin/copy/gatekeeper-auditor-workflow):
 *
 *   1. PUSH TO AUDITOR — PUT /api/questions/:questionId {status:'auditor_review'}
 *      Gate Keeper hand-off for a 'dynamic' or 'duplicate' question. Stamps
 *      `auditorReviewType` ('dynamic'|'duplicate') so the Auditor knows which
 *      action to expose, and writes a PUSH_TO_AUDITOR audit trail (the comment
 *      is audit-only, never persisted on the question).
 *
 *   2. AUDITOR FINALIZE — PUT /api/answers {questionId, answer, sources}
 *      Same endpoint as the legacy "moderator closes a duplicate" flow
 *      (AnswerService.approveAnswer), now also entered from 'auditor_review'.
 *        - auditorReviewType='dynamic'  → closes 'dynamic_closed' ("Notify User")
 *        - auditorReviewType='duplicate' → closes 'closed' ("Push to GDB")
 *      A plain 'duplicate' question (never routed through the Auditor) still
 *      closes the same way — this is deliberate backward compatibility, not
 *      tested elsewhere, so it's covered here too.
 *
 *   3. CANCEL DUPLICATE — PUT /api/questions/:questionId {isDuplicateCancelled:true}
 *      Gate Keeper reopens a 'queue_duplicate' question (GDB pending-duplicate
 *      queue match) back to 'open', recording the reason + auto-allocate choice
 *      in the audit trail only (CANCEL_DUPLICATE).
 *
 *   4. CLOSE-PROPAGATION — approving/closing any question now auto-closes every
 *      'queue_duplicate' question that referenced it: the final answer is
 *      replicated, each child is stamped closedBy:'System', its moderator
 *      assignment is cleared, and its own customer webhook fires independently
 *      (AnswerService.notifyCustomerOnClose, extracted for exactly this reuse).
 *
 * WHAT THIS DOES NOT COVER
 * ------------------------
 * Ingestion-time detection of 'queue_duplicate' (AiService.checkPendingDuplicate
 * called from runDuplicateCheckPipeline) is covered in WhatsAppQuestion.e2e.test.ts
 * and AjrasakhaQuestion.e2e.test.ts, not here — this suite seeds terminal-state
 * questions directly and drives only the gate-keeper/auditor/close-propagation
 * transitions.
 *
 * STRATEGY
 * --------
 * Same in-process harness as PostAllocation.e2e.test.ts / ManualAllocation.e2e.test.ts:
 * real Atlas DB from `.env`, NODE_ENV='development' (TLS), production DI container,
 * `currentTestUser` swapped per request (no Firebase), global InternalApiAuth via
 * x-internal-api-key. AiService is dummied for safety (embeddings short-circuit to
 * [] anyway since isDevelopment=true). The 'gate_keeper'/'auditor' roles have no
 * fixtures in .env.test, so real user docs are inserted directly (RUN_TAG-tagged,
 * cleaned up in afterAll) rather than reused from existing test-user pools.
 *
 * The customer webhook (triggerWebhook, called via AnswerService.notifyCustomerOnClose)
 * is vi.mock'd so payloads (status/messageId/threadId per question) can be asserted
 * directly, instead of relying on a real/failing network call like the other suites.
 */

process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.test' });

// Mocked so we can assert on exactly what's sent to the farmer/webapp customer,
// per question, without relying on a real (likely-failing) network call.
vi.mock('#root/modules/answer/utils/triggerWebhook.js', () => ({
  triggerWebhook: vi.fn(async () => ({ ok: true, status: 200, body: 'ok' })),
}));

import express from 'express';
import request from 'supertest';
import { useExpressServer } from 'routing-controllers';
import { ObjectId } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { triggerWebhook } from '#root/modules/answer/utils/triggerWebhook.js';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_GKA_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-gatekeeper-auditor-key';

let app: express.Express;
let db: any;

let gateKeeperUser: any;
let auditorUser: any;
let expertUser: any;
let callAgentUser: any;

// Swapped per request — currentUserChecker returns this.
let currentTestUser: any = null;

const createdQuestionIds: ObjectId[] = [];
const createdUserIds: ObjectId[] = [];

beforeAll(async () => {
  // Resolve the AnswerService circular-import warm-up before loadAppModules
  // (see project_e2e_inprocess_harness memory — CORE_TYPES is undefined otherwise).
  await import('#root/modules/answer/services/AnswerService.js');

  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const { loadAppModules, getContainer } = await import('#root/bootstrap/loadModules.js');
  const { GLOBAL_TYPES } = await import('#root/types.js');
  const { CORE_TYPES } = await import('#root/modules/core/types.js');

  const { controllers } = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);

  const dummyAi = {
    getEmbedding: async () => ({ embedding: [] }),
    fetchWhatsAppMessage: async () => ({}),
    searchGdb: async () => ({ exact_match: null, selected_match: null }),
    checkPendingDuplicate: async () => ({ detail: 'not used in this suite' }),
  };
  try {
    container.rebindSync(CORE_TYPES.AIService).toConstantValue(dummyAi);
  } catch {
    // already absent / not bound — embeddings short-circuit anyway (isDevelopment)
  }

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  // No .env.test fixtures exist for the new roles — insert real user docs.
  const users = await db.getCollection('users');
  const makeUser = async (role: string) => {
    const { insertedId } = await users.insertOne({
      firebaseUID: `${RUN_TAG}_${role}`,
      email: `${RUN_TAG}_${role}@example.com`,
      firstName: RUN_TAG,
      lastName: role,
      role,
      incentive: 0,
      penalty: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    createdUserIds.push(insertedId);
    return users.findOne({ _id: insertedId });
  };
  gateKeeperUser = await makeUser('gate_keeper');
  auditorUser = await makeUser('auditor');
  expertUser = await makeUser('expert');
  callAgentUser = await makeUser('call_agent');

  const questions = await db.getCollection('questions');
  await questions.estimatedDocumentCount();
  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG}`);
}, 90000);

afterAll(async () => {
  if (db) {
    const [questions, submissions, answers, notifications, auditTrails, users] =
      await Promise.all([
        db.getCollection('questions'),
        db.getCollection('question_submissions'),
        db.getCollection('answers'),
        db.getCollection('notifications'),
        db.getCollection('auditTrails'),
        db.getCollection('users'),
      ]);
    if (createdQuestionIds.length) {
      await Promise.all([
        questions.deleteMany({ _id: { $in: createdQuestionIds } }),
        submissions.deleteMany({ questionId: { $in: createdQuestionIds } }),
        answers.deleteMany({ questionId: { $in: createdQuestionIds } }),
        notifications.deleteMany({ enitity_id: { $in: createdQuestionIds } }),
        auditTrails.deleteMany({ 'context.questionId': { $in: createdQuestionIds } }),
      ]);
    }
    if (createdUserIds.length) {
      await users.deleteMany({ _id: { $in: createdUserIds } });
    }
    console.log(
      `[teardown] Cleaned ${createdQuestionIds.length} question(s), ${createdUserIds.length} user(s).`,
    );
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

beforeEach(() => {
  (triggerWebhook as any).mockClear();
  (triggerWebhook as any).mockResolvedValue({ ok: true, status: 200, body: 'ok' });
});

// ─────────────────────── helpers ───────────────────────

const as = (user: any) => {
  currentTestUser = user;
};

function apiPut(path: string) {
  return request(app).put(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

async function getQuestion(questionId: string) {
  const questions = await db.getCollection('questions');
  return questions.findOne({ _id: new ObjectId(questionId) });
}

/** Poll the auditTrails collection for a matching action + questionId. */
async function waitForAuditTrail(
  questionId: string,
  action: string,
  { timeoutMs = 5000, intervalMs = 250 } = {},
): Promise<any> {
  const auditTrails = await db.getCollection('auditTrails');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const doc = await auditTrails.findOne({
      action,
      'context.questionId': new ObjectId(questionId),
    });
    if (doc) return doc;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

/** Seed a question (+ empty submission, required by QuestionService.getQuestionById)
 *  directly into Mongo in whatever terminal/pre-terminal state a test needs. */
async function seedQuestion(opts: {
  status: string;
  source?: string;
  isAutoAllocate?: boolean;
  referenceQuestionId?: ObjectId;
  referenceSource?: string;
  auditorReviewType?: 'dynamic' | 'duplicate';
  normalisedCrop?: string | null;
  messageId?: string;
  threadId?: string;
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

  const doc: any = {
    userId: gateKeeperUser._id,
    question: `${RUN_TAG} ${opts.label ?? opts.status} — paddy leaves turning yellow`,
    status: opts.status,
    priority: 'high',
    source: opts.source ?? 'WHATSAPP',
    isAutoAllocate: opts.isAutoAllocate ?? false,
    totalAnswersCount: 0,
    embedding: [],
    metrics: null,
    details,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  if (opts.source === 'WHATSAPP' || opts.source === 'AJRASAKHA') {
    doc.messageId = opts.messageId ?? `${RUN_TAG}_${opts.label ?? opts.status}_msg`;
    doc.threadId = opts.threadId ?? `${RUN_TAG}_${opts.label ?? opts.status}_thread`;
  }
  if (opts.referenceQuestionId) doc.referenceQuestionId = opts.referenceQuestionId;
  if (opts.referenceSource) doc.referenceSource = opts.referenceSource;
  if (opts.auditorReviewType) doc.auditorReviewType = opts.auditorReviewType;

  const { insertedId } = await questions.insertOne(doc);
  createdQuestionIds.push(insertedId);

  await submissions.insertOne({
    questionId: insertedId,
    lastRespondedBy: null,
    history: [],
    queue: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return insertedId.toString();
}

// ════════════════════════════════════════════════════════════════════════
// 1. PUSH TO AUDITOR — Gate Keeper hand-off
// ════════════════════════════════════════════════════════════════════════

describe('Gate Keeper — Push to Auditor', () => {
  it('moves a dynamic question to auditor_review and stamps auditorReviewType=dynamic', async () => {
    const qId = await seedQuestion({ status: 'dynamic', label: 'push-dynamic' });

    as(gateKeeperUser);
    const res = await apiPut(`${ROUTE_PREFIX}/questions/${qId}`).send({
      status: 'auditor_review',
      gateKeeperComment: `${RUN_TAG} please review, looks dynamic`,
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('auditor_review');
    expect(q.auditorReviewType).toBe('dynamic');

    const audit = await waitForAuditTrail(qId, 'PUSH_TO_AUDITOR');
    expect(audit).not.toBeNull();
    expect(audit.context.reason).toBe(`${RUN_TAG} please review, looks dynamic`);
    expect(audit.changes.after.auditorReviewType).toBe('dynamic');
    // The comment is audit-only — never persisted on the question document.
    expect(q.gateKeeperComment).toBeUndefined();
  });

  it('moves a duplicate question to auditor_review and stamps auditorReviewType=duplicate', async () => {
    const refId = new ObjectId();
    const qId = await seedQuestion({
      status: 'duplicate',
      label: 'push-duplicate',
      referenceQuestionId: refId,
      referenceSource: 'reviewer',
    });

    as(gateKeeperUser);
    const res = await apiPut(`${ROUTE_PREFIX}/questions/${qId}`).send({
      status: 'auditor_review',
      gateKeeperComment: `${RUN_TAG} likely a duplicate, please confirm`,
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('auditor_review');
    expect(q.auditorReviewType).toBe('duplicate');

    const audit = await waitForAuditTrail(qId, 'PUSH_TO_AUDITOR');
    expect(audit).not.toBeNull();
  });

  // FINDING-004 (KNOWN GAP, diagnosed not fixed — testers only): unlike Cancel
  // Duplicate's documented gap (FINDING-003), Push to Auditor has NO precondition
  // check at all on the question's prior status. QuestionController.updateQuestion
  // derives auditorReviewType via `prevQuestion?.status === 'dynamic' ? 'dynamic' :
  // 'duplicate'` — any status that isn't exactly 'dynamic' (including one that was
  // never meant to reach the Auditor, e.g. 'open') is silently accepted and
  // mislabeled 'duplicate'.
  it('[KNOWN GAP] pushes a question to auditor_review from an unrelated prior status (open), silently mislabeling it auditorReviewType=duplicate', async () => {
    const qId = await seedQuestion({ status: 'open', label: 'push-invalid-prior-status' });

    as(gateKeeperUser);
    const res = await apiPut(`${ROUTE_PREFIX}/questions/${qId}`).send({
      status: 'auditor_review',
      gateKeeperComment: `${RUN_TAG} pushing a plain open question`,
    });
    // No precondition check exists — the request succeeds regardless of prior status.
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('auditor_review');
    // Only an exact prior status of 'dynamic' is classified 'dynamic' — everything
    // else, including this never-triaged 'open' question, becomes 'duplicate'.
    expect(q.auditorReviewType).toBe('duplicate');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 2. AUDITOR FINALIZE — Notify User (dynamic) / Push to GDB (duplicate)
// ════════════════════════════════════════════════════════════════════════

describe('Auditor — Notify User (dynamic close) / Push to GDB (duplicate close)', () => {
  it('closes a dynamic auditor_review question as dynamic_closed, stamps closedAt, and notifies the customer with status=dynamic_closed', async () => {
    const qId = await seedQuestion({
      status: 'auditor_review',
      auditorReviewType: 'dynamic',
      source: 'WHATSAPP',
      label: 'notify-user',
    });

    as(auditorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: qId,
      answer: `${RUN_TAG} apply nitrogen and monitor for zinc deficiency`,
      sources: [{ source: 'https://icar.org.in', page: '3' }],
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('dynamic_closed');
    expect(q.closedAt).toBeInstanceOf(Date);
    // [KNOWN BUG, diagnosed not fixed] QuestionService.updateQuestion has a
    // branch that stamps isClosed=true for status==='dynamic_closed' (and is
    // exercised in isolation by dynamicClosed.test.ts), but the REAL "Notify
    // User" flow never reaches it: AnswerService.approveAnswer closes the
    // question by calling `questionRepo.updateQuestion` directly (bypassing
    // QuestionService.updateQuestion entirely), and never sets `isClosed`
    // itself. So in production, a dynamic_closed question's isClosed is left
    // undefined — the unit test's coverage doesn't reflect the real call path.
    expect(q.isClosed).toBeUndefined();

    expect(triggerWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ question_id: qId, status: 'dynamic_closed' }),
      'WhatsApp',
    );
    expect(q.isCustomerNotified).toBe(true);

    const answers = await db.getCollection('answers');
    const finalAnswer = await answers.findOne({ questionId: new ObjectId(qId) });
    expect(finalAnswer.isFinalAnswer).toBe(true);
    expect(finalAnswer.status).toBe('approved');
  });

  it('closes a duplicate auditor_review question as closed (Push to GDB) and notifies with status=closed', async () => {
    const qId = await seedQuestion({
      status: 'auditor_review',
      auditorReviewType: 'duplicate',
      source: 'AJRASAKHA',
      label: 'push-to-gdb',
    });

    as(auditorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: qId,
      answer: `${RUN_TAG} side-dress nitrogen; verify zinc levels`,
      sources: [],
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('closed');
    // Only the dynamic path stamps isClosed/closedAt via the dynamic_closed branch
    // in QuestionService.updateQuestion — a plain 'closed' question is not expected
    // to carry isClosed=true (that field is specific to the dynamic_closed transition).
    expect(q.closedAt).toBeInstanceOf(Date);

    expect(triggerWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ question_id: qId, status: 'closed' }),
      'Browser',
    );
  });

  it('back-compat: a plain duplicate question (never pushed to the Auditor) still closes directly via PUT /answers', async () => {
    const qId = await seedQuestion({
      status: 'duplicate',
      source: 'WHATSAPP',
      label: 'legacy-duplicate',
    });

    as(auditorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: qId,
      answer: `${RUN_TAG} legacy direct-duplicate close`,
      sources: [],
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('closed');
  });

  // Symmetric to the plain-duplicate back-compat test above: `isDynamicClose` in
  // AnswerService.approveAnswer checks `question.status === 'dynamic'` directly,
  // independent of ever having gone through auditor_review — so a dynamic question
  // closed WITHOUT being pushed to the Auditor first still closes dynamic_closed.
  it('back-compat: a plain dynamic question (never pushed to the Auditor) still closes as dynamic_closed via PUT /answers', async () => {
    const qId = await seedQuestion({ status: 'dynamic', source: 'WHATSAPP', label: 'legacy-dynamic' });

    as(auditorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: qId,
      answer: `${RUN_TAG} legacy direct-dynamic close`,
      sources: [],
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('dynamic_closed');
    expect(q.closedAt).toBeInstanceOf(Date);

    expect(triggerWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ question_id: qId, status: 'dynamic_closed' }),
      'WhatsApp',
    );
  });

  // FINDING-005 (BUG, found while writing the answerId-precondition test below):
  // AnswerRepository.getById (src/shared/database/providers/mongo/repositories/
  // AnswerRepository.ts:177-191) does `{...answer, _id: answer._id?.toString(), ...}`
  // when `answer` itself is null (not found) — `answer._id` is evaluated BEFORE the
  // `?.`, so it's `null._id`, not null-safe. Optional chaining needed one level
  // earlier (`answer?._id`). Any PUT /answers call with a well-formed but
  // non-existent answerId throws an uncaught TypeError, wrapped as a 500
  // InternalServerError, instead of a clean 400 "answer not found".
  it('[BUG] PUT /answers with a well-formed but non-existent answerId 500s instead of a clean 400', async () => {
    const qId = await seedQuestion({
      status: 'auditor_review',
      auditorReviewType: 'dynamic',
      label: 'answerid-missing',
    });

    as(auditorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: qId,
      answerId: new ObjectId().toString(), // valid ObjectId format, but no such answer exists
      answer: `${RUN_TAG} attempting to approve via a non-existent answerId`,
      sources: [],
    });
    // Expected: 400 (answer not found). Actual: 500, from the unguarded `answer._id`
    // access in AnswerRepository.getById when the Mongo lookup returns null.
    expect(res.status).toBe(500);
    expect(res.body?.name).toBe('InternalServerError');

    const q = await getQuestion(qId);
    expect(q.status).toBe('auditor_review'); // unchanged
  });

  // FINDING-006 (documented, not a bug): sending an `answerId` that DOES exist
  // reroutes the request past the duplicate/dynamic/auditor_review fast-path (that
  // branch requires `!answerId`) into the "normal approval flow", which only accepts
  // status 'in-review'/'pae_submitted' — so an auditor_review question can only be
  // finalized by letting the endpoint create a brand-new answer (no answerId), never
  // by pointing at an existing one. Noted so it isn't mistaken for a supported path.
  it('[documented] rejects PUT /answers with an existing answerId on an auditor_review question', async () => {
    const qId = await seedQuestion({
      status: 'auditor_review',
      auditorReviewType: 'dynamic',
      label: 'answerid-on-auditor-review',
    });

    // Seed a real prior answer so the request reaches the status-precondition check
    // in AnswerService.approveAnswer rather than tripping FINDING-005 above.
    const answers = await db.getCollection('answers');
    const { insertedId: answerId } = await answers.insertOne({
      questionId: new ObjectId(qId),
      authorId: auditorUser._id,
      answerIteration: 1,
      approvalCount: 0,
      isFinalAnswer: false,
      answer: `${RUN_TAG} a prior draft answer`,
      sources: [],
      embedding: [],
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    as(auditorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: qId,
      answerId: answerId.toString(),
      answer: `${RUN_TAG} attempting to approve via an existing answerId`,
      sources: [],
    });
    expect(res.status).toBe(400);

    const q = await getQuestion(qId);
    expect(q.status).toBe('auditor_review'); // unchanged
  });
});

// ════════════════════════════════════════════════════════════════════════
// 3. CANCEL DUPLICATE — Gate Keeper reopens a queue_duplicate question
// ════════════════════════════════════════════════════════════════════════

describe('Gate Keeper — Cancel Duplicate', () => {
  it('reopens a queue_duplicate question to open, stamps isDuplicateCancelled, and honors the auto-allocate choice', async () => {
    const qId = await seedQuestion({
      status: 'queue_duplicate',
      referenceQuestionId: new ObjectId(),
      referenceSource: 'reviewer',
      isAutoAllocate: false,
      label: 'cancel-duplicate',
    });

    as(gateKeeperUser);
    const res = await apiPut(`${ROUTE_PREFIX}/questions/${qId}`).send({
      isDuplicateCancelled: true,
      duplicateCancelReason: `${RUN_TAG} not actually a duplicate`,
      isAutoAllocate: true,
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('open');
    expect(q.isDuplicateCancelled).toBe(true);
    expect(q.isAutoAllocate).toBe(true);

    const audit = await waitForAuditTrail(qId, 'CANCEL_DUPLICATE');
    expect(audit).not.toBeNull();
    expect(audit.context.reason).toBe(`${RUN_TAG} not actually a duplicate`);
  });

  // KNOWN GAP (diagnosed, not fixed — testers only): the controller sets
  // status:'open' unconditionally whenever isDuplicateCancelled===true, without
  // first checking the question is actually 'queue_duplicate'. Documented here so
  // it isn't silently reintroduced/relied upon; not something this suite patches.
  it('[KNOWN GAP] accepts isDuplicateCancelled on a question that is not queue_duplicate, reopening it anyway', async () => {
    const qId = await seedQuestion({ status: 'closed', label: 'cancel-on-closed' });

    as(gateKeeperUser);
    const res = await apiPut(`${ROUTE_PREFIX}/questions/${qId}`).send({
      isDuplicateCancelled: true,
      duplicateCancelReason: `${RUN_TAG} cancelling a question that was never queue_duplicate`,
      isAutoAllocate: false,
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    // No precondition check exists — an already-closed question is silently reopened.
    expect(q.status).toBe('open');
    expect(q.isDuplicateCancelled).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 4. CLOSE-PROPAGATION — approving a question auto-closes its queue_duplicate children
// ════════════════════════════════════════════════════════════════════════

describe('Close-propagation — approving a question closes its queue_duplicate children', () => {
  it('replicates the final answer onto each queue_duplicate child, closes them as System, and fires each child\'s own customer webhook', async () => {
    const parentId = await seedQuestion({
      status: 'duplicate',
      source: 'OUTREACH',
      label: 'propagation-parent',
    });

    const whatsappChildId = await seedQuestion({
      status: 'queue_duplicate',
      source: 'WHATSAPP',
      referenceQuestionId: new ObjectId(parentId),
      referenceSource: 'reviewer',
      isAutoAllocate: false,
      messageId: `${RUN_TAG}_wa_child_msg`,
      threadId: `${RUN_TAG}_wa_child_thread`,
      label: 'propagation-child-whatsapp',
    });

    const ajrasakhaChildId = await seedQuestion({
      status: 'queue_duplicate',
      source: 'AJRASAKHA',
      referenceQuestionId: new ObjectId(parentId),
      referenceSource: 'reviewer',
      isAutoAllocate: false,
      messageId: `${RUN_TAG}_aj_child_msg`,
      threadId: `${RUN_TAG}_aj_child_thread`,
      label: 'propagation-child-ajrasakha',
    });

    // An unrelated queue_duplicate question (references a DIFFERENT parent) must
    // NOT be touched by this approval — guards against an overbroad query.
    const unrelatedChildId = await seedQuestion({
      status: 'queue_duplicate',
      source: 'WHATSAPP',
      referenceQuestionId: new ObjectId(), // some other question entirely
      referenceSource: 'reviewer',
      label: 'propagation-unrelated',
    });

    as(auditorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: parentId,
      answer: `${RUN_TAG} the definitive final answer for this cluster`,
      sources: [{ source: 'https://icar.org.in', page: '9' }],
    });
    expect(res.status).toBe(200);

    const parent = await getQuestion(parentId);
    expect(parent.status).toBe('closed');

    const waChild = await getQuestion(whatsappChildId);
    expect(waChild.status).toBe('closed');
    expect(waChild.closedBy).toBe('System');

    const ajChild = await getQuestion(ajrasakhaChildId);
    expect(ajChild.status).toBe('closed');
    expect(ajChild.closedBy).toBe('System');

    const unrelated = await getQuestion(unrelatedChildId);
    expect(unrelated.status).toBe('queue_duplicate'); // untouched
    expect(unrelated.closedBy).toBeUndefined();

    const answers = await db.getCollection('answers');
    const waAnswer = await answers.findOne({ questionId: new ObjectId(whatsappChildId) });
    expect(waAnswer).not.toBeNull();
    expect(waAnswer.answer).toBe(`${RUN_TAG} the definitive final answer for this cluster`);
    expect(waAnswer.isFinalAnswer).toBe(true);

    const ajAnswer = await answers.findOne({ questionId: new ObjectId(ajrasakhaChildId) });
    expect(ajAnswer).not.toBeNull();
    expect(ajAnswer.isFinalAnswer).toBe(true);

    // Each question notifies its OWN customer with its OWN messageId/threadId —
    // not just the parent's. Parent is OUTREACH (no webhook fires for it).
    expect(triggerWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ question_id: whatsappChildId, status: 'closed' }),
      'WhatsApp',
    );
    expect(triggerWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        question_id: ajrasakhaChildId,
        status: 'closed',
        messageId: `${RUN_TAG}_aj_child_msg`,
      }),
      'Browser',
    );
    // Only the 2 real children notify — the unrelated question's webhook never fires.
    expect(triggerWebhook).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ question_id: unrelatedChildId }),
      expect.anything(),
    );
  });

  // FINDING-007 (documented, not fixed): the child-close code path
  // (AnswerService.approveAnswer, ~line 2092) hardcodes `status: 'closed'` for every
  // queue_duplicate child, regardless of what the PARENT actually closed as. When the
  // parent is a 'dynamic' question (closes 'dynamic_closed'), its children still end
  // up 'closed', not 'dynamic_closed' — a status mismatch between parent and replica.
  it('[FINDING] when the parent closes as dynamic_closed, its queue_duplicate children still close as plain closed (status mismatch)', async () => {
    const parentId = await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      label: 'dynamic-propagation-parent',
    });

    const childId = await seedQuestion({
      status: 'queue_duplicate',
      source: 'WHATSAPP',
      referenceQuestionId: new ObjectId(parentId),
      referenceSource: 'reviewer',
      isAutoAllocate: false,
      label: 'dynamic-propagation-child',
    });

    as(auditorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: parentId,
      answer: `${RUN_TAG} dynamic parent final answer`,
      sources: [],
    });
    expect(res.status).toBe(200);

    const parent = await getQuestion(parentId);
    expect(parent.status).toBe('dynamic_closed');

    const child = await getQuestion(childId);
    expect(child.status).toBe('closed'); // not 'dynamic_closed' — see FINDING-007
    expect(child.closedBy).toBe('System');

    expect(triggerWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ question_id: childId, status: 'closed' }),
      'WhatsApp',
    );
  });
});

// ════════════════════════════════════════════════════════════════════════
// 5. KNOWN GAP — no role guard on Gate Keeper / Auditor-only actions
// ════════════════════════════════════════════════════════════════════════
//
// The frontend hides Push-to-Auditor / Cancel-Duplicate behind
// `currentUser.role === 'gate_keeper'`, but the backend endpoint
// (PUT /api/questions/:questionId) has no role check at all — only
// `@UseBefore(FlexibleAuth)` + `verifyNotTester`. Documented here (diagnose,
// don't patch app code per QA-only role) so this isn't mistaken for "covered by
// RBAC" during future work on these actions.
describe('[KNOWN GAP] no backend role guard on Gate Keeper / Auditor actions', () => {
  it('an expert user can push a question to auditor_review directly via the API', async () => {
    const qId = await seedQuestion({ status: 'dynamic', label: 'rbac-gap-push' });

    as(expertUser);
    const res = await apiPut(`${ROUTE_PREFIX}/questions/${qId}`).send({
      status: 'auditor_review',
      gateKeeperComment: `${RUN_TAG} an expert should not be able to do this`,
    });
    // No role guard exists on this endpoint — the request succeeds.
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('auditor_review');
  });

  it('an expert user can cancel a duplicate directly via the API', async () => {
    const qId = await seedQuestion({
      status: 'queue_duplicate',
      referenceQuestionId: new ObjectId(),
      label: 'rbac-gap-cancel',
    });

    as(expertUser);
    const res = await apiPut(`${ROUTE_PREFIX}/questions/${qId}`).send({
      isDuplicateCancelled: true,
      duplicateCancelReason: `${RUN_TAG} expert cancelling a duplicate`,
      isAutoAllocate: false,
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('open');
  });

  // Contrast: PUT /answers DOES have a role check (AnswerService.approveAnswer
  // throws UnauthorizedError for role==='expert'), so the Auditor-finalize step
  // is NOT part of this gap — only the Gate-Keeper-side question-update actions are.
  it('an expert user is still blocked from the Auditor-finalize endpoint (PUT /answers)', async () => {
    const qId = await seedQuestion({
      status: 'auditor_review',
      auditorReviewType: 'dynamic',
      label: 'rbac-contrast',
    });

    as(expertUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: qId,
      answer: `${RUN_TAG} expert trying to finalize`,
      sources: [],
    });
    expect(res.status).toBe(400);

    const q = await getQuestion(qId);
    expect(q.status).toBe('auditor_review'); // unchanged
  });

  // Extends FINDING-002: the "role gap" isn't specific to gate_keeper/auditor.
  // AnswerService.approveAnswer's role check is a BLACKLIST of only role==='expert'
  // (AnswerService.ts:1797) — every other role, including one with no business reason
  // to finalize questions (call_agent), is let through PUT /answers too.
  it('[KNOWN GAP] a call_agent user (not auditor/moderator/admin) can also finalize via PUT /answers', async () => {
    const qId = await seedQuestion({ status: 'duplicate', label: 'rbac-gap-call-agent' });

    as(callAgentUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: qId,
      answer: `${RUN_TAG} call_agent finalizing a duplicate question`,
      sources: [],
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('closed');
  });
});
