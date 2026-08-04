import { test as base, expect, type Page } from "@playwright/test";
import { LoginPage } from "../pages/shared/login.page.js";

type BaseFixtures = {
  loginAs: (email: string, password: string) => Promise<Page>;
};

export const test = base.extend<BaseFixtures>({
  loginAs: async ({ browser }, use) => {
    await use(async (email: string, password: string) => {
      const page = await browser.newPage();

      const login = new LoginPage(page);

      await login.signInAndWaitForLanding(email, password);

      return page;
    });
  },
});

export { expect, Page };
