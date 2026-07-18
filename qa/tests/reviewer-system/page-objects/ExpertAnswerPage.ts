/**
 * Page Object: ExpertAnswerPage
 *
 * Target:  /expert/inbox/:questionId  — the answer-detail page.
 *
 * This is where the expert actually reviews a single farmer question,
 * drafts an answer, optionally saves it as a draft, and submits it for
 * peer review.  It is the only page object in the expert flow that
 * drives form interactions.
 *
 * The page exposes four regions (all `// TODO(selector)` until staging
 * confirms the real testids):
 *
 *   1. **Farmer query**            — the original question text
 *   2. **AI draft**                — optional, AI-generated prefilled draft
 *   3. **Answer input**            — textarea / rich-text editor
 *   4. **Submission CTAs**         — "Save draft" + "Submit for review"
 *
 * Submission triggers one of three side effects the suite asserts on:
 *   • Inline validation error (empty submit)
 *   • "Draft saved" toast (no network state change visible to the test)
 *   • "Submitted" toast  +  status badge change  +  optional
 *     /notifications|/handoff|/review request to the next reviewer.
 *
 * Selectors live in `./selector-map.ts` under `SELECTOR_MAP.expert.answer`.
 */
import { expect, Locator, Page, Response } from "@playwright/test";
import { SELECTOR_MAP } from "./selector-map";

export class ExpertAnswerPage {
  readonly page: Page;

  // ── Locators ──────────────────────────────────────────────────────────────
  get heading(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.heading}"]`,
    );
  }

  /** Status badge: "assigned" / "draft" / "pending review" / "under second review" */
  get statusBadge(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.statusBadge}"]`,
    );
  }

  /** The original farmer question text region. */
  get farmerQuery(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.farmerQuery}"]`,
    );
  }

  /** Optional AI-prefilled draft region.  May be absent on some questions. */
  get aiDraft(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.aiDraft}"]`,
    );
  }

  /** The answer input — textarea, contenteditable, or rich-text editor. */
  get answerInput(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.input}"]`,
    );
  }

  get submitButton(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.submit}"]`,
    );
  }

  get draftSaveButton(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.draftSave}"]`,
    );
  }

  get draftSavedToast(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.draftSavedToast}"]`,
    );
  }

  get submittedToast(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.submittedToast}"]`,
    );
  }

  /** Optional inline validation message under the answer input. */
  get validationError(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.validationError}"]`,
    );
  }

  /** Toast that surfaces when the answer is handed off to the next reviewer. */
  get handoverToast(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.answer.handoverToast}"]`,
    );
  }

  /** Generic 403/404 region used when an expert opens someone else's question. */
  get permissionDenied(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.expert.denied.heading}"]`,
    );
  }

  constructor(page: Page) {
    this.page = page;
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  /**
   * Fill the answer input.  Clears first to avoid appending to a previously
   * persisted draft.  Works for plain `<textarea>` and contenteditable
   * inputs alike.
   */
  async fillAnswer(text: string): Promise<void> {
    await this.answerInput.fill("");
    await this.answerInput.fill(text);
  }

  /**
   * Click "Save draft".  Arms a `waitForResponse` listener for the
   * draft-save network call (matches `/draft/i` or any POST/PUT against
   * the answer endpoint) so the caller can assert the side effect.
   */
  async saveDraft(): Promise<{ response: Response | null }> {
    let draftResponse: Response | null = null;
    const responsePromise = this.page
      .waitForResponse(
        (r) =>
          /\/(draft|answer|save)/i.test(r.url()) &&
          r.request().method() !== "GET",
        { timeout: 5_000 },
      )
      .then((r) => {
        draftResponse = r;
        return r;
      })
      .catch(() => null);

    await this.draftSaveButton.click();
    await responsePromise;
    return { response: draftResponse };
  }

  /**
   * Click "Submit for review".  Arms a `waitForResponse` listener for
   * the notification chain — the network call that hands the question
   * off to the next reviewer (peer-reviewer or coordinator).
   *
   * The matcher accepts the common endpoint shapes:
   *   /notifications|/handoff|/review-request|/submit|/answer
   */
  async submitForReview(): Promise<{ response: Response | null }> {
    let handoffResponse: Response | null = null;
    const responsePromise = this.page
      .waitForResponse(
        (r) =>
          /\/(notifications|handoff|review-request|submit|answer)/i.test(
            r.url(),
          ) && r.request().method() !== "GET",
        { timeout: 5_000 },
      )
      .then((r) => {
        handoffResponse = r;
        return r;
      })
      .catch(() => null);

    await this.submitButton.click();
    await responsePromise;
    return { response: handoffResponse };
  }

  /**
   * Attempt to submit while the input is empty.  Returns once the
   * submit network call (if any) resolves OR after the 5s timeout —
   * useful for negative tests that just want the click to fire without
   * waiting for a real side effect.
   */
  async attemptEmptySubmit(): Promise<void> {
    await this.answerInput.fill("");
    await this.submitButton.click();
  }

  // ── Assertions ────────────────────────────────────────────────────────────
  async assertStatus(expected: string | RegExp): Promise<void> {
    await expect(this.statusBadge).toContainText(expected);
  }

  /** Assert the farmer query region renders non-empty text. */
  async assertFarmerQueryVisible(): Promise<void> {
    await expect(this.farmerQuery).toBeVisible();
    const text = (await this.farmerQuery.innerText()).trim();
    expect(
      text.length,
      "farmer query region should render the original question text",
    ).toBeGreaterThan(0);
  }

  /**
   * Assert the optional AI-draft region is either present and non-empty,
   * OR absent (some questions don't get one).  We treat absence as a
   * valid case so the suite doesn't lock onto a feature flag.
   */
  async assertAiDraftSoft(): Promise<void> {
    const visible = await this.aiDraft.isVisible().catch(() => false);
    if (!visible) {
      console.log(
        "[reviewer-system] EXP-03 soft-assert: staging has no AI-prefilled draft for this question.",
      );
      return;
    }
    const text = (await this.aiDraft.innerText()).trim();
    expect(text.length, "AI draft region should contain text when shown").toBeGreaterThan(
      0,
    );
  }

  async assertDraftSavedToastVisible(): Promise<void> {
    await expect(this.draftSavedToast).toBeVisible({ timeout: 5_000 });
  }

  async assertSubmittedToastVisible(): Promise<void> {
    await expect(this.submittedToast).toBeVisible({ timeout: 5_000 });
  }

  async assertValidationErrorVisible(): Promise<void> {
    await expect(this.validationError).toBeVisible({ timeout: 5_000 });
  }

  /**
   * Dual assertion for the handover: either the explicit toast surfaces
   * OR the notification/review-request network call fired.  Mirrors the
   * dual assertion used by MOD-07.
   */
  async assertHandoffFired(opts: {
    response: Response | null;
  }): Promise<void> {
    const toastVisible = await this.handoverToast
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    const submittedVisible = await this.submittedToast
      .isVisible({ timeout: 2_000 })
      .catch(() => false);

    expect(
      toastVisible || submittedVisible || opts.response !== null,
      "expected either the 'sent for review' toast, the 'submitted' toast, " +
        "or a network call to /notifications | /handoff | /review-request",
    ).toBe(true);
  }

  /**
   * Assert the page DID NOT navigate away from the answer form — used
   * after an empty submit to confirm the validation actually blocks
   * the navigation / state change.
   */
  async assertStillOnAnswerForm(questionId: string): Promise<void> {
    await expect(this.page).toHaveURL(
      new RegExp(`/expert/inbox/${questionId}$`),
    );
  }

  /** Assert the permission-denied / 403 region renders. */
  async assertPermissionDenied(): Promise<void> {
    const deniedVisible = await this.permissionDenied
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    const escapedRedirect =
      /(\/login|\/403|\/404|\/forbidden|\/unauthorized|\/error)/i;
    const url = this.page.url();
    expect(
      deniedVisible || escapedRedirect.test(url),
      `expected either the permission-denied region OR a redirect to a blocked route, got url=${url}`,
    ).toBe(true);
  }
}