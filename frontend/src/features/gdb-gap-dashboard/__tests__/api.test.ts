/**
 * Unit tests for the low-level `fetchGapReport` client.
 *
 * The contract under test:
 *   POST {accApiBaseUrl}/gdb/gap-report
 *   Content-Type: application/json
 *   Body: { similarity_threshold, min_samples, lookback_days, refresh }
 *
 * We assert:
 *   - the URL composition (just the path, no query string)
 *   - that `refresh=true` is sent in the JSON body when the user opts in
 *   - that the request uses POST (not GET) and includes a JSON body
 *   - that non-2xx responses throw with the server-provided message when
 *     available, and a useful fallback message otherwise
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildGapReportBody, buildGapReportUrl, fetchGapReport } from "../api";
import type { GapReport } from "../types";

// Hoisted mocks so we can manipulate them per-test.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

function buildResponse(body: unknown, ok = true, status = 200): MockResponse {
  const text = JSON.stringify(body);
  return {
    ok,
    status,
    json: async () => body,
    text: async () => text,
  };
}

const MOCK_REPORT: GapReport = {
  report_id: "test-report",
  generated_at: "2026-07-28T12:00:00Z",
  window: { start: "2026-07-01", end: "2026-07-28", days: 28 },
  total_queries_analyzed: 240,
  total_clusters_found: 12,
  gaps_by_priority: {
    critical: [
      {
        cluster_id: "cotton-punjab-pest",
        theme: "Pest control in cotton",
        query_count: 12,
        recent_query_count: 9,
        previous_query_count: 3,
        total_query_count: 12,
        avg_weekly_growth_pct: 0.38,
        domain: "pest",
        crops: ["cotton"],
        states: ["Punjab"],
        top_crop: "cotton",
        top_state: "Punjab",
        priority: "critical",
        priority_score: 0.91,
        gdb_coverage_band: "GAP",
        gdb_coverage_hits: 0,
        gdb_coverage_score: 0,
        suggested_action: "Author pest/cotton/Punjab Q&A",
        sample_queries: ["Why are leaves turning yellow?"],
      },
    ],
    high: [],
    medium: [],
    low: [],
  },
  coverage_bands: { STRONG: 4, PARTIAL: 5, GAP: 3 },
  top_gaps: [
    {
      cluster_id: "cotton-punjab-pest",
      theme: "Pest control in cotton",
      query_count: 12,
      recent_query_count: 9,
      previous_query_count: 3,
      total_query_count: 12,
      avg_weekly_growth_pct: 0.38,
      domain: "pest",
      crops: ["cotton"],
      states: ["Punjab"],
      top_crop: "cotton",
      top_state: "Punjab",
      priority: "critical",
      priority_score: 0.91,
      gdb_coverage_band: "GAP",
      gdb_coverage_hits: 0,
      gdb_coverage_score: 0,
      suggested_action: "Author pest/cotton/Punjab Q&A",
      sample_queries: ["Why are leaves turning yellow?"],
    },
  ],
  clusters: [
    {
      cluster_id: "cotton-punjab-pest",
      theme: "Pest control in cotton",
      query_count: 12,
      recent_query_count: 9,
      previous_query_count: 3,
      total_query_count: 12,
      avg_weekly_growth_pct: 0.38,
      domain: "pest",
      crops: ["cotton"],
      states: ["Punjab"],
      top_crop: "cotton",
      top_state: "Punjab",
      priority: "critical",
      priority_score: 0.91,
      gdb_coverage_band: "GAP",
      gdb_coverage_hits: 0,
      gdb_coverage_score: 0,
      suggested_action: "Author pest/cotton/Punjab Q&A",
      sample_queries: ["Why are leaves turning yellow?"],
    },
  ],
  recommendations: ["Prioritise pest/cotton/Punjab Q&A authoring."],
};

describe("buildGapReportUrl", () => {
  it("returns the canonical endpoint (no query string)", () => {
    const url = buildGapReportUrl();
    expect(url).toContain("/gdb/gap-report");
    expect(url).not.toContain("?");
  });
});

describe("buildGapReportBody", () => {
  it("defaults refresh to false and uses backend defaults for tuning knobs", () => {
    const body = buildGapReportBody();
    expect(body.refresh).toBe(false);
    expect(body.similarity_threshold).toBe(0.85);
    expect(body.min_samples).toBe(2);
    expect(body.lookback_days).toBeNull();
  });

  it("honours refresh=true when the caller asks for a refresh", () => {
    const body = buildGapReportBody({ refresh: true });
    expect(body.refresh).toBe(true);
  });

  it("ignores UI-only filters (they are applied client-side)", () => {
    const body = buildGapReportBody({
      filters: { crop: "wheat", state: "Punjab", domain: "pest" },
    });
    expect(body).not.toHaveProperty("crop");
    expect(body).not.toHaveProperty("state");
    expect(body).not.toHaveProperty("domain");
  });
});

describe("fetchGapReport", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs to /gdb/gap-report and returns the parsed report", async () => {
    fetchMock.mockResolvedValueOnce(buildResponse(MOCK_REPORT));

    const report = await fetchGapReport({ refresh: false, filters: {} });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/gdb/gap-report");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      similarity_threshold: 0.85,
      min_samples: 2,
      lookback_days: null,
      refresh: false,
    });
    expect(report.total_queries_analyzed).toBe(240);
    expect(report.clusters?.[0].theme).toBe("Pest control in cotton");
  });

  it("sends refresh=true in the body when refresh is requested", async () => {
    fetchMock.mockResolvedValueOnce(buildResponse(MOCK_REPORT));

    await fetchGapReport({ refresh: true });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).refresh).toBe(true);
  });

  it("throws the server's error message when the request fails", async () => {
    fetchMock.mockResolvedValueOnce(
      buildResponse(
        { message: "pipeline not ready" },
        false,
        503,
      ),
    );

    await expect(
      fetchGapReport({ refresh: false, filters: {} }),
    ).rejects.toThrow(/pipeline not ready/);
  });

  it("falls back to a sensible message when the error body is empty", async () => {
    fetchMock.mockResolvedValueOnce(buildResponse({}, false, 500));

    await expect(
      fetchGapReport({ refresh: false, filters: {} }),
    ).rejects.toThrow();
  });
});