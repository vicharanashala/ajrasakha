/**
 * Page Object: ExpertInboxPage
 *
 * Target:  /expert/inbox  — the expert's "assigned to me" workspace.
 *
 * This is the entry point for the expert flow: every question a
 * moderator has allocated to the current expert lands here, and opening a
 * row navigates to `Routes.expertDetail(id)` where the answer form lives.
 *
 * Why a separate page object (instead of reusing QuestionQueuePage)?
 * ──────────────────────────────────────────────────────────────────
 *  • The DOM is keyed by a different row prefix (`expert-inbox-row-`)
 *    and exposes different metadata badges (language, deadline / SLA,
 *    status badge) — reusing the moderator page object would force
 *    cross-mingling of locators that won't exist in the same render.
 *  • The moderator's /queue is permission-scoped; the expert inbox is
 *    also server-side gated.  Keeping them split makes permission
 *    regressions easy to bisect.
 *
 * Selectors live in `./selector-map.ts` under `SELECTOR_MAP.expert.inbox`.
 * Anything marked `// TODO(selector)` must be swapped for the real DOM
 * attribute once the staging frontend is confirmed.
 */
import { expect, Locator, Page } from "@playwright/test";
import { SELECTOR_MAP, Routes } from "./selector-map";

export class ExpertInboxPage {
  readonly page: Page;

  // ── Locators ──────────────────────────────────────────────────────────────
  get heading(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.inbox.heading}"]`,
    );
  }

  /** All inbox rows currently rendered (lazy locator chain). */
  get rows(): Locator {
    return this.page.locator(
      `[data-testid^="${SELECTOR_MAP.expert.inbox.rowPrefix}"]`,
    );
  }

  get emptyState(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.inbox.empty}"]`,
    );
  }

  /** Optional link/button that navigates to /expert/history. */
  get historyLink(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.inbox.linkHistory}"]`,
    );
  }

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  async goto(): Promise<void> {
    await this.page.goto(Routes.expertInbox);
  }

  // ── Loops / helpers ───────────────────────────────────────────────────────
  rowById(questionId: string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.inbox.rowPrefix}${questionId}"]`,
    );
  }

  rowLanguage(questionId: string): Locator {
    return this.rowById(questionId).locator(
      `[data-testid="${SELECTOR_MAP.expert.inbox.rowLanguage}"]`,
    );
  }

  /** Read the SLA / due-by badge for a specific assignment. */
  rowDeadline(questionId: string): Locator {
    return this.rowById(questionId).locator(
      `[data-testid="${SELECTOR_MAP.expert.inbox.rowDeadline}"]`,
    );
  }

  rowStatus(questionId: string): Locator {
    return this.rowById(questionId).locator(
      `[data-testid="${SELECTOR_MAP.expert.inbox.rowStatus}"]`,
    );
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Click the inbox row for `questionId` and wait for the detail route. */
  async openQuestion(questionId: string): Promise<void> {
    await this.rowById(questionId).click();
    await this.page.waitForURL(/\/expert\/inbox\/.+/);
  }

  // ── Assertions ────────────────────────────────────────────────────────────
  async assertOnInbox(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`${Routes.expertInbox}$`));
  }

  /**
   * Returns the visible row count.  An empty inbox is *expected* for a fresh
   * staging environment; callers decide whether to soft-skip (recommended
   * for shared-test data) or assert.
   */
  async countRows(): Promise<number> {
    return this.rows.count();
  }

  /** Hard assertion that the inbox has at least one row. */
  async assertNonEmpty(): Promise<void> {
    await expect(this.rows.first()).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Assert a specific question is rendered in the inbox.  Used by the
   * "expert sees the allocation" test to make sure the moderator's side
   * effect (PR #1) reaches the expert's inbox.
   */
  async assertHasQuestion(questionId: string): Promise<void> {
    await expect(this.rowById(questionId)).toBeVisible({ timeout: 10_000 });
  }
}
