import { test, expect } from "../fixtures/moderator.fixture.js";
const QUESTION = "What is the recommended fertilizer dosage for wheat?";

const CONTEXT = "The farmer has sandy soil with low organic matter.";

const AI_ANSWER = "Apply NPK fertilizer based on soil testing recommendations.";
test("MOD-001 Moderator can open Add Question dialog", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();
});

test("MOD-002 Create Question dialog renders all required controls", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.expectFormControls();
});

test("MOD-003 Create Question form initializes with expected default values", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.expectDefaultValues();
});

test("MOD-004 Required fields prevent question creation", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.expectSubmitDisabled();
});

test("MOD-005 Moderator can enter Question Text", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.fillQuestion(QUESTION);

  await createQuestionPage.expectQuestion(QUESTION);
});

test("MOD-006 Moderator can enter Context", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.fillContext(CONTEXT);

  await createQuestionPage.expectContext(CONTEXT);
});
test("MOD-007 Moderator can enter AI Initial Answer", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.fillAiAnswer(AI_ANSWER);

  await createQuestionPage.expectAiAnswer(AI_ANSWER);
});
test("MOD-008 Moderator can select Priority", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.selectPriority("High");

  await createQuestionPage.expectPriority("High");
});

test("MOD-009 Moderator can select Status", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.selectStatus("Closed");

  await createQuestionPage.expectStatus("Closed");
});

test("MOD-010 Moderator can select State", async ({
  page,
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.selectState("Punjab");

  await createQuestionPage.expectState("Punjab");
});

test("MOD-011 Moderator can select District", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.selectState("Punjab");

  await createQuestionPage.selectDistrict("Bathinda");

  await createQuestionPage.expectDistrict("Bathinda");
});

test("MOD-012 Moderator can select Crop", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.selectCrop("Wheat");

  await createQuestionPage.expectCrop("Wheat");
});

test("MOD-013 Moderator can select Season", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.selectSeason("Rabi");

  await createQuestionPage.expectSeason("Rabi");
});
test("MOD-014 Moderator can select Domain", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.selectDomain("Fertilizer Use and Availability");

  await createQuestionPage.expectDomain("Fertilizer Use and Availability");
});
test("MOD-015 Submit button becomes enabled after required fields are completed", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.fillQuestion(
    "What is the recommended fertilizer dosage for wheat?",
  );

  await createQuestionPage.selectState("Punjab");
  await createQuestionPage.selectDistrict("Bathinda");
  await createQuestionPage.selectCrop("Wheat");
  await createQuestionPage.selectSeason("Rabi");
  await createQuestionPage.selectDomain("Fertilizer Use and Availability");

  await createQuestionPage.expectSubmitEnabled();
});

test("MOD-016 Moderator can cancel question creation", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();

  await createQuestionPage.fillQuestion("Temporary question");

  await createQuestionPage.cancel();

  await createQuestionPage.expectClosed();
});

test("MOD-017 Moderator can successfully create a question", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  const QUESTION = `PW_E2E_${Date.now()}`;

  await moderatorDashboard.waitForShell();
  await moderatorDashboard.openAllQuestions();
  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.fillQuestion(QUESTION);

  await createQuestionPage.selectState("Jammu And Kashmir");
  await createQuestionPage.selectDistrict("Rajouri");
  await createQuestionPage.selectCrop("All Spice");
  await createQuestionPage.selectSeason("Winter");
  await createQuestionPage.selectDomain("Fertilizer Use and Availability");

  await createQuestionPage.submit();

  await moderatorDashboard.expectQuestionCreated();

  await moderatorDashboard.expectQuestionVisible(QUESTION);
});

test("MOD-018-SMOKE Moderator can open Question Details page", async ({
  moderatorDashboard,
  createQuestionPage,
  moderatorQuestionDetailsPage,
}) => {
  const QUESTION = `PW_E2E_${Date.now()}`;

  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.fillQuestion(QUESTION);

  await createQuestionPage.selectState("Jammu And Kashmir");
  await createQuestionPage.selectDistrict("Rajouri");
  await createQuestionPage.selectCrop("All Spice");
  await createQuestionPage.selectSeason("Winter");
  await createQuestionPage.selectDomain("Fertilizer Use and Availability");

  await createQuestionPage.submit();

  await moderatorDashboard.expectQuestionCreated();

  await moderatorDashboard.openQuestion(QUESTION);
  // await moderatorDashboard.pause();
  await moderatorQuestionDetailsPage.expectOpened();
});
