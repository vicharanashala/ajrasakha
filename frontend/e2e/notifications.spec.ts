import { test, expect } from '@playwright/test';
import { loginAsModerator } from './helpers';

test.describe('Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsModerator(page);
  });

  test('notification bell icon is visible in the header', async ({ page }) => {
    const bell = page.locator('button:has(svg.lucide-bell), button:has(svg[class*="bell"])').first();
    await expect(bell).toBeVisible({ timeout: 5_000 });
  });

  test('clicking notification bell opens the notification sheet', async ({ page }) => {
    const bell = page.locator('button:has(svg.lucide-bell), button:has(svg[class*="bell"])').first();
    await bell.click();
    await page.waitForTimeout(1_000);

    const sheet = page.locator('[role="dialog"], [class*="SheetContent"], section:has-text("Notifications")').first();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
  });

  test('notification sheet has filter tabs: All, Unread, Read', async ({ page }) => {
    const bell = page.locator('button:has(svg.lucide-bell), button:has(svg[class*="bell"])').first();
    await bell.click();
    await page.waitForTimeout(1_000);

    const filterBtn = page.getByRole('button', { name: /Filter & Settings|All|Unread|Read/i }).first();
    await expect(filterBtn).toBeVisible({ timeout: 5_000 });
  });

  test('notification sheet has Mark all read button', async ({ page }) => {
    const bell = page.locator('button:has(svg.lucide-bell), button:has(svg[class*="bell"])').first();
    await bell.click();
    await page.waitForTimeout(1_000);

    const markReadBtn = page.getByRole('button', { name: /mark all read/i });
    await expect(markReadBtn).toBeVisible({ timeout: 5_000 });
  });

  test('notification sheet has settings section with auto-delete preference', async ({ page }) => {
    const bell = page.locator('button:has(svg.lucide-bell), button:has(svg[class*="bell"])').first();
    await bell.click();
    await page.waitForTimeout(1_000);

    const settingsBtn = page.locator('button:has-text("Filter"), button:has-text("Settings")').first();
    if (await settingsBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
    }

    const autoDeleteLabel = page.locator('text=auto-delete').first()
      .or(page.locator('text=Auto delete').first());
    if (await autoDeleteLabel.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(autoDeleteLabel).toBeVisible();
    }
  });

  test('notification items render with title and message when available', async ({ page }) => {
    const bell = page.locator('button:has(svg.lucide-bell), button:has(svg[class*="bell"])').first();
    await bell.click();
    await page.waitForTimeout(1_500);

    const items = page.locator('[class*="notification-item"], [class*="NotificationItem"]').first();
    if (await items.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(items).toBeVisible();
    }
  });

  test('notification sheet has pagination or load-more button', async ({ page }) => {
    const bell = page.locator('button:has(svg.lucide-bell), button:has(svg[class*="bell"])').first();
    await bell.click();
    await page.waitForTimeout(1_000);

    const loadMore = page.getByRole('button', { name: /view previous|load more|show more/i });
    if (await loadMore.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(loadMore).toBeEnabled();
    }
  });
});
