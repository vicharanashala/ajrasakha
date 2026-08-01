import { expect, type Locator, type Page } from "@playwright/test";

export class ModeratorQuestionDetailsPage {
  readonly title: Locator;
  readonly header: Locator;
  readonly exitButton: Locator;
  readonly lifecycleButton: Locator;
  readonly auditButton: Locator;
  readonly detailsCard: Locator;
  readonly aiAnswerHeading: Locator;
  readonly viewDetailsLabel: Locator;
  readonly generateAiAnswerButton: Locator;
  readonly lifecycleDialog: Locator;
  readonly lifecycleDialogTitle: Locator;

  constructor(private readonly page: Page) {
    this.title = page.getByRole("heading", { level: 1 });

    this.header = page.locator("header").filter({
      has: this.title,
    });

    this.exitButton = page.getByRole("button", {
      name: "Exit",
    });
    this.lifecycleButton = page.getByRole("button", {
      name: "View LifeCycle",
    });

    this.auditButton = page.getByRole("button", {
      name: "View Audit",
    });
    this.detailsCard = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Details", { exact: true }),
    });

    this.aiAnswerHeading = page.getByText("AI Generated Answer", {
      exact: true,
    });

    this.viewDetailsLabel = page.getByText("View Details", { exact: true });

    this.generateAiAnswerButton = page.getByRole("button", {
      name: "Generate AI Answer",
    });
    this.lifecycleDialog = page.getByRole("dialog");

    this.lifecycleDialogTitle = this.lifecycleDialog.getByRole("heading");
  }

  async expectOpened(): Promise<void> {
    await expect(this.title).toBeVisible();
  }

  async expectQuestion(question: string): Promise<void> {
    await expect(this.title).toHaveText(question);
  }
  async expectCoreHeader() {
    await expect(this.title).toBeVisible();
    await expect(this.exitButton).toBeVisible();
    await expect(this.lifecycleButton).toBeVisible();
    await expect(this.auditButton).toBeVisible();
  }
  private async expectField(label: string, value: string): Promise<void> {
    const field = this.detailsCard.locator("div.flex.flex-col").filter({
      has: this.page.getByText(label, { exact: true }),
    });

    await expect(field).toContainText(value);
  }
  async expectMetadata(metadata: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  }) {
    await this.expectField("State", metadata.state);
    await this.expectField("District", metadata.district);
    await this.expectField("Crop", metadata.crop);
    await this.expectField("Season", metadata.season);
    await this.expectField("Domain", metadata.domain);
  }

  async expectAiGeneratedAnswerSection() {
    await expect(this.aiAnswerHeading).toBeVisible();
    await expect(this.viewDetailsLabel).toBeVisible();
  }
  async expandAiGeneratedAnswerSection() {
    await this.viewDetailsLabel.click();
  }

  async generateAiAnswer() {
    await this.generateAiAnswerButton.click();
  }

  async expectAiAnswerGenerated() {
    // TODO:
    // Replace this with a stable assertion once the AI generation
    // API is available and the response format is finalized.
    await expect(
      this.page.getByText("No AI answer available", {
        exact: true,
      }),
    ).toBeHidden();

    await expect(
      this.page.getByText("No AI answer available", {
        exact: true,
      }),
    ).not.toBeVisible();
  }
  async exit() {
    await this.exitButton.click();
  }

  async openLifeCycle() {
    await this.lifecycleButton.click();
  }

  async expectLifeCycleDialog() {
    await expect(this.lifecycleDialog).toBeVisible();
    await expect(this.lifecycleDialogTitle).toBeVisible();
  }
}
