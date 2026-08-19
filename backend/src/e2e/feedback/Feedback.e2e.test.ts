/**
 * Feedback Workflow — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 * A CLOSED question can receive feedback from three independent sources, tracked
 * per-source on `question.feedbacks[]` (`{source, status}`, source ∈
 * 'PAE_Validation' | 'DATASET' | 'WEB_APPLICATION'):
 *
 *   1. PAE_Validation (internal, real user)
 *      Every question-close path (AnswerService.approveAnswer, dynamic/duplicate
 *      close, PUT /answers) unconditionally stamps `paeValidation:'pending'` +
 *      `autoAllocatePaeValidationExpert:true`. QuestionService.runPaeValidationQueueCron
 *      assigns pending questions to available `pae_expert`-role users (domain+state
 *      preference match; no preference = matches anything). The PAE expert then
 *      POSTs /pae/validations/process:
 *        status:'approve'  → paeValidation 'completed', expert freed.
 *        status:'feedback' → creates a `feedbacks` collection doc + a
 *          question.feedbacks entry (source PAE_Validation, open), sets
 *          `autoAllocateFeedback:true` — AND still frees the expert (see
 *          [FINDING-009] below).
 *
 *   2. DATASET — the "chat app" source (dummied here)
 *   3. WEB_APPLICATION — the "general public site" source (dummied here)
 *      Both are external in origin: the actual feedback content lives in an
 *      external service (data-release app / web app), not this backend. That
 *      service notifies us via PATCH /questions/feedbacks/question/:questionId
 *      (InternalApiAuth, header x-internal-api-key) with {source}, which opens
 *      that source's entry (QuestionService.handleFeedbackStatusUpdate →
 *      QuestionRepository.addOrUpdateFeedbackStatus). Since the actual chat-app /
 *      public-site UIs are out of scope for this backend, both are simulated here
 *      by calling that internal webhook directly — the "dummying" the user asked for.
 *
 *   ROUTING (moderator busy → auditor fallback)
 *   QuestionService.runModeratorQueueCron's "feedback pass" (~QuestionService.ts:7245)
 *   treats an open feedback as a time-bound item competing for the moderator's
 *   single slot. Target = the final answer's `approvedBy` moderator IF active,
 *   non-blocked, role='moderator', and not already holding a feedback; ELSE an
 *   available auditor (role='auditor', no time-bound item, no existing feedback).
 *
 *   SETTLEMENT (accept/reject)
 *   POST /questions/:questionId/:feedbackId/feedback-action → handleFeedbackAction.
 *   For PAE_Validation it updates the local `feedbacks` collection doc directly.
 *   For DATASET/WEB_APPLICATION it calls OUT to the external service
 *   (DATA_RELEASE_URL+REVIEW_SYSTEM_AUTH_KEY, or WEB_APP_URL+WEB_WEBHOOK_API_KEY)
 *   and only closes the source locally once that response reports
 *   `pendingFeedbackCount <= 0` — mocked here via vi.spyOn(global.fetch) since
 *   this outbound call isn't behind an injectable seam (unlike AiService). A
 *   question is released from feedback (reviewer's feedbacksAssigned cleared,
 *   review round finished) only once EVERY open source is closed — a question can
 *   have all 3 sources open simultaneously.
 *
 *   MANUAL ADMIN CONTROLS
 *   assignFeedbackReviewerManually / removeFeedbackReviewer (admin picker, mirrors
 *   the auto-allocation cron's one-at-a-time rules) and the autoAllocateFeedback
 *   toggle (PATCH /:questionId/role-allocation {role:'feedback'}).
 *
 * [BUG-014] handleFeedbackAction's WEB_APPLICATION branch resolves WEB_APP_URL
 * (QuestionService.ts:9946) but never uses it — both the DATASET and
 * WEB_APPLICATION branches fetch `${dataReleaseUrl}/feedbacks/${feedbackId}/status`
 * (QuestionService.ts:9973 / 9985); WEB_APPLICATION only swaps the Authorization
 * header (authKey → webAuthKey). A real WEB_APPLICATION accept/reject is sent to
 * the DATASET data-release service, not the public web app. Pinned as observed
 * behavior in Group 4 below (not fixed — QA-only role).
 *
 * [FINDING-009] processPaeValidation's own docstring says a 'feedback' decision
 * leaves the question "assigned to the PAE expert for further work" (comment at
 * QuestionService.ts:11186-11188 / controller ts:3602-3604), but the actual
 * implementation calls removePaeValidationAssigned in both the 'approve' AND
 * 'feedback' branches — the PAE expert is freed either way; the only difference
 * is 'feedback' additionally opens a feedback entry that later routes to a
 * moderator/auditor. Documentation-only mismatch, not a functional bug — pinned
 * as observed behavior in Group 1 below.
 *
 * WHAT THIS DOES NOT COVER
 * ------------------------
 * The paginated feedback DISPLAY endpoint (GET /:questionId/feedbacks, merging
 * local PAE feedbacks with the external data-release service's DATASET/
 * WEB_APPLICATION feedback content) and the chatbot-side feedback analytics/report
 * endpoints (ChatbotService.getFeedbackUsers, getFeedbackByLocation, dataset
 * listings) — those are read/reporting surfaces layered on top of the mechanism
 * this suite drives, not part of the routing/settlement logic itself. Also not
 * covered: PAE expert domain/state preference MATCHING (isQuestionMatchForPaeExpert)
 * — exercised only incidentally (fixtures carry no preference, so match-anything).
 *
 * STRATEGY
 * --------
 * Same in-process harness as PostAllocation.e2e.test.ts / GatekeeperAuditor.e2e.test.ts:
 * real Atlas DB from `.env`, NODE_ENV='development' (TLS), production DI container,
 * `currentTestUser` swapped per request (no Firebase), global InternalApiAuth via
 * x-internal-api-key. AiService is dummied for safety. Roles used here
 * (pae_expert/moderator/auditor/admin) have no fixed .env.test fixtures beyond the
 * moderator/admin already used by other suites, so fresh RUN_TAG-tagged users are
 * inserted directly (gatekeeper-auditor's `makeUser` pattern) — this also gives
 * full control over isBlocked/status/feedbacksAssigned for the routing-fallback
 * tests, and guarantees a deterministic pool member since the shared DB may hold
 * other real/leftover moderators and auditors.
 *
 * The PAE validation cron (runPaeValidationQueueCron) sorts pending questions by
 * `createdAt` ascending and assigns to whichever available pae_expert it iterates
 * to first — the identity of the actual assignee is read back from the DB after
 * the cron runs, not assumed, and the seeded question's createdAt is stamped to
 * the Unix epoch so it is guaranteed the global oldest match regardless of any
 * other pending PAE validations that may exist in the shared DB.
 */

process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.test' });

import express from 'express';
import request from 'supertest';
import { useExpressServer } from 'routing-controllers';
import { ObjectId } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_FB_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-feedback-key';

let app: express.Express;
let db: any;
let questionService: any;

// Swapped per request — currentUserChecker returns this.
let currentTestUser: any = null;

const createdQuestionIds: ObjectId[] = [];
const createdUserIds: ObjectId[] = [];
let userCounter = 0;

/** Insert a fresh RUN_TAG-tagged user of the given role directly into Mongo (no
 *  .env.test fixtures exist for pae_expert/gate_keeper/auditor pools reliably free
 *  of cross-suite contamination). `overrides` lets a test seed isBlocked/status/
 *  feedbacksAssigned so it starts "busy" for the routing-fallback tests. */
async function makeUser(role: string, overrides: Record<string, any> = {}): Promise<any> {
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
    assignedQuestionIds: [],
    feedbacksAssigned: [],
    paeValidationAssigned: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  createdUserIds.push(insertedId);
  return users.findOne({ _id: insertedId });
}

beforeAll(async () => {
  // Warm-up: resolve the AnswerService circular import before the core barrel
  // runs via loadAppModules (see project_e2e_inprocess_harness memory).
  await import('#root/modules/answer/services/AnswerService.js');

  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;
  // handleFeedbackAction throws a config error before ever reaching fetch() if
  // these are unset — set dummy values; the outbound call itself is mocked per
  // test (Group 4), so the real value never matters, only that it's present.
  process.env.DATA_RELEASE_URL = process.env.DATA_RELEASE_URL || 'https://dummy-data-release.test';
  process.env.REVIEW_SYSTEM_AUTH_KEY = process.env.REVIEW_SYSTEM_AUTH_KEY || 'dummy-review-key';
  process.env.WEB_APP_URL = process.env.WEB_APP_URL || 'https://dummy-web-app.test';
  process.env.WEB_WEBHOOK_API_KEY = process.env.WEB_WEBHOOK_API_KEY || 'dummy-web-key';

  const { loadAppModules, getContainer } = await import('#root/bootstrap/loadModules.js');
  const { GLOBAL_TYPES } = await import('#root/types.js');
  const { CORE_TYPES } = await import('#root/modules/core/types.js');

  const { controllers } = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);
  questionService = container.get(CORE_TYPES.QuestionService);

  const dummyAi = {
    getEmbedding: async () => ({ embedding: [] }),
    fetchWhatsAppMessage: async () => ({}),
    searchGdb: async () => ({ exact_match: null, selected_match: null }),
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

  const questions = await db.getCollection('questions');
  await questions.estimatedDocumentCount();
  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG}`);
}, 90000);

afterAll(async () => {
  if (db) {
    const [questions, submissions, answers, notifications, auditTrails, feedbacks, users] =
      await Promise.all([
        db.getCollection('questions'),
        db.getCollection('question_submissions'),
        db.getCollection('answers'),
        db.getCollection('notifications'),
        db.getCollection('auditTrails'),
        db.getCollection('feedbacks'),
        db.getCollection('users'),
      ]);
    if (createdQuestionIds.length) {
      await Promise.all([
        questions.deleteMany({ _id: { $in: createdQuestionIds } }),
        submissions.deleteMany({ questionId: { $in: createdQuestionIds } }),
        answers.deleteMany({ questionId: { $in: createdQuestionIds } }),
        notifications.deleteMany({ enitity_id: { $in: createdQuestionIds } }),
        auditTrails.deleteMany({ 'context.questionId': { $in: createdQuestionIds } }),
        feedbacks.deleteMany({ questionId: { $in: createdQuestionIds } }),
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

// ─────────────────────── helpers ───────────────────────

const as = (user: any) => {
  currentTestUser = user;
};

function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPatch(path: string) {
  return request(app).patch(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiDelete(path: string) {
  return request(app).delete(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

/** Seed a CLOSED question with a final answer approved by `approver` — the state
 *  every feedback source assumes as its starting point. `paeValidation` defaults
 *  to 'completed' (out of the PAE cron's pending pool) so only Group 1 tests,
 *  which pass 'pending' explicitly, are eligible for PAE assignment. */
async function seedClosedQuestion(opts: {
  approver: any;
  label?: string;
  ancient?: boolean;
  paeValidation?: 'pending' | 'in-progress' | 'completed';
  autoAllocatePaeValidationExpert?: boolean;
  feedbacks?: { source: string; status: string }[];
  autoAllocateFeedback?: boolean;
  recentFeedback?: Date;
}): Promise<string> {
  const questions = await db.getCollection('questions');
  const submissions = await db.getCollection('question_submissions');
  const answers = await db.getCollection('answers');

  const details = {
    state: 'Punjab',
    district: 'Ludhiana',
    crop: 'Paddy',
    season: 'Kharif',
    domain: 'Crop Protection',
  };

  const { insertedId } = await questions.insertOne({
    userId: opts.approver._id,
    question: `${RUN_TAG} ${opts.label ?? 'feedback test'} — question`,
    status: 'closed',
    priority: 'medium',
    source: 'OUTREACH',
    isAutoAllocate: false,
    totalAnswersCount: 1,
    embedding: [],
    metrics: null,
    details,
    paeValidation: opts.paeValidation ?? 'completed',
    autoAllocatePaeValidationExpert: opts.autoAllocatePaeValidationExpert ?? false,
    feedbacks: opts.feedbacks ?? [],
    autoAllocateFeedback: opts.autoAllocateFeedback ?? false,
    ...(opts.recentFeedback ? { recentFeedback: opts.recentFeedback } : {}),
    closedAt: new Date(),
    createdAt: opts.ancient ? new Date(0) : new Date(),
    updatedAt: new Date(),
  });
  createdQuestionIds.push(insertedId);

  await submissions.insertOne({
    questionId: insertedId,
    lastRespondedBy: opts.approver._id,
    history: [],
    queue: [],
    feedbackReviews: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await answers.insertOne({
    questionId: insertedId,
    authorId: opts.approver._id,
    answerIteration: 1,
    approvalCount: 0,
    isFinalAnswer: true,
    approvedBy: opts.approver._id,
    status: 'approved',
    answer: `${RUN_TAG} final answer`,
    sources: [],
    embedding: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return insertedId.toString();
}

async function getQuestion(qId: string) {
  const questions = await db.getCollection('questions');
  return questions.findOne({ _id: new ObjectId(qId) });
}
async function getSubmission(qId: string) {
  const submissions = await db.getCollection('question_submissions');
  return submissions.findOne({ questionId: new ObjectId(qId) });
}
async function getUserDoc(id: any) {
  const users = await db.getCollection('users');
  return users.findOne({ _id: new ObjectId(id.toString()) });
}
/** Directly push an OPEN (or pre-finished, for negative tests) feedback-review
 *  round onto a submission — bypasses the assign/cron path when the test only
 *  cares about what happens next (accept/reject/reassign/remove). */
async function pushFeedbackRound(qId: string, reviewerId: any, finishedAt: Date | null = null) {
  const submissions = await db.getCollection('question_submissions');
  await submissions.updateOne(
    { questionId: new ObjectId(qId) },
    { $push: { feedbackReviews: { reviewerId, assignedAt: new Date(), finishedAt } } },
  );
}
async function setFeedbacksAssigned(userId: any, qId: string) {
  const users = await db.getCollection('users');
  await users.updateOne(
    { _id: new ObjectId(userId.toString()) },
    { $set: { feedbacksAssigned: [new ObjectId(qId)] } },
  );
}
function mockFetchOnce(body: any, ok = true) {
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as any);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 1 — PAE_Validation (internal, full loop: cron assignment → feedback)
// ═══════════════════════════════════════════════════════════════════════════

describe('Feedback — Group 1: PAE_Validation (internal)', () => {
  it('runPaeValidationQueueCron assigns an ancient pending question to an available pae_expert', async () => {
    const approver = await makeUser('moderator');
    await makeUser('pae_expert'); // guarantees at least one available expert exists
    const qId = await seedClosedQuestion({
      approver,
      label: 'pae-cron',
      ancient: true,
      paeValidation: 'pending',
      autoAllocatePaeValidationExpert: true,
    });

    const result = await questionService.runPaeValidationQueueCron();
    expect(result.assigned).toBeGreaterThanOrEqual(1);

    const q = await getQuestion(qId);
    expect(q.paeValidation).toBe('in-progress');

    const submission = await getSubmission(qId);
    expect(submission.paeValidation?.length).toBeGreaterThanOrEqual(1);
    const entry = submission.paeValidation[submission.paeValidation.length - 1];
    expect(entry.paeStatus).toBe('in-progress');

    const assignedExpert = await getUserDoc(entry.paeId);
    expect(assignedExpert.role).toBe('pae_expert');
    expect((assignedExpert.paeValidationAssigned ?? []).map(String)).toContain(qId);
  });

  it('[FINDING-009] PAE expert submitting status=feedback opens a PAE_Validation feedback, but still frees the expert (docstring says otherwise)', async () => {
    const approver = await makeUser('moderator');
    await makeUser('pae_expert');
    const qId = await seedClosedQuestion({
      approver,
      label: 'pae-feedback',
      ancient: true,
      paeValidation: 'pending',
      autoAllocatePaeValidationExpert: true,
    });

    await questionService.runPaeValidationQueueCron();
    const submissionAfterCron = await getSubmission(qId);
    const entry = submissionAfterCron.paeValidation[submissionAfterCron.paeValidation.length - 1];
    const assignedExpert = await getUserDoc(entry.paeId);

    as(assignedExpert);
    const res = await apiPost('/api/questions/pae/validations/process').send({
      questionId: qId,
      status: 'feedback',
      suggestionComment: `${RUN_TAG} needs more detail on dosage`,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const feedbacksCol = await db.getCollection('feedbacks');
    const fbDoc = await feedbacksCol.findOne({ questionId: new ObjectId(qId) });
    expect(fbDoc).toBeTruthy();
    expect(fbDoc.type).toBe('PAE_VALIDATION');
    expect(fbDoc.status).toBe('open');

    const q = await getQuestion(qId);
    expect(q.autoAllocateFeedback).toBe(true);
    expect(q.paeValidation).toBe('completed');
    expect(
      q.feedbacks?.some((f: any) => f.source === 'PAE_Validation' && f.status === 'open'),
    ).toBe(true);

    // The expert IS freed despite the endpoint's own docstring claiming the
    // question "remains assigned ... for further work" — see [FINDING-009] above.
    const expertAfter = await getUserDoc(assignedExpert._id);
    expect((expertAfter.paeValidationAssigned ?? []).map(String)).not.toContain(qId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 2 — routing: moderator-queue feedback pass (moderator busy → auditor)
// ═══════════════════════════════════════════════════════════════════════════

describe('Feedback — Group 2: routing (runModeratorQueueCron feedback pass)', () => {
  it('an active, free approver-moderator gets the feedback assigned directly', async () => {
    const approver = await makeUser('moderator');
    const qId = await seedClosedQuestion({
      approver,
      label: 'route-mod-free',
      feedbacks: [{ source: 'PAE_Validation', status: 'open' }],
      autoAllocateFeedback: true,
      recentFeedback: new Date(),
    });

    await questionService.runModeratorQueueCron();

    const submission = await getSubmission(qId);
    const round = submission.feedbackReviews?.[0];
    expect(round).toBeTruthy();
    expect(round.finishedAt).toBeNull();
    expect(round.reviewerId.toString()).toBe(approver._id.toString());

    const approverAfter = await getUserDoc(approver._id);
    expect((approverAfter.feedbacksAssigned ?? []).map(String)).toContain(qId);
  });

  it('a BLOCKED approver-moderator falls back to an available auditor', async () => {
    const approver = await makeUser('moderator', { isBlocked: true });
    await makeUser('auditor'); // guarantee an idle fallback exists
    const qId = await seedClosedQuestion({
      approver,
      label: 'route-mod-blocked',
      feedbacks: [{ source: 'PAE_Validation', status: 'open' }],
      autoAllocateFeedback: true,
      recentFeedback: new Date(),
    });

    await questionService.runModeratorQueueCron();

    const submission = await getSubmission(qId);
    const round = submission.feedbackReviews?.[0];
    expect(round).toBeTruthy();
    const reviewer = await getUserDoc(round.reviewerId);
    expect(reviewer.role).toBe('auditor');
    expect(reviewer._id.toString()).not.toBe(approver._id.toString());
  });

  it('an approver-moderator already holding another feedback falls back to an auditor', async () => {
    const approver = await makeUser('moderator', { feedbacksAssigned: [new ObjectId()] });
    await makeUser('auditor');
    const qId = await seedClosedQuestion({
      approver,
      label: 'route-mod-busy',
      feedbacks: [{ source: 'PAE_Validation', status: 'open' }],
      autoAllocateFeedback: true,
      recentFeedback: new Date(),
    });

    await questionService.runModeratorQueueCron();

    const submission = await getSubmission(qId);
    const round = submission.feedbackReviews?.[0];
    expect(round).toBeTruthy();
    const reviewer = await getUserDoc(round.reviewerId);
    expect(reviewer.role).toBe('auditor');
  });

  it('an INACTIVE approver-moderator (status=in-active) falls back to an auditor', async () => {
    const approver = await makeUser('moderator', { status: 'in-active' });
    await makeUser('auditor');
    const qId = await seedClosedQuestion({
      approver,
      label: 'route-mod-inactive',
      feedbacks: [{ source: 'PAE_Validation', status: 'open' }],
      autoAllocateFeedback: true,
      recentFeedback: new Date(),
    });

    await questionService.runModeratorQueueCron();

    const submission = await getSubmission(qId);
    const round = submission.feedbackReviews?.[0];
    expect(round).toBeTruthy();
    const reviewer = await getUserDoc(round.reviewerId);
    expect(reviewer.role).toBe('auditor');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 3 — DATASET (chat app, dummied) / WEB_APPLICATION (public site, dummied)
// ═══════════════════════════════════════════════════════════════════════════

describe('Feedback — Group 3: DATASET / WEB_APPLICATION intake webhook', () => {
  it('rejects the internal feedback-status webhook without a valid x-internal-api-key', async () => {
    const approver = await makeUser('moderator');
    const qId = await seedClosedQuestion({ approver, label: 'dataset-noauth' });

    const res = await request(app)
      .patch(`/api/questions/feedbacks/question/${qId}`)
      .send({ source: 'DATASET' }); // no x-internal-api-key header
    expect(res.status).toBe(401);
  });

  it('DATASET webhook (simulated chat-app feedback) opens a feedback entry and routes to the approver-moderator', async () => {
    const approver = await makeUser('moderator');
    const qId = await seedClosedQuestion({ approver, label: 'dataset-open' });

    const res = await apiPatch(`/api/questions/feedbacks/question/${qId}`).send({ source: 'DATASET' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const q = await getQuestion(qId);
    expect(q.autoAllocateFeedback).toBe(true);
    expect(q.recentFeedback).toBeTruthy();
    expect(q.feedbacks?.some((f: any) => f.source === 'DATASET' && f.status === 'open')).toBe(true);

    await questionService.runModeratorQueueCron();
    const submission = await getSubmission(qId);
    expect(submission.feedbackReviews?.[0]?.reviewerId.toString()).toBe(approver._id.toString());
  });

  it('WEB_APPLICATION webhook (simulated general-public-site feedback) opens a feedback entry the same way', async () => {
    const approver = await makeUser('moderator');
    const qId = await seedClosedQuestion({ approver, label: 'webapp-open' });

    const res = await apiPatch(`/api/questions/feedbacks/question/${qId}`).send({ source: 'WEB_APPLICATION' });
    expect(res.status).toBe(200);

    const q = await getQuestion(qId);
    expect(q.feedbacks?.some((f: any) => f.source === 'WEB_APPLICATION' && f.status === 'open')).toBe(true);
  });

  it('re-notifying an already-open DATASET source is idempotent (reopens the same entry, never duplicates it)', async () => {
    const approver = await makeUser('moderator');
    const qId = await seedClosedQuestion({ approver, label: 'dataset-idempotent' });

    await apiPatch(`/api/questions/feedbacks/question/${qId}`).send({ source: 'DATASET' });
    await apiPatch(`/api/questions/feedbacks/question/${qId}`).send({ source: 'DATASET' });

    const q = await getQuestion(qId);
    const datasetEntries = (q.feedbacks ?? []).filter((f: any) => f.source === 'DATASET');
    expect(datasetEntries).toHaveLength(1);
    expect(datasetEntries[0].status).toBe('open');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 4 — accept/reject settlement
// ═══════════════════════════════════════════════════════════════════════════

describe('Feedback — Group 4: accept/reject settlement', () => {
  it('PAE_Validation accept closes the source, finishes the review round, and frees the reviewer (single source)', async () => {
    const approver = await makeUser('moderator');
    const reviewer = await makeUser('auditor');
    const qId = await seedClosedQuestion({
      approver,
      label: 'settle-pae-accept',
      feedbacks: [{ source: 'PAE_Validation', status: 'open' }],
    });

    const feedbacksCol = await db.getCollection('feedbacks');
    const { insertedId: feedbackId } = await feedbacksCol.insertOne({
      questionId: new ObjectId(qId),
      userId: { name: 'PAE Tester', email: 'pae-tester@example.com' },
      type: 'PAE_VALIDATION',
      comment: 'needs work',
      status: 'open',
      createdAt: new Date(),
    });
    await pushFeedbackRound(qId, reviewer._id, null);
    await setFeedbacksAssigned(reviewer._id, qId);

    as(reviewer);
    const res = await apiPost(
      `/api/questions/${qId}/${feedbackId.toString()}/feedback-action`,
    ).send({ action: 'accept', reason: 'looks good', source: 'PAE_Validation' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/All feedbacks processed/);

    const fbAfter = await feedbacksCol.findOne({ _id: feedbackId });
    expect(fbAfter.status).toBe('accept');

    const q = await getQuestion(qId);
    expect(q.feedbacks.find((f: any) => f.source === 'PAE_Validation').status).toBe('closed');

    const submission = await getSubmission(qId);
    expect(submission.feedbackReviews[0].finishedAt).toBeTruthy();

    const reviewerAfter = await getUserDoc(reviewer._id);
    expect((reviewerAfter.feedbacksAssigned ?? []).map(String)).not.toContain(qId);
  });

  it('DATASET accept (external service reports pendingFeedbackCount=0) closes the source the same way', async () => {
    const approver = await makeUser('moderator');
    const reviewer = await makeUser('moderator');
    const qId = await seedClosedQuestion({
      approver,
      label: 'settle-dataset-accept',
      feedbacks: [{ source: 'DATASET', status: 'open' }],
    });
    await pushFeedbackRound(qId, reviewer._id, null);
    await setFeedbacksAssigned(reviewer._id, qId);

    const fetchSpy = mockFetchOnce({ status: 'accepted', pendingFeedbackCount: 0 });

    as(reviewer);
    const res = await apiPost(
      `/api/questions/${qId}/${RUN_TAG}-ext-1/feedback-action`,
    ).send({ action: 'accept', reason: 'ok', source: 'DATASET' });
    expect(res.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, any];
    expect(calledUrl).toContain(process.env.DATA_RELEASE_URL);
    expect(calledInit.headers.Authorization).toBe(`Bearer ${process.env.REVIEW_SYSTEM_AUTH_KEY}`);

    const q = await getQuestion(qId);
    expect(q.feedbacks.find((f: any) => f.source === 'DATASET').status).toBe('closed');
    const submission = await getSubmission(qId);
    expect(submission.feedbackReviews[0].finishedAt).toBeTruthy();
  });

  it('DATASET reject with pendingFeedbackCount>0 leaves the source open and the reviewer still assigned', async () => {
    const approver = await makeUser('moderator');
    const reviewer = await makeUser('moderator');
    const qId = await seedClosedQuestion({
      approver,
      label: 'settle-dataset-pending',
      feedbacks: [{ source: 'DATASET', status: 'open' }],
    });
    await pushFeedbackRound(qId, reviewer._id, null);
    await setFeedbacksAssigned(reviewer._id, qId);

    mockFetchOnce({ status: 'rejected', pendingFeedbackCount: 3 });

    as(reviewer);
    const res = await apiPost(
      `/api/questions/${qId}/${RUN_TAG}-ext-2/feedback-action`,
    ).send({ action: 'reject', reason: 'not enough info', source: 'DATASET' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/3 pending feedback/);

    const q = await getQuestion(qId);
    expect(q.feedbacks.find((f: any) => f.source === 'DATASET').status).toBe('open');
    const submission = await getSubmission(qId);
    expect(submission.feedbackReviews[0].finishedAt).toBeNull();
    const reviewerAfter = await getUserDoc(reviewer._id);
    expect((reviewerAfter.feedbacksAssigned ?? []).map(String)).toContain(qId);
  });

  it('[BUG-014] WEB_APPLICATION accept still calls DATA_RELEASE_URL, not WEB_APP_URL — only the auth key differs', async () => {
    // handleFeedbackAction resolves WEB_APP_Url (QuestionService.ts:9946) but never
    // uses it: both the DATASET and WEB_APPLICATION branches fetch
    // `${dataReleaseUrl}/feedbacks/${feedbackId}/status` (QuestionService.ts:9973 /
    // 9985) — WEB_APPLICATION only swaps the Authorization header
    // (authKey → webAuthKey). Any real WEB_APPLICATION accept/reject is sent to the
    // DATASET data-release service instead of the public web app. Pinned as
    // observed behavior, not fixed here (QA-only role).
    const approver = await makeUser('moderator');
    const reviewer = await makeUser('moderator');
    const qId = await seedClosedQuestion({
      approver,
      label: 'settle-webapp-accept',
      feedbacks: [{ source: 'WEB_APPLICATION', status: 'open' }],
    });
    await pushFeedbackRound(qId, reviewer._id, null);
    await setFeedbacksAssigned(reviewer._id, qId);

    const fetchSpy = mockFetchOnce({ status: 'accepted', pendingFeedbackCount: 0 });

    as(reviewer);
    const res = await apiPost(
      `/api/questions/${qId}/${RUN_TAG}-ext-3/feedback-action`,
    ).send({ action: 'accept', reason: 'ok', source: 'WEB_APPLICATION' });
    expect(res.status).toBe(200);

    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, any];
    expect(calledUrl).toContain(process.env.DATA_RELEASE_URL); // BUG-014: should be WEB_APP_URL
    expect(calledInit.headers.Authorization).toBe(`Bearer ${process.env.WEB_WEBHOOK_API_KEY}`);

    const q = await getQuestion(qId);
    expect(q.feedbacks.find((f: any) => f.source === 'WEB_APPLICATION').status).toBe('closed');
  });

  it('a question with PAE_Validation AND DATASET both open is not released until BOTH are closed', async () => {
    const approver = await makeUser('moderator');
    const reviewer = await makeUser('auditor');
    const qId = await seedClosedQuestion({
      approver,
      label: 'settle-multi-source',
      feedbacks: [
        { source: 'PAE_Validation', status: 'open' },
        { source: 'DATASET', status: 'open' },
      ],
    });
    const feedbacksCol = await db.getCollection('feedbacks');
    const { insertedId: paeFeedbackId } = await feedbacksCol.insertOne({
      questionId: new ObjectId(qId),
      userId: { name: 'PAE Tester', email: 'pae-tester@example.com' },
      type: 'PAE_VALIDATION',
      comment: '',
      status: 'open',
      createdAt: new Date(),
    });
    await pushFeedbackRound(qId, reviewer._id, null);
    await setFeedbacksAssigned(reviewer._id, qId);

    as(reviewer);

    // Close PAE_Validation first — the OTHER source (DATASET) is still open.
    let res = await apiPost(
      `/api/questions/${qId}/${paeFeedbackId.toString()}/feedback-action`,
    ).send({ action: 'accept', reason: 'ok', source: 'PAE_Validation' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Other feedback sources still open/);

    let submission = await getSubmission(qId);
    expect(submission.feedbackReviews[0].finishedAt).toBeNull();
    let reviewerAfter = await getUserDoc(reviewer._id);
    expect((reviewerAfter.feedbacksAssigned ?? []).map(String)).toContain(qId);

    // Now close DATASET too — only NOW is the round finished / reviewer freed.
    mockFetchOnce({ status: 'accepted', pendingFeedbackCount: 0 });
    res = await apiPost(
      `/api/questions/${qId}/${RUN_TAG}-ext-4/feedback-action`,
    ).send({ action: 'accept', reason: 'ok', source: 'DATASET' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/All feedbacks processed/);

    submission = await getSubmission(qId);
    expect(submission.feedbackReviews[0].finishedAt).toBeTruthy();
    reviewerAfter = await getUserDoc(reviewer._id);
    expect((reviewerAfter.feedbacksAssigned ?? []).map(String)).not.toContain(qId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 5 — manual admin controls
// ═══════════════════════════════════════════════════════════════════════════

describe('Feedback — Group 5: manual admin controls', () => {
  it('admin manually assigns a feedback reviewer to a waiting (unassigned) feedback question', async () => {
    const approver = await makeUser('moderator');
    const admin = await makeUser('admin');
    const reviewer = await makeUser('auditor');
    const qId = await seedClosedQuestion({
      approver,
      label: 'manual-assign',
      feedbacks: [{ source: 'DATASET', status: 'open' }],
    });

    as(admin);
    const res = await apiPost(`/api/questions/${qId}/feedback-reviewer`).send({
      userId: reviewer._id.toString(),
    });
    expect(res.status).toBe(200);

    const submission = await getSubmission(qId);
    expect(submission.feedbackReviews[0].reviewerId.toString()).toBe(reviewer._id.toString());
    const reviewerAfter = await getUserDoc(reviewer._id);
    expect((reviewerAfter.feedbacksAssigned ?? []).map(String)).toContain(qId);
  });

  it('admin reassigns an already-open round to a different reviewer by index, releasing the old one', async () => {
    const approver = await makeUser('moderator');
    const admin = await makeUser('admin');
    const reviewer1 = await makeUser('auditor');
    const reviewer2 = await makeUser('auditor');
    const qId = await seedClosedQuestion({
      approver,
      label: 'manual-reassign',
      feedbacks: [{ source: 'DATASET', status: 'open' }],
    });
    await pushFeedbackRound(qId, reviewer1._id, null);
    await setFeedbacksAssigned(reviewer1._id, qId);

    as(admin);
    const res = await apiPost(`/api/questions/${qId}/feedback-reviewer`).send({
      userId: reviewer2._id.toString(),
      index: 0,
    });
    expect(res.status).toBe(200);

    const submission = await getSubmission(qId);
    expect(submission.feedbackReviews[0].reviewerId.toString()).toBe(reviewer2._id.toString());
    const reviewer1After = await getUserDoc(reviewer1._id);
    expect((reviewer1After.feedbacksAssigned ?? []).map(String)).not.toContain(qId);
  });

  it('assigning a reviewer is rejected once the feedback is already fully closed', async () => {
    const approver = await makeUser('moderator');
    const admin = await makeUser('admin');
    const reviewer = await makeUser('auditor');
    const qId = await seedClosedQuestion({
      approver,
      label: 'manual-closed',
      feedbacks: [{ source: 'DATASET', status: 'closed' }],
    });

    as(admin);
    const res = await apiPost(`/api/questions/${qId}/feedback-reviewer`).send({
      userId: reviewer._id.toString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already closed/i);
  });

  it('admin removes an open feedback-review round and releases the reviewer', async () => {
    const approver = await makeUser('moderator');
    const admin = await makeUser('admin');
    const reviewer = await makeUser('auditor');
    const qId = await seedClosedQuestion({
      approver,
      label: 'manual-remove',
      feedbacks: [{ source: 'DATASET', status: 'open' }],
    });
    await pushFeedbackRound(qId, reviewer._id, null);
    await setFeedbacksAssigned(reviewer._id, qId);

    as(admin);
    const res = await apiDelete(`/api/questions/${qId}/feedback-reviewer`).send({ index: 0 });
    expect(res.status).toBe(200);

    const submission = await getSubmission(qId);
    expect(submission.feedbackReviews ?? []).toHaveLength(0);
    const reviewerAfter = await getUserDoc(reviewer._id);
    expect((reviewerAfter.feedbacksAssigned ?? []).map(String)).not.toContain(qId);
  });

  it('removing a COMPLETED round is rejected', async () => {
    const approver = await makeUser('moderator');
    const admin = await makeUser('admin');
    const reviewer = await makeUser('auditor');
    const qId = await seedClosedQuestion({
      approver,
      label: 'manual-remove-completed',
      feedbacks: [{ source: 'DATASET', status: 'closed' }],
    });
    await pushFeedbackRound(qId, reviewer._id, new Date());

    as(admin);
    const res = await apiDelete(`/api/questions/${qId}/feedback-reviewer`).send({ index: 0 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/completed feedback review cannot be removed/i);
  });

  it('toggling autoAllocateFeedback OFF then ON (role=feedback) gates cron pickup accordingly', async () => {
    const approver = await makeUser('moderator');
    const admin = await makeUser('admin');
    await makeUser('auditor');
    const qId = await seedClosedQuestion({
      approver,
      label: 'toggle-feedback',
      feedbacks: [{ source: 'PAE_Validation', status: 'open' }],
      autoAllocateFeedback: true,
      recentFeedback: new Date(),
    });

    as(admin);
    let res = await apiPatch(`/api/questions/${qId}/role-allocation`).send({
      role: 'feedback',
      enabled: false,
    });
    expect(res.status).toBe(200);
    let q = await getQuestion(qId);
    expect(q.autoAllocateFeedback).toBe(false);

    // OFF: the cron's auto-only pass (findQuestionsWithOpenFeedbacks(true)) must skip it.
    await questionService.runModeratorQueueCron();
    let submission = await getSubmission(qId);
    expect(submission.feedbackReviews ?? []).toHaveLength(0);

    res = await apiPatch(`/api/questions/${qId}/role-allocation`).send({
      role: 'feedback',
      enabled: true,
    });
    expect(res.status).toBe(200);
    q = await getQuestion(qId);
    expect(q.autoAllocateFeedback).toBe(true);

    await questionService.runModeratorQueueCron();
    submission = await getSubmission(qId);
    expect(submission.feedbackReviews?.[0]?.reviewerId).toBeTruthy();
  }, 15000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 6 — dedicated Feedback-tab read endpoints (smoke)
// ═══════════════════════════════════════════════════════════════════════════

describe('Feedback — Group 6: feedback-tab read endpoints', () => {
  it('GET /feedback/queue-details and /feedback/reviewers respond 200 with the expected shape for a non-expert', async () => {
    const admin = await makeUser('admin');
    as(admin);

    const queueRes = await apiGet('/api/questions/feedback/queue-details');
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.success).toBe(true);
    expect(queueRes.body.data).toHaveProperty('waitingAuto');
    expect(queueRes.body.data).toHaveProperty('assigned');

    const reviewersRes = await apiGet('/api/questions/feedback/reviewers');
    expect(reviewersRes.status).toBe(200);
    expect(Array.isArray(reviewersRes.body.data)).toBe(true);
  });

  it('an expert is forbidden from viewing the feedback queue / reviewer list', async () => {
    const expert = await makeUser('expert');
    as(expert);

    const res = await apiGet('/api/questions/feedback/queue-details');
    expect(res.status).toBe(403);
  });
});
