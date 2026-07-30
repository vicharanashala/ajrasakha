import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../pages/shared/login.page.js";
import { ModeratorDashboardPage } from "../pages/moderator/dashboard.page.js";
import { CreateQuestionPage } from "../pages/moderator/create-question.page.js";
import { ModeratorQuestionDetailsPage } from "../pages/moderator/question-details.page.js";
type ModeratorFixtures = {
  moderatorDashboard: ModeratorDashboardPage;
  createQuestionPage: CreateQuestionPage;
  moderatorQuestionDetailsPage: ModeratorQuestionDetailsPage;
};

export const test = base.extend<ModeratorFixtures>({
  moderatorDashboard: async ({ page }, use) => {
    const login = new LoginPage(page);

    await login.signInAndWaitForLanding(
      process.env.MODERATOR_EMAIL!,
      process.env.MODERATOR_PASSWORD!,
    );

    await use(new ModeratorDashboardPage(page));
  },

  createQuestionPage: async ({ page }, use) => {
    await use(new CreateQuestionPage(page));
  },

  moderatorQuestionDetailsPage: async ({ page }, use) => {
    await use(new ModeratorQuestionDetailsPage(page));
  },
});

export { expect };
