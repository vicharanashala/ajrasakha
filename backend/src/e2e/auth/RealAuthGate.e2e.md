# Real Auth Gate — E2E Test Documentation

**File:** `src/e2e/auth/RealAuthGate.e2e.test.ts`

---

## What this covers

Every other e2e suite (all ~29 of them) builds its `useExpressServer` app
with FAKE `authorizationChecker`/`currentUserChecker` overrides
(`async () => !!currentTestUser`) for speed and determinism — see
`README.md`'s harness section. That leaves the REAL production auth-gate
functions essentially uncovered:

| File | Role |
|---|---|
| `shared/functions/authorizationChecker.ts` | Real `@Authorized()` gate — verifies a Firebase ID token, checks `isBlocked`/`status` |
| `shared/functions/currentUserChecker.ts` | Real `@CurrentUser()` resolver |
| `shared/functions/flexibleAuth.ts` | Route-level middleware on 3 `QuestionController` routes — accepts an internal API key OR a Firebase JWT |

This suite builds its app with the real checkers (same imports
`src/index.ts` uses for the real server) and drives them with a real
Firebase ID token via the existing `getFirebaseToken()` helper (same one
`auth/AuthController.e2e.test.ts`'s `/sync` test uses).

---

## Finding: `FlexibleAuth`'s Firebase-JWT branch is structurally unreachable

`FlexibleAuth`'s docstring says it accepts *either* an internal API key
*or* a Firebase JWT. In practice it can't — the global `InternalApiAuth`
`@Middleware({type:'before'})` runs before any route-specific
`@UseBefore(FlexibleAuth)` and unconditionally 401s any request missing a
valid `x-internal-api-key`. So:

- No request reaches `FlexibleAuth` at all without a valid API key already.
- A request that reaches `FlexibleAuth` with an API key takes its api-key
  branch (`if (apiKey) {...}`) — it never falls through to check for a
  Bearer token, key match or not.

Net effect: every real caller that clears the global gate takes
`FlexibleAuth`'s api-key branch. The JWT branch cannot execute for any
real request in the current configuration. This suite documents that
directly rather than asserting a success case that can't happen — see the
"real behavior with the global InternalApiAuth gate" describe block.

---

## Test cases (7 total)

| # | Test | Expected |
|---|------|----------|
| 1 | `GET /users/me` — real Firebase ID token, real checker chain | 200, real moderator user |
| 2 | Same — no `Authorization` header | real `authorizationChecker` returns false → 401 |
| 3 | Same — garbage token | real `verifyIdToken` rejection propagates (500) |
| 4 | `POST /questions` — real Bearer token, no `x-internal-api-key` | 401 (global gate blocks before `FlexibleAuth`) |
| 5 | Same — valid `x-internal-api-key` + Bearer token present | 201 (api-key branch wins regardless) |
| 6 | Same — neither header | 401 |
| 7 | Same — garbage `x-internal-api-key` | 401 |

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/auth/RealAuthGate.e2e.test.ts
```

---

## Last Run

**Date:** 31-08-2026 | **Result:** ✅ all 7 passed | **Duration:** ~9s
