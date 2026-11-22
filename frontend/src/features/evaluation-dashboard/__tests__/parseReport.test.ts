import { describe, expect, it } from "vitest";

import {
  applyReportParseResult,
  parseReport,
  parseReportText,
  type ParsedReport,
  type ReportParseResult,
} from "../parseReport";

function csvFile(contents: string, name = "evaluation-report.csv") {
  return new File([contents], name, { type: "text/csv" });
}

function expectSuccess(result: ReportParseResult): ParsedReport {
  if (!result.ok) {
    throw new Error(`Expected a valid report, received: ${result.error.message}`);
  }
  return result.report;
}

describe("parseReport - valid reports", () => {
  it("T-01 parses case and run_metadata rows into separate collections", async () => {
    const result = await parseReport(
      csvFile(
        [
          "record_type,query,technical_pass,run_id,run_started_at,selected_case_count",
          "case,Weather in Ropar?,true,run-1,2026-01-01T00:00:00Z,2",
          "run_metadata,,,run-1,2026-01-01T00:00:00Z,2",
          "case,Market price in Mandya?,false,run-1,2026-01-01T00:00:00Z,2",
        ].join("\n"),
      ),
    );

    const report = expectSuccess(result);

    expect(report.classification).toBe("case_report");
    expect(report.cases).toHaveLength(2);
    expect(report.metadataRows).toHaveLength(1);
    expect(report.metadata?.runId).toBe("run-1");
    expect(report.metadata?.selectedCaseCount).toBe("2");
    expect(report.cases[0].record.query).toBe("Weather in Ropar?");
    expect(report.cases[1].record.query).toBe("Market price in Mandya?");
  });

  it("T-05 accepts a report missing every optional field", async () => {
    const result = await parseReport(csvFile("record_type\ncase"));

    const report = expectSuccess(result);

    expect(report.classification).toBe("case_report");
    expect(report.cases).toHaveLength(1);
    expect(report.cases[0].record).toEqual({ record_type: "case" });
    expect(report.cases[0].metrics).toEqual({});
    expect(report.metricPrefixes).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("T-06 discovers arbitrary metric prefixes dynamically", async () => {
    const result = await parseReport(
      csvFile(
        [
          "record_type,custom_score,custom_status,custom_reason,other_score,unrelated_reason",
          "case,0.75,scored,looks good,0.5,not a metric",
        ].join("\n"),
      ),
    );

    const report = expectSuccess(result);

    expect(report.metricPrefixes).toEqual(["custom", "other"]);
    expect(report.cases[0].metrics.custom).toEqual({
      score: "0.75",
      status: "scored",
      reason: "looks good",
      passed: null,
      error: null,
    });
    expect(report.cases[0].metrics.other.score).toBe("0.5");
    expect(report.cases[0].metrics.other.status).toBeNull();
  });

  it("T-21 accepts a metadata-only report with zero cases", async () => {
    const result = await parseReport(
      csvFile(
        [
          "record_type,run_id,run_started_at,selected_case_count",
          "run_metadata,run-42,2026-02-03T04:05:06Z,10",
        ].join("\n"),
      ),
    );

    const report = expectSuccess(result);

    expect(report.classification).toBe("metadata_only");
    expect(report.cases).toHaveLength(0);
    expect(report.metadataRows).toHaveLength(1);
    expect(report.metadata).toMatchObject({
      runId: "run-42",
      runStartedAt: "2026-02-03T04:05:06Z",
      selectedCaseCount: "10",
    });
    expect(report.warnings).toEqual([]);
  });

  it("T-27 accepts a case report with no quality score columns", async () => {
    const result = await parseReport(
      csvFile(
        [
          "record_type,query,technical_pass",
          "case,Weather in Ropar?,true",
          "case,Market price in Mandya?,false",
        ].join("\n"),
      ),
    );

    const report = expectSuccess(result);

    expect(report.classification).toBe("case_report");
    expect(report.cases).toHaveLength(2);
    expect(report.metricPrefixes).toEqual([]);
  });
});

describe("parseReport - structural validation", () => {
  it("T-02 rejects a file without the record_type header", async () => {
    const result = await parseReport(
      csvFile("query,technical_pass\nWeather in Ropar?,true"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("missing_record_type_header");
  });

  it("T-03 rejects non-CSV and structurally malformed input without throwing", async () => {
    const plainText = await parseReport(csvFile("this is not a csv report"));
    expect(plainText.ok).toBe(false);
    if (!plainText.ok) {
      expect(plainText.error.code).toBe("missing_record_type_header");
    }

    const unterminatedQuote = await parseReport(
      csvFile('record_type,query\ncase,"unterminated'),
    );
    expect(unterminatedQuote.ok).toBe(false);
    if (!unterminatedQuote.ok) {
      expect(unterminatedQuote.error.code).toBe("malformed_csv");
    }
  });

  it("T-26 rejects a structurally malformed case row and preserves prior state", async () => {
    const good = await parseReport(
      csvFile("record_type,query\ncase,Weather in Ropar?"),
    );
    const previous = applyReportParseResult(null, good);
    expect(previous?.cases).toHaveLength(1);

    const bad = await parseReport(
      csvFile("record_type,query\ncase,Weather in Ropar?,unexpected"),
    );

    expect(bad.ok).toBe(false);
    expect(bad).not.toHaveProperty("report");
    if (!bad.ok) {
      expect(bad.error.code).toBe("malformed_csv");
    }

    const committed = applyReportParseResult(previous, bad);
    expect(committed).toBe(previous);
    expect(committed?.cases).toHaveLength(1);
    expect(committed?.cases[0].record.query).toBe("Weather in Ropar?");
  });
});

describe("parseReport - unknown record types", () => {
  it("T-04 skips unknown record types with warnings", async () => {
    const result = parseReportText(
      [
        "record_type,query",
        "case,Weather in Ropar?",
        "summary,ignored summary row",
        "Case,ignored because classification is exact",
      ].join("\n"),
    );

    const report = expectSuccess(result);

    expect(report.cases).toHaveLength(1);
    expect(report.warnings).toHaveLength(2);
    expect(report.warnings[0]).toMatchObject({
      code: "unknown_record_type",
      rowNumber: 3,
    });
    expect(report.warnings[0].message).toContain('"summary"');
    expect(report.warnings[1]).toMatchObject({
      code: "unknown_record_type",
      rowNumber: 4,
    });
    expect(report.warnings[1].message).toContain('"Case"');
  });

  it("T-04 rejects a file containing only unrecognized record types", async () => {
    const result = parseReportText(
      ["record_type,query", "summary,row one", "notes,row two"].join("\n"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("no_recognized_record_types");
  });

  it("T-04 rejects a header-only file as having no recognized records", async () => {
    const result = parseReportText("record_type,query");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("no_recognized_record_types");
  });
});

describe("parseReport - metric extraction", () => {
  it("extracts Agricultural Accuracy dimensions without treating them as metrics", () => {
    const result = parseReportText(
      [
        "record_type,agriculturalaccuracymetric_score,agriculturalaccuracymetric_status,agriculturalaccuracymetric_crop_score,agriculturalaccuracymetric_crop_status,agriculturalaccuracymetric_crop_applicable,agriculturalaccuracymetric_region_error,agriculturalaccuracymetric_cultivation_guidance_score,agriculturalaccuracymetric_cultivation_guidance_status,agriculturalaccuracymetric_cultivation_guidance_applicable",
        "case,0.8,scored,1.0,scored,true,region lookup failed,0.5,partial,true",
      ].join("\n"),
    );

    const report = expectSuccess(result);

    expect(report.metricPrefixes).toEqual(["agriculturalaccuracymetric"]);
    expect(report.cases[0].agriculturalDimensions.crop).toMatchObject({
      score: "1.0",
      status: "scored",
      applicable: "true",
    });
    expect(report.cases[0].agriculturalDimensions.region).toMatchObject({
      error: "region lookup failed",
      score: null,
    });
    expect(
      report.cases[0].agriculturalDimensions.cultivation_guidance,
    ).toMatchObject({
      score: "0.5",
      status: "partial",
      applicable: "true",
    });
  });

  it("preserves the difference between an absent column and a blank cell", () => {
    const result = parseReportText(
      ["record_type,custom_score,custom_status", "case,0.0,"].join("\n"),
    );

    const report = expectSuccess(result);

    expect(report.cases[0].metrics.custom.score).toBe("0.0");
    expect(report.cases[0].metrics.custom.status).toBeNull();
    expect(report.cases[0].metrics.custom.reason).toBeNull();
  });
});
