import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Profile Page Object — /profile route.
 *
 * Displays user reputation_score, incentive, penalty, and workload info.
 */
export class ProfilePage extends BasePage {
  // ── Locators ────────────────────────────────────────────────

  /** Profile container */
  readonly container: Locator;

  /** Reputation score display */
  readonly reputationScore: Locator;

  /** Incentive value */
  readonly incentiveValue: Locator;

  /** Penalty value */
  readonly penaltyValue: Locator;

  /** Workload info */
  readonly workloadInfo: Locator;

  /** User name display */
  readonly userName: Locator;

  /** User email display */
  readonly userEmail: Locator;

  /** User role display */
  readonly userRole: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.locator('main, [class*="profile"], [class*="Profile"]').first();
    this.reputationScore = page.locator(':text("reputation"), :text("Reputation"), :text("score"), :text("Score")').first();
    this.incentiveValue = page.locator(':text("incentive"), :text("Incentive")').first();
    this.penaltyValue = page.locator(':text("penalty"), :text("Penalty")').first();
    this.workloadInfo = page.locator(':text("workload"), :text("Workload")').first();
    this.userName = page.locator('[class*="name"], [class*="Name"], h1, h2').first();
    this.userEmail = page.locator(':text("@")').first();
    this.userRole = page.locator('[class*="role"], [class*="Role"], [class*="badge"]').first();
  }

  // ── Actions ─────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigateTo('/profile');
  }

  async getReputationScoreText(): Promise<string> {
    await this.page.waitForTimeout(2000);
    return this.getTextContent(this.reputationScore);
  }

  async getIncentiveText(): Promise<string> {
    return this.getTextContent(this.incentiveValue);
  }

  async getPenaltyText(): Promise<string> {
    return this.getTextContent(this.penaltyValue);
  }

  async isOnProfilePage(): Promise<boolean> {
    const path = await this.currentPath();
    return path.startsWith('/profile');
  }
}
