import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Dashboard Page Object — /home route.
 *
 * Maps to <PlaygroundPage> which contains analytics cards, tabs
 * (Questions Table, QA Interface, Request Queue, Analytics, Call History, User Table),
 * charts (recharts, nivo), and status counters.
 */
export class DashboardPage extends BasePage {
  // ── Locators ────────────────────────────────────────────────

  /** The main dashboard container */
  readonly container: Locator;

  /** Tab list (Radix Tabs) */
  readonly tabList: Locator;

  /** Individual tab triggers */
  readonly questionsTab: Locator;
  readonly qaInterfaceTab: Locator;
  readonly requestQueueTab: Locator;
  readonly analyticsTab: Locator;
  readonly callHistoryTab: Locator;
  readonly userTableTab: Locator;

  /** Analytics / counter cards on dashboard */
  readonly analyticsCards: Locator;

  /** Chart containers (recharts renders SVG, nivo renders SVG/canvas) */
  readonly chartContainers: Locator;

  /** Question table rows */
  readonly questionRows: Locator;

  /** Status badges inside question table */
  readonly statusBadges: Locator;

  /** Queue details button / trigger */
  readonly queueDetailsButton: Locator;

  /** Queue details modal / dialog */
  readonly queueDetailsDialog: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.locator('.min-h-screen');
    this.tabList = page.locator('[role="tablist"]');
    this.questionsTab = page.getByRole('tab', { name: /questions/i });
    this.qaInterfaceTab = page.getByRole('tab', { name: /qa/i });
    this.requestQueueTab = page.getByRole('tab', { name: /request/i });
    this.analyticsTab = page.getByRole('tab', { name: /analytics/i });
    this.callHistoryTab = page.getByRole('tab', { name: /call/i });
    this.userTableTab = page.getByRole('tab', { name: /user/i });
    this.analyticsCards = page.locator('[class*="card"], [class*="Card"]');
    this.chartContainers = page.locator('.recharts-wrapper, [class*="nivo"], svg.recharts-surface');
    this.questionRows = page.locator('table tbody tr, [class*="question-row"], [class*="QuestionRow"]');
    this.statusBadges = page.locator('[class*="badge"], [class*="Badge"]');
    this.queueDetailsButton = page.getByText(/queue details/i);
    this.queueDetailsDialog = page.locator('[role="dialog"]');
  }

  // ── Actions ─────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigateTo('/home');
  }

  async switchTab(tab: Locator): Promise<void> {
    await tab.click();
    // Short wait for tab content to load
    await this.page.waitForTimeout(1000);
  }

  async getAnalyticsCardCount(): Promise<number> {
    return this.analyticsCards.count();
  }

  async getAnalyticsCardTexts(): Promise<string[]> {
    return this.analyticsCards.allTextContents();
  }

  async openQueueDetails(): Promise<void> {
    await this.queueDetailsButton.click();
    await this.queueDetailsDialog.waitFor({ state: 'visible' });
  }

  async getVisibleChartCount(): Promise<number> {
    return this.chartContainers.count();
  }

  /** Extract numeric values from analytics cards */
  async getCardNumbers(): Promise<number[]> {
    const texts = await this.analyticsCards.allTextContents();
    const numbers: number[] = [];
    for (const text of texts) {
      const match = text.match(/\d+/);
      if (match) numbers.push(parseInt(match[0], 10));
    }
    return numbers;
  }

  async isOnDashboard(): Promise<boolean> {
    const path = await this.currentPath();
    return path.startsWith('/home');
  }
}
