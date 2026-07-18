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
 *
 *  PR #4 adds queue-details sections:
 *    • A "total" badge (`data-testid="queue-total-count"`) at the top of /queue
 *    • A collapsible section accordion per status (pending / in-review / stuck
 *      / closed).  Each section has a count badge and a card container that
 *      renders the section rows when expanded.
 *
 *  The PR #1 row locator (`data-testid^="queue-row-"`) is reused for the
 *  rows inside each section — the row ID prefix is stable across the page.
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

  // ── PR #4 queue details (counts + sections) ──────────────────────────────
  /** The "Total questions: N" badge at the top of the queue page. */
  get totalCount(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.queue.totalCount}"]`);
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

  // ── PR #4 queue details helpers ──────────────────────────────────────────
  /** Outer section container (`data-testid="queue-section-{name}"`). */
  section(name: string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.queue.sectionPrefix}${name}"]`,
    );
  }

  /** The count badge inside a section (e.g. "12" inside the Pending section). */
  sectionCount(name: string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.queue.sectionCountPrefix}${name}"]`,
    );
  }

  /** The expand/collapse toggle for a section. */
  sectionToggle(name: string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.queue.sectionTogglePrefix}${name}"]`,
    );
  }

  /** The card container holding the section's rows when expanded. */
  sectionRows(name: string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.queue.sectionRowsPrefix}${name}"]`,
    );
  }

  /**
   * Read the count shown on a section's badge.  Returns `null` when the
   * badge is missing (the section is collapsed, the staging DOM uses a
   * different testid, or the section has been hidden).
   *
   * Strips thousands separators so the value parses with `Number.parseInt`
   * regardless of locale formatting (`1,234` → 1234).
   */
  async readSectionCount(name: string): Promise<number | null> {
    const badge = this.sectionCount(name);
    if ((await badge.count()) === 0) return null;
    const text = (await badge.innerText().catch(() => "")).trim();
    if (!text) return null;
    const cleaned = text.replace(/[,\s]/g, "");
    const parsed = Number.parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /** Read the "Total questions: N" badge at the top of the page. */
  async readTotalCount(): Promise<number | null> {
    if ((await this.totalCount.count()) === 0) return null;
    const text = (await this.totalCount.innerText().catch(() => "")).trim();
    if (!text) return null;
    const match = text.match(/(\d[\d,\s]*)/);
    const cleaned = (match ? match[1] : text).replace(/[,\s]/g, "");
    const parsed = Number.parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Count the rows that are visually rendered inside a specific section's
   * card container.  When the section is collapsed the container is hidden
   * (Playwright reports 0) — callers should expand the section first via
   * {@link expandSection} if they need a real card count.
   */
  async countRowsInSection(name: string): Promise<number> {
    const container = this.sectionRows(name);
    if ((await container.count()) === 0) return 0;
    return container.locator(`[data-testid^="${SELECTOR_MAP.queue.rowPrefix}"]`).count();
  }

  /**
   * Expand a section's accordion.  Idempotent — clicking an already-expanded
   * toggle is a no-op on the staging UI (we tolerate either toggle).
   */
  async expandSection(name: string): Promise<void> {
    const toggle = this.sectionToggle(name);
    if ((await toggle.count()) === 0) return;
    await toggle.click().catch(() => undefined);
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

  rowStuckIndicator(questionId: string): Locator {
    return this.rowById(questionId).locator(
      `[data-testid="${SELECTOR_MAP.queue.rowStuckIndicator}"]`,
    );
  }

  rowStuckTooltip(questionId: string): Locator {
    return this.rowById(questionId).locator(
      `[data-testid="${SELECTOR_MAP.queue.rowStuckTooltip}"]`,
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