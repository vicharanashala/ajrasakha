import { test, expect } from '@playwright/test';
import { loginAsModerator } from './helpers';

test.describe('Queue Details', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsModerator(page);
  });

  test('Queue Details trigger button is visible on All Questions tab', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'All Questions' }).click();
    await page.waitForTimeout(1_500);

    const queueBtn = page.locator('button:has-text("Queue"), button:has-text("queue")').first();
    await expect(queueBtn).toBeVisible({ timeout: 10_000 });
  });

  test('clicking Queue Details opens the modal', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'All Questions' }).click();
    await page.waitForTimeout(1_500);

    const queueBtn = page.locator('button:has-text("Queue"), button:has-text("queue")').first();
    if (await queueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await queueBtn.click({ force: true });
      await page.waitForTimeout(1_000);
      const dialog = page.locator('[role="dialog"], [class*="Modal"], [class*="SheetContent"]').first();
      await expect(dialog).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Queue Details modal shows Total Work section with count', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'All Questions' }).click();
    await page.waitForTimeout(1_500);

    const queueBtn = page.locator('button:has-text("Queue"), button:has-text("queue")').first();
    if (await queueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await queueBtn.click({ force: true });
      await page.waitForTimeout(1_000);

      const totalWork = page.locator('text=Total Work').first()
        .or(page.locator('[class*="section"]:has-text("total")').first());
      await expect(totalWork).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Queue Details modal has Stuck Questions section', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'All Questions' }).click();
    await page.waitForTimeout(1_500);

    const queueBtn = page.locator('button:has-text("Queue"), button:has-text("queue")').first();
    if (await queueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await queueBtn.click({ force: true });
      await page.waitForTimeout(1_000);

      const stuckSection = page.locator('text=Stuck').first()
        .or(page.locator('[class*="section"]:has-text("stuck")').first());
      await expect(stuckSection).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Queue Details modal has Needs Reviewer section', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'All Questions' }).click();
    await page.waitForTimeout(1_500);

    const queueBtn = page.locator('button:has-text("Queue"), button:has-text("queue")').first();
    if (await queueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await queueBtn.click({ force: true });
      await page.waitForTimeout(1_000);

      const needsReviewer = page.locator('text=Needs Reviewer').first()
        .or(page.locator('[class*="section"]:has-text("reviewer")').first());
      await expect(needsReviewer).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Queue Details modal has Questions Allocated section', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'All Questions' }).click();
    await page.waitForTimeout(1_500);

    const queueBtn = page.locator('button:has-text("Queue"), button:has-text("queue")').first();
    if (await queueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await queueBtn.click({ force: true });
      await page.waitForTimeout(1_000);

      const allocated = page.locator('text=Allocated').first()
        .or(page.locator('[class*="section"]:has-text("allocated")').first());
      await expect(allocated).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Queue Details modal can be closed', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'All Questions' }).click();
    await page.waitForTimeout(1_500);

    const queueBtn = page.locator('button:has-text("Queue"), button:has-text("queue")').first();
    if (await queueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await queueBtn.click({ force: true });
      await page.waitForTimeout(1_000);

      const closeBtn = page.locator('[role="dialog"] button:has(svg.lucide-x), button[class*="close"]').first()
        .or(page.locator('button[aria-label="Close"]'));
      if (await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(500);
        await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3_000 });
      }
    }
  });
});
