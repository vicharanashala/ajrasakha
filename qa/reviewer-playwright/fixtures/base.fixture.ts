import { test as base, expect, type Page } from "@playwright/test";
import { LoginPage } from "../pages/shared/login.page.js";
import { getExpertAccount } from "../helpers/account.helper.js";

type BaseFixtures = {
  loginAs: (email: string, password: string) => Promise<Page>;
  loginAsExpert: (email: string) => Promise<Page>;
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
  loginAsExpert: async ({ loginAs }, use) => {
    await use(async (email: string) => {
      const account = getExpertAccount(email);

      return loginAs(account.email, account.password);
    });
  },
});

export { expect, Page };
