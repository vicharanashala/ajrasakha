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
 * present and clickable) right before `openQuestion()` / accepting.
 * This applies to EVERY reviewer after the first in EVERY test — skip
 * it for any one of them and that specific accept call just polls a
 * stale page and times out (this is what broke TAW-005/006 below).
 *
 * IMPORTANT — the third reviewer's turn was consistently stuck, and why:
 * Three separate uninterrupted full-budget runs each left expert4's row
 * disabled for the entire 5-minute wait — not "slow", genuinely stuck.
 * Manually reproducing the same steps by hand in the browser (both with
 * Auto-allocate Experts on AND off) worked fine and quickly, which
 * ruled out both a real backend delay and auto-allocation as the cause.
 * Two real bugs turned out to be stacked on top of each other:
 *
 *   1. `ReviewPanelPage.confirmAcceptance()` only waited for the
 *      confirmation dialog to close, not for the actual success toast —
 *      the dialog can close client-side before the request that
 *      advances the chain to the next reviewer has resolved. Fixed at
 *      the source (now awaits `acceptSuccessToast` too).
 *   2. `page.reload()` still honors normal browser HTTP
 *      caching/revalidation, so a tight poll loop (reload every
 *      10-15s) could keep being served the exact same stale "not your
 *      turn yet" response for far longer than any real delay — while a
 *      human, who naturally takes longer than that between manual
 *      steps regardless, lets the cache entry expire before they check.
 *      Confirmed via the moderator's Allocation Queue view mid-run
 *      showing expert4 already "Waiting" (i.e. active) while our test
 *      still saw the row as disabled. Fixed via a CDP
 *      `Network.setCacheDisabled` call in `ExpertDashboardPage.reload()`.
 *
 * Both fixes combined: TAW-007 and TAW-009 (which exercise the full
 * chain end-to-end) now resolve expert3/expert4's turns in ~3 seconds
 * each instead of hanging for the full 5-minute budget. The generous
 * timeout/poll settings below are kept as a safety net for now, not
 * because they're still needed to make the happy path pass.
 *
 * NOTE: The exact text of the "in-review" status badge is targeted via
 * ModeratorQuestionDetailsPage.statusBadge / expectQuestionStatus, which
 * matches on visible text scoped to the page header. If the real DOM
 * renders the badge differently, adjust that locator rather than the
 * tests below.
 */

// The third reviewer's turn was the slow one before the fixes above —
// kept as a generous safety net rather than trimmed back immediately,
// since we've only confirmed the fast path on a couple of runs so far.
const THIRD_REVIEWER_TIMEOUT_MS = 300_000;

// A full page.reload() every 5s (the shared default) across a
// multi-minute wait — on top of 4 other already-open browser contexts
// for this test — adds up to real CPU/memory churn on a local machine.
// Space reloads out further here to keep worst-case runs lighter to
// sit through without shrinking the overall timeout budget.
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
  // — for tests reaching the third reviewer — waits out what has, on
  // occasion, been a genuinely slow turn hand-off (see
  // THIRD_REVIEWER_TIMEOUT_MS above). Tests that reach expert4 override
  // this per-test via test.setTimeout().
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

  test("TAW-005 Third reviewer accepts the answer once the second reviewer accepts", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    expert3Dashboard,
    expert3ReviewPanel,
  }) => {
    // Expert 2 accepts
    await acceptQuestion(expert2Dashboard, expert2ReviewPanel, question);

    // expert3's fixture was resolved before expert2's acceptance above
    // — same staleness as TAW-003/004. This wait was missing here,
    // which is exactly why this test was timing out: acceptQuestion()
    // polls the page as-is and never reloads on its own.
    await expert3Dashboard.waitForQuestionEnabled(question);

    // Expert 3 accepts
    await acceptQuestion(expert3Dashboard, expert3ReviewPanel, question);
  });

  test("TAW-006 Third reviewer can accept the answer, completing three continuous acceptances", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    expert3Dashboard,
    expert3ReviewPanel,
    expert4Dashboard,
    expert4ReviewPanel,
  }) => {
    test.setTimeout(THIRD_REVIEWER_TIMEOUT_MS + 60_000);

    await acceptQuestion(expert2Dashboard, expert2ReviewPanel, question);

    // Same missing wait as TAW-005 above — expert3 needs this before
    // acceptQuestion() can find their row at all.
    await expert3Dashboard.waitForQuestionEnabled(question);
    await acceptQuestion(expert3Dashboard, expert3ReviewPanel, question);

    await expert4Dashboard.waitForQuestionEnabled(
      question,
      THIRD_REVIEWER_TIMEOUT_MS,
      THIRD_REVIEWER_POLL_INTERVAL_MS,
    );

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
