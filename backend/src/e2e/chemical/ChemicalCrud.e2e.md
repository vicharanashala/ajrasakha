# Chemical CRUD — E2E Test Documentation

**File:** `src/e2e/chemical/ChemicalCrud.e2e.test.ts`

---

## What this covers

Full CRUD lifecycle for the Chemical resource, exercised against a **live server at
`http://localhost:4000`** via real Firebase JWT tokens.

> ⚠ **This is an old-style live-server test.** Unlike the other e2e suites in this
> directory (which spin up an in-process server via `loadAppModules`), this test
> requires a separately running backend instance. If no server is listening at
> `localhost:4000`, all tests will fail with ECONNREFUSED / timeout.

---

## Endpoints tested

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/chemicals` | List chemicals (auth smoke test) |
| `POST` | `/api/chemicals` | Create chemical |
| `GET` | `/api/chemicals/:id` | Get by ID |
| `PUT` | `/api/chemicals/:id` | Update chemical |
| `DELETE` | `/api/chemicals/:id` | Delete chemical |

---

## Auth strategy

Firebase JWT tokens (`getFirebaseToken`) fetched in `beforeAll` for:
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` (from `.env.test`)
- `MODERATOR_EMAIL` / `MODERATOR_PASSWORD`
- `EXPERT_EMAIL` / `EXPERT_PASSWORD`

---

## Test cases (14 total)

### Authentication Smoke Tests (3 tests)

| # | Test | Expected |
|---|------|----------|
| 1 | No token | 401 |
| 2 | Invalid token | 401 |
| 3 | Valid admin token | 200 |

### Chemical CRUD E2E (11 tests)

| # | Test | Actor | Expected |
|---|------|-------|----------|
| 4 | Admin creates chemical | admin | 201 |
| 5 | Admin gets chemical by ID | admin | 200 |
| 6 | Admin updates chemical | admin | 200 |
| 7 | Admin gets chemical after update | admin | 200 |
| 8 | Admin deletes chemical | admin | 200 |
| 9 | Admin gets 404 for deleted chemical | admin | 404 |
| 10 | Expert cannot create chemical | expert | 403 |
| 11 | Expert cannot update chemical | expert | 403 |
| 12 | Moderator creates chemical | moderator | 201 |
| 13 | Moderator can update chemical | moderator | 200 |
| 14 | Expert cannot delete chemical | expert | 403 |
| 15 | Moderator can delete chemical | moderator | 200 |

---

## Last Test Run Results

**Date:** 2026-06-15  
**Prerequisite:** live server running at `localhost:4000`  
**Total:** 14 tests — **10 passed, 4 failed**

| # | Test | Result | Error |
|---|------|--------|-------|
| 1 | No token → 401 | ✅ | — |
| **2** | **Invalid token → 401** | ❌ FAIL | Response was not 401 (server may be returning a different error) |
| 3 | Valid admin token → 200 | ✅ | — |
| 4 | Admin creates chemical → 201 | ✅ | — |
| 5 | Admin gets chemical by ID → 200 | ✅ | — |
| 6 | Admin updates chemical → 200 | ✅ | — |
| 7 | Admin gets after update → 200 | ✅ | — |
| 8 | Admin deletes chemical → 200 | ✅ | — |
| 9 | Admin gets 404 for deleted | ✅ | — |
| 10 | Expert cannot create → 403 | ✅ | — |
| 11 | Expert cannot update → 403 | ✅ | — |
| 12 | Moderator creates chemical → 201 | ✅ | — |
| **13** | **Moderator can update chemical → 200** | ❌ FAIL | `ForbiddenError` from `ChemicalController.updateChemical` — moderator role blocked from updating |
| **14** | **Expert cannot delete → 403** | ❌ FAIL | Depends on a chemical created by test #13 (which failed); `chemicalId` is undefined |
| **15** | **Moderator can delete chemical → 200** | ❌ FAIL | Depends on admin creating a chemical first (cascade from #13 cleanup) |

---

## Failing Paths (2026-06-15)

### 1. Invalid token (test #2)

The server is returning a response other than 401 for `Bearer invalid-token`. This could
indicate a Firebase auth configuration change or that the `authorizationChecker` is
now returning a different status code for malformed tokens.

### 2. Moderator cannot update chemical (test #13) — `ForbiddenError`

`ChemicalController.updateChemical` throws `ForbiddenError` when called with a moderator
token. This means the permission check for `PUT /api/chemicals/:id` was tightened to
**admin-only**. Previously moderators could update chemicals.

Stack trace confirms the error originates inside `ChemicalController.updateChemical`
(build artefact: `build/modules/chemical/controllers/ChemicalController.js:54`).

**Fix:** Either update the test to use an admin token, or restore moderator write
permission in `ChemicalController.updateChemical`.

### 3. Tests #14 and #15 — cascade

Test #13 creates a chemical as admin and then tries to update it as moderator. Because
the update fails with `ForbiddenError`, the test's cleanup (`DELETE` at the end of #13)
may not have run, or `chemicalId` from prior tests is stale. Tests #14 and #15 rely on
a valid `chemicalId` set up by admin — if the fixture is broken they fail on `201` check.

---

## How to run

```bash
# Requires backend running at localhost:4000
pnpm start &
NODE_ENV=test pnpm exec vitest run src/e2e/chemical/ChemicalCrud.e2e.test.ts
```

> Consider migrating to the in-process pattern (see `ManualAllocation.e2e.test.ts`)
> to remove the live-server dependency.
