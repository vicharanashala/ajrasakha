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
}
