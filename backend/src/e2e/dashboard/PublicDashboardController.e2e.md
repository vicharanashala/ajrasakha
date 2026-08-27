# Public Dashboard Controller — E2E Test Documentation

**File:** `src/e2e/dashboard/PublicDashboardController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/public-dashboard/saturated-crops` | Public (no user auth) |
| `GET` | `/api/public-dashboard/users` | Public |
| `GET` | `/api/public-dashboard/items` | Public |
| `POST` | `/api/public-dashboard/items` | Admin only |
| `POST` | `/api/public-dashboard/media` | Admin only — real GCS upload, out of scope |
| `PUT` | `/api/public-dashboard/items-reorder` | Admin only |
| `PUT` | `/api/public-dashboard/items/:id` | Admin only |
| `DELETE` | `/api/public-dashboard/items/:id` | Admin only |

---

## Notably different from the rest of the codebase

`PublicDashboardController` does NOT rely solely on `@Authorized(['admin'])` —
every write handler also calls a private `assertAdmin()` helper, with a comment
explicitly noting *"The global authorizationChecker only verifies authentication,
so enforce the admin role here"*. In other words, the developers already worked
around BUG-017 (see README) for this controller specifically. This suite verifies
that real guard actually blocks non-admins.

**Framework note (not a bug):** routing-controllers' `ExpressDriver` throws
`AccessDeniedError` (403) — not `AuthorizationRequiredError` (401) — for ANY
authorization failure, including "no user at all", whenever `@Authorized([roles])`
has a non-empty roles array. Only bare `@Authorized()` 401s on missing auth.

**`items` are a single shared array document** — this suite only ever creates a
uniquely-named test item and cleans it up; it never touches well-known names like
`"saturation limit crop"` that production actually reads.

---

## Test cases (17 total)

### Public read routes (4 tests)
| # | Test | Expected |
|---|------|----------|
| 1 | `GET /saturated-crops` — missing internal key | 401 |
| 2 | Same — internal key alone, no logged-in user | 200 |
| 3 | `GET /users` — no logged-in user | 200 |
| 4 | `GET /items` — no logged-in user | 200 |

### POST /items (4 tests)
| # | Test | Expected |
|---|------|----------|
| 5 | No authenticated user | 403 (roles-array `@Authorized` behavior) |
| 6 | Non-admin (expert) | 403 (real `assertAdmin` check) |
| 7 | Admin adds a custom item | 200 |
| 8 | New item visible via public `GET /items` | 200 |

### PUT /items/:id (3 tests)
| # | Test | Expected |
|---|------|----------|
| 9 | Non-admin | 403 |
| 10 | Non-existent item | 404 |
| 11 | Admin updates value | 200 |

### PUT /items-reorder (2 tests)
| # | Test | Expected |
|---|------|----------|
| 12 | Non-admin | 403 |
| 13 | Admin reorders | 200 |

### DELETE /items/:id (3 tests)
| # | Test | Expected |
|---|------|----------|
| 14 | Non-admin | 403 |
| 15 | Admin deletes | 200 |
| 16 | Delete again (already gone) | 404 |

### POST /media (1 test)
| # | Test | Expected |
|---|------|----------|
| 17 | No file attached (happy path needs a real GCS upload) | 400 |

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/dashboard/PublicDashboardController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-24 | **Result:** ✅ all 17 passed | **Duration:** ~8s
