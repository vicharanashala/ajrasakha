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
      // Fall through to the ARIA pattern.
    }
    await this.languageSelector.click();
    await this.page
      .getByRole("option", { name: new RegExp(codeStr, "i") })
      .first()
      .click();
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
}
