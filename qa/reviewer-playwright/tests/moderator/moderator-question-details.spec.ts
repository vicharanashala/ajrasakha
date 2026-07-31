import { test, expect } from "../../fixtures/moderator.fixture.js";

test.describe("Moderator Question Details", () => {
  let question: string;

  test.beforeEach(async ({ moderatorDashboard, createQuestionPage }) => {
    question = `PW_E2E_${Date.now()}`;

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
});
