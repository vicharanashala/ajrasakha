import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Question detail view (QuestionsPage → QuestionDetails). Rendered when a row
 * is opened; includes the question text, prev/next navigation and answer items.
 */
export class QuestionDetailPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get questionText(): Locator {
    return this.page.locator("main").getByText(/[?？]/).first();
  }

  /** Answer cards on the detail page (AnswerItem renders a Card). */
  answerCard(text: string): Locator {
    return this.page.locator("div.rounded-xl, div.border").filter({ hasText: text }).first();
  }

  get prevButton(): Locator {
    return this.page.getByRole("button", { name: /prev|previous|‹/i }).first();
  }

  get nextButton(): Locator {
    return this.page.getByRole("button", { name: /next|›/i }).first();
  }

  async expectQuestionVisible(text: string): Promise<void> {
    await expect(this.page.getByText(text, { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    });
  }

  async goBack(): Promise<void> {
    const back = this.page.getByRole("button", { name: /go back|back|←/i }).first();
    await back.click();
  }

  get autoAllocateToggle(): Locator {
    return this.page.locator("#auto-allocate");
  }

  get selectExpertsButton(): Locator {
    return this.page.getByRole("button", { name: /Select Experts/ });
  }

  get allocationDialog(): Locator {
    return this.page.getByRole("dialog", { name: /Select Experts Manually/ });
  }

  get expertSearchInput(): Locator {
    return this.page.getByPlaceholder("Search experts by name, email...");
  }

  async selectExpertByEmail(email: string): Promise<void> {
    await this.expertSearchInput.fill(email);
    const label = this.page
      .locator("label")
      .filter({ hasText: email })
      .first();
    await expect(label).toBeVisible({ timeout: 15_000 });
    await label.click();
  }

  get submitAllocationButton(): Locator {
    return this.page.getByRole("button", { name: /Submit \(\d+ selected\)/ });
  }
}
