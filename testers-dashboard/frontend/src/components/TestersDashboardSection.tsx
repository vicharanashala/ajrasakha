import { useMemo, useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { useTestersDashboardData } from "../hooks/useTestersDashboardData";
import { useTestersDashboardSummary } from "../hooks/useTestersDashboardSummary";
import { useZohoTicketStatuses } from "../hooks/useZohoTicketStatuses";
import type { ITestersDashboardRecord } from "../services/testersDashboardService";
import { TrendChart, buildXAxisTicks, buildRobustRangeSeries, type TrendChartProps } from "./TrendChart";
import { FilterBar, DYNAMIC_SUB_TYPE_OPTIONS, STATIC_SUB_TYPE_OPTIONS, type IFilterField } from "./FilterBar";
import { ExecutiveSummary } from "./ExecutiveSummary";
import { AdditionalMetrics } from "./AdditionalMetrics";
import { DiagnosticsRow, type IDefectsTab, type ITeamBreakdown } from "./DiagnosticsRow";
import { InfoPopover } from "./InfoPopover";
import { channelDisplayLabel, UNASSIGNED_TEAM_LABEL } from "../utils";

function normalize(value?: string): string {
  return (value || "").trim().toLowerCase();
}

function matchesAny(value: string | undefined, options: string[]): boolean {
  const n = normalize(value);
  return options.includes(n);
}

function isNAlike(value?: string): boolean {
  const n = normalize(value);
  return n === "" || n === "na" || n === "nil" || n === "n/a";
}

const KNOWN_SEVERITIES: Record<string, string> = {
  CRITICAL: "Critical",
  CRTICAL: "Critical",
  EXTREME: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Low",
};

const NO_DEFECT_SEVERITY_VALUES = new Set(["NO DEFECT", "NA", "NIL", "N A", "NO", "NO DFECT"]);

function normalizeDefectSeverity(value?: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (NO_DEFECT_SEVERITY_VALUES.has(upper)) return "NA";
  return KNOWN_SEVERITIES[upper] || "";
}

function toTitleCase(value?: string): string {
  const v = (value || "").trim().replace(/\s+/g, " ");
  if (!v) return v;

  const upper = v.toUpperCase();
  if (upper === "NA" || upper === "NIL") return upper;

  return v.toLowerCase().replace(/(^|[\s\-–])([a-z])/g, (_match, sep: string, letter: string) => sep + letter.toUpperCase());
}

const KNOWN_LEAKED_TESTER_NAMES = new Set(["LAVANYA MATHIALAGAN", "ITHAGANI SHIREESHA"]);

function normalizeTypeOfQuestion(value?: string): string {
  const upper = (value || "").trim().toUpperCase();
  if (KNOWN_LEAKED_TESTER_NAMES.has(upper)) return "";
  if (upper === "GDB" || upper === "GDP") return "GDB";
  if (upper === "DYNAMIC" || upper === "DYNMIC") return "Dynamic";
  if (upper === "UNIQUE" || upper === "UNIUQE") return "Unique";
  return toTitleCase(value);
}

function moduleGroupFor(typeOfQuestion?: string): "GDB" | "Dynamic" | "Unique Questions" | "Outreach" | null {
  const t = normalizeTypeOfQuestion(typeOfQuestion);
  if (t === "GDB") return "GDB";
  if (t.toLowerCase().includes("static dynamic")) return null;
  if (t.toLowerCase().includes("dynamic")) return "Dynamic";
  if (t === "Unique") return "Unique Questions";
  if (t === "Outreach") return "Outreach";
  return null;
}

function dynamicSubBucketFor(category?: string, typeOfQuestion?: string): string | null {
  if (moduleGroupFor(typeOfQuestion) !== "Dynamic") return null;

  const cat = (category || "").trim().toLowerCase();
  if (cat.includes("weather")) return "Weather";
  if (cat.includes("mandi") || cat.includes("market rate") || cat.includes("price")) return "Mandi Prices";
  if (cat.includes("scheme") || cat.includes("subsidy") || cat.includes("government")) return "Government Schemes";
  return null;
}

const STATIC_SUB_TYPES = new Set(["GDB", "Unique", "Outreach"]);

const KNOWN_CATEGORY_WORD_ORDER_SWAPS: Record<string, string> = {
  "BIO–PESTICIDES AND BIO–FERTILIZERS": "Bio–Fertilizers And Bio–Pesticides",
  "CAPACITY BUILDING AND EXTENSION": "Extension And Capacity Building",
  "LIVE STOCK AND ANIMAL HUSBANDARY": "Livestock And Animal Husbandry",
  "ANIMAL HUSBANDRY AND LIVESTOCK": "Livestock And Animal Husbandry",
};

const KNOWN_CATEGORY_SPELLING_VARIANTS: Record<string, string> = {
  "FERTILIZER USE AND AVAILABILITY": "Fertiliser Use And Availability",
};

function normalizeQuestionCategory(value?: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  const withAnd = trimmed.replace(/\s&\s/g, " and ");
  const withCanonicalDash = withAnd.replace(/\s*[-–]\s*/g, "–");
  const titleCased = toTitleCase(withCanonicalDash);

  const upper = titleCased.toUpperCase();
  if (KNOWN_CATEGORY_WORD_ORDER_SWAPS[upper]) return KNOWN_CATEGORY_WORD_ORDER_SWAPS[upper];
  if (KNOWN_CATEGORY_SPELLING_VARIANTS[upper]) return KNOWN_CATEGORY_SPELLING_VARIANTS[upper];

  return titleCased;
}

function normalizeChannel(value?: string): string {
  const compact = (value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (compact === "webapp" || compact === "webapplication") return "Web App";
  if (compact === "whatsapp" || compact === "wa") return "WhatsApp";
  if (compact === "both") return "Both";
  return toTitleCase(value);
}

const KNOWN_TEST_STATUSES: Record<string, string> = {
  PASS: "Pass",
  PAS: "Pass",
  FAIL: "Fail",
  PARTIAL: "Partial",
  NA: "NA",
};
function normalizeTestStatus(value?: string): string {
  const upper = (value || "").trim().toUpperCase();
  return KNOWN_TEST_STATUSES[upper] || "";
}

const KNOWN_LEAKED_TEST_IDS = new Set(["TL-2523", "TL2523"]);

const KNOWN_TESTER_NAME_TYPOS: Record<string, string> = {
  JHOYDEEP: "Joydeep",
  "KALAGA DENI SUDHA": "K. Deni Sudha",
  "TULALA VISHNU VARDHAN": "T. Vishnu Vardhan",
  LAVANYA: "Lavanya Mathialagan",
  "JOYDEEP SINGHA ROY": "Joydeep",
};

function normalizeTesterName(value?: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  const withoutTrailingPeriod = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;

  const upper = withoutTrailingPeriod.toUpperCase();
  if (KNOWN_LEAKED_TEST_IDS.has(upper)) return "";
  if (KNOWN_TESTER_NAME_TYPOS[upper]) return KNOWN_TESTER_NAME_TYPOS[upper];

  const v = withoutTrailingPeriod.replace(/\.(?=\S)/g, ". ").replace(/\s+/g, " ");
  return toTitleCase(v);
}

function formatLastUpdated(isoString: string | null): string {
  if (!isoString) return "unknown";
  const then = new Date(isoString);
  if (isNaN(then.getTime())) return "unknown";

  return then.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const KNOWN_DATE_TYPOS: Record<string, string> = {
  "24-06-26": "2026-06-24",
  "08-06-26": "2026-06-08",
  "25-07--2026": "2026-07-25",
  "24-07--2026": "2026-07-24",
  "25-06-2-26": "2026-06-25",
  "14-07-026": "2026-07-14",
  "10.06.2026": "2026-06-10",
  "12-06 -2026": "2026-06-12",
  "14-06-206": "2026-06-14",
  "17-06-026": "2026-06-17",
  "19-06-206": "2026-06-19",
  "25-0-6-2026": "2026-06-25",
  "15-07-206": "2026-07-15",
};

function parseTestDateToISO(dateStr?: string): string | null {
  const s = (dateStr || "").trim();
  if (!s || isNAlike(s)) return null;
  if (KNOWN_DATE_TYPOS[s]) return KNOWN_DATE_TYPOS[s];

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2026) {
      return s;
    }
    return null;
  }

  const monthNameMatch = s.match(/^(\d{1,2})[-\s]+([A-Za-z]+)[-\s]+(\d{4})$/);
  if (monthNameMatch) {
    const day = parseInt(monthNameMatch[1], 10);
    const month = MONTH_NAMES[monthNameMatch[2].toLowerCase()];
    const year = parseInt(monthNameMatch[3], 10);
    if (month && day >= 1 && day <= 31 && year >= 2020 && year <= 2026) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null;
  }

  const numericMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numericMatch) {
    const day = parseInt(numericMatch[1], 10);
    const month = parseInt(numericMatch[2], 10);
    const rawYear = numericMatch[3];
    if (rawYear.length !== 2 && rawYear.length !== 4) return null;
    let year = parseInt(rawYear, 10);
    if (rawYear.length === 2) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2026) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

const EMPTY_FILTERS = {
  dateRange: "all",
  category: "all",
  build: "all",
  channel: "all",
  language: "all",
  tester: "all",
  status: "all",
  severity: "all",
};

const FILTER_FIELDS: IFilterField[] = [
  { key: "category", csvKey: "Question Category", label: "Question Domain", normalize: normalizeQuestionCategory },
  {
    key: "build",
    csvKey: "Build / Version",
    label: "Build / Version",
    normalize: (v) => ((v || "").trim() ? "1.0" : ""),
  },
  { key: "channel", csvKey: "Channel Tested", label: "Channel Tested", normalize: normalizeChannel, formatOption: channelDisplayLabel },
  { key: "language", csvKey: "Language Tested", label: "Language Tested", normalize: toTitleCase },
  { key: "tester", csvKey: "Tester Name", label: "Tester Name", normalize: normalizeTesterName },
  { key: "status", csvKey: "Overall Test Status", label: "Overall Test Status", normalize: normalizeTestStatus, keepNA: true },
  { key: "severity", csvKey: "Defect Severity", label: "Defect Severity", normalize: normalizeDefectSeverity },
];

export interface TestersDashboardSectionProps {
  source: 'sheet' | 'db';
  title?: string;
  description?: string;
  sourceBadge?: string;
}

export function TestersDashboardSection({
  source,
  title = "Testers Dashboard",
  description = "Quality Assurance Performance Analytics",
  sourceBadge,
}: TestersDashboardSectionProps) {
  const { data, isLoading, isError } = useTestersDashboardData(source);
  const { data: zohoData } = useZohoTicketStatuses();
  const zohoStatuses = zohoData?.statuses ?? {};
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [excludeFailures, setExcludeFailures] = useState(false);
  const [releaseHealthExpanded, setReleaseHealthExpanded] = useState(false);
  const [weakestModuleExpanded, setWeakestModuleExpanded] = useState(false);
  // Two independent switchable views on the same card - "critical" (Critical
  // Defect Tickets: Critical/High only, the long-standing default) and "all"
  // (All Tickets: every sheet-linked ticket, any severity). Each view keeps
  // its own active status tab, its own per-status pagination, and its own
  // team-pill selection so switching back and forth never leaks one view's
  // position into the other.
  const [defectsView, setDefectsView] = useState<"critical" | "all">("critical");

  const [activeDefectsTabCritical, setActiveDefectsTabCritical] = useState<"open" | "closed" | "onHold" | "escalated">("open");
  const [openTicketsPageCritical, setOpenTicketsPageCritical] = useState(0);
  const [closedTicketsPageCritical, setClosedTicketsPageCritical] = useState(0);
  const [onHoldTicketsPageCritical, setOnHoldTicketsPageCritical] = useState(0);
  const [escalatedTicketsPageCritical, setEscalatedTicketsPageCritical] = useState(0);
  const [selectedTeamCritical, setSelectedTeamCritical] = useState<string | null>(null);

  const [activeDefectsTabAll, setActiveDefectsTabAll] = useState<"open" | "closed" | "onHold" | "escalated">("open");
  const [openTicketsPageAll, setOpenTicketsPageAll] = useState(0);
  const [closedTicketsPageAll, setClosedTicketsPageAll] = useState(0);
  const [onHoldTicketsPageAll, setOnHoldTicketsPageAll] = useState(0);
  const [escalatedTicketsPageAll, setEscalatedTicketsPageAll] = useState(0);
  const [selectedTeamAll, setSelectedTeamAll] = useState<string | null>(null);

  const activeDefectsTab = defectsView === "critical" ? activeDefectsTabCritical : activeDefectsTabAll;
  const setActiveDefectsTab = defectsView === "critical" ? setActiveDefectsTabCritical : setActiveDefectsTabAll;
  const selectedTeam = defectsView === "critical" ? selectedTeamCritical : selectedTeamAll;
  const setSelectedTeam = defectsView === "critical" ? setSelectedTeamCritical : setSelectedTeamAll;
  const toggleSelectedTeam = (key: string) => setSelectedTeam((prev) => (prev === key ? null : key));

  // Switching views resets the view being switched TO back to its Open tab
  // and page 1, so the user never lands mid-list in state left over from the
  // other view.
  function switchDefectsView(view: "critical" | "all") {
    setDefectsView(view);
    if (view === "critical") {
      setActiveDefectsTabCritical("open");
      setOpenTicketsPageCritical(0);
    } else {
      setActiveDefectsTabAll("open");
      setOpenTicketsPageAll(0);
    }
  }
  const [activeChartTab, setActiveChartTab] = useState<"trust" | "farmer" | "response" | "tat">("trust");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [dynamicSubTypes, setDynamicSubTypes] = useState<string[]>([]);
  const [typeBranch, setTypeBranch] = useState<"all" | "Dynamic" | "Static">("all");
  const [staticSubTypes, setStaticSubTypes] = useState<string[]>([]);
  const [dynamicExpanded, setDynamicExpanded] = useState(false);
  const [staticExpanded, setStaticExpanded] = useState(false);

  function selectTypeBranch(branch: "Dynamic" | "Static") {
    setTypeBranch((prev) => (prev === branch ? "all" : branch));
    setDynamicSubTypes([]);
    setStaticSubTypes([]);
  }

  function selectAllTypes() {
    setTypeBranch("all");
    setDynamicSubTypes([]);
    setStaticSubTypes([]);
  }

  function toggleDynamicSubType(value: string) {
    setStaticSubTypes([]);
    // An empty array under an already-selected Dynamic branch displays as
    // "all checked" (see FilterBar's dynamicWholeBranchSelected) - toggling
    // one item off from that state must start from the full list, not the
    // empty array, or it would ADD `value` back (the one just unchecked)
    // instead of removing it, e.g. unchecking Weather from all-3-checked
    // would otherwise leave a "Weather only" selection instead of "Mandi +
    // Schemes". Reaching zero explicit items has no separate representation
    // from "whole branch, no restriction" (that's the same empty array), so
    // it resets the branch to unselected rather than silently reverting to
    // "everything included" while still showing as selected.
    const effectivePrev =
      dynamicSubTypes.length === 0 && typeBranch === "Dynamic" ? DYNAMIC_SUB_TYPE_OPTIONS.map((o) => o.value) : dynamicSubTypes;
    const next = effectivePrev.includes(value) ? effectivePrev.filter((v) => v !== value) : [...effectivePrev, value];
    setTypeBranch(next.length === 0 ? "all" : "Dynamic");
    setDynamicSubTypes(next);
  }

  // Toggles between all-selected and none. "All-selected" includes the
  // implicit case (branch selected, empty array) - see
  // dynamicWholeBranchSelected in FilterBar. Clicking it while fully
  // checked can't just clear to `[]`, since that's the same wire value as
  // "whole branch, no restriction" and would immediately redisplay as
  // fully checked again - so it drops the branch selection entirely
  // instead, matching selectAllTypes's reset.
  function toggleDynamicSelectAll() {
    setStaticSubTypes([]);
    const isFullyChecked =
      typeBranch === "Dynamic" && (dynamicSubTypes.length === 0 || dynamicSubTypes.length === DYNAMIC_SUB_TYPE_OPTIONS.length);
    if (isFullyChecked) {
      setTypeBranch("all");
      setDynamicSubTypes([]);
    } else {
      setTypeBranch("Dynamic");
      setDynamicSubTypes(DYNAMIC_SUB_TYPE_OPTIONS.map((o) => o.value));
    }
  }

  function toggleStaticSubType(value: string) {
    setDynamicSubTypes([]);
    // Same reasoning as toggleDynamicSubType above.
    const effectivePrev =
      staticSubTypes.length === 0 && typeBranch === "Static" ? STATIC_SUB_TYPE_OPTIONS.map((o) => o.value) : staticSubTypes;
    const next = effectivePrev.includes(value) ? effectivePrev.filter((v) => v !== value) : [...effectivePrev, value];
    setTypeBranch(next.length === 0 ? "all" : "Static");
    setStaticSubTypes(next);
  }

  // Same reasoning as toggleDynamicSelectAll above.
  function toggleStaticSelectAll() {
    setDynamicSubTypes([]);
    const isFullyChecked =
      typeBranch === "Static" && (staticSubTypes.length === 0 || staticSubTypes.length === STATIC_SUB_TYPE_OPTIONS.length);
    if (isFullyChecked) {
      setTypeBranch("all");
      setStaticSubTypes([]);
    } else {
      setTypeBranch("Static");
      setStaticSubTypes(STATIC_SUB_TYPE_OPTIONS.map((o) => o.value));
    }
  }

  function typeSummaryLabel(): string {
    if (typeBranch === "Dynamic") {
      if (dynamicSubTypes.length === 0 || dynamicSubTypes.length === DYNAMIC_SUB_TYPE_OPTIONS.length) return "Dynamic";
      return `Dynamic (${dynamicSubTypes.length} selected)`;
    }
    if (typeBranch === "Static") {
      if (staticSubTypes.length === 0 || staticSubTypes.length === STATIC_SUB_TYPE_OPTIONS.length) return "Static";
      return `Static (${staticSubTypes.length} selected)`;
    }
    return "All";
  }

  const summaryQuery = useTestersDashboardSummary(
    filters,
    excludeFailures,
    customStart,
    customEnd,
    dynamicSubTypes,
    typeBranch,
    staticSubTypes,
    source,
  );

  const allRecords = data?.records ?? [];

  const applyNonDateFilters = (rows: ITestersDashboardRecord[]): ITestersDashboardRecord[] => {
    let out = rows;
    if (excludeFailures) {
      out = out.filter(
        (r) =>
          !matchesAny(r["Question Saved in DB?"], ["not saved"]) &&
          !matchesAny(r["Answer Saved in DB?"], ["not saved"]) &&
          !matchesAny(r["Q-ID Consistent Across Systems?"], ["wrongly identified as duplicate"]) &&
          normalizeDefectSeverity(r["Defect Severity"]) !== "Critical" &&
          (dynamicSubBucketFor(r["Question Category"], r["Type of Question"]) !== null ||
            STATIC_SUB_TYPES.has(normalizeTypeOfQuestion(r["Type of Question"]))),
      );
    }
    for (const field of FILTER_FIELDS) {
      const value = filters[field.key];
      if (value !== "all") {
        if (field.normalize) {
          out = out.filter((r) => field.normalize!(r[field.csvKey]) === value);
        } else {
          out = out.filter((r) => r[field.csvKey] === value);
        }
      }
    }
    return out;
  };

  const filtered = useMemo(() => {
    let rows: ITestersDashboardRecord[] = applyNonDateFilters(allRecords);

    const isCustomWithNoDatesYet = filters.dateRange === "custom" && !customStart && !customEnd;

    if (filters.dateRange !== "all" && !isCustomWithNoDatesYet) {
      const now = new Date();
      const todayISO = now.toISOString().slice(0, 10);
      rows = rows.filter((r) => {
        const iso = parseTestDateToISO(r["Test Date"]);
        if (!iso) return false;
        const rDate = new Date(iso);

        if (filters.dateRange === "today") {
          return iso === todayISO;
        } else if (filters.dateRange === "7days") {
          const diffDays = Math.ceil(Math.abs(now.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 7;
        } else if (filters.dateRange === "30days") {
          const diffDays = Math.ceil(Math.abs(now.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 30;
        } else if (filters.dateRange === "custom") {
          if (customStart && iso < customStart) return false;
          if (customEnd && iso > customEnd) return false;
          return true;
        }
        return true;
      });
    }

    return rows;
  }, [allRecords, filters, excludeFailures, customStart, customEnd]);

  const getTicketTeam = (ticketId: string): string => zohoStatuses[ticketId]?.team || UNASSIGNED_TEAM_LABEL;
  const matchesTeam = (ticketId: string, team: string | null): boolean => !team || getTicketTeam(ticketId) === team;
  const matchesSelectedTeam = (ticketId: string): boolean => matchesTeam(ticketId, selectedTeam);

  const getTicketDisplayNumber = (ticketId: string): string => zohoStatuses[ticketId]?.ticketNumber || ticketId;

  // Critical Defect Tickets view - Critical/High-only pool
  // (diagnostics.openTickets), one reset effect per status tab, each keyed
  // on that view's own team-pill selection so a team change on the All
  // Tickets view never resets this view's pagination.
  useEffect(() => {
    setOpenTicketsPageCritical(0);
  }, [
    selectedTeamCritical,
    summaryQuery.data?.diagnostics.openTickets.filter((t) => {
      const status = zohoStatuses[t.id]?.status?.toLowerCase();
      return (!status || status === "open") && matchesTeam(t.id, selectedTeamCritical);
    }).length,
  ]);

  useEffect(() => {
    setClosedTicketsPageCritical(0);
  }, [
    selectedTeamCritical,
    summaryQuery.data?.diagnostics.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "closed" && matchesTeam(t.id, selectedTeamCritical),
    ).length,
  ]);

  useEffect(() => {
    setOnHoldTicketsPageCritical(0);
  }, [
    selectedTeamCritical,
    summaryQuery.data?.diagnostics.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "on hold" && matchesTeam(t.id, selectedTeamCritical),
    ).length,
  ]);

  useEffect(() => {
    setEscalatedTicketsPageCritical(0);
  }, [
    selectedTeamCritical,
    summaryQuery.data?.diagnostics.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "escalated" && matchesTeam(t.id, selectedTeamCritical),
    ).length,
  ]);

  // All Tickets view - every linked ticket regardless of severity
  // (diagnostics.allTickets), same per-status reset pattern as the Critical
  // Defect Tickets view above, but keyed on its own team-pill selection.
  useEffect(() => {
    setOpenTicketsPageAll(0);
  }, [
    selectedTeamAll,
    summaryQuery.data?.diagnostics.allTickets.filter((t) => {
      const status = zohoStatuses[t.id]?.status?.toLowerCase();
      return (!status || status === "open") && matchesTeam(t.id, selectedTeamAll);
    }).length,
  ]);

  useEffect(() => {
    setClosedTicketsPageAll(0);
  }, [
    selectedTeamAll,
    summaryQuery.data?.diagnostics.allTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "closed" && matchesTeam(t.id, selectedTeamAll),
    ).length,
  ]);

  useEffect(() => {
    setOnHoldTicketsPageAll(0);
  }, [
    selectedTeamAll,
    summaryQuery.data?.diagnostics.allTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "on hold" && matchesTeam(t.id, selectedTeamAll),
    ).length,
  ]);

  useEffect(() => {
    setEscalatedTicketsPageAll(0);
  }, [
    selectedTeamAll,
    summaryQuery.data?.diagnostics.allTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "escalated" && matchesTeam(t.id, selectedTeamAll),
    ).length,
  ]);

  if (isLoading || summaryQuery.isLoading || !data || !summaryQuery.data) {
    return <div className="p-6 text-muted-foreground">Loading {title.toLowerCase()} data...</div>;
  }

  if (isError || !data.success || summaryQuery.isError || !summaryQuery.data.success) {
    return (
      <div className="p-6 text-destructive">
        Failed to load {title.toLowerCase()} data. {source === 'sheet' ? 'Check that the backend CSV source is configured.' : 'Check database connectivity.'}
      </div>
    );
  }

  const kpis = summaryQuery.data.kpis;
  const diagnostics = summaryQuery.data.diagnostics;
  const chartData = summaryQuery.data.chartData;
  const previousPeriodStats = summaryQuery.data.previousPeriodStats;
  const filterOptions = summaryQuery.data.filterOptions;
  const channelStats = summaryQuery.data.channelStats;
  const languageStats = summaryQuery.data.languageStats;

  const scoreTrendDates = chartData.scoreTrend.map((p) => p.date);
  const xAxisTicks = buildXAxisTicks(scoreTrendDates);

  const trustBase = chartData.scoreTrend.map((p) => ({
    date: p.date,
    trust: p.trust,
    trustPlot: p.trustHasData ? p.trust : null,
    trustHasData: p.trustHasData,
  }));

  const experienceBase = chartData.scoreTrend.map((p) => ({
    date: p.date,
    experience: p.experience,
    experiencePlot: p.experienceHasData ? p.experience : null,
    experienceHasData: p.experienceHasData,
  }));

  const responseBase = chartData.scoreTrend.map((p) => ({
    date: p.date,
    avgLatency: p.avgLatency,
    avgLatencyForRange: p.avgLatencySampleCount > 0 ? p.avgLatency : null,
    avgLatencySampleCount: p.avgLatencySampleCount,
  }));
  const responseRange = buildRobustRangeSeries(responseBase, "avgLatencyForRange", "avgLatencyPlot", "avgLatencyOutlier", 0);

  const tatBase = chartData.scoreTrend.map((p) => ({
    date: p.date,
    avgReviewTat: p.avgReviewTat,
    avgReviewTatForRange: p.avgReviewTatSampleCount > 0 ? p.avgReviewTat : null,
    avgReviewTatSampleCount: p.avgReviewTatSampleCount,
  }));
  const tatRange = buildRobustRangeSeries(tatBase, "avgReviewTatForRange", "avgReviewTatPlot", "avgReviewTatOutlier", 0);

  const trendChartConfigs: Record<typeof activeChartTab, TrendChartProps> = {
    trust: {
      data: trustBase,
      xTicks: xAxisTicks,
      plotKey: "trustPlot",
      color: "#4f46e5",
      name: "Trust Score",
      yLabel: "Trust Score (%)",
      yDomain: [0, 125],
      yTicks: [0, 25, 50, 75, 100, 125],
      tooltipConfig: { valueLabel: "Trust Score", valueSuffix: "%", rawValueKey: "trust", hasDataKey: "trustHasData" },
    },
    farmer: {
      data: experienceBase,
      xTicks: xAxisTicks,
      plotKey: "experiencePlot",
      color: "#10b981",
      name: "Farmer Experience",
      yLabel: "Farmer Experience (%)",
      yDomain: [0, 125],
      yTicks: [0, 25, 50, 75, 100, 125],
      tooltipConfig: {
        valueLabel: "Farmer Experience",
        valueSuffix: "%",
        rawValueKey: "experience",
        hasDataKey: "experienceHasData",
      },
    },
    response: {
      data: responseRange.data,
      xTicks: xAxisTicks,
      plotKey: "avgLatencyPlot",
      color: "#f59e0b",
      name: "Avg Response Time",
      yLabel: "Response Time (min)",
      yDomain: [0, responseRange.domainMax],
      tooltipConfig: {
        valueLabel: "Avg Response Time",
        valueSuffix: " min",
        rawValueKey: "avgLatency",
        sampleCountKey: "avgLatencySampleCount",
      },
      outlierKey: "avgLatencyOutlier",
      outliers: responseRange.outliers,
    },
    tat: {
      data: tatRange.data,
      xTicks: xAxisTicks,
      plotKey: "avgReviewTatPlot",
      color: "#8b5cf6",
      name: "Avg Review TAT",
      yLabel: "Review TAT (min)",
      yDomain: [0, tatRange.domainMax],
      tooltipConfig: {
        valueLabel: "Avg Review TAT",
        valueSuffix: " min",
        rawValueKey: "avgReviewTat",
        sampleCountKey: "avgReviewTatSampleCount",
      },
      outlierKey: "avgReviewTatOutlier",
      outliers: tatRange.outliers,
    },
  };

  // Trust/Farmer plot a true gap on a no-data day (trustHasData/
  // experienceHasData null out the point); Avg Response/Review TAT instead
  // plot 0 on a no-data day to keep the line continuous (see
  // buildRobustRangeSeries's noDataPlotValue above) - the tooltip below
  // describes each pair accurately rather than a single blanket claim.
  const trendDaysWithData: Record<typeof activeChartTab, number> = {
    trust: trustBase.filter((p) => p.trustHasData).length,
    farmer: experienceBase.filter((p) => p.experienceHasData).length,
    response: responseBase.filter((p) => p.avgLatencySampleCount > 0).length,
    tat: tatBase.filter((p) => p.avgReviewTatSampleCount > 0).length,
  };
  const trendTotalDays = scoreTrendDates.length;

  const deriveTicketStatusKey = (ticketId: string): "open" | "closed" | "onHold" | "escalated" => {
    const status = zohoStatuses[ticketId]?.status?.toLowerCase();
    if (status === "closed") return "closed";
    if (status === "on hold") return "onHold";
    if (status === "escalated") return "escalated";
    return "open";
  };

  const withDisplayNumber = (t: { id: string; url: string; severity: string }) => ({
    ...t,
    displayNumber: getTicketDisplayNumber(t.id),
  });

  // Critical Defect Tickets view scopes to diagnostics.openTickets
  // (Critical/High only, unchanged); All Tickets view scopes to
  // diagnostics.allTickets (every severity) - everything below (status
  // tabs, team breakdown, pagination) is built from whichever pool the
  // active view selects.
  const ticketPool = defectsView === "critical" ? diagnostics.openTickets : diagnostics.allTickets;

  const openTabTickets = ticketPool
    .filter((t) => deriveTicketStatusKey(t.id) === "open" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);
  const closedTabTickets = ticketPool
    .filter((t) => deriveTicketStatusKey(t.id) === "closed" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);
  const onHoldTabTickets = ticketPool
    .filter((t) => deriveTicketStatusKey(t.id) === "onHold" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);
  const escalatedTabTickets = ticketPool
    .filter((t) => deriveTicketStatusKey(t.id) === "escalated" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);

  const DEFECTS_TABS: IDefectsTab[] =
    defectsView === "critical"
      ? [
          { key: "open", label: "Open", tickets: openTabTickets, page: openTicketsPageCritical, setPage: setOpenTicketsPageCritical },
          { key: "closed", label: "Closed", tickets: closedTabTickets, page: closedTicketsPageCritical, setPage: setClosedTicketsPageCritical },
          { key: "onHold", label: "On Hold", tickets: onHoldTabTickets, page: onHoldTicketsPageCritical, setPage: setOnHoldTicketsPageCritical },
          { key: "escalated", label: "Escalated", tickets: escalatedTabTickets, page: escalatedTicketsPageCritical, setPage: setEscalatedTicketsPageCritical },
        ]
      : [
          { key: "open", label: "Open", tickets: openTabTickets, page: openTicketsPageAll, setPage: setOpenTicketsPageAll },
          { key: "closed", label: "Closed", tickets: closedTabTickets, page: closedTicketsPageAll, setPage: setClosedTicketsPageAll },
          { key: "onHold", label: "On Hold", tickets: onHoldTabTickets, page: onHoldTicketsPageAll, setPage: setOnHoldTicketsPageAll },
          { key: "escalated", label: "Escalated", tickets: escalatedTabTickets, page: escalatedTicketsPageAll, setPage: setEscalatedTicketsPageAll },
        ];
  const activeDefectsTabInfo = DEFECTS_TABS.find((t) => t.key === activeDefectsTab)!;

  function buildTeamBreakdown(tickets: typeof diagnostics.openTickets): ITeamBreakdown[] {
    const teamGroups = new Map<string, typeof diagnostics.openTickets>();
    tickets.forEach((t) => {
      const team = getTicketTeam(t.id);
      const existing = teamGroups.get(team);
      if (existing) existing.push(t);
      else teamGroups.set(team, [t]);
    });
    return Array.from(teamGroups.entries())
      .map(([team, teamTickets]) => {
        const counts = { open: 0, closed: 0, onHold: 0, escalated: 0 };
        teamTickets.forEach((t) => {
          counts[deriveTicketStatusKey(t.id)]++;
        });
        return { key: team, label: team, total: teamTickets.length, counts };
      })
      .sort((a, b) => {
        if (a.key === UNASSIGNED_TEAM_LABEL) return 1;
        if (b.key === UNASSIGNED_TEAM_LABEL) return -1;
        return b.total - a.total;
      });
  }

  const teamBreakdown = buildTeamBreakdown(ticketPool);
  const defectsCardTitle = defectsView === "critical" ? "Critical Defect Tickets" : "All Tickets";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{title}</h2>
            {sourceBadge && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-primary/10 text-primary border border-primary/20">
                {sourceBadge}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-start gap-3 text-sm">
          <div
            className="flex items-center gap-2 cursor-pointer pt-0.5 select-none"
            onClick={() => setExcludeFailures((v) => !v)}
          >
            <button
              type="button"
              role="switch"
              aria-checked={excludeFailures}
              onClick={(e) => e.stopPropagation()}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors pointer-events-none ${
                excludeFailures ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  excludeFailures ? "translate-x-[18px]" : "translate-x-1"
                }`}
              />
            </button>
            Exclude Failures
          </div>
          <div className="flex flex-col text-left">
            <span className="text-muted-foreground">
              {excludeFailures
                ? `Showing ${filtered.length} clean of ${allRecords.length} records.`
                : `Loaded ${allRecords.length} records.`}
            </span>
            <span className="text-muted-foreground">
              Last synced: {formatLastUpdated(data?.lastSyncedAt ?? null)}
            </span>
          </div>
        </div>
      </div>

      <FilterBar
        filters={filters}
        setFilters={setFilters}
        filterOptions={filterOptions}
        filterFields={FILTER_FIELDS}
        customStart={customStart}
        setCustomStart={setCustomStart}
        customEnd={customEnd}
        setCustomEnd={setCustomEnd}
        typeBranchState={{
          typeBranch,
          dynamicSubTypes,
          staticSubTypes,
          dynamicExpanded,
          setDynamicExpanded,
          staticExpanded,
          setStaticExpanded,
          selectTypeBranch,
          selectAllTypes,
          toggleDynamicSubType,
          toggleDynamicSelectAll,
          toggleStaticSubType,
          toggleStaticSelectAll,
          typeSummaryLabel,
        }}
      />

      <ExecutiveSummary kpis={kpis} previousPeriodStats={previousPeriodStats} />

      <AdditionalMetrics
        kpis={kpis}
        channelStats={channelStats}
        languageStats={languageStats}
        filters={filters}
        customStart={customStart}
        customEnd={customEnd}
        releaseHealthExpanded={releaseHealthExpanded}
        setReleaseHealthExpanded={setReleaseHealthExpanded}
      />

      <DiagnosticsRow
        diagnostics={diagnostics}
        weakestModuleExpanded={weakestModuleExpanded}
        setWeakestModuleExpanded={setWeakestModuleExpanded}
        defectsCardTitle={defectsCardTitle}
        defectsView={defectsView}
        onSwitchDefectsView={switchDefectsView}
        defectsPoolCount={ticketPool.length}
        activeDefectsTab={activeDefectsTab}
        setActiveDefectsTab={setActiveDefectsTab}
        defectsTabs={DEFECTS_TABS}
        activeDefectsTabInfo={activeDefectsTabInfo}
        teamBreakdown={teamBreakdown}
        selectedTeam={selectedTeam}
        onSelectTeam={toggleSelectedTeam}
      />

      <Card className="border-muted-foreground/10">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Score Trend</CardTitle>
            <InfoPopover title="Score Trend" align="start">
              <p>
                Each point is that day's {trendChartConfigs[activeChartTab].name}, recalculated from only that
                day's tests — the same number the cards above would show if filtered to that single day.
              </p>
              {activeChartTab === "trust" || activeChartTab === "farmer" ? (
                <p>A gap in the line means no tests that day, not a score of 0.</p>
              ) : (
                <p>
                  A day with no valid readings plots as 0 and is excluded from the average. Values above the
                  visible range are marked with a triangle, not hidden.
                </p>
              )}
              <div className="flex justify-between pt-1 border-t">
                <span>Days with data</span>
                <span className="font-medium">{trendDaysWithData[activeChartTab]} of {trendTotalDays}</span>
              </div>
            </InfoPopover>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {[
              { key: "trust" as const, label: "Trust" },
              { key: "farmer" as const, label: "Farmer" },
              { key: "response" as const, label: "Avg Response" },
              { key: "tat" as const, label: "Review TAT" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveChartTab(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeChartTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="h-[340px]">
          <TrendChart {...trendChartConfigs[activeChartTab]} />
        </CardContent>
      </Card>
    </div>
  );
}
