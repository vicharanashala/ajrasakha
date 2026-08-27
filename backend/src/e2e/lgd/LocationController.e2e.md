# Location (LGD) Controller — E2E Test Documentation

**File:** `src/e2e/lgd/LocationController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/location/states` | List states (no auth) |
| `PUT` | `/api/location/states/:stateCode/aliases` | Admin/moderator only |
| `POST` | `/api/location/states` | Admin/moderator only |
| `DELETE` | `/api/location/states/:stateCode` | Admin/moderator only |
| `GET` | `/api/location/districts` | List (requires `stateCode`) |
| `GET` | `/api/location/districts/all` | All districts across states |
| `PUT` | `/api/location/districts/:districtCode/aliases` | Admin/moderator only |
| `POST` | `/api/location/districts` | Admin/moderator only |
| `POST` | `/api/location/districts/all` | Admin/moderator only |
| `DELETE` | `/api/location/districts/:districtCode` | Admin/moderator only |
| `GET` | `/api/location/audits` | Admin/moderator only |
| `GET` | `/api/location/blocks` | No auth |
| `GET` | `/api/location/villages` | No auth |
| `GET` | `/api/location/kvks` | No auth |
| `GET` | `/api/location/download` | xlsx export |

**Not covered:** `POST /kvks/sync` — runs a real script
(`create-lgd-kvks-collection.mjs --apply`) reading a CSV and upserting the real
`kvks` collection. Its `@Authorized()` is commented out (no auth at all,
currently). Exercising it for real risks a long-running mutation against real
reference data — same reasoning as `bulk-pae-allocate`.

---

## Findings / notes

- Every write route has a REAL in-handler role check (`assertCanManage` or an
  inline equivalent) — unlike the routes affected by BUG-017, these actually
  enforce admin/moderator-only access.
- `LocationService.addState`/`addDistrict` **auto-assign** the next sequential
  code (`max existing + 1`); any `code` field sent in the request body is
  silently ignored. This suite reads the real assigned code back from the
  response and uses that for all follow-up requests rather than a hardcoded
  value.
- `GET /districts` requires `stateCode` — it's not optional despite having no
  `{required: false}}` marker in the controller signature; the service throws
  `BadRequestError('stateCode is required')`.

---

## Test cases (23 total)

Covers: public reads (states/districts/blocks/villages/kvks/download), the
401-vs-403 split for `@Authorized()` vs `@Authorized(['admin'])`-style routes
(only the ones with a bare `@Authorized()` 401 on missing auth — writes here use
`@Authorized()` + a real in-handler check, so missing-auth still 401s), role
enforcement (expert blocked with 403 from every write route), and a full
create → alias-update → delete lifecycle for a throwaway state + district.

---

## Cleanup

`afterAll` deletes the fixture district then the fixture state via the
controller's own DELETE routes — no direct DB manipulation of real geo reference
data.

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/lgd/LocationController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-24 | **Result:** ✅ all 23 passed | **Duration:** ~19s
