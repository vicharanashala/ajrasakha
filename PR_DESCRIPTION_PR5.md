# PR #5 — ACE farmer web app: scaffolding + core query submission + language flows

## 📌 Title

```
test(ace-web-app): add Playwright scaffolding + core query submission and language-switching E2E tests
```

---

## 🚀 One-line summary

> **Adds a second Playwright suite for the farmer-facing ACE Web App
> (`tests/ace-web-app/`) — desktop + Pixel 5 viewport projects driven
> from a dedicated `ACE_STAGING_URL` knob — and ships 7 atomic tests
> covering Hindi/English submission, the AI-fallback 2-hour
> disclaimer rendered in the farmer's locale, the empty-query guard,
> language switching without a page reload, saved-conversations
> preservation across the locale switch, and the double-submit
> guard.**

`npm run verify` after this PR lands reports
`reviewer-system=31/31 ✅  web-app=7/7 ✅  ace-web-app=7/7 ✅`.

> Note: this is the **first of two PRs** for the ACE farmer app.  This
> PR (PR #5) scopes core query submission + language switching;
> **PR #6 (planned, not in this branch)** adds mobile-viewport-only
> flows, voice-input consent + speech-to-text assertions, and a
> dedicated error-state / network-down spec.
>
> Reviewer System coverage is tracked in PR #1–#4 (current branch
> parity: 31 atomic tests); the two surfaces share the
> `tests/helpers/test-config.ts` loader and `qa/scripts/verify.mjs`
> test-floor gate but have separate Playwright projects and separate
> fixture files.

---

## 🎯 Why this PR

The ACE farmer app — the chat-shell interface farmers use to type (or
speak) a question and receive an advisory answer — has **no automated
coverage** today.  The two surfaces that *are* tested (the reviewer
system, the marketing web-app) cover orthogonal concerns and would
either force the page objects to share selectors they don't actually
share, or hide the mobile-first nature of ACE behind a desktop-only CI
gate.

Two concrete classes of bug this PR prevents:

1. **The 2-hour disclaimer ships in English only.** When the AI
   fallback fires (no Golden Dataset / Package-of-Practices match),
   the user-facing advisory text must be rendered in the farmer's
   selected locale — Hindi when the picker is on `hi-IN`, Tamil when
   `ta-IN`.  Staging can regress this to a hard-coded English string
   and no CI guard would catch it without `ACE-QRY-03`.

2. **Switching language wipes the saved-conversations list.** A real
   bug class on locale-driven SPAs — the picker triggers a full
   reload that re-mounts the chat shell before the history slice has
   hydrated.  `ACE-QRY-06` guards against this regression.

Plus the dedicated mobile project (`ace-web-app-mobile` on Pixel 5
with `hi-IN` locale) keeps the mobile-first surface on its own CI
rail, parallel to the `reviewer-mobile` project that PR #1 added.

---

## ✨ What's in this PR

### A. New E2E coverage — `tests/ace-web-app/core-query-flow/core-query-flow.spec.ts`

| # | ID | Behaviour |
|---|----|-----------|
| 1 | ACE-QRY-01 | Hindi typed query returns a non-empty response and the loading cycle resolves within 30 s; no error banner is shown. |
| 2 | ACE-QRY-02 | English typed query returns a non-empty response; soft-tolerates a present disclaimer (GD/PoP may have matched). |
| 3 | ACE-QRY-03 | Unmatched query triggers the AI fallback AND the 2-hour disclaimer renders in the farmer's currently-selected locale (asserted for both English and Hindi via a deliberate mid-test locale switch). |
| 4 | ACE-QRY-04 | Submitting an empty query is blocked by a visible validation message — not silently ignored, not silently dispatched (network assertion: any fired request must be 4xx). |
| 5 | ACE-QRY-05 | Language switching mid-session updates UI copy **without** a full document reload (verified via the `page.on("load")` count). |
| 6 | ACE-QRY-06 | A previously submitted query/response pair remains visible in the saved-conversations list after the locale switch. |
| 7 | ACE-QRY-07 | Double-submit guard: clicking submit twice in quick succession yields a single loading → response cycle, ≤ 1 response-display node, no error banner, loading indicator resolved. |

### B. New page object — `tests/ace-web-app/page-objects/QueryPage.ts`

Mirrors the existing Page Object Model conventions
(`QuestionQueuePage`, `AnalyticsPage`):

* `goto()` — accepts `/ask` and falls back to `/` (some frontends
  mount the chat shell at the home route).
* `submitAndWaitForResponse({ text, timeoutMs })` — pre-arms a
  `waitForResponse` listener for the AI/Q&A pipeline and resolves on
  whichever of `loadingIndicator` / `responseDisplay` /
  `aiDisclaimerBanner` becomes visible first.  Returns both the
  rendered `QueryResponse` snapshot and the network response.
* `doubleSubmit(text)` — the canonical "click submit twice in
  immediate succession" helper used by `ACE-QRY-07`.
* `selectLanguage(code)` — `<select>` first, ARIA-option fallback for
  custom listboxes.
* `snapshotLocale()` — returns the placeholder / button-label /
  page-heading text so language-switch assertions don't have to
  hard-code the i18n catalog at the E2E layer.
* `readSelectedLanguage()` / `readResponse()` /
  `readSavedConversations()` / `readDisclaimerText()` — pure
  read helpers, no side effects.
* `assertOnQueryPage()` / `assertNonEmptyResponse()` /
  `assertAiFallbackDisclaimerShown(locale)` /
  `assertValidationErrorVisible()` / `assertLoadingResolved()` /
  `assertSavedConversationsContains(fingerprint)` — single-call
  contract assertions used by every spec test.

### C. Selector + fixture plumbing

* `tests/ace-web-app/page-objects/selector-map.ts` — `Routes`,
  `SELECTOR_MAP.query`, `SELECTOR_MAP.aceLanguages`, plus the
  `DISCLAIMER_PATTERNS` regex set (`english` / `hindi` / `tamil`)
  and `DISCLAIMER_TEXT_FALLBACK` for staging shells that render the
  disclaimer inside a single chat bubble without a dedicated banner.
* `tests/ace-web-app/fixtures/ace-fixtures.ts` — per-system fixture
  (extends `base` Playwright with the `queryPage` handle), plus a
  `throttleAsLowEnd(page)` helper that attaches a CDP session and
  applies 4× CPU throttling + Slow 3G for the mobile project.
  `aceStagingAvailable()` is the canonical CI gate used by
  `skipWithoutStagingUrl()` in the spec.
* `tests/ace-web-app/page-objects/index.ts` and
  `tests/ace-web-app/fixtures/index.ts` — barrel re-exports so
  spec imports stay short.
* `tests/helpers/test-config.ts` — adds the `ace` section
  (`baseURL`, `defaultLanguage`, `englishLanguage`); the loader
  prefers `ACE_STAGING_URL` and falls back to `ACE_BASE_URL` so a
  secret rotation is a zero-downtime move.

### D. Playwright config — `qa/playwright.config.ts`

Two new projects:

| Project | Viewport | Locale | Notes |
|---------|----------|--------|-------|
| `ace-web-app` | Desktop Chrome | `en-IN` | Primary project.  Base URL from `ACE_STAGING_URL`. |
| `ace-web-app-mobile` | Pixel 5 | `hi-IN` | Mobile-first surface regression.  Tests share the same spec file but the project filter selects the viewport. |

Both projects soft-skip when `ACE_STAGING_URL` is missing (the
`testMatch` is overridden to a never-matches path) so a missing
secret doesn't red-CI the PR — the suite is designed to land even
before the ACE staging env is provisioned.

### E. Test-count floor — `qa/scripts/verify.mjs`

Floor bumped to include `ace-web-app` at `≥ 7`.  The verifier now
reports `reviewer-system=31/31 ✅  web-app=7/7 ✅  ace-web-app=7/7 ✅`
on a clean run.

### F. Env + scripts — `qa/.env.example`, `qa/package.json`

* `ACE_STAGING_URL` documented with the `ACE_BASE_URL` alias and the
  optional `ACE_DEFAULT_LANGUAGE` / `ACE_ENGLISH_LANGUAGE` overrides.
* New scripts: `npm run test:ace`, `test:ace:headed`,
  `test:ace:mobile`, `test:ace:report`.

### G. Suite README — `qa/tests/ace-web-app/README.md`

Folder map, run commands, conventions, env contract, and the
landed-in-PR-#5 test table — mirrors the `tests/reviewer-system/README.md`
shape so a developer can read either side without context-switching.

---

## 🔍 Selectors — TODO contract (same convention as PR #1 / #4)

PR #5 adds new selectors in the same TODO convention as the existing
suites.  Every locator resolves through
`SELECTOR_MAP.query`.  Swap a testid once, every test using it
updates.

```ts
// tests/ace-web-app/page-objects/selector-map.ts
SELECTOR_MAP.query = {
  heading: "ace-query-heading",                         // TODO(selector)
  queryInput: "ace-query-input",                         // TODO(selector)
  submitButton: "ace-submit-query",                      // TODO(selector)
  voiceInputButton: "ace-voice-input",                   // TODO(selector)
  responseDisplay: "ace-query-response",                 // TODO(selector)
  languageSelector: "ace-language-selector",             // TODO(selector)
  aiDisclaimerBanner: "ace-ai-disclaimer-banner",        // TODO(selector)
  validationError: "ace-query-validation-error",         // TODO(selector)
  savedConversationsList: "ace-saved-conversations",     // TODO(selector)
  conversationItemPrefix: "ace-conversation-",           // rows: ace-conversation-${id}
  loadingIndicator: "ace-query-loading",                 // TODO(selector)
  offlineBanner: "ace-offline-banner",                   // TODO(selector)
  errorBanner: "ace-query-error-banner",                 // TODO(selector)
  queryPlaceholder: "ace-query-placeholder",              // TODO(selector)
  voiceConsentDialog: "ace-voice-consent-dialog",         // TODO(selector)
  errorRetry: "ace-query-error-retry",                   // TODO(selector)
  answerSourceBadge: "ace-query-answer-source",          // TODO(selector)
}

SELECTOR_MAP.aceLanguages = {
  englishIndia: "en-IN",
  hindiIndia: "hi-IN",
  tamilIndia: "ta-IN",
  // ...10 Indic locales total
} as const
```

Once staging is confirmed, replace the placeholder values in
`selector-map.ts` and remove the `// TODO(selector)` markers.

---

## 🧪 How to run

```bash
cd qa
cp .env.example .env && $EDITOR .env           # fill in ACE_STAGING_URL
npm ci
npx playwright install --with-deps chromium

npm run test:ace                                  # desktop, en-IN default
npm run test:ace:mobile                           # Pixel 5, hi-IN default
npm run test:ace -- core-query-flow/             # just PR #5 tests
npm run verify                                    # CI gate (floor check)
```

When `ACE_STAGING_URL` isn't set, `npm run test:ace` exits 0 with 0
selected tests (the project's `testMatch` is overridden).  This
matches the PR #1 reviewer-system behaviour and keeps the suite
land-able before staging is provisioned.

---

## 🔐 Required GitHub Secrets

For the new `ace-web-app*` projects to actually run against staging,
the following secret must exist (Settings → Secrets → Actions):

| Secret | Used by |
|--------|---------|
| `ACE_STAGING_URL` | every `tests/ace-web-app` test |

The legacy `ACE_BASE_URL` alias is accepted via the loader in
`tests/helpers/test-config.ts` so an existing secrets store keeps
working without a rotation.

> **No secrets are hardcoded in this PR.** Verified by
> `grep -RE 'ACE_(STAGING|BASE).*=' .github qa/` — every match
> resolves through `process.env`.

---

## 📁 File tree (this PR)

```
qa/
├── .env.example                                   [MODIFIED — adds ACE_STAGING_URL]
├── package.json                                   [MODIFIED — adds test:ace scripts]
├── playwright.config.ts                           [MODIFIED — adds ace-web-app + ace-web-app-mobile projects]
├── scripts/
│   └── verify.mjs                                 [MODIFIED — floor bump adds ace-web-app ≥ 7]
└── tests/
    ├── ace-web-app/                               [NEW — second Playwright suite]
    │   ├── README.md                              [NEW]
    │   ├── core-query-flow/
    │   │   └── core-query-flow.spec.ts            [NEW — 7 tests, ACE-QRY-01..07]
    │   ├── fixtures/
    │   │   ├── ace-fixtures.ts                    [NEW — QueryPage + throttle helper]
    │   │   └── index.ts                           [NEW — barrel re-export]
    │   └── page-objects/
    │       ├── QueryPage.ts                       [NEW]
    │       ├── selector-map.ts                    [NEW]
    │       └── index.ts                           [NEW — barrel re-export]
    └── helpers/
        └── test-config.ts                         [MODIFIED — adds ace section]

PR_DESCRIPTION_PR5.md                              [NEW — this file]
```

Files **outside** the above are untouched.

---

## ✅ Acceptance criteria

- [x] `npm run verify` reports `ace-web-app=7/7 ✅` (alongside the
      existing reviewer-system and web-app floors)
- [x] `npx tsc --noEmit` exits clean (no new errors)
- [x] `npx eslint "tests/**/*.ts" "scripts/**/*.mjs"` exits clean
- [x] No invented selectors — every locator resolves through
      `SELECTOR_MAP.query` with a `// TODO(selector)` marker until
      staging confirms
- [x] No hardcoded URLs or credentials in the test fixtures
- [x] Two Playwright projects added (`ace-web-app` + `ace-web-app-mobile`)
      with the appropriate locales (`en-IN` / `hi-IN`) and timezones
      (`Asia/Kolkata`)
- [x] Both projects soft-skip cleanly when `ACE_STAGING_URL` isn't set
- [x] Existing 31 reviewer-system tests continue to be counted correctly
- [x] Existing 7 web-app tests continue to pass (no regression)

---

## 🔭 What's next (PR #6 — not in this branch)

The follow-up PR (already scoped in `tests/ace-web-app/README.md`)
adds the mobile-first / voice-input / error-state coverage:

* `ACE-MOB-01` — Mobile viewport renders the input + voice button +
  language picker on a single screen at 360 px width.
* `ACE-VOI-01` — Voice-input button opens the consent dialog and the
  speech-to-text path is wired (mic permission gated to a fake
  media stream via the `throttleAsLowEnd` helper).
* `ACE-NET-01` — Network drop surfaces the offline banner and the
  retry control.
* `ACE-ERR-01` — AI-upstream 5xx surfaces the error banner with the
  retry control enabled.
* `ACE-A11Y-01` — The query page exposes a meaningful `<title>` /
  `<h1>` and every interactive element has an accessible name.

The mobile / voice / error paths are **deliberately out of scope**
for PR #5 — they need dedicated selector / DOM contract work that
should land with the frontend team so the `// TODO(selector)`
markers can resolve in a single follow-up.

---

/cc @platform-team @qa-team @frontend-team