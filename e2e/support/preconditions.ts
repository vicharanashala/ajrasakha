import { type APIRequestContext } from "@playwright/test";
import {
  allocateExperts,
  assertOk,
  createQuestion,
  getQuestionFull,
  submitExpertAnswer,
  type FullQuestionData,
  type Json,
  api,
} from "./api";

/**
 * Staging-data preconditions.
 *
 * Tests tagged `[setup]` need real provisioned data (accounts, a duplicate
 * question, an expert with a submitted answer). These helpers acquire that data
 * through the real backend API and FAIL LOUDLY — never silently skip — when the
 * staging environment cannot satisfy the requirement. The thrown message names
 * exactly what needs to be provisioned and where.
 */

export function precondition(message: string): never {
  throw new Error(
    `[setup precondition] ${message}`,
  );
}

/** Marker embedded in every seeded question so the suite can search for it. */
export function seedMarker(): string {
  return `[E2E ${new Date().toISOString()}]`;
}

export function uniqueQuestionText(subject: string): string {
  return `${seedMarker()} ${subject} ${Math.random().toString(36).slice(2, 8)}?`;
}

/** POST /questions/detailed with a status/source filter — returns questions. */
export async function findQuestionsByStatus(
  apiCtx: APIRequestContext,
  token: string,
  status: string,
  opts: { source?: string; search?: string; limit?: number } = {},
): Promise<FullQuestionData[]> {
  const params = new URLSearchParams();
  params.set("status", status);
  params.set("limit", String(opts.limit ?? 5));
  if (opts.source) params.set("source", opts.source);
  if (opts.search) params.set("search", opts.search);
  const res = await api.post(
    apiCtx,
    `/questions/detailed?${params.toString()}`,
    token,
    {},
  );
  assertOk(`POST /questions/detailed?status=${status}`, res);
  const body = res.body as { questions: FullQuestionData[] };
  return body.questions ?? [];
}

/** Find a question in the given status; fail with actionable guidance if absent. */
export async function requireQuestionInStatus(
  apiCtx: APIRequestContext,
  token: string,
  status: string,
  opts: { source?: string; whatFor: string } = { source: undefined, whatFor: "" },
): Promise<FullQuestionData> {
  const candidates = await findQuestionsByStatus(apiCtx, token, status, {
    source: opts.source,
    limit: 10,
  });
  const eligible = candidates.find((q) => {
    if (opts.source && q.source !== opts.source) return false;
    return Boolean(q._id);
  });
  if (!eligible) {
    precondition(
      `No staging question with status "${status}"${opts.source ? ` and source "${opts.source}"` : ""} was found ` +
        `(${opts.whatFor || "test"}). Provision one on staging via the Reviewer System or the QA/duplicate ` +
        `pipeline, then re-run.`,
    );
  }
  return eligible as FullQuestionData;
}

export interface SeededReviewFlow {
  questionId: string;
  questionText: string;
  answerText: string;
  source: string;
}

/**
 * Deterministic review-flow seed, entirely through the real backend:
 *  1. admin creates a fresh question
 *  2. question is allocated to the staging expert
 *  3. the expert submits a first response
 * Returns the ids/text so tests can locate the question in the UI.
 */
export async function seedReviewFlow(
  apiCtx: APIRequestContext,
  adminToken: string,
  expertToken: string,
  expertId: string,
): Promise<SeededReviewFlow> {
  const questionText = uniqueQuestionText("What is the recommended spacing for transplanting paddy?");
  const context = `${seedMarker()} E2E review-flow seed context.`;
  const created = await createQuestion(apiCtx, adminToken, {
    question: questionText,
    context,
  });
  const questionId = created._id;

  const allocated = await allocateExperts(apiCtx, adminToken, questionId, [expertId]);
  const alloc = allocated as { ok?: boolean; success?: boolean; [k: string]: Json };
  if (alloc?.ok === false || alloc?.success === false) {
    precondition(
      `Allocation of seeded question ${questionId} to expert was rejected by staging: ${JSON.stringify(allocated)}`,
    );
  }

  const answerText = `${seedMarker()} E2E expert answer: apply 20 cm × 20 cm spacing after puddling.`;
  await submitExpertAnswer(apiCtx, expertToken, {
    questionId,
    answer: answerText,
    sources: [{ source: "https://kvk.example.com/paddy-spacing", page: "12" }],
    remarks: "E2E seed submission",
    type: "allocated",
  });

  const full = await getQuestionFull(apiCtx, adminToken, questionId);
  const recorded = full.submission?.history?.some(
    (h) => h.answer?.answer === answerText,
  );
  if (!recorded) {
    precondition(
      `Seeded question ${questionId} has no recorded expert answer after submission — the review-flow ` +
        `prerequisite could not be satisfied on staging.`,
    );
  }

  return { questionId, questionText, answerText, source: String(full.source ?? "AGRI_EXPERT") };
}
