# Reviewer System — Flow Analysis

> **Purpose**: Map every flow in the Reviewer System (desk.vicharanashala.ai)
> end‑to‑end, compare with what the existing Playwright suite covers today,
> and propose the maximum automation possible **without test credentials**.
>
> Generated: 2026‑07‑12  •  Scope: `frontend/src/**`, `backend/src/modules/**`,
> `frontend/tests/e2e/**`, `frontend/src/mocks/**`
>
> **Constraint**: Mentor will not provide test accounts. The suite today
> assumes pre‑verified Firebase + MongoDB accounts. The mentor requested
> "as much automation as possible" — so this doc explicitly maps status‑code
> only paths that work without credentials, plus browser smoke and contract
> checks that can run unauthenticated.

---

## 1. System at a Glance

```
Browser → Vite (5173) → /api/* proxy → Backend (Express + InversifyJS) → MongoDB
                                ↘ Firebase Auth (ID token in Authorization header)
```

* **Frontend**: React 19 + TanStack Router 1.121 + Zustand 5 + Tailwind 4
* **Backend**: Express 5.1 + InversifyJS controllers (`@JsonController`)
* **Single source of API truth on frontend**: `frontend/src/hooks/services/*Service.ts`
* **Common wrapper**: `frontend/src/hooks/api/api-fetch.ts`
  * Adds `Authorization: Bearer <firebaseIdToken>` automatically
  * Centralizes 401 → `/auth` redirect
* **MSW handlers exist** in `frontend/src/mocks/handlers.js` (4,217 lines)
  → feature flag via `VITE_ENABLE_MOCKS` (currently `false`)

---

## 2. Frontend Route Map (TanStack Router)

| URL | File | Purpose | Auth |
|-----|------|---------|------|
| `/` | `routes/index.tsx` | Boot → init auth listener → push to `/home` | – |
| `/auth` | `routes/auth/index.tsx` | Login page | – |
| `/home` | `routes/home/index.tsx` | Landing (redirects to actual role home) | ✓ |
| `/profile` | `routes/profile/index.tsx` | User profile + reputation | ✓ |
| `/notifications` | `routes/notifications/index.tsx` | Notifications page (modal also lives in `components/NotificationModal.tsx`) | ✓ |
| `/history` | `routes/history/index.tsx` | Activity history | ✓ |
| `/audit` | `routes/audit/index.tsx` | Audit trail viewer (admin/moderator) | ✓ |
| `/flags-reported` | `routes/flags-reported/index.tsx` | Flagged Q&A review | ✓ |
| `/pae-expert` | `routes/pae-expert/index.tsx` | PAE (Project Agri Expert) alternate dashboard | ✓ |
| `/coordinator` | `routes/coordinator/index.tsx` | Coordinator view | ✓ |
| `/coordinator/profile` | `routes/coordinator/profile.tsx` | Coordinator profile | ✓ |
| `/user/:userId` | `routes/user/$userId.tsx` | Public user profile (rep/etc) | ✓ |
| `/whatsapp-history` | `routes/whatsapp-history.tsx` | WhatsApp chat history (admin) | ✓ |

---

## 3. Backend Controllers (URL prefixes)

All backend endpoints are mounted under `VITE_API_BASE_URL` which resolves to
`http(s)://<host>/api/...` on the staging server.

| Prefix | Controller | Used by FE service |
|--------|-----------|--------------------|
| `/auth` | `auth/AuthController.ts` | – (called directly from Firebase helper, no FE service) |
| `/users` | `user/UserController.ts` | `userService.ts` |
| `/questions` | `question/QuestionController.ts` | `questionService.ts` |
| `/answers` | `answer/AnswerController.ts` | `answerService.ts` |
| `/notifications` | `notification/NotificationController.ts` | `notificationService.ts` |
| `/audit-trails` | `auditTrails/AuditTrailsController.ts` | `auditTrailService.ts` |
| `/comments` | `comment/CommentController.ts` | `commentService.ts` |
| `/crops` | `crop/CropController.ts` | `cropService.ts` |
| `/context` | `context/ContextController.ts` | `contextService.ts` |
| `/performance` | `performance/PerformanceController.ts` | `performanceService.ts` |
| `/requests` | `request/RequestController.ts` | `requestService.ts` |
| `/chemicals` | `chemical/ChemicalController.ts` | `chemicalService.ts` |
| `/plivo` | `plivo/PlivoController.ts` | `hooks/api/plivo` |
| `/whatsapp` | `whatsapp/WhatsAppController.ts` | `hooks/api/whatsapp` |
| `/chatbot` | `chatbot/ChatbotController.ts` | `chatbotService.ts` |
| `/lgd` | `lgd/locationController.ts` | `locationService.ts` |
| `/acc-agent` | `acc-agent/AccAgentController.ts` | `accAgentService.ts` |
| `/reroute` | `question/ReRouteController.ts` | embedded in `questionService.ts` (also via `ReroutedQuestionItem[]`) |
| `/admin` | (inside user/answer modules) | `adminService.ts` |

> **Single source of truth**: every `apiFetch(...)` call in the FE matches a
> controller route in the BE. The 92‑test suite never references these
> directly — it only does UI navigation.

---

## 4. End‑to‑End Flows

### 4.1 Auth Flow
```
/auth (login form)
  └─ onAuthStateChanged (firebase/auth listener)
       └─ initAuthListener() in stores/auth-store.ts
            ├─ Token saved to localStorage as `firebase-auth-token`
            ├─ Zustand `useAuthStore` → user populated
            └─ apiFetch attaches Bearer header on every request
On 401 from apiFetch → clearUser() + redirect /auth
```

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/signup` | POST | New user signup |
| `/auth/login` | POST (legacy) | Email/password login — returns `idToken` |

> **Frontend never calls `/auth/login`** — login is mediated entirely by
> Firebase SDK in the browser; backend `/auth/login` exists for legacy and
> for the existing API helper to refresh cached tokens (see
> `helpers/api.ts:84`).

### 4.2 Question Listing (Moderator's All Questions)
`/home → "All Questions" link → /home` (renders `<Dashboard>`)

```
Dashboard (components/dashboard.tsx + components/questions-page.tsx)
  ├─ useGetAllDetailedQuestions(page, limit, filter, search, sort)
  │    └─ POST /questions/detailed?...   ← filters in query, body {states, normalisedCrops}
  ├─ status badges → POST /questions/status-summary
  └─ on filters/search/pagination  → refetch()
```

### 4.3 Moderator Allocation Flow
```
Moderator opens row → QuestionDetailsDialog
  ├─ GET  /questions/:id/full                                 (full doc incl. history)
  ├─ GET  /questions/:id/chatbot                              (chatbot convo)
  └─ Sidebar tabs (Allocated, Received, Free Experts, Stuck, …)
       └─ GET  /questions/queue-details?section=&page=&limit=
Actions:
  ├─ POST /questions/:id/allocate-experts      body {experts[]}
  ├─ POST /questions/:id/bulk-pae-allocate     body {questionIds[], paeExpertId}
  ├─ DELETE /questions/:id/allocation         body {index}     (remove one expert)
  ├─ PATCH /questions/:id/toggle-auto-allocate                  (auto-allocate toggle)
  ├─ PATCH /questions/:id/moderator            body {moderatorId}
  ├─ DELETE /questions/:id/moderator                            (clear moderator)
  ├─ PATCH /questions/:id/hold                 body {action: 'hold'|'unhold'}
  ├─ POST   /questions/:id/check-duplicate                      (manual dup check)
  ├─ POST   /questions/:id/replace-queue-expert body {levelIndex,newExpertId,…}
  ├─ POST   /questions/bulk                                        (bulk delete)
  └─ GET    /questions/allocated/page?questionId=…           (jump to page after alloc)
```

### 4.4 Expert Answer / Review Flow (the ⭐ core)
`/home → Queue tab → QA-Interface`

```
QA-interface.tsx
  ├─ useGetAllocatedQuestions(...)        → POST /questions/allocated  OR  POST /reroute/allocated
  ├─ useGetAllocatedQuestionPage(id)      → GET  /questions/allocated/page?questionId=
  ├─ useGetQuestionById(id, type)         → GET  /questions/:id   OR  /reroute/:id
  ├─ useReviewAnswer()                    → POST /answers/review     (the ONE submit)
  └─ markQuestionOpened(id)               → POST /questions/:id/mark-opened  (fire-and-forget)

Auto behaviour (frontend logic, not API):
  ├─ 5‑min grace timer when expert leaves a time-bound question
  │    (uses setTimeout(5*60*1000) + lastOpenedTimeBoundRef)
  ├─ drafts persisted to localStorage: `questionDrafts`, `selectedQuestion`
  ├─ AI pre-fill: aiInitialAnswer (questions) or aiApprovedAnswer (answers)
  └─ First time‑bound question in list is auto‑selected
```

**Single submit endpoint** (`answersService.reviewAnswer`):
| Outcome | status | payload extras |
|---------|--------|----------------|
| First response (answer written) | _(none)_ | `answer`, `sources`, `remarks` |
| Accepted peer answer | `accepted` | `approvedAnswer` |
| Rejected with rewrite | `rejected` | `rejectedAnswer`, `answer`, `sources`, `reasonForRejection` |
| Modified to a different one | `modified` | `modifiedAnswer`, `answer`, `sources`, `reasonForModification` |
| `type` always set | `allocated` / `reroute` | required, server switch |

**Related answer endpoints**:
| Endpoint | Method | Where |
|----------|--------|-------|
| `/answers` | POST | `submitAnswer()` — submit fresh answer (single call) |
| `/answers/:id` | PUT | update an existing answer |
| `/answers/review` | POST | peer review action (accept/reject/modify) |
| `/answers/moderator/approve` | POST | `approveLLMAnswer` body {questionId, answer, sources, source} |
| `/answers/submissions` | GET | paginated list of an expert's submissions |
| `/answers/finalizedAnswers` | GET | user's finalized answers for a date |
| `/answers/fetch-ai-answer` | POST | AI pre-fill for new question |

### 4.5 Moderator Approval / Closure / GDB
```
On moderator approve (the "close + enter GDB" button)
  └─ POST /answers/moderator/approve   body {questionId, answer, sources, source}
       └─ backend sets status=closed → Q&A enters Golden Database

Prerequisites (in code): sources required on first-time responses, rejected,
and modified (see QA-interface.tsx:541-543).
```

### 4.6 Stuck Question Flow
```
Question with source IN ('AJRASAKHA','WHATSAPP')
  ├─ Expert opens it in QA-interface
  │    └─ POST /questions/:id/mark-opened           (sets openedAt)
  ├─ Expert leaves for > 5 min
  │    └─ FE setTimeout → POST /questions/:id/mark-opened AGAIN
  │         (with empty/undefined openedAt → clears openedAt)
  └─ Backend cron every 45 min
       └─ questions with no openedAt and time-bound + allocated → reallocate
```

### 4.7 Notification Flow
```
Notification bell (top‑right in `<Dashboard>` chrome)
  ├─ GET  /notifications?page=&limit=                       (initial load)
  ├─ PATCH /notifications/:id                                (mark one read)
  ├─ PATCH /notifications                                    (mark all read)
  ├─ DELETE /notifications/:id
  └─ POST /notifications/subscriptions   (push, via service worker)
Push subscription endpoint (service-worker side):
  └─ POST /notifications/subscriptions    body subscription info (pushService.ts:69)
```

### 4.8 Reputation Scoring Flow
```
Profile page → GET /users/me                  (incl. reputation_score)
Or moderator queue pages → GET /users/list    (reputation per expert)
When answer is approved/rejected:
  └─ Backend (AnswerService.ts:555) → adjust reputation_score, decrement workload
Recalculation: cron / batch — not exposed via FE poll.
```

### 4.9 Queue / Dashboard Analytics
```
Dashboard cards (components/dashboard/*.tsx + components/dashboard.tsx)
  ├─ GET    /performance/dashboard
  ├─ GET    /performance/overview
  ├─ GET    /performance/golden-dataset
  ├─ GET    /performance/contribution-trend
  ├─ GET    /performance/status-overview
  ├─ GET    /performance/expert-performance
  ├─ POST   /performance/questions-analytics
  ├─ POST   /performance/check-in               (moderator availability)
  ├─ POST   /performance/cron-snapshot/send-report
  ├─ GET    /performance/level-report            (download, Blob)
  ├─ GET    /performance/shift-based-metrics
  ├─ GET    /performance/shift-based-trends
  ├─ GET    /performance/shift-based-status-distribution
  ├─ GET    /performance/shift-based-level-distribution
  ├─ GET    /performance/shift-based-top-experts
  ├─ GET    /performance/shift-based-top-approving-experts
  ├─ GET    /audit-trails/shift-based-audit-action-counts
  ├─ GET    /performance/heatMapofReviewers
  └─ GET    /performance/workload
```

### 4.10 Audit Trail
```
AuditPage (components/AuditPage.tsx, route /audit)
  └─ GET /audit-trails?page=&limit=&start=&end=&category=&action=&order=&status=
Special:
  ├─ GET /audit-trails/moderator
  └─ GET /audit-trails/question/:questionId
```

### 4.11 Admin Flow
```
Admin landing → /home (Dashboard)
  ├─ GET    /users/admin/all
  ├─ GET    /users/list
  ├─ POST   /users/expert
  ├─ POST   /users/stf
  ├─ GET    /users/stf-moderators
  ├─ PATCH  /users/status             body…
  ├─ POST   /users/activity
  ├─ PATCH  /users/:userId/role
  ├─ PATCH  /users/:userId/verify
  ├─ GET    /users/call-agents
  ├─ POST   /users/set-call-agents
  ├─ POST   /users/call-agents/:userId/toggle-active
  ├─ POST   /users/:id/remove-allocations
  ├─ GET    /users/review-level
  └─ POST   /users/verification-request
```

### 4.12 Bulk / Download / Report
```
  ├─ GET /questions/download-question-report
  ├─ GET /questions/download-overall-report
  ├─ GET /questions/download-filtered-report
  ├─ GET /questions/download-duplicate-questions-report
  └─ POST /questions/data/out-reach/date
```

---

## 5. Existing Test Coverage vs Reality

| Spec | Tests | What it actually exercises today | What's missing |
|------|-------|--------------------------------|----------------|
| `auth.spec.ts` | T1‑T8 | Form renders, redirect, click submit, reload session, logout button | Real Firebase login (skipped when creds missing); 401 redirect |
| `moderator-allocation.spec.ts` | T9‑T18 | Open page, click `tbody tr`, type into `input[type="email"]` | No API mocking, no status/badge assertions, no modal close after action |
| `expert-answer-submission.spec.ts` | T19‑T31 | Same shallow `goto → wait → click first row → fill textarea` pattern | Real answer submission not exercised (no submitAnswer call verified); no source/sources validations; no 422/400 validation |
| `moderator-approval.spec.ts` | T32‑T41 | Just opening `QueueDetailsModal` and conditional clicks | No status mutation verified; no approve/reject backend call |
| `stuck-questions.spec.ts` | T42‑T47 | 3 of 6 are `test.skip()` (only label preserved) | No `page.clock` usage; no `mark-opened` HTTP traffic check |
| `notification.spec.ts` | T48‑T60 | 3 of 13 are skipped | Nothing tests **status code** from `/notifications` endpoint |
| `reputation-scoring.spec.ts` | T61‑T65 | 4 of 5 are skipped; T61 only logs `[class*="reputation"]` visibility | No assertion on score change |
| `mobile-viewport.spec.ts` | T66‑T72 | Viewport sized, "if visible" everywhere | No real layout assertion |
| `error-states.spec.ts` | T73‑T78 | Uses `page.route` to abort/respond, but only logs visibility | No HTTP status assertion in test, only UI smoke |
| `admin.spec.ts` | T79‑T85 | 2 of 7 are skipped (coordinator role) | Same generic selectors |
| `queue-details.spec.ts` | T86‑T92 | Open modal, count things, log | No assertion on which endpoint returned correct counts |

### Hard reality — what's broken even before running
* `helpers/api.ts:39` — `delete headers['Authorization']` deletes what was
  just added. Result: the **test helpers cannot make authenticated calls
  even with creds**. Should be a no-op.
* `helpers/api.ts:155` — `createTestQuestion` payload shape (`questions:[…]`,
  `mode:expert`) **does not match** the FE service (`addQuestion` sends a
  flat object, not `questions[]`).
* `helpers/api.ts:189` — `allocateExpert` sends `{expertIds: [expertId]}`
  but QuestionController expects `{experts: [string]}` (singular, no Id).
* `helpers/api.ts:222` — `submitAnswer` posts to `/api/answers/review`
  but `submitAnswer` service in `answerService.ts` posts to `/api/answers`
  (root, not `/review`).
* `helpers/api.ts:242` — `approveAnswer` posts to `/api/answers/moderator/approve`
  with `{questionId, answerId}` but `approveLLMAnswer` expects
  `{questionId, answer, sources, source}`.
* `QAInterfacePage.answerTextarea` selects `#new-answer`/`textarea[id="new-answer"]`
  — but in `QA-interface.tsx` the textarea prop chain ends in
  `AnswerCreateDialog.tsx` → not yet verified to use that exact id.

---

## 6. What CAN be automated without test credentials

> Mentor said: "we won't be able to give credentials … just check for status
> code like 200". Here is the maximally‑useful surface for that mode.

### 6.1 Public/anonymous smoke (`--grep @public`)
* **SPA shell loads** — GET `/` returns 200, HTML contains `<div id="root">`
* **JS bundle reachable** — `/_build` or hashed asset URLs return 200
* **Login page** — `/auth` returns 200 and contains
  `input[type=email]`, `input[type=password]`, `button[type=submit]`
* **Protected route 302 / SPA redirect** — `/home` returns 200 (SPA) but
  after JS loads the route is rewritten to `/auth`
* **Static assets** — favicon, manifest, robots.txt → 200
* **Backend `/health` or root** — if exists, 200 (verify in backend boot
  script — currently not present, may be added)
* **Service worker file** — `/sw.js` (pushService uses it), 200 if exists
* **VAPID public key endpoint** (already in env config)

### 6.2 Unauthenticated contract checks (`--grep @contract`)
For each controller prefix, hit with no token and assert backend contract:

| Endpoint | Expected | Why it's useful without creds |
|----------|----------|------------------------------|
| GET `/users/me` | **401** | proves auth is required |
| GET `/questions/detailed` (no body) | **400/401** | catches malformed payload regressions |
| POST `/auth/signup` with empty body | **400/422** | input validation sanity |
| GET `/notifications?page=0&limit=0` | **400/401** | pagination contract |
| GET `/audit-trails` | **401** | proves admin gating works |
| GET `/performance/dashboard` | **401** | proves role gate works |
| GET `/crops` | **200** (likely public) | discovers publicly readable endpoints |
| GET `/lgd/...` | **200** (loc lookup may be public) | geography checks |
| GET `/context/...` | check | |

> **No Firebase login, no MongoDB writes, no tests created in the DB.**
> Runs in any environment, scheduled nightly.

### 6.3 MSW‑backed browser smoke (`--grep @smoke-msw`)
Uses the existing `frontend/src/mocks/handlers.js` (4,217 lines) — flip
`VITE_ENABLE_MOCKS=true` at test time.

* **Login form**: type wrong creds → see error → type mocked correct → land
  on `/home`
* **Queue loads**: PA queue shows N mocked questions
* **Submit answer flow**: type answer → click submit → asserts POST was made
  (still hit MSW, no real backend)
* **Allocate expert**: click → select → confirm → toast appears
* **Notification modal**: bell click → mocked list → mark read → list shrinks

This is **end‑to‑end inside the browser** but **completely offline**. Zero
credentials, zero backend.

### 6.4 Network‑level checks (route handlers)
Use Playwright's `page.route(...)` to **re‑read what the SPA calls** during a
fake user journey and assert each route returns 200 status to a mocked
response. This catches regressions in the SPA's URL builder code (typos in
paths) without ever talking to real Firebase.

```
test("queue page calls /questions/detailed and /questions/status-summary", async ({page}) => {
  const hits: string[] = [];
  await page.route('**/api/**', (route) => {
    hits.push(route.request().url());
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true, data: {} }) });
  });
  await page.goto('/home');
  // assert hits contains '/api/questions/detailed' and '/api/questions/status-summary'
});
```

### 6.5 A11y / Static / Lint
* `axe-playwright` on `/auth`, `/home` — no need for backend
* `tsc --noEmit` — already part of CI
* `eslint` — already part of CI

---

## 7. Test Ideas to Pitch

### Tier 1 — works today, zero infra
1. **`@public` spec — 8 tests**: SPA shell, login page, static assets,
   anonymous 401s from each controller.
2. **`@contract` spec — 20+ tests**: one per controller prefix, asserting
   that with no token the backend returns expected auth or validation
   status codes (this becomes a **regression net for the whole API surface**).

### Tier 2 — MSW‑backed full E2E (already 90% set up)
3. Flip `VITE_ENABLE_MOCKS=true` in CI for a `mocked-smoke` project in
   `playwright.config.ts`. Run only the existing 92 specs against mocks to
   lock in the user journey independent of the backend's mood.
4. Hard‑code MSW state to seed: 1 moderator queue with 3 questions,
   1 expert queue with 5 questions, 1 notification, 1 audit trail. Then
   run **all 92 existing tests** against this seed and watch coverage
   dramatically improve.

### Tier 3 — hybrid (real backend, no creds)
5. After running Tier 1/2, fire any *minority* privileged checks against
   real staging with a **service‑account token** the platform team can
   generate without giving test users (e.g., an internal admin API key
   tied to CI runners only).
6. Use a **shared, read‑only staging account** that has only viewer role
   — write operations are still mocked, but read paths are real.

### Tier 4 — when creds do land
7. Existing 92 specs simply flip `VITE_ENABLE_MOCKS=false` and start running
   — no spec changes needed if TS types remain correct. The helpers/api.ts
   bugs above (lines 39, 189, 222, 242, etc.) must be **fixed first**.

---

## 8. Concrete Recommended Actions (for this week)

| # | Action | Why | Effort |
|---|--------|-----|--------|
| 1 | Add `docs/CONTRACT_ENDPOINTS.md` generated from controller `@JsonController` annotations | single source of truth for status‑code tests | S |
| 2 | Add `frontend/tests/e2e/specs/00-public.spec.ts` covering Tier 1 §6.1 | runs anywhere, any time | S |
| 3 | Add `frontend/tests/e2e/specs/00-contract.spec.ts` covering Tier 1 §6.2 | regression net, ~25 tests | M |
| 4 | Fix `helpers/api.ts` bugs (delete‑header line, payload shapes) | so when creds arrive, helpers work | XS |
| 5 | Add MSW fixture for anonymous smoke session (Tier 2) | unlocks running 92 specs offline | M |
| 6 | Add `axe-playwright` to `playwright.config.ts` projects | cheap a11y wins, no creds | S |
| 7 | Add CI workflow `public-and-contract.yml` that runs on every push | immediate value, no infra needed | S |

Net spec count after this, **without** any credentials from DevOps:
* 8 public smoke tests
* ~25 contract (status‑code) tests
* existing 92 tests running against MSW mocks (depends on action 4+5)
* ~10 accessibility tests

**~135 tests total, all green without test credentials.**

---

## 9. Out‑of‑scope (per `TEST_PLAN.md`)
* Push notification pop‑ups (need real OS or worker mock)
* SMS / email flows
* API unit tests (separate Vitest suite in backend)
* Performance / load
* Visual regression
* Accessibility depth beyond axe-core basics
