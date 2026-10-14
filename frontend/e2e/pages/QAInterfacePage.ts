import type { Page, Locator } from "@playwright/test";

export class QAInterfacePage {
  readonly page: Page;
  readonly questionText: Locator;
  readonly answerForm: Locator;
  readonly submitAnswerButton: Locator;
  readonly approveButton: Locator;
  readonly rejectButton: Locator;
  readonly holdButton: Locator;
  readonly clarifyButton: Locator;
  readonly reviewChecklist: Locator;
  readonly responseTimeline: Locator;
  readonly expertAllocation: Locator;
  readonly allocateExpertButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.questionText = page.locator('[class*="question"], [data-testid*="question"]');
    this.answerForm = page.locator("form, [class*='answer']");
    this.submitAnswerButton = page.getByRole("button", {
      name: /submit|save|create/i,
    });
    this.approveButton = page.getByRole("button", {
      name: /approve|accept/i,
    });
    this.rejectButton = page.getByRole("button", {
      name: /reject|decline/i,
    });
    this.holdButton = page.getByRole("button", { name: /hold/i });
    this.clarifyButton = page.getByRole("button", {
      name: /clarification|clarify/i,
    });
    this.reviewChecklist = page.locator('[class*="checklist"], [class*="review"]');
    this.responseTimeline = page.locator('[class*="timeline"]');
    this.expertAllocation = page.locator('[class*="allocat"]');
    this.allocateExpertButton = page.getByRole("button", {
      name: /allocate|assign/i,
    });
  }
}
