# Evaluation Dashboard — Integration Contract

This folder now has a pure parse → normalize → aggregate pipeline plus a
working Phase 4 UI that wires the existing components together.

## Entry points

| Function | Module | Purpose |
|---|---|---|
| `parseReport(file)` / `parseReportText(csv)` | `parseReport.ts` | Phase 2 CSV parsing and structural validation. Unchanged. |
| `buildDashboardView(report)` | `aggregate.ts` | Pure `ParsedReport` → `DashboardViewModel`. Never mutates the report. |
| `buildDashboardFromParseResult(result)` | `aggregate.ts` | Successful result → `DashboardState`; rejected result → `null`. |
| `commitDashboardParseResult(current, result)` | `aggregate.ts` | Uses `applyReportParseResult`; a rejected upload returns the current state object by identity. |

## Phase 4 UI wiring

| File | Role |
|---|---|
| `DashboardView.tsx` | Route component. Owns `DashboardState \| null`, loading, and upload-error state. On success it commits `{ report, dashboard }`; on rejection it keeps the previous state and shows an error banner. |
| `UploadSection.tsx` | CSV file picker with drag-and-drop, loading label, and current file name. Calls `onFileSelected(file)`; the parent parses. |
| `RunInformation.tsx` | Run ID, start time, `selected_case_count`, and parsed case count. `selected_case_count` is labelled as reported metadata, distinct from Total Cases. |

`src/routes/evaluation-dashboard.tsx` registers the route and renders
`DashboardView`. The page is client-side only and requires no backend calls.

State rendering:

- No report yet → upload card plus an empty-state explanation.
- Parsing → upload button shows a spinner and "Parsing…".
- Invalid upload → `role="alert"` error banner; a previously loaded report
  stays on screen unchanged.
- Metadata-only report → run information plus a notice; counts are zero and
  case-dependent values render `N/A`.
- Case report with no quality scores → counts and technical outcomes render,
  metric/domain cells render `N/A`, with a non-error notice.
- Parser warnings → amber notice listing each warning (scrollable).
- Unknown domains → notice listing the unmapped labels and their case counts.

## Phase 5 polish

- The mandatory provenance disclaimer is rendered verbatim in the page header
  (`aside[aria-label="Provenance disclaimer"]`), so it is visible with or
  without a loaded report:
  "Evaluation results depend on the reference data available for this run.
  Synthetic/manual references should not be interpreted as ACE GDB expert
  validation."
- Case Explorer rows expand/collapse in place. Long question/answer/reason text
  wraps, and tables keep horizontal scrolling on narrow screens.
- `__tests__/dashboardView.test.tsx` asserts the disclaimer text is present.

## View model

`DashboardViewModel` contains exactly:

- `summary` — Total Cases, Technical Pass Rate, Quality-Evaluated Cases,
  Evaluation Errors.
- `metricAggregates` — all five quality metrics, always present, each
  `{ average: number | null, sampleCount: number }`.
- `domainPerformance` — all six domains × all five metrics, same cell shape.
- `cases` — `DashboardCase[]`.
- `runInformation` — run metadata plus parsed totals. `selectedCaseCount` is
  descriptive only.
- `unknownDomains` — raw domain labels that do not map to the six matrix rows.
- `warnings` — Phase 2 parse warnings.

## Component prop mapping

The existing components can be fed directly:

| Component | Prop | Source |
|---|---|---|
| `SummaryStats` | `data` | `viewModel.summary` |
| `MetricCards` | `metrics` | `viewModel.metricAggregates` |
| `DomainPerformanceMatrix` | `data` | `viewModel.domainPerformance` |
| `CaseExplorer` | `cases` | `viewModel.cases` |

`aggregate.ts` includes a compile-time `ComponentContractCheck` so a future
change to any component prop type fails type checking if the view model drifts.

`DashboardCase` extends `EvaluationCase`, so all required `CaseExplorer` fields
are present. It adds normalized details for Phase 4:

- `metricDetails` — normalized result for every one of the five metrics.
- `technicalRaw` / `technicalStatus` — raw and normalized technical outcome.
- `domainKey` — one of the six matrix domains, or `null` when unknown.
- `qualityEvaluated` — at least one valid aggregate quality score.
- `hasEvaluationError` / `evaluationErrorFields` — allowlisted indicators.

## Normalization rules implemented

- Technical PASS: `true`, `pass`, `passed`; FAIL: `false`, `fail`, `failed`.
  Trim + lowercase only. Everything else is `unavailable` and excluded from the
  pass-rate denominator.
- Pass rate: `PASS / (PASS + FAIL) * 100`; `percent` is `null` at denominator 0.
- Valid metric score: finite decimal number in `[0, 1]`, including `0.0`.
- Explicit error status (`error`, `evaluation_error`) excludes the score even
  when a numeric value is present. The raw and parsed numeric values remain on
  the case detail (`rawScore`, `numericScore`), while `score` stays `null`.
- `not_applicable` / `N/A` / `disabled` / `missing` / `unavailable` statuses are
  excluded. A blank status falls back to “Unavailable” for display but does not
  invalidate a finite score.
- `scored_zero` is a valid scored status.
- `[prefix]_passed` is informational only.
- Evaluation errors come only from: case `error`, discovered `[prefix]_error`,
  discovered `[prefix]_status` = `error`/`evaluation_error`, and
  `agriculturalaccuracymetric_{crop|region|cultivation_guidance}_error` / `_status`.
  Free-text fields such as `failure_reason`, `triage_action`, and
  `response_text` are never scanned. Each case is counted once.
- Agricultural dimension scores are normalized separately and never added to
  the aggregate `agriculturalaccuracymetric` average.

## Domain aliases

The six matrix rows are `Weather`, `Market`, `Soil`, `Schemes`, `GDB`,
`Greetings`. Explicit aliases cover pipeline labels:

| Alias | Matrix row |
|---|---|
| `Market Prices` | `Market` |
| `Nutrient Management` | `Soil` |
| `Government Schemes` | `Schemes` |
| `Cultural Practices` | `GDB` |
| `General` | `Greetings` |

Any other label is unknown: it is preserved on the case (`domain`,
`rawDomain`) and listed in `unknownDomains`, but it is never assigned to a
matrix row.
