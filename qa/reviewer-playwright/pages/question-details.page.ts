import { expect, type Locator, type Page } from "@playwright/test";

export class QuestionDetailsPage {
  readonly title: Locator;
  readonly header: Locator;
  readonly exitButton: Locator;
  readonly allocationHeading: Locator;

  constructor(private readonly page: Page) {
    this.title = page.getByRole("heading", { level: 1 });
    this.header = page.locator("header").filter({ has: this.title });
    this.exitButton = page.getByRole("button", { name: "Exit" });
    this.allocationHeading = page.getByRole("heading", { name: "Allocation Queue" });
  }

  async expectQuestionText(question: string): Promise<void> {
    await expect(this.title).toHaveText(question);
  }

  async expectStatus(status: string): Promise<void> {
    await expect(this.header.getByText(status.replace("_", " "), { exact: true })).toBeVisible();
  }

  async expectCoreHeader(): Promise<void> {
    await expect(this.exitButton).toBeVisible();
    await expect(this.page.getByRole("button", { name: "View LifeCycle" })).toBeVisible();
    await expect(this.page.getByRole("button", { name: "View Audit" })).toBeVisible();
    await expect(this.header.getByText(/^Created:/)).toBeVisible();
    await expect(this.header.getByText(/^Updated:/)).toBeVisible();
  }

  async metadataValue(label: string): Promise<string> {
    // Metadata labels are plain spans rather than associated terms/controls.
    const labelNode = this.page.getByText(label, { exact: true }).first();
    await expect(labelNode).toBeVisible();
    return (await labelNode.locator("..").locator("span").nth(1).innerText()).trim();
  }

  async expectAllocationQueue(queue: Array<{ name?: string; email?: string }>): Promise<void> {
    await expect(this.allocationHeading).toBeVisible();
    if (queue.length === 0) {
      await expect(this.page.getByRole("heading", { name: "No Experts Allocated" })).toBeVisible();
      return;
    }

    for (const reviewer of queue) {
      if (reviewer.name) {
        await expect(this.page.locator(`[title=${JSON.stringify(reviewer.name)}]`).first()).toBeVisible();
      } else if (reviewer.email) {
        await expect(this.page.locator(`[title=${JSON.stringify(reviewer.email)}]`).first()).toBeVisible();
      }
    }
  }

  async availableAllocationStatuses(): Promise<string[]> {
    const labels = ["Answer Created", "Approved", "Modified", "Rejected", "Your Turn", "Waiting", "Pending"];
    const visible: string[] = [];
    for (const label of labels) {
      if (await this.page.getByText(label, { exact: true }).first().isVisible().catch(() => false)) {
        visible.push(label);
      }
    }
    return visible;
  }

  async exit(): Promise<void> {
    await this.exitButton.click();
  }
}
