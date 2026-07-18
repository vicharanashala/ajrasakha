/**
 * Page Object: ModeratorDashboardPage
 *
 * Target:  /dashboard  (the moderator's overview / landing page)
 *
 * Currently a thin wrapper around the dashboard's stat cards + logout
 * affordance.  Used by the auth + session tests; analytics coverage
 * will land in a later PR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELECTOR NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 *  TODO(selector): stat cards and logout button are best-guess testids.
 *  Replace with the real ones once staging is confirmed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { expect, Locator, Page } from "@playwright/test";
import { SELECTOR_MAP, Routes } from "./selector-map";

export class ModeratorDashboardPage {
  readonly page: Page;

  // ── Locators ──────────────────────────────────────────────────────────────
  get heading(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.dashboard.heading}"]`);
  }

  /** Generic stat-card container keyed by stat name, e.g. `dashboard-stat-pending`. */
  statCard(stat: string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.dashboard.statPrefix}${stat}"]`,
    );
  }

  /** User menu / avatar that reveals the logout button on click. */
  get userMenu(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.dashboard.userMenu}"]`);
  }

  get logoutButton(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.dashboard.logoutButton}"]`);
  }

  constructor(page: Page) {
    this.page = page;
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async goto(): Promise<void> {
    await this.page.goto(Routes.dashboard);
  }

  /**
   * Logout flow — opens the user menu (if it's collapsed) and clicks logout.
   * Assumes the SPA handles the auth-token clearing and redirects to /login.
   */
  async logout(): Promise<void> {
    if (await this.userMenu.isVisible().catch(() => false)) {
      await this.userMenu.click();
    }
    await this.logoutButton.click();
    await this.page.waitForURL(/\/login$/, { timeout: 10_000 });
  }

  // ── Assertions ─────────────────────────────────────────────────────────────
  async assertOnDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`${Routes.dashboard}$`));
  }

  /**
   * Assert that visiting /queue AFTER logging out bounces back to /login.
   * Catches the common bug where the SPA's client-side guard accepts a
   * cleared cookie but the route still renders the protected view.
   */
  async assertQueueRedirectsToLoginWhenUnauthenticated(): Promise<void> {
    await this.page.goto(Routes.queue);
    await expect(this.page).toHaveURL(/\/login(\?|$)/, { timeout: 5_000 });
  }
}