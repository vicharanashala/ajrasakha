import type { Page } from '@playwright/test';

export class QuestionsPage {
  constructor(private readonly page: Page) {}

  dashboardTab() {
    return this.page.getByRole('tab', { name: 'Dashboard', exact: true });
  }

  myDashboardTab() {
    return this.page.getByRole('tab', { name: 'My Dashboard', exact: true });
  }

  allQuestionsTab() {
    return this.page.getByRole('tab', { name: 'All Questions', exact: true });
  }

  myQueueTab() {
    return this.page.getByRole('tab', { name: 'My Queue', exact: true });
  }

  expertManagementTab() {
    return this.page.getByRole('tab', { name: 'Expert Management', exact: true });
  }

  manualTab() {
    return this.page.getByText('Manual', { exact: true });
  }

  myAssignmentTab() {
    return this.page.getByText('My Assignment', { exact: true });
  }

  async openAddQuestionDialog() {
    await this.page.getByRole('button', { name: '+' }).click();
  }

  addQuestionDialog() {
    return this.page.getByRole('dialog', { name: 'Add New Question' });
  }

  questionTextLabel() {
    return this.page.getByText('Question Text*', { exact: true });
  }

  questionTextInput() {
    return this.addQuestionDialog().getByRole('textbox');
  }

  addQuestionButton() {
    return this.addQuestionDialog().getByRole('button', { name: 'Add Question' });
  }
}
