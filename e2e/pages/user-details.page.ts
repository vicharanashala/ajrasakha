import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * User Details Page Object — /user/:userId route.
 *
 * Shows individual user details including reputation score,
 * incentive, penalty, role, and activity history.
 */
export class UserDetailsPage extends BasePage {
  // ── Locators ────────────────────────────────────────────────

  /** User details container */
  readonly container: Locator;

  /** Reputation score on user details page */
  readonly reputationScore: Locator;

  /** User name heading */
  readonly userName: Locator;

  /** User role badge */
  readonly userRole: Locator;

  /** Incentive display */
  readonly incentiveValue: Locator;

  /** Penalty display */
  readonly penaltyValue: Locator;

  /** Activity / history section */
  readonly activitySection: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.locator('main, [class*="user-detail"], [class*="UserDetail"]').first();
    this.reputationScore = page.locator(':text("reputation"), :text("Reputation"), :text("score"), :text("Score")').first();
    this.userName = page.locator('h1, h2, [class*="name"]').first();
    this.userRole = page.locator('[class*="role"], [class*="Role"], [class*="badge"]').first();
    this.incentiveValue = page.locator(':text("incentive"), :text("Incentive")').first();
    this.penaltyValue = page.locator(':text("penalty"), :text("Penalty")').first();
    this.activitySection = page.locator('[class*="activity"], [class*="Activity"], [class*="history"], [class*="History"]').first();
  }

  // ── Actions ─────────────────────────────────────────────────

  async gotoUser(userId: string): Promise<void> {
    await this.navigateTo(`/user/${userId}`);
  }

  async getReputationScoreText(): Promise<string> {
    await this.page.waitForTimeout(2000);
    return this.getTextContent(this.reputationScore);
  }

  async isOnUserDetailsPage(): Promise<boolean> {
    const path = await this.currentPath();
    return path.startsWith('/user/');
  }
}
