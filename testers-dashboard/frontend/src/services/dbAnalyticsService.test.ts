// @vitest-environment jsdom
// (the app's env helper - via the service's API base URL - uses browser globals)
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/hooks/api/api-fetch", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { dbAnalyticsService } from "./dbAnalyticsService";

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ success: true, totalRecords: 0, matchedRecords: 0, entries: [], filterOptions: {}, lastSyncedAt: null });
});

describe("dbAnalyticsService.getEntries", () => {
  it("calls the DB-native entries endpoint with the DB filter values", async () => {
    await dbAnalyticsService.getEntries({
      dateRange: "custom",
      customStart: "2026-09-01",
      customEnd: "2026-09-30",
      tester: "64b7f0c2a1b2c3d4e5f60718",
      build: "0.1",
      channel: "WebApp",
      typeBranch: "Dynamic",
      dynamicSubTypes: "Weather Dynamic,Static Dynamic",
      status: "all",
    });
    const url = new URL(String(apiFetch.mock.calls[0][0]), "http://x");
    expect(url.pathname.endsWith("/dashboard/testers/db/entries")).toBe(true);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      dateRange: "custom",
      customStart: "2026-09-01",
      customEnd: "2026-09-30",
      tester: "64b7f0c2a1b2c3d4e5f60718",
      build: "0.1",
      channel: "WebApp",
      typeBranch: "Dynamic",
      dynamicSubTypes: "Weather Dynamic,Static Dynamic",
    });
  });

  it("sends no source or excludeFailures, and no params when nothing is selected", async () => {
    await dbAnalyticsService.getEntries({ source: "db", excludeFailures: true } as never);
    const url = String(apiFetch.mock.calls[0][0]);
    expect(url.endsWith("/dashboard/testers/db/entries")).toBe(true);
    expect(url).not.toContain("source");
    expect(url).not.toContain("excludeFailures");
  });
});
