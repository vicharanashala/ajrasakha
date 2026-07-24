import { test as base, expect, type Page } from "@playwright/test";
import { LoginPage } from "../pages/login.page.js";
import { DashboardPage } from "../pages/dashboard.page.js";
import { QuestionDetailsPage } from "../pages/question-details.page.js";
import { ResponsePage } from "../pages/response.page.js";
type ReviewerFixtures = {
  environmentPage: Page;
  authenticatedPage: Page;
  dashboardPage: DashboardPage;
  questionDetailsPage: QuestionDetailsPage;
  responsePage: ResponsePage;
};

const credentials = () => ({
  email: process.env.REVIEWER_USER_EMAIL,
  password: process.env.REVIEWER_USER_PASSWORD,
});

export const test = base.extend<ReviewerFixtures>({
  environmentPage: async ({ page }, use, testInfo) => {
    try {
      const response = await page.request.get("/auth", { timeout: 5_000 });
      if (!response.ok()) {
        const reason = `Blocked: Reviewer frontend returned HTTP ${response.status()}.`;
        testInfo.annotations.push({ type: "blocked", description: reason });
        base.skip(true, reason);
      }
    } catch (error) {
      const reason = `Blocked: Reviewer frontend is unreachable at ${process.env.REVIEWER_BASE_URL ?? "http://127.0.0.1:5173"}.`;
      testInfo.annotations.push({ type: "blocked", description: reason });
      base.skip(true, reason);
    }

    await use(page);
  },

  authenticatedPage: async ({ environmentPage }, use) => {
    const { email, password } = credentials();
    if (!email || !password) {
      throw new Error(
        "REVIEWER_USER_EMAIL and REVIEWER_USER_PASSWORD are required for authenticated non-PERM-001 tests.",
      );
    }
    const login = new LoginPage(environmentPage);
    await login.signInAndWaitForLanding(email, password);
    await expect(environmentPage).toHaveURL(/\/home(?:[/?#]|$)/);
    await use(environmentPage);
  },

  dashboardPage: async ({ authenticatedPage }, use) => {
    await use(new DashboardPage(authenticatedPage));
  },

  questionDetailsPage: async ({ authenticatedPage }, use) => {
    await use(new QuestionDetailsPage(authenticatedPage));
  },

  responsePage: async ({ authenticatedPage }, use) => {
    await use(new ResponsePage(authenticatedPage));
  },
});

export { expect } from "@playwright/test";
