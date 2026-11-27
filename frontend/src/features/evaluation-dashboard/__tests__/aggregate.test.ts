import { describe, expect, it } from "vitest";

import {
  buildDashboardFromParseResult,
  buildDashboardView,
  commitDashboardParseResult,
  QUALITY_METRIC_DEFINITIONS,
  type DashboardState,
} from "../aggregate";
import { parseReportText, type ParsedReport } from "../parseReport";

function reportFromCsv(csv: string): ParsedReport {
  const result = parseReportText(csv);
  if (!result.ok) {
    throw new Error(`Fixture CSV did not parse: ${result.error.message}`);
  }
  return result.report;
}

function dashboardFromCsv(csv: string) {
  return buildDashboardView(reportFromCsv(csv));
}

describe("metric aggregation", () => {
  it("T-14 averages valid scores and reports the valid sample count", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,technical_pass,answerrelevancymetric_score,answerrelevancymetric_status",
        "case,q1,true,0.8,scored",
        "case,q2,false,0.6,scored",
      ].join("\n"),
    );

    expect(dashboard.metricAggregates.answerRelevancy).toEqual({
      average: 0.7,
      sampleCount: 2,
    });
    expect(dashboard.metricAggregates.faithfulness).toEqual({
      average: null,
      sampleCount: 0,
    });
  });

  it("T-12 excludes a numeric score with evaluation_error and preserves the raw value", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,answerrelevancymetric_score,answerrelevancymetric_status",
        "case,judge failed,0.92,evaluation_error",
        "case,good,0.4,scored",
      ].join("\n"),
    );

    expect(dashboard.metricAggregates.answerRelevancy).toEqual({
      average: 0.4,
      sampleCount: 1,
    });

    const detail = dashboard.cases[0].metricDetails.answerRelevancy;
    expect(detail.score).toBeNull();
    expect(detail.rawScore).toBe("0.92");
    expect(detail.numericScore).toBe(0.92);
    expect(detail.excluded).toBe(true);
    expect(detail.exclusionReason).toBe("evaluation_error");
    expect(detail.status).toBe("evaluation_error");
    expect(dashboard.cases[0].qualitySummary).toBe(
      "No valid quality scores",
    );
  });

  it("T-13 counts 0.0 as a valid sample", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,answerrelevancymetric_score,answerrelevancymetric_status",
        "case,zero,0.0,scored_zero",
        "case,one,1.0,scored",
      ].join("\n"),
    );

    expect(dashboard.metricAggregates.answerRelevancy).toEqual({
      average: 0.5,
      sampleCount: 2,
    });
    expect(dashboard.cases[0].metricDetails.answerRelevancy.score).toBe(0);
    expect(
      dashboard.cases[0].metricDetails.answerRelevancy.valid,
    ).toBe(true);
  });

  it("T-15 excludes not_applicable/N/A, disabled, and missing statuses", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,answerrelevancymetric_score,answerrelevancymetric_status",
        "case,a,0.9,not_applicable",
        "case,b,0.8,N/A",
        "case,c,0.7,disabled",
        "case,d,0.6,missing",
        "case,e,0.5,scored",
      ].join("\n"),
    );

    expect(dashboard.metricAggregates.answerRelevancy).toEqual({
      average: 0.5,
      sampleCount: 1,
    });
    expect(
      dashboard.cases.map(
        (caseData) =>
          caseData.metricDetails.answerRelevancy.normalizedStatus,
      ),
    ).toEqual([
      "not_applicable",
      "not_applicable",
      "disabled",
      "missing",
      "scored",
    ]);
  });

  it("T-16 does not remove quality scores from a technical FAIL case", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,technical_pass,answerrelevancymetric_score,answerrelevancymetric_status",
        "case,technical pass,true,0.8,scored",
        "case,technical fail,false,0.6,scored",
      ].join("\n"),
    );

    expect(dashboard.summary.technicalPassRate).toMatchObject({
      percent: 50,
      sampleCount: 2,
    });
    expect(dashboard.metricAggregates.answerRelevancy).toEqual({
      average: 0.7,
      sampleCount: 2,
    });
  });

  it("T-29 ignores [prefix]_passed for technical status and aggregation", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,technical_pass,answerrelevancymetric_score,answerrelevancymetric_status,answerrelevancymetric_passed",
        "case,q1,false,0.6,scored,false",
      ].join("\n"),
    );

    expect(dashboard.cases[0].technicalStatus).toBe("fail");
    expect(dashboard.summary.technicalPassRate.percent).toBe(0);
    expect(dashboard.summary.evaluationErrors).toBe(0);
    expect(dashboard.metricAggregates.answerRelevancy).toEqual({
      average: 0.6,
      sampleCount: 1,
    });
    expect(
      dashboard.cases[0].metricDetails.answerRelevancy.passed,
    ).toBe("false");
  });

  it("T-17 keeps agricultural dimensions separate from the aggregate metric", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,agriculturalaccuracymetric_score,agriculturalaccuracymetric_status,agriculturalaccuracymetric_crop_score,agriculturalaccuracymetric_crop_status,agriculturalaccuracymetric_crop_applicable,agriculturalaccuracymetric_region_score,agriculturalaccuracymetric_region_status,agriculturalaccuracymetric_region_applicable",
        "case,q1,0.8,scored,1.0,scored,true,0.5,scored,true",
      ].join("\n"),
    );

    expect(dashboard.metricAggregates.agriculturalAccuracy).toEqual({
      average: 0.8,
      sampleCount: 1,
    });
    expect(
      dashboard.cases[0].agriculturalDimensions.crop,
    ).toMatchObject({
      score: 1,
      valid: true,
      applicable: true,
    });
    expect(
      dashboard.cases[0].agriculturalDimensions.region,
    ).toMatchObject({
      score: 0.5,
      valid: true,
      applicable: true,
    });
  });

  it("does not treat a dimension score as a quality-evaluated aggregate", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,agriculturalaccuracymetric_crop_score,agriculturalaccuracymetric_crop_status,agriculturalaccuracymetric_crop_applicable",
        "case,q1,1.0,scored,true",
      ].join("\n"),
    );

    expect(dashboard.summary.qualityEvaluatedCases).toBe(0);
    expect(dashboard.metricAggregates.agriculturalAccuracy).toEqual({
      average: null,
      sampleCount: 0,
    });
    expect(dashboard.cases[0].agriculturalDimensions.crop?.score).toBe(1);
    expect(dashboard.cases[0].qualityEvaluated).toBe(false);
  });
});

describe("summary counts and metadata", () => {
  it("T-18 uses parsed case rows, never selected_case_count", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,selected_case_count,technical_pass",
        "case,First,9,true",
        "case,Second,9,false",
      ].join("\n"),
    );

    expect(dashboard.summary.totalCases).toBe(2);
    expect(dashboard.runInformation.totalCases).toBe(2);
    expect(dashboard.runInformation.selectedCaseCount).toBeNull();
  });

  it("T-19 keeps selected_case_count as descriptive metadata", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,run_id,selected_case_count,query,technical_pass",
        "run_metadata,run-9,9,,",
        "case,,,Only parsed case,true",
      ].join("\n"),
    );

    expect(dashboard.summary.totalCases).toBe(1);
    expect(dashboard.runInformation.selectedCaseCount).toBe("9");
    expect(dashboard.runInformation.runId).toBe("run-9");
  });

  it("T-20 counts quality-evaluated cases and evaluation errors once per case", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,error,answerrelevancymetric_score,answerrelevancymetric_status",
        "case,valid no error,,0.5,scored",
        "case,error status,,0.7,evaluation_error",
        "case,not applicable,,,not_applicable",
        "case,error field,boom,0.6,scored",
      ].join("\n"),
    );

    expect(dashboard.summary.totalCases).toBe(4);
    expect(dashboard.summary.qualityEvaluatedCases).toBe(2);
    expect(dashboard.summary.evaluationErrors).toBe(2);
  });

  it("T-28 counts multiple error indicators once and ignores free-text fields", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,error,answerrelevancymetric_score,answerrelevancymetric_status,answerrelevancymetric_error,agriculturalaccuracymetric_crop_error,agriculturalaccuracymetric_crop_status,failure_reason,triage_action,response_text",
        'case,q1,case exploded,0.5,scored,judge timeout,crop lookup failed,error,error in failure reason,error in triage,error in response text',
        'case,q2,,0.5,scored,,,,"error in failure reason","error in triage","error in response text"',
      ].join("\n"),
    );

    expect(dashboard.summary.evaluationErrors).toBe(1);
    expect(dashboard.cases[0].hasEvaluationError).toBe(true);
    expect(dashboard.cases[0].evaluationErrorFields).toEqual(
      expect.arrayContaining([
        "error",
        "answerrelevancymetric_error",
        "agriculturalaccuracymetric_crop_error",
        "agriculturalaccuracymetric_crop_status",
      ]),
    );
    expect(dashboard.cases[1].hasEvaluationError).toBe(false);
    expect(dashboard.cases[1].evaluationErrorFields).toEqual([]);
    // Free-text "error" mentions do not invalidate a valid score.
    expect(dashboard.cases[1].metricDetails.answerRelevancy.score).toBe(0.5);
  });

  it("T-21 builds a valid metadata-only view model", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,run_id,run_started_at,selected_case_count",
        "run_metadata,run-meta,2026-01-01T00:00:00Z,0",
      ].join("\n"),
    );

    expect(dashboard.summary.totalCases).toBe(0);
    expect(dashboard.summary.technicalPassRate.percent).toBeNull();
    expect(dashboard.summary.technicalPassRate.sampleCount).toBe(0);
    expect(dashboard.summary.qualityEvaluatedCases).toBe(0);
    expect(dashboard.summary.evaluationErrors).toBe(0);
    expect(dashboard.cases).toEqual([]);
    expect(dashboard.runInformation).toMatchObject({
      runId: "run-meta",
      selectedCaseCount: "0",
      classification: "metadata_only",
    });
    for (const definition of QUALITY_METRIC_DEFINITIONS) {
      expect(dashboard.metricAggregates[definition.key]).toEqual({
        average: null,
        sampleCount: 0,
      });
    }
  });

  it("T-27 builds a valid scoreless case view model", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,technical_pass",
        "case,q1,true",
        "case,q2,false",
      ].join("\n"),
    );

    expect(dashboard.summary.totalCases).toBe(2);
    expect(dashboard.summary.technicalPassRate.percent).toBe(50);
    expect(dashboard.summary.qualityEvaluatedCases).toBe(0);
    expect(dashboard.summary.evaluationErrors).toBe(0);
    for (const definition of QUALITY_METRIC_DEFINITIONS) {
      expect(dashboard.metricAggregates[definition.key]).toEqual({
        average: null,
        sampleCount: 0,
      });
    }
    expect(dashboard.cases[0].qualitySummary).toBe(
      "No valid quality scores",
    );
  });
});

describe("domain performance matrix", () => {
  it("T-23 renders all six domains, excludes unknown domains, and uses null for absent data", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,observed_domain,answerrelevancymetric_score,answerrelevancymetric_status",
        "case,a,Weather,0.8,scored",
        "case,b,Weather,0.6,scored",
        "case,c,Market Prices,0.6,scored",
        "case,d,Nutrient Management,0.4,scored",
        "case,e,Government Schemes,0.2,scored",
        "case,f,Cultural Practices,0.6,scored",
        "case,g,General,0.4,scored",
        "case,h,Plant Protection,0.9,scored",
      ].join("\n"),
    );

    expect(Object.keys(dashboard.domainPerformance).sort()).toEqual(
      ["GDB", "Greetings", "Market", "Schemes", "Soil", "Weather"].sort(),
    );

    expect(dashboard.domainPerformance.Weather.answerRelevancy).toEqual({
      average: 0.7,
      sampleCount: 2,
    });
    expect(dashboard.domainPerformance.Market.answerRelevancy).toEqual({
      average: 0.6,
      sampleCount: 1,
    });
    expect(dashboard.domainPerformance.Soil.answerRelevancy).toEqual({
      average: 0.4,
      sampleCount: 1,
    });
    expect(dashboard.domainPerformance.Schemes.answerRelevancy).toEqual({
      average: 0.2,
      sampleCount: 1,
    });
    expect(dashboard.domainPerformance.GDB.answerRelevancy).toEqual({
      average: 0.6,
      sampleCount: 1,
    });
    expect(dashboard.domainPerformance.Greetings.answerRelevancy).toEqual({
      average: 0.4,
      sampleCount: 1,
    });
    expect(dashboard.domainPerformance.Weather.faithfulness).toEqual({
      average: null,
      sampleCount: 0,
    });

    expect(dashboard.unknownDomains).toEqual([
      { domain: "Plant Protection", caseCount: 1 },
    ]);
    // The unknown domain still contributes to overall aggregates.
    expect(dashboard.metricAggregates.answerRelevancy.sampleCount).toBe(8);
    expect(dashboard.metricAggregates.answerRelevancy.average).toBeCloseTo(
      4.5 / 8,
    );

    const unknownCase = dashboard.cases.find(
      (caseData) => caseData.domain === "Plant Protection",
    );
    expect(unknownCase?.domainKey).toBeNull();
    expect(unknownCase?.rawDomain).toBe("Plant Protection");
  });

  it("normalizes known domain aliases into the six matrix rows", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,observed_domain,answerrelevancymetric_score,answerrelevancymetric_status",
        "case,a,market prices,0.6,scored",
        "case,b,cultural practices,0.4,scored",
      ].join("\n"),
    );

    expect(dashboard.domainPerformance.Market.answerRelevancy.sampleCount).toBe(
      1,
    );
    expect(dashboard.domainPerformance.GDB.answerRelevancy.sampleCount).toBe(
      1,
    );
    expect(dashboard.unknownDomains).toEqual([]);
  });
});

describe("case view model", () => {
  it("produces data compatible with CaseExplorer", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,run_id,run_started_at,query,observed_domain,technical_pass,final_answer,answerrelevancymetric_score,answerrelevancymetric_reason,answerrelevancymetric_status,faithfulnessmetric_score,faithfulnessmetric_status,agriculturalaccuracymetric_crop_score,agriculturalaccuracymetric_crop_status,agriculturalaccuracymetric_crop_applicable,agriculturalaccuracymetric_crop_reason",
        "case,run-1,2026-01-01T00:00:00Z,Will it rain?,Weather,true,Expect rain.,0.8,Relevant,scored,0.6,scored,1.0,scored,true,Correct crop",
      ].join("\n"),
    );

    const caseData = dashboard.cases[0];
    expect(caseData.id).toBe("case-2");
    expect(caseData.rowNumber).toBe(2);
    expect(caseData.question).toBe("Will it rain?");
    expect(caseData.domain).toBe("Weather");
    expect(caseData.domainKey).toBe("Weather");
    expect(caseData.technicalStatus).toBe("pass");
    expect(caseData.qualitySummary).toContain("2 of 5 metrics");
    expect(caseData.generatedAnswer).toBe("Expect rain.");
    expect(caseData.metrics.answerRelevancy).toMatchObject({
      score: 0.8,
      status: "scored",
      reason: "Relevant",
    });
    expect(caseData.metrics.faithfulness?.score).toBe(0.6);
    expect(
      caseData.agriculturalDimensions.crop,
    ).toMatchObject({
      score: 1,
      status: "scored",
      applicable: true,
      reason: "Correct crop",
    });
    expect(caseData.provenance).toEqual(
      expect.arrayContaining([
        { label: "Run ID", value: "run-1" },
        { label: "Run started at", value: "2026-01-01T00:00:00Z" },
        { label: "Observed domain", value: "Weather" },
      ]),
    );
    expect(caseData.hasEvaluationError).toBe(false);
    expect(caseData.qualityEvaluated).toBe(true);
  });

  it("never presents an evaluation_error score as valid in the case view", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,answerrelevancymetric_score,answerrelevancymetric_status,answerrelevancymetric_reason",
        "case,q1,0.92,evaluation_error,Judge failed to complete evaluation.",
      ].join("\n"),
    );

    const detail = dashboard.cases[0].metrics.answerRelevancy;
    expect(detail?.score).toBeNull();
    expect(detail?.valid).toBe(false);
    expect(detail?.excluded).toBe(true);
    expect(detail?.exclusionReason).toBe("evaluation_error");
    expect(detail?.rawScore).toBe("0.92");
    expect(detail?.numericScore).toBe(0.92);
    expect(detail?.reason).toBe("Judge failed to complete evaluation.");
    expect(dashboard.cases[0].hasEvaluationError).toBe(true);
  });
});

describe("parse -> aggregate integration", () => {
  it("T-22 preserves the previous dashboard unchanged on an invalid upload", () => {
    const good = parseReportText(
      [
        "record_type,query,technical_pass",
        "case,Weather in Ropar?,true",
      ].join("\n"),
    );
    const first: DashboardState | null = commitDashboardParseResult(
      null,
      good,
    );
    expect(first?.dashboard.summary.totalCases).toBe(1);

    const bad = parseReportText(
      ["record_type,query", "case,Weather in Ropar?,unexpected"].join("\n"),
    );
    expect(bad.ok).toBe(false);

    const second = commitDashboardParseResult(first, bad);
    expect(second).toBe(first);
    expect(second?.dashboard.summary.totalCases).toBe(1);
  });

  it("returns null for a rejected parse result", () => {
    const bad = parseReportText("not a report");
    expect(buildDashboardFromParseResult(bad)).toBeNull();
    expect(commitDashboardParseResult(null, bad)).toBeNull();
  });
});

describe("metric prefix contract", () => {
  it("uses the DeepEval ContextualRelevancyMetric name as the report prefix", () => {
    const definition = QUALITY_METRIC_DEFINITIONS.find(
      ({ key }) => key === "contextualRelevancy",
    );

    expect(definition?.prefix).toBe("contextualrelevancymetric");
    expect(
      QUALITY_METRIC_DEFINITIONS.map(({ prefix }) => prefix),
    ).not.toContain("contextualrelevancemetric");
  });

  it("aggregates Contextual Relevancy from contextualrelevancymetric columns", () => {
    const dashboard = dashboardFromCsv(
      [
        "record_type,query,contextualrelevancymetric_score,contextualrelevancymetric_status",
        "case,q1,0.4,scored",
        "case,q2,0.8,scored",
      ].join("\n"),
    );

    expect(
      dashboard.metricAggregates.contextualRelevancy.sampleCount,
    ).toBe(2);
    expect(
      dashboard.metricAggregates.contextualRelevancy.average,
    ).toBeCloseTo(0.6);
  });
});

describe("purity", () => {
  it("does not mutate the parsed report", () => {
    const report = reportFromCsv(
      [
        "record_type,query,technical_pass,observed_domain,answerrelevancymetric_score,answerrelevancymetric_status,agriculturalaccuracymetric_crop_score,agriculturalaccuracymetric_crop_status",
        "case,q1,true,Weather,0.8,scored,1.0,scored",
      ].join("\n"),
    );
    const before = JSON.stringify(report);

    const dashboard = buildDashboardView(report);

    expect(JSON.stringify(report)).toBe(before);
    expect(dashboard.cases[0].metrics).not.toBe(report.cases[0].metrics);
  });
});
