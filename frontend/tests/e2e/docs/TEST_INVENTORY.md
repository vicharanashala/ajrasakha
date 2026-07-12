# Test Inventory — Every Test, Every ID

**Total: 154 tests** across **12 spec files** and **5 phases**.

> Tags: `@public` (smoke), `@network` (route + auth-gate), `@contract`
> (status-code), `@a11y` (accessibility). Run a tag with
> `pnpm test:e2e --grep @public`.

---

## Phase 1 — `@public` (16 tests)

> Proves: SPA shell renders, login form is accessible, protected routes
> don't 5xx.
> Backend: not required.

| ID | Spec | What it asserts |
|----|------|-----------------|
| T-PUB-01 | `00-public.spec.ts` | `GET /` returns 200 HTML |
| T-PUB-02 | `00-public.spec.ts` | `<div id="app">` mount point exists (fix for old `#root` bug) |
| T-PUB-03 | `00-public.spec.ts` | page `<title>` is non-empty |
| T-PUB-04 | `00-public.spec.ts` | HTML has `<head>` and `<body>` |
| T-PUB-05 | `00-public.spec.ts` | document is HTML5 doctype |
| T-PUB-10 | `00-public.spec.ts` | `/auth` renders `<input#email>` (skipped if Firebase env broken) |
| T-PUB-11 | `00-public.spec.ts` | `/auth` renders `<input#password>` |
| T-PUB-12 | `00-public.spec.ts` | `/auth` renders `<button type="submit">` |
| T-PUB-13 | `00-public.spec.ts` | empty-form submit shows error OR stays on `/auth` |
| T-PUB-14 | `00-public.spec.ts` | fake login does NOT navigate away from `/auth` |
| T-PUB-15 | `00-public.spec.ts` | login form is keyboard-navigable |
| T-PUB-20 | `00-public.spec.ts` | `/home` without auth eventually lands on `/auth` or `/home` (with documented UX caveat) |
| T-PUB-21 | `00-public.spec.ts` | `/profile` without auth returns < 5xx |
| T-PUB-22 | `00-public.spec.ts` | `/notifications` without auth returns < 5xx |
| T-PUB-23 | `00-public.spec.ts` | `/audit` without auth returns < 5xx |
| T-PUB-24 | `00-public.spec.ts` | `/history` without auth returns < 5xx |
| T-PUB-25 | `00-public.spec.ts` | `/whatsapp-history` without auth returns < 5xx |

---

## Phase 1b — `@public` asset integrity (5 tests)

> Proves: bundled assets load, no broken links, no console errors.

| ID | Spec | What it asserts |
|----|------|-----------------|
| T-AST-01 | `02-assets.spec.ts` | no 5xx asset response on `/` load |
| T-AST-02 | `02-assets.spec.ts` | every `<script src>` returns 200 |
| T-AST-03 | `02-assets.spec.ts` | every `<link href>` returns 200 |
| T-AST-04 | `02-assets.spec.ts` | `/favicon.ico` returns non-5xx |
| T-AST-05 | `02-assets.spec.ts` | no JS console errors on initial load (env noise filtered) |

---

## Phase 2 — `@network` route table (12 tests)

> Proves: every TanStack Router route renders without 5xx, pageerrors, or
> accidental `/api/*` calls. Filters out env-related noise (Firebase/VAPID
> placeholder errors).

| ID | Spec | Route | What it asserts |
|----|------|-------|-----------------|
| T-NET-01 | `10-network-routes.spec.ts` | `/` | renders, no 5xx, no leaked `/api` |
| T-NET-02 | `10-network-routes.spec.ts` | `/auth` | renders, no 5xx, no leaked `/api` |
| T-NET-03 | `10-network-routes.spec.ts` | `/home` | renders (stays on `/home` if no auth — UX bug documented) |
| T-NET-04 | `10-network-routes.spec.ts` | `/profile` | renders, no 5xx, no leaked `/api` |
| T-NET-05 | `10-network-routes.spec.ts` | `/notifications` | renders |
| T-NET-06 | `10-network-routes.spec.ts` | `/history` | renders |
| T-NET-07 | `10-network-routes.spec.ts` | `/audit` | renders |
| T-NET-08 | `10-network-routes.spec.ts` | `/flags-reported` | renders |
| T-NET-09 | `10-network-routes.spec.ts` | `/pae-expert` | renders |
| T-NET-10 | `10-network-routes.spec.ts` | `/coordinator` | renders |
| T-NET-11 | `10-network-routes.spec.ts` | `/coordinator/profile` | renders |
| T-NET-12 | `10-network-routes.spec.ts` | `/whatsapp-history` | renders |

---

## Phase 2b — `@network` security auth-gate (5 tests)

> **Proves: critical security invariant — anonymous calls to privileged
> endpoints MUST return < 200.** Catches accidental auth-bypass regressions.

| ID | Endpoint | Why it matters |
|----|----------|----------------|
| T-NET-AUTH-01 | `GET /users/me` | auth gate for current-user fetch |
| T-NET-AUTH-02 | `GET /questions/queue-details` | auth gate for queue listing |
| T-NET-AUTH-03 | `GET /notifications` | auth gate for user notifications |
| T-NET-AUTH-04 | `POST /answers` | auth gate for answer submission |
| **T-NET-AUTH-05** | `POST /answers/moderator/approve` | **🔥 most security-critical** — closes a Q&A into the Golden Database. If this returns 200, anyone on the internet can poison the GDB. |

---

## Phase 3 — `@contract` status codes (125 tests)

> Proves: every backend endpoint returns the right status class with no
> token. Defaults: `401` for privileged, `200` for public, `400/422` for
> validation.

### `/questions/*` (36 tests) — `03-contract-questions.spec.ts`

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| GET | `/questions` | 401 | list all |
| GET | `/questions/:id` | 401 | by id |
| GET | `/questions/:id/full` | 401 | full doc |
| GET | `/questions/:id/chatbot` | 401 | chatbot convo |
| GET | `/questions/:id/submission-exists` | 401 | submission check |
| GET | `/questions/:id/generate-answer` | 401 | AI answer gen |
| GET | `/questions/allocated/page` | 401 | page lookup |
| GET | `/questions/background-status` | 401 | background job status |
| GET | `/questions/reallocation-preview` | 401 | reallocation preview |
| POST | `/questions/detailed` | 401 | detailed list |
| POST | `/questions/allocated` | 401 | allocated list |
| POST | `/questions/status-summary` | 401 | status summary |
| POST | `/questions/generate` | 401 | generate from query |
| POST | `/questions/generate-by-call-context` | 401 | generate by call ctx |
| POST | `/questions/call-summary` | 401 | call summary |
| POST | `/questions/check-status` | 401 | status check |
| POST | `/questions` | 401 | create question |
| PUT | `/questions/:id` | 401 | update question |
| PATCH | `/questions/:id` | 401 | patch question |
| DELETE | `/questions/:id` | 401 | delete question |
| DELETE | `/questions/:id/allocation` | 401 | remove allocation |
| PATCH | `/questions/:id/toggle-auto-allocate` | 401 | auto-allocate toggle |
| POST | `/questions/:id/allocate-experts` | 401 | allocate experts |
| POST | `/questions/bulk-pae-allocate` | 401 | bulk PAE allocate |
| POST | `/questions/:id/replace-queue-expert` | 401 | replace queue expert |
| PATCH | `/questions/:id/moderator` | 401 | change moderator |
| DELETE | `/questions/:id/moderator` | 401 | remove moderator |
| PATCH | `/questions/:id/hold` | 401 | hold question |
| POST | `/questions/:id/mark-opened` | 401 | mark opened |
| POST | `/questions/:id/check-duplicate` | 401 | duplicate check |
| POST | `/questions/:id/approve-initial-answer` | 401 | approve AI answer |
| POST | `/questions/reAllocateLessWorkload` | 401 | reallocate less workload |
| POST | `/questions/reAllocateSelectedQuestions` | 401 | reallocate selected |
| POST | `/questions/reallocate-manual` | 401 | manual reallocate |
| DELETE | `/questions/bulk` | 401 | bulk delete |
| POST | `/questions/data/out-reach/date` | 401 | outreach report |

### `/answers/*` + `/reroute/*` (11 tests) — `04-contract-answers.spec.ts`

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| POST | `/answers` | 401 | submit answer |
| PUT | `/answers` | 401 | update answer |
| POST | `/answers/review` | 401 | review (accept/reject/modify) |
| **POST** | **`/answers/moderator/approve`** | **401** | **closure → GDB (security-critical)** |
| GET | `/answers/submissions` | 401 | list submissions |
| GET | `/answers/finalizedAnswers` | 401 | finalized answers |
| POST | `/answers/fetch-ai-answer` | 401 | AI pre-fill |
| POST | `/reroute/allocated` | 401 | reroute allocated list |
| GET | `/reroute/:id` | 401 | reroute by id |
| PATCH | `/reroute/:rerouteId/:questionId` | 401 | reject reroute request |
| GET | `/reroute/:id/history` | 401 | reroute history |
| POST | `/reroute/:id/allocate-reroute-experts` | 401 | allocate reroute experts |

### `/users/*` (19 tests) — `05-contract-users.spec.ts`

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| GET | `/users/me` | 401 | current user |
| GET | `/users/all` | 401 | all users names |
| GET | `/users/list` | 401 | paged list |
| GET | `/users/moderators` | 401 | moderators |
| GET | `/users/stf-moderators` | 401 | stf moderators |
| GET | `/users/review-level` | 401 | review level counts |
| GET | `/users/call-agents` | 401 | call agents |
| GET | `/users/:email/details` | 401 | details by email |
| POST | `/users` | 401 | create user |
| PUT | `/users` | 401 | update user |
| POST | `/users/expert` | 401 | create expert |
| POST | `/users/stf` | 401 | create stf |
| PATCH | `/users/status` | 401 | update status |
| POST | `/users/activity` | 401 | log activity |
| PATCH | `/users/:userId/role` | 401 | change role |
| PATCH | `/users/:userId/verify` | 401 | verify user |
| POST | `/users/set-call-agents` | 401 | set call agents |
| POST | `/users/call-agents/:userId/toggle-active` | 401 | toggle call agent |
| POST | `/users/:id/remove-allocations` | 401 | remove allocations |
| POST | `/users/verification-request` | 401 | verification request |

### `/notifications/*` (6 tests) — `06-contract-notifications.spec.ts`

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| GET | `/notifications` | 401 | list notifications |
| PATCH | `/notifications/:id` | 401 | mark one read |
| PATCH | `/notifications` | 401 | mark all read |
| DELETE | `/notifications/:id` | 401 | delete one |
| POST | `/notifications/users/send` | 401 | admin send |
| POST | `/notifications/subscriptions` | 401 | push subscription |

### `/audit-trails/*` (4 tests) — `07-contract-audit.spec.ts`

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| GET | `/audit-trails` | 401 | list audit trails |
| GET | `/audit-trails/moderator` | 401 | moderator view |
| GET | `/audit-trails/question/:questionId` | 401 | question-scoped view |
| GET | `/audit-trails/shift-based-audit-action-counts` | 401 | shift counts |

### `/performance/*` (18 tests) — `08-contract-performance.spec.ts`

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| GET | `/performance/dashboard` | 401 | dashboard analytics |
| GET | `/performance/overview` | 401 | roles + approval rate |
| GET | `/performance/golden-dataset` | 401 | golden dataset |
| GET | `/performance/contribution-trend` | 401 | contribution trend |
| GET | `/performance/status-overview` | 401 | status overview |
| GET | `/performance/expert-performance` | 401 | expert performance |
| GET | `/performance/workload` | 401 | workload counts |
| POST | `/performance/questions-analytics` | 401 | questions analytics |
| POST | `/performance/check-in` | 401 | moderator check-in |
| POST | `/performance/cron-snapshot/send-report` | 401 | cron snapshot |
| GET | `/performance/heatMapofReviewers` | 401 | heatmap |
| GET | `/performance/level-report` | 401 | level report (download) |
| GET | `/performance/shift-based-metrics` | 401 | shift metrics |
| GET | `/performance/shift-based-trends` | 401 | shift trends |
| GET | `/performance/shift-based-status-distribution` | 401 | shift status distribution |
| GET | `/performance/shift-based-level-distribution` | 401 | shift level distribution |
| GET | `/performance/shift-based-top-experts` | 401 | shift top experts |
| GET | `/performance/shift-based-top-approving-experts` | 401 | shift top approving experts |

### Misc controllers (11 tests) — `09-contract-misc.spec.ts`

| Method | Path | Expected | Label |
|--------|------|----------|-------|
| GET | `/comments/:id` | 401 | comments by id |
| GET | `/crops` | 200/401 | list crops (public-or-gated) |
| GET | `/context/:id` | 401 | context by id |
| GET | `/requests` | 401 | list requests |
| GET | `/chemicals` | 401 | list chemicals |
| GET | `/chatbot/users-metrices` | 401 | user metrics |
| GET | `/whatsapp/users` | 401 | whatsapp users |
| GET | `/plivo` | 404/401/405 | plivo root |
| POST | `/acc-agent/thread` | 401 | acc agent thread |
| POST | `/auth/signup` | 400/422/201 | signup empty body |
| POST | `/auth/login` | 400/422/401 | login empty body |

---

## Phase 4 — `@a11y` accessibility (8 tests)

> Proves: semantic HTML, keyboard reachability, no broken images / empty
> hrefs.

| ID | Spec | What it asserts |
|----|------|-----------------|
| T-A11Y-01 | `11-accessibility.spec.ts` | `/` has `<main>` or `<h1>` |
| T-A11Y-02 | `11-accessibility.spec.ts` | `/` interactive elements have accessible names |
| T-A11Y-03 | `11-accessibility.spec.ts` | `/` is keyboard-reachable from `<body>` |
| T-A11Y-04 | `11-accessibility.spec.ts` | `/auth` has `<main>` or `<h1>` |
| T-A11Y-05 | `11-accessibility.spec.ts` | `/auth` interactive elements have accessible names |
| T-A11Y-06 | `11-accessibility.spec.ts` | `/auth` is keyboard-reachable |
| T-A11Y-07 | `11-accessibility.spec.ts` | `/auth` has no broken `<img>` placeholders |
| T-A11Y-08 | `11-accessibility.spec.ts` | `/auth` has no `<a>` with empty `href` |

---

## Grand total

| Phase | Count | Tag |
|-------|-------|-----|
| Public smoke | 16 | `@public` |
| Asset integrity | 5 | `@public` |
| Route table | 12 | `@network` |
| Security auth-gate | 5 | `@network` |
| `/questions/*` contract | 36 | `@contract` |
| `/answers/*` + `/reroute/*` contract | 11 | `@contract` |
| `/users/*` contract | 19 | `@contract` |
| `/notifications/*` contract | 6 | `@contract` |
| `/audit-trails/*` contract | 4 | `@contract` |
| `/performance/*` contract | 18 | `@contract` |
| Misc controllers contract | 11 | `@contract` |
| Accessibility | 8 | `@a11y` |
| **Total** | **154** | – |
