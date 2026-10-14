import { type Page, type Locator, expect } from "@playwright/test";

/**
 * "All Questions" tab (QuestionsPage → QuestionsTable/QuestionRow).
 * Row selection opens the question detail view via `onViewMore`.
 */
export class QuestionsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get searchInput(): Locator {
    return this.page.getByPlaceholder("Search...");
  }

  get tableRows(): Locator {
    return this.page.locator("tbody tr");
  }

  get emptyState(): Locator {
    return this.page.getByText("No questions found").first();
  }

  get queueDetailsButton(): Locator {
    return this.page.getByRole("button", { name: /Queue Details/i }).first();
  }

  get queueDetailsModal(): Locator {
    return this.page.getByRole("dialog", { name: /queue details/i });
  }

  /** Toolbar filter trigger (icon-only Button with the Filter glyph). */
  get filterToolbarButton(): Locator {
    return this.page.locator("button:has(svg.lucide-filter)").first();
  }

  /**
   * Wait for the question list to finish rendering.
   *
   * The empty state ("No questions found") is rendered inside a `<tbody><tr>`,
   * so `tbody tr` ALWAYS matches — `.or(emptyState)` therefore resolves BOTH
   * branches at once (Playwright strict-mode violation). Instead, require a
   * data row that does NOT contain the empty-state text, OR the empty state
   * itself. Either resolves to exactly one element.
   */
  async expectListRendered(): Promise<void> {
    const dataRow = this.page
      .locator("tbody tr")
      .filter({ hasNot: this.page.getByText("No questions found") })
      .first();
    await expect(dataRow.or(this.emptyState)).toBeVisible({ timeout: 30_000 });
  }

  /** "Preferences / Advanced Filters" trigger inside the sidebar panel. */
  get preferencesButton(): Locator {
    return this.page.getByRole("button", { name: /Advanced Filters/ }).first();
  }

  get preferencesDialog(): Locator {
    return this.page.getByRole("dialog", { name: /Advanced Filters/i });
  }

  /** Open the sidebar panel and then the Preferences (Advanced Filters) dialog. */
  async openPreferences(): Promise<void> {
    await this.filterToolbarButton.click();
    await this.preferencesButton.click();
    await expect(this.preferencesDialog).toBeVisible({ timeout: 15_000 });
  }

  /** Source / answer-mode switcher button (AnswerModeSwitcher.tsx). */
  modeButton(mode: string): Locator {
    return this.page.locator(`button[data-mode="${mode}"]`);
  }

  /**
   * Switch the source filter via the AnswerModeSwitcher and wait for the URL's
   * `source` param to settle (questions-page syncs it in a useEffect).
   */
  async setSourceMode(mode: "ajraskha" | "manual" | "outreach" | "whatsapp"): Promise<void> {
    const sourceByMode: Record<string, string> = {
      ajraskha: "AJRASAKHA",
      manual: "AGRI_EXPERT",
      outreach: "OUTREACH",
      whatsapp: "WHATSAPP",
    };
    await this.modeButton(mode).click();
    await expect
      .poll(async () => new URL(this.page.url()).searchParams.get("source"))
      .toBe(sourceByMode[mode]);
  }

  async goto(): Promise<void> {
    await this.page.goto("/home");
    await this.page
      .locator("header")
      .getByRole("tab", { name: "All Questions", exact: true })
      .click();
  }

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await expect(this.searchInput).toHaveValue(term);
  }

  /** Clear the search box via the inline X button. */
  async clearSearch(): Promise<void> {
    const clearBtn = this.searchInput.locator("xpath=following-sibling::button");
    if (await clearBtn.isVisible().catch(() => false)) await clearBtn.click();
    else await this.searchInput.fill("");
    await expect(this.searchInput).toHaveValue("");
  }

  /**
   * Set the Question Status filter via Preferences (Advanced Filters) dialog.
   * The status select (SearchableFilterSelect) shows "All Statuses" initially.
   */
  async setStatusFilterInPreferences(optionLabel: string): Promise<void> {
    await this.openPreferences();
    const dialog = this.preferencesDialog;
    await dialog
      .getByRole("combobox")
      .filter({ hasText: "All Statuses" })
      .first()
      .click();
    await this.page
      .getByRole("option", { name: optionLabel, exact: true })
      .first()
      .click();
    await dialog.getByRole("button", { name: "Apply Preferences" }).click();
    await expect(dialog).toHaveCount(0);
  }

  /**
   * Click the question-text span of the first data row (QuestionRow.tsx
   * gates `onViewMore` on that span — clicking the whole `<tr>` does nothing).
   */
  async openFirstRow(): Promise<void> {
    await this.expectListRendered();
    await this.page
      .locator("tbody tr")
      .filter({ hasNot: this.page.getByText("No questions found") })
      .first()
      .locator("td span.cursor-pointer")
      .first()
      .click();
  }

  /** Open the row whose cell text includes `text`. */
  async openRowContaining(text: string): Promise<void> {
    const row = this.page
      .locator("tbody tr")
      .filter({ hasText: text })
      .first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    const questionCell = row.locator("td span.cursor-pointer").first();
    // Rows stay unclickable for a short while after creation (expert-allocation
    // delay); wait for the clickable state (drops `cursor-not-allowed`).
    await expect(questionCell).not.toHaveClass(/cursor-not-allowed/, {
      timeout: 240_000,
    });
    await questionCell.click();
  }

  async openQueueDetails(): Promise<void> {
    // The Queue Details trigger lives inside the slide-in sidebar drawer, which
    // is opened by the filter toolbar button (QuestionsFilters.tsx).
    await this.filterToolbarButton.click();
    await expect(this.queueDetailsButton).toBeVisible({ timeout: 15_000 });
    await this.queueDetailsButton.click();
    await expect(this.queueDetailsModal).toBeVisible({ timeout: 15_000 });
  }

  /** Modal section labels for queue counts (QueueDetailsModal.tsx). */
  async queueSection(label: string): Promise<Locator> {
    return this.queueDetailsModal.getByText(label, { exact: false }).first();
  }
}
