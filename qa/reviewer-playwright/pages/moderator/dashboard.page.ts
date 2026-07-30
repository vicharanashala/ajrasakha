import { expect, type Locator, type Page } from "@playwright/test";

export class ModeratorDashboardPage {
  readonly allQuestionsTab: Locator;
  readonly addQuestionButton: Locator;
  readonly successToast: Locator;

  constructor(private readonly page: Page) {
    this.allQuestionsTab = page.getByRole("tab", {
      name: "All Questions",
    });

    this.addQuestionButton = page.locator("button:has(svg.lucide-plus)");

    this.successToast = page.getByText("Question submitted successfully.", {
      exact: true,
    });
  }

  async pause(): Promise<void> {
    await this.page.pause();
  }

  async waitForShell(): Promise<void> {
    await expect(this.page).toHaveURL(/\/home(?:[/?#]|$)/);
    await expect(this.allQuestionsTab).toBeVisible();
  }

  async openAllQuestions(): Promise<void> {
    await this.allQuestionsTab.click();
  }

  async openCreateQuestionDialog(): Promise<void> {
    await expect(this.addQuestionButton).toBeVisible();
    await expect(this.addQuestionButton).toBeEnabled();

    await this.addQuestionButton.click();
  }

  async expectQuestionCreated(): Promise<void> {
    await expect(this.successToast).toBeVisible();
  }

  async expectQuestionVisible(question: string): Promise<void> {
    const table = this.page.getByRole("table");

    await expect(table.getByText(question, { exact: true })).toBeVisible();
  }
  async openQuestion(question: string): Promise<void> {
    await this.page
      .getByRole("table")
      .getByText(question, { exact: true })
      .click();
  }
}
