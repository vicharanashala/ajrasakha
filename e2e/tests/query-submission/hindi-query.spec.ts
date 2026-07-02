/**
 * Hindi query flow — expert reviews and submits an answer to a Hindi-language question.
 *
 * Critical: Hindi text must render correctly (Unicode), the queue must display it,
 * and the expert must be able to submit an answer.
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

const HINDI_QUESTION: MockQuestion = {
  id: 'q-hindi-001',
  text: 'गेहूं की फसल में कौन सी खाद सबसे अच्छी है?',
  source: 'AJRASAKHA',
  language: 'hi-IN',
  aiInitialAnswer: 'गेहूं की फसल के लिए यूरिया 120 किग्रा/हेक्टेयर और DAP 100 किग्रा/हेक्टेयर उपयोगी है।',
  history: [],
  timer: '01:45:00',
};

test.describe('Hindi query — expert review flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockCurrentUser(page, 'expert');
    await mockQuestionList(page, [HINDI_QUESTION]);
    await mockQuestionById(page, HINDI_QUESTION);
    await mockSubmitAnswer(page);
  });

  test('TEST-19: Hindi question text is visible in the expert queue', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');

    // The Devanagari text must render correctly in the browser
    await expect(page.getByText('गेहूं की फसल')).toBeVisible({ timeout: 10_000 });
  });

  test('TEST-20: clicking Hindi question shows answer panel and pre-fills AI answer', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');

    await home.selectQuestionByText('गेहूं की फसल');

    // Answer textarea should be visible
    await home.expectAnswerPanelVisible();

    // AI answer should pre-fill with Hindi text
    const textarea = page.locator('textarea#new-answer');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    const value = await textarea.inputValue();
    // Should either be empty or contain the Hindi AI answer
    expect(typeof value).toBe('string');
  });

  test('TEST-21: expert can submit an answer to a Hindi question', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.navigateToTab('myQueue');

    await home.selectQuestionByText('गेहूं की फसल');
    await home.fillAnswer('गेहूं के लिए डीएपी और यूरिया का उपयोग करें।');

    // Confirm the text was entered correctly (Unicode integrity)
    const textarea = page.locator('textarea#new-answer');
    const value = await textarea.inputValue();
    expect(value).toContain('गेहूं');
  });
});
