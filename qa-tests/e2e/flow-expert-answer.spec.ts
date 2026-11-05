import { expect, test, type Locator, type Page } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { ExpertQueuePage } from '../pages/ExpertQueuePage';
import { QuestionWorkflowPage } from '../pages/QuestionWorkflowPage';

const answerText = `e2e-answer-${Date.now()}`;
const workDriveUrl = 'https://workdrive.zoho.com/fake-local-test';
let submittedQuestionTitle = '';

async function openAllocatedQuestions(page: Page) {
  const queue = new ExpertQueuePage(page);
  await new AppPage(page).gotoHomeTab('My Queue');
  await expect(page.getByText('Question Queues', { exact: true })).toBeVisible();
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Allocated Questions', exact: true }).click();
  return queue;
}

async function unansweredE2ePestQuestions(page: Page) {
  const questions: { title: string; option: Locator }[] = [];
  const options = page.getByRole('radio');

  for (let index = 0; index < (await options.count()); index += 1) {
    const option = options.nth(index);
    const { title, details } = await option.evaluate((radio) => {
      const card = radio.closest('div.relative.group');
      return {
        title: card?.querySelector('label')?.innerText.trim() ?? '',
        details: card?.innerText ?? '',
      };
    });

    if (title.startsWith('e2e-pest-') && /Answers:\s*0/.test(details)) {
      questions.push({ title, option });
    }
  }

  return questions;
}

async function waitForUnansweredE2ePestQuestions(page: Page) {
  let questions: Awaited<ReturnType<typeof unansweredE2ePestQuestions>> = [];
  await expect
    .poll(
      async () => {
        questions = await unansweredE2ePestQuestions(page);
        return questions.length;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  return questions;
}

async function selectFirstUnansweredE2ePest(page: Page, queue: ExpertQueuePage) {
  await openAllocatedQuestions(page);
  const questions = await waitForUnansweredE2ePestQuestions(page);

  const question = questions[0];
  await question.option.click();
  return { ...question, queue };
}

test.describe('expert answers an allocated question', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: 'playwright/.auth/expert.json' });
  test.setTimeout(120_000);

  test('Allocated Questions lists an unanswered e2e-pest question', async ({ page }) => {
    await openAllocatedQuestions(page);
    const questions = await waitForUnansweredE2ePestQuestions(page);

    expect(questions.length).toBeGreaterThan(0);
    await expect(questions[0].option).toBeVisible();
  });

  test('selecting the question shows its title under Current Query', async ({ page }) => {
    const { title } = await selectFirstUnansweredE2ePest(page, new ExpertQueuePage(page));
    const currentQuery = page.getByText('Current Query:', { exact: true }).locator('xpath=../..');

    await expect(currentQuery.getByText(title, { exact: true })).toBeVisible();
  });

  test('submitting without a source shows the required-source validation', async ({ page }) => {
    const { queue } = await selectFirstUnansweredE2ePest(page, new ExpertQueuePage(page));
    await queue.answerInput().fill(answerText);
    await queue.submitButton().click();
    await queue.confirmSubmitButton().click();

    await expect(page.getByText('At least one source is required!', { exact: true })).toBeVisible();
  });

  test('rejects a non-Zoho URL and accepts a WorkDrive URL', async ({ page }) => {
    const { queue } = await selectFirstUnansweredE2ePest(page, new ExpertQueuePage(page));

    await queue.addStateSource('https://example.com/not-workdrive');
    await expect(
      page.getByText('Only Zoho WorkDrive URLs are allowed.', { exact: true }),
    ).toBeVisible();

    await queue.addStateSource(workDriveUrl);
    await expect(page.getByText(workDriveUrl, { exact: true })).toBeVisible();
  });

  test('submits the answer with the accepted WorkDrive source', async ({ page }) => {
    const { title, queue } = await selectFirstUnansweredE2ePest(page, new ExpertQueuePage(page));
    submittedQuestionTitle = title;

    await queue.answerInput().fill(answerText);
    await queue.addStateSource(workDriveUrl);
    await queue.submitButton().click();
    await queue.confirmSubmitButton().click();

    await expect(
      page.getByText('Your response has been submitted. Thank you!', { exact: true }),
    ).toBeVisible();
  });
});

test.describe('moderator verifies the expert answer', () => {
  test.use({ storageState: 'playwright/.auth/moderator.json' });

  test('Manual question shows in-review after expert submission', async ({ page }) => {
    test.fixme(
      true,
      'Previously allocated e2e-pest questions can be aged into delayed status; the answer submits, but the Manual row does not show in-review.',
    );
    expect(submittedQuestionTitle, 'The expert submission test must run first.').not.toBe('');

    const questions = new QuestionWorkflowPage(page);
    const row = await questions.searchQuestion(submittedQuestionTitle);

    await expect(row).toBeVisible();
    await expect(row.getByText('in-review', { exact: true })).toBeVisible();
  });
});
