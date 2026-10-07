import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import { env } from "../support/config";
import { fetchIdToken, getRuntimeConfig } from "../support/api";
import { seedFirebaseSession, type Role } from "../support/idb-session";
import { LoginPage } from "../page-objects/LoginPage";
import { HeaderPage } from "../page-objects/HeaderPage";
import { QuestionsPage } from "../page-objects/QuestionsPage";
import { QuestionDetailPage } from "../page-objects/QuestionDetailPage";
import { ExpertQueuePage } from "../page-objects/ExpertQueuePage";
import { UserManagementPage } from "../page-objects/UserManagementPage";

/**
 * Extended fixtures.
 *
 * `*Token` fixtures mint a fresh Firebase ID token for a role using the app's
 * PUBLIC Firebase API key (read from window.__RUNTIME_CONFIG__) and the
 * credentials from e2e/.env. They are used for API-level verification/seeding
 * (e.g. asserting question status after a UI action). Tokens are minted per
 * test and never written to disk. A missing credential throws a clear error.
 */
type E2EFixtures = {
  adminToken: string;
  moderatorToken: string;
  expertToken: string;
  loginPage: LoginPage;
  header: HeaderPage;
  questionsPage: QuestionsPage;
  questionDetail: QuestionDetailPage;
  expertQueue: ExpertQueuePage;
  userManagement: UserManagementPage;
};

/**
 * A role's saved Firebase session (IndexedDB) is restored into every context
 * that carries that role's storageState, before the app reads it. No-op on
 * staging and for unauthenticated contexts. The role projects are named after
 * their role ("admin" | "moderator" | "expert"), which is the stable, public
 * signal for which saved session a context should carry.
 *
 * This runs as a fixture (not a beforeEach hook): Playwright's hook scheduling
 * under fullyParallel is unreliable (hooks were intermittently skipped, leaving
 * fresh contexts without a session). A page fixture dependency is created for
 * every test that touches the page, so seeding here is guaranteed.
 */
export async function seedContext(
  context: BrowserContext,
  role: string,
): Promise<void> {
  if (role === "admin" || role === "moderator" || role === "expert") {
    await seedFirebaseSession(context, role as Role);
  }
}

async function tokenFor(
  page: import("@playwright/test").Page,
  credentials: { email: string; password: string },
): Promise<string> {
  // A fresh context starts on about:blank, where window.__RUNTIME_CONFIG__ is
  // not defined. Load the app shell first so the runtime config is available.
  if (page.url() === "about:blank") {
    await page.goto(env.baseURL + "/auth");
  }
  const cfg = await getRuntimeConfig(page);
  const apiKey = cfg.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VITE_FIREBASE_API_KEY is missing from window.__RUNTIME_CONFIG__",
    );
  }
  return fetchIdToken({
    apiKey,
    email: credentials.email,
    password: credentials.password,
  });
}

export const test = base.extend<E2EFixtures>({
  page: async ({ context }, use, testInfo) => {
    await seedContext(context, testInfo.project.name);
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
  adminToken: async ({ page }, use) => {
    await use(await tokenFor(page, env.admin));
  },
  moderatorToken: async ({ page }, use) => {
    await use(await tokenFor(page, env.moderator));
  },
  expertToken: async ({ page }, use) => {
    await use(await tokenFor(page, env.expert));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  header: async ({ page }, use) => {
    await use(new HeaderPage(page));
  },
  questionsPage: async ({ page }, use) => {
    await use(new QuestionsPage(page));
  },
  questionDetail: async ({ page }, use) => {
    await use(new QuestionDetailPage(page));
  },
  expertQueue: async ({ page }, use) => {
    await use(new ExpertQueuePage(page));
  },
  userManagement: async ({ page }, use) => {
    await use(new UserManagementPage(page));
  },
});

/**
 * Open an extra browser context seeded with a role's saved storageState.
 * Used by cross-role flows (e.g. a moderator test that verifies an expert's
 * submitted answer) without disturbing the current test's context.
 */
export async function openRoleContext(
  browser: Browser,
  role: "admin" | "moderator" | "expert",
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: env.baseURL,
    storageState: env.storageState[role],
  });
  await seedFirebaseSession(context, role);
  return context;
}

export { expect };
export type { Page } from "@playwright/test";
