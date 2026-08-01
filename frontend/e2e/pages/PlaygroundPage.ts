import { type Locator, type Page } from "@playwright/test";

export class PlaygroundPage {
  readonly page: Page;

  readonly dashboardTab: Locator;
  readonly myQueueTab: Locator;
  readonly allQuestionsTab: Locator;
  readonly userManagementTab: Locator;
  readonly agentsInterfaceTab: Locator;
  readonly chatbotAnalyticsTab: Locator;
  readonly dataProcessingTab: Locator;

  constructor(page: Page) {
    this.page = page;

    this.dashboardTab = page.getByRole("tab", { name: "Dashboard" });
    this.myQueueTab = page.getByRole("tab", { name: "My Queue" });
    this.allQuestionsTab = page.getByRole("tab", { name: "All Questions" });
    this.userManagementTab = page.getByRole("tab", { name: /Management$/ });
    this.agentsInterfaceTab = page.getByRole("tab", {
      name: "Agents Interface",
    });
    this.chatbotAnalyticsTab = page.getByRole("tab", {
      name: "ChatBot Analytics",
    });
    this.dataProcessingTab = page.getByRole("tab", { name: "Data Processing" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/home");
  }

  async getVisibleTabs(): Promise<string[]> {
    const tabs = this.page.locator('[role="tab"]');
    const count = await tabs.count();
    const visible: string[] = [];
    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i);
      if (await tab.isVisible()) {
        const text = await tab.innerText();
        visible.push(text.trim());
      }
    }
    return visible;
  }

  async clickDashboard(): Promise<void> {
    await this.dashboardTab.waitFor({ state: "visible" });
    await this.dashboardTab.click();
  }

  async clickAllQuestions(): Promise<void> {
    await this.allQuestionsTab.waitFor({ state: "visible" });
    await this.allQuestionsTab.click();
  }

  async clickMyQueue(): Promise<void> {
    await this.myQueueTab.waitFor({ state: "visible" });
    await this.myQueueTab.click();
  }

  async clickUserManagement(): Promise<void> {
    await this.userManagementTab.waitFor({ state: "visible" });
    await this.userManagementTab.click();
  }

  async clickAgentsInterface(): Promise<void> {
    await this.agentsInterfaceTab.waitFor({ state: "visible" });
    await this.agentsInterfaceTab.click();
  }

  async clickChatBotAnalytics(): Promise<void> {
    await this.chatbotAnalyticsTab.waitFor({ state: "visible" });
    await this.chatbotAnalyticsTab.click();
  }

  async clickDataProcessing(): Promise<void> {
    await this.dataProcessingTab.waitFor({ state: "visible" });
    await this.dataProcessingTab.click();
  }
}
