import { useMemo, useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/atoms/card";
import { useTestersDashboardData } from "../hooks/useTestersDashboardData";
import { useTestersDashboardSummary } from "../hooks/useTestersDashboardSummary";
import { useZohoTicketStatuses } from "../hooks/useZohoTicketStatuses";
import type { ITestersDashboardRecord } from "../services/testersDashboardService";
import { TrendChart, buildXAxisTicks, buildRobustRangeSeries, type TrendChartProps } from "./TrendChart";
import { FilterBar, DYNAMIC_SUB_TYPE_OPTIONS, STATIC_SUB_TYPE_OPTIONS, type IFilterField } from "./FilterBar";
import { ExecutiveSummary } from "./ExecutiveSummary";
import { AdditionalMetrics } from "./AdditionalMetrics";
import { DiagnosticsRow, type IDefectsTab } from "./DiagnosticsRow";
import { pct, channelDisplayLabel, UNASSIGNED_TEAM_LABEL } from "../utils";

const RESPONSE_TIME_PARSE_CAP_MINUTES = 100000;

function timeToMinutes(timeStr?: string): number | null {
  const trimmed = (timeStr || "").trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === "na" || lower === "nil" || lower === "n/a") return null;
  if (!isNaN(Number(trimmed))) {
    const num = parseFloat(trimmed);
    if (num < 0 || num > RESPONSE_TIME_PARSE_CAP_MINUTES) return null;
    return num;
  }

  const parts = trimmed.split(":");
  if (parts.length >= 3) {
    const hrs = parseFloat(parts[0]) || 0;
    const mins = parseFloat(parts[1]) || 0;
    const secs = parseFloat(parts[2]) || 0;
    const total = hrs * 60 + mins + secs / 60;
    if (total < 0 || total > RESPONSE_TIME_PARSE_CAP_MINUTES) return null;
    return total;
  }
  if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    const total = mins + secs / 60;
    if (total < 0 || total > RESPONSE_TIME_PARSE_CAP_MINUTES) return null;
    return total;
  }
  return null;
}

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

const KNOWN_CHANNEL_VALUES = new Set(["Web App", "WhatsApp", "Both"]);

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

const RESPONSE_TIME_KEY = "Response Time (mins) [Auto] (HH:MM:SS)";

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
  const [activeDefectsTab, setActiveDefectsTab] = useState<"open" | "closed" | "onHold" | "escalated">("open");
  const [openTicketsPage, setOpenTicketsPage] = useState(0);
  const [closedTicketsPage, setClosedTicketsPage] = useState(0);
  const [onHoldTicketsPage, setOnHoldTicketsPage] = useState(0);
  const [escalatedTicketsPage, setEscalatedTicketsPage] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const toggleSelectedTeam = (key: string) => setSelectedTeam((prev) => (prev === key ? null : key));
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
    setTypeBranch("Dynamic");
    setStaticSubTypes([]);
    setDynamicSubTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function toggleDynamicSelectAll() {
    setTypeBranch("Dynamic");
    setStaticSubTypes([]);
    setDynamicSubTypes((prev) =>
      prev.length === DYNAMIC_SUB_TYPE_OPTIONS.length ? [] : DYNAMIC_SUB_TYPE_OPTIONS.map((o) => o.value),
    );
  }

  function toggleStaticSubType(value: string) {
    setTypeBranch("Static");
    setDynamicSubTypes([]);
    setStaticSubTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function toggleStaticSelectAll() {
    setTypeBranch("Static");
    setDynamicSubTypes([]);
    setStaticSubTypes((prev) =>
      prev.length === STATIC_SUB_TYPE_OPTIONS.length ? [] : STATIC_SUB_TYPE_OPTIONS.map((o) => o.value),
    );
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
  const matchesSelectedTeam = (ticketId: string): boolean =>
    !selectedTeam || getTicketTeam(ticketId) === selectedTeam;

  const getTicketDisplayNumber = (ticketId: string): string => zohoStatuses[ticketId]?.ticketNumber || ticketId;

  useEffect(() => {
    setOpenTicketsPage(0);
  }, [
    selectedTeam,
    summaryQuery.data?.diagnostics.openTickets.filter((t) => {
      const status = zohoStatuses[t.id]?.status?.toLowerCase();
      return (!status || status === "open") && matchesSelectedTeam(t.id);
    }).length,
  ]);

  useEffect(() => {
    setClosedTicketsPage(0);
  }, [
    selectedTeam,
    summaryQuery.data?.diagnostics.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "closed" && matchesSelectedTeam(t.id),
    ).length,
  ]);

  useEffect(() => {
    setOnHoldTicketsPage(0);
  }, [
    selectedTeam,
    summaryQuery.data?.diagnostics.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "on hold" && matchesSelectedTeam(t.id),
    ).length,
  ]);

  useEffect(() => {
    setEscalatedTicketsPage(0);
  }, [
    selectedTeam,
    summaryQuery.data?.diagnostics.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "escalated" && matchesSelectedTeam(t.id),
    ).length,
  ]);

  const channelStats = useMemo(() => {
    const groups: Record<string, ITestersDashboardRecord[]> = {};
    filtered.forEach((r) => {
      const ch = normalizeChannel(r["Channel Tested"]);
      if (!ch || isNAlike(ch) || !KNOWN_CHANNEL_VALUES.has(ch)) return;
      if (!groups[ch]) groups[ch] = [];
      groups[ch].push(r);
    });
    return Object.entries(groups)
      .map(([channel, rows]) => {
        const tests = rows.length;
        const passed = rows.filter((r) => normalizeTestStatus(r["Overall Test Status"]) === "Pass").length;
        const failed = rows.filter((r) => normalizeTestStatus(r["Overall Test Status"]) === "Fail").length;
        const passRate = pct(passed, passed + failed);
        let sum = 0;
        let count = 0;
        rows.forEach((r) => {
          const m = timeToMinutes(r[RESPONSE_TIME_KEY]);
          if (m !== null) {
            sum += m;
            count++;
          }
        });
        const avgResponse = count ? Math.round((sum / count) * 10) / 10 : 0;
        return { channel, tests, passRate, avgResponse };
      })
      .sort((a, b) => b.tests - a.tests);
  }, [filtered]);

  const languageStats = useMemo(() => {
    const groups: Record<string, ITestersDashboardRecord[]> = {};
    filtered.forEach((r) => {
      const lang = toTitleCase(r["Language Tested"]);
      if (!lang || isNAlike(lang)) return;
      if (!groups[lang]) groups[lang] = [];
      groups[lang].push(r);
    });
    return Object.entries(groups)
      .map(([language, rows]) => {
        const tests = rows.length;
        const translationApplicable = rows.filter((r) => !isNAlike(r["Translation Quality"]));
        const translationAcc = pct(
          translationApplicable.filter((r) => matchesAny(r["Translation Quality"], ["correct", "good"])).length,
          translationApplicable.length,
        );
        return { language, tests, translationAcc };
      })
      .sort((a, b) => b.tests - a.tests);
  }, [filtered]);

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

  const openTabTickets = diagnostics.openTickets
    .filter((t) => deriveTicketStatusKey(t.id) === "open" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);
  const closedTabTickets = diagnostics.openTickets
    .filter((t) => deriveTicketStatusKey(t.id) === "closed" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);
  const onHoldTabTickets = diagnostics.openTickets
    .filter((t) => deriveTicketStatusKey(t.id) === "onHold" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);
  const escalatedTabTickets = diagnostics.openTickets
    .filter((t) => deriveTicketStatusKey(t.id) === "escalated" && matchesSelectedTeam(t.id))
    .map(withDisplayNumber);

  const DEFECTS_TABS: IDefectsTab[] = [
    { key: "open", label: "Open", tickets: openTabTickets, page: openTicketsPage, setPage: setOpenTicketsPage },
    { key: "closed", label: "Closed", tickets: closedTabTickets, page: closedTicketsPage, setPage: setClosedTicketsPage },
    { key: "onHold", label: "On Hold", tickets: onHoldTabTickets, page: onHoldTicketsPage, setPage: setOnHoldTicketsPage },
    { key: "escalated", label: "Escalated", tickets: escalatedTabTickets, page: escalatedTicketsPage, setPage: setEscalatedTicketsPage },
  ];
  const activeDefectsTabInfo = DEFECTS_TABS.find((t) => t.key === activeDefectsTab)!;

  const teamGroups = new Map<string, typeof diagnostics.openTickets>();
  diagnostics.openTickets.forEach((t) => {
    const team = getTicketTeam(t.id);
    const existing = teamGroups.get(team);
    if (existing) existing.push(t);
    else teamGroups.set(team, [t]);
  });
  const teamBreakdown = Array.from(teamGroups.entries())
    .map(([team, tickets]) => {
      const counts = { open: 0, closed: 0, onHold: 0, escalated: 0 };
      tickets.forEach((t) => {
        counts[deriveTicketStatusKey(t.id)]++;
      });
      return { key: team, label: team, total: tickets.length, counts };
    })
    .sort((a, b) => {
      if (a.key === UNASSIGNED_TEAM_LABEL) return 1;
      if (b.key === UNASSIGNED_TEAM_LABEL) return -1;
      return b.total - a.total;
    });

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
          <div className="flex flex-wrap gap-1">
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
