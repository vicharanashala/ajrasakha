import { expect, type Locator, type Page } from "@playwright/test";

export class ModeratorDashboardPage {
  readonly allQuestionsTab: Locator;
  readonly addQuestionButton: Locator;
  readonly successToast: Locator;
  readonly manualTab: Locator;
  readonly tableLoader: Locator;
  constructor(private readonly page: Page) {
    this.allQuestionsTab = page.getByRole("tab", {
      name: "All Questions",
    });

    this.addQuestionButton = page.locator("button:has(svg.lucide-plus)");

    this.successToast = page.getByText("Question submitted successfully.", {
      exact: true,
    });
    this.manualTab = page.getByRole("tab", { name: "Manual" });
    this.tableLoader = page.locator(".animate-spin");
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
  async waitForQuestionsToLoad() {
    await expect(this.tableLoader).toBeHidden();
  }

  async expectQuestionVisible(question: string) {
    const row = this.page
      .getByRole("row")
      .filter({ has: this.page.getByText(question, { exact: true }) });

    await expect(row).toBeVisible({
      timeout: 30000,
    });
  }
  async openQuestion(question: string): Promise<void> {
    await this.page
      .getByRole("table")
      .getByText(question, { exact: true })
      .click();
  }
  async expectAllQuestionsPage() {
    await expect(
      this.page.getByRole("tab", {
        name: "All Questions",
      }),
    ).toBeVisible();
  }
  async openManualQuestions() {
    await this.manualTab.click();
  }
}
