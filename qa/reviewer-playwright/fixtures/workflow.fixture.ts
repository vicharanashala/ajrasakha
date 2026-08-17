import { test as base, expect, type Page } from "./base.fixture.js";

import { ModeratorDashboardPage } from "../pages/moderator/dashboard.page.js";
import { CreateQuestionPage } from "../pages/moderator/create-question.page.js";
import { ModeratorQuestionDetailsPage } from "../pages/moderator/question-details.page.js";
import { ModeratorAllocationQueuePage } from "../pages/moderator/allocation-queue.page.js";
import { ExpertAllocationSectionPage } from "../pages/workflows/expert-allocation-section.page.js";

import { ExpertDashboardPage } from "../pages/expert/dashboard.page.js";
import { ExpertQuestionDetailsPage } from "../pages/expert/question-details.page.js";
import { ResponsePage } from "../pages/expert/response.page.js";
import { ReviewPanelPage } from "../pages/expert/review-panel.page.js";

type WorkflowFixtures = {
  moderatorPage: Page;
  expertPage: Page;
  loginAsExpert: (email: string) => Promise<Page>;

  moderatorDashboard: ModeratorDashboardPage;
  createQuestionPage: CreateQuestionPage;
  moderatorQuestionDetailsPage: ModeratorQuestionDetailsPage;
  moderatorAllocationQueuePage: ModeratorAllocationQueuePage;
  expertAllocationSectionPage: ExpertAllocationSectionPage;

  expertDashboard: ExpertDashboardPage;
  expertQuestionDetailsPage: ExpertQuestionDetailsPage;
  responsePage: ResponsePage;

  expertLoggedInPage: Page;

  workflowExpertDashboard: ExpertDashboardPage;
  workflowExpertQuestionDetails: ExpertQuestionDetailsPage;
  workflowResponsePage: ResponsePage;

  expert2LoggedInPage: Page;
  expert2Dashboard: ExpertDashboardPage;
  expert2ResponsePage: ResponsePage;
  expert2ReviewPanel: ReviewPanelPage;

  // -----------------------------
  // Third / fourth experts (additional reviewers used by the
  // triple-acceptance workflow — three distinct reviewers accepting the
  // same answer in sequence, on top of the first expert who authored it).
  // -----------------------------
  expert3LoggedInPage: Page;
  expert3Dashboard: ExpertDashboardPage;
  expert3ResponsePage: ResponsePage;
  expert3ReviewPanel: ReviewPanelPage;

  expert4LoggedInPage: Page;
  expert4Dashboard: ExpertDashboardPage;
  expert4ResponsePage: ResponsePage;
  expert4ReviewPanel: ReviewPanelPage;
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

  expertLoggedInPage: async ({ loginAsExpert }, use) => {
    console.log("Logging in as expert...");
    const page = await loginAsExpert(process.env.EXPERT_EMAIL!);
    console.log("Logged in:", page.url());
    await use(page);
    console.log("Closing expert page");
    await page.close();
  },

  // -----------------------------
  // Dynamic Log in as Expert
  // -----------------------------
  loginAsExpert: async ({ loginAsExpert }, use) => {
    await use(loginAsExpert);
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

  workflowExpertDashboard: async ({ expertLoggedInPage }, use) => {
    await use(new ExpertDashboardPage(expertLoggedInPage));
  },

  workflowExpertQuestionDetails: async ({ expertLoggedInPage }, use) => {
    await use(new ExpertQuestionDetailsPage(expertLoggedInPage));
  },

  workflowResponsePage: async ({ expertLoggedInPage }, use) => {
    await use(new ResponsePage(expertLoggedInPage));
  },

  // -----------------------------
  // Second expert (reviewer of the first expert's answer)
  // -----------------------------
  expert2LoggedInPage: async ({ loginAsExpert }, use) => {
    console.log("Logging in as expert 2...");
    const page = await loginAsExpert(process.env.EXPERT_EMAIL_2!);
    console.log("Logged in:", page.url());
    await use(page);
    console.log("Closing expert 2 page");
    await page.close();
  },

  expert2Dashboard: async ({ expert2LoggedInPage }, use) => {
    await use(new ExpertDashboardPage(expert2LoggedInPage));
  },

  expert2ResponsePage: async ({ expert2LoggedInPage }, use) => {
    await use(new ResponsePage(expert2LoggedInPage));
  },

  expert2ReviewPanel: async ({ expert2LoggedInPage }, use) => {
    await use(new ReviewPanelPage(expert2LoggedInPage));
  },

  // -----------------------------
  // Third expert (second reviewer of the first expert's answer)
  // -----------------------------
  expert3LoggedInPage: async ({ loginAsExpert }, use) => {
    console.log("Logging in as expert 3...");
    const page = await loginAsExpert(process.env.EXPERT_EMAIL_3!);
    console.log("Logged in:", page.url());
    await use(page);
    console.log("Closing expert 3 page");
    await page.close();
  },

  expert3Dashboard: async ({ expert3LoggedInPage }, use) => {
    await use(new ExpertDashboardPage(expert3LoggedInPage));
  },

  expert3ResponsePage: async ({ expert3LoggedInPage }, use) => {
    await use(new ResponsePage(expert3LoggedInPage));
  },

  expert3ReviewPanel: async ({ expert3LoggedInPage }, use) => {
    await use(new ReviewPanelPage(expert3LoggedInPage));
  },

  // -----------------------------
  // Fourth expert (third reviewer of the first expert's answer)
  // -----------------------------
  expert4LoggedInPage: async ({ loginAsExpert }, use) => {
    console.log("Logging in as expert 4...");
    const page = await loginAsExpert(process.env.EXPERT_EMAIL_4!);
    console.log("Logged in:", page.url());
    await use(page);
    console.log("Closing expert 4 page");
    await page.close();
  },

  expert4Dashboard: async ({ expert4LoggedInPage }, use) => {
    await use(new ExpertDashboardPage(expert4LoggedInPage));
  },

  expert4ResponsePage: async ({ expert4LoggedInPage }, use) => {
    await use(new ResponsePage(expert4LoggedInPage));
  },

  expert4ReviewPanel: async ({ expert4LoggedInPage }, use) => {
    await use(new ReviewPanelPage(expert4LoggedInPage));
  },
});

export { expect };
