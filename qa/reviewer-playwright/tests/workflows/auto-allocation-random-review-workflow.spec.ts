import { test, expect } from "../../fixtures/workflow.fixture.js";

import { ExpertDashboardPage } from "../../pages/expert/dashboard.page.js";
import { ReviewPanelPage } from "../../pages/expert/review-panel.page.js";
import { ResponsePage } from "../../pages/expert/response.page.js";

import type { Page } from "@playwright/test";

import { ModeratorQuestionDetailsPage } from "../../pages/moderator/question-details.page.js";
import { ModeratorDashboardPage } from "../../pages/moderator/dashboard.page.js";
import { ModeratorAllocationQueuePage } from "../../pages/moderator/allocation-queue.page.js";

/**
 * Auto-Allocation Random Review Workflow
 *
 * Auto-allocation is left ON. The backend decides which expert gets
 * each turn. Each reviewer randomly chooses Accept, Reject, or Modify.
 *
 * The workflow continues until either:
 *
 *   1. Three consecutive acceptances are reached
 *
 *   OR
 *
 *   2. All 10 experts have participated.
 */

type ReviewAction = "accept" | "reject" | "modify";

const ACTION_WEIGHTS: Record<ReviewAction, number> = {
  accept: 0.7, //0.7
  reject: 0.15, //0.15
  modify: 0.15, //0.15
};

const TOTAL_EXPERTS = 10;

const NEXT_EXPERT_TIMEOUT_MS = 45_000;
const NEXT_EXPERT_POLL_INTERVAL_MS = 3_000;

function pickRandomAction(): ReviewAction {
  const roll = Math.random();

  let cumulative = 0;

  for (const [action, weight] of Object.entries(ACTION_WEIGHTS) as [
    ReviewAction,
    number,
  ][]) {
    cumulative += weight;

    if (roll < cumulative) {
      return action;
    }
  }

  return "accept";
}

/**
 * Logs in as the initial auto-allocated expert and submits
 * the first answer.
 */
async function submitInitialAnswer(
  loginAsExpert: (email: string) => Promise<Page>,
  authorEmail: string,
  question: string,
): Promise<void> {
  console.log(`[AAR] Logging in as author: ${authorEmail}`);

  const page = await loginAsExpert(authorEmail);

  try {
    const dashboard = new ExpertDashboardPage(page);
    const responsePage = new ResponsePage(page);

    console.log(`[AAR] ${authorEmail}: waiting for shell...`);

    await dashboard.waitForShell();

    console.log(`[AAR] ${authorEmail}: waiting for question to be enabled...`);

    await dashboard.waitForQuestionEnabled(question, 60_000);

    console.log(`[AAR] ${authorEmail}: opening question...`);

    await dashboard.openQuestion(question);

    await responsePage.expectCurrentQuery(question);

    await responsePage.fillDraftResponse(
      "Playwright automated auto-allocation initial answer.",
    );

    await responsePage.addSourceReference("State");

    await expect(responsePage.submitButton).toBeEnabled();

    console.log(`[AAR] ${authorEmail}: submitting initial answer...`);

    await responsePage.clickSubmit();

    await responsePage.confirmSubmission();

    await responsePage.expectSubmissionSuccess();

    console.log(`[AAR] ${authorEmail}: initial answer submitted.`);
  } finally {
    await page.close();

    console.log(`[AAR] ${authorEmail}: page closed.`);
  }
}

/**
 * Safely exits the current moderator question details view if it is open.
 */
async function exitQuestionIfOpen(
  moderatorQuestionDetailsPage: ModeratorQuestionDetailsPage,
): Promise<void> {
  try {
    if (await moderatorQuestionDetailsPage.exitButton.isVisible()) {
      console.log("[AAR] Exiting stale question details...");

      await moderatorQuestionDetailsPage.exit();
    }
  } catch {
    // We may already be on the dashboard.
    // The next openQuestion() call will handle navigation.
  }
}

/**
 * Polls the moderator's question allocation state until a new active
 * expert different from previousExpert appears.
 *
 * Important:
 * After an expert submits/reviews, the moderator may still be looking
 * at stale question details. Each polling attempt therefore:
 *
 *   1. Exits the current question details if open
 *   2. Reopens the SAME question
 *   3. Reads the fresh allocation queue
 *   4. Checks whether the active expert changed
 */
async function findNextActiveExpert(
  page: Page,
  moderatorQuestionDetailsPage: ModeratorQuestionDetailsPage,
  moderatorDashboard: ModeratorDashboardPage,
  moderatorAllocationQueuePage: ModeratorAllocationQueuePage,
  question: string,
  previousExpert: string,
  timeout = NEXT_EXPERT_TIMEOUT_MS,
  pollInterval = NEXT_EXPERT_POLL_INTERVAL_MS,
): Promise<string> {
  const deadline = Date.now() + timeout;

  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;

    console.log(`[AAR] Checking for next active expert — attempt ${attempt}`);

    try {
      /**
       * The moderator might still be inside the previous/stale
       * question details screen.
       */
      await exitQuestionIfOpen(moderatorQuestionDetailsPage);

      /**
       * Reopen the SAME question so the allocation queue is read
       * from a fresh question details view.
       */
      await moderatorDashboard.openQuestion(question);

      await moderatorAllocationQueuePage.expectOpened();

      const activeExpert =
        await moderatorAllocationQueuePage.getActiveExpertEmail();

      console.log(
        `[AAR] Attempt ${attempt}: active="${activeExpert}", ` +
          `previous="${previousExpert}"`,
      );

      /**
       * We only want a new expert.
       */
      if (activeExpert && activeExpert !== previousExpert) {
        console.log(`[AAR] Found next active expert: ${activeExpert}`);

        return activeExpert;
      }

      console.log(`[AAR] Attempt ${attempt}: still waiting for a new expert.`);

      /**
       * We are now back inside the question details page.
       * Exit before the next polling iteration.
       */
      await exitQuestionIfOpen(moderatorQuestionDetailsPage);
    } catch (error) {
      console.log(
        `[AAR] Attempt ${attempt} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await page.waitForTimeout(pollInterval);
  }

  await moderatorAllocationQueuePage.logAllocationSnapshot(
    "findNextActiveExpert timeout",
  );

  throw new Error(
    `[AAR] No new active expert different from ` +
      `"${previousExpert}" appeared within ${timeout}ms.`,
  );
}

/**
 * Logs in as the active reviewer, opens the question, and performs
 * one randomly selected review action.
 */
async function performRandomReview(
  loginAsExpert: (email: string) => Promise<Page>,
  email: string,
  question: string,
): Promise<ReviewAction> {
  console.log(`[AAR] Logging in as reviewer: ${email}`);

  const page = await loginAsExpert(email);

  try {
    const dashboard = new ExpertDashboardPage(page);
    const reviewPanel = new ReviewPanelPage(page);

    console.log(`[AAR] ${email}: waiting for shell...`);

    await dashboard.waitForShell();

    console.log(`[AAR] ${email}: waiting for question to be enabled...`);

    await dashboard.waitForQuestionEnabled(question, 60_000);

    console.log(`[AAR] ${email}: opening question...`);

    await dashboard.openQuestion(question);

    const action = pickRandomAction();

    console.log(`[AAR] ${email} -> chose action: ${action}`);

    if (action === "accept") {
      await reviewPanel.openAcceptDialog();

      await reviewPanel.expectAllCriteriaEnabled();

      await reviewPanel.confirmAcceptance();

      console.log(`[AAR] ${email}: accepted.`);
    } else if (action === "reject") {
      await reviewPanel.openRejectDialog();

      // Required criterion state for rejection.
      await reviewPanel.disableRejectCriterion("valueAddition");

      // Required validation: reason must be > 10 characters.
      await reviewPanel.fillRejectReason(
        "Playwright automated rejection reason.",
      );

      await reviewPanel.expectSubmitRejectEnabled();

      await reviewPanel.submitRejection(
        `Playwright automated random-review replacement answer for ${email}.`,
      );

      console.log(`[AAR] ${email}: rejected with a replacement answer.`);
    } else {
      await reviewPanel.openModifyDialog();

      await reviewPanel.enableModifyCriterion("valueAddition");

      await reviewPanel.fillModifyReason(
        "Playwright automated modification reason.",
      );

      await reviewPanel.submitModification(
        `Playwright automated random-review modified answer for ${email}.`,
        "Playwright automated modification reason.",
      );

      console.log(`[AAR] ${email}: modified the answer.`);
    }
    return action;
  } finally {
    await page.close();

    console.log(`[AAR] ${email}: page closed.`);
  }
}

test.describe("Auto-Allocation Random Review Workflow", () => {
  test.describe.configure({
    timeout: 240_000,
  });

  let question: string;

  test.beforeEach(
    async ({
      moderatorDashboard,
      createQuestionPage,
      moderatorAllocationQueuePage,
    }) => {
      question = `PW_AUTO_${Date.now()}`;

      console.log(`[AAR] beforeEach: creating question "${question}"`);

      await moderatorDashboard.waitForShell();

      await moderatorDashboard.openAllQuestions();

      await moderatorDashboard.openCreateQuestionDialog();

      await createQuestionPage.fillQuestion(question);

      await createQuestionPage.selectState("Jammu And Kashmir");

      await createQuestionPage.selectDistrict("Rajouri");

      await createQuestionPage.selectCrop("All Spice");

      await createQuestionPage.selectSeason("Winter");

      await createQuestionPage.selectDomain("Fertilizer Use and Availability");

      await createQuestionPage.submit();

      await moderatorDashboard.expectQuestionCreated();

      await moderatorDashboard.expectQuestionVisible(question);

      await moderatorDashboard.waitForQuestionsToLoad();

      await moderatorDashboard.openQuestion(question);

      await moderatorAllocationQueuePage.expectOpened();

      /**
       * Auto-allocation must remain enabled.
       */
      await expect(
        moderatorAllocationQueuePage.autoAllocateSwitch,
      ).toHaveAttribute("aria-checked", "true");

      console.log("[AAR] beforeEach: waiting for initial auto-allocation...");

      await moderatorAllocationQueuePage.waitForAutoAllocatedExpert();

      console.log("[AAR] beforeEach: initial auto-allocation confirmed.");
    },
  );

  test("AAR-001 Moderator's question is auto-allocated to exactly one initial expert", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectAllocationCards();

    await moderatorAllocationQueuePage.expectAutoAllocatedExpert();

    const email =
      await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

    expect(email).toMatch(/.+@annam\.ai$/);

    console.log(`[AAR] Auto-allocated initial expert: ${email}`);
  });

  test("AAR-002 The auto-allocated expert can find and open the question", async ({
    moderatorAllocationQueuePage,
    loginAsExpert,
  }) => {
    const authorEmail =
      await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

    const authorPage = await loginAsExpert(authorEmail);

    try {
      const dashboard = new ExpertDashboardPage(authorPage);

      await dashboard.waitForShell();

      await dashboard.waitForQuestionEnabled(question, 60_000);

      await dashboard.openQuestion(question);
    } finally {
      await authorPage.close();
    }
  });

  test("AAR-003 Moderator can identify the next active expert after the first answer is submitted", async ({
    moderatorPage,
    moderatorQuestionDetailsPage,
    moderatorDashboard,
    moderatorAllocationQueuePage,
    loginAsExpert,
  }) => {
    const authorEmail =
      await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

    console.log(`[AAR] Initial author: ${authorEmail}`);

    await submitInitialAnswer(loginAsExpert, authorEmail, question);

    console.log("[AAR] Waiting for next active expert after initial answer...");

    /**
     * FIX:
     *
     * previousExpert was previously undefined here.
     * The previous expert is the author who just submitted.
     */
    const nextExpert = await findNextActiveExpert(
      moderatorPage,
      moderatorQuestionDetailsPage,
      moderatorDashboard,
      moderatorAllocationQueuePage,
      question,
      authorEmail,
    );

    expect(nextExpert).toMatch(/.+@annam\.ai$/);

    expect(nextExpert).not.toBe(authorEmail);

    console.log(`[AAR] Next active expert after initial answer: ${nextExpert}`);
  });

  test("AAR-004 Full random review chain runs until three consecutive acceptances or all 10 experts are done", async ({
    moderatorPage,
    moderatorQuestionDetailsPage,
    moderatorDashboard,
    moderatorAllocationQueuePage,
    loginAsExpert,
  }) => {
    /**
     * Round 0:
     * The initially auto-allocated expert submits the first answer.
     */
    const authorEmail =
      await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

    console.log(`[AAR] ===== Round 0 (author): ${authorEmail} =====`);

    await submitInitialAnswer(loginAsExpert, authorEmail, question);

    const participants = new Set<string>([authorEmail]);

    let consecutiveAccepts = 0;

    let previousExpert = authorEmail;

    let round = 0;

    /**
     * Continue until:
     *
     * - 3 consecutive accepts
     * OR
     * - 10 experts participated
     */
    while (participants.size < TOTAL_EXPERTS && consecutiveAccepts < 3) {
      round++;

      console.log(`[AAR] ===== Round ${round} =====`);

      /**
       * IMPORTANT:
       *
       * Do not call:
       *
       * moderatorAllocationQueuePage.waitForNextActiveExpert()
       *
       * That was the old implementation causing:
       *
       * - moderatorQuestionDetailsPage.exit is not a function
       * - page.waitForTimeout is not a function
       *
       * We now call the standalone workflow helper with the
       * actual Page and actual page objects.
       */
      const activeExpert = await findNextActiveExpert(
        moderatorPage,
        moderatorQuestionDetailsPage,
        moderatorDashboard,
        moderatorAllocationQueuePage,
        question,
        previousExpert,
      );

      /**
       * The same expert should not participate twice.
       */
      expect(
        participants.has(activeExpert),
        `[AAR] Expert ${activeExpert} was allocated twice.`,
      ).toBeFalsy();

      participants.add(activeExpert);

      console.log(
        `[AAR] Round ${round}: active expert ${activeExpert} ` +
          `(${participants.size}/${TOTAL_EXPERTS} distinct participant(s))`,
      );

      const action = await performRandomReview(
        loginAsExpert,
        activeExpert,
        question,
      );

      /**
       * Accept extends the streak.
       * Reject or Modify resets it.
       */
      if (action === "accept") {
        consecutiveAccepts++;
      } else {
        consecutiveAccepts = 0;
      }

      console.log(
        `[AAR] Round ${round} result: ${action} ` +
          `(consecutive accepts: ${consecutiveAccepts})`,
      );

      previousExpert = activeExpert;
    }

    /**
     * The workflow must end through one of the two valid terminal
     * conditions.
     */
    const reachedThreeConsecutiveAccepts = consecutiveAccepts >= 3;

    const allExpertsParticipated = participants.size >= TOTAL_EXPERTS;

    console.log("[AAR] ===== WORKFLOW COMPLETE =====");

    console.log(
      `[AAR] Participants (${participants.size}/${TOTAL_EXPERTS}): ` +
        [...participants].join(", "),
    );

    console.log(`[AAR] Consecutive accepts: ${consecutiveAccepts}`);

    if (reachedThreeConsecutiveAccepts) {
      console.log(
        `[AAR] RESULT: reached 3 consecutive acceptances ` +
          `after ${round} review round(s).`,
      );
    }

    if (allExpertsParticipated) {
      console.log(`[AAR] RESULT: all ${TOTAL_EXPERTS} experts participated.`);
    }

    /**
     * This is intentionally strict.
     *
     * The old version only asserted participants.size > 0,
     * which allowed the workflow to stop after one expert and
     * still pass.
     */
    expect(
      reachedThreeConsecutiveAccepts || allExpertsParticipated,
      `[AAR] Workflow ended unexpectedly after ${round} review round(s). ` +
        `Only ${participants.size}/${TOTAL_EXPERTS} experts participated ` +
        `and only ${consecutiveAccepts} consecutive accept(s) were reached.`,
    ).toBeTruthy();
  });
});
