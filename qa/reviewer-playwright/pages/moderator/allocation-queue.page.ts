import { expect, type Locator, type Page } from "@playwright/test";

export class ModeratorAllocationQueuePage {
  readonly heading: Locator;
  readonly subtitle: Locator;

  readonly autoAllocateSwitch: Locator;
  readonly autoAllocateLabel: Locator;
  readonly allocationSection: Locator;

  readonly allocationCards: Locator;
  readonly expertNames: Locator;
  readonly statusBadges: Locator;
  readonly firstAllocationCard: Locator;
  readonly assignedLabel: Locator;
  readonly completedLabel: Locator;
  readonly durationLabel: Locator;

  readonly allocationStatusMessage: Locator;

  readonly gateKeeperHeading: Locator;
  readonly gateKeeperSubtitle: Locator;
  readonly gateKeeperEmptyState: Locator;
  readonly gateKeeperSection: Locator;
  readonly gateKeeperToggle: Locator;
  readonly gateKeeperToggleLabel: Locator;
  readonly gateKeeperEmptyMessage: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", {
      name: "Allocation Queue",
    });

    this.subtitle = page.getByText(/experts? in queue/i);

    this.autoAllocateSwitch = page.getByRole("switch", {
      name: "Auto-allocate Experts",
    });
    this.autoAllocateLabel = page.getByText("Auto-allocate Experts", {
      exact: true,
    });

    this.allocationSection = this.heading.locator("xpath=ancestor::section[1]");

    this.allocationCards = this.page.locator(".group").filter({
      has: this.page.getByText("Expert", { exact: true }),
    });
    // Expert email displayed on the card
    this.expertNames = page.locator('p[title*="@"]');

    // Status badge on every card
    this.statusBadges = page.locator("span").filter({
      hasText:
        /Answer Created|Approved|Rejected|Waiting|Modified|Pending|Your Turn/,
    });

    // Back side of flipped card
    this.firstAllocationCard = this.allocationCards.first();

    this.assignedLabel = this.firstAllocationCard.getByText("Assigned:");

    this.completedLabel = this.firstAllocationCard.getByText("Completed:");

    this.durationLabel = this.firstAllocationCard.getByText("Duration");

    this.allocationStatusMessage = this.page.getByText(
      /Expert .*reviewing|Expert created an answer/i,
    );

    this.gateKeeperSection = this.page.locator(".w-full.space-y-6").filter({
      has: this.page.getByRole("heading", {
        name: "Gate Keeper Queue",
      }),
    });

    this.gateKeeperHeading = this.gateKeeperSection.getByRole("heading", {
      name: "Gate Keeper Queue",
    });

    this.gateKeeperSubtitle = this.gateKeeperSection.locator("p").first();

    this.gateKeeperEmptyState = this.gateKeeperSection.getByRole("heading", {
      name: "No gate keeper assigned",
    });

    this.gateKeeperToggle = page.getByRole("switch", {
      name: "Auto-allocate Gate Keeper",
    });

    this.gateKeeperToggleLabel = page.getByText("Auto-allocate Gate Keeper", {
      exact: true,
    });

    this.gateKeeperEmptyMessage = page.getByText(
      /No gate keeper is currently assigned/,
    );
  }

  //   FUNCTIONS======================================
  async pause(): Promise<void> {
    await this.page.pause();
  }

  async expectOpened(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.subtitle).toBeVisible();
  }

  async expectAutoAllocateToggle(): Promise<void> {
    await expect(this.autoAllocateSwitch).toBeVisible();
    await expect(this.autoAllocateLabel).toBeVisible();
  }

  async expectAllocationCards(): Promise<void> {
    await expect(this.allocationCards.first()).toBeVisible();
  }

  async expectExpertsVisible(): Promise<void> {
    await expect(this.expertNames.first()).toBeVisible();
  }

  async expectStatusesVisible(): Promise<void> {
    await expect(this.statusBadges.first()).toBeVisible();
  }

  async openFirstAllocationCard() {
    const card = this.allocationCards.first();

    await expect(card).toBeVisible();

    await card.scrollIntoViewIfNeeded();

    await card.hover({ force: true });
  }

  async expectAllocationStatusMessage() {
    const card = this.allocationCards.first();

    await expect(
      card.getByText(/Expert .*reviewing|Expert created an answer/i),
    ).toBeVisible();
  }

  async expectGateKeeperOpened() {
    await expect(this.gateKeeperHeading).toBeVisible();
    await expect(this.gateKeeperSubtitle).toBeVisible();
  }

  async expectGateKeeperToggle() {
    await expect(this.gateKeeperToggle).toBeVisible();
    await expect(this.gateKeeperToggleLabel).toBeVisible();
  }
  async expectGateKeeperEmptyState() {
    await expect(this.gateKeeperEmptyState).toBeVisible();
  }
  async expectGateKeeperMessage() {
    await expect(this.gateKeeperEmptyMessage).toBeVisible();
  }
}
