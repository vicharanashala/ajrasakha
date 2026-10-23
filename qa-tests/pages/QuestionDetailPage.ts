import type { Page } from '@playwright/test';

export class QuestionDetailPage {
  constructor(private readonly page: Page) {}

  title(questionText: string) {
    return this.page.getByRole('heading', { level: 1, name: questionText, exact: true });
  }

  detailValue(label: string, value: string) {
    return this.page.getByText(label, { exact: true }).locator('..').getByText(value, { exact: true });
  }

  async openAllocationTab() {
    await this.page.getByRole('button', { name: /Allocation/ }).click();
  }

  allocationQueueCount() {
    return this.page.getByText(/^\d+ experts? in queue$/);
  }

  selectExpertsButton() {
    return this.page.getByRole('button', { name: 'Select Experts', exact: true });
  }

  expertSearchInput() {
    return this.page.getByPlaceholder('Search experts by name, email...', { exact: true });
  }

  expertsDialog() {
    return this.page.getByRole('dialog', { name: 'Select Experts Manually' });
  }

  submissionHistoryAnswer(answerText: string) {
    return this.page.getByText(answerText, { exact: true });
  }
}
