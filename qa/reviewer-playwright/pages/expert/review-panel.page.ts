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
 *
 * STILL NOT VERIFIED — built from screenshots (image 11/12) plus this
 * app's own established switch pattern (confirmed elsewhere on the
 * moderator's Auto-allocate switch: role="switch" + label[for] gives the
 * accessible name), not from live DOM of this specific dialog:
 *   - The "Confirm Acceptance" alertdialog's accessible name/heading text,
 *     and the six toggle switches' accessible names.
 *
 * COMPLETELY UNKNOWN — no screenshots or DOM at all yet:
 *   - Reject dialog/flow.
 *   - Modify dialog/flow.
 * Do not call reject()/modify() (not yet implemented) until that DOM is
 * provided — see the note in the spec file.
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
  async confirmAcceptance(): Promise<void> {
    await this.confirmAcceptButton.click();

    await expect(this.confirmAcceptanceDialog).toBeHidden();
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
}
