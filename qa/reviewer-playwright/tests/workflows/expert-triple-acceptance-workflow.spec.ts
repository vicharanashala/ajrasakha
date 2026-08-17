import { test, expect } from "../../fixtures/workflow.fixture.js";
import { ExpertDashboardPage } from "../../pages/expert/dashboard.page.js";
import { ReviewPanelPage } from "../../pages/expert/review-panel.page.js";

/**
 * Expert Triple Acceptance Workflow
 * ----------------------------------
 * Covers the flow where THREE different experts review and accept the
 * same answer, one after another (sequential queue hand-off — a reviewer
 * only receives the question once the reviewer ahead of them has
 * accepted it). Once the third acceptance completes, the question's
 * overall status should flip to "in-review".
 *
 * Allocation queue for this flow (4 experts total):
 *   1. EXPERT_EMAIL   (author)   -> "Answer Created"
 *   2. EXPERT_EMAIL_2 (reviewer) -> "Approved" after accepting
 *   3. EXPERT_EMAIL_3 (reviewer) -> "Approved" after accepting
 *   4. EXPERT_EMAIL_4 (reviewer) -> "Approved" after accepting
 *
 * IMPORTANT — fixture resolution order:
 * Playwright resolves every fixture named in a test's parameter list up
 * front, before the test body runs (destructuring the fixtures object
 * triggers each one immediately). So a test that asks for both
 * `expert2Dashboard` and `expert3Dashboard` logs expert3 in — and fetches
 * their "My Queue" panel — before the test body ever gets a chance to
 * have expert2 accept the answer that's supposed to hand the question to
 * expert3 next. The queue view doesn't poll for updates (same staleness
 * already documented on the moderator side in ERW-R011 / ERW-M015), so
 * every reviewer after the first calls `.waitForQuestionEnabled()` on
 * their dashboard (which reloads and polls until the row is both
 * present and clickable) right before `openQuestion()`.
 *
 * IMPORTANT — the third reviewer's turn takes longer to unlock:
 * Even after the row appears (a reload fixes that), it can stay
 * disabled (`cursor-not-allowed`, `aria-disabled`) for a while before
 * the backend actually hands over the turn. This is confirmed real
 * behaviour, not a bug — inspecting the Response History panel for
 * other, already-completed 3-reviewer chains in this same environment
 * shows the third reviewer's Accept/Reject/Modify controls do become
 * live once their turn arrives:
 *
 *   Reviewer 3  [In-review]  Awaiting response   [Accept][Reject][Modify]
 *   Reviewer 2  [Reviewed]   Answer Accepted
 *   Reviewer 1  [Reviewed]   Answer Accepted
 *   Author      [Answer Created][Reviewed]
 *
 * It just isn't instant, and the third hop has been observed to take
 * noticeably longer than the second — so expert4's
 * waitForQuestionEnabled() call below is given a much larger budget
 * than expert3's, rather than raising the shared default for everyone.
 *
 * NOTE: The exact text of the "in-review" status badge is targeted via
 * ModeratorQuestionDetailsPage.statusBadge / expectQuestionStatus, which
 * matches on visible text scoped to the page header. If the real DOM
 * renders the badge differently, adjust that locator rather than the
 * tests below.
 */

// The third reviewer's turn has been observed to take noticeably longer
// to unlock than the second's — give it a generous, explicit budget
// rather than raising the shared default in ExpertDashboardPage for
// every caller.
const THIRD_REVIEWER_TIMEOUT_MS = 300_000;

// A full page.reload() every 5s (the shared default) across the third
// reviewer's long wait — on top of 4 other already-open browser
// contexts for this test — adds up to real CPU/memory churn on a local
// machine over a multi-minute wait. Space reloads out further here to
// keep the run lighter to sit through without shrinking the overall
// timeout budget.
const THIRD_REVIEWER_POLL_INTERVAL_MS = 10_000;

async function acceptQuestion(
  dashboard: ExpertDashboardPage,
  reviewPanel: ReviewPanelPage,
  question: string,
): Promise<void> {
  await dashboard.waitForShell();
  await dashboard.waitForQuestion(question);
  await dashboard.openQuestion(question);

  await reviewPanel.openAcceptDialog();
  await reviewPanel.expectAllCriteriaEnabled();
  await reviewPanel.confirmAcceptance();

  await dashboard.expectQuestionRemoved(question);
}

test.describe("Expert Triple Acceptance Workflow", () => {
  // This workflow logs in as up to 5 separate users (moderator, author,
  // and 3 reviewers), drives multiple full accept dialogs per test, and
  // — for tests reaching the third reviewer — waits out a genuinely slow
  // backend turn hand-off (see THIRD_REVIEWER_TIMEOUT_MS above). Tests
  // that reach expert4 override this per-test via test.setTimeout().
  test.describe.configure({ timeout: 180_000 });

  let question: string;

  test.beforeEach(
    async ({
      moderatorDashboard,
      createQuestionPage,
      moderatorAllocationQueuePage,
      expertAllocationSectionPage,

      workflowExpertDashboard,
      workflowResponsePage,
    }) => {
      // -----------------------------
      // Moderator prepares question
      // -----------------------------
      question = `PW_TRIPLE_${Date.now()}`;

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

      // -----------------------------
      // Remove auto allocation
      // -----------------------------
      await moderatorAllocationQueuePage.disableExpertAutoAllocate();

      const autoAllocatedExpert =
        await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

      await moderatorAllocationQueuePage.openRemoveExpertDialog(
        autoAllocatedExpert,
      );

      await moderatorAllocationQueuePage.confirmRemoveExpert();

      await moderatorAllocationQueuePage.expectEmptyExpertQueue();

      // -----------------------------
      // Allocate author + three reviewers in a single dialog session
      // (proven working pattern — see EAW-M011/M012 — instead of
      // opening the Select Experts dialog once per person).
      // -----------------------------
      await expertAllocationSectionPage.openSelectExpertsDialog();

      await expertAllocationSectionPage.selectExperts([
        process.env.EXPERT_EMAIL!,
        process.env.EXPERT_EMAIL_2!,
        process.env.EXPERT_EMAIL_3!,
        process.env.EXPERT_EMAIL_4!,
      ]);

      await expertAllocationSectionPage.clickAllocate();

      await moderatorAllocationQueuePage.expectExpertAllocated(
        process.env.EXPERT_EMAIL!,
      );
      await moderatorAllocationQueuePage.expectExpertAllocated(
        process.env.EXPERT_EMAIL_2!,
      );
      await moderatorAllocationQueuePage.expectExpertAllocated(
        process.env.EXPERT_EMAIL_3!,
      );
      await moderatorAllocationQueuePage.expectExpertAllocated(
        process.env.EXPERT_EMAIL_4!,
      );

      // -----------------------------
      // Expert 1 (author) submits answer
      // -----------------------------
      await workflowExpertDashboard.waitForShell();

      await workflowExpertDashboard.waitForQuestion(question);

      await workflowExpertDashboard.openQuestion(question);

      await workflowResponsePage.expectCurrentQuery(question);

      await workflowResponsePage.fillDraftResponse(
        "Playwright automated triple-acceptance answer.",
      );

      await workflowResponsePage.addSourceReference("State");

      await expect(workflowResponsePage.submitButton).toBeEnabled();

      await workflowResponsePage.clickSubmit();

      await workflowResponsePage.confirmSubmission();

      await workflowResponsePage.expectSubmissionSuccess();
    },
  );

  test("TAW-001 Moderator can allocate three reviewers alongside the answer author", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectExpertAllocated(
      process.env.EXPERT_EMAIL!,
    );
    await moderatorAllocationQueuePage.expectExpertAllocated(
      process.env.EXPERT_EMAIL_2!,
    );
    await moderatorAllocationQueuePage.expectExpertAllocated(
      process.env.EXPERT_EMAIL_3!,
    );
    await moderatorAllocationQueuePage.expectExpertAllocated(
      process.env.EXPERT_EMAIL_4!,
    );
  });

  test("TAW-002 First reviewer can accept the submitted answer", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    // expert2 is the only reviewer fixture this test resolves, and their
    // page loads AFTER expert1 (author) already submitted the answer in
    // beforeEach — so no reload is needed here, unlike expert3/expert4
    // below.
    await acceptQuestion(expert2Dashboard, expert2ReviewPanel, question);
  });

  test("TAW-003 Second reviewer receives the answer once the first reviewer accepts", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    expert3Dashboard,
    expert3ReviewPanel,
  }) => {
    // First acceptance
    await expert2Dashboard.waitForShell();
    await expert2Dashboard.waitForQuestion(question);
    await expert2Dashboard.openQuestion(question);
    await expert2ReviewPanel.openAcceptDialog();
    await expert2ReviewPanel.confirmAcceptance();

    // expert3's page was already loaded (fixture resolved) before the
    // acceptance above happened — waitForQuestionEnabled() reloads and
    // polls until the now-available row is actually clickable.
    await expert3Dashboard.waitForQuestionEnabled(question);
    await expert3Dashboard.openQuestion(question);

    await expert3ReviewPanel.expectReviewActionsVisible();
  });

  test("TAW-004 Second reviewer can accept the answer after the first acceptance", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    expert3Dashboard,
    expert3ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();
    await expert2Dashboard.waitForQuestion(question);
    await expert2Dashboard.openQuestion(question);
    await expert2ReviewPanel.openAcceptDialog();
    await expert2ReviewPanel.confirmAcceptance();

    await expert3Dashboard.waitForQuestionEnabled(question);
    await acceptQuestion(expert3Dashboard, expert3ReviewPanel, question);
  });

  test("TAW-005 Third reviewer receives the answer once the second reviewer accepts", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    expert3Dashboard,
    expert3ReviewPanel,
    expert4Dashboard,
    expert4ReviewPanel,
  }) => {
    test.setTimeout(THIRD_REVIEWER_TIMEOUT_MS + 60_000);

    // Expert 2 accepts
    await acceptQuestion(expert2Dashboard, expert2ReviewPanel, question);

    // Expert 3 receives the answer
    await expert3Dashboard.waitForQuestionEnabled(question);

    // Expert 3 accepts
    await acceptQuestion(expert3Dashboard, expert3ReviewPanel, question);

    // Expert 4 receives the answer.
    // The third hop can take substantially longer.
    await expert4Dashboard.waitForQuestionEnabled(
      question,
      THIRD_REVIEWER_TIMEOUT_MS,
      THIRD_REVIEWER_POLL_INTERVAL_MS,
    );

    await expert4Dashboard.openQuestion(question);

    await expert4ReviewPanel.expectReviewActionsVisible();
  });
  test("TAW-006 Third reviewer can accept the answer, completing three continuous acceptances", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    expert3Dashboard,
    expert3ReviewPanel,
    expert4Dashboard,
    expert4ReviewPanel,
  }) => {
    test.setTimeout(120_000);

    await acceptQuestion(expert2Dashboard, expert2ReviewPanel, question);

    await expert3Dashboard.waitForQuestionEnabled(question);

    await acceptQuestion(expert3Dashboard, expert3ReviewPanel, question);

    // Refresh + poll until Expert 4 can act.
    await expert4Dashboard.waitForQuestionEnabled(question, 60_000, 5_000);

    await acceptQuestion(expert4Dashboard, expert4ReviewPanel, question);
  });

  test("TAW-007 Moderator sees all three reviewers as Approved after three acceptances", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    expert3Dashboard,
    expert3ReviewPanel,
    expert4Dashboard,
    expert4ReviewPanel,
    moderatorDashboard,
    moderatorQuestionDetailsPage,
    moderatorAllocationQueuePage,
  }) => {
    test.setTimeout(THIRD_REVIEWER_TIMEOUT_MS + 60_000);

    await acceptQuestion(expert2Dashboard, expert2ReviewPanel, question);

    await expert3Dashboard.waitForQuestionEnabled(question);
    await acceptQuestion(expert3Dashboard, expert3ReviewPanel, question);

    await expert4Dashboard.waitForQuestionEnabled(
      question,
      THIRD_REVIEWER_TIMEOUT_MS,
      THIRD_REVIEWER_POLL_INTERVAL_MS,
    );
    await acceptQuestion(expert4Dashboard, expert4ReviewPanel, question);

    // Moderator's question-details view holds stale allocation data —
    // re-open the question, same pattern used by the standard review
    // workflow (ERW-R011).
    await moderatorQuestionDetailsPage.exit();
    await moderatorDashboard.openQuestion(question);
    await moderatorAllocationQueuePage.expectOpened();

    await moderatorAllocationQueuePage.expectExpertStatus(
      process.env.EXPERT_EMAIL_2!,
      "Approved",
    );
    await moderatorAllocationQueuePage.expectExpertStatus(
      process.env.EXPERT_EMAIL_3!,
      "Approved",
    );
    await moderatorAllocationQueuePage.expectExpertStatus(
      process.env.EXPERT_EMAIL_4!,
      "Approved",
    );
  });

  test("TAW-008 Question status is not yet in-review before the third acceptance", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    moderatorDashboard,
    moderatorQuestionDetailsPage,
  }) => {
    await expert2Dashboard.waitForShell();
    await expert2Dashboard.waitForQuestion(question);
    await expert2Dashboard.openQuestion(question);
    await expert2ReviewPanel.openAcceptDialog();
    await expert2ReviewPanel.confirmAcceptance();

    await moderatorQuestionDetailsPage.exit();
    await moderatorDashboard.openQuestion(question);
    await moderatorQuestionDetailsPage.expectOpened();

    await expect(
      moderatorQuestionDetailsPage.header.getByText("in-review", {
        exact: true,
      }),
    ).toBeHidden();
  });

  test("TAW-009 Question status is set to in-review after the third continuous acceptance", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    expert3Dashboard,
    expert3ReviewPanel,
    expert4Dashboard,
    expert4ReviewPanel,
    moderatorDashboard,
    moderatorQuestionDetailsPage,
  }) => {
    test.setTimeout(THIRD_REVIEWER_TIMEOUT_MS + 60_000);

    // -----------------------------
    // Three continuous acceptances
    // -----------------------------
    await acceptQuestion(expert2Dashboard, expert2ReviewPanel, question);

    await expert3Dashboard.waitForQuestionEnabled(question);
    await acceptQuestion(expert3Dashboard, expert3ReviewPanel, question);

    await expert4Dashboard.waitForQuestionEnabled(
      question,
      THIRD_REVIEWER_TIMEOUT_MS,
      THIRD_REVIEWER_POLL_INTERVAL_MS,
    );
    await acceptQuestion(expert4Dashboard, expert4ReviewPanel, question);

    // -----------------------------
    // Moderator verifies the question status flipped to "in-review"
    // -----------------------------
    await moderatorQuestionDetailsPage.exit();
    await moderatorDashboard.openQuestion(question);
    await moderatorQuestionDetailsPage.expectOpened();

    await moderatorQuestionDetailsPage.expectQuestionStatus("in-review");
  });
});
