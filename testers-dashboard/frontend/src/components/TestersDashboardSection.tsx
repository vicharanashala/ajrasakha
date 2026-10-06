import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { useTestersDashboardSummary } from "../hooks/useTestersDashboardSummary";
import { useZohoTicketStatuses } from "../hooks/useZohoTicketStatuses";
import { TrendChart, buildXAxisTicks, buildRobustRangeSeries, type TrendChartProps } from "./TrendChart";
import { FilterBar, DYNAMIC_SUB_TYPE_OPTIONS, STATIC_SUB_TYPE_OPTIONS, type IFilterField } from "./FilterBar";
import { ExecutiveSummary } from "./ExecutiveSummary";
import { AdditionalMetrics } from "./AdditionalMetrics";
import { DiagnosticsRow, type IDefectsTab, type ITeamBreakdown } from "./DiagnosticsRow";
import { InfoPopover } from "./InfoPopover";
import { channelDisplayLabel, UNASSIGNED_TEAM_LABEL } from "../utils";
import {
  parseCsvTextToRecords,
  saveRecordsToBrowserStorage,
  clearBrowserStorage,
  syncAndCacheSheetsFromBackend,
} from "../analytics/clientSheetAnalytics.js";


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
  const { data: zohoData } = useZohoTicketStatuses();
  const zohoStatuses = zohoData?.statuses ?? {};
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [excludeFailures, setExcludeFailures] = useState(false);
  const [releaseHealthExpanded, setReleaseHealthExpanded] = useState(false);
  const [weakestModuleExpanded, setWeakestModuleExpanded] = useState(false);
  // Two independent switchable views on the same card - "critical" (Critical
  // Defect Tickets: Critical/High only) and "all" (All Tickets: every
  // sheet-linked ticket, any severity). Each keeps its own active status
  // tab, pagination, and team-pill selection so switching views never leaks
  // one view's position into the other.
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

  // Switching views resets the target view to its Open tab and page 1, so
  // the user never lands mid-list in state left over from the other view.
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

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadError(null);
      const text = await file.text();
      const records = parseCsvTextToRecords(text);
      if (records.length === 0) {
        setUploadError("The selected CSV file could not be parsed or contains no test records. Ensure it contains a 'Test ID' column.");
        setIsUploading(false);
        return;
      }
      await saveRecordsToBrowserStorage(records, new Date().toISOString());
      await queryClient.invalidateQueries({ queryKey: ["testers-dashboard-summary", "sheet"] });
      setIsUploading(false);
    } catch (err: any) {
      setUploadError(err?.message || "Failed to parse and store CSV file.");
      setIsUploading(false);
    }
  };

  const handleClearCache = async () => {
    if (confirm("Are you sure you want to remove the cached QA Sheet records from this browser?")) {
      await clearBrowserStorage();
      await queryClient.invalidateQueries({ queryKey: ["testers-dashboard-summary", "sheet"] });
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncLatestData = async () => {
    try {
      setIsSyncing(true);
      setUploadError(null);
      const res = await syncAndCacheSheetsFromBackend();
      if (!res) {
        setUploadError("Could not automatically fetch sheets from backend. Ensure TESTERS_DASHBOARD_SHEETS and SERVICE_ACCOUNT are configured.");
      } else {
        await queryClient.invalidateQueries({ queryKey: ["testers-dashboard-summary", "sheet"] });
      }
      setIsSyncing(false);
    } catch (err: any) {
      setUploadError(err?.message || "Failed to sync sheet data.");
      setIsSyncing(false);
    }
  };

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
    // "all checked" (see FilterBar's dynamicWholeBranchSelected), so
    // toggling one item off must start from the full list, not the empty
    // array, or it would re-add the unchecked item instead of removing it.
    // Reaching zero items resets the branch to unselected rather than
    // reverting to "everything included" while still showing as selected.
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
  // fully checked - so it drops the branch selection entirely instead.
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

  const getTicketTeam = (ticketId: string): string => zohoStatuses[ticketId]?.team || UNASSIGNED_TEAM_LABEL;
  const matchesTeam = (ticketId: string, team: string | null): boolean => !team || getTicketTeam(ticketId) === team;
  const matchesSelectedTeam = (ticketId: string): boolean => matchesTeam(ticketId, selectedTeam);

  const getTicketDisplayNumber = (ticketId: string): string => zohoStatuses[ticketId]?.ticketNumber || ticketId;

  // Critical Defect Tickets view - Critical/High-only pool
  // (diagnostics.openTickets); one reset effect per status tab, each keyed
  // on this view's own team-pill selection so a team change on the All
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
  // (diagnostics.allTickets); same per-status reset pattern as above, keyed
  // on its own team-pill selection.
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

  if (summaryQuery.isLoading || !summaryQuery.data) {
    return <div className="p-6 text-muted-foreground">Loading {title.toLowerCase()} data...</div>;
  }

  if (summaryQuery.data?.syncing) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4 text-center border rounded-lg bg-card shadow-sm my-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <div>
          <h3 className="text-base font-semibold">Synchronizing Google Sheet Data...</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            The initial dataset is being fetched and prepared in the background. The dashboard will automatically update once ready.
          </p>
        </div>
      </div>
    );
  }

  if (source === 'sheet' && (summaryQuery.data?.needClientData || !summaryQuery.data?.success)) {
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
        </div>

        <Card className="border-dashed border-2 p-10 text-center flex flex-col items-center justify-center space-y-4 bg-muted/10 hover:bg-muted/20 transition-colors">
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
            📊
          </div>
          <div>
            <h3 className="text-lg font-semibold">Google Sheet QA Analytics</h3>
            <p className="text-sm text-muted-foreground max-w-lg mt-1">
              Data could not be automatically streamed from Google Sheets. You can retry auto-syncing directly or upload an offline CSV export.
            </p>
          </div>

          {uploadError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded max-w-md">
              {uploadError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSyncLatestData}
              className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-md shadow hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {isSyncing ? "Syncing from Google..." : "🔄 Retry Auto-Sync"}
            </button>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium rounded-md shadow-sm transition-colors cursor-pointer"
            >
              {isUploading ? "Processing CSV..." : "Upload CSV Manually"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Data is processed 100% in your browser using 0 server RAM & 0 heap memory.
          </p>
        </Card>
      </div>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data.success) {
    const errorDetail = summaryQuery.data?.error;
    return (
      <div className="p-6 text-destructive">
        <p className="font-semibold">Failed to load {title.toLowerCase()} data.</p>
        <p className="text-sm mt-1 text-muted-foreground">
          {errorDetail || (source === 'sheet' ? 'Check that the client CSV source is loaded.' : 'Check database connectivity.')}
        </p>
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

  // Trust/Farmer plot a true gap on a no-data day (hasData flags null out
  // the point, avoiding a misleading 0); Avg Response/Review TAT instead
  // plot 0 to keep the line continuous (see buildRobustRangeSeries's
  // noDataPlotValue) - the tooltip below describes each pair accordingly.
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
  // (Critical/High only); All Tickets view scopes to diagnostics.allTickets
  // (every severity) - everything below (status tabs, team breakdown,
  // pagination) is built from whichever pool the active view selects.
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
                ? `Showing ${summaryQuery.data.kpis.N} clean of ${summaryQuery.data.totalRecords} records.`
                : `Loaded ${summaryQuery.data.totalRecords} records.`}
            </span>
            <span className="text-muted-foreground">
              Last synced: {formatLastUpdated(summaryQuery.data.lastSyncedAt ?? null)}
            </span>
            {source === 'sheet' && (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handleSyncLatestData}
                  className="text-xs text-primary hover:underline font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  title="Stream freshest live data directly from Google Sheets (0 server RAM used)"
                >
                  {isSyncing ? "Syncing..." : "🔄 Sync Live Data"}
                </button>
                <span className="text-xs text-muted-foreground">•</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
                  title="Upload an updated QA CSV export manually"
                >
                  Upload CSV
                </button>
                <span className="text-xs text-muted-foreground">•</span>
                <button
                  type="button"
                  onClick={handleClearCache}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  title="Clear locally cached CSV data"
                >
                  Clear Cache
                </button>
              </div>
            )}
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
