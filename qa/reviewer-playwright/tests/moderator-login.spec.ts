import { test, expect } from "../fixtures/moderator.fixture.js";

test("MOD-001 Moderator can open Add Question dialog", async ({
  moderatorDashboard,
}) => {
  await moderatorDashboard.waitForShell();

  await moderatorDashboard.openAllQuestions();
  //   await moderatorDashboard.page.pause(); // temporary
  await moderatorDashboard.openCreateQuestionDialog();
});
