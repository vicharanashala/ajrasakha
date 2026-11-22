import type {
  AgriculturalDimensionFields,
  MetricFields,
} from "./parseReport";

/**
 * Phase 3: pure value normalization for the evaluation dashboard.
 *
 * This module never mutates its inputs and never performs CSV parsing. It
 * implements the closed technical PASS/FAIL vocabulary and the metric
 * validity/error precedence rules from specs/06-evaluation-dashboard.md §7 and
 * the implementation plan §4.
 */

export type TechnicalStatus = "pass" | "fail" | "unavailable";

const TECHNICAL_PASS_VALUES: ReadonlySet<string> = new Set([
  "true",
  "pass",
  "passed",
]);

const TECHNICAL_FAIL_VALUES: ReadonlySet<string> = new Set([
  "false",
  "fail",
  "failed",
]);

/** Trim surrounding whitespace and lowercase; `null` becomes `""`. */
export function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** A value is present only when it is a non-blank string. */
export function isPresent(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Closed technical PASS/FAIL vocabulary (plan §4.1).
 *
 * PASS: `true`, `pass`, `passed`
 * FAIL: `false`, `fail`, `failed`
 *
 * Everything else - including `yes`, `no`, `1`, `0`, `ok`, `success`, blank,
 * and `null` - is unrecognized and maps to `"unavailable"` so it is excluded
 * from the pass-rate denominator.
 */
export function normalizeTechnicalPass(
  value: string | null | undefined,
): TechnicalStatus {
  const token = normalizeText(value);
  if (TECHNICAL_PASS_VALUES.has(token)) return "pass";
  if (TECHNICAL_FAIL_VALUES.has(token)) return "fail";
  return "unavailable";
}

export interface TechnicalPassRate {
  /** `PASS / (PASS + FAIL) * 100`, or `null` when there are no valid outcomes. */
  percent: number | null;
  /** Number of valid outcomes (PASS + FAIL) used as the denominator. */
  sampleCount: number;
  passCount: number;
  failCount: number;
}

export function computeTechnicalPassRate(
  statuses: readonly TechnicalStatus[],
): TechnicalPassRate {
  let passCount = 0;
  let failCount = 0;

  for (const status of statuses) {
    if (status === "pass") passCount += 1;
    else if (status === "fail") failCount += 1;
  }

  const sampleCount = passCount + failCount;
  return {
    percent: sampleCount === 0 ? null : (passCount / sampleCount) * 100,
    sampleCount,
    passCount,
    failCount,
  };
}

export function summarizeTechnicalPass(
  values: readonly (string | null | undefined)[],
): TechnicalPassRate {
  return computeTechnicalPassRate(values.map(normalizeTechnicalPass));
}

/** Canonical status buckets used by aggregates and the case view model. */
export type MetricStatusKind =
  | "scored"
  | "not_applicable"
  | "disabled"
  | "missing"
  | "evaluation_error"
  | "unavailable";

export type MetricExclusionReason =
  | "evaluation_error"
  | "not_applicable"
  | "disabled"
  | "missing"
  | "invalid_score"
  | "out_of_range";

const EXPLICIT_ERROR_STATUSES: ReadonlySet<string> = new Set([
  "error",
  "evaluation_error",
]);

const NOT_APPLICABLE_STATUSES: ReadonlySet<string> = new Set([
  "not_applicable",
  "not applicable",
  "n/a",
  "na",
]);

const DISABLED_STATUSES: ReadonlySet<string> = new Set(["disabled"]);

const MISSING_STATUSES: ReadonlySet<string> = new Set([
  "missing",
  "unavailable",
]);

/**
 * An explicit error status excludes a numeric score from averages regardless
 * of its value. The spec/plan name `error` and `evaluation_error`.
 */
export function isExplicitErrorStatus(
  value: string | null | undefined,
): boolean {
  return EXPLICIT_ERROR_STATUSES.has(normalizeText(value));
}

export function normalizeMetricStatus(
  value: string | null | undefined,
): MetricStatusKind {
  const token = normalizeText(value);
  if (token === "scored" || token === "scored_zero") return "scored";
  if (EXPLICIT_ERROR_STATUSES.has(token)) return "evaluation_error";
  if (NOT_APPLICABLE_STATUSES.has(token)) return "not_applicable";
  if (DISABLED_STATUSES.has(token)) return "disabled";
  if (MISSING_STATUSES.has(token)) return "missing";
  // Blank or ambiguous status: display falls back to "Unavailable", but a
  // finite score is still valid (plan §4.2 rule 3).
  return "unavailable";
}

const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Parse a finite base-10 number. Hex/Infinity/NaN and other non-decimal spellings
 * are rejected rather than being coerced by `Number`.
 */
export function parseFiniteNumber(
  value: string | null | undefined,
): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const token = value.trim();
  if (!NUMERIC_PATTERN.test(token)) return null;
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface NormalizedMetric {
  /** Raw `[prefix]_score` cell, preserved exactly as parsed. */
  rawScore: string | null;
  /** Parsed finite number, even when it is excluded or out of range. */
  numericScore: number | null;
  /** Valid normalized score in `[0, 1]`, or `null` when excluded. */
  score: number | null;
  valid: boolean;
  excluded: boolean;
  exclusionReason: MetricExclusionReason | null;
  rawStatus: string | null;
  normalizedStatus: MetricStatusKind;
  isErrorStatus: boolean;
  reason: string | null;
  error: string | null;
  /** Informational only; never affects technical or metric aggregation. */
  passed: string | null;
}

function exclusionReasonForStatus(
  status: MetricStatusKind,
): MetricExclusionReason | null {
  if (status === "evaluation_error") return "evaluation_error";
  if (status === "not_applicable") return "not_applicable";
  if (status === "disabled") return "disabled";
  if (status === "missing") return "missing";
  return null;
}

/**
 * Apply metric validity and error precedence (plan §4.2):
 * 1. explicit error status -> excluded
 * 2. not_applicable/N/A/disabled/missing -> excluded
 * 3. otherwise a finite numeric score in `[0, 1]`, including `0.0`, is valid.
 *
 * `[prefix]_passed` and `[prefix]_reason` are informational and never affect
 * validity. `[prefix]_error` is preserved for error counting/display but does
 * not override a scored status by itself.
 */
export function normalizeMetric(fields: MetricFields): NormalizedMetric {
  const rawScore = fields.score ?? null;
  const rawStatus = fields.status ?? null;
  const numericScore = parseFiniteNumber(rawScore);
  const normalizedStatus = normalizeMetricStatus(rawStatus);
  const statusExclusion = exclusionReasonForStatus(normalizedStatus);

  let exclusionReason: MetricExclusionReason | null = statusExclusion;
  if (exclusionReason === null) {
    if (numericScore === null) {
      exclusionReason = "invalid_score";
    } else if (numericScore < 0 || numericScore > 1) {
      exclusionReason = "out_of_range";
    }
  }

  const valid = exclusionReason === null;
  return {
    rawScore,
    numericScore,
    score: valid ? numericScore : null,
    valid,
    excluded: !valid,
    exclusionReason,
    rawStatus,
    normalizedStatus,
    isErrorStatus: normalizedStatus === "evaluation_error",
    reason: fields.reason ?? null,
    error: fields.error ?? null,
    passed: fields.passed ?? null,
  };
}

export function isValidMetricScore(fields: MetricFields): boolean {
  return normalizeMetric(fields).valid;
}

export type Applicability = boolean | null;

/** Normalize auxiliary applicability flags without guessing. */
export function parseApplicability(
  value: string | null | undefined,
): Applicability {
  const token = normalizeText(value);
  if (token === "") return null;
  if (token === "true" || token === "yes" || token === "1" || token === "applicable") {
    return true;
  }
  if (
    token === "false" ||
    token === "no" ||
    token === "0" ||
    token === "not_applicable" ||
    token === "not applicable" ||
    token === "inapplicable"
  ) {
    return false;
  }
  return null;
}

export interface NormalizedAgriculturalDimension extends NormalizedMetric {
  rawApplicable: string | null;
  applicable: Applicability;
}

/**
 * Normalize an auxiliary Agricultural Accuracy dimension. Dimension scores are
 * display-only and are never added to aggregate metric averages.
 */
export function normalizeAgriculturalDimension(
  fields: AgriculturalDimensionFields,
): NormalizedAgriculturalDimension {
  const metric = normalizeMetric(fields);
  const applicable = parseApplicability(fields.applicable);

  if (applicable === false && !metric.isErrorStatus) {
    return {
      ...metric,
      rawApplicable: fields.applicable ?? null,
      applicable,
      score: null,
      valid: false,
      excluded: true,
      exclusionReason: "not_applicable",
    };
  }

  return {
    ...metric,
    rawApplicable: fields.applicable ?? null,
    applicable,
  };
}

export const EVALUATION_DOMAINS = [
  "Weather",
  "Market",
  "Soil",
  "Schemes",
  "GDB",
  "Greetings",
] as const;

export type EvaluationDomain = (typeof EVALUATION_DOMAINS)[number];

/**
 * Explicit aliases for domain labels emitted by the evaluation pipeline.
 * Anything not listed here is an unknown domain: it is preserved on the case
 * and is never silently folded into one of the six matrix rows.
 */
const DOMAIN_ALIASES: Readonly<Record<string, EvaluationDomain>> = {
  weather: "Weather",
  market: "Market",
  "market price": "Market",
  "market prices": "Market",
  soil: "Soil",
  "nutrient management": "Soil",
  schemes: "Schemes",
  scheme: "Schemes",
  "government schemes": "Schemes",
  "government scheme": "Schemes",
  gdb: "GDB",
  "cultural practices": "GDB",
  greetings: "Greetings",
  greeting: "Greetings",
  general: "Greetings",
};

function normalizeDomainToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Map a raw domain label to one of the six matrix domains, or `null`. */
export function normalizeDomain(
  value: string | null | undefined,
): EvaluationDomain | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const token = normalizeDomainToken(value);
  return DOMAIN_ALIASES[token] ?? null;
}
