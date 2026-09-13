import type { Page, Locator } from "@playwright/test";

const ACTIVE_PANEL = '[role="tabpanel"][data-state="active"]';

export class QAInterfacePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private get panel(): Locator {
    return this.page.locator(ACTIVE_PANEL);
  }

  // --- sidebar ---

  get sidebarTitle(): Locator {
    return this.page.getByText("Question Queues");
  }

  get allocatedQuestionsOption(): Locator {
    return this.page.getByRole("option", { name: "Allocated Questions" });
  }

  get reroutedQuestionsOption(): Locator {
    return this.page.getByRole("option", { name: "ReRouted Questions" });
  }

  get preferencesButton(): Locator {
    return this.page.getByRole("button", { name: "Preferences" });
  }

  get collapseButton(): Locator {
    return this.page.getByTitle("Collapse Questions");
  }

  get expandButton(): Locator {
    return this.page.getByTitle("Expand Questions");
  }

  get questionRadioGroup(): Locator {
    return this.page.getByRole("radiogroup");
  }

  questionRadio(questionText: string): Locator {
    return this.page.getByRole("radio", { name: new RegExp(questionText) });
  }

  // --- right panel ---

  get responsePanelTitle(): Locator {
    return this.panel.getByText("Response");
  }

  get responseHistoryTitle(): Locator {
    return this.panel.getByText("Response History");
  }

  get rerouteResponseTitle(): Locator {
    return this.panel.getByText("Reroute Response");
  }

  get currentQueryLabel(): Locator {
    return this.panel.getByText("Current Query:");
  }

  get answerTextarea(): Locator {
    return this.panel.getByLabel(/Draft Response:|AI Suggested Answer:/);
  }

  get remarksTextarea(): Locator {
    return this.panel.getByLabel("Remarks");
  }

  get submitButton(): Locator {
    return this.panel.getByRole("button", { name: "Submit" });
  }

  get viewMetadataButton(): Locator {
    return this.page.getByText("View Metadata");
  }

  // --- review action buttons ---

  get acceptReviewButton(): Locator {
    return this.panel.getByRole("button", { name: "Accept" });
  }

  get rejectReviewButton(): Locator {
    return this.panel.getByRole("button", { name: /^Reject/ });
  }

  get modifyReviewButton(): Locator {
    return this.panel.getByRole("button", { name: "Modify" });
  }

  get rejectRerouteButton(): Locator {
    return this.panel.getByRole("button", { name: "Reject ReRoute" });
  }

  // --- AcceptReviewDialog ---

  get acceptDialogTitle(): Locator {
    return this.page.getByText("Confirm Acceptance");
  }

  get acceptConfirmButton(): Locator {
    return this.page.getByRole("button", { name: "Confirm Accept" });
  }

  // --- ReviewResponseDialog (reject / modify) ---

  get rejectDialogTitle(): Locator {
    return this.page.getByText("Reject Response");
  }

  get modifyDialogTitle(): Locator {
    return this.page.getByText("Modify Response");
  }

  get reviewParametersHeading(): Locator {
    return this.page.getByText("Review Parameters");
  }

  get reasonTextarea(): Locator {
    return this.page.getByRole("textbox", { name: /Reason/ });
  }

  get submitReasonButton(): Locator {
    return this.page.getByRole("button", { name: "Submit Reason" });
  }

  get proceedButton(): Locator {
    return this.page.getByRole("button", { name: "Proceed" });
  }

  get submitNewResponseHeading(): Locator {
    return this.page.getByText(/Submit New Response|Submit Updated Response/);
  }

  get editReasonButton(): Locator {
    return this.page.getByRole("button", { name: "Edit Reason" });
  }

  // --- ConfirmationModal (final step: Submit Response / Confirm Rejection / Confirm Modification) ---

  get confirmationDialogTitle(): Locator {
    return this.page.getByText(/Submit Response|Confirm Rejection|Confirm Modification/);
  }

  get confirmationSubmitButton(): Locator {
    return this.page.getByRole("button", { name: "Submit Response" });
  }

  // --- QuestionDetailsDialog ---

  get questionDetailsTitle(): Locator {
    return this.page.getByText("Question Details");
  }

  // --- Preferences dialog ---

  get preferencesDialogTitle(): Locator {
    return this.page.getByText("Advanced Filters");
  }

  get preferencesApplyButton(): Locator {
    return this.page.getByRole("button", { name: "Apply Changes" });
  }

  get preferencesResetButton(): Locator {
    return this.page.getByRole("button", { name: "Reset Filters" });
  }

  // --- Reject ReRoute inline dialog ---

  get rejectRerouteReasonTextarea(): Locator {
    return this.page.getByPlaceholder("Write your reason...");
  }

  get rejectRerouteSubmitButton(): Locator {
    return this.page.getByRole("button", { name: "Submit" });
  }
}
