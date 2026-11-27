# Evaluation Dashboard Manual QA Checklist

Use this checklist against the latest [dashboard specification](../ai/ajrasakha/evaluation/.opencode/specs/06-evaluation-dashboard.md) and [implementation plan](../ai/ajrasakha/evaluation/.opencode/plans/06-evaluation-dashboard.md). Start each upload test from a fresh page unless the setup explicitly requires an already loaded report.

## Upload and report validation

### QA-01 - Load a valid report
- **Setup:** Prepare a CSV with the `record_type` header, at least one `case` row, and valid `run_metadata` and case values. Include columns emitted by `report.py`, such as `query`, `technical_pass`, `observed_domain`, `run_id`, and `selected_case_count`.
- **Action:** Open `/evaluation-dashboard` and upload the CSV.
- **Expected:** The report loads without an error. Case rows appear in the Case Explorer; metadata rows are not shown as cases. Run metadata and case-dependent dashboard sections render.

### QA-02 - Reject a CSV without `record_type`
- **Setup:** Prepare a CSV with otherwise recognizable columns but no `record_type` header. Load a valid report first.
- **Action:** Upload the CSV missing the required header.
- **Expected:** An actionable validation error appears. The previously loaded report and its aggregates remain unchanged.

### QA-03 - Reject malformed CSV structure
- **Setup:** Load a valid report, then prepare a CSV with an unterminated quoted field or an unreadable case row.
- **Action:** Upload the malformed CSV.
- **Expected:** The file is rejected with a visible error; no partial rows or aggregates replace the valid report.

### QA-04 - Handle unknown record types
- **Setup:** Prepare one CSV containing a valid case row plus a row whose `record_type` is an unknown value, such as `summary`. Prepare a second CSV containing only unknown record types.
- **Action:** Upload each CSV in turn.
- **Expected:** The mixed report loads its recognized rows and surfaces a non-fatal warning for the skipped row. The unknown-only report is rejected because it has no recognized case or metadata rows.

### QA-05 - Load a metadata-only report
- **Setup:** Prepare a structurally valid CSV with a `run_metadata` row and no case rows; include `run_id`, `run_started_at`, and `selected_case_count` where available.
- **Action:** Upload the file.
- **Expected:** The report is accepted. Run information is displayed, Total Cases is 0, and case-dependent metrics show 0 or N/A as appropriate; no error state is shown.

### QA-06 - Load cases with no quality scores
- **Setup:** Prepare a valid CSV with one or more `case` rows and no metric score columns or values. Include valid and invalid/missing technical outcomes.
- **Action:** Upload the file.
- **Expected:** The report is accepted. Total Cases and technical results reflect the cases; Quality-Evaluated Cases is 0; metric cards and matrix cells without data show N/A. Missing scores alone do not create evaluation errors.

### QA-07 - Accept reports with optional columns omitted
- **Setup:** Prepare a valid case CSV containing only `record_type` and a subset of optional columns, for example `query` and `technical_pass`.
- **Action:** Upload the CSV.
- **Expected:** The report is accepted. Omitted metadata, metric, and detail fields display as unavailable rather than causing rejection or appearing as zero.

## KPI and aggregation behavior

### QA-08 - Count parsed cases independently of selected count
- **Setup:** Prepare a CSV with three `case` rows and `selected_case_count` set to a different value, such as 9.
- **Action:** Upload the CSV and inspect run information and KPI cards.
- **Expected:** Total Cases is 3. The reported selected count remains separate metadata and does not replace the parsed count.

### QA-09 - Normalize technical outcomes with casing and whitespace
- **Setup:** Prepare four cases with `technical_pass` values ` TRUE `, `Passed`, ` fail `, and a whitespace-wrapped `false`.
- **Action:** Upload the CSV.
- **Expected:** The first two outcomes count as PASS and the latter two as FAIL; Technical Pass Rate is 50%.

### QA-10 - Exclude missing and unrecognized technical outcomes
- **Setup:** Prepare cases with `technical_pass` values `true`, `failed`, blank, and `yes`.
- **Action:** Upload the CSV.
- **Expected:** Only `true` and `failed` enter the denominator; the pass rate is 50%. Missing and unrecognized values do not count as PASS or FAIL.

### QA-11 - Show N/A when there are no valid technical outcomes
- **Setup:** Prepare cases whose `technical_pass` values are all blank or unrecognized.
- **Action:** Upload the CSV.
- **Expected:** Technical Pass Rate shows N/A, not 0%, and the UI indicates that no valid outcomes are available.

### QA-12 - Count quality-evaluated cases and errors correctly
- **Setup:** Prepare cases with: (a) at least one valid metric score; (b) no scores and no errors; and (c) multiple populated error fields and/or an explicit metric error status.
- **Action:** Upload the CSV and inspect the KPI summary.
- **Expected:** Quality-Evaluated Cases counts cases with at least one valid score. Evaluation Errors counts case (c) once, even if several error fields are populated. Empty scores alone do not count as errors.

### QA-13 - Keep technical failure independent from quality scores
- **Setup:** Prepare a case with `technical_pass=false` and a valid quality metric score with a non-error status.
- **Action:** Upload the CSV and inspect metric aggregates and the case details.
- **Expected:** The case is a technical FAIL, but its valid quality score is included in the applicable average and sample count.

### QA-14 - Preserve valid zero scores
- **Setup:** Prepare a case with an aggregate score of `0.0` and status `scored_zero` (for example, `answerrelevancymetric_score` and `answerrelevancymetric_status`).
- **Action:** Upload the CSV and inspect the metric card, matrix, and case details.
- **Expected:** The score is displayed as zero, included in the average, and counted as a valid sample. It is not shown as unavailable.

### QA-15 - Apply explicit error-status precedence
- **Setup:** Prepare two cases for the same metric: one with a numeric score and status `evaluation_error`, and one with a numeric score and status `scored`.
- **Action:** Upload the CSV and inspect the aggregate and error KPI.
- **Expected:** The score with `evaluation_error` is excluded from the average and valid sample count. Its case is counted as an evaluation error; the valid `scored` value remains included.

### QA-16 - Exclude unavailable statuses without treating them as errors
- **Setup:** Prepare metric values with statuses such as `not_applicable`, `disabled`, and `missing`, plus a case with a blank score and no error information.
- **Action:** Upload the CSV.
- **Expected:** These values do not contribute to averages or valid sample counts. They display as unavailable, and do not increase Evaluation Errors unless an enumerated error field or explicit error status is present.

### QA-17 - Count each case error once and ignore unrelated text
- **Setup:** Prepare one case with multiple actual error indicators. In another case, include the word "error" only in `failure_reason`, `triage_action`, or `response_text`, with no enumerated error field or error status.
- **Action:** Upload the CSV.
- **Expected:** The first case contributes one Evaluation Error. The second does not count as an error solely because arbitrary text contains that word.

## Matrix and case details

### QA-18 - Verify all domains and unavailable matrix cells
- **Setup:** Prepare cases with scores for only a subset of the six domains and metrics.
- **Action:** Upload the CSV and inspect the Domain Performance Matrix.
- **Expected:** Weather, Market, Soil, Schemes, GDB, and Greetings all appear. Populated cells show the average and valid sample count; absent cells show N/A, not zero.

### QA-19 - Keep agricultural dimensions auxiliary
- **Setup:** Prepare a case with an aggregate `agriculturalaccuracymetric_score` and populated crop, region, and cultivation-guidance dimension fields (`*_score`, `*_reason`, `*_applicable`, `*_error`, and `*_status` as applicable).
- **Action:** Upload the CSV, inspect aggregate metrics, then expand the case.
- **Expected:** The aggregate Agricultural Accuracy score is counted once. Crop, region, and cultivation-guidance details are visible only as auxiliary case details and do not inflate aggregate averages or sample counts.

### QA-20 - Inspect collapsed and expanded case details
- **Setup:** Prepare a case with a question, observed domain, technical outcome, quality summary, final answer, metric scores/reasons/errors/statuses, agricultural dimensions, and available provenance fields.
- **Action:** Inspect the collapsed row, then expand and collapse it using the provided control.
- **Expected:** The collapsed row shows Question, Domain, Technical Status, and Quality Summary. Expanded details include the generated answer, all five aggregate metrics, reasons and errors, crop/region/cultivation-guidance dimensions, and available provenance. Missing values are labeled unavailable; a valid score of 0 remains zero.

## State, feedback, and responsive behavior

### QA-21 - Preserve the last valid report after a failed upload
- **Setup:** Load a valid report and note its metadata, cases, and aggregates. Prepare an invalid report (missing `record_type`, malformed CSV, or unknown-only records).
- **Action:** Upload the invalid report.
- **Expected:** An error message is visible, while the previous report's metadata, cases, and aggregates remain unchanged.

### QA-22 - Verify loading, empty, and error feedback
- **Setup:** Use a sufficiently large valid CSV to observe upload processing if the UI exposes a loading state. Also prepare a valid metadata-only report and an invalid file.
- **Action:** Upload each file and observe the dashboard during and after processing.
- **Expected:** Loading feedback is perceivable while processing; the metadata-only report renders a valid empty case state; invalid input renders an error without a broken or blank dashboard.

### QA-23 - Verify responsive layout and table usability
- **Setup:** Load a report with long questions, answers, and provenance values. Test desktop, tablet, and narrow mobile viewport sizes.
- **Action:** Resize the viewport and use the case table and expansion controls at each size.
- **Expected:** KPI cards reflow without overlap; the matrix and case table remain readable (using horizontal scrolling where needed); long text wraps or remains accessible; expanded details fit the viewport and controls remain usable.

### QA-24 - Check the required provenance disclaimer
- **Setup:** Load any valid report.
- **Action:** Inspect the dashboard's provenance/disclaimer section.
- **Expected:** The disclaimer appears verbatim: "Evaluation results depend on the reference data available for this run. Synthetic/manual references should not be interpreted as ACE GDB expert validation."

### QA-25 - Regression check the existing tester dashboard
- **Setup:** Record the current tester dashboard route and its primary flows before testing the Evaluation Dashboard.
- **Action:** Visit the tester dashboard after the evaluation checks and exercise its existing primary interactions; run its existing tests if available.
- **Expected:** The tester dashboard route and behavior are unchanged, with no regressions attributable to the Evaluation Dashboard.
