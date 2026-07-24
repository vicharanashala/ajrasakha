import { expect, type Locator, type Page } from "@playwright/test";

export class ResponsePage {
  readonly draftResponse: Locator;
  readonly remarks: Locator;
  readonly viewMetadataButton: Locator;
  readonly submitButton: Locator;
  readonly resetButton: Locator;

  constructor(private readonly page: Page) {
    // These IDs already exist in your application.
    this.draftResponse = page.locator("#new-answer");
    this.remarks = page.locator("#remarks");

    // Inspector previously showed this accessible name.
    this.viewMetadataButton = page.getByRole("button", {
      name: "View more details",
    });

    this.submitButton = page.getByRole("button", {
      name: "Submit",
    });

    this.resetButton = page.getByRole("button", {
      name: "Reset",
    });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.draftResponse).toBeVisible();
    await expect(this.remarks).toBeVisible();
    await expect(this.viewMetadataButton).toBeVisible();
  }

  async openMetadataDialog(): Promise<void> {
    await this.viewMetadataButton.click();
  }

  async clickSubmit(): Promise<void> {
    await this.submitButton.click();
  }

  async clickReset(): Promise<void> {
    await this.resetButton.click();
  }

  async fillDraftResponse(answer: string): Promise<void> {
    await this.draftResponse.fill(answer);
  }

  async fillRemarks(remarks: string): Promise<void> {
    await this.remarks.fill(remarks);
  }
}
