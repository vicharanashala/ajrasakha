# Performance Controller — E2E Test Documentation

**File:** `src/e2e/performance/PerformanceController.e2e.test.ts`

---

## What this covers

All 18 routes on `PerformanceController` — every one is `@Authorized()` only (no
role restriction; an `isAdmin` flag derived from `user.role === 'admin'` just
widens the query scope server-side, it never blocks access):

`GET /dashboard`, `/overview`, `/golden-dataset`, `/contribution-trend`,
`/status-overview`, `/expert-performance`, `/heatMapofReviewers`, `/workload`,
`/level-report`, `/shift-based-metrics`, `/shift-based-trends`,
`/shift-based-status-distribution`, `/shift-based-level-distribution`,
`/shift-based-top-experts`, `/shift-based-top-approving-experts`; `POST
/questions-analytics`, `/check-in`, `/cron-snapshot/send-report`.

Every route is a read-only analytics/reporting query against real data already
in the DB from every other suite that ran before this one.

---

## Notes on the query DTOs

- **`GetDashboardQuery.goldenDataViewType`** (and `GetGoldenDatasetQuery.viewType`)
  are typed as a TS union (`GoldenDataViewType`), which resolves to `Object`
  design-metadata at runtime — routing-controllers responds by `JSON.parse()`-ing
  the raw query string instead of treating it as a plain string. Sending
  `?goldenDataViewType=month` therefore fails with `ParameterParseJsonError`; it
  has to be sent JSON-quoted (`?goldenDataViewType=%22month%22`). Inconsistently,
  the inline-literal-union field `qnAnalyticsType` on the *same* DTO does NOT
  need this treatment — sending it JSON-quoted breaks class-validator's `isEnum`
  check instead. This suite documents both quirks by construction (see the
  query-string map in the test file).
- `viewType`/`goldenDataViewType` of `"month"`/`"year"` require a matching
  `selectedMonth`/`selectedYear` to actually be supplied — despite both being
  marked `@IsOptional()` in the DTO, the service throws `"Invalid month name"` /
  `"Invalid time value"` if they're omitted. DTO-level optionality doesn't match
  actual service requirements here.
- `GetQuestionsAnalyticsQuery` uses `type`/`startTime`/`endTime` (ISO date
  strings) — different field names than the shift-based reports' `startDate`/
  `endDate`/`shift`.

None of the above are asserted as bugs (the suite just works around them to
reach the routes) — they're just non-obvious enough to be worth recording so the
next person editing this suite doesn't have to rediscover them.

---

## Test cases (34 total)

- 1 auth-gate smoke test
- 16 tests (8 routes × moderator/admin) for the "simple" analytics GETs
- 1 `POST /questions-analytics` happy-path
- 1 `POST /check-in`
- 1 `POST /cron-snapshot/send-report` (no real email sent — dev short-circuit,
  same as `FirebaseAuthService`)
- 2 `GET /level-report` (missing-params 400 + valid-range 200)
- 12 shift-based report tests (6 routes × missing-params 400 + valid-range 200)

---

## How to run

```bash
NODE_ENV=test pnpm exec vitest run --config vitest.e2e.config.ts src/e2e/performance/PerformanceController.e2e.test.ts
```

---

## Last Run

**Date:** 24-08-2026 | **Result:** ✅ all 34 passed | **Duration:** ~25s
