import { expect, type Locator, type Page } from "@playwright/test";

export class ModeratorQuestionDetailsPage {
  readonly title: Locator;
  readonly header: Locator;
  readonly exitButton: Locator;

  constructor(private readonly page: Page) {
    this.title = page.getByRole("heading", { level: 1 });

    this.header = page.locator("header").filter({
      has: this.title,
    });

    this.exitButton = page.getByRole("button", {
      name: "Exit",
    });
  }

  async expectOpened(): Promise<void> {
    await expect(this.title).toBeVisible();
  }
}
