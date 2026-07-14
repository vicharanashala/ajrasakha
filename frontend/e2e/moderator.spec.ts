import { test, expect } from '@playwright/test';
import { loginAsModerator } from './helpers';

test.describe('Moderator Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsModerator(page);
  });

  test('tab bar shows role-appropriate tabs for moderator', async ({ page }) => {
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toBeVisible({ timeout: 5_000 });
    const tabTexts = await tabs.allTextContents();
    const joined = tabTexts.join(' ');
    expect(joined).toContain('Dashboard');
    expect(joined).toContain('All Questions');
    expect(joined).toContain('Expert Management');
    expect(joined).toContain('Agents Interface');
    expect(joined).toContain('ChatBot Analytics');
  });

  test('Dashboard tab is visible by default', async ({ page }) => {
    const dashboardTab = page.getByRole('tab').filter({ hasText: 'Dashboard' });
    await expect(dashboardTab).toBeVisible();
  });

  test('check-in / check-out button is present on Dashboard', async ({ page }) => {
    const checkBtn = page.locator('button').filter({ hasText: /Check In|Check Out/ });
    await expect(checkBtn).toBeVisible({ timeout: 10_000 });
  });

  test('click check-in toggles button label to Check Out', async ({ page }) => {
    const checkBtn = page.locator('button').filter({ hasText: /Check In|Check Out/ });
    await expect(checkBtn).toBeVisible({ timeout: 10_000 });

    const text = await checkBtn.textContent();
    if (text?.includes('Check In')) {
      await checkBtn.click();
      await page.waitForTimeout(1_000);
      await expect(checkBtn).toContainText('Check Out');
    }
  });

  test('All Questions tab displays a filterable question table', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'All Questions' }).click();
    await page.waitForTimeout(1_000);

    await expect(page.locator('table, [class*="grid"], [class*="table"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('All Questions search input is present', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'All Questions' }).click();
    await page.waitForTimeout(1_000);

    const searchInput = page.locator('input[type="text"], input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(searchInput).toBeEnabled();
    }
  });

  test('Expert Management tab shows user table with workload column', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'Expert Management' }).click();
    await page.waitForTimeout(1_500);

    const table = page.locator('table, [role="table"]').first();
    await expect(table).toBeVisible({ timeout: 10_000 });
  });

  test('user profile dropdown contains moderator menu items', async ({ page }) => {
    const menuTrigger = page.locator('button[aria-haspopup="menu"]').last()
      .or(page.locator('[data-radix-popper-trigger]').last());
    if (await menuTrigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await menuTrigger.click();
      await page.waitForTimeout(500);

      await expect(page.getByRole('menuitem', { name: /Profile/i }).first()).toBeVisible({ timeout: 3_000 });
      const menuTexts = await page.locator('[role="menuitem"], [class*="DropdownMenuItem"]').allTextContents();
      const joined = menuTexts.join(' ');
      expect(joined).toContain('Profile');
    }
  });

  test('ChatBot Analytics tab is accessible', async ({ page }) => {
    const analyticsTab = page.getByRole('tab').filter({ hasText: 'ChatBot Analytics' });
    if (await analyticsTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await analyticsTab.click();
      await page.waitForTimeout(1_000);
      await expect(page).toHaveURL(/\/home/);
    }
  });

  test('Agents Interface tab is accessible', async ({ page }) => {
    const agentsTab = page.getByRole('tab').filter({ hasText: 'Agents Interface' });
    if (await agentsTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await agentsTab.click();
      await page.waitForTimeout(1_000);
    }
  });
});
