// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Radix Select/Popover only render their content when opened (portals,
// pointer events) - replaced with plain containers so every option renders.
vi.mock("@/components/atoms/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <div role="listbox">{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div role="option" data-value={value}>
      {children}
    </div>
  ),
}));
vi.mock("@/components/atoms/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { FilterBar, type ITypeBranchState } from "./FilterBar";
import { FILTER_FIELDS, EMPTY_FILTERS } from "./analyticsFilterFields";
import { DB_FILTER_FIELDS, dbTypeTreeWithCounts } from "./dbFilterFields";
import type { IDbFilterOptions } from "../services/testersDashboardSummaryService";

afterEach(cleanup);

const typeBranchState = (overrides: Partial<ITypeBranchState> = {}): ITypeBranchState => ({
  typeBranch: "all",
  dynamicSubTypes: [],
  staticSubTypes: [],
  // Both branches expanded so their sub-type checkboxes render.
  dynamicExpanded: true,
  setDynamicExpanded: vi.fn(),
  staticExpanded: true,
  setStaticExpanded: vi.fn(),
  selectTypeBranch: vi.fn(),
  selectAllTypes: vi.fn(),
  toggleDynamicSubType: vi.fn(),
  toggleDynamicSelectAll: vi.fn(),
  toggleStaticSubType: vi.fn(),
  toggleStaticSelectAll: vi.fn(),
  typeSummaryLabel: () => "All",
  ...overrides,
});

const baseProps = {
  filters: { ...EMPTY_FILTERS },
  setFilters: vi.fn(),
  customStart: "",
  setCustomStart: vi.fn(),
  customEnd: "",
  setCustomEnd: vi.fn(),
};

const optionTexts = () => screen.getAllByRole("option").map((o) => `${o.getAttribute("data-value")}=${o.textContent}`);

describe("FilterBar - Google Sheet Analytics (no DB props)", () => {
  it("renders the Sheet's plain option values and its own Type tree, without counts", () => {
    render(
      <FilterBar
        {...baseProps}
        filterFields={FILTER_FIELDS}
        filterOptions={{ channel: ["Both", "Web App", "WhatsApp"], status: ["Pass", "NA"] }}
        typeBranchState={typeBranchState()}
      />,
    );

    expect(optionTexts()).toEqual([
      // Date Range
      "all=All Dates", "today=Today", "7days=Last 7 Days", "30days=Last 30 Days", "custom=Custom Range",
      // Question Domain, Build / Version: only "All" (no options passed)
      "all=All", "all=All",
      "all=All", "Both=Cross-Platform", "Web App=Web App", "WhatsApp=WhatsApp",
      // Language, Tester
      "all=All", "all=All",
      "all=All", "Pass=Pass", "NA=NA",
      // Defect Severity
      "all=All",
    ]);
    // Sheet tree: unchanged labels, sub-types, and no counts anywhere.
    expect(screen.getByText("Dynamic")).toBeTruthy();
    expect(screen.getByText("Static")).toBeTruthy();
    for (const label of ["Weather", "Mandi / Market", "Schemes", "GDB", "Unique", "Outreach"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText(/\(\d+\)/)).toBeNull();
  });
});

describe("FilterBar - Database Logs Analytics", () => {
  const dbOptions: IDbFilterOptions = {
    fields: {
      category: [{ value: "Weed Management", label: "Weed Management", count: 3 }],
      build: [{ value: "0.1", label: "0.1", count: 2 }],
      channel: [
        { value: "WhatsApp", label: "WhatsApp", count: 0 },
        { value: "WebApp", label: "WebApp", count: 4 },
        { value: "Both", label: "Both", count: 1 },
      ],
      language: [],
      tester: [
        { value: "u1", label: "Tester One", count: 5 },
        { value: "u9", label: "Idle Tester", count: 0 },
      ],
      status: [
        { value: "Pass", label: "Pass", count: 5 },
        { value: "Partial", label: "Partial", count: 0 },
      ],
      severity: [{ value: "NA", label: "NA", count: 0 }],
    },
    typeTree: {
      dynamic: [{ value: "Weather Dynamic", label: "Weather Dynamic", count: 2 }],
      static: [{ value: "GDB", label: "GDB", count: 3 }],
      dynamicTotal: 2,
      staticTotal: 3,
    },
  };

  it("shows every option with its count, keeping zero-count options, and Tester values as DB identities", () => {
    render(
      <FilterBar
        {...baseProps}
        filterFields={DB_FILTER_FIELDS}
        filterOptions={{}}
        typeBranchState={typeBranchState()}
        optionDetails={dbOptions.fields}
        typeTree={dbTypeTreeWithCounts(dbOptions)}
      />,
    );

    const options = optionTexts();
    expect(options).toContain("WhatsApp=WhatsApp (0)");
    expect(options).toContain("WebApp=Web App (4)");
    expect(options).toContain("Both=Cross-Platform (1)");
    expect(options).toContain("Partial=Partial (0)");
    expect(options).toContain("NA=NA (0)");
    expect(options).toContain("0.1=0.1 (2)");
    expect(options).toContain("u1=Tester One (5)");
    expect(options).toContain("u9=Idle Tester (0)");

    // Type tree: every Tester UI type, with counts (0 when absent).
    expect(screen.getByText("Dynamic (2)")).toBeTruthy();
    expect(screen.getByText("Static (3)")).toBeTruthy();
    for (const label of [
      "Weather Dynamic (2)", "Scheme Dynamic (0)", "Mandi Dynamic (0)", "Static Dynamic (0)",
      "Unique (0)", "GDB (3)", "Outreach (0)",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
