import { expect, type Locator, type Page } from "@playwright/test";

export class CreateQuestionPage {
  readonly dialog: Locator;

  readonly questionInput: Locator;

  readonly stateDropdown: Locator;

  readonly districtDropdown: Locator;

  readonly cropDropdown: Locator;

  readonly seasonDropdown: Locator;

  readonly domainDropdown: Locator;

  readonly submitButton: Locator;

  readonly cancelButton: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.getByRole("dialog");

    // Everything below will be replaced with the real locators
    this.questionInput = page.locator("");

    this.stateDropdown = page.locator("");

    this.districtDropdown = page.locator("");

    this.cropDropdown = page.locator("");

    this.seasonDropdown = page.locator("");

    this.domainDropdown = page.locator("");

    this.submitButton = page.locator("");

    this.cancelButton = page.locator("");
  }

  async expectOpened(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }
}
