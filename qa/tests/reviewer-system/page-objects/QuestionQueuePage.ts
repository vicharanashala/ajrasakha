/**
 * Page Object: QuestionQueuePage
 *
 * Target:  /queue  (the moderator's home — list of pending questions)
 *
 * This is the moderator's main workspace.  Tests cover: list rendering,
 * status / language / date filters, search, and opening a question for
 * detail / allocation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  SELECTOR NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 *  See SELECTOR_MAP.ts.  The list rows are intentionally keyed by a stable
 *  `data-testid="queue-row-${questionId}"` so tests can address a specific
 *  row without brittle positional indexing.
 *
 *  If the staging DOM uses a different attribute (e.g. `aria-rowindex`,
 *  a TanStack Table className, etc.), update SELECTOR_MAP only.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { expect, Locator, Page } from "@playwright/test";
import { SELECTOR_MAP, Routes } from "./selector-map";

export class QuestionQueuePage {
  readonly page: Page;

  // ── Locators ──────────────────────────────────────────────────────────────
  // TODO(selector): confirm against staging DOM.
  get heading(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.queue.heading}"]`);
  }

  /** All visible queue rows (locator chain, lazily evaluated). */
  get rows(): Locator {
    return this.page.locator(`[data-testid^="${SELECTOR_MAP.queue.rowPrefix}"]`);
  }

  get emptyState(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.queue.empty}"]`);
  }

  // ── Filter / search controls ──────────────────────────────────────────────
  get statusFilter(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.queue.filterStatus}"]`);
  }

  get languageFilter(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.queue.filterLanguage}"]`);
  }

  get dateFilter(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.queue.filterDate}"]`);
  }

  get searchInput(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.queue.searchInput}"]`);
  }

  get applyFilterButton(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.queue.applyFilter}"]`);
  }

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  async goto(): Promise<void> {
    await this.page.goto(Routes.queue);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  /**
   * Open the detail view for a specific question by ID.  Clicks the row
   * identified by `data-testid="queue-row-${questionId}"`.
   */
  async openQuestion(questionId: string): Promise<void> {
    const row = this.rowById(questionId);
    await row.click();
    await this.page.waitForURL(/\/queue\/.+/);
  }

  /** Apply a status filter.  Accepts the displayed label ("pending", etc.). */
  async filterByStatus(status: string): Promise<void> {
    await this.statusFilter.selectOption(status).catch(async () => {
      // Fallback for custom dropdowns (no <option> children)
      await this.statusFilter.click();
      await this.page.getByRole("option", { name: status }).click();
    });
    await this.applyFilterButton.click();
  }

  async filterByLanguage(language: string): Promise<void> {
    await this.languageFilter.selectOption(language).catch(async () => {
      await this.languageFilter.click();
      await this.page.getByRole("option", { name: language }).click();
    });
    await this.applyFilterButton.click();
  }

  async search(text: string): Promise<void> {
    await this.searchInput.fill(text);
    await this.searchInput.press("Enter");
  }

  // ── Loops / helpers ────────────────────────────────────────────────────────
  rowById(questionId: string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.queue.rowPrefix}${questionId}"]`,
    );
  }

  /** Read the visible status badge for a specific row. */
  rowStatus(questionId: string): Locator {
    return this.rowById(questionId).locator(
      `[data-testid="${SELECTOR_MAP.queue.rowStatus}"]`,
    );
  }

  // ── Assertions ─────────────────────────────────────────────────────────────
  /**
   * Assert the queue shows at least one row.  Does NOT hard-fail when
   * staging queue happens to be empty — callers decide whether to skip.
   *
   * @returns the number of rows observed.
   */
  async countRows(): Promise<number> {
    return this.rows.count();
  }

  /**
   * Strict assertion: queue must be non-empty.  Use sparingly — empty
   * staging data should usually soft-fail rather than block CI.
   */
  async assertNonEmpty(): Promise<void> {
    await expect(this.rows.first()).toBeVisible({ timeout: 10_000 });
  }

  async assertOnQueuePage(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`${Routes.queue}$`));
  }
}