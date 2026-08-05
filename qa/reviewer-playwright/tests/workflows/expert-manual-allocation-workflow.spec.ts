import { test } from "../../fixtures/workflow.fixture.js";
import { ExpertDashboardPage } from "../../pages/expert/dashboard.page.js";

test.describe("Expert Manual Allocation Workflow", () => {
  let question: string;

  test.beforeEach(
    async ({
      moderatorDashboard,
      createQuestionPage,
      moderatorAllocationQueuePage,
    }) => {
      question = `PW_EAW_${Date.now()}`;

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
    },
  );

  test("EAW-M001 Moderator can access Expert Manual Allocation workflow", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectOpened();

    await moderatorAllocationQueuePage.expectAutoAllocateToggle();

    await moderatorAllocationQueuePage.expectAllocationCards();

    await moderatorAllocationQueuePage.expectExpertsVisible();

    await moderatorAllocationQueuePage.expectStatusesVisible();
  });

  test("EAW-M002 Moderator disables Expert Auto Allocate", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();
  });
  test("EAW-M002A Moderator can open Remove Expert Allocation dialog", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    const autoAllocatedExpert =
      await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

    await moderatorAllocationQueuePage.openRemoveExpertDialog(
      autoAllocatedExpert,
    );

    await moderatorAllocationQueuePage.expectRemoveExpertDialog();
  });
  test("EAW-M002B Moderator can remove auto allocated expert", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    const autoAllocatedExpert =
      await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

    await moderatorAllocationQueuePage.openRemoveExpertDialog(
      autoAllocatedExpert,
    );

    await moderatorAllocationQueuePage.confirmRemoveExpert();

    await moderatorAllocationQueuePage.expectExpertRemoved(autoAllocatedExpert);
  });
  test("EAW-M002C Moderator sees empty Allocation Queue after removing auto allocated expert", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    const autoAllocatedExpert =
      await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

    await moderatorAllocationQueuePage.openRemoveExpertDialog(
      autoAllocatedExpert,
    );

    await moderatorAllocationQueuePage.confirmRemoveExpert();

    await moderatorAllocationQueuePage.expectRemoveDialogClosed();

    await moderatorAllocationQueuePage.expectEmptyExpertQueue();
  });
  test("EAW-M003 Moderator sees Select Experts button", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.expectSelectExpertsButton();
  });

  test("EAW-M004 Moderator opens Expert Selection dialog", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();
  });
  test("EAW-M005 Moderator sees available experts", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.expectExpertsAvailable();
  });
  test("EAW-M006 Moderator sees dialog actions", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.expectDialogControls();
  });
  test("EAW-M007 Moderator cannot submit without selecting experts", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.clickSubmit();

    await expertAllocationSectionPage.expectEmptySelectionValidation();
  });
  test("EAW-M008 Moderator allocates selected expert", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

    await expertAllocationSectionPage.clickAllocate();

    await expertAllocationSectionPage.expectAllocationSuccess();
  });
  test("EAW-M009 Allocated expert appears in Allocation Queue", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

    await expertAllocationSectionPage.clickAllocate();

    await moderatorAllocationQueuePage.expectExpertAllocated(
      process.env.EXPERT_EMAIL!,
    );
  });
  test("EAW-M010 Newly allocated expert has Waiting status", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

    await expertAllocationSectionPage.clickAllocate();

    await moderatorAllocationQueuePage.expectExpertStatus("Waiting");
  });
  test("EAW-M011 Moderator allocates multiple experts", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.selectExperts([
      process.env.EXPERT_EMAIL!,
      "experttest2@annam.ai",
    ]);

    await expertAllocationSectionPage.clickAllocate();

    await expertAllocationSectionPage.expectAllocationSuccess();
  });
  test("EAW-M012 Multiple experts appear in Allocation Queue", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.selectExperts([
      process.env.EXPERT_EMAIL!,
      "experttest2@annam.ai",
    ]);

    await expertAllocationSectionPage.clickAllocate();

    await moderatorAllocationQueuePage.expectExpertAllocated(
      process.env.EXPERT_EMAIL!,
    );

    await moderatorAllocationQueuePage.expectExpertAllocated(
      "experttest2@annam.ai",
    );
  });
  test("EAW-M013 Allocated experts persist after reopening question", async ({
    moderatorDashboard,
    moderatorQuestionDetailsPage,
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

    await expertAllocationSectionPage.clickAllocate();

    // Leave Question Details
    await moderatorQuestionDetailsPage.exit();

    // Back on All Questions
    await moderatorDashboard.expectAllQuestionsPage();

    // Reopen the question
    await moderatorDashboard.openQuestion(question);

    // Allocation should still exist
    await moderatorAllocationQueuePage.expectExpertAllocated(
      process.env.EXPERT_EMAIL!,
    );
  });
  test("EAW-M014 Manual allocation appends experts to existing queue", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    const autoAllocatedExpert =
      await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

    await expertAllocationSectionPage.clickAllocate();

    await moderatorAllocationQueuePage.expectExpertAllocated(
      autoAllocatedExpert,
    );

    await moderatorAllocationQueuePage.expectExpertAllocated(
      process.env.EXPERT_EMAIL!,
    );
  });
  test("EAW-M015 Moderator closes dialog without allocating", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.closeDialog();

    await expertAllocationSectionPage.expectDialogClosed();

    await moderatorAllocationQueuePage.expectAllocationCards();
  });
  test("EAW-M016 Search preserves selected experts", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

    await expertAllocationSectionPage.searchExpert("experttest2");

    await expertAllocationSectionPage.clearSearch();

    await expertAllocationSectionPage.expectExpertSelected(
      process.env.EXPERT_EMAIL!,
    );
  });
  test("EAW-M017 Moderator can deselect expert before allocation", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

    await expertAllocationSectionPage.expectExpertSelected(
      process.env.EXPERT_EMAIL!,
    );

    await expertAllocationSectionPage.toggleExpert(process.env.EXPERT_EMAIL!);

    await expertAllocationSectionPage.expectExpertNotSelected(
      process.env.EXPERT_EMAIL!,
    );

    await expertAllocationSectionPage.clickSubmit();

    await expertAllocationSectionPage.expectEmptySelectionValidation();
  });
  test("EAW-M018 Allocation dialog resets after successful allocation", async ({
    moderatorAllocationQueuePage,
    expertAllocationSectionPage,
  }) => {
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

    await expertAllocationSectionPage.clickAllocate();

    await expertAllocationSectionPage.openSelectExpertsDialog();

    await expertAllocationSectionPage.expectExpertNotSelected(
      process.env.EXPERT_EMAIL!,
    );
  });

  test("EAW-M019 Allocated expert can log in", async ({
    moderatorAllocationQueuePage,
    loginAsExpert,
  }) => {
    // Disable auto-allocation so manual allocation is available
    await moderatorAllocationQueuePage.disableExpertAutoAllocate();

    // Get whichever expert is currently first in the queue
    const expertEmail =
      await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

    // Login as that expert
    const expertPage = await loginAsExpert(expertEmail);

    // Create page object
    const expertDashboard = new ExpertDashboardPage(expertPage);

    // Verify login succeeded
    await expertDashboard.waitForShell();

    // Cleanup
    await expertPage.close();
  });
});
