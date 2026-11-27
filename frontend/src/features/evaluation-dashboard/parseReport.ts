import Papa from "papaparse";

/**
 * Phase 2: CSV parsing and structural validation for the evaluation
 * dashboard. This module deliberately does not normalize values or compute
 * aggregates - those belong to Phase 3.
 */

export const RECORD_TYPE_FIELD = "record_type";

export const RECORD_TYPE_CASE = "case";
export const RECORD_TYPE_RUN_METADATA = "run_metadata";

export const AGRICULTURAL_ACCURACY_PREFIX = "agriculturalaccuracymetric";

export type AgriculturalDimension =
  | "crop"
  | "region"
  | "cultivation_guidance";

export const AGRICULTURAL_DIMENSIONS: readonly AgriculturalDimension[] = [
  "crop",
  "region",
  "cultivation_guidance",
];

export type MetricFieldName =
  | "score"
  | "status"
  | "reason"
  | "passed"
  | "error";

export const METRIC_FIELD_NAMES: readonly MetricFieldName[] = [
  "score",
  "status",
  "reason",
  "passed",
  "error",
];

/**
 * A metric field is `null` when its column is absent from the CSV and an
 * empty string when the column exists but the cell is blank. Preserving that
 * distinction lets later phases render "Unavailable" without guessing.
 */
export type MetricFields = Record<MetricFieldName, string | null>;

export interface AgriculturalDimensionFields extends MetricFields {
  applicable: string | null;
}

export interface ParsedCase {
  /** 1-based row number in the uploaded file (header is row 1). */
  rowNumber: number;
  /** Every CSV field for this case, keyed by header. */
  record: Readonly<Record<string, string>>;
  /** Dynamically discovered metric prefixes and their raw sub-fields. */
  metrics: Readonly<Record<string, MetricFields>>;
  /** Auxiliary Agricultural Accuracy dimensions, when present. */
  agriculturalDimensions: Partial<
    Record<AgriculturalDimension, AgriculturalDimensionFields>
  >;
}

export interface ReportMetadata {
  runId: string | null;
  runStartedAt: string | null;
  /**
   * Raw `selected_case_count` metadata. It is descriptive only and is never
   * used as the parsed case count.
   */
  selectedCaseCount: string | null;
  /** Every CSV field for this metadata row, keyed by header. */
  record: Readonly<Record<string, string>>;
}

/**
 * Class A (metadata-only) and class B (a valid case report, including one
 * with no quality scores) from the implementation plan. Class C is never
 * returned as a successful parse.
 */
export type ReportClassification = "metadata_only" | "case_report";

export interface ParseWarning {
  code: "unknown_record_type" | "warnings_truncated";
  message: string;
  rowNumber?: number;
}

export interface ParsedReport {
  classification: ReportClassification;
  /** Normalized header names, in file order. */
  headers: string[];
  /** First metadata row, when present. */
  metadata: ReportMetadata | null;
  /** All metadata rows, in file order. */
  metadataRows: ReportMetadata[];
  /** Parsed evaluation cases, in file order. */
  cases: ParsedCase[];
  /** Dynamically discovered metric prefixes, in header order. */
  metricPrefixes: string[];
  /** Non-fatal issues (currently unknown record types). */
  warnings: ParseWarning[];
}

export type ReportParseErrorCode =
  | "file_read_error"
  | "malformed_csv"
  | "missing_record_type_header"
  | "no_recognized_record_types";

export interface ReportParseError {
  code: ReportParseErrorCode;
  message: string;
  rowNumber?: number;
}

export type ReportParseResult =
  | { ok: true; report: ParsedReport }
  | { ok: false; error: ReportParseError };

const MAX_WARNINGS = 100;

function failure(
  code: ReportParseErrorCode,
  message: string,
  rowNumber?: number,
): ReportParseResult {
  return { ok: false, error: { code, message, rowNumber } };
}

function normalizeHeaderName(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

function valueOrNull(record: Readonly<Record<string, string>>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return null;
  const value = record[key];
  return value === "" ? null : value;
}

function metricFields(
  record: Readonly<Record<string, string>>,
  prefix: string,
): MetricFields {
  const fields = {} as MetricFields;
  for (const fieldName of METRIC_FIELD_NAMES) {
    fields[fieldName] = valueOrNull(record, `${prefix}_${fieldName}`);
  }
  return fields;
}

function dimensionFields(
  record: Readonly<Record<string, string>>,
  dimension: AgriculturalDimension,
): AgriculturalDimensionFields {
  const prefix = `${AGRICULTURAL_ACCURACY_PREFIX}_${dimension}`;
  return {
    ...metricFields(record, prefix),
    applicable: valueOrNull(record, `${prefix}_applicable`),
  };
}

function isDimensionMetricPrefix(prefix: string): boolean {
  return prefix.startsWith(`${AGRICULTURAL_ACCURACY_PREFIX}_`);
}

function discoverMetricPrefixes(headers: string[]): string[] {
  const prefixes: string[] = [];
  const seen = new Set<string>();

  for (const header of headers) {
    const match = /^(.+)_(score|status)$/.exec(header);
    if (!match) continue;

    const prefix = match[1];
    // Dimension columns belong to the Agricultural Accuracy aggregate; they
    // are exposed separately and must not become top-level metrics.
    if (isDimensionMetricPrefix(prefix)) continue;
    if (seen.has(prefix)) continue;

    seen.add(prefix);
    prefixes.push(prefix);
  }

  return prefixes;
}

function discoverAgriculturalDimensions(
  headers: string[],
): AgriculturalDimension[] {
  const dimensions: AgriculturalDimension[] = [];

  for (const dimension of AGRICULTURAL_DIMENSIONS) {
    const prefix = `${AGRICULTURAL_ACCURACY_PREFIX}_${dimension}_`;
    if (headers.some((header) => header.startsWith(prefix))) {
      dimensions.push(dimension);
    }
  }

  return dimensions;
}

function toRecord(
  headers: string[],
  row: string[],
): Record<string, string> {
  return Object.fromEntries(
    headers.map((header, index) => [header, row[index] ?? ""]),
  );
}

function toMetadata(record: Readonly<Record<string, string>>): ReportMetadata {
  return {
    runId: valueOrNull(record, "run_id"),
    runStartedAt: valueOrNull(record, "run_started_at"),
    selectedCaseCount: valueOrNull(record, "selected_case_count"),
    record,
  };
}

/**
 * Parse and structurally validate an evaluation CSV. Never returns partial
 * data on failure, so callers cannot accidentally replace a valid report with
 * a partially parsed one.
 */
export function parseReportText(csvText: string): ReportParseResult {
  if (typeof csvText !== "string") {
    return failure("malformed_csv", "The uploaded file could not be read as text.");
  }

  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;

  // Parse as arrays first so row width can be validated against the header
  // exactly. PapaParse reports some structural problems (unterminated quotes)
  // through `errors`; ragged rows are detected by the width check below.
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
  });

  const structuralError = parsed.errors.find(
    (error) => error.code !== "UndetectableDelimiter",
  );
  if (structuralError) {
    return failure(
      "malformed_csv",
      `CSV structure is invalid: ${structuralError.message}`,
      typeof structuralError.row === "number"
        ? structuralError.row + 2
        : undefined,
    );
  }

  if (parsed.data.length === 0) {
    return failure(
      "missing_record_type_header",
      `CSV is missing the required "${RECORD_TYPE_FIELD}" header.`,
    );
  }

  const headers = parsed.data[0].map(normalizeHeaderName);
  if (new Set(headers).size !== headers.length) {
    return failure(
      "malformed_csv",
      "CSV structure is invalid: duplicate header names are not supported.",
    );
  }

  if (!headers.includes(RECORD_TYPE_FIELD)) {
    return failure(
      "missing_record_type_header",
      `CSV is missing the required "${RECORD_TYPE_FIELD}" header.`,
    );
  }

  const metricPrefixes = discoverMetricPrefixes(headers);
  const dimensions = discoverAgriculturalDimensions(headers);

  const metadataRows: ReportMetadata[] = [];
  const cases: ParsedCase[] = [];
  const warnings: ParseWarning[] = [];
  let warningsTruncated = false;

  const pushWarning = (warning: ParseWarning) => {
    if (warnings.length < MAX_WARNINGS) {
      warnings.push(warning);
    } else {
      warningsTruncated = true;
    }
  };

  for (let index = 1; index < parsed.data.length; index += 1) {
    const row = parsed.data[index];
    const rowNumber = index + 1;

    // A recognized row with an inconsistent field shape is unreadable; reject
    // the entire upload rather than silently dropping or padding fields.
    if (!Array.isArray(row) || row.length !== headers.length) {
      return failure(
        "malformed_csv",
        `Row ${rowNumber} has ${row.length} fields but the header has ${headers.length}.`,
        rowNumber,
      );
    }

    const record = toRecord(headers, row);
    const recordType = record[RECORD_TYPE_FIELD];

    if (recordType === RECORD_TYPE_CASE) {
      const metrics = Object.fromEntries(
        metricPrefixes.map((prefix) => [prefix, metricFields(record, prefix)]),
      );

      const agriculturalDimensions = Object.fromEntries(
        dimensions.map((dimension) => [
          dimension,
          dimensionFields(record, dimension),
        ]),
      ) as Partial<
        Record<AgriculturalDimension, AgriculturalDimensionFields>
      >;

      cases.push({
        rowNumber,
        record,
        metrics,
        agriculturalDimensions,
      });
      continue;
    }

    if (recordType === RECORD_TYPE_RUN_METADATA) {
      metadataRows.push(toMetadata(record));
      continue;
    }

    pushWarning({
      code: "unknown_record_type",
      message: `Row ${rowNumber} has unknown record_type ${JSON.stringify(
        recordType,
      )}; the row was skipped.`,
      rowNumber,
    });
  }

  if (warningsTruncated) {
    warnings.push({
      code: "warnings_truncated",
      message: `More than ${MAX_WARNINGS} warnings were produced; additional warnings were suppressed.`,
    });
  }

  if (cases.length === 0 && metadataRows.length === 0) {
    return failure(
      "no_recognized_record_types",
      `No recognized record_type values were found (expected "${RECORD_TYPE_CASE}" or "${RECORD_TYPE_RUN_METADATA}").`,
    );
  }

  return {
    ok: true,
    report: {
      classification: cases.length > 0 ? "case_report" : "metadata_only",
      headers,
      metadata: metadataRows[0] ?? null,
      metadataRows,
      cases,
      metricPrefixes,
      warnings,
    },
  };
}

function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is not available in this environment."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed."));
    reader.readAsText(file);
  });
}

/**
 * Parse a user-selected CSV file. File-read and validation failures are
 * returned as typed results rather than thrown so the UI can show an error
 * banner while keeping the previously loaded report.
 */
export async function parseReport(file: Blob): Promise<ReportParseResult> {
  let text: string;
  try {
    text = await readFileText(file);
  } catch (error) {
    return failure(
      "file_read_error",
      error instanceof Error
        ? `The file could not be read: ${error.message}`
        : "The file could not be read.",
    );
  }

  return parseReportText(text);
}

/**
 * Commit a parse result into dashboard state. Successful parses replace the
 * current report; rejected uploads leave it untouched.
 */
export function applyReportParseResult(
  current: ParsedReport | null,
  result: ReportParseResult,
): ParsedReport | null {
  return result.ok ? result.report : current;
}
