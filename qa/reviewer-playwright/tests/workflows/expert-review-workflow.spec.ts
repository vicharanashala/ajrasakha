import { test, expect } from "../../fixtures/workflow.fixture.js";

test.describe("Expert Review Workflow", () => {
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
      question = `PW_REVIEW_${Date.now()}`;

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
      // Allocate Expert 1
      // -----------------------------
      await expertAllocationSectionPage.openSelectExpertsDialog();

      await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

      await expertAllocationSectionPage.clickAllocate();

      await moderatorAllocationQueuePage.expectExpertAllocated(
        process.env.EXPERT_EMAIL!,
      );

      // -----------------------------
      // Allocate Expert 2
      // -----------------------------
      await expertAllocationSectionPage.openSelectExpertsDialog();

      await expertAllocationSectionPage.selectExpert(
        process.env.EXPERT_EMAIL_2!,
      );

      await expertAllocationSectionPage.clickAllocate();

      await moderatorAllocationQueuePage.expectExpertAllocated(
        process.env.EXPERT_EMAIL_2!,
      );

      // -----------------------------
      // Expert 1 submits answer
      // -----------------------------
      await workflowExpertDashboard.waitForShell();

      await workflowExpertDashboard.waitForQuestion(question);

      await workflowExpertDashboard.openQuestion(question);

      await workflowResponsePage.expectCurrentQuery(question);

      await workflowResponsePage.fillDraftResponse(
        "Playwright automated review answer.",
      );

      await workflowResponsePage.addSourceReference("State");

      await expect(workflowResponsePage.submitButton).toBeEnabled();

      await workflowResponsePage.clickSubmit();

      await workflowResponsePage.confirmSubmission();

      await workflowResponsePage.expectSubmissionSuccess();
    },
  );
  test("ERW-R001 Second expert can view the review panel", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();

    await expert2Dashboard.waitForQuestion(question);

    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.expectReviewActionsVisible();
  });

  test("ERW-R002 Expert can view answer details", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();

    await expert2Dashboard.waitForQuestion(question);

    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.expectReviewActionsVisible();

    await expert2ReviewPanel.openViewDetails();
  });

  test("ERW-R003 Expert can expand comments", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();

    await expert2Dashboard.waitForQuestion(question);

    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.expandComments();

    await expert2ReviewPanel.expectCommentsExpanded();
  });

  test("ERW-R004 Expert can view answer metadata", async ({
    expert2Dashboard,
    workflowResponsePage,
  }) => {
    await expert2Dashboard.waitForShell();

    await expert2Dashboard.waitForQuestion(question);

    await expert2Dashboard.openQuestion(question);

    await workflowResponsePage.openMetadataDialog();

    await workflowResponsePage.expectMetadataDialog();

    await workflowResponsePage.closeMetadataDialog();
  });

  test("ERW-R005 Review actions remain available after closing details", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();

    await expert2Dashboard.waitForQuestion(question);

    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.openViewDetails();

    await expert2ReviewPanel.closeViewDetails();

    await expert2ReviewPanel.expectReviewActionsVisible();
  });

  test("ERW-R006 Expert can open the accept confirmation dialog", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();

    await expert2Dashboard.waitForQuestion(question);

    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.openAcceptDialog();
  });

  test("ERW-R007 Acceptance criteria are displayed", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();

    await expert2Dashboard.waitForQuestion(question);

    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.openAcceptDialog();

    await expert2ReviewPanel.expectAcceptanceCriteriaVisible();
  });

  test("ERW-R008 Acceptance criteria are enabled by default", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();

    await expert2Dashboard.waitForQuestion(question);

    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.openAcceptDialog();

    await expert2ReviewPanel.expectAllCriteriaEnabled();
  });

  test("ERW-R009 Confirm Accept button is enabled", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();

    await expert2Dashboard.waitForQuestion(question);

    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.openAcceptDialog();

    await expert2ReviewPanel.expectConfirmAcceptEnabled();
  });
  test("ERW-R010 Expert can accept an answer", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    workflowResponsePage,
  }) => {
    await expert2Dashboard.waitForShell();

    await expert2Dashboard.waitForQuestion(question);

    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.openAcceptDialog();

    await expert2ReviewPanel.expectAllCriteriaEnabled();

    await expert2ReviewPanel.confirmAcceptance();

    await expert2Dashboard.expectQuestionRemoved(question);
  });

  // test("ERW-R011 Moderator sees expert status as Accepted", async ({
  //   expert2Dashboard,
  //   expert2ReviewPanel,
  //   moderatorDashboard,
  //   moderatorAllocationQueuePage,
  // }) => {
  //   // Expert 2 accepts
  //   await expert2Dashboard.waitForShell();
  //   await expert2Dashboard.waitForQuestion(question);
  //   await expert2Dashboard.openQuestion(question);

  //   await expert2ReviewPanel.openAcceptDialog();
  //   await expert2ReviewPanel.confirmAcceptance();

  //   // Moderator verifies
  //   await moderatorDashboard.waitForShell();
  //   await moderatorDashboard.openAllQuestions();
  //   await moderatorDashboard.openQuestion(question);

  //   await moderatorAllocationQueuePage.expectOpened();
  //   await moderatorAllocationQueuePage.expectExpertStatus("Accepted");
  // });

  test("ERW-R011 Moderator sees expert status as Accepted", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    moderatorDashboard,
    moderatorQuestionDetailsPage,
    moderatorAllocationQueuePage,
  }) => {
    // Expert 2 accepts
    await expert2Dashboard.waitForShell();
    await expert2Dashboard.waitForQuestion(question);
    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.openAcceptDialog();
    await expert2ReviewPanel.confirmAcceptance();

    // Moderator page is still open, but its question-details view
    // contains stale allocation data. Re-open the question.
    await moderatorQuestionDetailsPage.exit();

    await moderatorDashboard.openQuestion(question);

    await moderatorAllocationQueuePage.expectOpened();

    await moderatorAllocationQueuePage.expectExpertStatus("Approved");
  });
  test("ERW-R012 Accepted question is removed from review queue", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();
    await expert2Dashboard.waitForQuestion(question);
    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.openAcceptDialog();
    await expert2ReviewPanel.confirmAcceptance();

    await expert2Dashboard.expectQuestionNotPresent(question);
  });

  test("ERW-R013 Next question becomes active after acceptance", async ({
    expert2Dashboard,
    expert2ReviewPanel,
    workflowResponsePage,
  }) => {
    await expert2Dashboard.waitForShell();
    await expert2Dashboard.waitForQuestion(question);
    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.openAcceptDialog();
    await expert2ReviewPanel.confirmAcceptance();

    await workflowResponsePage.expectLoaded();
  });

  test("ERW-R014 Acceptance dialog closes after confirmation", async ({
    expert2Dashboard,
    expert2ReviewPanel,
  }) => {
    await expert2Dashboard.waitForShell();
    await expert2Dashboard.waitForQuestion(question);
    await expert2Dashboard.openQuestion(question);

    await expert2ReviewPanel.openAcceptDialog();
    await expert2ReviewPanel.confirmAcceptance();

    await expert2ReviewPanel.expectAcceptanceDialogClosed();
  });
});
