import { describe, expect, it } from "vitest";

import {
  parseReport,
  parseReportText,
  type ParsedReport,
  type ReportParseResult,
} from "../parseReport";

const FIXTURES = [
  "cases_and_metadata.csv",
  "cases_without_quality_scores.csv",
  "malformed_case_row.csv",
  "metadata_only.csv",
  "missing_optional_metric_columns.csv",
  "numeric_score_evaluation_error.csv",
  "selected_count_differs_from_cases.csv",
  "technical_pass_normalization.csv",
  "unknown_record_type_mixed.csv",
  "unknown_record_type_only.csv",
  "valid_zero_scores.csv",
] as const;

type FixtureName = (typeof FIXTURES)[number];

const FIXTURE_SOURCES = import.meta.glob("./fixtures/*.csv", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function fixtureUrl(name: FixtureName) {
  return `./fixtures/${name}`;
}

function loadFixture(name: FixtureName) {
  const source = FIXTURE_SOURCES[fixtureUrl(name)];
  if (typeof source !== "string") {
    throw new Error(`Fixture not found: ${name}`);
  }
  return source;
}

function expectSuccess(result: ReportParseResult): ParsedReport {
  if (!result.ok) {
    throw new Error(`Expected acceptance, received rejection: ${result.error.code}`);
  }
  return result.report;
}

function expectRejection(result: ReportParseResult, code: string) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
}

function describeResult(result: ReportParseResult) {
  if (!result.ok) {
    return `rejected (${result.error.code})`;
  }
  return `accepted (${result.report.classification}, ${result.report.cases.length} cases, ${result.report.warnings.length} warnings)`;
}

describe("fixture verification - every fixture through parseReportText", () => {
  it("covers exactly the 11 existing fixtures", () => {
    expect(FIXTURES).toHaveLength(11);
  });

  it("cases_and_metadata.csv -> accepted case_report", () => {
    const result = parseReportText(loadFixture("cases_and_metadata.csv"));
    const report = expectSuccess(result);
    console.log(`cases_and_metadata.csv: ${describeResult(result)}`);
    expect(report.classification).toBe("case_report");
    expect(report.cases).toHaveLength(2);
    expect(report.metadataRows).toHaveLength(1);
    expect(report.warnings).toEqual([]);
    expect(report.cases[0].metrics.answerrelevancymetric).toMatchObject({
      score: "0.8",
      status: "scored",
    });
  });

  it("cases_without_quality_scores.csv -> accepted case_report with blank metric cells", () => {
    const result = parseReportText(loadFixture("cases_without_quality_scores.csv"));
    const report = expectSuccess(result);
    console.log(`cases_without_quality_scores.csv: ${describeResult(result)}`);
    expect(report.classification).toBe("case_report");
    expect(report.cases).toHaveLength(2);
    expect(report.metricPrefixes).toEqual([
      "answerrelevancymetric",
      "faithfulnessmetric",
      "contextualrelevancymetric",
      "gdbmatchmetric",
      "agriculturalaccuracymetric",
    ]);
    // The parser currently collapses present-but-blank cells to null, the same
    // sentinel used for an absent column. Verify that actual contract here;
    // the fixture's required outcome (acceptance) does not depend on the
    // distinction. See verification report for the doc/implementation mismatch.
    expect(report.cases[0].metrics.answerrelevancymetric.score).toBeNull();
    expect(report.cases[0].metrics.answerrelevancymetric.status).toBeNull();
  });

  it("malformed_case_row.csv -> rejected malformed_csv", () => {
    const result = parseReportText(loadFixture("malformed_case_row.csv"));
    console.log(`malformed_case_row.csv: ${describeResult(result)}`);
    expectRejection(result, "malformed_csv");
  });

  it("metadata_only.csv -> accepted metadata_only with zero cases", () => {
    const result = parseReportText(loadFixture("metadata_only.csv"));
    const report = expectSuccess(result);
    console.log(`metadata_only.csv: ${describeResult(result)}`);
    expect(report.classification).toBe("metadata_only");
    expect(report.cases).toHaveLength(0);
    expect(report.metadata?.selectedCaseCount).toBe("0");
    expect(report.warnings).toEqual([]);
  });

  it("missing_optional_metric_columns.csv -> accepted scoreless case_report", () => {
    const result = parseReportText(loadFixture("missing_optional_metric_columns.csv"));
    const report = expectSuccess(result);
    console.log(`missing_optional_metric_columns.csv: ${describeResult(result)}`);
    expect(report.classification).toBe("case_report");
    expect(report.cases).toHaveLength(1);
    expect(report.metricPrefixes).toEqual([]);
    expect(report.cases[0].metrics).toEqual({});
  });

  it("numeric_score_evaluation_error.csv -> accepted, raw score and status preserved", () => {
    const result = parseReportText(loadFixture("numeric_score_evaluation_error.csv"));
    const report = expectSuccess(result);
    console.log(`numeric_score_evaluation_error.csv: ${describeResult(result)}`);
    expect(report.classification).toBe("case_report");
    // Error precedence belongs to Phase 3; the parser must preserve the raw
    // numeric value so Phase 3 can decide to discard it.
    expect(report.cases[0].metrics.answerrelevancymetric).toMatchObject({
      score: "0.92",
      status: "evaluation_error",
    });
  });

  it("selected_count_differs_from_cases.csv -> case count comes from rows, not metadata", () => {
    const result = parseReportText(loadFixture("selected_count_differs_from_cases.csv"));
    const report = expectSuccess(result);
    console.log(`selected_count_differs_from_cases.csv: ${describeResult(result)}`);
    expect(report.classification).toBe("case_report");
    expect(report.cases).toHaveLength(2);
    expect(report.metadata).toBeNull();
    expect(report.cases[0].record.selected_case_count).toBe("9");
  });

  it("technical_pass_normalization.csv -> accepted, raw values preserved for Phase 3", () => {
    const result = parseReportText(loadFixture("technical_pass_normalization.csv"));
    const report = expectSuccess(result);
    console.log(`technical_pass_normalization.csv: ${describeResult(result)}`);
    expect(report.classification).toBe("case_report");
    expect(report.cases).toHaveLength(4);
    expect(report.cases.map((c) => c.record.technical_pass)).toEqual([
      " TRUE ",
      "Passed",
      " fail ",
      "false",
    ]);
  });

  it("unknown_record_type_mixed.csv -> accepted with one warning", () => {
    const result = parseReportText(loadFixture("unknown_record_type_mixed.csv"));
    const report = expectSuccess(result);
    console.log(`unknown_record_type_mixed.csv: ${describeResult(result)}`);
    expect(report.cases).toHaveLength(1);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toMatchObject({
      code: "unknown_record_type",
      rowNumber: 3,
    });
    expect(report.warnings[0].message).toContain('"summary"');
  });

  it("unknown_record_type_only.csv -> rejected no_recognized_record_types", () => {
    const result = parseReportText(loadFixture("unknown_record_type_only.csv"));
    console.log(`unknown_record_type_only.csv: ${describeResult(result)}`);
    expectRejection(result, "no_recognized_record_types");
  });

  it("valid_zero_scores.csv -> accepted, 0.0 preserved as a raw value", () => {
    const result = parseReportText(loadFixture("valid_zero_scores.csv"));
    const report = expectSuccess(result);
    console.log(`valid_zero_scores.csv: ${describeResult(result)}`);
    expect(report.classification).toBe("case_report");
    expect(report.cases[0].metrics.answerrelevancymetric).toMatchObject({
      score: "0.0",
      status: "scored_zero",
    });
    expect(report.cases[0].metrics.answerrelevancymetric.score).not.toBeNull();
  });
});

describe("fixture verification - additional integration checks", () => {
  it("parseReport(file) accepts a fixture through the real file-read path", async () => {
    const text = loadFixture("cases_and_metadata.csv");
    const result = await parseReport(new File([text], "cases_and_metadata.csv"));
    const report = expectSuccess(result);
    expect(report.classification).toBe("case_report");
    expect(report.cases).toHaveLength(2);
  });

  it("rejects a ragged recognized case row for the whole file", () => {
    const result = parseReportText(
      ["record_type,query,technical_pass", "case,valid row,true", "case,short row"].join("\n"),
    );
    console.log(`ragged case row (inline): ${describeResult(result)}`);
    expectRejection(result, "malformed_csv");
  });
});
