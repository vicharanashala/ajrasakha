import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Coordinator Page Object — /coordinator route.
 *
 * Used by moderators to manage the question queue, allocate experts,
 * and view queue details.
 */
export class CoordinatorPage extends BasePage {
  // ── Locators ────────────────────────────────────────────────

  /** Page header */
  readonly header: Locator;

  /** Question queue table / list */
  readonly questionQueue: Locator;

  /** Individual question rows in the queue */
  readonly questionRows: Locator;

  /** Status badges on questions */
  readonly statusBadges: Locator;

  /** Allocate / Assign expert button on a question row */
  readonly allocateButton: Locator;

  /** Allocation dialog (Radix Dialog) */
  readonly allocationDialog: Locator;

  /** Expert list inside allocation dialog */
  readonly expertListItems: Locator;

  /** Confirm allocation button inside dialog */
  readonly confirmAllocationButton: Locator;

  /** Queue details / summary section */
  readonly queueDetailsSection: Locator;

  /** Status section counts in queue details */
  readonly statusSectionCounts: Locator;

  /** Stuck question indicator */
  readonly stuckIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.header = page.locator('h1:has-text("Coordinator Dashboard")');
    this.questionQueue = page.locator('table, [class*="question-queue"], [class*="QuestionQueue"]');
    this.questionRows = page.locator('table tbody tr, [class*="question-row"]');
    this.statusBadges = page.locator('[class*="badge"], [class*="Badge"]');
    this.allocateButton = page.getByRole('button', { name: /allocate|assign/i });
    this.allocationDialog = page.locator('[role="dialog"]');
    this.expertListItems = page.locator('[role="dialog"] [class*="expert"], [role="dialog"] [role="option"], [role="dialog"] [class*="list-item"], [role="dialog"] label');
    this.confirmAllocationButton = page.locator('[role="dialog"] button:has-text("Allocate"), [role="dialog"] button:has-text("Assign"), [role="dialog"] button:has-text("Confirm")');
    this.queueDetailsSection = page.locator('[class*="queue-details"], [class*="QueueDetails"]');
    this.statusSectionCounts = page.locator('[class*="count"], [class*="Count"]');
    this.stuckIndicator = page.locator('[class*="stuck"], [class*="delayed"], :text("stuck"), :text("Stuck")');
  }

  // ── Actions ─────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigateTo('/coordinator');
  }

  async getQuestionCount(): Promise<number> {
    return this.questionRows.count();
  }

  async clickAllocateOnFirstQuestion(): Promise<void> {
    const firstRow = this.questionRows.first();
    await firstRow.hover();
    // Try clicking an allocate button within the row, or a general one
    const rowAllocateBtn = firstRow.locator('button:has-text("Allocate"), button:has-text("Assign")');
    if (await rowAllocateBtn.isVisible()) {
      await rowAllocateBtn.click();
    } else {
      await this.allocateButton.first().click();
    }
  }

  async selectFirstExpert(): Promise<void> {
    await this.expertListItems.first().click();
  }

  async confirmAllocation(): Promise<void> {
    await this.confirmAllocationButton.first().click();
  }

  async getStatusBadgeTexts(): Promise<string[]> {
    return this.statusBadges.allTextContents();
  }

  async isOnCoordinatorPage(): Promise<boolean> {
    const path = await this.currentPath();
    return path.startsWith('/coordinator');
  }

  async hasStuckIndicator(): Promise<boolean> {
    return this.stuckIndicator.isVisible();
  }
}
