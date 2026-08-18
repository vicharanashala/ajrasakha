import { expect, type Locator, type Page } from "@playwright/test";

/**
 * CONFIRMED against real DOM (expert2's My Queue view of expert1's answer):
 *   - Accept / Reject / Modify buttons — plain visible-text accessible
 *     names ("Accept", "Reject", "Modify"), no aria-label overrides. Icons
 *     inside don't affect the accessible name.
 *   - "View Details" button next to the Answer text — visible text
 *     "View Details", opens a dialog (aria-haspopup="dialog").
 *   - "Comments" is a real <button> (Radix accordion trigger), not a link
 *     or div — getByRole("button", { name: "Comments" }) is correct.
 *   - "View Metadata" on this panel is the exact same button as
 *     ResponsePage.viewMetadataButton (same aria-label "View more
 *     details") — reuse workflowResponsePage's existing
 *     openMetadataDialog()/expectMetadataDialog() for that; not
 *     duplicated here.
 */
export class ReviewPanelPage {
  readonly acceptButton: Locator;
  readonly rejectButton: Locator;
  readonly modifyButton: Locator;

  readonly confirmAcceptanceDialog: Locator;
  readonly confirmAcceptButton: Locator;
  readonly resetAcceptanceButton: Locator;

  readonly criteriaToggles: Record<
    | "contextRelevance"
    | "technicalAccuracy"
    | "practicalUtility"
    | "valueAddition"
    | "credibilityTrust"
    | "readabilityCommunication",
    Locator
  >;
  readonly criteriaSwitches: Locator;
  readonly viewDetailsButton: Locator;
  readonly answerDetailsDialog: Locator;
  readonly commentsToggle: Locator;

  readonly acceptSuccessToast: Locator;

  readonly closeAnswerDetailsButton: Locator;

  readonly rejectResponseDialog: Locator;
  readonly rejectReasonInput: Locator;
  readonly submitRejectButton: Locator;
  readonly cancelRejectButton: Locator;
  readonly rejectCriteriaSwitches: Locator;

  readonly rejectCriteriaToggles: Record<
    | "contextRelevance"
    | "technicalAccuracy"
    | "practicalUtility"
    | "valueAddition"
    | "credibilityTrust"
    | "readabilityCommunication",
    Locator
  >;

  readonly resetRejectButton: Locator;
  readonly rejectionValidationMessage: Locator;

  readonly rejectNewResponseHeading: Locator;
  readonly rejectReplacementResponse: Locator;
  readonly rejectReplacementRemarks: Locator;
  readonly rejectSourceTypeTrigger: Locator;
  readonly rejectFinalSubmitButton: Locator;
  readonly rejectSuccessToast: Locator;
  readonly editReasonButton: Locator;

  // -----------------------------
  // Modify
  // -----------------------------
  readonly modifyResponseDialog: Locator;
  readonly modifyResetButton: Locator;
  readonly modifyCriteriaSwitches: Locator;
  readonly modifyCriteriaToggles: Record<
    | "contextRelevance"
    | "technicalAccuracy"
    | "practicalUtility"
    | "valueAddition"
    | "credibilityTrust"
    | "readabilityCommunication",
    Locator
  >;
  readonly modifyReasonInput: Locator;
  readonly modifyProceedButton: Locator;
  readonly modifyAllGoodWarning: Locator;

  readonly modifyUpdatedResponseHeading: Locator;
  readonly modifyDraftResponse: Locator;
  readonly modifyFinalSubmitButton: Locator;
  readonly editModifyReasonButton: Locator;
  readonly identicalAnswerErrorToast: Locator;
  readonly confirmModificationDialog: Locator;
  readonly confirmModificationButton: Locator;
  constructor(private readonly page: Page) {
    this.acceptButton = page.getByRole("button", { name: "Accept" });
    this.rejectButton = page.getByRole("button", { name: "Reject" });
    this.modifyButton = page.getByRole("button", { name: "Modify" });

    this.confirmAcceptanceDialog = page.getByRole("dialog", {
      name: "Confirm Acceptance",
    });

    this.confirmAcceptButton = this.confirmAcceptanceDialog.getByRole(
      "button",
      { name: "Confirm Accept" },
    );
    this.resetAcceptanceButton = this.confirmAcceptanceDialog.getByRole(
      "button",
      { name: "Reset" },
    );

    this.criteriaToggles = {
      contextRelevance: this.confirmAcceptanceDialog.getByRole("switch", {
        name: "Context & Relevance",
      }),
      technicalAccuracy: this.confirmAcceptanceDialog.getByRole("switch", {
        name: "Technical Accuracy",
      }),
      practicalUtility: this.confirmAcceptanceDialog.getByRole("switch", {
        name: "Practical Utility",
      }),
      valueAddition: this.confirmAcceptanceDialog.getByRole("switch", {
        name: "Value Addition / Insight",
      }),
      credibilityTrust: this.confirmAcceptanceDialog.getByRole("switch", {
        name: "Credibility & Trust",
      }),
      readabilityCommunication: this.confirmAcceptanceDialog.getByRole(
        "switch",
        { name: "Readability & Communication" },
      ),
    };
    this.criteriaSwitches = this.confirmAcceptanceDialog.getByRole("switch");

    this.viewDetailsButton = page.getByRole("button", {
      name: "View Details",
    });
    this.answerDetailsDialog = page.getByRole("dialog", {
      name: "Answer Details",
    });
    this.commentsToggle = page.getByRole("button", { name: "Comments" });

    this.acceptSuccessToast = page.getByText(
      "Your response has been submitted. Thank you!",
    );

    this.closeAnswerDetailsButton = this.answerDetailsDialog.getByRole(
      "button",
      {
        name: "Close",
      },
    );

    this.rejectResponseDialog = page.getByRole("dialog", {
      name: "Reject Response",
    });

    this.rejectReasonInput = this.rejectResponseDialog.getByRole("textbox", {
      name: "Reason for Rejection *",
    });

    this.submitRejectButton = this.rejectResponseDialog.getByRole("button", {
      name: "Submit Reason",
    });

    this.cancelRejectButton = this.rejectResponseDialog.getByRole("button", {
      name: "Cancel",
    });

    this.rejectCriteriaSwitches = this.rejectResponseDialog.getByRole("switch");

    const rejectCriterionRow = (name: string): Locator =>
      this.rejectResponseDialog
        .getByText(name, { exact: true })
        .locator("xpath=ancestor::div[.//*[@role='switch']][1]");

    this.rejectCriteriaToggles = {
      contextRelevance: rejectCriterionRow("Context & Relevance").getByRole(
        "switch",
      ),

      technicalAccuracy:
        rejectCriterionRow("Technical Accuracy").getByRole("switch"),

      practicalUtility:
        rejectCriterionRow("Practical Utility").getByRole("switch"),

      valueAddition: rejectCriterionRow("Value Addition / Insight").getByRole(
        "switch",
      ),

      credibilityTrust: rejectCriterionRow("Credibility & Trust").getByRole(
        "switch",
      ),

      readabilityCommunication: rejectCriterionRow(
        "Readability & Communication",
      ).getByRole("switch"),
    };
    this.resetRejectButton = this.rejectResponseDialog.getByRole("button", {
      name: "Reset",
    });
    this.rejectionValidationMessage = this.rejectResponseDialog.getByText(
      /To reject this answer, please disable Value.*Insight/i,
    );

    // -----------------------------
    // Step 2 of Reject: after "Submit Reason" advances past the
    // reason/criteria step, the dialog shows a full "Submit New Response"
    // form requiring a replacement answer before the rejection actually
    // completes. Scoped to rejectResponseDialog throughout — #new-answer
    // and #remarks are reused ids also present on the underlying My Queue
    // panel behind this modal, so an unscoped page-level locator would
    // strict-mode-violate by matching both.
    // -----------------------------
    this.rejectNewResponseHeading = this.rejectResponseDialog.getByText(
      "Submit New Response",
      { exact: true },
    );
    this.rejectReplacementResponse =
      this.rejectResponseDialog.locator("#new-answer");
    this.rejectReplacementRemarks =
      this.rejectResponseDialog.locator("#remarks");
    this.rejectSourceTypeTrigger = this.rejectResponseDialog
      .getByRole("combobox")
      .filter({ hasText: "Select Source Type" });
    // Exact match ("^Submit$") deliberately excludes "Submit Reason" —
    // both are technically within this dialog's DOM across the two steps.
    this.rejectFinalSubmitButton = this.rejectResponseDialog.getByRole(
      "button",
      { name: /^Submit$/ },
    );
    this.rejectSuccessToast = page.getByText(
      "Your response has been submitted. Thank you!",
    );
    this.editReasonButton = this.rejectResponseDialog.getByRole("button", {
      name: "Edit Reason",
    });

    // -----------------------------
    // Modify
    // -----------------------------
    this.modifyResponseDialog = page.getByRole("dialog", {
      name: "Modify Response",
    });

    this.modifyResetButton = this.modifyResponseDialog.getByRole("button", {
      name: "Reset",
    });

    this.modifyCriteriaSwitches = this.modifyResponseDialog.getByRole("switch");

    // Same as Reject's criteria: these switches have no aria-label/for
    // association, so they must be located via the sibling <label> text
    // in the same row rather than an accessible name.
    const modifyCriterionRow = (name: string): Locator =>
      this.modifyResponseDialog
        .getByText(name, { exact: true })
        .locator("xpath=ancestor::div[.//*[@role='switch']][1]");

    this.modifyCriteriaToggles = {
      contextRelevance: modifyCriterionRow("Context & Relevance").getByRole(
        "switch",
      ),
      technicalAccuracy:
        modifyCriterionRow("Technical Accuracy").getByRole("switch"),
      practicalUtility:
        modifyCriterionRow("Practical Utility").getByRole("switch"),
      valueAddition: modifyCriterionRow("Value Addition / Insight").getByRole(
        "switch",
      ),
      credibilityTrust: modifyCriterionRow("Credibility & Trust").getByRole(
        "switch",
      ),
      readabilityCommunication: modifyCriterionRow(
        "Readability & Communication",
      ).getByRole("switch"),
    };

    // "Reason for Modification *" IS properly label-associated
    // (for="reason" / id="reason"), unlike the criteria switches above.
    this.modifyReasonInput = this.modifyResponseDialog.getByRole("textbox", {
      name: "Reason for Modification *",
    });

    this.modifyProceedButton = this.modifyResponseDialog.getByRole("button", {
      name: "Proceed",
    });

    this.modifyAllGoodWarning = this.modifyResponseDialog.getByText(
      "All review parameters look good. You can safely accept this answer.",
      { exact: true },
    );

    // -----------------------------
    // Step 2 of Modify: "Submit Updated Response". Unlike Reject's step 2,
    // the draft response and source reference are pre-populated from the
    // original answer (not blank) — the required action is editing the
    // existing text, not filling from scratch. Scoped to
    // modifyResponseDialog for the same #new-answer duplicate-id reason
    // as Reject.
    // -----------------------------
    this.modifyUpdatedResponseHeading = this.modifyResponseDialog.getByText(
      "Submit Updated Response",
      { exact: true },
    );
    this.modifyDraftResponse = this.modifyResponseDialog.locator("#new-answer");
    this.modifyFinalSubmitButton = this.modifyResponseDialog.getByRole(
      "button",
      { name: /^Submit$/ },
    );
    this.editModifyReasonButton = this.modifyResponseDialog.getByRole(
      "button",
      { name: "Edit Reason" },
    );

    this.identicalAnswerErrorToast = page.getByText(
      /identical to the existing answer/i,
    );
    this.confirmModificationDialog = page.getByRole("alertdialog");

    this.confirmModificationButton = this.confirmModificationDialog.getByRole(
      "button",
      {
        name: "Submit",
        exact: true,
      },
    );
  }

  async pause(): Promise<void> {
    await this.page.pause();
  }

  async expectReviewActionsVisible(): Promise<void> {
    await expect(this.acceptButton).toBeVisible();
    await expect(this.rejectButton).toBeVisible();
    await expect(this.modifyButton).toBeVisible();
  }

  async openViewDetails(): Promise<void> {
    await this.viewDetailsButton.click();
    await expect(this.answerDetailsDialog).toBeVisible();
  }

  async acceptWithAllCriteria(): Promise<void> {
    await this.acceptButton.click();
    await expect(this.confirmAcceptanceDialog).toBeVisible();

    for (const toggle of Object.values(this.criteriaToggles)) {
      await expect(toggle).toHaveAttribute("aria-checked", "true");
    }

    await expect(this.confirmAcceptButton).toBeEnabled();
    await this.confirmAcceptButton.click();
  }

  async openAcceptDialog(): Promise<void> {
    await this.acceptButton.click();
    await expect(this.confirmAcceptanceDialog).toBeVisible();
  }

  async expectAcceptanceCriteriaVisible(): Promise<void> {
    await expect(this.criteriaSwitches).toHaveCount(6);

    const count = await this.criteriaSwitches.count();

    for (let i = 0; i < count; i++) {
      await expect(this.criteriaSwitches.nth(i)).toBeVisible();
    }
  }

  async expectAllCriteriaEnabled(): Promise<void> {
    const count = await this.criteriaSwitches.count();

    expect(count).toBe(6);

    for (let i = 0; i < count; i++) {
      await expect(this.criteriaSwitches.nth(i)).toHaveAttribute(
        "aria-checked",
        "true",
      );
    }
  }
  async expectConfirmAcceptEnabled(): Promise<void> {
    await expect(this.confirmAcceptButton).toBeEnabled();
  }
  /**
   * Confirms acceptance and waits for genuine backend confirmation, not
   * just the dialog closing.
   *
   * The dialog closing on click is NOT itself reliable confirmation
   * that the accept request resolved — see the identical caution
   * already documented on submitRejection() below, which explicitly
   * calls out Accept's dialog as the (incorrectly) assumed exception to
   * that rule. `acceptSuccessToast` already existed as a locator but
   * was never actually awaited here, so any code downstream of a
   * confirmAcceptance() call could previously run before the backend
   * had truly finished processing the acceptance — for a sequential
   * multi-reviewer chain, that's exactly the kind of race that could
   * make the *next* reviewer's turn look like it never unlocks.
   */
  async confirmAcceptance(): Promise<void> {
    await this.confirmAcceptButton.click();

    await expect(this.confirmAcceptanceDialog).toBeHidden();
    await expect(this.acceptSuccessToast).toBeVisible();

    console.log(`[ACCEPT SUCCESS] ${this.page.url()}`);
  }

  async expectAcceptSuccess(): Promise<void> {
    await expect(this.acceptSuccessToast).toBeVisible();
  }

  async expandComments(): Promise<void> {
    await this.commentsToggle.click();
  }

  async expectCommentsExpanded(): Promise<void> {
    await expect(this.commentsToggle).toHaveAttribute("aria-expanded", "true");
  }

  async closeViewDetails(): Promise<void> {
    await this.closeAnswerDetailsButton.click();
    await expect(this.answerDetailsDialog).toBeHidden();
  }
  async expectAcceptanceDialogClosed(): Promise<void> {
    await expect(this.confirmAcceptanceDialog).toBeHidden();
  }

  async openRejectDialog(): Promise<void> {
    await this.rejectButton.click();

    await expect(this.rejectResponseDialog).toBeVisible();
  }

  async expectRejectDialogVisible(): Promise<void> {
    await expect(this.rejectResponseDialog).toBeVisible();
  }

  async expectRejectCriteriaVisible(): Promise<void> {
    await expect(this.rejectCriteriaSwitches).toHaveCount(6);

    const count = await this.rejectCriteriaSwitches.count();

    for (let i = 0; i < count; i++) {
      await expect(this.rejectCriteriaSwitches.nth(i)).toBeVisible();
    }
  }
  async expectRejectCriteriaDisabled(): Promise<void> {
    const count = await this.rejectCriteriaSwitches.count();

    expect(count).toBe(6);

    for (let i = 0; i < count; i++) {
      await expect(this.rejectCriteriaSwitches.nth(i)).toHaveAttribute(
        "aria-checked",
        "false",
      );
    }
  }
  async expectRejectReasonRequired(): Promise<void> {
    await expect(this.rejectReasonInput).toBeVisible();
    await expect(this.rejectReasonInput).toHaveValue("");

    await expect(this.submitRejectButton).toBeDisabled();
  }
  async fillRejectReason(reason: string): Promise<void> {
    await this.rejectReasonInput.fill(reason);
  }

  async expectSubmitRejectEnabled(): Promise<void> {
    await expect(this.submitRejectButton).toBeEnabled();
  }
  async cancelReject(): Promise<void> {
    await this.cancelRejectButton.click();

    await expect(this.rejectResponseDialog).toBeHidden();
  }
  async enableRejectCriterion(
    criterion:
      | "contextRelevance"
      | "technicalAccuracy"
      | "practicalUtility"
      | "valueAddition"
      | "credibilityTrust"
      | "readabilityCommunication",
  ): Promise<void> {
    const toggle = this.rejectCriteriaToggles[criterion];

    await expect(toggle).toBeVisible();

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }

  async disableRejectCriterion(
    criterion:
      | "contextRelevance"
      | "technicalAccuracy"
      | "practicalUtility"
      | "valueAddition"
      | "credibilityTrust"
      | "readabilityCommunication",
  ): Promise<void> {
    const toggle = this.rejectCriteriaToggles[criterion];

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-checked", "false");
  }
  async resetRejectCriteria(): Promise<void> {
    await this.resetRejectButton.click();
  }

  async expectAllRejectCriteriaDisabled(): Promise<void> {
    for (const toggle of Object.values(this.rejectCriteriaToggles)) {
      await expect(toggle).toHaveAttribute("aria-checked", "false");
    }
  }

  async expectValueAdditionRejectionWarning(): Promise<void> {
    await expect(this.rejectionValidationMessage).toBeVisible();
  }
  async expectValueAdditionRejectionWarningHidden(): Promise<void> {
    await expect(this.rejectionValidationMessage).toBeHidden();
  }
  async submitRejection(
    replacementAnswer = "Playwright automated rejection — replacement answer.",
    sourceType: "State" | "Central" | "Research Paper" | "Other" = "State",
  ): Promise<void> {
    // Step 1 -> Step 2: "Submit Reason" only advances the wizard, it does
    // NOT complete the rejection by itself.
    await this.submitRejectButton.click();
    await expect(this.rejectNewResponseHeading).toBeVisible();

    // Step 2: a replacement response is required before rejection
    // completes. Every field here is scoped to rejectResponseDialog since
    // #new-answer/#remarks are also present (behind this modal) on the
    // underlying My Queue panel.
    await this.rejectReplacementResponse.fill(replacementAnswer);

    await this.rejectSourceTypeTrigger.click();
    await this.page.getByRole("option", { name: sourceType }).click();
    await this.rejectResponseDialog
      .getByPlaceholder("State Source Name")
      .fill("Playwright Test Source");
    await this.rejectResponseDialog
      .getByPlaceholder("State Source Link URL")
      .fill("https://workdrive.zohoexternal.in/file/123");
    await this.rejectResponseDialog
      .getByPlaceholder("Page(s) e.g. 1,2,3")
      .fill("1");
    await this.rejectResponseDialog
      .getByRole("button")
      .filter({ has: this.page.locator("svg.lucide-circle-plus") })
      .click();

    await expect(this.rejectFinalSubmitButton).toBeEnabled();
    await this.rejectFinalSubmitButton.click();

    // Submit opens a page-level alertdialog — same *pattern* as the normal
    // answer-submission flow, but different wording: titled "Confirm
    // Rejection" with a plain "Submit" button (not "Submit Response").
    const confirmDialog = this.page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Submit" }).click();

    // Wait for actual submission confirmation before trusting the
    // rejection completed — the dialog closing on click is not itself
    // sufficient signal (unlike Accept's dialog, which only closes once
    // its own request resolves). Same generic success toast as a normal
    // answer submission.
    await expect(this.page.getByText(/submitted|success|saved/i)).toBeVisible();

    await expect(this.rejectResponseDialog).toBeHidden();
  }
  async expectRejectSuccess(): Promise<void> {
    await expect(this.rejectSuccessToast).toBeVisible();
  }

  // -----------------------------
  // Modify
  // -----------------------------

  async openModifyDialog(): Promise<void> {
    await this.modifyButton.click();
    await expect(this.modifyResponseDialog).toBeVisible();
  }

  async expectModifyCriteriaVisible(): Promise<void> {
    await expect(this.modifyCriteriaSwitches).toHaveCount(6);

    const count = await this.modifyCriteriaSwitches.count();

    for (let i = 0; i < count; i++) {
      await expect(this.modifyCriteriaSwitches.nth(i)).toBeVisible();
    }
  }

  async expectAllModifyCriteriaEnabled(): Promise<void> {
    const count = await this.modifyCriteriaSwitches.count();

    expect(count).toBe(6);

    for (let i = 0; i < count; i++) {
      await expect(this.modifyCriteriaSwitches.nth(i)).toHaveAttribute(
        "aria-checked",
        "true",
      );
    }
  }

  async enableModifyCriterion(
    criterion:
      | "contextRelevance"
      | "technicalAccuracy"
      | "practicalUtility"
      | "valueAddition"
      | "credibilityTrust"
      | "readabilityCommunication",
  ): Promise<void> {
    const toggle = this.modifyCriteriaToggles[criterion];

    await expect(toggle).toBeVisible();

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }

  async disableModifyCriterion(
    criterion:
      | "contextRelevance"
      | "technicalAccuracy"
      | "practicalUtility"
      | "valueAddition"
      | "credibilityTrust"
      | "readabilityCommunication",
  ): Promise<void> {
    const toggle = this.modifyCriteriaToggles[criterion];

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-checked", "false");
  }

  async resetModifyCriteria(): Promise<void> {
    await this.modifyResetButton.click();
  }

  async expectModifyCriteriaResetState(): Promise<void> {
    await expect(this.modifyCriteriaToggles.contextRelevance).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await expect(this.modifyCriteriaToggles.technicalAccuracy).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await expect(this.modifyCriteriaToggles.practicalUtility).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await expect(this.modifyCriteriaToggles.valueAddition).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await expect(this.modifyCriteriaToggles.credibilityTrust).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await expect(
      this.modifyCriteriaToggles.readabilityCommunication,
    ).toHaveAttribute("aria-checked", "false");
  }

  async fillModifyReason(reason: string): Promise<void> {
    await this.modifyReasonInput.fill(reason);
  }

  async expectProceedDisabled(): Promise<void> {
    await expect(this.modifyProceedButton).toBeDisabled();
  }

  async expectProceedEnabled(): Promise<void> {
    await expect(this.modifyProceedButton).toBeEnabled();
  }

  async expectAllParametersGoodWarningVisible(): Promise<void> {
    await expect(this.modifyAllGoodWarning).toBeVisible();
  }

  async expectAllParametersGoodWarningHidden(): Promise<void> {
    await expect(this.modifyAllGoodWarning).toBeHidden();
  }

  async proceedToUpdatedResponse(): Promise<void> {
    await this.modifyProceedButton.click();
    await expect(this.modifyUpdatedResponseHeading).toBeVisible();
  }

  /**
   * Full modification flow. By default disables "technicalAccuracy" (any
   * criterion other than valueAddition satisfies the "at least one other
   * toggle off" rule) and supplies a >=10-character reason, since:
   *   - All 6 criteria true -> Proceed stays disabled ("all good" warning).
   *   - valueAddition off alone is NOT sufficient -> still need one more
   *     criterion off, same special-casing as Reject's warning.
   *   - Reason must be at least 10 characters.
   * Step 2 requires the draft response to actually differ from the
   * original text, or the backend responds with "BadRequestError: The
   * submitted answer is identical to the existing answer." — the default
   * updatedAnswer text is written to differ from the original answer text
   * used elsewhere in this workflow for that reason.
   */
  // async submitModification(
  //   updatedAnswer = "Playwright automated modification — updated answer.",
  //   reason = "Playwright automated modification reason for testing.",
  // ): Promise<void> {
  //   await this.disableModifyCriterion("technicalAccuracy");
  //   await this.fillModifyReason(reason);

  //   await expect(this.modifyProceedButton).toBeEnabled();
  //   await this.proceedToUpdatedResponse();

  //   // Step 2: the field is pre-populated with the original answer — must
  //   // actually change it, not just re-fill with the same text.
  //   await this.modifyDraftResponse.fill(updatedAnswer);

  //   await this.modifyFinalSubmitButton.click();

  //   const confirmDialog = this.page.getByRole("alertdialog");
  //   await expect(confirmDialog).toBeVisible();
  //   await confirmDialog.getByRole("button", { name: "Submit" }).click();

  //   await expect(this.page.getByText(/submitted|success|saved/i)).toBeVisible();

  //   await expect(this.modifyResponseDialog).toBeHidden();
  // }
  async submitModification(
    updatedAnswer = "Playwright automated modification — updated answer.",
    reason = "Playwright automated modification reason for testing.",
  ): Promise<void> {
    await this.disableModifyCriterion("technicalAccuracy");

    await this.fillModifyReason(reason);

    await expect(this.modifyProceedButton).toBeEnabled();

    await this.proceedToUpdatedResponse();

    await expect(this.modifyDraftResponse).toBeVisible();

    await this.modifyDraftResponse.fill(updatedAnswer);

    await this.modifyFinalSubmitButton.click();

    const confirmDialog = this.page.getByRole("alertdialog", {
      name: "Confirm Modification",
    });

    await expect(confirmDialog).toBeVisible();

    await confirmDialog
      .getByRole("button", {
        name: "Submit",
      })
      .click();

    await expect(this.modifyResponseDialog).toBeHidden();
  }

  async expectIdenticalAnswerError(): Promise<void> {
    await expect(this.identicalAnswerErrorToast).toBeVisible();
  }
  // async expectIdenticalAnswerError(): Promise<void> {
  //   await expect(this.identicalAnswerErrorToast).toBeVisible();
  // }
  async expectModifyReasonRequired(): Promise<void> {
    await expect(this.modifyReasonInput).toBeVisible();
    await expect(this.modifyReasonInput).toHaveValue("");
    await expect(this.modifyProceedButton).toBeDisabled();
  }

  async expectModifyDialogClosed(): Promise<void> {
    await expect(this.modifyResponseDialog).toBeHidden();
  }

  async expectModifyDraftResponseVisible(): Promise<void> {
    await expect(this.modifyDraftResponse).toBeVisible();
  }

  async expectModifyDraftResponseNotEmpty(): Promise<void> {
    await expect(this.modifyDraftResponse).not.toHaveValue("");
  }

  async getModifyDraftResponse(): Promise<string> {
    return this.modifyDraftResponse.inputValue();
  }

  async fillModifyDraftResponse(answer: string): Promise<void> {
    await this.modifyDraftResponse.fill(answer);
  }

  async expectModifySubmitEnabled(): Promise<void> {
    await expect(this.modifyFinalSubmitButton).toBeEnabled();
  }

  async expectConfirmModificationDialog(): Promise<void> {
    const confirmDialog = this.page.getByRole("alertdialog", {
      name: "Confirm Modification",
    });

    await expect(confirmDialog).toBeVisible();
  }

  async confirmModification(): Promise<void> {
    const confirmationDialog = this.page.getByRole("alertdialog");

    await expect(confirmationDialog).toBeVisible();

    await confirmationDialog
      .getByRole("button", {
        name: "Submit",
        exact: true,
      })
      .click();
  }
}
