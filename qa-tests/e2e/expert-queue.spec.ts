import { expect, test } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { QuestionsPage } from '../pages/QuestionsPage';

test.describe('expert question queue', () => {
  test.use({ storageState: 'playwright/.auth/expert.json' });

  test.beforeEach(async ({ page }) => {
    await new AppPage(page).gotoHomeTab('My Queue');
  });

  test('My Queue opens Question Queues with queue controls', async ({ page }) => {
    const questions = new QuestionsPage(page);

    await expect(questions.questionQueuesHeading()).toBeVisible();
    await expect(questions.allocatedQuestionsSelector()).toBeVisible();
    await expect(questions.preferencesButton()).toBeVisible();
  });

  test('shows the empty queue when the expert has no allocated questions', async ({ page }) => {
    const questions = new QuestionsPage(page);
    const emptyState = questions.queueEmptyState();
    const allocatedQuestions = questions.allocatedQuestionOptions();

    await expect
      .poll(
        async () => (await emptyState.isVisible()) || (await allocatedQuestions.count()) > 0,
        { timeout: 30_000 },
      )
      .toBe(true);

    if ((await allocatedQuestions.count()) > 0) {
      test.skip(true, 'Expert has an allocated question.');
    }

    await expect(emptyState).toBeVisible();
  });
});
