import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Audit Page Object — /audit route.
 *
 * Maps to <AuditPage> component showing audit trail entries.
 */
export class AuditPage extends BasePage {
  // ── Locators ────────────────────────────────────────────────

  /** Audit log container */
  readonly container: Locator;

  /** Audit log table / list */
  readonly auditTable: Locator;

  /** Audit log rows / entries */
  readonly auditEntries: Locator;

  /** Action type column */
  readonly actionTypes: Locator;

  /** Timestamp column */
  readonly timestamps: Locator;

  /** Empty state */
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.locator('main, [class*="audit"], [class*="Audit"]').first();
    this.auditTable = page.locator('table, [class*="audit-log"], [class*="AuditLog"]').first();
    this.auditEntries = page.locator('table tbody tr, [class*="audit-entry"], [class*="AuditEntry"]');
    this.actionTypes = page.locator('table tbody tr td:nth-child(2), [class*="action-type"]');
    this.timestamps = page.locator('table tbody tr td:last-child, [class*="timestamp"]');
    this.emptyState = page.locator(':text("No audit"), :text("no audit"), :text("No data"), :text("empty")');
  }

  // ── Actions ─────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigateTo('/audit');
  }

  async getAuditEntryCount(): Promise<number> {
    await this.page.waitForTimeout(2000);
    return this.auditEntries.count();
  }

  async isOnAuditPage(): Promise<boolean> {
    const path = await this.currentPath();
    return path.startsWith('/audit');
  }
}
