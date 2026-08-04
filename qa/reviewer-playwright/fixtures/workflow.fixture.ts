import { test as base, expect, type Page } from "./base.fixture.js";

import { ModeratorDashboardPage } from "../pages/moderator/dashboard.page.js";
import { CreateQuestionPage } from "../pages/moderator/create-question.page.js";
import { ModeratorQuestionDetailsPage } from "../pages/moderator/question-details.page.js";
import { ModeratorAllocationQueuePage } from "../pages/moderator/allocation-queue.page.js";
import { ExpertAllocationSectionPage } from "../pages/workflows/expert-allocation-section.page.js";

import { ExpertDashboardPage } from "../pages/expert/dashboard.page.js";
import { ExpertQuestionDetailsPage } from "../pages/expert/question-details.page.js";
import { ResponsePage } from "../pages/expert/response.page.js";

type WorkflowFixtures = {
  moderatorPage: Page;
  expertPage: Page;

  moderatorDashboard: ModeratorDashboardPage;
  createQuestionPage: CreateQuestionPage;
  moderatorQuestionDetailsPage: ModeratorQuestionDetailsPage;
  moderatorAllocationQueuePage: ModeratorAllocationQueuePage;
  expertAllocationSectionPage: ExpertAllocationSectionPage;

  expertDashboard: ExpertDashboardPage;
  expertQuestionDetailsPage: ExpertQuestionDetailsPage;
  responsePage: ResponsePage;
};

export const test = base.extend<WorkflowFixtures>({
  // -----------------------------
  // Logged-in Moderator
  // -----------------------------
  moderatorPage: async ({ loginAs }, use) => {
    const page = await loginAs(
      process.env.MODERATOR_EMAIL!,
      process.env.MODERATOR_PASSWORD!,
    );

    await use(page);

    await page.close();
  },

  // -----------------------------
  // Logged-in Expert
  // -----------------------------
  expertPage: async ({ loginAs }, use) => {
    const page = await loginAs(
      process.env.EXPERT_EMAIL!,
      process.env.EXPERT_PASSWORD!,
    );

    await use(page);

    await page.close();
  },

  // -----------------------------
  // Moderator Pages
  // -----------------------------
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

  expertAllocationSectionPage: async ({ moderatorPage }, use) => {
    await use(new ExpertAllocationSectionPage(moderatorPage));
  },

  // -----------------------------
  // Expert Pages
  // -----------------------------
  expertDashboard: async ({ expertPage }, use) => {
    await use(new ExpertDashboardPage(expertPage));
  },

  expertQuestionDetailsPage: async ({ expertPage }, use) => {
    await use(new ExpertQuestionDetailsPage(expertPage));
  },

  responsePage: async ({ expertPage }, use) => {
    await use(new ResponsePage(expertPage));
  },
});

export { expect };
