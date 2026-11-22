import { describe, expect, it } from "vitest";

import {
  computeTechnicalPassRate,
  isExplicitErrorStatus,
  normalizeAgriculturalDimension,
  normalizeDomain,
  normalizeMetric,
  normalizeTechnicalPass,
  parseApplicability,
  parseFiniteNumber,
  summarizeTechnicalPass,
} from "../normalize";
import type {
  AgriculturalDimensionFields,
  MetricFields,
} from "../parseReport";

function metricFields(overrides: Partial<MetricFields> = {}): MetricFields {
  return {
    score: null,
    status: null,
    reason: null,
    passed: null,
    error: null,
    ...overrides,
  };
}

function dimensionFields(
  overrides: Partial<AgriculturalDimensionFields> = {},
): AgriculturalDimensionFields {
  return {
    ...metricFields(),
    applicable: null,
    ...overrides,
  };
}

describe("technical pass normalization", () => {
  it("T-07 trims surrounding whitespace", () => {
    expect(normalizeTechnicalPass(" true ")).toBe("pass");
    expect(normalizeTechnicalPass("\ttrue\n")).toBe("pass");
    expect(normalizeTechnicalPass("  fail  ")).toBe("fail");
    expect(normalizeTechnicalPass(" Passed ")).toBe("pass");
  });

  it("T-08 normalizes casing", () => {
    expect(normalizeTechnicalPass("TRUE")).toBe("pass");
    expect(normalizeTechnicalPass("True")).toBe("pass");
    expect(normalizeTechnicalPass("FALSE")).toBe("fail");
    expect(normalizeTechnicalPass("False")).toBe("fail");
  });

  it("T-09 maps exactly the closed PASS/FAIL vocabulary", () => {
    for (const value of ["true", "pass", "passed"]) {
      expect(normalizeTechnicalPass(value)).toBe("pass");
    }
    for (const value of ["false", "fail", "failed"]) {
      expect(normalizeTechnicalPass(value)).toBe("fail");
    }
    for (const value of [
      "yes",
      "no",
      "1",
      "0",
      "ok",
      "success",
      "pass?",
      "passed?",
    ]) {
      expect(normalizeTechnicalPass(value)).toBe("unavailable");
    }
  });

  it("T-10 excludes missing, empty, and unrecognized values from the denominator", () => {
    const result = summarizeTechnicalPass([
      "true",
      "yes",
      "",
      null,
      undefined,
      "ok",
      "false",
    ]);

    expect(result).toEqual({
      percent: 50,
      sampleCount: 2,
      passCount: 1,
      failCount: 1,
    });
  });

  it("T-11 computes PASS / (PASS + FAIL) and returns null when the denominator is zero", () => {
    const rate = summarizeTechnicalPass(["pass", "pass", "fail"]);
    expect(rate.percent).toBeCloseTo((2 / 3) * 100);
    expect(rate.sampleCount).toBe(3);

    expect(computeTechnicalPassRate(["unavailable", "unavailable"])).toEqual({
      percent: null,
      sampleCount: 0,
      passCount: 0,
      failCount: 0,
    });
  });
});

describe("numeric parsing and metric validity", () => {
  it("parses finite decimal numbers only", () => {
    expect(parseFiniteNumber("0.5")).toBe(0.5);
    expect(parseFiniteNumber(" 1 ")).toBe(1);
    expect(parseFiniteNumber(".5")).toBe(0.5);
    expect(parseFiniteNumber("1e-2")).toBe(0.01);
    expect(parseFiniteNumber("")).toBeNull();
    expect(parseFiniteNumber(null)).toBeNull();
    expect(parseFiniteNumber("Infinity")).toBeNull();
    expect(parseFiniteNumber("NaN")).toBeNull();
    expect(parseFiniteNumber("0x10")).toBeNull();
    expect(parseFiniteNumber("not-a-number")).toBeNull();
  });

  it("T-12 excludes a numeric score when status is an explicit error", () => {
    for (const status of ["evaluation_error", "error", " ERROR ", "Evaluation_Error"]) {
      const result = normalizeMetric(
        metricFields({ score: "0.92", status }),
      );

      expect(result.valid).toBe(false);
      expect(result.excluded).toBe(true);
      expect(result.score).toBeNull();
      expect(result.exclusionReason).toBe("evaluation_error");
      // The raw value is preserved; only the normalized valid score is null.
      expect(result.rawScore).toBe("0.92");
      expect(result.numericScore).toBe(0.92);
      expect(isExplicitErrorStatus(status)).toBe(true);
    }
  });

  it("T-13 treats 0.0 as a valid score", () => {
    const result = normalizeMetric(
      metricFields({ score: "0.0", status: "scored_zero" }),
    );

    expect(result.valid).toBe(true);
    expect(result.score).toBe(0);
    expect(result.numericScore).toBe(0);
    expect(result.normalizedStatus).toBe("scored");
  });

  it("accepts a blank status with a finite in-range score", () => {
    const result = normalizeMetric(
      metricFields({ score: "0.75", status: null }),
    );

    expect(result.valid).toBe(true);
    expect(result.score).toBe(0.75);
    expect(result.normalizedStatus).toBe("unavailable");
  });

  it("rejects invalid and out-of-range scores", () => {
    const cases: { score: string | null; reason: string }[] = [
      { score: "abc", reason: "invalid_score" },
      { score: "", reason: "invalid_score" },
      { score: null, reason: "invalid_score" },
      { score: "1.0001", reason: "out_of_range" },
      { score: "-0.01", reason: "out_of_range" },
    ];

    for (const { score, reason } of cases) {
      const result = normalizeMetric(metricFields({ score, status: "scored" }));
      expect(result.valid).toBe(false);
      expect(result.exclusionReason).toBe(reason);
      expect(result.score).toBeNull();
    }
  });

  it("T-15 excludes not_applicable/N/A, disabled, and missing statuses", () => {
    const cases: { status: string; expected: string }[] = [
      { status: "not_applicable", expected: "not_applicable" },
      { status: "N/A", expected: "not_applicable" },
      { status: "disabled", expected: "disabled" },
      { status: "missing", expected: "missing" },
    ];

    for (const { status, expected } of cases) {
      const result = normalizeMetric(
        metricFields({ score: "0.9", status }),
      );
      expect(result.valid).toBe(false);
      expect(result.score).toBeNull();
      expect(result.normalizedStatus).toBe(expected);
    }
  });

  it("T-29 treats [prefix]_passed as informational only", () => {
    const result = normalizeMetric(
      metricFields({ score: "0.8", status: "scored", passed: "false" }),
    );

    expect(result.valid).toBe(true);
    expect(result.score).toBe(0.8);
    expect(result.passed).toBe("false");
    expect(result.exclusionReason).toBeNull();
  });
});

describe("agricultural dimension normalization", () => {
  it("parses applicability safely", () => {
    expect(parseApplicability("true")).toBe(true);
    expect(parseApplicability(" FALSE ")).toBe(false);
    expect(parseApplicability("not_applicable")).toBe(false);
    expect(parseApplicability("maybe")).toBeNull();
    expect(parseApplicability(null)).toBeNull();
  });

  it("excludes a dimension score when applicability is false", () => {
    const result = normalizeAgriculturalDimension(
      dimensionFields({
        score: "1.0",
        status: "scored",
        applicable: "false",
      }),
    );

    expect(result.applicable).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.score).toBeNull();
    expect(result.exclusionReason).toBe("not_applicable");
  });

  it("keeps a scored dimension separate and valid when applicable", () => {
    const result = normalizeAgriculturalDimension(
      dimensionFields({
        score: "1.0",
        status: "scored",
        applicable: "true",
      }),
    );

    expect(result.applicable).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.score).toBe(1);
  });
});

describe("domain normalization", () => {
  it("maps the six supported domains and their explicit aliases", () => {
    expect(normalizeDomain("Weather")).toBe("Weather");
    expect(normalizeDomain("Market Prices")).toBe("Market");
    expect(normalizeDomain("nutrient management")).toBe("Soil");
    expect(normalizeDomain("Government Schemes")).toBe("Schemes");
    expect(normalizeDomain("Cultural Practices")).toBe("GDB");
    expect(normalizeDomain("General")).toBe("Greetings");
  });

  it("returns null for unknown and blank domains instead of guessing", () => {
    expect(normalizeDomain("Plant Protection")).toBeNull();
    expect(normalizeDomain("Asteroid Mining")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
  });
});
