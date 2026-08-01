import { test, expect } from "../../fixtures/moderator.fixture.js";

test.describe("Moderator Question Details", () => {
  let question: string;

  test.beforeEach(async ({ moderatorDashboard, createQuestionPage }) => {
    question = `PW_E2E_${Date.now()}`;
    console.log("Creating question:", question);

    await moderatorDashboard.waitForShell();
    await moderatorDashboard.openAllQuestions();
    // await moderatorDashboard.openManualQuestions();
    await moderatorDashboard.openCreateQuestionDialog();

    await createQuestionPage.fillQuestion(question);

    await createQuestionPage.selectState("Jammu And Kashmir");
    await createQuestionPage.selectDistrict("Rajouri");
    await createQuestionPage.selectCrop("All Spice");
    await createQuestionPage.selectSeason("Winter");
    await createQuestionPage.selectDomain("Fertilizer Use and Availability");

    await createQuestionPage.submit();
    console.log("Submitted:", question);

    await moderatorDashboard.expectQuestionCreated();

    await moderatorDashboard.expectQuestionVisible(question);

    await moderatorDashboard.openQuestion(question);
  });

  test("MQD-001 Moderator can open Question Details page", async ({
    moderatorQuestionDetailsPage,
  }) => {
    await moderatorQuestionDetailsPage.expectOpened();
  });

  test("MQD-002 Moderator sees the correct question title", async ({
    moderatorQuestionDetailsPage,
  }) => {
    await moderatorQuestionDetailsPage.expectQuestion(question);
  });
  test("MQD-003 Moderator sees Question Details header", async ({
    moderatorQuestionDetailsPage,
  }) => {
    await moderatorQuestionDetailsPage.expectCoreHeader();
  });
  test("MQD-004 Moderator sees the correct question metadata", async ({
    moderatorQuestionDetailsPage,
  }) => {
    await moderatorQuestionDetailsPage.expectMetadata({
      state: "Jammu And Kashmir",
      district: "Rajouri",
      crop: "All Spice",
      season: "Winter",
      domain: "Fertilizer Use and Availability",
    });
  });

  test("MQD-005 Moderator sees AI Generated Answer section", async ({
    moderatorQuestionDetailsPage,
  }) => {
    await moderatorQuestionDetailsPage.expectAiGeneratedAnswerSection();
  });

  test("MQD-006 Moderator can generate an AI answer", async ({
    moderatorQuestionDetailsPage,
  }) => {
    // TODO:
    // This test is expected to fail until AI answer generation
    // is enabled in the target environment.
    await moderatorQuestionDetailsPage.expandAiGeneratedAnswerSection();

    await moderatorQuestionDetailsPage.generateAiAnswer();

    await moderatorQuestionDetailsPage.expectAiAnswerGenerated();
  });
  test("MQD-007 Moderator can exit Question Details", async ({
    moderatorDashboard,
    moderatorQuestionDetailsPage,
  }) => {
    await moderatorQuestionDetailsPage.exit();

    await moderatorDashboard.expectAllQuestionsPage();
  });
  test("MQD-008 Moderator can open Question LifeCycle", async ({
    moderatorQuestionDetailsPage,
  }) => {
    await moderatorQuestionDetailsPage.openLifeCycle();

    await moderatorQuestionDetailsPage.expectLifeCycleDialog();
  });

  test("MQD-009 Moderator sees Lifecycle timeline", async ({
    moderatorQuestionDetailsPage,
  }) => {
    await moderatorQuestionDetailsPage.openLifeCycle();

    await moderatorQuestionDetailsPage.expectLifeCycleTimeline();
  });
  test("MQD-010 Moderator sees Lifecycle summary", async ({
    moderatorQuestionDetailsPage,
  }) => {
    await moderatorQuestionDetailsPage.openLifeCycle();

    await moderatorQuestionDetailsPage.expectLifeCycleSummary();
  });

  test("MQD-011 Moderator can close Question LifeCycle", async ({
    moderatorQuestionDetailsPage,
  }) => {
    await moderatorQuestionDetailsPage.openLifeCycle();

    await moderatorQuestionDetailsPage.expectLifeCycleDialog();

    await moderatorQuestionDetailsPage.closeLifeCycle();

    await moderatorQuestionDetailsPage.expectLifeCycleClosed();
  });
});
