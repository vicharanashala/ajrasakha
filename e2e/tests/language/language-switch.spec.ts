/**
 * Language switching tests — the SarvamTranslateDropdown allows experts to
 * translate questions and draft answers into any of 22 Indic languages.
 *
 * These tests mock the Sarvam API to avoid consuming credits and ensure
 * the UI responds correctly to translated text.
 */
import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/HomePage';
import {
  mockCurrentUser,
  mockQuestionList,
  mockQuestionById,
  mockSarvamTranslate,
  type MockQuestion,
} from '../../helpers/api-mock';

const ENGLISH_QUESTION: MockQuestion = {
  id: 'q-lang-001',
  text: 'What pesticide should I use for rice stem borer?',
  source: 'annam',
  language: 'en-IN',
  aiInitialAnswer: 'Use chlorpyrifos 20 EC at 2.5 ml/L of water.',
  history: [],
  timer: '03:00:00',
};

const HINDI_TRANSLATED = 'चावल के तने के छेदक के लिए कीटनाशक का प्रयोग करें।';
const HINDI_ANSWER_TRANSLATED = 'क्लोरपायरीफोस 20 EC का उपयोग करें।';

test.describe('Language switching — Sarvam translate dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await mockCurrentUser(page, 'expert');
    await mockQuestionList(page, [ENGLISH_QUESTION]);
    await mockQuestionById(page, ENGLISH_QUESTION);
    await mockSarvamTranslate(page, HINDI_TRANSLATED);
  });

  test('TEST-27: translate dropdown trigger is visible in the QA panel', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');
    await home.selectQuestionByText('What pesticide');

    const trigger = page.locator('[data-testid="translate-trigger"]').first();
    await expect(trigger).toBeVisible({ timeout: 10_000 });
  });

  test('TEST-28: clicking translate dropdown opens the language menu', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');
    await home.selectQuestionByText('What pesticide');

    const trigger = page.locator('[data-testid="translate-trigger"]').first();
    await trigger.click();

    const menu = page.locator('[data-testid="translate-menu"]').first();
    await expect(menu).toBeVisible({ timeout: 5_000 });
  });

  test('TEST-29: language menu lists Indic languages including Hindi', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');
    await home.selectQuestionByText('What pesticide');

    const trigger = page.locator('[data-testid="translate-trigger"]').first();
    await trigger.click();

    const menu = page.locator('[data-testid="translate-menu"]').first();
    await expect(menu).toBeVisible({ timeout: 5_000 });

    // Hindi must be present
    await expect(menu.getByText(/hindi/i)).toBeVisible();
    // Also check a few more
    await expect(menu.getByText(/punjabi/i)).toBeVisible();
    await expect(menu.getByText(/gujarati/i)).toBeVisible();
  });

  test('TEST-30: selecting Hindi replaces query text with translated content', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');
    await home.selectQuestionByText('What pesticide');

    // Mock returns HINDI_TRANSLATED for any translate call
    await mockSarvamTranslate(page, HINDI_TRANSLATED);

    // Get original query text
    const queryParagraph = page.locator('p').filter({ hasText: 'What pesticide' }).first();
    await expect(queryParagraph).toBeVisible({ timeout: 8_000 });

    // Open translate and select Hindi
    await home.translateQuery('Hindi');

    // After translation, the query paragraph should show translated text
    // The component replaces query text with translatedText state
    await expect(page.getByText(HINDI_TRANSLATED)).toBeVisible({ timeout: 12_000 });
  });

  test('TEST-31: language switch works mid-session without re-login', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');
    await home.selectQuestionByText('What pesticide');

    // Switch language
    await mockSarvamTranslate(page, HINDI_TRANSLATED);
    await home.translateQuery('Hindi');
    await expect(page.getByText(HINDI_TRANSLATED)).toBeVisible({ timeout: 12_000 });

    // User is still authenticated — check the URL hasn't changed to /auth
    await expect(page).toHaveURL(/\/home/);
    await expect(page.locator('img[alt="Annam Logo"]')).toBeVisible();
  });
});
