// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Exclude Failures must exist on Google Sheet Analytics only: the Sheet
// section shows the toggle and feeds it into the client-side calculation;
// the DB section shows no toggle and never sends excludeFailures.

const summary = (totalRecords: number) => ({
  success: true,
  totalRecords,
  kpis: { N: totalRecords },
  diagnostics: { openTickets: [], allTickets: [] },
  chartData: { scoreTrend: [] },
  previousPeriodStats: null,
  filterOptions: {},
  lastSyncedAt: null,
  channelStats: [],
  languageStats: [],
});

const apiFetch = vi.fn();
vi.mock("@/hooks/api/api-fetch", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const computeClientSummary = vi.fn();
vi.mock("../analytics/clientSheetAnalytics.js", () => ({
  getRecordsFromBrowserStorage: async () => ({ records: [{ "Test ID": "T-1" }], lastSyncedAt: null }),
  syncAndCacheSheetsFromBackend: vi.fn(),
  computeClientSummary: (...args: unknown[]) => computeClientSummary(...args),
  parseCsvTextToRecords: vi.fn(),
  saveRecordsToBrowserStorage: vi.fn(),
  clearBrowserStorage: vi.fn(),
}));

vi.mock("../hooks/useZohoTicketStatuses", () => ({ useZohoTicketStatuses: () => ({ data: { statuses: {} } }) }));

// The shared card body is source-agnostic and out of scope here - stubbed,
// recording the props each section passes it.
const bodyProps = vi.fn();
vi.mock("./AnalyticsDashboardBody", () => ({
  AnalyticsDashboardBody: (props: unknown) => {
    bodyProps(props);
    return <div data-testid="analytics-body" />;
  },
}));

import { SheetAnalyticsSection } from "./SheetAnalyticsSection";
import { DbAnalyticsSection } from "./DbAnalyticsSection";
import { DB_FILTER_FIELDS } from "./dbFilterFields";
import { testersDashboardSummaryService } from "../services/testersDashboardSummaryService";

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  apiFetch.mockReset();
  computeClientSummary.mockReset();
  bodyProps.mockReset();
  apiFetch.mockImplementation(async () => summary(2));
  computeClientSummary.mockImplementation(() => summary(1));
});
afterEach(cleanup);

describe("Google Sheet Analytics - Exclude Failures", () => {
  it("shows the toggle and applies it client-side, without calling the summary endpoint", async () => {
    renderWithClient(<SheetAnalyticsSection title="Google Sheet Analytics" />);

    const toggle = await screen.findByRole("switch");
    expect(screen.getByText("Exclude Failures")).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    // computeClientSummary(records, filters, excludeFailures, ...)
    expect(computeClientSummary).toHaveBeenLastCalledWith(
      expect.anything(), expect.anything(), false, undefined, undefined, {}, null,
    );

    fireEvent.click(screen.getByText("Exclude Failures"));

    await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true"));
    await waitFor(() =>
      expect(computeClientSummary).toHaveBeenLastCalledWith(
        expect.anything(), expect.anything(), true, undefined, undefined, {}, null,
      ),
    );
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining("/summary"));
  });

  it("keeps the Sheet's own filter fields and tree - no DB options are passed to the body", async () => {
    renderWithClient(<SheetAnalyticsSection title="Google Sheet Analytics" />);
    await screen.findByRole("switch");

    const props = bodyProps.mock.lastCall![0];
    expect(props.filterFields).toBeUndefined();
    expect(props.optionDetails).toBeUndefined();
    expect(props.typeTree).toBeUndefined();
  });
});

describe("Database Logs Analytics - no Exclude Failures", () => {
  it("does not render the toggle, and loads the DB-native summary (not source=db)", async () => {
    apiFetch.mockImplementation(async () => ({ ...summary(2), calculation: "db-native" }));
    renderWithClient(<DbAnalyticsSection />);

    expect(await screen.findByText("Loaded 2 records.")).toBeTruthy();
    expect(screen.getByTestId("analytics-body")).toBeTruthy();
    expect(screen.queryByText("Exclude Failures")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(/clean of/)).toBeNull();
    expect(screen.queryByText(/fallback/)).toBeNull();

    const summaryUrls = apiFetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/summary"));
    expect(summaryUrls).toHaveLength(1);
    expect(summaryUrls[0]).toContain("/dashboard/testers/db/summary");
    expect(summaryUrls[0]).not.toContain("source=");
    expect(summaryUrls[0]).not.toContain("excludeFailures");
    expect(computeClientSummary).not.toHaveBeenCalled();
  });

  it("falls back to the old source=db summary when the DB-native summary fails, and says so", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/dashboard/testers/db/summary")) throw new Error("404");
      return summary(2);
    });
    renderWithClient(<DbAnalyticsSection />);

    expect(await screen.findByText("Loaded 2 records.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/previous DB calculation \(fallback\)/);
    const summaryUrls = apiFetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/summary"));
    expect(summaryUrls[0]).toContain("/dashboard/testers/db/summary");
    expect(summaryUrls[1]).toContain("/dashboard/testers/summary?source=db");
    expect(summaryUrls[1]).not.toContain("excludeFailures");
  });

  it("passes the DB-native filter fields, options-with-counts, and Type tree to the dashboard body", async () => {
    const dbFilterOptions = {
      fields: { channel: [{ value: "WhatsApp", label: "WhatsApp", count: 0 }] },
      typeTree: {
        dynamic: [{ value: "Weather Dynamic", label: "Weather Dynamic", count: 2 }],
        static: [],
        dynamicTotal: 2,
        staticTotal: 0,
      },
    };
    apiFetch.mockImplementation(async () => ({ ...summary(2), dbFilterOptions }));
    renderWithClient(<DbAnalyticsSection />);
    await screen.findByText("Loaded 2 records.");

    const props = bodyProps.mock.lastCall![0];
    expect(props.filterFields).toBe(DB_FILTER_FIELDS);
    expect(props.optionDetails).toBe(dbFilterOptions.fields);
    expect(props.typeTree.dynamicCount).toBe(2);
    expect(props.typeTree.dynamic.map((o: { value: string; count: number }) => [o.value, o.count])).toEqual([
      ["Weather Dynamic", 2], ["Scheme Dynamic", 0], ["Mandi Dynamic", 0], ["Static Dynamic", 0],
    ]);
  });

  it("the DB summary request never carries excludeFailures, even if a caller passes it", async () => {
    await testersDashboardSummaryService.getSummary({ source: "db", excludeFailures: true } as never);
    const [url] = apiFetch.mock.calls[0];
    expect(String(url)).toContain("source=db");
    expect(String(url)).not.toContain("excludeFailures");
  });
});
