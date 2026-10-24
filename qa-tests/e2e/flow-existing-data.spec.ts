import { expect, test, type Locator } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { QuestionDetailPage } from '../pages/QuestionDetailPage';
import { QuestionsPage } from '../pages/QuestionsPage';

const closedManualQuestion = 'what is the good pest for tomato';

async function expectCountAtLeast(locator: Locator, minimum: number) {
  await expect
    .poll(
      async () => {
        const text = await locator.innerText();
        return Number(text.match(/\d+/)?.[0] ?? 0);
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(minimum);
}

test.describe('existing data flows', () => {
  test.setTimeout(90_000);

  test.describe('moderator', () => {
    test.use({ storageState: 'playwright/.auth/moderator.json' });

    test('Manual list shows the closed question status, answers, and review level', async ({
      page,
    }) => {
      const app = new AppPage(page);
      const questions = new QuestionsPage(page);

      await app.gotoHomeTab('All Questions');
      await questions.sourceModeButton('Manual').click();
      await questions.questionsSearchInput().fill(closedManualQuestion);

      const questionRow = page.getByRole('row').filter({ hasText: closedManualQuestion });
      await expect(questionRow).toBeVisible();
      await expect(questionRow.getByRole('cell', { name: 'closed', exact: true })).toBeVisible();
      const answersColumn = await questions
        .tableHeader('Answers')
        .evaluate((header) => Array.from(header.parentElement!.children).indexOf(header));
      await expectCountAtLeast(
        questionRow.getByRole('cell').nth(answersColumn),
        1,
      );
      await expect(
        questionRow.getByRole('cell', { name: 'Level 3', exact: true }),
      ).toBeVisible();
    });

    test('question details show closed status and at least three approvals', async ({ page }) => {
      const app = new AppPage(page);
      const questions = new QuestionsPage(page);
      const detail = new QuestionDetailPage(page);

      await app.gotoHomeTab('All Questions');
      await questions.sourceModeButton('Manual').click();
      await questions.questionsSearchInput().fill(closedManualQuestion);
      await page.getByText(closedManualQuestion, { exact: true }).first().click();

      await expect(detail.title(closedManualQuestion)).toBeVisible();
      await expect(page.getByText('closed', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Submission History', { exact: true })).toBeVisible();

      const approvals = page.getByText(/^\d+ Approvals$/, { exact: true }).first();
      await expectCountAtLeast(approvals, 3);
    });

    test('Moderator queue shows an assigned moderator', async ({ page }) => {
      const app = new AppPage(page);
      const questions = new QuestionsPage(page);

      await app.gotoHomeTab('All Questions');
      await questions.sourceModeButton('Manual').click();
      await questions.questionsSearchInput().fill(closedManualQuestion);
      await page.getByText(closedManualQuestion, { exact: true }).first().click();

      await page.locator('[data-tab="moderator"]').click();
      await expect(page.getByText('No Moderator Assigned', { exact: true })).toHaveCount(0);
    });

    test('Manual list includes a delayed question', async ({ page }) => {
      const app = new AppPage(page);
      const questions = new QuestionsPage(page);

      await app.gotoHomeTab('All Questions');
      await questions.sourceModeButton('Manual').click();

      await expect
        .poll(
          async () =>
            page.getByRole('row').filter({
              has: page.getByText('delayed', { exact: true }),
            }).count(),
        )
        .toBeGreaterThanOrEqual(1);
    });

    test('My Dashboard shows a completed question count and the closed question', async ({
      page,
    }) => {
      const app = new AppPage(page);

      await app.gotoHomeTab('My Dashboard');

      const completedQuestions = page
        .getByText('Completed Questions', { exact: true })
        .locator('..')
        .getByText(/^\d+$/, { exact: true });
      await expectCountAtLeast(completedQuestions, 1);

      await page.getByPlaceholder('Search questions...').fill(closedManualQuestion);
      const questionRow = page.getByRole('row').filter({ hasText: closedManualQuestion });
      await expect(questionRow).toBeVisible();
      await expect(questionRow.getByRole('cell', { name: 'closed', exact: true })).toBeVisible();
    });

    test('Dashboard shows Golden Dataset Analytics with verified entries', async ({ page }) => {
      const app = new AppPage(page);

      await app.gotoHomeTab('Dashboard');

      await expect(
        page.getByRole('heading', { name: 'Golden Dataset Analytics', exact: true }),
      ).toBeVisible();
      const verifiedEntries = page
        .getByText('Verified Entries', { exact: true })
        .first()
        .locator('..')
        .getByText(/^\d+$/, { exact: true });
      await expectCountAtLeast(verifiedEntries, 1);
    });

    test('Dashboard shows question, answer, and expert analytics headings', async ({ page }) => {
      const app = new AppPage(page);

      await app.gotoHomeTab('Dashboard');

      for (const heading of [
        'Question Status Overview',
        'Answer Status Overview',
        'Experts Performance Metrics',
        'Heat Map Of Experts',
      ]) {
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      }
    });
  });

  test.describe('expert', () => {
    test.use({ storageState: 'playwright/.auth/expert.json' });

    test('Dashboard shows Incentive Points and Total Approved Answers', async ({ page }) => {
      const app = new AppPage(page);

      await app.gotoHomeTab('Dashboard');

      const incentivePoints = page
        .getByText('Incentive Points', { exact: true })
        .locator('..')
        .getByText(/^\d+$/, { exact: true });
      await expectCountAtLeast(incentivePoints, 1);
      await expect(page.getByText('Total Approved Answers', { exact: true })).toBeVisible();
    });

    test('Dashboard shows the pending tasks by review level table with Author', async ({
      page,
    }) => {
      const app = new AppPage(page);

      await app.gotoHomeTab('Dashboard');

      const summaryTable = page
        .getByRole('heading', {
          name: 'Summary of Pending Tasks by Review Level',
          exact: true,
        })
        .locator('..')
        .locator('..')
        .getByRole('table');
      await expect(summaryTable).toBeVisible();
      await expect(
        summaryTable.getByRole('columnheader', { name: /Completed Tasks/ }),
      ).toBeVisible();
      await expect(summaryTable.getByText('Author', { exact: true })).toBeVisible();
    });
  });
});
