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
 *   4. CONFIRM DUPLICATE — POST /api/answers/:questionId/confirm-duplicate
 *      (AnswerService.confirmDuplicate). Gate Keeper confirms a 'queue_duplicate'
 *      question is indeed a duplicate of its referenceQuestionId:
 *        - reference already closed  → replicates its final answer, closes THIS
 *          question ('closed'), notifies the customer immediately.
 *        - reference still open      → moves to 'duplicate_confirmed' to await the
 *          reference's own close (see CLOSE-PROPAGATION below).
 *      Either way frees the gate keeper (freeRoleAssigneeOnStatusChange).
 *
 *   5. CLOSE-PROPAGATION — approving/closing any question now auto-closes every
 *      'duplicate_confirmed' question that referenced it (status gate changed from
 *      'queue_duplicate' on 2026-07-03, once Confirm Duplicate landed — an
 *      unconfirmed 'queue_duplicate' child is now deliberately left untouched): the
 *      final answer is replicated, each child is stamped closedBy:'System', its
 *      moderator assignment is cleared, and its own customer webhook fires
 *      independently (AnswerService.notifyCustomerOnClose, extracted for reuse).
 *
 *   6. QUEUE CRON (single-allocation) — gateKeeperAuditorQueueCron.ts /
 *      QuestionService.runGateKeeperAuditorQueueCron. Every minute (prod only; gated
 *      by `!appConfig.isDevelopment`), pairs each free gate_keeper/auditor (zero
 *      `assignedQuestionIds`, not blocked) with the oldest unassigned eligible
 *      question for their role (status match, `autoAllocate{GateKeeper,Auditor}`
 *      explicitly true, not on hold, source ∈ {AJRASAKHA, WHATSAPP}), atomically
 *      stamping gateKeeperId/auditorId + assignedAt and pushing the user's
 *      assignedQuestionIds. freeRoleAssigneeOnStatusChange (called from
 *      updateQuestion/approveAnswer/confirmDuplicate) frees the user again — clears
 *      assignedQuestionIds, stamps gateKeeperFinishedAt/auditorFinishedAt — once the
 *      question's status leaves that role's handling set, enabling the next pass.
 *
 * WHAT THIS DOES NOT COVER
 * ------------------------
 * Ingestion-time detection of 'queue_duplicate' (AiService.checkPendingDuplicate
 * called from runDuplicateCheckPipeline) is covered in WhatsAppQuestion.e2e.test.ts
 * and AjrasakhaQuestion.e2e.test.ts, not here — this suite seeds terminal-state
 * questions directly and drives only the gate-keeper/auditor/close-propagation/
 * queue-cron transitions. Also not covered: the manual role-(re)assignment
 * endpoints (PATCH/DELETE /questions/:questionId/role-assignee) and the
 * autoAllocate toggle endpoint — these are admin/moderator tooling around the same
 * assignedQuestionIds mechanics exercised here via the cron.
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
 *
 * The queue cron (runGateKeeperAuditorQueueCron) never self-schedules in this harness
 * (NODE_ENV='development' disables the node-cron registration) — tests call
 * questionService.runGateKeeperAuditorQueueCron() directly, same pattern as
 * questionService.reallocateTimeBoundQuestions() in AutoAllocation.e2e.test.ts.
 * Because this runs against the real shared Atlas DB, cron tests avoid asserting
 * exact global pairing (which of possibly-many real free users gets which question)
 * and instead check filtering logic in isolation, or use a deliberately ancient
 * createdAt so a seeded question is guaranteed the global oldest match.
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
let questionService: any;
let questionRepo: any;
let userRepo: any;

let gateKeeperUser: any;
let auditorUser: any;
let expertUser: any;
let callAgentUser: any;

// Swapped per request — currentUserChecker returns this.
let currentTestUser: any = null;

const createdQuestionIds: ObjectId[] = [];
const createdUserIds: ObjectId[] = [];
let userCounter = 0;

/** Insert a fresh RUN_TAG-tagged user of the given role directly into Mongo (no
 *  .env.test fixtures exist for gate_keeper/auditor). `assignedQuestionIds` lets a
 *  test seed a user as already "busy" for single-allocation cron tests. */
async function makeUser(role: string, assignedQuestionIds?: any[]): Promise<any> {
  const users = await db.getCollection('users');
  const tag = `${role}_${++userCounter}`;
  const { insertedId } = await users.insertOne({
    firebaseUID: `${RUN_TAG}_${tag}`,
    email: `${RUN_TAG}_${tag}@example.com`,
    firstName: RUN_TAG,
    lastName: role,
    role,
    incentive: 0,
    penalty: 0,
    isBlocked: false,
    assignedQuestionIds: assignedQuestionIds ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  createdUserIds.push(insertedId);
  return users.findOne({ _id: insertedId });
}

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
  questionService = container.get(CORE_TYPES.QuestionService);
  questionRepo = container.get(CORE_TYPES.QuestionRepository);
  userRepo = container.get(CORE_TYPES.UserRepository);

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
  autoAllocateGateKeeper?: boolean;
  autoAllocateAuditor?: boolean;
  isOnHold?: boolean;
  createdAt?: Date;
  gateKeeperId?: ObjectId;
  auditorId?: ObjectId;
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
    createdAt: opts.createdAt ?? new Date(),
    updatedAt: new Date(),
  };
  if (opts.source === 'WHATSAPP' || opts.source === 'AJRASAKHA') {
    doc.messageId = opts.messageId ?? `${RUN_TAG}_${opts.label ?? opts.status}_msg`;
    doc.threadId = opts.threadId ?? `${RUN_TAG}_${opts.label ?? opts.status}_thread`;
  }
  if (opts.referenceQuestionId) doc.referenceQuestionId = opts.referenceQuestionId;
  if (opts.referenceSource) doc.referenceSource = opts.referenceSource;
  if (opts.auditorReviewType) doc.auditorReviewType = opts.auditorReviewType;
  if (opts.autoAllocateGateKeeper !== undefined) doc.autoAllocateGateKeeper = opts.autoAllocateGateKeeper;
  if (opts.autoAllocateAuditor !== undefined) doc.autoAllocateAuditor = opts.autoAllocateAuditor;
  if (opts.isOnHold !== undefined) doc.isOnHold = opts.isOnHold;
  if (opts.gateKeeperId) doc.gateKeeperId = opts.gateKeeperId;
  if (opts.auditorId) doc.auditorId = opts.auditorId;

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
// 4. CONFIRM DUPLICATE — Gate Keeper confirms a queue_duplicate question
//    (POST /api/answers/:questionId/confirm-duplicate, AnswerService.confirmDuplicate)
// ════════════════════════════════════════════════════════════════════════

describe('Gate Keeper — Confirm Duplicate', () => {
  it('CASE A: reference question already closed — replicates its final answer, closes the question, and notifies the customer', async () => {
    const refId = await seedQuestion({
      status: 'closed',
      source: 'WHATSAPP',
      label: 'confirm-dup-ref-closed',
    });
    const answers = await db.getCollection('answers');
    await answers.insertOne({
      questionId: new ObjectId(refId),
      authorId: auditorUser._id,
      answerIteration: 1,
      approvalCount: 1,
      isFinalAnswer: true,
      answer: `${RUN_TAG} the reference's final answer`,
      sources: [{ source: 'https://icar.org.in', page: '1' }],
      embedding: [],
      status: 'approved',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const qId = await seedQuestion({
      status: 'queue_duplicate',
      source: 'WHATSAPP',
      referenceQuestionId: new ObjectId(refId),
      gateKeeperId: gateKeeperUser._id,
      label: 'confirm-dup-case-a',
    });

    as(gateKeeperUser);
    const postRes = await request(app)
      .post(`${ROUTE_PREFIX}/answers/${qId}/confirm-duplicate`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .send({});
    expect(postRes.status).toBe(200);
    expect(postRes.body?.status).toBe('closed');

    const q = await getQuestion(qId);
    expect(q.status).toBe('closed');
    expect(q.closedAt).toBeInstanceOf(Date);
    expect(q.closedBy).toBe('System');

    const replicated = await answers.findOne({ questionId: new ObjectId(qId) });
    expect(replicated).not.toBeNull();
    expect(replicated.answer).toBe(`${RUN_TAG} the reference's final answer`);
    expect(replicated.isFinalAnswer).toBe(true);

    expect(triggerWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ question_id: qId, status: 'closed' }),
      'WhatsApp',
    );
  });

  it('CASE B: reference question still open — moves the question to duplicate_confirmed without closing it', async () => {
    const refId = await seedQuestion({ status: 'open', source: 'WHATSAPP', label: 'confirm-dup-ref-open' });
    const qId = await seedQuestion({
      status: 'queue_duplicate',
      source: 'WHATSAPP',
      referenceQuestionId: new ObjectId(refId),
      label: 'confirm-dup-case-b',
    });

    const res = await request(app)
      .post(`${ROUTE_PREFIX}/answers/${qId}/confirm-duplicate`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .send({});
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('duplicate_confirmed');
    expect(q.closedAt).toBeUndefined();
    expect(triggerWebhook).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ question_id: qId }),
      expect.anything(),
    );
  });

  it('frees the assigned gate keeper (assignedQuestionIds cleared, gateKeeperFinishedAt stamped) once confirmed', async () => {
    const freeGateKeeper = await makeUser('gate_keeper');
    const refId = await seedQuestion({ status: 'open', source: 'WHATSAPP', label: 'confirm-dup-free-ref' });
    const qId = await seedQuestion({
      status: 'queue_duplicate',
      source: 'WHATSAPP',
      referenceQuestionId: new ObjectId(refId),
      gateKeeperId: freeGateKeeper._id,
      label: 'confirm-dup-free-gk',
    });
    const users = await db.getCollection('users');
    await users.updateOne(
      { _id: freeGateKeeper._id },
      { $set: { assignedQuestionIds: [{ questionId: new ObjectId(qId), status: 'queue_duplicate', source: 'WHATSAPP' }] } },
    );

    await request(app)
      .post(`${ROUTE_PREFIX}/answers/${qId}/confirm-duplicate`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .send({});

    const q = await getQuestion(qId);
    expect(q.status).toBe('duplicate_confirmed');
    expect(q.gateKeeperFinishedAt).toBeInstanceOf(Date);

    const refreshedUser = await users.findOne({ _id: freeGateKeeper._id });
    expect(refreshedUser.assignedQuestionIds ?? []).toHaveLength(0);
  });

  it('rejects confirm-duplicate on a question that is not queue_duplicate (precondition)', async () => {
    const qId = await seedQuestion({ status: 'open', label: 'confirm-dup-wrong-status' });

    const res = await request(app)
      .post(`${ROUTE_PREFIX}/answers/${qId}/confirm-duplicate`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .send({});
    expect(res.status).toBe(400);

    const q = await getQuestion(qId);
    expect(q.status).toBe('open'); // unchanged
  });

  it('rejects confirm-duplicate when the question has no referenceQuestionId', async () => {
    const qId = await seedQuestion({ status: 'queue_duplicate', label: 'confirm-dup-no-ref' });

    const res = await request(app)
      .post(`${ROUTE_PREFIX}/answers/${qId}/confirm-duplicate`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .send({});
    expect(res.status).toBe(400);
  });

  // [KNOWN GAP] Consistent with Push to Auditor / Cancel Duplicate: the endpoint is
  // only `@Authorized()` + verifyNotTester(user) — no `gate_keeper` role restriction.
  it('[KNOWN GAP] an expert user can confirm-duplicate directly via the API', async () => {
    const refId = await seedQuestion({ status: 'open', source: 'WHATSAPP', label: 'confirm-dup-rbac-ref' });
    const qId = await seedQuestion({
      status: 'queue_duplicate',
      source: 'WHATSAPP',
      referenceQuestionId: new ObjectId(refId),
      label: 'confirm-dup-rbac-gap',
    });

    as(expertUser);
    const res = await request(app)
      .post(`${ROUTE_PREFIX}/answers/${qId}/confirm-duplicate`)
      .set('x-internal-api-key', INTERNAL_API_KEY)
      .send({});
    // No role guard exists on this endpoint either — the request succeeds.
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.status).toBe('duplicate_confirmed');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 5. CLOSE-PROPAGATION — approving a question auto-closes its duplicate_confirmed children
//    (child status gate changed from 'queue_duplicate' → 'duplicate_confirmed' on
//    2026-07-03, once Confirm Duplicate landed — see AnswerService.approveAnswer,
//    ~line 2073: `findByReferenceQuestionId(questionId, 'duplicate_confirmed', session)`.
//    An unconfirmed 'queue_duplicate' child is now left untouched by the parent's
//    close — it stays in the gate-keeper queue until a gate keeper acts on it.)
// ════════════════════════════════════════════════════════════════════════

describe('Close-propagation — approving a question closes its duplicate_confirmed children', () => {
  it('replicates the final answer onto each duplicate_confirmed child, closes them as System, and fires each child\'s own customer webhook', async () => {
    const parentId = await seedQuestion({
      status: 'duplicate',
      source: 'OUTREACH',
      label: 'propagation-parent',
    });

    const whatsappChildId = await seedQuestion({
      status: 'duplicate_confirmed',
      source: 'WHATSAPP',
      referenceQuestionId: new ObjectId(parentId),
      referenceSource: 'reviewer',
      isAutoAllocate: false,
      messageId: `${RUN_TAG}_wa_child_msg`,
      threadId: `${RUN_TAG}_wa_child_thread`,
      label: 'propagation-child-whatsapp',
    });

    const ajrasakhaChildId = await seedQuestion({
      status: 'duplicate_confirmed',
      source: 'AJRASAKHA',
      referenceQuestionId: new ObjectId(parentId),
      referenceSource: 'reviewer',
      isAutoAllocate: false,
      messageId: `${RUN_TAG}_aj_child_msg`,
      threadId: `${RUN_TAG}_aj_child_thread`,
      label: 'propagation-child-ajrasakha',
    });

    // An unrelated duplicate_confirmed question (references a DIFFERENT parent) must
    // NOT be touched by this approval — guards against an overbroad query.
    const unrelatedChildId = await seedQuestion({
      status: 'duplicate_confirmed',
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
    expect(unrelated.status).toBe('duplicate_confirmed'); // untouched
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
  // (AnswerService.approveAnswer, ~line 2073) hardcodes `status: 'closed'` for every
  // duplicate_confirmed child, regardless of what the PARENT actually closed as. When
  // the parent is a 'dynamic' question (closes 'dynamic_closed'), its children still
  // end up 'closed', not 'dynamic_closed' — a status mismatch between parent and replica.
  it('[FINDING] when the parent closes as dynamic_closed, its duplicate_confirmed children still close as plain closed (status mismatch)', async () => {
    const parentId = await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      label: 'dynamic-propagation-parent',
    });

    const childId = await seedQuestion({
      status: 'duplicate_confirmed',
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

  // Since 2026-07-03 (commit 22d5622c8), the propagation query targets
  // 'duplicate_confirmed' children, not 'queue_duplicate' ones — an unconfirmed
  // queue_duplicate question (a gate keeper hasn't run Confirm Duplicate on it yet)
  // is deliberately left alone when its would-be parent closes; it stays in the
  // gate-keeper queue until a gate keeper acts on it (Confirm Duplicate or Cancel).
  it('leaves an unconfirmed queue_duplicate child untouched when its reference question closes (propagation requires duplicate_confirmed first)', async () => {
    const parentId = await seedQuestion({
      status: 'duplicate',
      source: 'WHATSAPP',
      label: 'unconfirmed-propagation-parent',
    });

    const unconfirmedChildId = await seedQuestion({
      status: 'queue_duplicate',
      source: 'WHATSAPP',
      referenceQuestionId: new ObjectId(parentId),
      referenceSource: 'reviewer',
      isAutoAllocate: false,
      label: 'unconfirmed-propagation-child',
    });

    as(auditorUser);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: parentId,
      answer: `${RUN_TAG} parent closes while child is still unconfirmed`,
      sources: [],
    });
    expect(res.status).toBe(200);

    const parent = await getQuestion(parentId);
    expect(parent.status).toBe('closed');

    const child = await getQuestion(unconfirmedChildId);
    expect(child.status).toBe('queue_duplicate'); // untouched — never confirmed
    expect(child.closedBy).toBeUndefined();

    expect(triggerWebhook).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ question_id: unconfirmedChildId }),
      expect.anything(),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════
// 5. QUEUE CRON — single-allocation auto-assignment
//    (gateKeeperAuditorQueueCron.ts → QuestionService.runGateKeeperAuditorQueueCron)
//
//    The cron itself only registers when `!appConfig.isDevelopment`
//    (bootstrap/jobs/gateKeeperAuditorQueueCron.ts) — this harness runs with
//    NODE_ENV='development' (TLS workaround, see file header), so node-cron never
//    schedules the job here. Same pattern as reallocateTimeBoundQuestions() in
//    AutoAllocation.e2e.test.ts: call the underlying service method directly.
//
//    Because this suite runs against the real (shared) Atlas DB, tests avoid
//    asserting exact global pairing outcomes (which free user among possibly many
//    real ones gets which question) and instead assert:
//      - filtering logic in isolation (findUnassignedQuestionsForRole /
//        findAvailableUsersByRole), checking only the RELATIVE presence/order of
//        this test's own seeded documents — robust regardless of unrelated data;
//      - one full runGateKeeperAuditorQueueCron() integration test using a
//        deliberately ancient createdAt so the seeded question is guaranteed to be
//        the global oldest match (the gate_keeper/auditor roles/statuses didn't
//        exist before 2026-07-01, so no real data can be older);
//      - freeRoleAssigneeOnStatusChange via the existing manual-action endpoints,
//        which is the other half of single-allocation (freeing a user once they act).
// ════════════════════════════════════════════════════════════════════════

describe('Queue Cron — eligibility filtering (findUnassignedQuestionsForRole / findAvailableUsersByRole)', () => {
  it('findUnassignedQuestionsForRole returns eligible dynamic/duplicate/queue_duplicate questions oldest-first', async () => {
    const older = await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      autoAllocateGateKeeper: true,
      createdAt: new Date('2000-01-01'),
      label: 'cron-order-older',
    });
    const newer = await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      autoAllocateGateKeeper: true,
      createdAt: new Date('2000-06-01'),
      label: 'cron-order-newer',
    });

    const results = await questionRepo.findUnassignedQuestionsForRole(
      ['dynamic', 'duplicate', 'queue_duplicate'],
      'gateKeeperId',
      'autoAllocateGateKeeper',
    );
    const ids = results.map((q: any) => q._id.toString());
    expect(ids).toContain(older);
    expect(ids).toContain(newer);
    expect(ids.indexOf(older)).toBeLessThan(ids.indexOf(newer));
  });

  it('findUnassignedQuestionsForRole excludes a question whose autoAllocateGateKeeper is false or missing', async () => {
    const offId = await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      autoAllocateGateKeeper: false,
      label: 'cron-autoalloc-off',
    });
    const missingId = await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      label: 'cron-autoalloc-missing', // autoAllocateGateKeeper never set
    });

    const results = await questionRepo.findUnassignedQuestionsForRole(
      ['dynamic', 'duplicate', 'queue_duplicate'],
      'gateKeeperId',
      'autoAllocateGateKeeper',
    );
    const ids = results.map((q: any) => q._id.toString());
    expect(ids).not.toContain(offId);
    expect(ids).not.toContain(missingId);
  });

  it('findUnassignedQuestionsForRole excludes a question that is on hold', async () => {
    const onHoldId = await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      autoAllocateGateKeeper: true,
      isOnHold: true,
      label: 'cron-on-hold',
    });

    const results = await questionRepo.findUnassignedQuestionsForRole(
      ['dynamic', 'duplicate', 'queue_duplicate'],
      'gateKeeperId',
      'autoAllocateGateKeeper',
    );
    const ids = results.map((q: any) => q._id.toString());
    expect(ids).not.toContain(onHoldId);
  });

  it('findUnassignedQuestionsForRole excludes non-chatbot sources even if otherwise eligible (gate keeper/auditor only handle AJRASAKHA/WHATSAPP)', async () => {
    const agriExpertId = await seedQuestion({
      status: 'dynamic',
      source: 'AGRI_EXPERT',
      autoAllocateGateKeeper: true,
      label: 'cron-source-agri-expert',
    });
    const outreachId = await seedQuestion({
      status: 'dynamic',
      source: 'OUTREACH',
      autoAllocateGateKeeper: true,
      label: 'cron-source-outreach',
    });

    const results = await questionRepo.findUnassignedQuestionsForRole(
      ['dynamic', 'duplicate', 'queue_duplicate'],
      'gateKeeperId',
      'autoAllocateGateKeeper',
    );
    const ids = results.map((q: any) => q._id.toString());
    expect(ids).not.toContain(agriExpertId);
    expect(ids).not.toContain(outreachId);
  });

  it('findUnassignedQuestionsForRole excludes a question that already has a gateKeeperId assigned', async () => {
    const alreadyAssignedId = await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      autoAllocateGateKeeper: true,
      gateKeeperId: gateKeeperUser._id,
      label: 'cron-already-assigned',
    });

    const results = await questionRepo.findUnassignedQuestionsForRole(
      ['dynamic', 'duplicate', 'queue_duplicate'],
      'gateKeeperId',
      'autoAllocateGateKeeper',
    );
    const ids = results.map((q: any) => q._id.toString());
    expect(ids).not.toContain(alreadyAssignedId);
  });

  it('findAvailableUsersByRole excludes a gate keeper who already holds an assigned question (single-allocation)', async () => {
    const busyGateKeeper = await makeUser('gate_keeper', [
      { questionId: new ObjectId(), status: 'dynamic', source: 'WHATSAPP' },
    ]);
    const freeGateKeeper = await makeUser('gate_keeper');

    const available = await userRepo.findAvailableUsersByRole('gate_keeper');
    const ids = available.map((u: any) => u._id.toString());
    expect(ids).not.toContain(busyGateKeeper._id.toString());
    expect(ids).toContain(freeGateKeeper._id.toString());
  });
});

describe('Queue Cron — runGateKeeperAuditorQueueCron (full integration)', () => {
  it('assigns a free gate keeper to an eligible dynamic question, stamping gateKeeperId/gateKeeperAssignedAt and adding it to the assignee\'s assignedQuestionIds', async () => {
    const qId = await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      autoAllocateGateKeeper: true,
      // Guaranteed globally oldest — gate_keeper/autoAllocateGateKeeper didn't exist
      // before 2026-07-01, so no unrelated real data can predate this.
      createdAt: new Date('1990-01-01'),
      label: 'cron-full-gatekeeper',
    });

    await questionService.runGateKeeperAuditorQueueCron();

    const q = await getQuestion(qId);
    expect(q.gateKeeperId).toBeTruthy();
    expect(q.gateKeeperAssignedAt).toBeInstanceOf(Date);

    const users = await db.getCollection('users');
    const assignee = await users.findOne({ _id: new ObjectId(q.gateKeeperId) });
    expect(assignee).not.toBeNull();
    expect(assignee.role).toBe('gate_keeper');
    const entry = (assignee.assignedQuestionIds ?? []).find(
      (a: any) => a.questionId.toString() === qId,
    );
    expect(entry).toBeDefined();

    // No longer eligible for a second pass — it now has a gateKeeperId.
    const stillUnassigned = await questionRepo.findUnassignedQuestionsForRole(
      ['dynamic', 'duplicate', 'queue_duplicate'],
      'gateKeeperId',
      'autoAllocateGateKeeper',
    );
    expect(stillUnassigned.map((r: any) => r._id.toString())).not.toContain(qId);
  });

  it('assigns a free auditor to an eligible auditor_review question, stamping auditorId/auditorAssignedAt', async () => {
    const qId = await seedQuestion({
      status: 'auditor_review',
      source: 'AJRASAKHA',
      autoAllocateAuditor: true,
      auditorReviewType: 'dynamic',
      createdAt: new Date('1990-01-01'),
      label: 'cron-full-auditor',
    });

    await questionService.runGateKeeperAuditorQueueCron();

    const q = await getQuestion(qId);
    expect(q.auditorId).toBeTruthy();
    expect(q.auditorAssignedAt).toBeInstanceOf(Date);

    const users = await db.getCollection('users');
    const assignee = await users.findOne({ _id: new ObjectId(q.auditorId) });
    expect(assignee?.role).toBe('auditor');
  });

  it('does not touch a busy gate keeper\'s assignment count — a pre-assigned user is skipped entirely by the cron', async () => {
    const preAssignedQuestionId = new ObjectId();
    const busyGateKeeper = await makeUser('gate_keeper', [
      { questionId: preAssignedQuestionId, status: 'dynamic', source: 'WHATSAPP' },
    ]);
    await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      autoAllocateGateKeeper: true,
      createdAt: new Date('1990-06-01'),
      label: 'cron-busy-skip',
    });

    await questionService.runGateKeeperAuditorQueueCron();

    const users = await db.getCollection('users');
    const refreshed = await users.findOne({ _id: busyGateKeeper._id });
    // Still exactly the one pre-existing assignment — cron never touched this user.
    expect(refreshed.assignedQuestionIds).toHaveLength(1);
    expect(refreshed.assignedQuestionIds[0].questionId.toString()).toBe(
      preAssignedQuestionId.toString(),
    );
  });
});

describe('Queue Cron — freeRoleAssigneeOnStatusChange (frees a user once they act, enabling the next cron pass)', () => {
  it('Push to Auditor frees the gate keeper: assignedQuestionIds entry removed and gateKeeperFinishedAt stamped', async () => {
    const freeingGateKeeper = await makeUser('gate_keeper');
    const qId = await seedQuestion({
      status: 'dynamic',
      source: 'WHATSAPP',
      gateKeeperId: freeingGateKeeper._id,
      label: 'free-on-push-to-auditor',
    });
    const users = await db.getCollection('users');
    await users.updateOne(
      { _id: freeingGateKeeper._id },
      { $set: { assignedQuestionIds: [{ questionId: new ObjectId(qId), status: 'dynamic', source: 'WHATSAPP' }] } },
    );

    as(gateKeeperUser);
    const res = await apiPut(`${ROUTE_PREFIX}/questions/${qId}`).send({
      status: 'auditor_review',
      gateKeeperComment: `${RUN_TAG} handing off to the auditor`,
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.gateKeeperFinishedAt).toBeInstanceOf(Date);

    const refreshed = await users.findOne({ _id: freeingGateKeeper._id });
    expect(refreshed.assignedQuestionIds ?? []).toHaveLength(0);
  });

  it('Auditor finalize (PUT /answers) frees the auditor: assignedQuestionIds entry removed and auditorFinishedAt stamped', async () => {
    const freeingAuditor = await makeUser('auditor');
    const qId = await seedQuestion({
      status: 'auditor_review',
      auditorReviewType: 'dynamic',
      source: 'WHATSAPP',
      auditorId: freeingAuditor._id,
      label: 'free-on-auditor-finalize',
    });
    const users = await db.getCollection('users');
    await users.updateOne(
      { _id: freeingAuditor._id },
      { $set: { assignedQuestionIds: [{ questionId: new ObjectId(qId), status: 'auditor_review', source: 'WHATSAPP' }] } },
    );

    as(freeingAuditor);
    const res = await apiPut(`${ROUTE_PREFIX}/answers`).send({
      questionId: qId,
      answer: `${RUN_TAG} finalizing to free the auditor`,
      sources: [],
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.auditorFinishedAt).toBeInstanceOf(Date);

    const refreshed = await users.findOne({ _id: freeingAuditor._id });
    expect(refreshed.assignedQuestionIds ?? []).toHaveLength(0);
  });

  it('Cancel Duplicate frees the gate keeper the same way (status leaves queue_duplicate → open)', async () => {
    const freeingGateKeeper = await makeUser('gate_keeper');
    const qId = await seedQuestion({
      status: 'queue_duplicate',
      referenceQuestionId: new ObjectId(),
      gateKeeperId: freeingGateKeeper._id,
      label: 'free-on-cancel-duplicate',
    });
    const users = await db.getCollection('users');
    await users.updateOne(
      { _id: freeingGateKeeper._id },
      { $set: { assignedQuestionIds: [{ questionId: new ObjectId(qId), status: 'queue_duplicate', source: 'WHATSAPP' }] } },
    );

    as(gateKeeperUser);
    const res = await apiPut(`${ROUTE_PREFIX}/questions/${qId}`).send({
      isDuplicateCancelled: true,
      duplicateCancelReason: `${RUN_TAG} freeing via cancel`,
      isAutoAllocate: false,
    });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.gateKeeperFinishedAt).toBeInstanceOf(Date);

    const refreshed = await users.findOne({ _id: freeingGateKeeper._id });
    expect(refreshed.assignedQuestionIds ?? []).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 6. KNOWN GAP — no role guard on Gate Keeper / Auditor-only actions
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
