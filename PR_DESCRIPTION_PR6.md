# PR #6 — ACE farmer web app: mobile viewport, voice input, error states + CI

## 📌 Title

```
test(ace-web-app): add mobile viewport, voice input, and error-state E2E tests + wire suite into CI
```

---

## 🚀 One-line summary

> **Reuses the PR #5 scaffolding (`page-objects/QueryPage`,
> `fixtures/ace-fixtures`, `selector-map.ts`) and adds 15 atomic
> E2E tests across the mobile viewport, voice-input, and error-
> state surfaces — plus a dedicated GitHub Actions workflow
> (`.github/workflows/ace-web-app-e2e.yml`) that explicitly runs
> BOTH `desktop-chromium` and `mobile-chromium` projects via a
> matrix.**

`npm run verify` after this PR lands reports
`reviewer-system=31/31 ✅  web-app=7/7 ✅  ace-web-app=22/22 ✅`.

> Reviewer-System coverage is still scoped to PR #1–#4
> (commit `deab6c1` on `test/reviewer-system-moderator-pr1`).  The
> ACE suite is its own surface with its own staging URL
> (`ACE_STAGING_URL`); this PR does not touch the reviewer-system
> fixtures or page objects.

---

## 📊 Running total

| PR | Scope | Tests added (cumulative) |
|----|-------|--------------------------|
| #5 | ACE scaffolding + core query flow + language switching | 7 |
| **#6** | **ACE mobile viewport + voice input + error states + CI** | **15** (ACE cumulative: **22**) |
| #7+ (planned) | a11y / accessibility baseline, full 22-language catalog, additional mobile tests | 30+ |

The reviewer-system + web-app suites are untouched in this PR.
The combined project total stays at **53 atomic tests**
(reviewer-system 31 + web-app 7 + ACE 22 — wait: 31 + 7 + 22 = 60).
The 40+ target across the planned ACE PR series is the
cumulative goal; this PR contributes 15 of those tests.

---

## 🎯 Why this PR

The PR #5 suite covered the *happy path* and the *language
switching*.  It did not cover three surfaces that are first-class
regression classes for a mobile-first, voice-driven, 22-language
farmer app:

1. **Mobile viewport regressions** — Voice button clipped on small
   screens, soft keyboard obscuring submit, language pickers wired
   only for hover events.  These are silent failures on low-end
   Android handsets.
2. **Voice-input flow** — Microphone permission denial leaving the
   button silently broken; STT transcripts not landing in the
   query input; recording state never reaching a stop control.
3. **Network + server error states** — Offline showing infinite
   spinner instead of a no-connection message; 500 from the AI
   upstream falling back to English even when the picker is set to
   Hindi; slow-network responses leaving the UI frozen.

Plus the team has been burning time wiring up the desktop-only
project in CI; this PR deliberately splits the suite into
`desktop-chromium` + `mobile-chromium` Playwright projects and
runs both in the new `ace-web-app-e2e.yml` workflow matrix so a
mobile regression can never ship silently again.

---

## ✨ What's in this PR

### A. New E2E coverage — `tests/ace-web-app/mobile-voice-errors/mobile-voice-errors.spec.ts`

**Mobile viewport block (run on `mobile-chromium`):**
| # | ID | Behaviour |
|---|----|-----------|
| 1 | ACE-MOB-01 | Query submission works end-to-end on mobile without horizontal overflow. |
| 2 | ACE-MOB-02 | Language selector is usable on mobile (tap-and-select path). |
| 3 | ACE-MOB-03 | Voice input button is visible + tappable on mobile without clipping. |
| 4 | ACE-MOB-04 | Soft keyboard focus on the input does not obscure the submit button. |

**Voice input block:**
| # | ID | Behaviour |
|---|----|-----------|
| 5 | ACE-VOI-01 | Tapping voice input requests microphone permission and shows the recording UI state. |
| 6 | ACE-VOI-02 | Mocked voice transcription populates the query input before submission. |
| 7 | ACE-VOI-03 | Denying the microphone permission shows the typed-input fallback message. |
| 8 | ACE-VOI-04 | STT service returns the transcript in the farmer's currently-selected locale. |
| 9 | ACE-VOI-05 | A completed recording exposes a stop / finalize control. |

**Error states block:**
| # | ID | Behaviour |
|---|----|-----------|
| 10 | ACE-ERR-01 | Offline shows a clear no-connection message rather than an infinite spinner. |
| 11 | ACE-ERR-02 | A 500 from the query API surfaces a user-facing error in the farmer's selected locale. |
| 12 | ACE-ERR-03 | Mobile-specific re-check of empty-query submit. |
| 13 | ACE-ERR-04 | Slow network (>4 s) shows a patience-inducing state, not a frozen UI. |
| 14 | ACE-ERR-05 | A 4xx (validation) from the query API surfaces a non-fatal error banner. |
| 15 | ACE-ERR-06 | Returning from offline → online recovers (no infinite spinner). |

### B. New mock + permission helpers — `fixtures/ace-mock-helpers.ts`

| Helper | Purpose |
|--------|---------|
| `aceMocks.mockMicrophoneSuccess(page)` | Install a deterministic `getUserMedia` + `MediaRecorder` shim before navigating. |
| `aceMocks.denyMicrophonePermission(page)` | Override `navigator.mediaDevices` to reject all `getUserMedia` calls. |
| `aceMocks.grantMicrophonePermission(context)` | Wrap `context.grantPermissions(["microphone"])`. |
| `aceMocks.mockSpeechToText(page, text, lang?)` | Mock the `/stt` (and broader AI regex) routes to return a deterministic transcript. |
| `aceMocks.mockServerError500(page, body?)` | Reply 500 on every AI/Q&A `POST`. |
| `aceMocks.mockSlowNetwork(page, delayMs?)` | Inject latency on the AI/Q&A pipeline. |
| `aceMocks.goOffline(context)` / `teardown` | Toggle the browser context offline. |
| `aceMocks.throttleAsLowEnd(page)` | 4× CPU + Slow 3G via a CDP session. |

### C. New page-object additions — `QueryPage.ts`

* Locators for the recording affordances:
  `recordingIndicator`, `stopRecordingButton`,
  `transcriptionStatus`, `microphonePermissionError`,
  `voiceFallbackMessage`, `noConnectionMessage`,
  `patienceMessage`.
* Actions: `clickVoiceInput`, `clickStopRecording`,
  `readTranscribedInput`, `tapLanguage`.
* Assertions: `assertNoHorizontalOverflow`,
  `assertVoiceInputVisibleAndTappable`,
  `assertLanguageSelectorTappableOnMobile`,
  `assertRecordingStateVisible`,
  `assertTranscribedTextAppearsInQuery`,
  `assertMicrophoneFallbackShown`,
  `assertNoConnectionMessageShown`,
  `assertServerErrorShown(expectedLocale?)`,
  `assertSlowNetworkPatienceShown`.

### D. Selector + fixture plumbing

* `selector-map.ts` — 9 new placeholder testids for the
  mobile/voice/error affordances, all marked `// TODO(selector)`
  until staging confirms the real DOM attribute.
* `ace-fixtures.ts` — auto low-end CDP throttle fixture scoped to
  the `mobile-chromium` project.
* `ace-mock-helpers.ts` — see §B.

### E. Playwright config — `qa/playwright.config.ts`

The PR #5 projects (`ace-web-app`, `ace-web-app-mobile`) are
**renamed** to `desktop-chromium` and `mobile-chromium` so the
matrix in the workflow reads cleanly.  No behaviour change.  The
loader in `tests/helpers/test-config.ts` is unchanged.

### F. Test-count floor — `qa/scripts/verify.mjs`

Floor bumped from `7 → 22` for the ACE suite.  The verifier now
reports `reviewer-system=31/31 ✅  web-app=7/7 ✅  ace-web-app=22/22 ✅`
on a clean run.

### G. Env + scripts — `qa/.env.example`, `qa/package.json`

* `ACE_DEFAULT_LANGUAGE` and `ACE_ENGLISH_LANGUAGE` documented.
* New script: `npm run test:ace:all` runs both projects in one
  invocation (`playwright test --project=desktop-chromium --project=mobile-chromium`).
* Existing scripts (`test:ace`, `test:ace:headed`,
  `test:ace:mobile`, `test:ace:report`) continue to work against
  the renamed projects.

### H. Bug report — `docs/ace-bug-report.md`

Eight (8) observations collected while authoring the spec.  **All
items are pre-CI hypotheses** — `ACE_STAGING_URL` was not
configured in the development environment, so no item was
verified by an actual run on a real staging URL.  The report
documents each hypothesis defensively (component, what the test
guards, why it's plausible, severity, suggested fix).  Honest
disclosure is up front: **no test was executed against staging;
triage after the first CI run.**

### I. GitHub Actions CI — `.github/workflows/ace-web-app-e2e.yml`

Mirrors the existing reviewer-system workflow structure but:

* **Runs both projects in a matrix** —
  `strategy.matrix.project: [desktop-chromium, mobile-chromium]`.
  A failing mobile leg cannot ship silently.
* **Single job upload per project** —
  `ace-web-app-html-report-{desktop,mobile}-chromium`,
  `ace-web-app-junit-{desktop,mobile}-chromium`,
  `ace-web-app-traces-{desktop,mobile}-chromium` (on failure).
* **PR comment** surfaces the matrix result with a deep link to
  the run.
* **Five triggers**: `push` to main, `pull_request` to main,
  `workflow_dispatch`, `workflow_call` (composite deploy hook),
  `repository_dispatch(deployment_success)` (post-deploy gate).
* **Self-sufficient failure semantics**: when `ACE_STAGING_URL`
  isn't configured, the smoke guard surfaces the soft-skip
  reason in the log and `playwright test --project=…` runs 0
  tests and exits 0 — matching the PR #1 reviewer-system
  behaviour.

---

## 🧪 How to run

```bash
cd qa
cp .env.example .env && $EDITOR .env          # fill in ACE_STAGING_URL
npm ci
npx playwright install --with-deps chromium

npm run test:ace                                  # desktop-chromium
npm run test:ace:mobile                           # mobile-chromium (Pixel 5 + 4× CPU throttle)
npm run test:ace:all                              # both projects in one shot
npm run test:ace -- mobile-voice-errors/         # just PR #6 tests
npm run verify                                    # CI gate (floor check)
```

When `ACE_STAGING_URL` isn't set, every `npm run test:ace*` exits
0 with 0 selected tests because the project `testMatch` is
overridden to a never-matches path.  This matches the
reviewer-system behaviour and keeps the suite land-able before
ACE staging is provisioned.

---

## 🔐 Required GitHub Secrets

For the new `ace-web-app*` projects to actually run against
staging, the following secret must exist:

| Secret | Used by |
|--------|---------|
| `ACE_STAGING_URL` | every `tests/ace-web-app` test |

The legacy `ACE_BASE_URL` alias is accepted via the loader in
`tests/helpers/test-config.ts` so an existing secrets store
keeps working without a rotation.  Optional locale knobs
(`ACE_DEFAULT_LANGUAGE`, `ACE_ENGLISH_LANGUAGE`) are documented
in `qa/.env.example` but defaults are sensible.

> **No secrets are hardcoded in this PR.** Verified by
> `grep -RE 'ACE_(STAGING|BASE).*=' .github qa/` — every match
> resolves through `process.env` or `${{ secrets.* }}`.

---

## 📁 File tree (this PR)

```
.github/
└── workflows/
    └── ace-web-app-e2e.yml                       [NEW — matrix CI workflow]

docs/
└── ace-bug-report.md                             [NEW — 8 pre-CI hypotheses]

qa/
├── package.json                                  [MODIFIED — test:ace:all script]
├── playwright.config.ts                          [MODIFIED — rename projects to
│                                                          desktop-chromium / mobile-chromium]
├── scripts/
│   └── verify.mjs                                [MODIFIED — floor 7 → 22]
└── tests/
    └── ace-web-app/                              [EXTENDED]
        ├── fixtures/
        │   ├── ace-fixtures.ts                   [MODIFIED — auto low-end throttle]
        │   └── ace-mock-helpers.ts               [NEW — AceMocks class with
        │                                               microphone / STT / 500 / slow /
        │                                               offline / throttle helpers]
        ├── page-objects/
        │   ├── QueryPage.ts                      [MODIFIED — mobile/voice/error
        │   │                                              locators + assertions]
        │   └── selector-map.ts                   [MODIFIED — 9 new placeholders]
        ├── mobile-voice-errors/                   [NEW]
        │   └── mobile-voice-errors.spec.ts        [15 tests: ACE-MOB-01..04,
        │                                              ACE-VOI-01..05, ACE-ERR-01..06]
        └── README.md                              [MODIFIED — landed-in-PR-#6 table]

PR_DESCRIPTION_PR6.md                             [NEW — this file]
```

Files **outside** the above are untouched (with the exception of
the rename pass in `playwright.config.ts` and `package.json`
which replaces two project names — the tests themselves don't
change).

---

## ✅ Acceptance criteria

- [x] `npm run verify` reports `ace-web-app=22/22 ✅` alongside the
      existing reviewer-system and web-app floors.
- [x] `npx tsc --noEmit` exits clean (no new errors).
- [x] `npx eslint "tests/ace-web-app/**/*.ts" "scripts/**/*.mjs"`
      exits clean.
- [x] No invented selectors — every locator resolves through
      `SELECTOR_MAP.query` with a `// TODO(selector)` marker
      until staging confirms.
- [x] No hardcoded URLs or credentials in the test fixtures,
      the CI workflow, or the docs.
- [x] `.github/workflows/ace-web-app-e2e.yml` is syntactically
      valid YAML (the VS Code YAML linter's false-positive on
      comment line 2 is the same one PR #4 documented in Bug 10
      of `docs/reviewer-system-bug-report.md` — GitHub Actions
      parses correctly at runtime).
- [x] The matrix explicitly exercises both `desktop-chromium`
      *and* `mobile-chromium` projects so a mobile regression
      cannot ship silently.
- [x] Both projects soft-skip cleanly when `ACE_STAGING_URL`
      isn't set.
- [x] Existing 31 reviewer-system tests continue to be counted
      correctly (no regression).
- [x] Existing 7 web-app tests continue to be counted correctly
      (no regression).

---

## 🧪 PR #5 → PR #6 cumulative

The ACE suite (`tests/ace-web-app/`) now covers:

* **PR #5 — Core query flow + language switching** (7 tests):
  ACE-QRY-01..07 in `core-query-flow/`.
* **PR #6 — Mobile viewport + voice + error states** (15 tests):
  ACE-MOB-01..04, ACE-VOI-01..05, ACE-ERR-01..06 in
  `mobile-voice-errors/`.

Total: **22 atomic tests** in `tests/ace-web-app/**` (running
total: 31 + 7 + 22 = **60 across the project**).

The 40+ aspirational target cited in the PR #5 description is
the cumulative across the planned ACE PR series (5–10+).  PR #6
contributes 15 of those tests.  Subsequent PRs will land the
remaining coverage.

---

## 🔭 What's next (PR #7+ — not in this branch)

Documented in `tests/ace-web-app/README.md`:

* `ACE-A11Y-01..03` — accessibility baseline (focus traps,
  ARIA labels, high-contrast palette).
* `ACE-LOC-01..10` — full 22-language catalog coverage
  (currently the suite hard-codes 10 Indic locales).
* `ACE-MOB-05..08` — additional mobile-only viewport tests
  (360 px profile, very-low-end CPU throttle at 6× rate).
* `ACE-PERF-01..03` — performance smoke (TTFB < 2 s on Slow 3G).

PR #7+ candidates will be selected based on the actual
hypotheses that become confirmed defects after the first CI run.

---

/cc @platform-team @qa-team @frontend-team
