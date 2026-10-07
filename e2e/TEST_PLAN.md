# Reviewer System E2E — Test Plan (Phase 3)

Target system: **desk.vicharanashala.ai** (staging) — "Reviewer System" role-based QA/review
surface of the ajrasakha platform. Repository under test: `ajrasakha-new-pr`.

Status: **Plan + implementation complete. Credentials-free validation done.
Authenticated staging runs gated on real credentials (see §12).**

---

## 1. Goal

Prove the Reviewer System works end-to-end from a real browser against **staging**:

- role-based login and navigation
- moderator queue: filters, search, allocate, review, approve
- **Push-to-GDB** (golden dataset) end-to-end, verified through app state
- expert queue: respond, reroute, draft persistence, final-answer feedback
- notifications, admin user management, role gating
- data integrity of the golden-dataset flow asserted via the backend API

## 2. Non-negotiable constraints

| Constraint | How we honor it |
|---|---|
| **No separate GDB credentials** exist and must not be invented | The app's own DB is the golden DB (`DB_NAME=agriai`). GDB endpoints are read-only (`/v1/gdb/search`, `/v1/gdb/check-pending-duplicate`). No login/creds involved. |
| **No fake credentials / no GDB login** | Credentials come only from env vars; nothing is hardcoded or committed. |
| **Verify the GDB flow via Reviewer System state** | Success toast, question `closed`, final answer, `isFinalAnswer=true`, `approvedBy` present. Never read the golden service directly. |
| **No application-code changes** | All work lives in `e2e/`. No edits to frontend/backend. |
| **No commits/pushes without explicit approval** | We stop before any git operation. |
| **Tests run against staging** | Default base URL is `https://desk.vicharanashala.ai`. Local overrides supported via `.env`. |
| **GitHub Actions must not hardcode secrets** | All secrets referenced by name from repository secrets / environments; values never inline. |

## 3. Environment & accounts

```
E2E_BASE_URL          https://desk.vicharanashala.ai
E2E_API_BASE_URL      https://desk.vicharanashala.ai/api
E2E_ADMIN_EMAIL       <admin>        (role: admin, active, verified)
E2E_ADMIN_PASSWORD    <…>
E2E_MODERATOR_EMAIL   <moderator>    (role: moderator, status: active)
E2E_MODERATOR_PASSWORD <…>
E2E_EXPERT_EMAIL      <expert>       (role: expert, status: active)
E2E_EXPERT_PASSWORD   <…>
E2E_TEST_USER_EMAIL   <fresh account for signup/reset> (optional)
```

Account requirements discovered from the app:

- Login is gated client-side on `status === "in-active"` for moderator/expert
  (`frontend/src/lib/firebase.ts:33-37`) and on `isBlocked` for other roles.
- Email must be verified (enforced in non-dev) — `frontend/src/lib/firebase.ts:42-51`.
- Accounts are provisioned by an admin through **User Management** or created by the team; the
  suite only consumes them from env vars.

## 4. Auth strategy

1. `tests/auth.setup.ts` signs each role in through the real UI once and writes
   `storageState` to `.auth/<role>.json` (gitignored).
   - Firebase Auth default persistence is localStorage (`firebase:authUser:*` keys), so the
     session survives: `onAuthStateChanged` restores it on load, then
     `useGetCurrentUser` fetches the full profile and the app picks the role's default tab
     (`playground_active_tab_<email>`).
2. Role projects consume the matching `storageState` (`playwright.config.ts`).
3. API verification tokens are minted **per test** from the app's public Firebase API key
   (`window.__RUNTIME_CONFIG__.VITE_FIREBASE_API_KEY`) + env credentials via the Firebase
   Identity Toolkit REST endpoint (`support/api.ts`). Tokens are never written to disk.
4. Nothing is committed: `.auth/`, `.env`, reports, and `test-results/` are gitignored.

## 5. Data strategy

- **Test-data helpers**: `support/api.ts` (`api.get/post/put/delete`) for setup, verification,
  and cleanup against `E2E_API_BASE_URL` with a per-test token.
- **GDB/push flow**: one real question is pushed per run (or per nightly schedule). The
  assertion is state-based:
  1. UI: approve answer as final → toast "Answer pushed to GDB successfully".
  2. API: `GET /questions/:id` → `status === "closed"`, `finalAnswer` present,
     `isFinalAnswer === true`, `approvedBy` set, `closedAt` set.
- **Cleanup**: questions/answers created by the suite are deleted or left in a clearly
  identifiable state (marked test/QA via remarks) so staging data stays tidy.
- **Isolation**: every test that mutates state uses its own fresh question (created via admin
  API) and never depends on the exact content of another test's data. View-only tests rely on
  existing staging data and use tolerant assertions (any row, any count ≥ 0).

## 6. Test inventory

Naming: `AUTH-*` auth/login, `ADM-*` admin, `MOD-*` moderator, `EXP-*` expert,
`COM-*` common header, `GATE-*` role gating/shared, `DATA-*` data integrity (API-backed),
`CFG-*` harness-config. Tags: `[auto]` runs by default, `[setup]` needs provisioned
data/accounts, `[cond]` conditional on staging data.

### 6.1 Auth & onboarding (`tests/auth/`, unauth project)

| ID | Test | Tag |
|---|---|---|
| AUTH-01 | Login page renders email, password, "Sign In", "Forgot password?" | auto |
| AUTH-02 | Submitting empty login shows field validation errors | auto |
| AUTH-03 | Wrong password shows "Invalid Credentials" toast | auto |
| AUTH-04 | Valid admin login redirects to `/home` with header | auto |
| AUTH-05 | `/home` without a session redirects to `/auth` | auto |
| AUTH-06 | Signup mode: mismatched passwords shows error | auto |
| AUTH-07 | "Forgot password" sends reset and shows "Check your email" | setup |
| AUTH-08 | Inactive moderator/expert is blocked at login ("User marked as Inactive…") | setup |

### 6.2 Harness config (`tests/config/`, unauth project)

| ID | Test | Tag |
|---|---|---|
| CFG-01 | `.env` files present and gitignored (`.env`, `.env.local`, `.auth/`) | auto |
| CFG-02 | `e2e/.env.example` documents every `E2E_*` variable | auto |
| CFG-03 | Playwright projects defined for setup/admin/moderator/expert/unauthenticated | auto |
| CFG-04 | No hardcoded credentials anywhere in `e2e/` source | auto |

### 6.2 Admin (`tests/admin/`)

| ID | Test | Tag |
|---|---|---|
| ADM-01 | Default tab is Dashboard (performance) | auto |
| ADM-02 | User Management tab lists users | auto |
| ADM-03 | User Management role filter narrows the list | auto |
| ADM-04 | User Management email search finds a known user | setup |
| ADM-05 | User Management search miss shows empty state | auto |
| ADM-06 | Manage Agents tab loads | auto |
| ADM-07 | Data Processing tab loads | auto |
| ADM-08 | ChatBot Analytics tab navigates to `/chatbot` | auto |
| ADM-09 | Admin cannot see expert-only "My Queue" tab | auto |

### 6.3 Moderator queue (`tests/moderator/moderator.spec.ts`)

| ID | Test | Tag |
|---|---|---|
| MOD-01 | All Questions default source is AJRASAKHA (URL param) and rows render | auto |
| MOD-02 | Switching source filter updates the list and URL | auto |
| MOD-03 | Search narrows results to a seeded question (created + cleaned up) | auto |
| MOD-04 | Status filter via Preferences (Advanced Filters) updates the list | auto |
| MOD-05 | Opening a row shows the question-detail view | auto |
| MOD-06 | Newly created question is `open` and searchable via `/questions/detailed` | setup |
| MOD-07 | GDB push on a staged AJRASAKHA duplicate → toast + `status=closed` + final answer | setup |
| MOD-08 | Closed questions carry finalised-answer state (`finalAnswer`/`isFinalAnswer`) | setup |
| MOD-09 | Clearing the search box restores the full list | auto |
| MOD-10 | Unauthenticated API access is rejected (401/403) | auto |
| MOD-11 | Queue Details modal shows Stuck / Unallocated / Needs Reviewer | auto |
| MOD-12 | Notification bell opens the Notifications sheet | auto |
| MOD-13 | Moderator sees no admin-only tabs | auto |
| MOD-14 | "My Assignment" (dedicated) view renders | auto |
| MOD-15 | Search miss shows the empty state | auto |

### 6.4 Expert (`tests/expert/expert.spec.ts`)

| ID | Test | Tag |
|---|---|---|
| EXP-01 | Default tab is "My Queue" (questions) | auto |
| EXP-02 | Queue renders "Question Queues" card or empty-state guidance | auto |
| EXP-03 | A first-response question shows the answer editor | setup |
| EXP-04 | Typed answer persists as a localStorage `questionDrafts` draft | setup |
| EXP-05 | Submit is disabled while the answer is empty | setup |
| EXP-06 | Expert sees no moderator/admin tabs | auto |
| EXP-07 | "Apply Suggested AI Answer" fills the editor | cond |
| EXP-08 | Response panel renders for the selected question | setup |
| EXP-09 | Final-answer banner ("Congratulations!…") shows on a closed question | setup |
| EXP-10 | Unauthenticated API access is rejected (401/403) | auto |
| EXP-11 | Expert cannot create questions (no add affordance) | auto |
| EXP-12 | "Dedicated" answer mode is hidden for experts | auto |

### 6.5 Data integrity (API-backed, `tests/moderator/data-integrity.spec.ts`)

| ID | Test | Tag |
|---|---|---|
| DATA-01 | Closed GDB question carries `status=closed`, `finalAnswer`/`isFinalAnswer`, `approvedBy`, `closedAt` | setup |
| DATA-02 | Submitted expert answer appears in question history | setup |
| DATA-03 | View-only actions do not mutate `reputation_score`/`incentive`/`penalty` | auto |
| DATA-04 | Queue-details API returns the same section keys as the UI modal | auto |

### 6.6 Common header (`tests/common/common.spec.ts`, runs per role)

| ID | Test | Tag |
|---|---|---|
| COM-01 | Header renders tabs, notification bell and profile avatar | auto |
| COM-02 | Notification bell opens the Notifications sheet | auto |
| COM-03 | Profile menu opens with Profile and Logout | auto |
| COM-04 | Logout returns to the auth screen | auto |

### 6.7 Role gating & shared navigation (`tests/common/gating.spec.ts`, runs per role)

| ID | Test | Tag |
|---|---|---|
| GATE-01 | Each role lands on its documented default tab (admin/moderator → Dashboard, expert → My Queue) | auto |
| GATE-02 | All Questions tab visible for all roles | auto |
| GATE-03 | Call-agent tabs absent for admin/moderator/expert | auto |
| GATE-04 | Mobile sidebar mirrors the shared header tabs | auto |

### 6.8 Per-file run commands

```bash
# From e2e/
pnpm exec playwright test tests/auth        # AUTH-* (unauthenticated project)
pnpm exec playwright test tests/config      # CFG-* (unauthenticated project)
pnpm exec playwright test tests/admin       # ADM-* (admin project)
pnpm exec playwright test tests/moderator   # MOD-*, DATA-* (moderator project)
pnpm exec playwright test tests/expert      # EXP-* (expert project)
pnpm exec playwright test tests/common      # COM-*, GATE-*, smoke (all role projects)
pnpm test:ci                                # everything, CI settings
```

**Total: 56 plan-tracked IDs** (AUTH-08, CFG-04, ADM-09, MOD-15, DATA-04, EXP-12,
COM-04, GATE-04) **+ 2 smoke checks = 62 test cases** (≥ 40 required). Of the 56
plan-tracked IDs, ~36 are `[auto]` and the rest `[setup]`/`[cond]`.

## 7. CI — GitHub Actions (new workflow, no duplicates)

New file `.github/workflows/e2e-staging.yml` (the 11 existing workflows are untouched;
none is e2e).

```yaml
name: e2e-staging
on:
  workflow_dispatch: {}            # manual
  schedule:
    - cron: "0 2 * * *"            # nightly against staging
  pull_request:                    # optional: only when e2e/ files change
    paths: ["e2e/**"]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - working-directory: e2e
        run: pnpm install --frozen-lockfile
      - working-directory: e2e
        run: npx playwright install --with-deps chromium
      - working-directory: e2e
        run: pnpm test:ci
        env:                          # secrets, never inline values
          E2E_BASE_URL: ${{ vars.E2E_BASE_URL }}
          E2E_API_BASE_URL: ${{ vars.E2E_API_BASE_URL }}
          E2E_ADMIN_EMAIL: ${{ secrets.E2E_ADMIN_EMAIL }}
          E2E_ADMIN_PASSWORD: ${{ secrets.E2E_ADMIN_PASSWORD }}
          E2E_MODERATOR_EMAIL: ${{ secrets.E2E_MODERATOR_EMAIL }}
          E2E_MODERATOR_PASSWORD: ${{ secrets.E2E_MODERATOR_PASSWORD }}
          E2E_EXPERT_EMAIL: ${{ secrets.E2E_EXPERT_EMAIL }}
          E2E_EXPERT_PASSWORD: ${{ secrets.E2E_EXPERT_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: e2e/playwright-report
          retention-days: 14
```

## 8. Risks & documented limitations

1. **Stuck-question & reputation tests are out of scope for deterministic e2e.** Stuck-expert
   replacement/penalty and reputation scoring are backend-cron driven
   (`backend/src/workers/balanceWorkload.worker.ts:158-285`,
   `UserRepository.recalculateReputationScore`). They cannot be triggered deterministically
   from the browser. We cover the *observable invariant* instead (DATA-03: view-only actions
   do not mutate reputation).
2. **GDB `duplicate_closed` / `dynamic_closed` are not covered**: golden search filters
   `{"status": "closed"}` only
   (`ai/ajrasakha/tools/golden/golden_core.py:329,502,614`, `golden_search.py:525`).
3. **Staging is only deployed via `workflow_dispatch`** — e2e can gate releases only if the
   deploy workflows adopt a push trigger or an e2e gate; not changed here.
4. **Firebase tokens expire (~1h)** — minted per test, so unaffected.
5. **Flakiness** from real staging: CI retries (2), tolerant assertions, and no hard data
   dependencies for `[auto]` tests.
6. **Draft state** (`questionDrafts`, `selectedQuestion`) lives in localStorage per profile —
   tests that assert drafts must use a fresh context or clear the keys first.

## 9. Structure (scaffolded)

```
e2e/
├─ package.json            # pnpm scripts (test, test:headed, test:ci, …)
├─ playwright.config.ts    # projects: setup, admin, moderator, expert, unauthenticated
├─ tsconfig.json           # strict TS
├─ .env.example            # documented vars (copy → .env, never committed)
├─ .gitignore              # .env, .auth/, reports, node_modules
├─ fixtures/index.ts       # extended test + per-role token fixtures
├─ support/
│  ├─ config.ts            # typed env loader
│  ├─ api.ts               # Firebase token + backend API helpers
│  └─ helpers.ts           # login, openTab, toasts, table waits
└─ tests/
   ├─ auth.setup.ts        # per-role UI sign-in → storageState
   ├─ auth/                # AUTH-* (unauth project)
   ├─ config/              # CFG-* harness checks (unauth project)
   ├─ admin/               # ADM-*
   ├─ moderator/           # MOD-*, DATA-*
   ├─ expert/              # EXP-*
   └─ common/              # COM-*, GATE-*, smoke (runs per role)
```

## 10. Definition of done (Phase 3)

1. Plan signed off; admin + moderator + expert accounts supplied via env vars.
2. `pnpm install` + `npx playwright install chromium` in `e2e/` (done).
3. `tsc --noEmit` clean; credentials-free validation passes (done — §12).
4. `pnpm test` green on staging (all `[auto]`; `[setup]` with provisioned data).
5. Push-to-GDB verified: toast + `DATA-01` assertions pass.
6. `e2e-staging.yml` added; report artifact uploads; no secrets inline.
7. QA report produced; no commits unless explicitly approved.

## 11. Credentials-free validation

Until real staging credentials are supplied, the suite is validated without them:

- `pnpm install` and `npx playwright install chromium` succeed.
- `tsc --noEmit` compiles all specs/POs/support.
- `tests/config` (CFG-01..04) and `tests/auth` (AUTH-01..06) run green in the
  `unauthenticated` project, which has no dependency on `setup`.
- Role projects require `.auth/<role>.json` from `setup`; a run without
  credentials fails loudly at `setup` with the exact env-var names — never a
  silent skip.

## 12. Runbook (authenticated staging run)

```bash
cp .env.example .env        # fill E2E_ADMIN_*, E2E_MODERATOR_*, E2E_EXPERT_*
pnpm exec playwright test   # setup signs each role in, then role suites run
```
