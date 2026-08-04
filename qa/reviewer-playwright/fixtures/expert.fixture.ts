import { test as base, expect, type Page } from "./base.fixture.js";

import { ExpertDashboardPage } from "../pages/expert/dashboard.page.js";
import { ExpertQuestionDetailsPage } from "../pages/expert/question-details.page.js";
import { ResponsePage } from "../pages/expert/response.page.js";

type ExpertFixtures = {
  expertPage: Page;
  authenticatedPage: Page; // alias

  dashboardPage: ExpertDashboardPage;
  questionDetailsPage: ExpertQuestionDetailsPage;
  responsePage: ResponsePage;
};

export const test = base.extend<ExpertFixtures>({
  expertPage: async ({ loginAs }, use) => {
    const page = await loginAs(
      process.env.EXPERT_EMAIL!,
      process.env.EXPERT_PASSWORD!,
    );

    console.log("Expert fixture page:", page.url());

    await use(page);

    console.log("Closing expert page");

    await page.close();
  },

  authenticatedPage: async ({ expertPage }, use) => {
    await use(expertPage);
  },

  dashboardPage: async ({ expertPage }, use) => {
    await use(new ExpertDashboardPage(expertPage));
  },

  questionDetailsPage: async ({ expertPage }, use) => {
    await use(new ExpertQuestionDetailsPage(expertPage));
  },

  responsePage: async ({ expertPage }, use) => {
    await use(new ResponsePage(expertPage));
  },
});

export { expect };
