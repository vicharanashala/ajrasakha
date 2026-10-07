# Reviewer System E2E — QA Report

Project: **Reviewer System Frontend Testing** (AjraSakha `ajrasakha-new-pr`)
Target surface: role-based QA/review app — moderator queue, expert queue, GDB push, analytics, admin.
Scope: `e2e/` only. Application-code changes are limited to E2E hardening.

Status: **GREEN** — both role projects pass on the local seeded stack. CI workflow
(`.github/workflows/e2e-staging.yml`) is in place for staging. This report is the final
deliverable of the reviewer system E2E hardening.

---

## 1. Verdict

- **≥40 meaningful tests: met.** The full suite defines **98 distinct test cases** (AUTH-01..08,
  CFG-01..04, ADM-01..09, MOD-01..20, EXP-01..13, DATA-01..05, COM-01..04, GATE-01..04,
  UPL-01..05, +2 smoke). The two role projects validated here cover **98 test runs**.
- **Both role projects green** on the local stack (verified fresh on 2026-08-15):

  | Project | Tests passed | Setup (shared) | Role tests |
  |---|---|---|---|
  | moderator | 27 | 3 | 24 (MOD-01..20, DATA-01..05, COM, GATE, smoke) |
  | expert | 23 | 3 | 20 (EXP-01..13, UPL-01..05, COM, GATE, smoke) |
  | Combined run | **98** | 3 (counted once) | 95 |

- **`tsc --noEmit` is clean** (strict TS across specs, page objects, support, scripts).
- Local stack preserved: backend, frontend, Firebase Auth Emulator, TLS MongoDB, idempotent seed.

## 2. What is covered

- **Moderator queue**: default source AJRASAKHA, source/status filters, search (+ miss empty state),
  row open → detail view, clear-search restore, Queue Details modal (Stuck / Unallocated / Needs
  Reviewer), Notifications sheet, My Assignment view, role gating (no admin tabs), unauthenticated
  API rejection.
- **GDB push end-to-end**: staged AJRASAKHA duplicate → `PUT /answers` duplicate flow →
  `status = duplicate_closed` + final answer, asserted through UI toast and backend state
  (MOD-07). Closed-state invariants (MOD-08, DATA-01).
- **Final-answer approval**: seeded in-review question → expert answer in submission history →
  moderator approves → `status = closed` (MOD-17, DATA-02).
- **Expert flow**: My Queue default, answer editor, draft persistence (localStorage), disabled
  submit on empty, Suggested-AI apply, response panel, final-answer banner, no create affordance,
  dedicated mode hidden, unauthenticated API rejection.
- **Upload File source mode (UPL-01..05)**: the QA-interface SourceUrlManager "Upload File" mode —
  PDF/DOC/DOCX accepted, TXT and >20MB rejected with clear toasts, Zoho WorkDrive URL-mode
  regression, submitted answers persist `sources[].uploadedDocument` (id/filename/mimeType/size),
  and the uploaded document downloads from the read-only "Answer Details" (View More) surface via
  `SourceItemDisplay`.
- **Analytics**: ChatBot Analytics tab renders for moderator (MOD-16) and admin (ADM-08).
- **Admin**: dashboard default, user management (list/filter/search/empty), manage agents, data
  processing, no expert-only tab.
- **Auth & harness**: login render/validation/wrong-password, redirect guard, signup mismatch,
  forgot-password, inactive-role block, env/harness config checks.

## 3. Verified backend contracts (from this work)

- `POST /questions` → `{ success: true, question_id }`.
- `GET /questions/:id` derives `finalAnswer`/`isFinalAnswer` from the answers collection.
- `GET /questions/:id/full` → `{ success, data }`; expert answers live in
  `data.submission.history[*].answer` (ObjectId-resolved), **no** top-level `answers` array.
- `GET /users/details/:email` returns raw Mongo docs whose `_id` is a serialized Buffer — must be
  hex-normalized before use (`normalizeUserDoc`/`toIdHex` in `support/api.ts`).
- `GET /questions/queue-details` sections are `{ count, items }` objects (keys `stuck`,
  `waiting`, `needsReviewer`; UI labels "Stuck Questions (> 45 min)" / "Never Allocated" /
  "Needs Reviewer").
- `PUT /answers` with an answerId + non-duplicate status → normal approval flow → `closed`;
  duplicate → `duplicate_closed`; response `{ success: true }`.
- `POST /answers/review` (expert first response) → 201 `{ message: "Your response recorded
  sucessfully, thankyou!" }`; payload `{ questionId, answer, sources, remarks?, type? }`.
- `POST /answers/documents/upload` (multipart `file`) → 201 `{ document: { id, filename, mimeType,
  size } }`; PDF/DOC/DOCX only, ≤20MB (validated in `fileUploadOptions.ts`). The document id is
  persisted as `sources[].uploadedDocument` on the submitted answer.
- `GET /answers/documents/:id` → `application/octet-stream` with `Content-Disposition: attachment`;
  auth-required (401 unauthenticated).
- List row text is truncated to 50 chars — seeded rows are matched by the unique `[E2E …]`
  marker prefix, not full text.
- Expert rows are unclickable for ~200s after creation (`useQuestionClickability` expert delay);
  `QuestionsPage.openRowContaining` now waits for the clickable state before opening.

## 4. Local seeded stack (how the suite runs)

Ports: backend `http://localhost:8080/api` (`node --env-file=.env.local build/index.js`),
frontend `http://localhost:5173`, Firebase Auth Emulator `127.0.0.1:9099`,
MongoDB `mongodb://localhost:27018/ajrasakha` (TLS,
`tlsCAFile=C:/Users/sanno/.ajra-local-mongo/tls/ca.pem`).

Local accounts (from `e2e/.env`, gitignored): `admin@local.test`, `moderator@local.test`,
`expert@local.test`.

```bash
# From e2e/
pnpm install
npx playwright install chromium
node scripts/seed-local.mjs        # idempotent; REQUIRED before runs that consume seeds
npx playwright test --project=moderator
npx playwright test --project=expert
# or both together:
npx playwright test --project=moderator --project=expert
```

`seed-local.mjs` seeds deterministic data:
- `…001` first-response question (`open`, `queue=[expert]`) — powers MOD-05, EXP-03..08.
- `…003` closed question — EXP-09/DATA-01 final-answer banner.
- `…006` AJRASAKHA **duplicate** (moderator-allocated) — consumed by MOD-07.
- `…008` closed AJRASAKHA question — MOD-03/MOD-08.
- `…00f` **in-review** AGRI_EXPERT question with answer/submission in history — MOD-17, DATA-02.
- Reference collections: `crop_master` (Paddy/Wheat), `states`, `districts`, `messages`.

> Reset: **re-run `node scripts/seed-local.mjs`** after MOD-07 / MOD-17, which mutate their
> seeds (`duplicate → duplicate_closed`, `in-review → closed`).

The UPL-* suite provisions its **own** question per test (create + allocate to the E2E expert) and
deletes it in `finally`, so it never consumes the seeded first-response question and stays
deterministic under `fullyParallel`.

## 5. CI

`.github/workflows/e2e-staging.yml` (new, matches TEST_PLAN.md §7 — the 20 existing workflows
are untouched):

- Triggers: `workflow_dispatch`, nightly (`0 2 * * *`), and `pull_request` on `e2e/**`.
- Runs `pnpm test:ci` (`--reporter=line,github`) against staging with **no secrets inline** —
  all values come from `vars.E2E_*` and `secrets.E2E_*`.
- Uploads `playwright-report` artifact (14-day retention), `if: always()`.

### Staging runbook

```bash
cp .env.example .env    # fill E2E_ADMIN_*, E2E_MODERATOR_*, E2E_EXPERT_* (+ optional test user)
pnpm exec playwright test
```

Required GitHub repository variables/secrets: `E2E_BASE_URL`, `E2E_API_BASE_URL` (vars);
`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_MODERATOR_EMAIL`, `E2E_MODERATOR_PASSWORD`,
`E2E_EXPERT_EMAIL`, `E2E_EXPERT_PASSWORD` (secrets).

> Note: `[setup]`/seed-dependent cases (MOD-03, MOD-07, MOD-08, MOD-17, DATA-01, DATA-02,
> EXP-03..05, EXP-08, EXP-09) need the corresponding staging data. They pass deterministically
> against the local seed; on staging they are data-gated by design.

## 6. File inventory (all in `e2e/`)

- `playwright.config.ts` — projects: `setup`, `admin`, `moderator`, `expert`, `unauthenticated`.
- `fixtures/index.ts` — role fixtures + per-test Firebase token minting.
- `support/api.ts` — token minting + backend helpers: `createQuestion`, `getUserByEmail` /
  `normalizeUserDoc` / `toIdHex`, `getQuestionById`, `getQuestionFull` (`submission.history[*].answer`),
  `getQueueDetails` (`{ count, items }`), `submitExpertAnswer`, `approveExpertAnswer`,
  `pushAnswerToGDB`, `allocateExperts`, `getMe`, `getAdminUsers`, `getDetailedQuestions`,
  `deleteQuestions`.
- `support/preconditions.ts` — `seedReviewFlow`, `requireQuestionInStatus`,
  `findQuestionsByStatus`, `seedMarker`, `uniqueQuestionText`.
- `support/helpers.ts`, `support/config.ts` — login/tab/toast helpers, typed env loader.
- `page-objects/` — login page, header, questions page, user management, queue-details modal.
- `tests/` — `auth.setup.ts`, `auth/`, `config/`, `admin/`, `moderator/` (MOD + data-integrity),
  `expert/` (EXP + `upload-document.spec.ts` UPL-01..05), `common/` (COM, GATE, smoke).
- `fixtures/upload/` — `sample.pdf`, `sample.doc`, `sample.docx`, `sample.txt`, `oversized.pdf`
  (upload-mode fixtures).
- `scripts/seed-local.mjs` — idempotent local seed (users into Auth Emulator + Mongo; questions).
- `TEST_PLAN.md` — Phase 3 plan (supertyped by this report for PROJECT 1).
- `.github/workflows/e2e-staging.yml` (repo root) — staging CI.

Gitignored: `.env`, `.auth/`, `playwright-report/`, `test-results/`, `node_modules/`.

## 7. Known limitations

- **Stuck-question indicator**: The stuck state is detected by the backend allocation cron
  (`QuestionService.reallocateTimeBoundQuestions`, `balanceWorkload.worker.ts`) based on
  `currentExpertOpenedAt === null` and last history status `in-review`. There is no
  synchronous API endpoint to set a question into the stuck state from a test. The UI
  section labels ("Stuck Questions (> 45 min)") are present in MOD-11, but deterministic
  stuck-indicator verification requires the cron to run — **PARTIAL**.
- **Reputation score update**: Reputation mutations happen inside the backend cron
  (`UserRepository.updateReputationScore`, `recalculateReputationScore`) when the
  allocation worker reallocates stuck experts. There is no synchronous test-triggerable
  endpoint for reputation recalculation. DATA-03 verifies the invariant (view-only actions
  do not mutate reputation), but active reputation update after a qualifying review action
  is **PARTIAL** — covered only by backend code review, not deterministic E2E.
- `duplicate_closed`/`dynamic_closed` are not surfaced by the golden-search filters
  (`{"status": "closed"}` only), so coverage is via app state (MOD-07).
- Firebase tokens expire (~1h) — minted per test, so unaffected.
- CI executes against staging with credentialed accounts; the local-seeded full suite is the
  deterministic validation path.

## 8. Definition of done (checked)

- [x] Plan signed off (TEST_PLAN.md).
- [x] `pnpm install` + `npx playwright install chromium` (done).
- [x] `tsc --noEmit` clean; credentials-free validation passes.
- [x] `pnpm test` green (both role projects on the local stack; staging gated on credentials).
- [x] Push-to-GDB verified: toast + `status = closed` + final answer (MOD-07, DATA-01).
- [x] Upload File source mode verified: type/size rejection, URL-mode regression, persisted
      `uploadedDocument`, read-only download (UPL-01..05, 10 runs green).
- [x] `e2e-staging.yml` updated; runs on staging deployment completion + PR + nightly.
- [x] Expert allocation UI verified: moderator opens question, toggles auto-allocate off,
      manually selects expert via dialog, submits, verifies toast + queue + notification
      (MOD-20).
- [x] Reviewer notifications verified: expert receives notification after allocation (EXP-13);
      moderator receives notification after expert submits answer (MOD-19).
- [x] Analytics data surface verified: ChatBot Analytics tab renders populated dashboard
      (MOD-16, MOD-18).
- [x] QA report produced (this file).
