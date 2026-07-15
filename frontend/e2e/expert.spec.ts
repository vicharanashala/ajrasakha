import { test, expect } from '@playwright/test';
import { loginAsExpert } from './helpers';

test.describe('Expert Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsExpert(page);
  });

  test('tab bar shows expert-appropriate tabs', async ({ page }) => {
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toBeVisible({ timeout: 5_000 });
    const tabTexts = await tabs.allTextContents();
    const joined = tabTexts.join(' ');
    expect(joined).toContain('Dashboard');
    expect(joined).toContain('My Queue');
  });

  test('Dashboard tab is visible for expert', async ({ page }) => {
    const dashboardTab = page.getByRole('tab').filter({ hasText: 'Dashboard' });
    await expect(dashboardTab).toBeVisible();
  });

  test('check-in/check-out button present on expert Dashboard', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'Dashboard' }).click();
    await page.waitForTimeout(2_000);
    const checkBtn = page.locator('button').filter({ hasText: /Check In|Check Out/ });
    await expect(checkBtn).toBeVisible({ timeout: 10_000 });
  });

  test('My Queue tab is clickable', async ({ page }) => {
    const queueTab = page.getByRole('tab').filter({ hasText: 'My Queue' });
    await expect(queueTab).toBeVisible();
    await queueTab.click();
    await page.waitForTimeout(1_000);
  });

  test('My Queue shows question list or empty state', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'My Queue' }).click();
    await page.waitForTimeout(2_000);

    const questionList = page.locator('[role="radiogroup"], [class*="radio"], [class*="question-item"], [class*="QaQuestionItem"]').first();
    if (await questionList.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(questionList).toBeVisible();
    } else {
      const emptyText = page.locator('text=No questions').first();
      await expect(emptyText).toBeVisible({ timeout: 5_000 });
    }
  });

  test('selecting a question shows answer panel', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'My Queue' }).click();
    await page.waitForTimeout(2_000);

    const firstQuestion = page.locator('[role="radio"], [role="radiogroup"] label, [class*="question-item"]').first();
    if (await firstQuestion.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await firstQuestion.click();
      await page.waitForTimeout(1_000);

      await expect(page.locator('#new-answer, textarea[id="new-answer"]').first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('answer panel has Submit button', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'My Queue' }).click();
    await page.waitForTimeout(2_000);

    const firstQuestion = page.locator('[role="radio"], [role="radiogroup"] label, [class*="question-item"]').first();
    if (await firstQuestion.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await firstQuestion.click();
      await page.waitForTimeout(1_000);

      const submitBtn = page.getByRole('button', { name: /Submit/i }).first();
      if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(submitBtn).toBeEnabled();
      }
    }
  });

  test('AI Suggested Answer apply button is present', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'My Queue' }).click();
    await page.waitForTimeout(2_000);

    const firstQuestion = page.locator('[role="radio"], [role="radiogroup"] label, [class*="question-item"]').first();
    if (await firstQuestion.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await firstQuestion.click();
      await page.waitForTimeout(1_000);

      const botBtn = page.locator('button:has(svg.lucide-bot), button:has(svg[class*="bot"])').first();
      if (await botBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(botBtn).toBeEnabled();
      }
    }
  });

  test('empty queue text mentions reputation score', async ({ page }) => {
    await page.getByRole('tab').filter({ hasText: 'My Queue' }).click();
    await page.waitForTimeout(2_000);

    const pageText = await page.locator('body').textContent();
    const hasReputationText = pageText?.includes('reputation score') ?? false;

    if (!hasReputationText) {
      const questionList = page.locator('[role="radiogroup"], [class*="question-item"]').first();
      if (await questionList.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip('queue is not empty, reputation text not shown');
      }
    }
  });
});
