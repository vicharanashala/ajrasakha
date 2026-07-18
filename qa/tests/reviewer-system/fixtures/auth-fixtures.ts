/**
 * Reviewer-system auth fixtures.
 *
 * A custom fixture that extends the base Playwright `test` with two
 * pre-built page objects (Login + QuestionQueue) so spec files don't have
 * to `new` them every test.
 *
 *   import { test, expect } from "../fixtures/auth-fixtures";
 *
 *   test("...", async ({ page, loginPage, queuePage }) => { ... });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Why a per-system fixture?
 * ─────────────────────────────────────────────────────────────────────────────
 *  The reviewer-system uses different page objects + credentials than the
 *  web-app suite.  Mixing both into a single fixture makes imports noisy
 *  and forces the web-app tests to pull in reviewer selectors (and vice
 *  versa).  Each suite gets its own fixture file under
 *  `tests/<system>/fixtures/`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { test as base, expect, Page } from "@playwright/test";
import {
  LoginPage,
  QuestionQueuePage,
  QuestionDetailPage,
  ModeratorDashboardPage,
} from "../page-objects";
import { testConfig } from "../../helpers/test-config";

/**
 * Has every required env var to actually run reviewer tests.  Accepts the
 * legacy REVIEWER_BASE_URL alias so existing CI secrets continue to work.
 */
export function reviewerCredsAvailable(): boolean {
  return (
    !!(
      process.env.REVIEWER_STAGING_URL || process.env.REVIEWER_BASE_URL
    ) &&
    !!testConfig.reviewer.moderator.email &&
    !!testConfig.reviewer.moderator.password
  );
}

/**
 * Has at least one expert credential configured.  Spec files use this to
 * `test.skip()` allocation tests when no expert secret is set.
 */
export function expertCredsAvailable(): boolean {
  return (
    !!testConfig.reviewer.expert.email &&
    !!testConfig.reviewer.expert.password
  );
}

type AuthFixtures = {
  loginPage: LoginPage;
  queuePage: QuestionQueuePage;
  detailPage: QuestionDetailPage;
  dashboardPage: ModeratorDashboardPage;
};

/**
 * Build the fixture extension.  Page objects are constructed once per test
 * (Playwright auto-cleans the underlying `page`) so they're cheap to make.
 *
 * Every fixture must depend on the underlying `page` so we never hand out a
 * page object before the page itself is initialised.  This also sidesteps
 * the ESLint `no-empty-pattern` rule that rejects an `({})` destructuring.
 */
export const test = base.extend<AuthFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  queuePage: async ({ page }, use) => {
    await use(new QuestionQueuePage(page));
  },
  detailPage: async ({ page }, use) => {
    await use(new QuestionDetailPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new ModeratorDashboardPage(page));
  },
});

/**
 * Re-export the typed `expect` so callers don't have to import it twice.
 */
export { expect };
export { Page };
export default test;