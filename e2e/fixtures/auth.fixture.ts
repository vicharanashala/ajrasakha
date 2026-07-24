import { test as base, type Page, type BrowserContext } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

// ──────────────────────────────────────────────────────────────
// Credentials from environment
// ──────────────────────────────────────────────────────────────
const MODERATOR_EMAIL = process.env.MODERATOR_EMAIL ?? '';
const MODERATOR_PASSWORD = process.env.MODERATOR_PASSWORD ?? '';
const EXPERT_EMAIL = process.env.EXPERT_EMAIL ?? '';
const EXPERT_PASSWORD = process.env.EXPERT_PASSWORD ?? '';

// ──────────────────────────────────────────────────────────────
// Shared helper — perform Firebase email/password login
// ──────────────────────────────────────────────────────────────
async function loginAs(page: Page, email: string, password: string): Promise<void> {
  if (!email || !password) {
    throw new Error(
      `Missing credentials: email="${email ? '(set)' : '(empty)'}", password="${password ? '(set)' : '(empty)'}". ` +
      'Populate MODERATOR_EMAIL / MODERATOR_PASSWORD / EXPERT_EMAIL / EXPERT_PASSWORD in e2e/.env.e2e',
    );
  }

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(email, password);

  // Wait until the app redirects away from /auth.
  // Use 'commit' instead of 'load' to avoid hanging on slow third-party resources.
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), {
    timeout: 30_000,
    waitUntil: 'commit',
  });
}

// ──────────────────────────────────────────────────────────────
// Custom fixture types
// ──────────────────────────────────────────────────────────────
type AuthFixtures = {
  /** A page already logged-in as a moderator */
  moderatorPage: Page;
  /** A page already logged-in as an expert */
  expertPage: Page;
  /** A fresh, unauthenticated page */
  unauthenticatedPage: Page;
};

// ──────────────────────────────────────────────────────────────
// Extended test with auth fixtures
// ──────────────────────────────────────────────────────────────
export const test = base.extend<AuthFixtures>({
  moderatorPage: async ({ browser }, use) => {
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, MODERATOR_EMAIL, MODERATOR_PASSWORD);
    await use(page);
    await context.close();
  },

  expertPage: async ({ browser }, use) => {
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, EXPERT_EMAIL, EXPERT_PASSWORD);
    await use(page);
    await context.close();
  },

  unauthenticatedPage: async ({ browser }, use) => {
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
