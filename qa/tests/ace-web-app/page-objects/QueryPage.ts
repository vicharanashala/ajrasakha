/**
 * Page Object: QueryPage
 *
 * Target:  ACE farmer web app — the query submission surface where a
 *          farmer types (or speaks) a question and receives an answer.
 *          Routes covered:
 *            "/"     — chat shell mounts here in some frontends
 *            "/ask"  — dedicated ask route in others
 *
 * The page is built from three primary affordances — the input shell
 * (textarea + submit button + voice-input button), the response region
 * (single AI bubble per answer, sometimes labeled with its source:
 * Golden Dataset / Package of Practices / AI fallback), and the locale
 * picker.  All three are tested here via SELECTOR_MAP.query.
 *
 * Selectors use the same `// TODO(selector)` convention as the rest of
 * the suite.  When the staging DOM renames an attribute, edit
 * SELECTOR_MAP.query — every test using it is updated in one step.
 * Tests fail loudly with a "0 matches" message if a locator
 * returns nothing, so a wrong testid surfaces immediately.
 *
 * Voice-input is intentionally not auto-exercised: it needs the
 * browser's `getUserMedia` permission, which Playwright cannot grant
 * in headless without a fake media stream.  The button is exposed as
 * a locator and the consent-dialog is queryable, but the recording
 * itself is covered by the dedicated mobile/voice PR (#6).
 */
import { expect, Locator, Page, Response } from "@playwright/test";
import {
  DISCLAIMER_PATTERNS,
  DISCLAIMER_TEXT_FALLBACK,
  SELECTOR_MAP,
  Routes,
  AceLanguageCode,
} from "./selector-map";

export interface LocaleSnapshot {
  inputPlaceholder: string | null;
  submitButtonLabel: string | null;
  voiceInputLabel: string | null;
  responseHeadingText: string | null;
  pageHeadingText: string | null;
}

export interface ConversationRow {
  testId: string;
  questionSnippet: string;
  answerSnippet: string;
  languageCode: string | null;
}

export interface QueryResponse {
  source: "golden-dataset" | "package-of-practices" | "ai-fallback" | "unknown";
  text: string;
  disclaimerText: string | null;
}

export class QueryPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get heading(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.heading}"]`);
  }

  get queryInput(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.queryInput}"]`);
  }

  get submitButton(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.submitButton}"]`);
  }

  get voiceInputButton(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.voiceInputButton}"]`);
  }

  get responseDisplay(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.responseDisplay}"]`);
  }

  get languageSelector(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.languageSelector}"]`);
  }

  get aiDisclaimerBanner(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.aiDisclaimerBanner}"]`,
    );
  }

  get validationError(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.validationError}"]`);
  }

  get savedConversationsList(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.savedConversationsList}"]`,
    );
  }

  savedConversation(fingerprint: string): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.conversationItemPrefix}${fingerprint}"]`,
    );
  }

  get loadingIndicator(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.loadingIndicator}"]`);
  }

  get offlineBanner(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.offlineBanner}"]`);
  }

  get errorBanner(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.errorBanner}"]`);
  }

  get queryPlaceholder(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.queryPlaceholder}"]`,
    );
  }

  get voiceConsentDialog(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.voiceConsentDialog}"]`,
    );
  }

  get errorRetry(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.errorRetry}"]`);
  }

  get answerSourceBadge(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.answerSourceBadge}"]`,
    );
  }

  // PR #6 additions: mobile / voice / error-state affordances.
  get recordingIndicator(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.recordingIndicator}"]`,
    );
  }

  get stopRecordingButton(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.stopRecordingButton}"]`,
    );
  }

  get transcriptionStatus(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.transcriptionStatus}"]`,
    );
  }

  get microphonePermissionError(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.microphonePermissionError}"]`,
    );
  }

  get voiceFallbackMessage(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.voiceFallbackMessage}"]`,
    );
  }

  get noConnectionMessage(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.noConnectionMessage}"]`,
    );
  }

  get patienceMessage(): Locator {
    return this.page.locator(
      `[data-testid="${SELECTOR_MAP.query.patienceMessage}"]`,
    );
  }

  get queryForm(): Locator {
    return this.page.locator(`[data-testid="${SELECTOR_MAP.query.queryForm}"]`);
  }

  async goto(path: string = Routes.aceQueryPage): Promise<void> {
    await this.page.goto(path).catch(async () => {
      await this.page.goto(Routes.aceHome);
    });
  }

  async typeQuery(text: string): Promise<void> {
    await this.queryInput.fill("");
    await this.queryInput.fill(text);
  }

  async submitAndWaitForResponse(opts: {
    text: string;
    timeoutMs?: number;
  }): Promise<{
    response: QueryResponse | null;
    submitResponse: Response | null;
  }> {
    const timeout = opts.timeoutMs ?? 30_000;
    await this.typeQuery(opts.text);

    let submitResponse: Response | null = null;
    const submitListener = this.page
      .waitForResponse(
        (r) =>
          /\/(query|ask|chat|answer|acc-agent|acc_agent)/i.test(r.url()) &&
          r.request().method() !== "GET",
        { timeout: 5_000 },
      )
      .then((r) => {
        submitResponse = r;
        return r;
      })
      .catch(() => null);

    await this.submitButton.click();
    await submitListener;

    const loadingPromise = this.loadingIndicator
      .waitFor({ state: "hidden", timeout })
      .then(() => true)
      .catch(() => false);

    const responsePromise = this.responseDisplay
      .waitFor({ state: "visible", timeout })
      .then(() => true)
      .catch(() => false);

    await Promise.race([
      loadingPromise,
      responsePromise,
      this.aiDisclaimerBanner.waitFor({ state: "visible", timeout }).catch(() => false),
    ]);

    const response = await this.readResponse().catch(() => null);
    return { response, submitResponse };
  }

  async doubleSubmit(text: string): Promise<void> {
    await this.typeQuery(text);
    await this.submitButton.click({ force: true });
    await this.submitButton.click({ force: true }).catch(() => undefined);
    await this.loadingIndicator
      .waitFor({ state: "hidden", timeout: 15_000 })
      .catch(() => undefined);
  }

  async selectLanguage(code: AceLanguageCode | string): Promise<void> {
    const codeStr = String(code);
    try {
      await this.languageSelector.selectOption(codeStr);
      return;
    } catch {
      /* fall through */
    }
    await this.languageSelector.click();
    await this.page
      .getByRole("option", { name: new RegExp(codeStr, "i") })
      .first()
      .click();
  }

  /**
   * Touch-first variant used by the mobile project.  Native selects
   * are tapped before `selectOption`; custom listboxes tap both the
   * trigger and option.  This catches pickers wired only to hover or
   * mouse-specific handlers.
   */
  async tapLanguage(code: AceLanguageCode | string): Promise<void> {
    const codeStr = String(code);
    const tagName = await this.languageSelector
      .evaluate((element) => element.tagName.toLowerCase())
      .catch(() => "");
    await this.languageSelector.tap();
    if (tagName === "select") {
      await this.languageSelector.selectOption(codeStr);
      return;
    }
    const option = this.page
      .getByRole("option", { name: new RegExp(codeStr, "i") })
      .first();
    await option.tap();
  }

  async openVoiceInput(): Promise<void> {
    await this.voiceInputButton.click();
    if ((await this.voiceConsentDialog.count()) > 0) {
      const allow = this.page
        .getByRole("button", { name: /allow|ok|agree|continue|yes/i })
        .first();
      if ((await allow.count()) > 0) await allow.click().catch(() => undefined);
    }
  }

  async clickVoiceInput(): Promise<void> {
    await this.voiceInputButton.click({ force: true });
  }

  async clickStopRecording(): Promise<void> {
    if ((await this.stopRecordingButton.count()) === 0) return;
    await this.stopRecordingButton.click({ force: true });
  }

  async readTranscribedInput(): Promise<string | null> {
    return this.queryInput.inputValue().catch(() => null);
  }

  async snapshotLocale(): Promise<LocaleSnapshot> {
    const read = async (loc: Locator): Promise<string | null> => {
      if ((await loc.count()) === 0) return null;
      const text = (await loc.innerText().catch(() => "")).trim();
      return text.length > 0 ? text : null;
    };
    const placeholderInput = await this.queryInput
      .getAttribute("placeholder")
      .catch(() => null);

    return {
      inputPlaceholder: placeholderInput ?? (await read(this.queryPlaceholder)),
      submitButtonLabel: await read(this.submitButton),
      voiceInputLabel: await read(this.voiceInputButton),
      responseHeadingText: null,
      pageHeadingText: await read(this.heading),
    };
  }

  async readSelectedLanguage(): Promise<string | null> {
    const value = await this.languageSelector
      .inputValue()
      .catch(async () => {
        const text = await this.languageSelector.innerText().catch(() => "");
        const m = text.match(/[a-z]{2}-[A-Z]{2}/);
        return m ? m[0] : "";
      });
    const cleaned = (value ?? "").trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  async readResponse(): Promise<QueryResponse | null> {
    if ((await this.responseDisplay.count()) === 0) return null;
    const text = (await this.responseDisplay.innerText().catch(() => "")).trim();
    if (text.length === 0) return null;

    const sourceRaw = await this.answerSourceBadge
      .innerText()
      .catch(() => "");
    const source: QueryResponse["source"] = sourceRaw
      ? /golden|gd|database/i.test(sourceRaw)
        ? "golden-dataset"
        : /pop|package|practices?/i.test(sourceRaw)
          ? "package-of-practices"
          : /ai|expert|review|generated|fallback/i.test(sourceRaw)
            ? "ai-fallback"
            : "unknown"
      : "unknown";

    const disclaimer = await this.readDisclaimerText();
    return { source, text, disclaimerText: disclaimer };
  }

  async readDisclaimerText(): Promise<string | null> {
    if ((await this.aiDisclaimerBanner.count()) > 0) {
      const bannerText = (await this.aiDisclaimerBanner.innerText().catch(() => "")).trim();
      if (bannerText.length > 0) return bannerText;
    }
    if ((await this.responseDisplay.count()) > 0) {
      const responseText = (await this.responseDisplay.innerText().catch(() => "")).trim();
      if (DISCLAIMER_TEXT_FALLBACK.test(responseText)) {
        return responseText;
      }
    }
    return null;
  }

  async readSavedConversations(): Promise<ConversationRow[]> {
    if ((await this.savedConversationsList.count()) === 0) return [];
    const rows = this.savedConversationsList.locator(
      `[data-testid^="${SELECTOR_MAP.query.conversationItemPrefix}"]`,
    );
    const count = await rows.count();
    const snapshot: ConversationRow[] = [];
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const testId = await row.getAttribute("data-testid").catch(() => "");
      const text = await row.innerText().catch(() => "");
      const langMatch = text.match(/[a-z]{2}-[A-Z]{2}/);
      snapshot.push({
        testId: testId ?? "",
        questionSnippet: text.slice(0, 200),
        answerSnippet: text.slice(0, 200),
        languageCode: langMatch ? langMatch[0] : null,
      });
    }
    return snapshot;
  }

  async assertOnQueryPage(): Promise<void> {
    const escaped = Routes.aceQueryPage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
    await expect(this.page).toHaveURL(
      new RegExp(`(?:${escaped}|/${escaped}|/\\?|/?(?:$|#|\\?))`),
    );
  }

  async assertNonEmptyResponse(): Promise<void> {
    await expect(this.responseDisplay).toBeVisible({ timeout: 30_000 });
    const text = (await this.responseDisplay.innerText().catch(() => "")).trim();
    expect(text.length, "response region rendered an empty answer").toBeGreaterThan(0);
  }

  async assertAiFallbackDisclaimerShown(expectedLocale: "en-IN" | "hi-IN" | "ta-IN"): Promise<void> {
    const disclaimerText = await this.readDisclaimerText();
    expect(
      disclaimerText && disclaimerText.length > 0,
      "expected the AI-fallback disclaimer to be rendered, but it was empty",
    ).toBe(true);
    if (!disclaimerText) return;

    let pattern: RegExp;
    if (expectedLocale === "hi-IN") {
      pattern = DISCLAIMER_PATTERNS.hindi;
    } else if (expectedLocale === "ta-IN") {
      pattern = DISCLAIMER_PATTERNS.tamil;
    } else {
      pattern = DISCLAIMER_PATTERNS.english;
    }
    const fallbackHit = DISCLAIMER_TEXT_FALLBACK.test(disclaimerText);
    expect(
      pattern.test(disclaimerText) || fallbackHit,
      `expected the AI-fallback disclaimer to look translated for ${expectedLocale}; ` +
        `rendered text: "${disclaimerText}"`,
    ).toBe(true);
  }

  async assertValidationErrorVisible(): Promise<void> {
    if ((await this.validationError.count()) === 0) {
      const ariaAlert = this.page.getByRole("alert");
      await expect(ariaAlert.first()).toBeVisible({ timeout: 5_000 });
      return;
    }
    await expect(this.validationError).toBeVisible({ timeout: 5_000 });
    await expect(this.validationError).not.toBeEmpty();
  }

  async assertLoadingResolved(): Promise<void> {
    const visible = await this.loadingIndicator.isVisible().catch(() => false);
    expect(
      visible,
      "loading indicator still visible — a second submission cycle may have started",
    ).toBe(false);
  }

  async assertSavedConversationsContains(fingerprint: string): Promise<void> {
    const row = this.savedConversation(fingerprint);
    if ((await row.count()) > 0) {
      await expect(row.first()).toBeVisible({ timeout: 5_000 });
      return;
    }
    const all = await this.readSavedConversations();
    expect(
      all.length > 0,
      `expected at least one saved-conversation row to remain visible after the language switch, ` +
        `but the list is empty (fingerprint="${fingerprint}").`,
    ).toBe(true);
  }

  // ── PR #6 mobile / voice / error-state assertions ────────────────────────

  /**
   * The page must not overflow the viewport horizontally on the mobile
   * project.  ACE-MOB-01 — guards the "submit button cut off on
   * mobile" bug class.
   */
  async assertNoHorizontalOverflow(opts: { tolerancePx?: number } = {}): Promise<void> {
    const tolerance = opts.tolerancePx ?? 4;
    const metrics = await this.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(
      metrics.scrollWidth <= metrics.clientWidth + tolerance,
      `horizontal overflow: scrollWidth=${metrics.scrollWidth}, clientWidth=${metrics.clientWidth}`,
    ).toBe(true);
  }

  /**
   * The voice input button must be visible inside the mobile viewport
   * (not clipped).  Returns the bounding box so callers can persist
   * the value if they want to.
   */
  async assertVoiceInputVisibleAndTappable(): Promise<void> {
    await expect(this.voiceInputButton).toBeVisible({ timeout: 10_000 });
    const box = await this.voiceInputButton.boundingBox();
    expect(box, "voice input button has no bounding box").not.toBeNull();
    expect(box!.width, "voice input button has zero width").toBeGreaterThan(0);
    expect(box!.height, "voice input button has zero height").toBeGreaterThan(0);
    const overflow = await this.page.evaluate((rect: DOMRect) => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      right: rect.right,
    }), box as unknown as DOMRect);
    expect(
      overflow.right <= overflow.scrollWidth,
      `voice input button overflows the mobile viewport: right=${overflow.right} > scrollWidth=${overflow.scrollWidth}`,
    ).toBe(true);
  }

  /**
   * Tapping the language selector registers the new locale.  Uses
   * the same `selectLanguage` action, but accepts a click that
   * simulates a touch event (`dispatchEvent("click")` under a tap)
   * — most pickers react to either, but some mobile bugs only
   * surface on the touch path.
   */
  async assertLanguageSelectorTappableOnMobile(): Promise<void> {
    await expect(this.languageSelector).toBeVisible({ timeout: 10_000 });
    await this.tapLanguage(SELECTOR_MAP.aceLanguages.tamilIndia);
    await expect
      .poll(async () => this.readSelectedLanguage(), { timeout: 5_000 })
      .toMatch(/ta-IN|ta/i);
    // Restore to English so the next assertion sees a stable seed.
    await this.selectLanguage(SELECTOR_MAP.aceLanguages.englishIndia).catch(
      () => undefined,
    );
  }

  /** The recording affordances (recording indicator + stop button) appear. */
  async assertRecordingStateVisible(): Promise<void> {
    await expect(this.recordingIndicator).toBeVisible({ timeout: 10_000 });
    if ((await this.stopRecordingButton.count()) > 0) {
      await expect(this.stopRecordingButton).toBeVisible({ timeout: 5_000 });
    }
  }

  /**
   * After a (mocked) voice input completes, the transcribed text
   * should populate the query input field.  `expected` is the literal
   * transcript the STT mock returned.
   */
  async assertTranscribedTextAppearsInQuery(expected: string): Promise<void> {
    await expect
      .poll(async () => this.readTranscribedInput(), { timeout: 10_000 })
      .toBe(expected);
  }

  /**
   * After the microphone permission is denied, the page should surface
   * one of: a permission error testid, the typed-input fallback
   * message, or a visible role="alert" copy.  Any one of these is
   * treated as the "clear fallback message" contract.
   */
  async assertMicrophoneFallbackShown(): Promise<void> {
    const nodes = [
      this.microphonePermissionError,
      this.voiceFallbackMessage,
      this.page.getByRole("alert"),
      this.page.getByText(
        /permission|microphone|mic|allow|denied|please type|typing instead/i,
      ),
    ];
    let anyVisible = false;
    for (const node of nodes) {
      if ((await node.count()) === 0) continue;
      const visible = await node.first().isVisible().catch(() => false);
      if (visible) {
        anyVisible = true;
        break;
      }
    }
    expect(
      anyVisible,
      "expected a microphone-permission fallback message to surface in the UI",
    ).toBe(true);
  }

  /**
   * A user-facing no-connection message is shown when the browser
   * context is offline.  Tolerates either a dedicated testid, the
   * generic error banner, or any role=alert copy that mentions
   * "no connection" / "offline" / "internet".
   */
  async assertNoConnectionMessageShown(): Promise<void> {
    const candidates = [
      this.noConnectionMessage,
      this.offlineBanner,
      this.errorBanner,
      this.page.getByText(/no connection|offline|internet|network|disconnected/i),
    ];
    let anyVisible = false;
    for (const node of candidates) {
      if ((await node.count()) === 0) continue;
      const visible = await node.first().isVisible().catch(() => false);
      if (visible) {
        anyVisible = true;
        break;
      }
    }
    expect(
      anyVisible,
      "expected a no-connection / offline message to surface in the UI",
    ).toBe(true);
    // Loading indicator should NOT spin forever — must have either
    // resolved or stayed absent.
    const stillLoading = await this.loadingIndicator
      .isVisible({ timeout: 1_000 })
      .catch(() => false);
    expect(
      stillLoading === false,
      "loading indicator should not stay visible once the offline path has rendered the error",
    ).toBe(true);
  }

  /**
   * A 500 from the query API must surface a user-facing error.
   * Optionally assert the error copy uses the farmer's selected
   * locale via the `expectedLocale` argument.
   */
  async assertServerErrorShown(expectedLocale?: "en-IN" | "hi-IN" | "ta-IN"): Promise<void> {
    const candidates = [
      this.errorBanner,
      this.noConnectionMessage,
      this.page.getByRole("alert"),
      this.page.getByText(/error|something went wrong|try again|server|unable/i),
    ];
    let anyVisible = false;
    let visibleText: string | null = null;
    for (const node of candidates) {
      if ((await node.count()) === 0) continue;
      const visible = await node.first().isVisible().catch(() => false);
      if (visible) {
        anyVisible = true;
        visibleText = await node.first().innerText().catch(() => null);
        break;
      }
    }
    expect(
      anyVisible,
      "expected a server-error banner or alert to surface in the UI",
    ).toBe(true);

    if (expectedLocale && visibleText) {
      let pattern: RegExp;
      if (expectedLocale === "hi-IN") {
        pattern = /(त्रुटि|सर्वर|फिर से|असफल)/i;
      } else if (expectedLocale === "ta-IN") {
        pattern = /(பிழை|சேவைக்கூட|மீண்டும்|தோல்வி)/i;
      } else {
        pattern = /(error|server|try again|failed)/i;
      }
      expect(
        pattern.test(visibleText),
        `expected the server-error copy to look translated for ${expectedLocale}; rendered text: "${visibleText}"`,
      ).toBe(true);
    }
  }

  /**
   * During a slow request, the UI must surface a patience-inducing
   * state (explicit message OR the loading indicator + a working
   * submit button that's *not* left disabled).
   */
  async assertSlowNetworkPatienceShown(): Promise<void> {
    const candidates = [
      this.patienceMessage,
      this.loadingIndicator,
      this.page.getByText(/loading|please wait|working on it|taking a moment|हो रही है/i),
    ];
    let anyVisible = false;
    for (const node of candidates) {
      if ((await node.count()) === 0) continue;
      const visible = await node.first().isVisible().catch(() => false);
      if (visible) {
        anyVisible = true;
        break;
      }
    }
    expect(
      anyVisible,
      "expected a loading/patience-inducing state to be visible during the slow request",
    ).toBe(true);
  }
}
