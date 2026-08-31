# Crop Controller — E2E Test Documentation

**File:** `src/e2e/crop/CropController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/crops` | Paginated crop list |
| `GET` | `/api/crops/bulk-status` | In-memory bulk CSV job list |
| `GET` | `/api/crops/bulk-status/:jobId` | Single bulk job status |
| `GET` | `/api/crops/download` | Excel export |
| `GET` | `/api/crops/:cropId` | Get by id |
| `POST` | `/api/crops` | Create — admin/moderator only (real in-handler `WRITE_ROLES` check) |
| `PUT` | `/api/crops/:cropId` | Update aliases — admin/moderator only |

Bulk CSV upload (the `file` branch of `POST /crops`) isn't exercised — it kicks off
background worker-thread processing (`startCropBulkProcessing`), the same kind of
machinery the README already flags as unreachable in-process for
`bulk-pae-allocate`.

---

## Note

Crop names are normalized server-side (title-cased) rather than stored verbatim —
the suite compares case-insensitively rather than asserting exact string equality.

Crop alias uniqueness is enforced **globally across all crops**, not just
within the one being updated. The "moderator updates the crop aliases" test
originally used a hardcoded alias value (`"Test"`); a leftover crop from an
interrupted manual debugging run (never cleaned up because that run didn't
reach `afterAll`) still held that alias and caused a real collision in a later
full-suite run (2026-08-24). Fixed 2026-08-25 by scoping the alias to
`RUN_TAG` so it can't collide with any other run's leftover data again.

---

## Test cases (16 total)

| # | Test | Expected |
|---|------|----------|
| 1 | `GET /crops` — no auth | 401 |
| 2 | `GET /crops` — authenticated | 200 |
| 3 | `GET /bulk-status` | 200 |
| 4 | `GET /bulk-status/:jobId` — non-existent | 404 |
| 5 | `GET /download` — xlsx buffer | 200, spreadsheet content-type |
| 6 | `POST /crops` — expert blocked | 403 |
| 7 | `POST /crops` — missing name | 400 |
| 8 | `POST /crops` — moderator creates | 201 |
| 9 | `GET /:cropId` — created crop | 200 |
| 10 | `GET /:cropId` — non-existent | 404 |
| 11 | `PUT /:cropId` — expert blocked | 403 |
| 12 | `PUT /:cropId` — non-existent | 404 |
| 13 | `PUT /:cropId` — moderator updates aliases | 200 |
| 14 | `GET /crops?search=<name>` — returns only matching crops | 200, filtered list |
| 15 | `POST /crops` — admin creates | 201 |
| 16 | `PUT /:cropId` — admin updates aliases | 200 |

Tests #14-16 were migrated 2026-08-25 from `src/modules/crop/tests/CropController.api.test.ts`
(fully mocked service) — that file has been deleted, and its non-duplicate cases (query-param
search, admin role for create/update — the existing suite above only exercised moderator and
expert for those) now have real equivalents here.

---

## Cleanup

`afterAll` deletes every crop id tracked in `createdCropIds`.

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/crop/CropController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-25 | **Result:** ✅ all 16 passed | **Duration:** ~10s

(Previous run: 2026-08-24, 13/13 passed, ~19s — before the 3 tests migrated from
`CropController.api.test.ts` were added.)
