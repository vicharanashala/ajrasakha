import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Expert queue (QA-interface, "My Queue" tab).
 *
 * Mechanics (QA-interface.tsx): the first timebound/allocated question is
 * auto-selected; drafts persist to localStorage `questionDrafts`; the submit
 * button opens a confirm dialog titled "Submit Response". Submitting without
 * sources shows "At least one source is required!".
 */
export class ExpertQueuePage {
  readonly page: Page;
  readonly answerTextarea: Locator;
  readonly remarksInput: Locator;
  readonly submitButton: Locator;
  readonly applyAiAnswerButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.answerTextarea = page.getByPlaceholder("Enter your answer here...");
    this.remarksInput = page.getByPlaceholder("Enter remarks...");
    // The trigger is a Button labelled "Submit"; the confirmation dialog's
    // confirm button is labelled "Submit Response" (QA-interface ConfirmationModal).
    this.submitButton = page.getByRole("button", { name: "Submit", exact: true }).first();
    this.applyAiAnswerButton = page.getByRole("button", {
      name: "Apply Suggested AI Answer",
    });
  }

  async goto(): Promise<void> {
    await this.page.goto("/home");
    await this.page
      .locator("header")
      .getByRole("tab", { name: "My Queue", exact: true })
      .click();
  }

  get questionItems(): Locator {
    return this.page.locator("div").filter({ has: this.answerTextarea }).first().locator(
      "[role=button], li, [class*=cursor-pointer]",
    );
  }

  /** "Question Queues" card rendered when the queue has items. */
  get queueCard(): Locator {
    return this.page.getByText("Question Queues", { exact: true }).first();
  }

  /** Empty-state copy shown when the queue has no questions. */
  get emptyState(): Locator {
    return this.page.getByText(/No questions are available at the moment/i).first();
  }

  async selectQuestionByText(text: string): Promise<void> {
    const item = this.page.getByText(text, { exact: false }).first();
    await expect(item).toBeVisible({ timeout: 30_000 });
    await item.click();
    await expect(this.answerTextarea).toBeVisible();
  }

  async fillAnswer(answer: string): Promise<void> {
    await this.answerTextarea.fill(answer);
    await expect(this.answerTextarea).toHaveValue(answer);
  }

  async fillRemarks(remarks: string): Promise<void> {
    await this.remarksInput.fill(remarks);
  }

  /** Add a source via the source URL manager (first "Add" affordance). */
  async addSource(url: string): Promise<void> {
    const addButton = this.page
      .getByRole("button", { name: /add/i })
      .first();
    await addButton.click();
    const urlInput = this.page.getByPlaceholder(/source|url|link/i).first();
    await urlInput.fill(url);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
    const dialog = this.page.getByRole("alertdialog", { name: "Submit Response" });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Submit Response", exact: true })
      .click();
  }

  get finalAnswerBanner(): Locator {
    return this.page.getByText(/congratulations.*selected as the final/i);
  }

  /** Draft persistence key used by the QA interface. */
  async readDraft(questionId: string): Promise<Record<string, unknown> | null> {
    const raw = await this.page.evaluate(() => localStorage.getItem("questionDrafts"));
    if (!raw) return null;
    const drafts = JSON.parse(raw) as Record<string, unknown>;
    return (drafts[questionId] as Record<string, unknown>) ?? null;
  }
}
