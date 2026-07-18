/**
 * SELECTOR_MAP — ACE farmer web app
 *
 * One source of truth for every `data-testid` and route the ACE farmer
 * app page objects reference.  When the staging DOM uses something
 * different, edit it here — the page-object files pick up the change
 * automatically.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Why centralise?
 * ─────────────────────────────────────────────────────────────────────────────
 *  • One place to grep when the frontend team renames a testid.
 *  • The ACE farmer-facing frontend is intentionally an isolated
 *    surface from the Reviewer System (different stakeholder, locale
 *    set, and accessibility budget), so its selectors live here rather
 *    than in `tests/reviewer-system/page-objects/selector-map.ts`.
 *  • Tests fail loudly with a "0 matches" message if the testid is
 *    wrong, so a wrong entry here surfaces in CI within seconds.
 *
 *  Anything marked `// TODO(selector)` in the page objects resolves
 *  through this map.  Once staging confirms a real selector, replace
 *  the placeholder value here and every test using it is updated.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const Routes = {
  /**
   * The farmer's query-page entry route.  The frontend may mount the
   * `QueryPage` component at "/" (common for SPAs that begin at the
   * chat surface) or at a dedicated `/ask` route.  Both are accepted;
   * {@link QueryPage.assertOnQueryPage} tolerates either in the regex.
   */
  aceQueryPage: "/ask",
  aceHome: "/",
  aceHistory: "/history",
} as const;

export const SELECTOR_MAP = {
  /**
   * Locales ACE supports (Sarvam AI translation + backend ground-truth
   * rendering).  Kept here as a *closed* set so tests assert against
   * the same named codes the i18n catalog uses.
   */
  aceLanguages: {
    englishIndia: "en-IN",
    hindiIndia: "hi-IN",
    tamilIndia: "ta-IN",
    bengaliIndia: "bn-IN",
    marathiIndia: "mr-IN",
    teluguIndia: "te-IN",
    gujaratiIndia: "gu-IN",
    kannadaIndia: "kn-IN",
    malayalamIndia: "ml-IN",
    punjabiIndia: "pa-IN",
  } as const,

  /**
   * Locator handles for the farmer-facing query page.  Every entry is
   * marked `// TODO(selector)` until the staging DOM is confirmed.
   */
  query: {
    heading: "ace-query-heading", // TODO(selector)
    queryInput: "ace-query-input", // TODO(selector)
    submitButton: "ace-submit-query", // TODO(selector)
    voiceInputButton: "ace-voice-input", // TODO(selector)
    responseDisplay: "ace-query-response", // TODO(selector)
    languageSelector: "ace-language-selector", // TODO(selector)
    aiDisclaimerBanner: "ace-ai-disclaimer-banner", // TODO(selector)
    validationError: "ace-query-validation-error", // TODO(selector)
    savedConversationsList: "ace-saved-conversations", // TODO(selector)
    conversationItemPrefix: "ace-conversation-", // rows: ace-conversation-${id}
    loadingIndicator: "ace-query-loading", // TODO(selector)
    offlineBanner: "ace-offline-banner", // TODO(selector)
    errorBanner: "ace-query-error-banner", // TODO(selector)
    queryPlaceholder: "ace-query-placeholder", // TODO(selector)
    voiceConsentDialog: "ace-voice-consent-dialog", // TODO(selector)
    errorRetry: "ace-query-error-retry", // TODO(selector)
    answerSourceBadge: "ace-query-answer-source", // TODO(selector)
  },
} as const;

export type SelectorMap = typeof SELECTOR_MAP;
export type AceLanguageCode =
  (typeof SELECTOR_MAP.aceLanguages)[keyof typeof SELECTOR_MAP.aceLanguages];

/**
 * Regex that matches the AI fallback "expert review within ~2 hours"
 * disclaimer across locales.  The English copy stays the source of
 * truth (the canonical text the test expects); Hindi/Tamil renderings
 * are accepted via fallback patterns observed on similar advisory
 * flows.
 */
export const DISCLAIMER_PATTERNS = {
  english: /(within|about|approx\.?|approximately)?\s*2\s*(to\s*4\s*)?(hours?|hrs?)\b.*(expert|review|verified)|(expert|verified).*within\s*\d+\s*(hours?|hrs?)/i,
  /** Matches the canonical Devanagari "2 घंटे" form (हिन्दी). */
  hindi: /(२|2|दो)\s*घंटे|विशेषज्ञ\s*समीक्षा|समीक्षा\s*होगी|विशेषज्ञ\s*द्वारा/i,
  /** Matches the Tamil "2 மணி நேரம்" form. */
  tamil: /(2|இரண்டு)\s*மணி\s*நேரம்|நிபுணர்\s*பரிசீலனை/i,
} as const;

/**
 * Falls back to a content-match when the dedicated
 * `data-testid` is absent (some mobile shells render the disclaimer
 * inside a single chat bubble without a separate banner).  The regex
 * is intentionally loose — it matches the canonical English/Hindi/
 * Tamil forms but does NOT require the exact devanagiri or tamil
 * glyphs (translation copy may shift between Sarvam versions).
 */
export const DISCLAIMER_TEXT_FALLBACK = /(?:within|about|approx\.?|approximately)?\s*(?:2|two|२|दो|இரண்டு)\s*(?:to\s*4\s*)?(?:hours?|hrs?|घंटे|மணி\s*நேரம்)|(?:expert|verified|विशेषज्ञ|நிபுணர்)\s*(?:review|verified|समीक्षा|பரிசீலனை)/i;