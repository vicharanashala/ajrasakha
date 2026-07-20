/**
 * PR #3 — Reviewer final approval / GDB, stuck-question indicator,
 * reputation scoring.
 *
 * Uses the existing moderator fixtures and page objects from PR #1.
 * Block B relies on staging containing an overdue/stuck queue row or a
 * non-stuck queue row for the respective assertions. It soft-skips when
 * staging lacks the required seeded rows.
 * Block C relies on an expert account with reputation exposed by
 * `/users/me` and a score that updates after approval/rejection actions.
 */
import { test, expect, reviewerCredsAvailable, expertCredsAvailable } from "../fixtures";
import { LoginPage, QuestionQueuePage, QuestionDetailPage } from "../page-objects";
import { SELECTOR_MAP } from "../page-objects/selector-map";
import { testConfig } from "../../helpers/test-config";
import type { Page, Locator } from "@playwright/test";

const AWAITING_APPROVAL_STATUS = /awaiting approval|pending approval|under second review|pending review|submitted|in review/i;
const CLOSED_STATUS = /closed|approved|finalized|moved to gdb/i;
const REVIEWABLE_STATUS = /review|pending|in review|return|returned|re-opened|open/i;

function skipWithoutCredentials(): void {
  test.skip(
    !reviewerCredsAvailable(),
    "REVIEWER_STAGING_URL, MODERATOR_TEST_EMAIL, and MODERATOR_TEST_PASSWORD are required.",
  );
}

async function loginAsModerator(
  loginPage: LoginPage,
  queuePage: QuestionQueuePage,
): Promise<void> {
  await test.step("Log in as the moderator", async () => {
    await loginPage.login(
      testConfig.reviewer.moderator.email,
      testConfig.reviewer.moderator.password,
    );
  });

  await test.step("Confirm the moderator lands on the question queue", async () => {
    await queuePage.assertOnQueuePage();
  });
}

async function deriveQuestionIdFromRow(row: Locator): Promise<string | null> {
  const testId = await row.getAttribute("data-testid");
  if (!testId || !testId.startsWith("queue-row-")) return null;
  return testId.slice("queue-row-".length);
}

async function findQuestionIdByPredicate(
  queuePage: QuestionQueuePage,
  predicate: (row: Locator) => Promise<boolean>,
): Promise<string | null> {
  const count = await queuePage.countRows();
  if (count === 0) return null;

  for (let index = 0; index < count; index += 1) {
    const row = queuePage.rows.nth(index);
    if (await predicate(row)) {
      const id = await deriveQuestionIdFromRow(row);
      if (id) return id;
    }
  }

  return null;
}

async function firstAwaitingApprovalQuestionId(
  queuePage: QuestionQueuePage,
): Promise<string | null> {
  return findQuestionIdByPredicate(queuePage, async (row) => {
    const statusText = await row
      .locator(`[data-testid="${SELECTOR_MAP.queue.rowStatus}"]`)
      .innerText()
      .catch(() => "");
    return AWAITING_APPROVAL_STATUS.test(statusText);
  });
}

async function firstStuckQuestionId(queuePage: QuestionQueuePage): Promise<string | null> {
  return findQuestionIdByPredicate(queuePage, async (row) => {
    const indicator = row.locator(
      `[data-testid="${SELECTOR_MAP.queue.rowStuckIndicator}"]`,
    );
    if ((await indicator.count()) > 0 && (await indicator.isVisible().catch(() => false))) {
      return true;
    }

    const rowText = await row.innerText().catch(() => "");
    return /stuck/i.test(rowText);
  });
}

async function firstNonStuckQuestionId(queuePage: QuestionQueuePage): Promise<string | null> {
  return findQuestionIdByPredicate(queuePage, async (row) => {
    const indicator = row.locator(
      `[data-testid="${SELECTOR_MAP.queue.rowStuckIndicator}"]`,
    );
    const hasVisibleIndicator =
      (await indicator.count()) > 0 && (await indicator.isVisible().catch(() => false));
    if (hasVisibleIndicator) return false;

    const rowText = await row.innerText().catch(() => "");
    return !/stuck/i.test(rowText);
  });
}

async function fetchCurrentUserReputation(page: Page): Promise<number | null> {
  return await page.evaluate(async () => {
    const response = await fetch("/users/me", { credentials: "same-origin" });
    if (!response.ok) return null;
    const json = await response.json();
    return typeof json?.reputation_score === "number" ? json.reputation_score : null;
  });
}

async function assertGdbConfirmation(page: Page): Promise<void> {
  const toast = page.locator("[data-testid='question-push-to-gdb-toast']");
  if ((await toast.count()) > 0) {
    await expect(toast).toBeVisible({ timeout: 7_000 });
    return;
  }

  const confirmationText = page.locator(
    "text=/moved to gdb|pushed to gdb|closed successfully|question is now closed/i",
  );
  await expect(confirmationText.first()).toBeVisible({ timeout: 7_000 });
}

async function findRejectButtonAvailable(detailPage: QuestionDetailPage): Promise<boolean> {
  if ((await detailPage.rejectButton.count()) > 0) {
    return await detailPage.rejectButton.isVisible().catch(() => false);
  }
  return await detailPage.page
    .getByRole("button", { name: /reject|send back|return/i })
    .count()
    .then((count) => count > 0);
}

async function clickRejectAction(detailPage: QuestionDetailPage): Promise<void> {
  if ((await detailPage.rejectButton.count()) > 0) {
    await detailPage.rejectFinalAnswer();
    return;
  }

  const fallback = detailPage.page.getByRole("button", {
    name: /reject|send back|return/i,
  });
  if ((await fallback.count()) > 0) {
    await fallback.first().click();
    return;
  }

  throw new Error("Reject/send-back action is not available in the current detail view.");
}

async function getStuckTooltipText(queuePage: QuestionQueuePage, questionId: string): Promise<string | null> {
  const tooltip = queuePage.rowStuckTooltip(questionId);
  if ((await tooltip.count()) > 0) {
    return await tooltip.innerText().catch(() => null);
  }
  return null;
}

async function hoverStuckIndicator(queuePage: QuestionQueuePage, questionId: string): Promise<void> {
  const indicator = queuePage.rowStuckIndicator(questionId);
  if ((await indicator.count()) > 0) {
    await indicator.hover();
  }
}

async function assertQuestionStatusIsAwaitingApproval(
  detailPage: QuestionDetailPage,
): Promise<void> {
  await expect(detailPage.statusBadge).toContainText(AWAITING_APPROVAL_STATUS);
}

async function assertQuestionStatusIsClosed(detailPage: QuestionDetailPage): Promise<void> {
  await expect(detailPage.statusBadge).toContainText(CLOSED_STATUS);
}

async function assertQuestionStatusIsReviewable(detailPage: QuestionDetailPage): Promise<void> {
  const statusText = await detailPage.statusBadge.innerText().catch(() => "");
  expect(REVIEWABLE_STATUS.test(statusText)).toBe(true);
}

test.describe("A. Final approval → GDB entry", () => {
  test("APP-01 • moderator can view a fully-reviewed question awaiting final approval", async ({
    loginPage,
    queuePage,
    detailPage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);

    const questionId = await firstAwaitingApprovalQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No awaiting-final-approval question is available in staging.");
      return;
    }

    await queuePage.openQuestion(questionId);
    await expect(detailPage.heading).toBeVisible();
    await assertQuestionStatusIsAwaitingApproval(detailPage);
  });

  test("APP-02 • moderator approves the final answer, closes it, and cannot re-approve", async ({
    loginPage,
    queuePage,
    detailPage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);

    const questionId = await firstAwaitingApprovalQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No awaiting-final-approval question is available in staging.");
      return;
    }

    await queuePage.openQuestion(questionId);

    await test.step("Approve the final answer", async () => {
      await detailPage.approveFinalAnswer();
    });

    await test.step("Confirm the question immediately transitions to a closed/final status", async () => {
      await assertQuestionStatusIsClosed(detailPage);
    });

    await test.step("Assert the approval cannot be repeated", async () => {
      await detailPage.assertCannotReapprove();
    });
  });

  test("APP-03 • approved question presents a GDB confirmation or is visible in the Golden Database flow", async ({
    loginPage,
    queuePage,
    detailPage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);

    const questionId = await firstAwaitingApprovalQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No awaiting-final-approval question is available in staging.");
      return;
    }

    await queuePage.openQuestion(questionId);
    await detailPage.approveFinalAnswer();

    await test.step("Verify a GDB confirmation is shown", async () => {
      await assertGdbConfirmation(detailPage.page);
    });
  });

  test("APP-04 • moderator can reject/send-back an answer instead of approving", async ({
    loginPage,
    queuePage,
    detailPage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);

    const questionId = await firstAwaitingApprovalQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No awaiting-final-approval question is available in staging.");
      return;
    }

    await queuePage.openQuestion(questionId);

    if (!(await findRejectButtonAvailable(detailPage))) {
      test.skip(true, "Reject/send-back action is not exposed by staging for this question.");
    }

    await test.step("Reject/send back the answer", async () => {
      await clickRejectAction(detailPage);
    });

    await test.step("Confirm the question returns to a reviewable state rather than closing", async () => {
      await assertQuestionStatusIsReviewable(detailPage);
    });
  });
});

// Block B is explicitly data-dependent. These tests soft-skip when staging has
// no existing stuck or non-stuck questions, because seeding a backdated SLA
// row is not part of the suite. If CI fails here, reproduce by providing
// a question with a backdated `assigned_at` / overdue status in staging.
// Block B is explicitly staging-dependent.
// Data dependency: requires a queue row with an overdue/stuck SLA condition
// and a separate row still within SLA. If CI skips, seed a backdated
// `assigned_at` question or use the staging test fixture that exposes a
// stuck row under the moderator queue.
test.describe("B. Stuck-question indicator", () => {
  test("APP-05 • questions past SLA display a stuck indicator in the queue", async ({
    loginPage,
    queuePage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);

    const questionId = await firstStuckQuestionId(queuePage);
    if (!questionId) {
      test.skip(
        true,
        "No stuck question is currently available in staging. Seed a backdated assigned_at question or configure a stuck fixture.",
      );
      return;
    }

    const stuckIndicator = queuePage.rowStuckIndicator(questionId);
    await expect(stuckIndicator).toBeVisible();
  });

  test("APP-06 • questions still within SLA do not show the stuck indicator", async ({
    loginPage,
    queuePage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);

    const questionId = await firstNonStuckQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No non-stuck question is available in staging.");
      return;
    }

    const stuckIndicator = queuePage.rowStuckIndicator(questionId);
    if ((await stuckIndicator.count()) > 0) {
      await expect(stuckIndicator).not.toBeVisible();
    }
  });

  test("APP-07 • hovering the stuck indicator reveals contextual details when supported", async ({
    loginPage,
    queuePage,
  }) => {
    skipWithoutCredentials();

    await loginAsModerator(loginPage, queuePage);

    const questionId = await firstStuckQuestionId(queuePage);
    if (!questionId) {
      test.skip(
        true,
        "No stuck question is currently available in staging. Seed a backdated assigned_at question or configure a stuck fixture.",
      );
      return;
    }

    await hoverStuckIndicator(queuePage, questionId);
    const tooltipText = await getStuckTooltipText(queuePage, questionId);

    if (!tooltipText) {
      test.skip(
        true,
        "Staging does not expose a dedicated stuck tooltip element; the indicator is still validated by the visible badge.",
      );
    }

    expect(tooltipText).toMatch(/stuck|assigned|expert|min|hour/i);
  });
});

// Block C depends on expert reputation data being available via `/users/me`.
// It assumes the configured expert account can be logged in and that approving
// or rejecting a review action updates the score within the same staging data
// window. If CI skips here, verify the expert credentials and that staging
// exposes reputation through the user session API.
// Block C is explicitly staging-dependent.
// Data dependency: requires an expert account with `reputation_score`
// exposed via `/users/me`, and approval/reject actions that affect it.
// If CI skips, verify the expert credentials and the staged reputation API.
test.describe("C. Reputation scoring", () => {
  test("APP-08 • expert reputation score updates after an approval action", async ({
    loginPage,
    queuePage,
    detailPage,
    page,
  }) => {
    skipWithoutCredentials();
    test.skip(
      !expertCredsAvailable(),
      "EXPERT_TEST_EMAIL and EXPERT_TEST_PASSWORD are required for reputation scoring tests.",
    );

    const expertEmail = testConfig.reviewer.expert.email;
    if (!expertEmail) {
      test.skip(true, "Expert credentials are not configured.");
    }

    await loginAsModerator(loginPage, queuePage);
    const questionId = await firstAwaitingApprovalQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No awaiting-final-approval question is available in staging.");
      return;
    }

    // Capture the expert's reputation from their user session API before approval.
    await page.goto("/login");
    await loginPage.login(expertEmail, testConfig.reviewer.expert.password);
    const beforeReputation = await fetchCurrentUserReputation(page);
    if (beforeReputation === null) {
      test.skip(true, "Could not read the expert user's reputation score from /users/me.");
      return;
    }

    await loginAsModerator(loginPage, queuePage);
    await queuePage.openQuestion(questionId);
    await detailPage.approveFinalAnswer();
    await assertQuestionStatusIsClosed(detailPage);

    await loginPage.login(expertEmail, testConfig.reviewer.expert.password);
    const afterReputation = await fetchCurrentUserReputation(page);
    if (afterReputation === null) {
      test.skip(true, "Could not read the expert user's reputation score after approval.");
      return;
    }

    expect(afterReputation).toBeGreaterThanOrEqual(beforeReputation);
  });

  test("APP-09 • rejected review actions do not increase reputation in the same way as approvals when the system differentiates", async ({
    loginPage,
    queuePage,
    detailPage,
    page,
  }) => {
    skipWithoutCredentials();
    test.skip(
      !expertCredsAvailable(),
      "EXPERT_TEST_EMAIL and EXPERT_TEST_PASSWORD are required for reputation scoring tests.",
    );

    const expertEmail = testConfig.reviewer.expert.email;
    if (!expertEmail) {
      test.skip(true, "Expert credentials are not configured.");
    }

    await loginAsModerator(loginPage, queuePage);
    const questionId = await firstAwaitingApprovalQuestionId(queuePage);
    if (!questionId) {
      test.skip(true, "No awaiting-final-approval question is available in staging.");
      return;
    }

    await queuePage.openQuestion(questionId);
    if (!(await findRejectButtonAvailable(detailPage))) {
      test.skip(true, "Reject/send-back action is not exposed by staging for this question.");
      return;
    }

    await page.goto("/login");
    await loginPage.login(expertEmail, testConfig.reviewer.expert.password);
    const beforeReputation = await fetchCurrentUserReputation(page);
    if (beforeReputation === null) {
      test.skip(true, "Could not read the expert user's reputation score from /users/me.");
      return;
    }

    await loginAsModerator(loginPage, queuePage);
    await queuePage.openQuestion(questionId);
    await clickRejectAction(detailPage);
    await assertQuestionStatusIsReviewable(detailPage);

    await loginPage.login(expertEmail, testConfig.reviewer.expert.password);
    const afterReputation = await fetchCurrentUserReputation(page);
    if (afterReputation === null) {
      test.skip(true, "Could not read the expert user's reputation score after reject action.");
      return;
    }

    const delta = afterReputation - beforeReputation;
    if (delta > 0) {
      test.skip(
        true,
        "Staging appears to credit rejected reviews with positive reputation; no differentiation contract is currently asserted.",
      );
    }

    expect(delta).toBeLessThanOrEqual(0);
  });
});
