import { expect, type Locator, type Page } from "@playwright/test";

export class ModeratorDashboardPage {
  readonly allQuestionsTab: Locator;
  readonly addQuestionButton: Locator;

  constructor(private readonly page: Page) {
    this.allQuestionsTab = page.getByRole("tab", {
      name: "All Questions",
    });

    // this.addQuestionButton = page.locator("button").filter({
    //   has: page.locator("svg.lucide-plus"),
    // });
    // Icon-only button (no accessible name or test id).
    // Anchored using the Plus icon to avoid relying on button index.
    this.addQuestionButton = page.locator("button:has(svg.lucide-plus)");
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
}
