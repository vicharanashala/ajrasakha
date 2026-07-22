import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * PAE Expert Page Object — /pae-expert route.
 *
 * Maps to <PAEExpertPage> rendered inside the pae-expert route.
 * Experts see assigned questions and can submit answers.
 */
export class PaeExpertPage extends BasePage {
  // ── Locators ────────────────────────────────────────────────

  /** Page header */
  readonly header: Locator;

  /** Container for assigned question cards / list */
  readonly questionList: Locator;

  /** Individual question cards */
  readonly questionCards: Locator;

  /** Question text / title within a card */
  readonly questionTexts: Locator;

  /** Question detail fields (crop, state, domain, priority) */
  readonly questionDetails: Locator;

  /** Answer text area / input */
  readonly answerTextarea: Locator;

  /** Submit answer button */
  readonly submitAnswerButton: Locator;

  /** Notification bell button */
  readonly notificationBell: Locator;

  /** Notification badge count */
  readonly notificationBadge: Locator;

  /** Success confirmation after submission */
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.header = page.locator('h1:has-text("PAE Expert Portal")');
    this.questionList = page.locator('main');
    this.questionCards = page.locator('[class*="card"], [class*="Card"]').filter({ hasText: /question|crop|state|domain/i });
    this.questionTexts = page.locator('[class*="question-text"], [class*="QuestionText"], h3, h4');
    this.questionDetails = page.locator('[class*="detail"], [class*="Detail"], [class*="meta"], [class*="Meta"]');
    this.answerTextarea = page.locator('textarea, [contenteditable="true"], input[type="text"][class*="answer"]');
    this.submitAnswerButton = page.getByRole('button', { name: /submit/i });
    this.notificationBell = page.locator('button:has(svg.lucide-bell), button:has([class*="Bell"])');
    this.notificationBadge = page.locator('[class*="destructive"], [class*="badge"]').filter({ hasText: /\d+/ });
    this.successMessage = page.locator('[data-sonner-toast], [role="status"]');
  }

  // ── Actions ─────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.navigateTo('/pae-expert');
  }

  async getAssignedQuestionCount(): Promise<number> {
    await this.page.waitForTimeout(2000); // wait for data load
    return this.questionCards.count();
  }

  async openFirstQuestion(): Promise<void> {
    await this.questionCards.first().click();
  }

  async typeAnswer(text: string): Promise<void> {
    await this.answerTextarea.first().waitFor({ state: 'visible' });
    await this.answerTextarea.first().fill(text);
  }

  async submitAnswer(): Promise<void> {
    await this.submitAnswerButton.click();
  }

  async isSubmitDisabled(): Promise<boolean> {
    return this.submitAnswerButton.isDisabled();
  }

  async getQuestionDetailTexts(): Promise<string[]> {
    return this.questionDetails.allTextContents();
  }

  async isOnExpertPage(): Promise<boolean> {
    const path = await this.currentPath();
    return path.startsWith('/pae-expert');
  }
}
