import type { Page, Locator } from "@playwright/test";

export class QuestionsPage {
  readonly page: Page;
  readonly table: Locator;
  readonly rows: Locator;
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly pagination: Locator;
  readonly queueDetailsButton: Locator;
  readonly questionCount: Locator;

  constructor(page: Page) {
    this.page = page;
    this.table = page.locator("table");
    this.rows = page.locator("table tbody tr");
    this.searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="filter" i]');
    this.statusFilter = page.locator('[role="combobox"]').first();
    this.pagination = page.locator('[class*="pagination"]');
    this.queueDetailsButton = page.getByRole("button", { name: /queue details/i });
    this.questionCount = page.locator("text=/\\d+ questions?/i");
  }

  async getRowCount(): Promise<number> {
    return this.rows.count();
  }

  async clickRow(index: number) {
    await this.rows.nth(index).click();
  }

  async waitForTableLoad() {
    await this.page.waitForSelector("table tbody tr", { timeout: 15_000 });
  }
}
