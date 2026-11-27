import type {
  AgriculturalDimensionDetail,
  CaseMetricDetail,
  CaseProvenanceItem,
  EvaluationCase,
} from "./CaseExplorer";
import type { MetricAggregate, QualityMetricKey } from "./MetricCards";
import type { SummaryStatsData } from "./SummaryStats";
import {
  AGRICULTURAL_ACCURACY_PREFIX,
  applyReportParseResult,
  type AgriculturalDimension,
  type MetricFields,
  type ParsedCase,
  type ParsedReport,
  type ParseWarning,
  type ReportParseResult,
} from "./parseReport";
import {
  EVALUATION_DOMAINS,
  computeTechnicalPassRate,
  isExplicitErrorStatus,
  isPresent,
  normalizeAgriculturalDimension,
  normalizeDomain,
  normalizeMetric,
  normalizeTechnicalPass,
  type EvaluationDomain,
  type MetricExclusionReason,
  type MetricStatusKind,
  type NormalizedAgriculturalDimension,
  type NormalizedMetric,
  type TechnicalPassRate,
  type TechnicalStatus,
} from "./normalize";

/**
 * Phase 3: pure aggregation layer. It accepts a `ParsedReport` and returns a
 * dashboard-ready view model without mutating the report or its cases.
 */

export interface QualityMetricDefinition {
  key: QualityMetricKey;
  prefix: string;
  label: string;
}

/** Exactly the five aggregate quality metrics supported by the dashboard. */
export const QUALITY_METRIC_DEFINITIONS: readonly QualityMetricDefinition[] = [
  {
    key: "answerRelevancy",
    prefix: "answerrelevancymetric",
    label: "Answer Relevancy",
  },
  {
    key: "faithfulness",
    prefix: "faithfulnessmetric",
    label: "Faithfulness",
  },
  {
    key: "contextualRelevancy",
    prefix: "contextualrelevancymetric",
    label: "Contextual Relevancy",
  },
  {
    key: "gdbMatch",
    prefix: "gdbmatchmetric",
    label: "GDB Match",
  },
  {
    key: "agriculturalAccuracy",
    prefix: AGRICULTURAL_ACCURACY_PREFIX,
    label: "Agricultural Accuracy",
  },
];

export type MetricAggregates = Record<QualityMetricKey, MetricAggregate>;

export type DomainPerformance = Record<
  EvaluationDomain,
  Record<QualityMetricKey, MetricAggregate>
>;

export interface UnknownDomainSummary {
  /** Raw domain label, preserved for case details and diagnostics. */
  domain: string;
  caseCount: number;
}

export interface DashboardRunInformation {
  runId: string | null;
  runStartedAt: string | null;
  /** Descriptive metadata only; never used as the parsed case count. */
  selectedCaseCount: string | null;
  metadataRowCount: number;
  totalCases: number;
  classification: ParsedReport["classification"];
}

export interface DashboardSummary extends SummaryStatsData {
  technicalPassRate: TechnicalPassRate;
}

export interface DashboardCaseMetricDetail extends CaseMetricDetail {
  /** Raw score cell, preserved exactly as parsed. */
  rawScore: string | null;
  /** Parsed finite number, even when excluded or out of range. */
  numericScore: number | null;
  valid: boolean;
  excluded: boolean;
  exclusionReason: MetricExclusionReason | null;
  rawStatus: string | null;
  normalizedStatus: MetricStatusKind;
  /** Informational only; never aggregated. */
  passed: string | null;
}

export interface DashboardDimensionDetail
  extends AgriculturalDimensionDetail {
  rawScore: string | null;
  numericScore: number | null;
  valid: boolean;
  excluded: boolean;
  exclusionReason: MetricExclusionReason | null;
  rawStatus: string | null;
  normalizedStatus: MetricStatusKind;
  passed: string | null;
  rawApplicable: string | null;
  applicable: boolean | null;
}

/**
 * A case shaped for `CaseExplorer` plus the normalized details Phase 4 may
 * render. Excluded scores are `null`; the raw value is kept in `rawScore`.
 */
export interface DashboardCase extends EvaluationCase {
  rowNumber: number;
  rawDomain: string | null;
  domainKey: EvaluationDomain | null;
  technicalRaw: string | null;
  technicalStatus: TechnicalStatus;
  qualityEvaluated: boolean;
  hasEvaluationError: boolean;
  /** Enumerated fields that triggered the case-level error flag (allowlist). */
  evaluationErrorFields: string[];
  metricDetails: Record<QualityMetricKey, DashboardCaseMetricDetail>;
  metrics: Partial<Record<QualityMetricKey, DashboardCaseMetricDetail>>;
  agriculturalDimensions: Partial<
    Record<AgriculturalDimension, DashboardDimensionDetail>
  >;
  provenance: CaseProvenanceItem[];
}

export interface DashboardViewModel {
  summary: DashboardSummary;
  metricAggregates: MetricAggregates;
  domainPerformance: DomainPerformance;
  cases: DashboardCase[];
  runInformation: DashboardRunInformation;
  /** Domains present in the report that do not map to the six matrix rows. */
  unknownDomains: UnknownDomainSummary[];
  warnings: ParseWarning[];
}

export interface DashboardState {
  report: ParsedReport;
  dashboard: DashboardViewModel;
}

interface MetricAccumulator {
  sum: number;
  count: number;
}

function createMetricAccumulator(): MetricAccumulator {
  return { sum: 0, count: 0 };
}

function createAggregates(): Record<QualityMetricKey, MetricAccumulator> {
  return Object.fromEntries(
    QUALITY_METRIC_DEFINITIONS.map(({ key }) => [key, createMetricAccumulator()]),
  ) as Record<QualityMetricKey, MetricAccumulator>;
}

function toAggregate(accumulator: MetricAccumulator): MetricAggregate {
  return {
    average:
      accumulator.count === 0 ? null : accumulator.sum / accumulator.count,
    sampleCount: accumulator.count,
  };
}

function toAggregateRecord(
  accumulators: Record<QualityMetricKey, MetricAccumulator>,
): Record<QualityMetricKey, MetricAggregate> {
  return Object.fromEntries(
    QUALITY_METRIC_DEFINITIONS.map(({ key }) => [
      key,
      toAggregate(accumulators[key]),
    ]),
  ) as Record<QualityMetricKey, MetricAggregate>;
}

function textOrNull(value: string | null | undefined): string | null {
  return isPresent(value) ? value!.trim() : null;
}

const EMPTY_METRIC_FIELDS: MetricFields = {
  score: null,
  status: null,
  reason: null,
  passed: null,
  error: null,
};

/**
 * Resolve a known metric prefix case-insensitively against the prefixes the
 * parser actually discovered. `report.py` emits lowercase prefixes, but this
 * keeps hand-edited reports predictable without changing parser behaviour.
 */
function resolveMetricFields(
  parsedCase: ParsedCase,
  prefix: string,
  prefixLookup: ReadonlyMap<string, string>,
): MetricFields {
  const actual = prefixLookup.get(prefix.toLowerCase()) ?? prefix;
  return parsedCase.metrics[actual] ?? EMPTY_METRIC_FIELDS;
}

function toDashboardMetricDetail(
  normalized: NormalizedMetric,
): DashboardCaseMetricDetail {
  return {
    score: normalized.score,
    status: textOrNull(normalized.rawStatus),
    reason: normalized.reason,
    error: normalized.error,
    rawScore: normalized.rawScore,
    numericScore: normalized.numericScore,
    valid: normalized.valid,
    excluded: normalized.excluded,
    exclusionReason: normalized.exclusionReason,
    rawStatus: normalized.rawStatus,
    normalizedStatus: normalized.normalizedStatus,
    passed: normalized.passed,
  };
}

function toDashboardDimensionDetail(
  normalized: NormalizedAgriculturalDimension,
): DashboardDimensionDetail {
  return {
    ...toDashboardMetricDetail(normalized),
    rawApplicable: normalized.rawApplicable,
    applicable: normalized.applicable,
  };
}

const PROVENANCE_FIELDS: readonly { field: string; label: string }[] = [
  { field: "name", label: "Case name" },
  { field: "run_id", label: "Run ID" },
  { field: "run_started_at", label: "Run started at" },
  { field: "evaluation_mode", label: "Evaluation mode" },
  { field: "expected_domain", label: "Expected domain" },
  { field: "observed_domain", label: "Observed domain" },
  { field: "technical_pass", label: "Technical pass (raw)" },
  { field: "http_status", label: "HTTP status" },
  { field: "graph_status", label: "Graph status" },
  { field: "latency_seconds", label: "Latency (seconds)" },
  { field: "routing_pass", label: "Routing pass" },
  { field: "tool_pass", label: "Tool pass" },
  { field: "plan_pass", label: "Plan pass" },
  { field: "node_pass", label: "Node pass" },
  { field: "source_attribution_pass", label: "Source attribution pass" },
  { field: "trace_url", label: "Trace URL" },
  { field: "error", label: "Case error" },
  { field: "failure_reason", label: "Failure reason" },
  { field: "triage_category", label: "Triage category" },
  { field: "triage_action", label: "Triage action" },
  { field: "severity", label: "Severity" },
];

function buildProvenance(
  record: Readonly<Record<string, string>>,
): CaseProvenanceItem[] {
  return PROVENANCE_FIELDS.flatMap(({ field, label }) => {
    const value = record[field];
    return value == null ? [] : [{ label, value }];
  });
}

/**
 * Enumerated error indicators (plan §4.3). Arbitrary text fields such as
 * `failure_reason`, `triage_action`, and `response_text` are never scanned for
 * the word "error".
 */
function collectEvaluationErrorFields(
  parsedCase: ParsedCase,
  prefixLookup: ReadonlyMap<string, string>,
): string[] {
  const fields: string[] = [];

  if (isPresent(parsedCase.record.error)) {
    fields.push("error");
  }

  // Every discovered aggregate prefix, not only the five known metrics, so a
  // custom metric's explicit error still counts once for the case.
  for (const [actualPrefix] of prefixLookup) {
    const metric = parsedCase.metrics[actualPrefix];
    if (!metric) continue;
    if (isPresent(metric.error)) fields.push(`${actualPrefix}_error`);
    if (isExplicitErrorStatus(metric.status)) {
      fields.push(`${actualPrefix}_status`);
    }
  }

  for (const [dimension, dimensionFields] of Object.entries(
    parsedCase.agriculturalDimensions,
  )) {
    if (!dimensionFields) continue;
    const prefix = `${AGRICULTURAL_ACCURACY_PREFIX}_${dimension}`;
    if (isPresent(dimensionFields.error)) fields.push(`${prefix}_error`);
    if (isExplicitErrorStatus(dimensionFields.status)) {
      fields.push(`${prefix}_status`);
    }
  }

  return [...new Set(fields)];
}

function buildQualitySummary(
  metricDetails: Record<QualityMetricKey, DashboardCaseMetricDetail>,
): string {
  const details = QUALITY_METRIC_DEFINITIONS.map(
    ({ key }) => metricDetails[key],
  );
  const valid = details.filter((detail) => detail.valid);

  if (valid.length === 0) {
    return "No valid quality scores";
  }

  const average =
    valid.reduce((sum, detail) => sum + (detail.score ?? 0), 0) / valid.length;
  const errorCount = details.filter(
    (detail) => detail.exclusionReason === "evaluation_error",
  ).length;

  return `${valid.length} of 5 metrics · average ${average.toFixed(2)}${
    errorCount > 0
      ? ` · ${errorCount} metric error${errorCount === 1 ? "" : "s"}`
      : ""
  }`;
}

function metricFieldsFor(
  parsedCase: ParsedCase,
  prefix: string,
  prefixLookup: ReadonlyMap<string, string>,
): MetricFields {
  return resolveMetricFields(parsedCase, prefix, prefixLookup);
}

/**
 * Build the complete dashboard view model. Pure: the input report is never
 * mutated, and every nested value in the result is newly created.
 */
export function buildDashboardView(
  report: ParsedReport,
): DashboardViewModel {
  const prefixLookup = new Map<string, string>();
  for (const prefix of report.metricPrefixes) {
    prefixLookup.set(prefix.toLowerCase(), prefix);
  }

  const overallAccumulators = createAggregates();
  const domainAccumulators = Object.fromEntries(
    EVALUATION_DOMAINS.map((domain) => [domain, createAggregates()]),
  ) as Record<EvaluationDomain, Record<QualityMetricKey, MetricAccumulator>>;

  const technicalStatuses: TechnicalStatus[] = [];
  const unknownDomainMap = new Map<
    string,
    { domain: string; caseCount: number }
  >();

  let qualityEvaluatedCases = 0;
  let evaluationErrors = 0;

  const cases: DashboardCase[] = report.cases.map((parsedCase) => {
    const technicalRaw = parsedCase.record.technical_pass ?? null;
    const technicalStatus = normalizeTechnicalPass(technicalRaw);
    technicalStatuses.push(technicalStatus);

    const rawDomain = textOrNull(parsedCase.record.observed_domain);
    const domainKey = normalizeDomain(rawDomain);

    const metricDetails = Object.fromEntries(
      QUALITY_METRIC_DEFINITIONS.map(({ key, prefix }) => [
        key,
        toDashboardMetricDetail(
          normalizeMetric(metricFieldsFor(parsedCase, prefix, prefixLookup)),
        ),
      ]),
    ) as Record<QualityMetricKey, DashboardCaseMetricDetail>;

    let caseHasValidScore = false;
    for (const { key } of QUALITY_METRIC_DEFINITIONS) {
      const detail = metricDetails[key];
      if (!detail.valid || detail.score === null) continue;

      caseHasValidScore = true;
      overallAccumulators[key].sum += detail.score;
      overallAccumulators[key].count += 1;

      if (domainKey) {
        domainAccumulators[domainKey][key].sum += detail.score;
        domainAccumulators[domainKey][key].count += 1;
      }
    }

    if (caseHasValidScore) qualityEvaluatedCases += 1;

    if (!domainKey && rawDomain) {
      const unknownKey = rawDomain.toLowerCase().replace(/\s+/g, " ");
      const existing = unknownDomainMap.get(unknownKey);
      if (existing) existing.caseCount += 1;
      else unknownDomainMap.set(unknownKey, { domain: rawDomain, caseCount: 1 });
    }

    const agriculturalDimensions = Object.fromEntries(
      Object.entries(parsedCase.agriculturalDimensions).flatMap(
        ([dimension, fields]) =>
          fields == null
            ? []
            : [
                [
                  dimension,
                  toDashboardDimensionDetail(
                    normalizeAgriculturalDimension(fields),
                  ),
                ],
              ],
      ),
    ) as Partial<
      Record<AgriculturalDimension, DashboardDimensionDetail>
    >;

    const evaluationErrorFields = collectEvaluationErrorFields(
      parsedCase,
      prefixLookup,
    );
    const hasEvaluationError = evaluationErrorFields.length > 0;
    if (hasEvaluationError) evaluationErrors += 1;

    return {
      id: `case-${parsedCase.rowNumber}`,
      rowNumber: parsedCase.rowNumber,
      question: textOrNull(parsedCase.record.query),
      domain: rawDomain,
      rawDomain,
      domainKey,
      technicalRaw,
      technicalStatus,
      qualityEvaluated: caseHasValidScore,
      hasEvaluationError,
      evaluationErrorFields,
      qualitySummary: buildQualitySummary(metricDetails),
      generatedAnswer: textOrNull(parsedCase.record.final_answer),
      metrics: metricDetails,
      metricDetails,
      agriculturalDimensions,
      provenance: buildProvenance(parsedCase.record),
    };
  });

  return {
    summary: {
      totalCases: report.cases.length,
      technicalPassRate: computeTechnicalPassRate(technicalStatuses),
      qualityEvaluatedCases,
      evaluationErrors,
    },
    metricAggregates: toAggregateRecord(overallAccumulators),
    domainPerformance: Object.fromEntries(
      EVALUATION_DOMAINS.map((domain) => [
        domain,
        toAggregateRecord(domainAccumulators[domain]),
      ]),
    ) as DomainPerformance,
    cases,
    runInformation: {
      runId: report.metadata?.runId ?? null,
      runStartedAt: report.metadata?.runStartedAt ?? null,
      selectedCaseCount: report.metadata?.selectedCaseCount ?? null,
      metadataRowCount: report.metadataRows.length,
      totalCases: report.cases.length,
      classification: report.classification,
    },
    unknownDomains: [...unknownDomainMap.values()],
    warnings: report.warnings,
  };
}

/** Aggregate a successful parse result; `null` for rejected uploads. */
export function buildDashboardFromParseResult(
  result: ReportParseResult,
): DashboardState | null {
  if (!result.ok) return null;
  return {
    report: result.report,
    dashboard: buildDashboardView(result.report),
  };
}

/**
 * Parse -> aggregate commit helper. A rejected upload returns the current state
 * object unchanged (same identity), so callers cannot accidentally replace a
 * valid report with a partially parsed one. No React state is wired here.
 */
export function commitDashboardParseResult(
  current: DashboardState | null,
  result: ReportParseResult,
): DashboardState | null {
  const report = applyReportParseResult(current?.report ?? null, result);
  if (report === null) return null;
  if (current && report === current.report) return current;
  return { report, dashboard: buildDashboardView(report) };
}

/**
 * Compile-time contract check: each view-model slice must remain assignable to
 * the existing component prop types, so drift fails `tsc` rather than silently
 * breaking Phase 4 wiring. `AssertExtends` has no runtime output.
 */
type AssertExtends<T extends U, U> = T extends U ? true : never;

type SummaryStatsProp = Parameters<
  typeof import("./SummaryStats").SummaryStats
>[0]["data"];
type MetricCardsProp = Parameters<
  typeof import("./MetricCards").MetricCards
>[0]["metrics"];
type DomainMatrixProp = Parameters<
  typeof import("./DomainPerformanceMatrix").DomainPerformanceMatrix
>[0]["data"];
type CaseExplorerProp = Parameters<
  typeof import("./CaseExplorer").CaseExplorer
>[0]["cases"];

export type ComponentContractCheck = [
  AssertExtends<DashboardSummary, SummaryStatsProp>,
  AssertExtends<MetricAggregates, MetricCardsProp>,
  AssertExtends<DomainPerformance, DomainMatrixProp>,
  AssertExtends<DashboardCase, CaseExplorerProp[number]>,
];
