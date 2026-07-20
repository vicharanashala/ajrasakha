# ACE farmer web app — E2E test suite

Playwright + TypeScript coverage for the farmer-facing **ACE Web App**
— the chat-shell interface farmers use to type (or speak) a question
and receive an advisory answer.

This is a **second Playwright suite** alongside the existing
`tests/reviewer-system/` and `tests/web-app/` directories.  ACE is a
different app surface (different stakeholder, locale catalog, and
accessibility budget) so it gets its own baseURL, its own fixtures,
and its own project entries in `playwright.config.ts`.

## Why a dedicated folder?

The ACE app supports a **three-tier answer flow** — Golden Dataset
match → Package-of-Practices match → AI-model fallback — and ships
to a mobile-first audience that switches between **22 Indic
languages** via the Sarvam AI API.  The reviewer system and the
ajrasakha.in marketing surfaces are out of scope here; merging them
into a single suite would force the page objects to share selectors
they don't actually share, and would block mobile-only assertions
behind a desktop-only CI gate.

A separate `tests/ace-web-app/` folder keeps each role's regression
signal in its own trace.

## Folder map

```
ace-web-app/
├── README.md                                [this file]
├── core-query-flow/                         [PR #5]
│   └── core-query-flow.spec.ts              [7 tests: ACE-QRY-01..07]
├── mobile-voice-errors/                     [PR #6]
│   └── mobile-voice-errors.spec.ts          [15 tests: ACE-MOB-01..04,
│                                              ACE-VOI-01..05, ACE-ERR-01..06]
├── fixtures/                                [per-system Playwright fixtures]
│   ├── ace-fixtures.ts                      [QueryPage + auto low-end
│                                              throttle for mobile project]
│   ├── ace-mock-helpers.ts                  [NEW in PR #6 — microphone /
│                                              STT / 500 / slow / offline /
│                                              throttle helpers]
│   └── index.ts                             [barrel re-export]
└── page-objects/                            [Page Object Model]
    ├── QueryPage.ts                         [QueryPage]
    ├── selector-map.ts                      [SELECTOR_MAP + Routes + language codes]
    └── index.ts                             [barrel re-export]
```

## Running locally

```bash
cd qa
cp .env.example .env && $EDITOR .env        # fill in ACE_STAGING_URL (+ others)
npm ci
npx playwright install --with-deps chromium

# Desktop viewport (en-IN default), core flows only
npm run test:ace

# Watch the run
npm run test:ace:headed

# Mobile / Pixel 5 viewport (hi-IN default)
npm run test:ace:mobile

# Both projects in one shot
npm run test:ace:all

# Open the HTML report after a run
npm run test:ace:report
```

The whole suite (`npm test`) runs reviewer + web-app + ACE in
parallel; the project filter is `npx playwright test --project=desktop-chromium`.

## Conventions

- **One behaviour per `test()`** — never multi-assert; reviewers read
  these as documentation.
- **`test.step()` for multi-action tests** — readable CI output.
- **`test.skip()` for missing staging data** — never hard-fail the
  suite on shared-test-data variance.  ACE-QRY-03 and ACE-ERR-02
  both soft-skip when staging happens to return the alternative
  branch.
- **Centralised selectors** in `page-objects/selector-map.ts` — swap a
  `data-testid` once, every test using it is updated.
- **No invented selectors** — every locator resolves through
  `SELECTOR_MAP.query`, flagged `// TODO(selector)` until staging
  confirms the real DOM attribute.
- **Mock helpers live in fixtures**, not in spec files — keep the
  test bodies action-focused.

## Env contract

| Variable | Used by |
|----------|---------|
| `ACE_STAGING_URL` (or `ACE_BASE_URL`) | every `tests/ace-web-app` test |
| `ACE_DEFAULT_LANGUAGE` | default source language for AI fallback tests (defaults to `hi-IN`) |
| `ACE_ENGLISH_LANGUAGE` | target language used by language-switch tests (defaults to `en-IN`) |

The loader prefers the canonical `ACE_STAGING_URL` and falls back to
`ACE_BASE_URL` so a secret rotation is a zero-downtime move.

## PR map

| PR | Scope | Tests added (cumulative) |
|----|-------|--------------------------|
| #5 | Scaffolding + core query submission + language flows | 7 |
| **#6** | **Mobile viewport + voice input + error states + CI** | **15** (cumulative: **22**) |
| #7 (planned) | a11y / full 22-language catalog / additional mobile | 30+ |

### Landed in PR #5

| ID | File | Behaviour |
|----|------|-----------|
| ACE-QRY-01 | `core-query-flow/core-query-flow.spec.ts` | Hindi typed query returns a non-empty response and the loading cycle resolves. |
| ACE-QRY-02 | `core-query-flow/core-query-flow.spec.ts` | English typed query returns a non-empty response. |
| ACE-QRY-03 | `core-query-flow/core-query-flow.spec.ts` | Unmatched query triggers the AI fallback AND the 2-hour disclaimer renders in the farmer's currently-selected locale (asserted for both English and Hindi). |
| ACE-QRY-04 | `core-query-flow/core-query-flow.spec.ts` | Submitting an empty query is blocked by a visible validation message — not silently sent upstream. |
| ACE-QRY-05 | `core-query-flow/core-query-flow.spec.ts` | Language switching mid-session updates UI copy without a full document reload. |
| ACE-QRY-06 | `core-query-flow/core-query-flow.spec.ts` | Saved conversations remain visible after a language switch. |
| ACE-QRY-07 | `core-query-flow/core-query-flow.spec.ts` | Double-submit guard: clicking submit twice in quick succession yields a single loading → response cycle, no duplicate UI state. |

### Landed in PR #6

| ID | File | Behaviour |
|----|------|-----------|
| ACE-MOB-01 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Mobile query submission end-to-end without horizontal overflow. |
| ACE-MOB-02 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Language selector usable on mobile via the tap-and-select path. |
| ACE-MOB-03 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Voice input button visible + tappable on mobile without clipping. |
| ACE-MOB-04 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Soft keyboard does not obscure the submit button on mobile. |
| ACE-VOI-01 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Tapping voice input requests microphone permission and shows the recording UI state. |
| ACE-VOI-02 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Mocked voice transcription populates the query input before submission. |
| ACE-VOI-03 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Denying the microphone permission shows the typed-input fallback message. |
| ACE-VOI-04 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | STT service returns the transcript in the farmer's currently-selected locale. |
| ACE-VOI-05 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | A completed recording exposes a stop / finalize control. |
| ACE-ERR-01 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Offline surface shows a clear no-connection message rather than an infinite spinner. |
| ACE-ERR-02 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | A 500 from the query API surfaces a user-facing error in the farmer's selected locale. |
| ACE-ERR-03 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Mobile-specific re-check of empty-query submit (mobile form validation UI divergence). |
| ACE-ERR-04 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Slow network surfaces a patience-inducing state rather than a frozen UI. |
| ACE-ERR-05 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | A 4xx (validation) from the query API surfaces a non-fatal error banner. |
| ACE-ERR-06 | `mobile-voice-errors/mobile-voice-errors.spec.ts` | Returning from offline → online recovers the submission path (no infinite spinner left behind). |

`npm run verify` confirms `reviewer-system=31/31 ✅  web-app=7/7 ✅  ace-web-app=22/22 ✅`
on a clean run.
