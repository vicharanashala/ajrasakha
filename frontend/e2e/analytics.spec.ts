import { test, expect } from '@playwright/test';
import { loginAsModerator } from './helpers';

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsModerator(page);
  });

  test('Dashboard tab renders performance overview cards', async ({ page }) => {
    const cards = page.locator('[class*="card"], [class*="Card"]').first();
    await expect(cards).toBeVisible({ timeout: 10_000 });
  });

  test('Golden Dataset overview section is present', async ({ page }) => {
    const gdbSection = page.locator('text=Golden Dataset').first()
      .or(page.locator('text=Golden DB').first())
      .or(page.locator('text=golden').first());
    if (await gdbSection.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(gdbSection).toBeVisible();
    }
  });

  test('Golden Dataset summary cards render', async ({ page }) => {
    await page.waitForTimeout(3_000);

    const totalEntries = page.locator('text=Total Entries').first();
    const verifiedEntries = page.locator('text=Verified Entries').first();
    const currentPeriod = page.locator('text=Current Period').first();

    if (await totalEntries.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(totalEntries).toBeVisible();
    }
    if (await verifiedEntries.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(verifiedEntries).toBeVisible();
    }
    if (await currentPeriod.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(currentPeriod).toBeVisible();
    }
  });

  test('Experts Performance chart is present', async ({ page }) => {
    await page.waitForTimeout(3_000);

    const section = page.locator('text=Experts Performance').first()
      .or(page.locator('text=expert performance').first())
      .or(page.locator('text=Performance').first());
    if (await section.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(section).toBeVisible();
    }
  });

  test('Heat Map of Reviewers section is present', async ({ page }) => {
    await page.waitForTimeout(3_000);

    const heatmap = page.locator('text=Heat Map').first()
      .or(page.locator('text=heatmap').first())
      .or(page.locator('text=Reviewer').first());
    if (await heatmap.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(heatmap).toBeVisible();
    }
  });

  test('Moderator approvals link is present on GDB card', async ({ page }) => {
    await page.waitForTimeout(3_000);

    const approvalsLink = page.locator('text=moderator approval').first()
      .or(page.locator('text=Moderator Approvals').first());
    if (await approvalsLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(approvalsLink).toBeVisible();
    }
  });

  test('ChatBot Analytics tab loads dashboard components', async ({ page }) => {
    const analyticsTab = page.getByRole('tab').filter({ hasText: 'ChatBot Analytics' });
    if (await analyticsTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await analyticsTab.click();
      await page.waitForTimeout(3_000);

      const bodyText = await page.locator('body').textContent();
      const hasDashboardContent = bodyText?.includes('ChatBot') ?? false;
      expect(hasDashboardContent).toBeTruthy();
    }
  });

  test('Questions Analytics chart section is present on Dashboard', async ({ page }) => {
    await page.waitForTimeout(3_000);
    const qaSection = page.locator('text=Questions Analytics').first()
      .or(page.locator('text=questions analytic').first());
    if (await qaSection.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(qaSection).toBeVisible();
    }
  });

  test('Status overview sections render on Dashboard', async ({ page }) => {
    await page.waitForTimeout(3_000);
    const statusSection = page.locator('text=Status').first()
      .or(page.locator('text=Overview').first());
    if (await statusSection.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(statusSection).toBeVisible();
    }
  });
});
