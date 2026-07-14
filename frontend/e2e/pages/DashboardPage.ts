import type { Page, Locator } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;
  readonly header: Locator;
  readonly tabsList: Locator;
  readonly notificationBell: Locator;
  readonly notificationBadge: Locator;
  readonly userManagementTab: Locator;
  readonly allQuestionsTab: Locator;
  readonly dashboardTab: Locator;
  readonly chatbotAnalyticsTab: Locator;
  readonly dataProcessingTab: Locator;
  readonly fertilizerCalculatorTab: Locator;
  readonly manageAgentsTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.locator("header");
    this.tabsList = page.locator('[role="tablist"], .no-scrollbar');
    this.notificationBell = page.locator(
      'button:has(.lucide-bell), button:has(svg[class*="bell"])',
    );
    this.notificationBadge = page.locator(
      ".absolute.-top-\\[4px\\].-right-\\[12px\\]",
    );
    this.userManagementTab = page.getByRole("tab", {
      name: /user management|expert management/i,
    });
    this.allQuestionsTab = page.getByRole("tab", { name: /all questions/i });
    this.dashboardTab = page.getByRole("tab", { name: /^dashboard$/i });
    this.chatbotAnalyticsTab = page.getByRole("tab", {
      name: /chatbot analytics/i,
    });
    this.dataProcessingTab = page.getByRole("tab", {
      name: /data processing/i,
    });
    this.fertilizerCalculatorTab = page.getByRole("tab", {
      name: /fertilizer calculator/i,
    });
    this.manageAgentsTab = page.getByRole("tab", { name: /manage agents/i });
  }

  async goto() {
    await this.page.goto("/home");
    await this.header.waitFor({ timeout: 15_000 });
  }

  async clickTab(name: string) {
    await this.page.getByRole("tab", { name: new RegExp(name, "i") }).click();
  }

  async getNotificationCount(): Promise<number> {
    const badge = this.notificationBadge;
    if (await badge.isVisible()) {
      const text = await badge.textContent();
      return parseInt(text || "0", 10);
    }
    return 0;
  }
}
