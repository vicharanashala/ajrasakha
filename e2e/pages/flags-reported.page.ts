import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Flags Reported Page Object — /flags-reported route.
 *
 * Shows flagged questions that need moderator attention.
 */
export class FlagsReportedPage extends BasePage {
  // ── Locators ────────────────────────────────────────────────

  /** Page container */
  readonly container: Locator;

  /** Flagged questions table / list */
  readonly flagsTable: Locator;

  /** Flagged question rows */
  readonly flaggedRows: Locator;

  /** Flag reason text */
  readonly flagReasons: Locator;

  /** Empty state */
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.locator('main, [class*="flags"], [class*="Flags"]').first();
    this.flagsTable = page.locator('table, [class*="flag-table"], [class*="FlagTable"]').first();
    this.flaggedRows = page.locator('table tbody tr, [class*="flag-row"], [class*="FlagRow"]');
    this.flagReasons = page.locator('[class*="reason"], [class*="Reason"]');
    this.emptyState = page.locator(':text("No flags"), :text("no flags"), :text("No data"), :text("empty")');
  }

  // ── Actions ─────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigateTo('/flags-reported');
  }

  async getFlaggedQuestionCount(): Promise<number> {
    await this.page.waitForTimeout(2000);
    return this.flaggedRows.count();
  }

  async isOnFlagsPage(): Promise<boolean> {
    const path = await this.currentPath();
    return path.startsWith('/flags-reported');
  }
}
