# Audit Trails Controller — E2E Test Documentation

**File:** `src/e2e/auditTrails/AuditTrailsController.e2e.test.ts`

---

## What this covers

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/audit-trails` | Admin: system-wide; everyone else: moderator-scoped |
| `GET` | `/api/audit-trails/moderator` | Moderator-scoped view |
| `GET` | `/api/audit-trails/shift-based-audit-action-counts` | Shift-based counts |
| `GET` | `/api/audit-trails/question/:questionId` | Trails for one question |

The controller carries a class-level `@Authorized()` — every route just needs an
authenticated user. `getAllAuditTrails` branches internally on `user.role` for
*which query it runs*, not whether access is granted.

This suite creates no fixtures of its own — every other suite that writes through
`AuditTrailsService.createAuditTrail` (Comment, Crop, Request, Question, ...)
already populates real rows, so these reads exercise real data.

---

## Test cases (6 total)

| # | Test | Expected |
|---|------|----------|
| 1 | `GET /` — no auth | 401 |
| 2 | `GET /` — admin (system-wide) | 200 |
| 3 | `GET /` — moderator (scoped) | 200 |
| 4 | `GET /moderator` | 200 |
| 5 | `GET /shift-based-audit-action-counts` | 200 |
| 6 | `GET /question/:questionId` — non-existent question | 200, empty result (not 404) |

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/auditTrails/AuditTrailsController.e2e.test.ts
```

---

## Last Run

**Date:** 2026-08-24 | **Result:** ✅ all 6 passed | **Duration:** ~6s
