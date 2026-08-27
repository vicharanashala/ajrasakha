# Farmer Controller — E2E Test Documentation

**File:** `src/e2e/plivo/FarmerController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/farmer` | List all |
| `GET` | `/api/farmer/:phoneNo` | Get by phone number |
| `POST` | `/api/farmer` | Create |
| `PUT` | `/api/farmer/:phoneNo` | Update |
| `DELETE` | `/api/farmer/:phoneNo` | Delete |

All 5 routes are `@Authorized()` only — no role restriction.

---

## Note

`GET /:phoneNo` for a non-existent farmer resolves with `null` and no
`@OnUndefined`/`@OnNull` override — routing-controllers ships that as **204 No
Content** (empty body), not a `200` with a `null` body and not a `404`.

---

## Test cases (7 total)

| # | Test | Expected |
|---|------|----------|
| 1 | `GET /` — no auth | 401 |
| 2 | Same — authenticated | 200, array |
| 3 | `GET /:phoneNo` — non-existent | 204 (no `NotFoundError`) |
| 4 | `POST /` — creates a farmer | 201 |
| 5 | Created farmer retrievable | 200 |
| 6 | `PUT /:phoneNo` — updates | 200, `true` |
| 7 | `DELETE /:phoneNo` — deletes | 200, `true`; follow-up GET → 204 |

---

## Cleanup

`afterAll` deletes the fixture farmer by phone number (safety net if the delete
test itself didn't run to completion).

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/plivo/FarmerController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-24 | **Result:** ✅ all 7 passed | **Duration:** ~7s
