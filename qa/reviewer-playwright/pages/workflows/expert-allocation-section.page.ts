import { expect, type Locator, type Page } from "@playwright/test";

export class ExpertAllocationSectionPage {
  readonly selectExpertsButton: Locator;
  readonly expertSelectionDialog: Locator;
  readonly expertSelectionHeading: Locator;

  readonly expertCards: Locator;
  readonly selectedCount: Locator;
  readonly cancelButton: Locator;
  readonly submitButton: Locator;
  readonly searchInput: Locator;

  readonly closeDialogButton: Locator;
  readonly allocationSuccessToast: Locator;

  readonly emptySelectionToast: Locator;

  constructor(private readonly page: Page) {
    this.selectExpertsButton = this.page.getByRole("button", {
      name: "Select Experts",
    });

    this.expertSelectionDialog = this.page.getByRole("dialog");

    this.expertSelectionHeading = this.page.getByRole("heading", {
      name: "Select Experts Manually",
    });
    this.searchInput = this.page.getByPlaceholder(/search/i);

    this.selectedCount = this.expertSelectionDialog.getByText(/selected/i);

    this.cancelButton = this.expertSelectionDialog.getByRole("button", {
      name: "Cancel",
    });

    this.submitButton = this.expertSelectionDialog.getByRole("button", {
      name: /Submit|Allocate/i,
    });

    this.expertCards = this.expertSelectionDialog.locator(
      ":has(> [role='checkbox'])",
    );

    this.cancelButton = this.expertSelectionDialog.getByRole("button", {
      name: "Cancel",
    });

    this.closeDialogButton = this.expertSelectionDialog
      .getByRole("button")
      .last();

    this.allocationSuccessToast = page.getByText(/allocated|success/i);
    this.emptySelectionToast = this.page.getByText(
      "Experts list cannot be empty",
      {
        exact: true,
      },
    );
  }
  //   FUNCTIONS======================================
  async pause(): Promise<void> {
    await this.page.pause();
  }

  async expectSelectExpertsButton() {
    await expect(this.selectExpertsButton).toBeVisible();

    await expect(this.selectExpertsButton).toBeEnabled();
  }

  async openSelectExpertsDialog() {
    await this.selectExpertsButton.click();

    await expect(this.expertSelectionDialog).toBeVisible();

    await expect(this.expertSelectionHeading).toBeVisible();
  }
  async expectDialogControls() {
    await expect(this.cancelButton).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }
  async expectExpertsAvailable() {
    await expect(this.expertCards.first()).toBeVisible();
  }
  async expectSubmitDisabled() {
    await expect(this.submitButton).toBeDisabled();
  }
  async selectExpert(email: string) {
    const expert = this.expertCards.filter({
      has: this.page.getByText(email),
    });

    await expert.getByRole("checkbox").check();
  }

  async clickAllocate() {
    await expect(this.submitButton).toBeEnabled();

    await this.submitButton.click();
  }
  async expectAllocationSuccess() {
    await expect(this.expertSelectionDialog).toBeHidden();
  }
  async selectExperts(emails: string[]) {
    for (const email of emails) {
      await this.selectExpert(email);
    }
  }
  async expectAllocateDisabled() {
    await expect(this.submitButton).toBeDisabled();
  }
  async closeDialog() {
    await this.cancelButton.click();
  }
  async expectDialogClosed() {
    await expect(this.expertSelectionDialog).toBeHidden();
  }
  async searchExpert(text: string) {
    await this.searchInput.fill(text);
  }
  async clearSearch() {
    await this.searchInput.clear();
  }
  async expectExpertSelected(email: string) {
    const checkbox = this.expertCards
      .filter({
        has: this.page.getByText(email),
      })
      .getByRole("checkbox");

    await expect(checkbox).toBeChecked();
  }
  async expectExpertNotSelected(email: string) {
    const checkbox = this.expertCards
      .filter({
        has: this.page.getByText(email),
      })
      .getByRole("checkbox");

    await expect(checkbox).not.toBeChecked();
  }

  async clickSubmit() {
    await expect(this.submitButton).toBeVisible();
    await this.submitButton.click();
  }

  async expectEmptySelectionValidation() {
    await expect(this.emptySelectionToast).toBeVisible();
  }
}
