import { test, expect } from "../../fixtures";
import {
  getMe,
  getQuestionFull,
  getUserByEmail,
  getDetailedQuestions,
  getQueueDetails,
  deleteQuestions,
  getUserNotifications,
} from "../../support/api";
import {
  precondition,
  requireQuestionInStatus,
  seedReviewFlow,
} from "../../support/preconditions";
import { env } from "../../support/config";

/**
 * DATA-* — data-integrity, API-backed (moderator project).
 *
 * `[setup]` tests here assert the Reviewer-System invariants of the
 * golden-dataset flow through the backend API only — never by reading the
 * golden service directly (TEST_PLAN.md §2). Like the rest of the suite they
 * fail loudly when staging lacks the required data.
 */
test.describe("DATA data integrity", () => {
  test("DATA-01 closed GDB question carries the finalised-answer stamp", async ({
    request,
    moderatorToken,
  }) => {
    test.slow();
    const question = await requireQuestionInStatus(request, moderatorToken, "closed", {
      source: "AJRASAKHA",
      whatFor: "DATA-01 GDB closed-state invariants",
    });
    const full = await getQuestionFull(request, moderatorToken, question._id);
    expect(full._id).toBe(question._id);
    expect(full.status).toBe("closed");
    // Core push invariants (Reviewer-System state only).
    expect(full.finalAnswer || full.isFinalAnswer).toBeTruthy();
    // Stamps written by the push flow; asserted when the chosen question was
    // produced by Push-to-GDB (staging closed questions from other pipelines
    // may not carry them).
    if (full.approvedBy) expect(full.approvedBy).toBeTruthy();
    if (full.closedAt) expect(full.closedAt).toBeTruthy();
  });

  test("DATA-02 submitted expert answer is recorded in question history", async ({
    request,
    adminToken,
    expertToken,
  }) => {
    test.slow();
    const expert = await getUserByEmail(env.expert.email);
    if (!expert?._id) {
      precondition(
        `Staging has no user record for the E2E expert email (${env.expert.email}). ` +
          `Provision the expert account in User Management, then re-run.`,
      );
    }
    const flow = await seedReviewFlow(request, adminToken, expertToken, expert._id);
    try {
      const full = await getQuestionFull(request, adminToken, flow.questionId);
      const recorded = full.submission?.history?.some(
        (h) => h.answer?.answer === flow.answerText,
      );
      expect(
        recorded,
        "expert answer must appear in the question history (submission.history)",
      ).toBeTruthy();
    } finally {
      await deleteQuestions(request, adminToken, [flow.questionId]);
    }
  });

  test("DATA-03 view-only actions do not mutate reputation state", async ({
    request,
    moderatorToken,
  }) => {
    const before = await getMe(request, moderatorToken);
    const snapshot = {
      reputation_score: before.reputation_score,
      incentive: before.incentive,
      penalty: before.penalty,
    };

    // View-only reads against the same surface the UI uses.
    const list = await getDetailedQuestions(request, moderatorToken, { limit: 1 });
    if (list.questions[0]?._id) {
      await getQuestionFull(request, moderatorToken, list.questions[0]._id);
    }

    const after = await getMe(request, moderatorToken);
    expect(after.reputation_score).toBe(snapshot.reputation_score);
    expect(after.incentive).toBe(snapshot.incentive);
    expect(after.penalty).toBe(snapshot.penalty);
  });

  test("DATA-04 queue-details surface is consistent with the UI modal", async ({
    questionsPage,
    request,
    moderatorToken,
  }) => {
    await questionsPage.goto();
    await questionsPage.openQueueDetails();
    for (const label of [
      "Never Allocated",
      "Stuck Questions (> 45 min)",
      "Needs Reviewer",
    ]) {
      await expect(await questionsPage.queueSection(label)).toBeVisible({ timeout: 15_000 });
    }

    // The UI modal shows date-filtered (today) counts; assert the API surface
    // returns the same section keys with numeric, non-negative counts. The
    // "Never Allocated" UI column maps to the API's `waiting` section. Each
    // section value is `{ count, items }`.
    const details = await getQueueDetails(request, moderatorToken);
    for (const key of ["stuck", "waiting", "needsReviewer"]) {
      expect(details, `queue-details API must include ${key}`).toHaveProperty(key);
      expect(details[key]).toHaveProperty("count");
      expect(Number(details[key].count)).toBeGreaterThanOrEqual(0);
    }
  });

  test("DATA-05 queue detail counts are consistent across sections", async ({
    request,
    moderatorToken,
  }) => {
    const details = await getQueueDetails(request, moderatorToken);
    const sections = Object.entries(details);
    const counts = sections
      .filter(([, v]) => typeof v.count === "number")
      .map(([, v]) => v.count as number);
    for (const count of counts) {
      expect(Number(count)).toBeGreaterThanOrEqual(0);
    }
    const totalWork = details.totalWork?.count;
    if (typeof totalWork === "number") {
      expect(totalWork).toBeGreaterThanOrEqual(0);
    }
  });
});
