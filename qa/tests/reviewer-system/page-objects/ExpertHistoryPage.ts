/**
 * Page Object: ExpertHistoryPage
 *
 * Target:  /expert/history  — the expert's own review history.
 *
 * Lists past submissions the current expert has made — answers that have
 * been submitted for peer review, returned for revision, or finalised
 * into the Golden Database.  The PR #2 history tests only assert the
 * page renders and is non-empty when the expert has prior submissions;
 * deeper coverage (status filter, date range, CSV export) lands in
 * PR #5 alongside the analytics suite.
 *
 * Selectors live in `./selector-map.ts` under `SELECTOR_MAP.expert.history`.
 */
import { expect, Locator, Page } from "@playwright/test";
import { SELECTOR_MAP, Routes } from "./selector-map";

export class ExpertHistoryPage {
  readonly page: Page;

  // ── Locators ──────────────────────────────────────────────────────────────
  get heading(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.history.heading}"]`,
    );
  }

  /** All history rows currently rendered. */
  get rows(): Locator {
    return this.page.locator(
      `[data-testid^="${SELECTOR_MAP.expert.history.rowPrefix}"]`,
    );
  }

  get emptyState(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.history.empty}"]`,
    );
  }

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  async goto(): Promise<void> {
    await this.page.goto(Routes.expertHistory);
  }

  // ── Loops / helpers ───────────────────────────────────────────────────────
  rowById(questionId: string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.history.rowPrefix}${questionId}"]`,
    );
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async countRows(): Promise<number> {
    return this.rows.count();
  }

  // ── Assertions ────────────────────────────────────────────────────────────
  async assertOnHistory(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`${Routes.expertHistory}$`));
  }

  /**
   * Hard assertion that the history view rendered something.  Soft-skips
   * are usually the right call for shared staging (a freshly-provisioned
   * expert account may legitimately have zero history) — the spec file
   * decides.
   */
  async assertNonEmpty(): Promise<void> {
    await expect(this.rows.first()).toBeVisible({ timeout: 10_000 });
  }
}
