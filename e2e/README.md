# Ajrasakha E2E Test Suite

Playwright end-to-end tests for the Ajrasakha reviewer platform, covering the full expert workflow — login, question review, answer submission, language switching, voice recording, and mobile UX.

---

## Quick Start

### Prerequisites
- Node.js 18+
- Access to the staging environment (URL + test user credentials)

### 1. Install dependencies
```bash
cd e2e
npm install
npx playwright install chromium
```

### 2. Configure environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
STAGING_URL=http://localhost:5173        # or your staging URL
E2E_EMAIL=test-expert@yourapp.com        # dedicated test account (expert role)
E2E_PASSWORD=TestPassword123!
```

> ⚠️ **Never use real staff accounts** for tests. Create a dedicated `expert` role test user.

### 3. Create the auth state directory
```bash
mkdir -p .auth
```

### 4. Run the tests

```bash
# All tests (desktop + mobile)
npm test

# Desktop only
npx playwright test --project=chromium

# Mobile only
npm run test:mobile

# Headed mode (watch tests run in browser)
npm run test:headed

# Interactive UI mode
npm run test:ui

# Debug a specific test
npm run test:debug -- tests/auth/login.spec.ts

# Run a specific suite
npm run test:auth
npm run test:query
npm run test:voice
```

### 5. View the report
```bash
npm run test:report
```
Opens `playwright-report/index.html` in your browser.

---

## Architecture

```
e2e/
├── playwright.config.ts      # Config: projects, browser args, timeouts
├── .env.example              # Required env vars (copy to .env)
├── .auth/                    # Auto-created: saved login state (gitignored)
├── fixtures/
│   ├── auth.setup.ts         # Login once → save storage state
│   └── app.fixture.ts        # Provides page objects via test.extend()
├── pages/
│   ├── LoginPage.ts          # /auth page object
│   ├── HomePage.ts           # /home dashboard page object
│   └── VoiceRecorderPage.ts  # Voice recorder page object
├── helpers/
│   ├── selectors.ts          # Centralized selector constants
│   ├── api-mock.ts           # Route intercept helpers (Firebase, users, questions, Sarvam)
│   └── wait.ts               # Network/DOM wait helpers (no arbitrary sleeps)
└── tests/
    ├── auth/                 # Login, auth guard
    ├── query-submission/     # English query, Hindi query, empty query
    ├── disclaimer/           # 2-hour SLA timer badge
    ├── language/             # Sarvam translate dropdown
    ├── voice/                # VoiceRecorderCard
    ├── errors/               # Network offline, server 500/401
    └── mobile/               # Mobile viewport coverage
```

---

## Test Coverage

| Suite | Tests | Coverage |
|---|---|---|
| Auth | 11 | Login form, validation, mode switching, auth guard |
| English query | 7 | Queue loading, AI pre-fill, answer typing, submission, reset |
| Hindi query | 3 | Devanagari rendering, answer panel, Unicode integrity |
| Empty query | 2 | Blank submission rejection, textarea behavior |
| Disclaimer | 3 | Timer badge visibility, color states, absence for non-AJRASAKHA |
| Language switch | 5 | Dropdown, language list, Hindi translation, mid-session |
| Voice input | 9 | Mic toggle, recording state, buttons, transcript, mobile |
| Network errors | 1 | Offline graceful degradation |
| Server errors | 2 | 500 handling, 401 redirect |
| Mobile auth | 2 | Form rendering, touch input |
| Mobile nav | 2 | Sidebar button, nav options |
| Mobile query | 3 | Queue load, tap-to-select, answer entry |
| **Total** | **50** | |

---

## CI/CD

Tests run automatically via `.github/workflows/e2e.yml` on:
- Push to `main`, `dev`, `staging`
- Pull requests to `main`, `dev`

**Required GitHub secrets:**
| Secret | Description |
|---|---|
| `STAGING_URL` | Full URL of deployed staging app |
| `E2E_EMAIL` | Test user email (expert role) |
| `E2E_PASSWORD` | Test user password |

**Artifacts on failure:**
- `playwright-report/` — HTML report with screenshots + videos
- `test-results/` — Traces (open with `npx playwright show-trace`)

---

## Troubleshooting

### Auth setup fails
- Confirm `E2E_EMAIL`/`E2E_PASSWORD` match a real user on staging
- The user must have `expert` role (or admin/moderator) to see "My Queue" tab
- Check Firebase is reachable from CI (no firewall blocking)

### Tests pass locally but fail in CI
- Check `STAGING_URL` points to a deployed instance accessible from GitHub's runners
- Verify the Chromium version matches: `npx playwright install chromium`

### Voice tests fail
- The fake device flags (`--use-fake-device-for-media-stream`) must be in `playwright.config.ts`
- If the browser prompts for mic permission, `permissions: ['microphone']` must be in config

### Language switch tests time out
- The Sarvam translate API route is mocked in tests — should not need real API access
- Check `api-mock.ts` intercepts `**/api/translate**` and `**sarvam.ai**/translate**`

---

## App-side changes made for testability

The following minimal, non-invasive `data-testid` attributes were added to the app:

| Component | Attribute added |
|---|---|
| `AuthSubmitButton.tsx` | `data-testid="auth-submit-button"` |
| `SarvamTranslateDropdown.tsx` | `data-testid="translate-dropdown"`, `data-testid="translate-trigger"`, `data-testid="translate-menu"` |
| `voice-recorder-card.tsx` | `data-testid="voice-toggle-btn"`, `data-testid="voice-transcript"`, `data-testid="voice-submit-btn"`, `data-testid="voice-clear-btn"` |
| `timer-display.tsx` | `data-testid="timer-display"` |
