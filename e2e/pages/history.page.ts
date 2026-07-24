import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * History Page Object — /history route.
 *
 * Displays the review history table with past review actions.
 */
export class HistoryPage extends BasePage {
  // ── Locators ────────────────────────────────────────────────

  /** History table / list container */
  readonly historyTable: Locator;

  /** Table rows */
  readonly historyRows: Locator;

  /** Status cells */
  readonly statusCells: Locator;

  /** Empty state */
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.historyTable = page.locator('table, [class*="history"], [class*="History"]').first();
    this.historyRows = page.locator('table tbody tr, [class*="history-row"], [class*="HistoryRow"]');
    this.statusCells = page.locator('[class*="badge"], [class*="Badge"], [class*="status"]');
    this.emptyState = page.locator(':text("No history"), :text("no history"), :text("No data"), :text("empty")');
  }

  // ── Actions ─────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigateTo('/history');
  }

  async getHistoryRowCount(): Promise<number> {
    await this.page.waitForTimeout(2000);
    return this.historyRows.count();
  }

  async isOnHistoryPage(): Promise<boolean> {
    const path = await this.currentPath();
    return path.startsWith('/history');
  }
}
