import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { test as base, type Page } from "@playwright/test";

type TestRoles = "admin" | "moderator" | "expert";

interface TestAccounts {
  admin: { email: string; password: string };
  moderator: { email: string; password: string };
  expert: { email: string; password: string };
}

function getTestAccounts(): TestAccounts {
  return {
    admin: {
      email: process.env.TEST_ADMIN_EMAIL || "",
      password: process.env.TEST_ADMIN_PASSWORD || "",
    },
    moderator: {
      email: process.env.TEST_MODERATOR_EMAIL || "",
      password: process.env.TEST_MODERATOR_PASSWORD || "",
    },
    expert: {
      email: process.env.TEST_EXPERT_EMAIL || "",
      password: process.env.TEST_EXPERT_PASSWORD || "",
    },
  };
}

async function loginAs(page: Page, role: TestRoles): Promise<void> {
  const accounts = getTestAccounts();
  const account = accounts[role];

  if (!account.email || !account.password) {
    throw new Error(
      `Missing credentials for role "${role}". Set TEST_${role.toUpperCase()}_EMAIL and TEST_${role.toUpperCase()}_PASSWORD environment variables.`,
    );
  }

  await page.goto("/auth");
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });

  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await page.click('button[type="submit"]');

  await page.waitForURL("**/home", { timeout: 30_000 });
  await page.waitForSelector("header", { timeout: 15_000 });
}

export const test = base.extend<{
  adminPage: Page;
  moderatorPage: Page;
  expertPage: Page;
}>({
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, "admin");
    await use(page);
    await context.close();
  },
  moderatorPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, "moderator");
    await use(page);
    await context.close();
  },
  expertPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, "expert");
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
