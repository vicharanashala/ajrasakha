import { expect, type Locator, type Page } from "@playwright/test";

export class ResponsePage {
  readonly draftResponse: Locator;
  readonly remarks: Locator;
  readonly sourceType: Locator;
  readonly sourceName: Locator;
  readonly sourceUrl: Locator;
  readonly sourcePages: Locator;
  readonly addSourceButton: Locator;
  readonly viewMetadataButton: Locator;
  readonly submitButton: Locator;
  readonly confirmSubmitButton: Locator;
  readonly submitConfirmationDialog: Locator;
  readonly resetButton: Locator;
  readonly metadataDialog: Locator;
  readonly metadataTitle: Locator;
  readonly metadataCloseButton: Locator;
  readonly summaryHeading: Locator;
  readonly metadataHeading: Locator;
  readonly detailsHeading: Locator;
  readonly stateLabel: Locator;
  readonly districtLabel: Locator;
  readonly cropLabel: Locator;
  readonly seasonLabel: Locator;
  readonly normalizedCropLabel: Locator;
  readonly domainLabel: Locator;
  readonly validationMessage: Locator;
  readonly successToast: Locator;

  constructor(private readonly page: Page) {
    // These IDs already exist in your application.
    this.draftResponse = page.locator("#new-answer");
    this.remarks = page.locator("#remarks");
    this.sourceType = page
      .locator("button")
      .filter({ hasText: "Select Source Type" });
    this.sourceName = page.getByPlaceholder("State Source Name");
    this.sourceUrl = page.getByPlaceholder("State Source Link URL");
    this.sourcePages = page.getByPlaceholder("Page(s) e.g. 1,2,3");
    this.addSourceButton = page.getByRole("button").filter({
      has: page.locator("svg.lucide-circle-plus"),
    });

    // Inspector previously showed this accessible name.
    this.viewMetadataButton = page.getByRole("button", {
      name: "View more details",
    });

    this.submitButton = page.getByRole("button", {
      name: /^Submit$/,
    });

    this.submitConfirmationDialog = page.getByRole("alertdialog");

    this.confirmSubmitButton = this.submitConfirmationDialog.getByRole(
      "button",
      {
        name: "Submit Response",
      },
    );

    this.resetButton = page.getByRole("button", {
      name: "Reset",
    });

    this.metadataDialog = page.getByRole("dialog");

    this.metadataTitle = page.getByText("Question Details", {
      exact: true,
    });

    this.metadataCloseButton = page.getByRole("button", {
      name: "Close",
    });

    this.summaryHeading = page.getByText("Summary", {
      exact: true,
    });

    this.metadataHeading = page.getByText("Metadata", {
      exact: true,
    });

    this.detailsHeading = page.getByText("Details", {
      exact: true,
    });
    this.stateLabel = this.metadataDialog.getByText("State", { exact: true });

    this.districtLabel = this.metadataDialog.getByText("District", {
      exact: true,
    });

    this.cropLabel = this.metadataDialog.getByText("Crop", {
      exact: true,
    });

    this.normalizedCropLabel = this.metadataDialog.getByText(
      "Normalized Crop",
      {
        exact: true,
      },
    );

    this.seasonLabel = this.metadataDialog.getByText("Season", {
      exact: true,
    });

    this.domainLabel = this.metadataDialog.getByText("Domain", {
      exact: true,
    });

    this.validationMessage = page.getByText(
      /required|response is required|please enter/i,
    );

    this.successToast = page.getByText(/submitted|success|saved/i);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.draftResponse).toBeVisible();
    await expect(this.remarks).toBeVisible();
    await expect(this.viewMetadataButton).toBeVisible();
  }

  async openMetadataDialog(): Promise<void> {
    console.log("Closed?", this.page.isClosed());
    console.log("URL:", this.page.url());

    await this.viewMetadataButton.click();
  }

  async clickSubmit(): Promise<void> {
    console.log(await this.submitButton.count());
    console.log(await this.page.locator('[role="dialog"]').count());
    await this.submitButton.first().click();
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

  async addSourceReference(
    type: "State" | "Central" | "Research Paper" | "Other",
    name = "Playwright Test Source",
    url = "https://workdrive.zohoexternal.in/file/123",
    pages = "1",
  ): Promise<void> {
    await this.sourceType.click();

    await this.page.getByRole("option", { name: type }).click();

    await this.sourceName.fill(name);
    await this.sourceUrl.fill(url);
    await this.sourcePages.fill(pages);

    await this.addSourceButton.click();
  }
  async expectMetadataDialog(): Promise<void> {
    await expect(this.metadataTitle).toBeVisible();
  }

  async closeMetadataDialog(): Promise<void> {
    await this.metadataCloseButton.click();
    await expect(this.metadataDialog).toBeHidden();
  }

  async expectMetadataSections(): Promise<void> {
    await expect(this.summaryHeading).toBeVisible();
    await expect(this.metadataHeading).toBeVisible();
    await expect(this.detailsHeading).toBeVisible();
  }

  async expectMetadataFields(): Promise<void> {
    await expect(this.stateLabel).toBeVisible();
    await expect(this.districtLabel).toBeVisible();
    await expect(this.cropLabel).toBeVisible();
    await expect(this.normalizedCropLabel).toBeVisible();
    await expect(this.seasonLabel).toBeVisible();
    await expect(this.domainLabel).toBeVisible();
  }

  async expectFieldHasValue(label: string): Promise<void> {
    const labelContainer = this.metadataDialog
      .getByText(label, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'text-muted-foreground')]")
      .first();

    await expect(labelContainer).toBeVisible();

    const value = labelContainer.locator("xpath=following-sibling::div[1]");

    await expect(value).toHaveText(/\S+/);
  }

  async pause(): Promise<void> {
    await this.page.pause();
  }
  async expectDraftResponse(value: string): Promise<void> {
    await expect(this.draftResponse).toHaveValue(value);
  }
  async expectRemarks(value: string): Promise<void> {
    await expect(this.remarks).toHaveValue(value);
  }
  async expectDraftResponseEmpty(): Promise<void> {
    await expect(this.draftResponse).toHaveValue("");
  }

  async expectRemarksEmpty(): Promise<void> {
    await expect(this.remarks).toHaveValue("");
  }

  async expectValidationMessage(): Promise<void> {
    await expect(this.validationMessage).toBeVisible();
  }

  async expectSubmissionSuccess(): Promise<void> {
    await expect(this.successToast).toBeVisible();
  }

  async expectSubmitDisabled(): Promise<void> {
    await expect(this.submitButton).toBeDisabled();
  }
  async expectReadyForNextQuestion(): Promise<void> {
    await expect(this.draftResponse).toHaveValue("");
    await expect(this.remarks).toHaveValue("");
    await expect(this.submitButton).toBeDisabled();
  }
  async confirmSubmission(): Promise<void> {
    await expect(this.submitConfirmationDialog).toBeVisible();
    await expect(this.confirmSubmitButton).toBeEnabled();
    await this.confirmSubmitButton.click();
  }
}
