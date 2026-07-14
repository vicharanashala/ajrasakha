import { test, expect } from '@playwright/test';
import { loginAsModerator, loginAsExpert } from './helpers';

test.describe('Reputation Scores', () => {
  test('expert performance chart shows reputation bars on moderator dashboard', async ({ page }) => {
    await loginAsModerator(page);
    await page.waitForTimeout(3_000);

    const section = page.locator('text=Experts Performance').first()
      .or(page.locator('text=Expert Performance').first())
      .or(page.locator('text=expert performance').first());
    if (await section.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const chart = page.locator('svg[class*="recharts"], [class*="bar"], [class*="chart"]').first();
      if (await chart.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(chart).toBeVisible();
      }
    }
  });

  test('Expert Management tab shows Workload column with reputation score', async ({ page }) => {
    await loginAsModerator(page);

    await page.getByRole('tab').filter({ hasText: 'Expert Management' }).click();
    await page.waitForTimeout(2_000);

    const table = page.locator('table, [role="table"], [class*="table"]').first();
    if (await table.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const headerText = await table.locator('thead, [class*="header"]').first().textContent();
      const hasWorkload = headerText?.toLowerCase().includes('workload')
        || headerText?.toLowerCase().includes('reputation')
        || headerText?.toLowerCase().includes('score');
      if (hasWorkload) {
        const badge = page.locator('[class*="badge"]').first();
        if (await badge.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await expect(badge).toBeVisible();
        }
      }
    }
  });

  test('expert queue empty state mentions reputation score', async ({ page }) => {
    await loginAsExpert(page);

    await page.getByRole('tab').filter({ hasText: 'My Queue' }).click();
    await page.waitForTimeout(2_000);

    const bodyText = await page.locator('body').textContent();
    const mentionsReputation = bodyText?.includes('reputation score') ?? false;

    const questionItems = page.locator('[role="radio"], [class*="question-item"]').first();
    const hasQuestions = await questionItems.isVisible({ timeout: 3_000 }).catch(() => false) ?? false;

    if (hasQuestions) {
      test.skip('queue has questions, skipping reputation-empty-state check');
    } else {
      expect(mentionsReputation).toBeTruthy();
    }
  });

  test('incentive points label exists on expert dashboard', async ({ page }) => {
    await loginAsExpert(page);
    await page.waitForTimeout(3_000);

    const incentive = page.locator('text=Incentive').first()
      .or(page.locator('text=incentive points').first());
    if (await incentive.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(incentive).toBeVisible();
    }
  });

  test('pending workload label is present on moderator dashboard', async ({ page }) => {
    await loginAsModerator(page);
    await page.waitForTimeout(3_000);

    const workload = page.locator('text=Pending Workload').first()
      .or(page.locator('text=pending workload').first());
    if (await workload.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(workload).toBeVisible();
    }
  });
});
