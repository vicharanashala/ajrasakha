import { test as base, expect, type Page } from "./base.fixture.js";

import { ModeratorDashboardPage } from "../pages/moderator/dashboard.page.js";
import { CreateQuestionPage } from "../pages/moderator/create-question.page.js";
import { ModeratorQuestionDetailsPage } from "../pages/moderator/question-details.page.js";
import { ModeratorAllocationQueuePage } from "../pages/moderator/allocation-queue.page.js";

type ModeratorFixtures = {
  moderatorPage: Page;

  moderatorDashboard: ModeratorDashboardPage;
  createQuestionPage: CreateQuestionPage;
  moderatorQuestionDetailsPage: ModeratorQuestionDetailsPage;
  moderatorAllocationQueuePage: ModeratorAllocationQueuePage;
};
type Credentials = {
  email: string;
  password: string;
};

export const test = base.extend<ModeratorFixtures>({
  moderatorPage: async ({ loginAs }, use) => {
    const page = await loginAs(
      process.env.MODERATOR_EMAIL!,
      process.env.MODERATOR_PASSWORD!,
    );

    await use(page);

    await page.close();
  },

  moderatorDashboard: async ({ moderatorPage }, use) => {
    await use(new ModeratorDashboardPage(moderatorPage));
  },

  createQuestionPage: async ({ moderatorPage }, use) => {
    await use(new CreateQuestionPage(moderatorPage));
  },

  moderatorQuestionDetailsPage: async ({ moderatorPage }, use) => {
    await use(new ModeratorQuestionDetailsPage(moderatorPage));
  },

  moderatorAllocationQueuePage: async ({ moderatorPage }, use) => {
    await use(new ModeratorAllocationQueuePage(moderatorPage));
  },
});

export { expect };
