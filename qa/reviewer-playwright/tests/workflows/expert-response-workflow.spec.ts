import { test } from "../../fixtures/workflow.fixture.js";

test.describe("Expert Response Workflow", () => {
  let question: string;

  test.beforeEach(
    async ({
      moderatorDashboard,
      createQuestionPage,
      moderatorAllocationQueuePage,
      expertAllocationSectionPage,
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

      // Disable auto allocation
      await moderatorAllocationQueuePage.disableExpertAutoAllocate();

      // Remove automatically allocated expert
      const autoAllocatedExpert =
        await moderatorAllocationQueuePage.getFirstAllocatedExpertEmail();

      await moderatorAllocationQueuePage.openRemoveExpertDialog(
        autoAllocatedExpert,
      );

      await moderatorAllocationQueuePage.confirmRemoveExpert();

      await moderatorAllocationQueuePage.expectEmptyExpertQueue();

      // Manually allocate ExpertTest1
      await expertAllocationSectionPage.openSelectExpertsDialog();

      await expertAllocationSectionPage.selectExpert(process.env.EXPERT_EMAIL!);

      await expertAllocationSectionPage.clickAllocate();

      await moderatorAllocationQueuePage.expectExpertAllocated(
        process.env.EXPERT_EMAIL!,
      );

      await moderatorAllocationQueuePage.expectExpertStatus("Waiting");
    },
  );

  test("ERW-M001 Moderator prepares question for expert response", async ({
    moderatorAllocationQueuePage,
  }) => {
    await moderatorAllocationQueuePage.expectExpertAllocated(
      process.env.EXPERT_EMAIL!,
    );
  });

  test("ERW-M002 Allocated expert logs in", async ({
    workflowExpertDashboard,
  }) => {
    await workflowExpertDashboard.waitForShell();
  });

  test("ERW-M003 Allocated expert can view assigned question", async ({
    workflowExpertDashboard,
    workflowResponsePage,
  }) => {
    await workflowExpertDashboard.waitForShell();

    await workflowExpertDashboard.waitForQuestion(question);

    await workflowExpertDashboard.openQuestion(question);
    await workflowResponsePage.expectCurrentQuery(question);
  });

  test("ERW-M004 Expert can access response form", async ({
    workflowExpertDashboard,
    workflowResponsePage,
  }) => {
    await workflowExpertDashboard.waitForShell();

    await workflowExpertDashboard.waitForQuestion(question);

    await workflowExpertDashboard.openQuestion(question);

    await workflowResponsePage.expectCurrentQuery(question);

    await workflowResponsePage.expectLoaded();
  });
});
