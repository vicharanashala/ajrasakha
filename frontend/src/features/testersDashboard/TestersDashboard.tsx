import { useMemo, useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/atoms/card";
import { useTestersDashboardData } from "./hooks/useTestersDashboardData";
import { useTestersDashboardSummary } from "./hooks/useTestersDashboardSummary";
import { useZohoTicketStatuses } from "./hooks/useZohoTicketStatuses";
import type { ITestersDashboardRecord } from "@/hooks/services/testersDashboardService";
import { TrendChart, buildXAxisTicks, buildRobustRangeSeries, type TrendChartProps } from "./components/TrendChart";
import { FilterBar, DYNAMIC_SUB_TYPE_OPTIONS, STATIC_SUB_TYPE_OPTIONS, type IFilterField } from "./components/FilterBar";
import { ExecutiveSummary } from "./components/ExecutiveSummary";
import { AdditionalMetrics } from "./components/AdditionalMetrics";
import { DiagnosticsRow, type IDefectsTab } from "./components/DiagnosticsRow";
import { pct, channelDisplayLabel, UNASSIGNED_TEAM_LABEL } from "./utils";

// Upper bound for a parseable Response/TAT time reading - mirrors the
// backend's RESPONSE_TIME_PARSE_CAP_MINUTES (normalize.ts, duplicated since
// frontend/backend are separate packages). A live-data investigation
// confirmed a clean gap between genuine long delays and corrupted values:
// 97 real rows fall between 7 and ~61 days (max 87,578 min), while the
// next-smallest corrupted value is ~66.5 million minutes - a ~760x gap, so
// 100,000 min (~69 days) safely keeps every genuine reading while excluding
// every corrupted one. Previously capped at 10,080 min (7 days), which
// wrongly discarded those 97 genuine multi-day delays as if they were
// corrupted.
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

// Confirmed severity typos/merges: Crtical -> Critical, Extreme -> Critical
// (same severity), Info -> Low (same severity).
const KNOWN_SEVERITIES: Record<string, string> = {
  CRITICAL: "Critical",
  CRTICAL: "Critical",
  EXTREME: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Low",
};

// These all mean "no defect found" - treated as NA rather than a 5th
// severity level.
const NO_DEFECT_SEVERITY_VALUES = new Set(["NO DEFECT", "NA", "NIL", "N A", "NO", "NO DFECT"]);

// Some rows have a defect description typed into this field instead of a
// severity level - not a real severity, so dropped (returns "") rather than
// shown as a bogus filter option.
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

  // "NA"/"NIL" are missing-data sentinels, not words to title-case -
  // title-casing "NA" to "Na" would slip past the case-sensitive `!== "NA"`
  // filter-dropdown exclusion checks and leak in as a bogus option.
  const upper = v.toUpperCase();
  if (upper === "NA" || upper === "NIL") return upper;

  // Also capitalizes after a hyphen/en-dash, since compound category names
  // use both word-separator styles interchangeably.
  return v.toLowerCase().replace(/(^|[\s\-–])([a-z])/g, (_match, sep: string, letter: string) => sep + letter.toUpperCase());
}

// Confirmed leaked Tester Name values that landed in the Type of Question
// column via a column-shift data-entry error - excluded (returns "") rather
// than treated as a real Type of Question value. Mirrors the backend's
// normalizeTypeOfQuestion (normalize.ts, duplicated since frontend/backend
// are separate packages).
const KNOWN_LEAKED_TESTER_NAMES = new Set(["LAVANYA MATHIALAGAN", "ITHAGANI SHIREESHA"]);

// "GDB"/"GDP" are acronyms (GDP a confirmed typo for GDB); "Dynamic"/"Dynmic"
// and "Unique"/"Uniuqe" are one-off typos seen directly in the live sheet.
// Mirrors the backend's normalizeTypeOfQuestion exactly.
function normalizeTypeOfQuestion(value?: string): string {
  const upper = (value || "").trim().toUpperCase();
  if (KNOWN_LEAKED_TESTER_NAMES.has(upper)) return "";
  if (upper === "GDB" || upper === "GDP") return "GDB";
  if (upper === "DYNAMIC" || upper === "DYNMIC") return "Dynamic";
  if (upper === "UNIQUE" || upper === "UNIUQE") return "Unique";
  return toTitleCase(value);
}

// Mirrors the backend's moduleGroupFor/dynamicSubBucketFor (diagnostics.ts,
// duplicated since frontend/backend are separate packages) - used only by
// excludeFailures' "no identifiable Type of Question" condition below, not
// as a filter dimension.
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

  const c = normalize(category);
  if (c) {
    if (c.includes("climate") || c.includes("weather")) return "Weather";
    if (c.includes("market")) return "Mandi Prices";
    if (c.includes("scheme")) return "Government Schemes";
  }

  const t = normalize(typeOfQuestion);
  if (t) {
    if (t.includes("weather")) return "Weather";
    if (t.includes("mandi") || t.includes("market")) return "Mandi Prices";
    if (t.includes("scheme")) return "Government Schemes";
  }

  return null;
}

// Static branch's confirmed sub-types - mirrors the backend's filters.ts
// STATIC_SUB_TYPES.
const STATIC_SUB_TYPES = new Set(["GDB", "Unique", "Outreach"]);

// Confirmed word-order swaps for otherwise identical compound Question
// Category names - each merges into whichever spelling is dominant in real
// data (majority spelling wins). Keys/values are post-dash-canonicalization,
// post-toTitleCase.
const KNOWN_CATEGORY_WORD_ORDER_SWAPS: Record<string, string> = {
  "BIO–PESTICIDES AND BIO–FERTILIZERS": "Bio–Fertilizers And Bio–Pesticides",
  "CAPACITY BUILDING AND EXTENSION": "Extension And Capacity Building",
  "LIVE STOCK AND ANIMAL HUSBANDARY": "Livestock And Animal Husbandry",
  "ANIMAL HUSBANDRY AND LIVESTOCK": "Livestock And Animal Husbandry",
};

// British vs American spelling of the same category - merges into the
// dominant real-data spelling. Other -ization/-isation category names are
// deliberately NOT merged here since they're different phrases, not a
// spelling variant of the same one.
const KNOWN_CATEGORY_SPELLING_VARIANTS: Record<string, string> = {
  "FERTILIZER USE AND AVAILABILITY": "Fertiliser Use And Availability",
};

// "&" and "and" are used interchangeably for the same category, as are
// hyphens and en-dashes ("Insect–Pest Management" vs "Insect - Pest
// Management") - both are canonicalized before title-casing so variant
// spellings merge into one filter option. This applies to the whole string,
// so other hyphenated compound words in this field render with an en-dash
// too, not just "Insect".
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

// "Channel Tested" mixes spacing as well as case ("webapp" vs "Web App"), so
// simple title-casing won't merge them - map known channels explicitly.
function normalizeChannel(value?: string): string {
  const compact = (value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (compact === "webapp" || compact === "webapplication") return "Web App";
  if (compact === "whatsapp" || compact === "wa") return "WhatsApp";
  if (compact === "both") return "Both";
  return toTitleCase(value);
}

// Mirrors the backend's channel whitelist (filters.ts, duplicated since
// frontend/backend are separate packages). "Both" is a legitimate channel
// (tests run on both Web App and WhatsApp); other stray values (e.g. a
// leaked "English" from the adjacent Language Tested column) are excluded
// rather than shown as a bogus channel group.
const KNOWN_CHANNEL_VALUES = new Set(["Web App", "WhatsApp", "Both"]);

// Casing variants plus a confirmed typo ("Pas" -> "Pass"). Unrecognized
// values (including garbage data) normalize to "" rather than becoming a
// bogus filter option.
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

// "Tester Name" has inconsistent spacing around periods in initials on top
// of case; fixed mechanically below. Genuine spelling differences are
// deliberately NOT auto-merged - guessing wrong would misattribute one
// tester's results to another - except the confirmed same-person merges in
// KNOWN_TESTER_NAME_TYPOS below (majority spelling wins).
//
// "TL-2523"/"TL2523" is a Test ID that leaked into this column (a
// data-entry/column-shift error), not a name - excluded (returns "") rather
// than shown as a bogus tester.
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

  // A trailing period (e.g. "Dhaarani S.") is a name-initial, not a typo -
  // stripped so it merges with the dominant no-period spelling. Safe since
  // no real Tester Name value is a genuine abbreviation (like "Dr.") that
  // needs the period kept.
  const withoutTrailingPeriod = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;

  const upper = withoutTrailingPeriod.toUpperCase();
  if (KNOWN_LEAKED_TEST_IDS.has(upper)) return "";
  if (KNOWN_TESTER_NAME_TYPOS[upper]) return KNOWN_TESTER_NAME_TYPOS[upper];

  const v = withoutTrailingPeriod.replace(/\.(?=\S)/g, ". ").replace(/\s+/g, " ");
  return toTitleCase(v);
}

// isoString is when the backend cron last refreshed updated.csv from the
// Google Sheet.
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

// Manually reviewed one-off date typos, each with an unambiguous fix.
// Deliberately a fixed lookup, not a generic rule - remaining unparseable
// values are genuinely ambiguous, and a generic rule risks silently guessing
// wrong. Mirrors backend normalize.ts's KNOWN_DATE_TYPOS.
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

// Normalizes the sheet's many raw Test Date formats (DD-MM-YYYY, DD/MM/YYYY,
// DD.MM.YYYY, DD-MM-YY, DD-Month-YYYY, etc.) to "YYYY-MM-DD" so date-range
// filtering and chart sorting are chronological - raw strings don't compare
// correctly against the date picker's YYYY-MM-DD format. Returns null for
// values that can't be confidently parsed.
function parseTestDateToISO(dateStr?: string): string | null {
  const s = (dateStr || "").trim();
  if (!s || isNAlike(s)) return null;
  if (KNOWN_DATE_TYPOS[s]) return KNOWN_DATE_TYPOS[s];

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
    // A 3-digit year like "206" is data-entry corruption (a missing digit) -
    // not safely guessable, so treated as unparseable.
    if (rawYear.length !== 2 && rawYear.length !== 4) return null;
    let year = parseInt(rawYear, 10);
    if (rawYear.length === 2) year += 2000;
    // Caps at 2026 - years past that are a Google Sheets drag-to-fill
    // artifact, not real future test dates.
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

// "Static Dynamic" is confirmed removed from the Type of Question taxonomy
// (matches the backend). "UX Feedback" is deliberately left out of the
// Dynamic/Static tree below - TODO: where it belongs is still unresolved.

const FILTER_FIELDS: IFilterField[] = [
  { key: "category", csvKey: "Question Category", label: "Question Domain", normalize: normalizeQuestionCategory },
  {
    key: "build",
    csvKey: "Build / Version",
    label: "Build / Version",
    // Mirrors the backend's canonical Build/Version value ("1.0", per
    // normalize.ts) so this file's client-side filtering matches raw values
    // ("0.1", "NA", etc.) against it correctly, instead of comparing raw
    // values to "1.0" and silently matching nothing.
    normalize: (v) => ((v || "").trim() ? "1.0" : ""),
  },
  { key: "channel", csvKey: "Channel Tested", label: "Channel Tested", normalize: normalizeChannel, formatOption: channelDisplayLabel },
  { key: "language", csvKey: "Language Tested", label: "Language Tested", normalize: toTitleCase },
  { key: "tester", csvKey: "Tester Name", label: "Tester Name", normalize: normalizeTesterName },
  { key: "status", csvKey: "Overall Test Status", label: "Overall Test Status", normalize: normalizeTestStatus, keepNA: true },
  { key: "severity", csvKey: "Defect Severity", label: "Defect Severity", normalize: normalizeDefectSeverity },
];

export function TestersDashboard() {
  const { data, isLoading, isError } = useTestersDashboardData();
  const { data: zohoData } = useZohoTicketStatuses();
  const zohoStatuses = zohoData?.statuses ?? {};
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [excludeFailures, setExcludeFailures] = useState(false);
  const [releaseHealthExpanded, setReleaseHealthExpanded] = useState(false);
  const [weakestModuleExpanded, setWeakestModuleExpanded] = useState(false);
  // Each Critical Defect Tickets tab (Open/Closed/On Hold/Escalated) keeps
  // its own pagination state so switching tabs doesn't reset the others.
  const [activeDefectsTab, setActiveDefectsTab] = useState<"open" | "closed" | "onHold" | "escalated">("open");
  const [openTicketsPage, setOpenTicketsPage] = useState(0);
  const [closedTicketsPage, setClosedTicketsPage] = useState(0);
  const [onHoldTicketsPage, setOnHoldTicketsPage] = useState(0);
  const [escalatedTicketsPage, setEscalatedTicketsPage] = useState(0);
  // Critical Defect Tickets' team filter - clicking an already-selected team
  // deselects it back to "all teams" (same toggle convention as
  // selectTypeBranch above).
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const toggleSelectedTeam = (key: string) => setSelectedTeam((prev) => (prev === key ? null : key));
  const [activeChartTab, setActiveChartTab] = useState<"trust" | "farmer" | "response" | "tat">("trust");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  // Multi-select OR, independent of `filters` (not a single "all"/value
  // field). Empty array = no filter.
  const [dynamicSubTypes, setDynamicSubTypes] = useState<string[]>([]);
  // Dynamic/Static tree's whole-branch selection. "all" means neither
  // branch is engaged.
  const [typeBranch, setTypeBranch] = useState<"all" | "Dynamic" | "Static">("all");
  const [staticSubTypes, setStaticSubTypes] = useState<string[]>([]);
  const [dynamicExpanded, setDynamicExpanded] = useState(false);
  const [staticExpanded, setStaticExpanded] = useState(false);

  // Clicking the already-selected branch deselects it back to "all".
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

  // Toggles between all-selected and none; "Select All"'s own checked state
  // is derived from the current selection, so unchecking any individual
  // sub-type naturally un-checks it too.
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

  // Channel/Language Performance below are the only remaining client-side
  // calculations (not ported to the backend) - they do NOT apply the
  // dynamicSubTypes/typeBranch/staticSubTypes filters; only the
  // server-computed Executive Summary/Diagnostics/Chart Data below do.
  const summaryQuery = useTestersDashboardSummary(
    filters,
    excludeFailures,
    customStart,
    customEnd,
    dynamicSubTypes,
    typeBranch,
    staticSubTypes,
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
          // Mirrors the backend's applyNonDateFilters - a row with no
          // identifiable Type of Question (blank, orphan Dynamic, "Quality
          // Checking", "Static Dynamic", or a leaked tester name) is treated
          // as a failure too, using the same classifiers the Dynamic/Static
          // branches use elsewhere.
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

    // "Custom Range" behaves like "All Dates" until the user enters a start
    // or end date.
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

  // Which team a linked ticket belongs to, per the live Zoho data - tickets
  // with no Team set in Zoho (or whose live Zoho data hasn't synced yet)
  // fall into "Unassigned" rather than being dropped. Shared by the page-
  // reset effects below, the tab ticket lists, and the team breakdown.
  const getTicketTeam = (ticketId: string): string => zohoStatuses[ticketId]?.team || UNASSIGNED_TEAM_LABEL;
  const matchesSelectedTeam = (ticketId: string): boolean =>
    !selectedTeam || getTicketTeam(ticketId) === selectedTeam;

  // Zoho's short human-facing ticket number (e.g. "539") for display -
  // falls back to the long internal ticket id when Zoho hasn't returned one
  // yet (e.g. not synced), so the card never shows a blank label. The long
  // id itself remains the lookup key and link URL everywhere else.
  const getTicketDisplayNumber = (ticketId: string): string => zohoStatuses[ticketId]?.ticketNumber || ticketId;

  // One independent effect per tab so switching tabs doesn't reset a page
  // position the user hasn't touched. Reads summaryQuery.data/zohoStatuses
  // directly since hooks must run unconditionally, before the loading/error
  // gate further down where `diagnostics` gets bound.
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
        // Pass % scoped to Pass+Fail rows only (matches the main dashboard's
        // Pass Rate formula) - Partial/NA/ungraded rows excluded from the
        // denominator.
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
        // Excludes blank/NA rows from the denominator, mirroring Trust/Farmer
        // Experience's shared translationQualityPct formula (backend
        // kpis.ts) - kept in sync by hand since this stat isn't ported to
        // the backend.
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
    return <div className="p-6 text-muted-foreground">Loading testers dashboard data...</div>;
  }

  if (isError || !data.success || summaryQuery.isError || !summaryQuery.data.success) {
    return (
      <div className="p-6 text-destructive">
        Failed to load testers dashboard data. Check that the backend CSV source is configured.
      </div>
    );
  }

  const kpis = summaryQuery.data.kpis;
  const diagnostics = summaryQuery.data.diagnostics;
  const chartData = summaryQuery.data.chartData;
  const previousPeriodStats = summaryQuery.data.previousPeriodStats;
  const filterOptions = summaryQuery.data.filterOptions;

  // Trust/Farmer plot null (a gap) on no-data days rather than a misleading
  // dip to a placeholder value. Avg Response/Review TAT instead plot 0
  // (visual continuity over the 0-vs-no-data distinction) - see
  // buildRobustRangeSeries and TrendTooltip above.
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

  // avgLatency is always the real value (0 on no-data days server-side).
  // avgLatencyForRange is a separate null-on-no-data field fed only to
  // buildRobustRangeSeries, so those days don't pull the percentile/outlier
  // math down toward 0.
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

  // A ticket with no live Zoho status yet is treated as Open, since it's
  // not known to be otherwise. Shared by both the tabs below and the
  // per-module status breakdown, so the two never drift apart.
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

  // Critical Defect Tickets' team breakdown - grouped by each linked
  // ticket's live Zoho Team (getTicketTeam above), with its ticket count
  // split by the same 4 status buckets as the tabs. Only teams that actually
  // own at least one of these tickets appear (teams are looked up live from
  // Zoho, not a fixed enum like the old ACE module list) - "Unassigned"
  // covers tickets with no Team set in Zoho, so none ever disappear from the
  // card. Sorted by ticket count descending, with Unassigned always last.
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
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Testers Dashboard</h1>
          <p className="text-sm text-muted-foreground">Minimalist Quality Assurance Performance Analytics</p>
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

      {/* flex-wrap (not grid-cols-N) so the layout self-corrects as filter
          cells are added/removed, instead of needing a hand-kept column
          count. min-w-[150px] keeps a cell from being squeezed unreadable
          before wrapping. Custom Range Start/End get their own basis-full
          row below rather than sharing the Date Range cell, which used to
          crush them into an unusably narrow shared column. */}
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
