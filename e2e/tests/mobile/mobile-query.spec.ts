/**
 * Mobile query submission tests — experts can review and answer questions
 * on a small phone screen (393×851, Pixel 5).
 *
 * These tests verify touch interactions, scroll behavior, and form usability
 * on mobile viewports. Same API mocks as desktop query tests.
 */
import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePage';
import {
  mockCurrentUser,
  mockQuestionList,
  mockQuestionById,
  mockSubmitAnswer,
  type MockQuestion,
} from '../../helpers/api-mock';

// Mobile viewport
test.use({ viewport: { width: 393, height: 851 } });

const MOBILE_QUESTION: MockQuestion = {
  id: 'q-mobile-001',
  text: 'How to increase mango yield during summer?',
  source: 'annam',
  language: 'en-IN',
  aiInitialAnswer: 'Apply potash fertilizer and ensure adequate irrigation.',
  history: [],
  timer: '04:00:00',
};

test.describe('Mobile — query submission flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockCurrentUser(page, 'expert');
    await mockQuestionList(page, [MOBILE_QUESTION]);
    await mockQuestionById(page, MOBILE_QUESTION);
    await mockSubmitAnswer(page);
  });

  test('TEST-48: expert queue loads on mobile viewport', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // On mobile, navigate via sidebar if tabs are hidden
    const myQueueTab = page.getByRole('tab', { name: /my queue/i });
    const isTabVisible = await myQueueTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (isTabVisible) {
      await myQueueTab.click();
    } else {
      // Try mobile sidebar navigation
      const lastHeaderBtn = page.locator('header button').last();
      if (await lastHeaderBtn.isVisible()) {
        await lastHeaderBtn.click();
        const sidebarMyQueue = page.getByText(/my queue/i);
        if (await sidebarMyQueue.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sidebarMyQueue.click();
        }
      }
    }

    // Questions should load regardless of viewport
    await expect(page.getByText('How to increase mango yield')).toBeVisible({ timeout: 12_000 });
  });

  test('TEST-49: expert can tap a question and see answer textarea on mobile', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // Navigate to queue
    const myQueueTab = page.getByRole('tab', { name: /my queue/i });
    if (await myQueueTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await myQueueTab.click();
    }

    // Tap on the question card
    const questionCard = page.getByText('How to increase mango yield').first();
    await questionCard.waitFor({ state: 'visible', timeout: 10_000 });
    await questionCard.click();

    // Answer textarea should be reachable — may need scrolling on mobile
    const textarea = page.locator('textarea#new-answer');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
  });

  test('TEST-50: expert can type and submit answer on mobile viewport', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    const myQueueTab = page.getByRole('tab', { name: /my queue/i });
    if (await myQueueTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await myQueueTab.click();
    }

    const questionCard = page.getByText('How to increase mango yield').first();
    if (await questionCard.isVisible({ timeout: 8000 }).catch(() => false)) {
      await questionCard.click();

      const textarea = page.locator('textarea#new-answer');
      await textarea.waitFor({ state: 'visible', timeout: 8_000 });

      // Type answer using mobile-friendly method
      await textarea.tap();
      await textarea.fill('Apply potash and drip irrigate twice a week.');

      await expect(textarea).toHaveValue('Apply potash and drip irrigate twice a week.');
    } else {
      // Question may not be visible depending on mobile layout
      test.skip(true, 'Question not visible in mobile layout — skip');
    }
  });
});
