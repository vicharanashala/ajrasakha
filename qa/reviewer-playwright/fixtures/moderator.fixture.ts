import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../pages/shared/login.page.js";
import { ModeratorDashboardPage } from "../pages/moderator/dashboard.page.js";

type ModeratorFixtures = {
  moderatorDashboard: ModeratorDashboardPage;
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
});

export { expect };
