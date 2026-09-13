import type { Page, Locator } from "@playwright/test";

const ACTIVE_PANEL = '[role="tabpanel"][data-state="active"]';

export class QuestionsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private get panel(): Locator {
    return this.page.locator(ACTIVE_PANEL);
  }

  // --- table ---

  get table(): Locator {
    return this.panel.getByRole("table");
  }

  get tableRows(): Locator {
    return this.table.locator("tbody tr");
  }

  // --- pagination ---

  get previousPageButton(): Locator {
    return this.panel.getByRole("button", { name: "Previous" });
  }

  get nextPageButton(): Locator {
    return this.panel.getByRole("button", { name: "Next" });
  }

  pageNumberButton(pageNum: number): Locator {
    return this.panel.getByRole("button", { name: String(pageNum), exact: true });
  }

  // --- open first question ---

  async openFirstQuestion(): Promise<void> {
    const firstRow = this.tableRows.first();
    // Click the question text cell (second column, after Sl.No)
    const cells = firstRow.getByRole("cell");
    const questionCell = cells.nth(1);
    await questionCell.click();
  }

  // --- question details panel (after opening a question) ---

  get questionDetailsTitle(): Locator {
    return this.page.getByRole("heading", { level: 1 });
  }

  get exitButton(): Locator {
    return this.page.getByRole("button", { name: "Exit" });
  }

  get submissionHistoryHeading(): Locator {
    return this.page.getByRole("heading", { name: "Submission History" });
  }

  // --- sidebar tool (Tools & Filters) ---

  get toolsFilterButton(): Locator {
    return this.panel.locator('button[data-slot="tooltip-trigger"]:has(svg.lucide-filter)');
  }

  get managementToolsHeading(): Locator {
    return this.page.getByRole("heading", { name: "Management Tools" });
  }

  // --- view mode: sidebar Display Settings ---

  get viewModeNormalButton(): Locator {
    return this.page.getByRole("button", { name: "Normal" });
  }

  get viewModeTurnAroundButton(): Locator {
    return this.page.getByRole("button", { name: "Turn Around" });
  }

  // --- view mode: Table / Grid toggle ---

  get listViewButton(): Locator {
    return this.page.getByRole("button", { name: "List View" });
  }

  get gridViewButton(): Locator {
    return this.page.getByRole("button", { name: "Grid View" });
  }

  // --- status filter (inside Advanced Filters dialog) ---

  get preferencesButton(): Locator {
    return this.page.getByRole("button", { name: "Preferences" });
  }

  get advancedFiltersDialogTitle(): Locator {
    return this.page.getByRole("heading", { name: "Advanced Filters" });
  }

  get statusFilterTrigger(): Locator {
    return this.page.locator('[role="dialog"]').getByRole("combobox").filter({ hasText: /Status/ });
  }

  statusOption(status: string): Locator {
    return this.page.getByRole("option", { name: new RegExp(`^${status}$`, "i") });
  }

  async selectStatus(status: string): Promise<void> {
    await this.statusFilterTrigger.click();
    await this.statusOption(status).click();
  }

  // --- filtered results ---

  get noQuestionsFound(): Locator {
    return this.panel.getByText("No questions found");
  }

  // --- review level table (Turn Around view, same DOM element as table) ---

  get reviewLevelTable(): Locator {
    return this.table;
  }

  // --- reallocation modal ---

  get reallocateQuestionsButton(): Locator {
    return this.page.getByRole("button", { name: "ReAllocate Questions" });
  }

  get reallocationConfirmationTitle(): Locator {
    return this.page.getByRole("heading", { name: "ReAllocate work load?" });
  }

  get defaultEscalationButton(): Locator {
    return this.page.getByRole("button", { name: "Default Escalation" });
  }

  get inactiveToActiveButton(): Locator {
    return this.page.getByRole("button", { name: "Inactive to Active" });
  }

  get reallocationDialogTitle(): Locator {
    return this.page.getByRole("heading", { name: /Inactive to Active Reallocation|Escalation Reallocation/ });
  }

  get confirmReallocationButton(): Locator {
    return this.page.locator('[role="dialog"]').getByRole("button", { name: "Confirm Reallocation" });
  }

  // --- sidebar button clicks (use native DOM click to bypass Playwright viewport checks) ---

  async clickSidebarPreferences(): Promise<void> {
    await this.preferencesButton.evaluate((el: HTMLElement) => el.click());
  }

  async clickSidebarReallocateQuestions(): Promise<void> {
    await this.reallocateQuestionsButton.evaluate((el: HTMLElement) => el.click());
  }

  async clickSidebarTurnAround(): Promise<void> {
    await this.viewModeTurnAroundButton.evaluate((el: HTMLElement) => el.click());
  }

  async clickSidebarNormal(): Promise<void> {
    await this.viewModeNormalButton.evaluate((el: HTMLElement) => el.click());
  }

  // --- utility ---

  async openSidebar(): Promise<void> {
    const isOpen = await this.managementToolsHeading.isVisible().catch(() => false);
    if (!isOpen) {
      await this.toolsFilterButton.click();
    }
  }

  async openReallocationModal(): Promise<void> {
    await this.openSidebar();
    await this.clickSidebarReallocateQuestions();
  }
}
