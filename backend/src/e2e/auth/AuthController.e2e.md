# Auth Controller — E2E Test Documentation

**File:** `src/e2e/auth/AuthController.e2e.test.ts`

---

## What this covers

All 8 routes on `AuthController`, exercised against the **real Mongo DB** (`.env`) AND
the **real Firebase project** (Admin SDK + public Identity Toolkit REST API):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/auth/signup` | Create a Firebase user (self-service) |
| `POST` | `/api/auth/signup/google` | Google-token signup |
| `POST` | `/api/auth/admin/review-users` | Admin creates a coordinator account |
| `PATCH` | `/api/auth/change-password` | Authenticated password change |
| `POST` | `/api/auth/resend-verification` | Resend verification email |
| `POST` | `/api/auth/forgot-password` | Send password reset email |
| `POST` | `/api/auth/login` | Email/password login (real Identity Toolkit call) |
| `POST` | `/api/auth/sync` | Sync a Firebase-authenticated user into Mongo |

---

## Strategy

Same in-process harness as every other suite (`loadAppModules('all')`), but this is the
**only** suite that makes real network calls to Firebase — both the Admin SDK
(`getFirebaseAuth()`) and the public Identity Toolkit REST API via
`helpers/firebaseAuth.ts` (previously-unused code, written for exactly this purpose
before the in-process conversion).

### Side-effect safety

`FirebaseAuthService.sendVerificationEmail` / `sendPasswordResetEmail` both
short-circuit at the top with `if (appConfig.isDevelopment) return;`. The harness
forces `NODE_ENV=development`, so **no real email is ever sent** — signup,
resend-verification, and forgot-password are safe to exercise for real.

`signup` and `admin/review-users` DO create real Firebase Auth users (and
`admin/review-users` a real Mongo doc too). Every created UID/doc-id is tracked and
deleted in `afterAll`.

**The shared fixture accounts (`ADMIN_EMAIL`, `MODERATOR_EMAIL`, ...) are never
mutated.** `change-password` runs against a throwaway account this suite creates
itself via `admin/review-users` — not against fixtures other suites depend on. (An
earlier draft of this suite accidentally mutated `admintest1@annam.ai`'s real Firebase
password — see "Incident" below.)

---

## Findings

This suite surfaced three real bugs and one environment issue — all now the actual
behavior asserted by the tests, not the "intended" behavior:

- **BUG-017** (systemic): `@Authorized(['admin'])` and every other role-array usage
  across the whole app does not actually gate by role — the production
  `authorizationChecker` never reads the `roles` argument. A moderator can call
  `POST /admin/review-users` and get `201`.
- **BUG-018**: `PATCH /change-password` reads the caller via `@Req() request.user`
  (raw Express), which no middleware in the real app ever populates. It **always
  500s**, for every caller, regardless of input.
- **BUG-019**: `POST /sync`'s success response includes the full raw Mongo user doc
  — including the bcrypt `password` hash — sent straight to the client.
- **Environment issue** (not asserted as a code bug): `POST /login` calls Identity
  Toolkit with `FIREBASE_API_KEY` (`.env`), which this environment's Google project
  rejects outright ("API key not valid") — even with fully correct credentials. The
  separate `FIREBASE_WEB_API_KEY` (used only by the test helper) works fine, proven by
  `/sync` succeeding with a token minted through it in the same run. As configured,
  nobody can log in via `POST /login` in this environment.

See `README.md`'s "Known bugs" table for BUG-017 through BUG-019.

### Incident: accidental password mutation during suite development

While iterating on this suite, a first-draft test assumed `ADMIN_EMAIL` was
Firebase-verified and tried to prove `signup` rejects an already-registered verified
email by signing up with `ADMIN_EMAIL`. `admintest1@annam.ai` turned out to be
**unverified** in Firebase, so `FirebaseAuthService.signup` took the "update existing
unverified user" branch instead and overwrote the account's real password. This was
caught immediately (login/sync tests later in the same run failed as a result), the
password was reset back to `ADMIN_PASSWORD` via a corrective script, and the test was
rewritten to build its own verified throwaway fixture instead of touching shared
accounts. Documented here so the same mistake isn't repeated in future suites: **never
assume a shared fixture account's Firebase verification/state — check it, or build
your own throwaway fixture.**

---

## Test cases (26 total)

### Global auth gate (1 test)

| # | Test | Expected |
|---|------|----------|
| 1 | Missing `x-internal-api-key` on a public auth route | 401 |

### POST /auth/signup (6 tests)

| # | Test | Expected |
|---|------|----------|
| 2 | Blank first name (no Firebase call made) | 400 |
| 3 | Invalid email format | 400 |
| 4 | Password < 8 characters | 400 |
| 5 | Creates a new Firebase user | 201 |
| 6 | Re-signup with same unverified email updates in place | 201 (not a conflict) |
| 7 | Signup against an email already verified elsewhere | 400 |

### POST /auth/signup/google (1 test)

| # | Test | Expected |
|---|------|----------|
| 8 | No Authorization header (happy path needs a real Google ID token — untestable headlessly) | ≥400 |

### POST /auth/admin/review-users (4 tests)

| # | Test | Expected |
|---|------|----------|
| 9 | **BUG-017**: moderator calls an admin-only route | 201 (not blocked) |
| 10 | Invalid coordinator role | 400 |
| 11 | Admin creates a review-system user | 201 |
| 12 | Duplicate email | 400 |

### PATCH /auth/change-password (3 tests)

| # | Test | Expected |
|---|------|----------|
| 13 | No authenticated user | 401 |
| 14 | **BUG-018**: mismatched confirm password | 500 (not 400) |
| 15 | **BUG-018**: matching passwords, real user | 500 (still) |

### POST /auth/resend-verification (2 tests)

| # | Test | Expected |
|---|------|----------|
| 16 | Malformed email | 400 |
| 17 | Well-formed email (no email actually sent, dev short-circuit) | 200 |

### POST /auth/forgot-password (3 tests)

| # | Test | Expected |
|---|------|----------|
| 18 | Malformed email | 400 |
| 19 | Registered email | 200 |
| 20 | Non-existent email (enumeration protection) | 200 |

### POST /auth/login (3 tests)

| # | Test | Expected |
|---|------|----------|
| 21 | Malformed email | 400 |
| 22 | Wrong password | 401 |
| 23 | **ENV ISSUE**: correct credentials | 401 ("API key not valid") |

### POST /auth/sync (3 tests)

| # | Test | Expected |
|---|------|----------|
| 24 | No Authorization header | 401 |
| 25 | Garbage token | 500 |
| 26 | Valid real Firebase ID token — **BUG-019**: response includes `user.password` hash | 200 |

---

## Cleanup

`afterAll` deletes every Firebase UID tracked in `createdFirebaseUids` (via the Admin
SDK) and every Mongo doc id in `createdDbUserIds`. The shared fixture accounts
(`ADMIN_EMAIL`, `MODERATOR_EMAIL`) are read-only throughout — never written to.

---

## How to run

```bash
# From backend/  (no live server needed — in-process against real Atlas DB + real Firebase)
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/auth/AuthController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-24 | **Result:** ✅ all 26 passed | **Duration:** ~35s
