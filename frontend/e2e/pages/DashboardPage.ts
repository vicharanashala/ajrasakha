import type { Page, Locator } from "@playwright/test";

const ACTIVE_PANEL = '[role="tabpanel"][data-state="active"]';

export class DashboardPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private get panel(): Locator {
    return this.page.locator(ACTIVE_PANEL);
  }

  // --- page heading ---

  get heading(): Locator {
    return this.page.getByRole("heading", { level: 1 });
  }

  // --- check-in ---

  get checkInButton(): Locator {
    return this.page.getByRole("button", { name: /^Check (In|Out|ing)/ });
  }

  // --- sub-section card titles ---

  get roleOverviewCard(): Locator {
    return this.panel.locator('[data-slot="card-title"]').filter({ hasText: "Role Overview" });
  }

  get approvalRateCard(): Locator {
    return this.panel.locator('[data-slot="card-title"]').filter({ hasText: "Moderator Approval Rate" });
  }

  get questionStatusCard(): Locator {
    return this.panel.locator('[data-slot="card-title"]').filter({ hasText: "Question Status Overview" });
  }

  get answerStatusCard(): Locator {
    return this.panel.locator('[data-slot="card-title"]').filter({ hasText: "Answer Status Overview" });
  }

  get expertsPerformanceCard(): Locator {
    return this.panel.locator('[data-slot="card-title"]').filter({ hasText: "Experts Performance Metrics" });
  }

  // --- questions analytics tabs ---

  get analyticsByCropTab(): Locator {
    return this.panel.getByRole("tab", { name: "By Crop" });
  }

  get analyticsByStateTab(): Locator {
    return this.panel.getByRole("tab", { name: "By State" });
  }

  get analyticsByDomainTab(): Locator {
    return this.panel.getByRole("tab", { name: "By Domain" });
  }

  // --- question sources ---

  get questionSourcesCard(): Locator {
    return this.panel.locator('[data-slot="card-title"]').filter({ hasText: "Question Sources" });
  }

  // --- pae metrics ---

  get paeMetricsCard(): Locator {
    return this.panel.locator('[data-slot="card-title"]').filter({ hasText: "PAE" });
  }

  // --- contribution analysis ---

  get contributionAnalysisCard(): Locator {
    return this.panel.locator('[data-slot="card-title"]').filter({ hasText: "Question Contribution Analysis" });
  }

  // --- heat map ---

  get heatMapCard(): Locator {
    return this.panel.locator('[data-slot="card-title"]').filter({ hasText: "Heat Map Of Experts" });
  }

  // --- review stage distribution ---

  get reviewStageCard(): Locator {
    return this.panel.locator('[data-slot="card-title"]').filter({ hasText: "Review Stage Distribution" });
  }

  // --- send report ---

  get sendReportButton(): Locator {
    return this.panel.getByRole("button", { name: "Send Report" });
  }

  // --- golden dataset view type toggles ---

  get goldenYearView(): Locator {
    return this.panel.getByRole("button", { name: "Year", exact: true });
  }

  get goldenMonthView(): Locator {
    return this.panel.getByRole("button", { name: "Month", exact: true });
  }

  get goldenWeekView(): Locator {
    return this.panel.getByRole("button", { name: "Week", exact: true });
  }

  get goldenDayView(): Locator {
    return this.panel.getByRole("button", { name: "Day", exact: true });
  }

  // --- golden dataset selects ---

  get goldenYearSelect(): Locator {
    return this.panel.locator('[role="combobox"]').filter({ hasText: "Select Year" });
  }

  get goldenMonthSelect(): Locator {
    return this.panel.locator('[role="combobox"]').filter({ hasText: "Select Month" });
  }

  get goldenWeekSelect(): Locator {
    return this.panel.locator('[role="combobox"]').filter({ hasText: "Select Week" });
  }

  get goldenDaySelect(): Locator {
    return this.panel.locator('[role="combobox"]').filter({ hasText: "Select Day" });
  }
}
