import { test, expect } from "../fixtures/moderator.fixture.js";

test("MOD-001 Moderator can open Add Question dialog", async ({
  moderatorDashboard,
  createQuestionPage,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();

  await moderatorDashboard.openCreateQuestionDialog();

  await createQuestionPage.expectOpened();
});
