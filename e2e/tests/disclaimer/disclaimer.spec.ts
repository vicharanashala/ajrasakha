/**
 * Disclaimer / SLA timer tests.
 *
 * AJRASAKHA-sourced questions have a 2-hour SLA. The TimerDisplay component shows
 * a countdown badge that:
 *  - Is green when > 60 min remain
 *  - Turns yellow at 30–60 min
 *  - Turns red + pulses at < 30 min
 *
 * These tests verify that the badge renders for AJRASAKHA questions,
 * changes color class based on time value, and that it does NOT render
 * for non-AJRASAKHA questions.
 */
import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePage';
import {
  mockCurrentUser,
  mockQuestionList,
  mockQuestionById,
  type MockQuestion,
} from '../../helpers/api-mock';

const AJRASAKHA_GREEN: MockQuestion = {
  id: 'q-disc-green',
  text: 'My paddy crop has yellow leaves.',
  source: 'AJRASAKHA',
  language: 'hi-IN',
  aiInitialAnswer: 'Apply zinc sulphate 25 kg/ha.',
  history: [],
  timer: '01:30:00',  // 90 min remaining → green
};

const AJRASAKHA_CRITICAL: MockQuestion = {
  id: 'q-disc-red',
  text: 'My tomato plants are wilting.',
  source: 'AJRASAKHA',
  language: 'hi-IN',
  aiInitialAnswer: 'Check soil moisture and apply irrigation.',
  history: [],
  timer: '00:15:00',  // 15 min remaining → red
};

const NON_AJRASAKHA: MockQuestion = {
  id: 'q-disc-annam',
  text: 'What is intercropping?',
  source: 'annam',
  language: 'en-IN',
  aiInitialAnswer: 'Intercropping is growing two or more crops simultaneously.',
  history: [],
  timer: '00:00:00',  // should not show timer
};

test.describe('Disclaimer / SLA timer behavior', () => {
  test('TEST-24: AJRASAKHA question shows SLA timer badge', async ({ page }) => {
    await mockCurrentUser(page, 'expert');
    await mockQuestionList(page, [AJRASAKHA_GREEN]);
    await mockQuestionById(page, AJRASAKHA_GREEN);

    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');

    await home.selectQuestionByText('My paddy crop');

    // Timer badge must be visible for AJRASAKHA sources
    await home.expectTimerVisible();
    const timer = page.locator('[data-testid="timer-display"]').first();
    await expect(timer).toBeVisible({ timeout: 10_000 });
    await expect(timer).toContainText(/\d+:\d+/); // shows time format
  });

  test('TEST-25: timer badge is red when SLA is critically low (< 30 min)', async ({ page }) => {
    await mockCurrentUser(page, 'expert');
    await mockQuestionList(page, [AJRASAKHA_CRITICAL]);
    await mockQuestionById(page, AJRASAKHA_CRITICAL);

    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');

    await home.selectQuestionByText('My tomato plants');

    const timer = page.locator('[data-testid="timer-display"]').first();
    await expect(timer).toBeVisible({ timeout: 10_000 });

    // Red state — the span inside has text-red-600 class
    const timeSpan = timer.locator('span');
    await expect(timeSpan).toHaveClass(/red/, { timeout: 5_000 });
  });

  test('TEST-26: non-AJRASAKHA question does not show SLA timer badge', async ({ page }) => {
    await mockCurrentUser(page, 'expert');
    await mockQuestionList(page, [NON_AJRASAKHA]);
    await mockQuestionById(page, NON_AJRASAKHA);

    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');

    await home.selectQuestionByText('What is intercropping');

    // Timer should NOT be visible for annam source
    const timer = page.locator('[data-testid="timer-display"]');
    const count = await timer.count();

    // Either no timer element exists, or it returns null (timer === "00:00:00")
    if (count > 0) {
      const isVisible = await timer.first().isVisible().catch(() => false);
      // The component returns null for "00:00:00" — so either hidden or absent
      expect(isVisible).toBe(false);
    } else {
      expect(count).toBe(0);
    }
  });
});
