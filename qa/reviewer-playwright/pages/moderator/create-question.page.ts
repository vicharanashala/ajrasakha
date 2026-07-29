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
  readonly priorityDropdown: Locator;
  readonly statusDropdown: Locator;
  readonly contextInput: Locator;
  readonly aiAnswerInput: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.getByRole("dialog");
    this.questionInput = this.dialog.getByPlaceholder("Enter question text");

    this.contextInput = this.dialog.getByPlaceholder(
      "Mention the context for this question...",
    );
    this.aiAnswerInput = this.dialog.getByPlaceholder(
      "Mention the AI-generated response alongside the question for better context...",
    );
    this.priorityDropdown = this.dialog.getByRole("combobox").nth(0);
    this.statusDropdown = this.dialog.getByRole("combobox").nth(1);

    this.stateDropdown = this.dialog.getByRole("combobox").nth(2);
    this.districtDropdown = this.dialog.getByRole("combobox").nth(3);
    this.cropDropdown = this.dialog.getByRole("combobox").nth(4);
    this.seasonDropdown = this.dialog.getByRole("combobox").nth(5);
    this.domainDropdown = this.dialog.getByRole("combobox").nth(6);
    this.submitButton = this.dialog.getByRole("button", {
      name: "Add Question",
    });

    this.cancelButton = this.dialog.getByRole("button", {
      name: "Cancel",
    });
  }

  async expectOpened(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }
  async expectFormControls(): Promise<void> {
    await expect(this.questionInput).toBeVisible();

    await expect(this.priorityDropdown).toBeVisible();
    await expect(this.statusDropdown).toBeVisible();
    await expect(this.stateDropdown).toBeVisible();
    await expect(this.districtDropdown).toBeVisible();
    await expect(this.cropDropdown).toBeVisible();
    await expect(this.seasonDropdown).toBeVisible();
    await expect(this.domainDropdown).toBeVisible();

    await expect(this.submitButton).toBeVisible();
    await expect(this.cancelButton).toBeVisible();
  }

  async expectDefaultValues(): Promise<void> {
    await expect(this.questionInput).toHaveValue("");

    await expect(this.priorityDropdown).toContainText("Medium");
    await expect(this.statusDropdown).toContainText("Open");

    await expect(this.stateDropdown).toContainText("Select state");
    await expect(this.districtDropdown).toContainText("Select district");
    await expect(this.cropDropdown).toContainText("Select crop");
    await expect(this.seasonDropdown).toContainText("Select season");
    await expect(this.domainDropdown).toContainText("Select domain");

    await expect(this.submitButton).toBeDisabled();
  }
  async expectSubmitDisabled(): Promise<void> {
    await expect(this.submitButton).toBeDisabled();
  }

  async fillQuestion(question: string): Promise<void> {
    await this.questionInput.fill(question);
  }

  async expectQuestion(question: string): Promise<void> {
    await expect(this.questionInput).toHaveValue(question);
  }

  async fillContext(context: string): Promise<void> {
    await this.contextInput.fill(context);
  }

  async expectContext(context: string): Promise<void> {
    await expect(this.contextInput).toHaveValue(context);
  }

  async fillAiAnswer(answer: string): Promise<void> {
    await this.aiAnswerInput.fill(answer);
  }

  async expectAiAnswer(answer: string): Promise<void> {
    await expect(this.aiAnswerInput).toHaveValue(answer);
  }
  async selectPriority(priority: string): Promise<void> {
    await this.priorityDropdown.click();

    await this.page.getByRole("option", { name: priority }).click();
  }

  async expectPriority(priority: string): Promise<void> {
    await expect(this.priorityDropdown).toContainText(priority);
  }

  async selectStatus(status: string): Promise<void> {
    await this.statusDropdown.click();

    await this.page.getByRole("option", { name: status }).click();
  }

  async expectStatus(status: string): Promise<void> {
    await expect(this.statusDropdown).toContainText(status);
  }

  async selectState(state: string): Promise<void> {
    await this.stateDropdown.click();

    await this.page.getByRole("option", { name: state }).click();
  }

  async expectState(state: string): Promise<void> {
    await expect(this.stateDropdown).toContainText(state);
  }

  async pause(): Promise<void> {
    await this.page.pause();
  }

  async selectDistrict(district: string): Promise<void> {
    await this.districtDropdown.click();

    await this.page.getByRole("option", { name: district }).click();
  }

  async expectDistrict(district: string): Promise<void> {
    await expect(this.districtDropdown).toContainText(district);
  }

  async selectCrop(crop: string): Promise<void> {
    await this.cropDropdown.click();

    await this.page
      .getByRole("option", {
        name: crop,
        exact: true,
      })
      .click();
  }

  async expectCrop(crop: string): Promise<void> {
    await expect(this.cropDropdown).toContainText(crop);
  }

  async selectSeason(season: string): Promise<void> {
    await this.seasonDropdown.click();

    await this.page
      .getByRole("option", {
        name: season,
        exact: true,
      })
      .click();
  }

  async expectSeason(season: string): Promise<void> {
    await expect(this.seasonDropdown).toContainText(season);
  }
  async selectDomain(domain: string): Promise<void> {
    await this.domainDropdown.click();

    await this.page
      .getByRole("option", {
        name: domain,
        exact: true,
      })
      .click();

    // const comboboxes = this.dialog.getByRole("combobox");

    // console.log("Combobox count:", await comboboxes.count());

    // for (let i = 0; i < (await comboboxes.count()); i++) {
    //   console.log(i, await comboboxes.nth(i).textContent());
    // }
  }

  async expectDomain(domain: string): Promise<void> {
    await expect(this.dialog.getByText(domain, { exact: true })).toBeVisible();
  }

  async expectSubmitEnabled(): Promise<void> {
    await expect(this.submitButton).toBeEnabled();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  async expectClosed(): Promise<void> {
    await expect(this.dialog).not.toBeVisible();
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
