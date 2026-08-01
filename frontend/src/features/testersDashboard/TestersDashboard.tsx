import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useTestersDashboardData } from "./hooks/useTestersDashboardData";
import type { ITestersDashboardRecord } from "@/hooks/services/testersDashboardService";

function timeToMinutes(timeStr?: string): number | null {
  const trimmed = (timeStr || "").trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === "na" || lower === "nil" || lower === "n/a") return null;
  if (!isNaN(Number(trimmed))) {
    const num = parseFloat(trimmed);
    // Sanity bound: real response/TAT times are minutes, not weeks. The live
    // sheet has a small number of clearly corrupted values (data-entry or
    // formula errors) in the tens-of-thousands to billions range, while 95%
    // of real values are under ~2000 minutes. 5000 comfortably covers real
    // outliers while excluding the corrupted ones.
    if (num < 0 || num > 5000) return null;
    return num;
  }

  const parts = trimmed.split(":");
  if (parts.length >= 3) {
    const hrs = parseFloat(parts[0]) || 0;
    const mins = parseFloat(parts[1]) || 0;
    const secs = parseFloat(parts[2]) || 0;
    return hrs * 60 + mins + secs / 60;
  }
  if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins + secs / 60;
  }
  return null;
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

// ---- Data-quality tolerant matching helpers ----
// Real live-sheet data has inconsistent capitalization ("Yes"/"YES"/"yes") and
// occasional typos. These helpers normalize before comparing so a testers'
// typing style never silently drags KPI numbers down.

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

function isYes(value?: string): boolean {
  return matchesAny(value, ["yes", "y"]);
}

function isNo(value?: string): boolean {
  return matchesAny(value, ["no", "n"]);
}

// The live sheet's "Build / Version" column has inconsistent separators and
// a couple of typos (comma/dash instead of a dot, doubled dots, a letter
// "o" typed instead of digit "0") that would otherwise create multiple
// near-duplicate entries in the filter dropdown (e.g. "0.1", "0,1", "0-1"
// all meaning the same build). Normalizing collapses them into one.
function normalizeBuildVersion(value?: string): string {
  const v = (value || "").trim();
  if (!v) return v;
  return v
    .toLowerCase()
    .replace(/^o(?=[.\d])/, "0")
    .replace(/[,\-]/g, ".")
    .replace(/\.{2,}/g, ".");
}

// Generic case/whitespace normalizer for categorical fields where the
// live sheet just has inconsistent capitalization ("PASS"/"Pass"/"pass"),
// not different wording. Collapses to a single consistent Title Case form
// so duplicate-but-differently-cased values don't show as separate filter
// options.
function toTitleCase(value?: string): string {
  const v = (value || "").trim().replace(/\s+/g, " ");
  if (!v) return v;
  return v
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

// "Channel Tested" mixes spacing as well as case ("webapp" vs "Web App"),
// so simple title-casing alone won't merge them - map known channels
// explicitly, falling back to title case for anything unrecognized.
function normalizeChannel(value?: string): string {
  const compact = (value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (compact === "webapp" || compact === "webapplication") return "Web App";
  if (compact === "whatsapp" || compact === "wa") return "WhatsApp";
  if (compact === "both") return "Both";
  return toTitleCase(value);
}

// "GDB"/"GDP" are acronyms and should stay fully uppercase rather than
// being title-cased into "Gdb"/"Gdp".
function normalizeTypeOfQuestion(value?: string): string {
  const upper = (value || "").trim().toUpperCase();
  if (upper === "GDB" || upper === "GDP") return upper;
  return toTitleCase(value);
}

// "Tester Name" has inconsistent spacing around periods in initials
// ("Ch.sharmila" vs "Ch. Sharmila"), on top of case. This fixes the
// mechanical formatting so the same name in different punctuation styles
// merges into one filter option. Genuine spelling differences (e.g.
// "Jhoydeep" vs "Joydeep") are deliberately NOT auto-merged - guessing
// wrong would misattribute one tester's results to another.
function normalizeTesterName(value?: string): string {
  const v = (value || "")
    .trim()
    .replace(/\.(?=\S)/g, ". ")
    .replace(/\s+/g, " ");
  return toTitleCase(v);
}

// Single source of truth for Trust Score, used identically by the KPI card
// and the trend chart's per-day values - so both always agree with each
// other, rather than the chart using a simplified stand-in formula.
function calculateTrustScore(rows: ITestersDashboardRecord[]): {
  score: number;
  breakdown: { A_sci: number; A_dom: number; S_lnk: number; E_exp: number; Q_trn: number; C_chn: number };
} {
  const N = rows.length;
  if (!N) {
    return { score: 0, breakdown: { A_sci: 0, A_dom: 0, S_lnk: 0, E_exp: 0, Q_trn: 0, C_chn: 0 } };
  }

  const A_sci = pct(rows.filter((r) => matchesAny(r["Answer Scientifically Correct?"], ["correct"])).length, N);

  const weatherRows = rows.filter((r) => !isNAlike(r["Weather Q Answered Correctly?"]));
  const mandiRows = rows.filter((r) => !isNAlike(r["Mandi Price Q Correct?"]));
  const schemeRows = rows.filter((r) => !isNAlike(r["Scheme Q Correct?"]));
  const weatherAcc = weatherRows.length
    ? pct(weatherRows.filter((r) => isYes(r["Weather Q Answered Correctly?"])).length, weatherRows.length)
    : 100;
  const mandiAcc = mandiRows.length
    ? pct(mandiRows.filter((r) => isYes(r["Mandi Price Q Correct?"])).length, mandiRows.length)
    : 100;
  const schemeAcc = schemeRows.length
    ? pct(schemeRows.filter((r) => isYes(r["Scheme Q Correct?"])).length, schemeRows.length)
    : 100;
  const A_dom = Math.round((weatherAcc + mandiAcc + schemeAcc) / 3);

  const S_lnk = pct(rows.filter((r) => isSourceLinkRelevant(r["Source Links Provided?"])).length, N);
  const E_exp = pct(
    rows.filter((r) => matchesAny(r["Expert Name Displayed?"], ["displayed"]) && isYes(r["Correct Expert Name?"]))
      .length,
    N,
  );
  const Q_trn = pct(rows.filter((r) => matchesAny(r["Translation Quality"], ["correct", "good"])).length, N);
  const C_chn = pct(rows.filter((r) => isYes(r["WhatsApp vs Web Answer Match?"])).length, N);

  const score = Math.round(0.4 * A_sci + 0.2 * A_dom + 0.1 * S_lnk + 0.1 * E_exp + 0.1 * Q_trn + 0.1 * C_chn);
  return { score, breakdown: { A_sci, A_dom, S_lnk, E_exp, Q_trn, C_chn } };
}

// Single source of truth for Farmer Experience Score - same reasoning as
// calculateTrustScore above.
function calculateExperienceScore(rows: ITestersDashboardRecord[]): {
  score: number;
  breakdown: { S_rsp: number; S_sla: number; V_io: number; Q_trn: number; N_exp: number };
} {
  const N = rows.length;
  if (!N) {
    return { score: 0, breakdown: { S_rsp: 0, S_sla: 0, V_io: 0, Q_trn: 0, N_exp: 0 } };
  }

  let speedSum = 0;
  let speedCount = 0;
  rows.forEach((r) => {
    const mins = timeToMinutes(r[RESPONSE_TIME_KEY]);
    if (mins !== null) {
      let score = 0;
      if (mins <= 15) score = 100;
      else if (mins > 120) score = 0;
      else score = 100 - ((mins - 15) / (120 - 15)) * 100;
      speedSum += score;
      speedCount++;
    }
  });
  const S_rsp = speedCount ? Math.round(speedSum / speedCount) : 0;

  const S_sla = pct(rows.filter((r) => matchesAny(r["SLA Status"], ["within sla"])).length, N);

  const voiceInWorking = pct(rows.filter((r) => isYes(r["Voice Input Working?"])).length, N);
  const voiceOutWorking = pct(rows.filter((r) => isYes(r["Voice Output Working?"])).length, N);
  const voiceInQuality = pct(rows.filter((r) => matchesAny(r["Voice Input Quality"], ["clear"])).length, N);
  const voiceOutQuality = pct(rows.filter((r) => matchesAny(r["Voice Output Quality"], ["clear"])).length, N);
  const V_io = Math.round((voiceInWorking + voiceOutWorking + voiceInQuality + voiceOutQuality) / 4);

  const Q_trn = pct(rows.filter((r) => matchesAny(r["Translation Quality"], ["correct", "good"])).length, N);

  const validNotifRows = rows.filter(
    (r) =>
      matchesAny(r["Notification Received?"], ["received on time", "received late", "yes"]) &&
      isYes(r["Notification on Same Thread?"]) &&
      isYes(r["Notification Linked Correct Q-ID?"]),
  );
  const N_exp = pct(validNotifRows.length, N);

  const score = Math.round(0.3 * S_rsp + 0.2 * S_sla + 0.2 * V_io + 0.15 * Q_trn + 0.15 * N_exp);
  return { score, breakdown: { S_rsp, S_sla, V_io, Q_trn, N_exp } };
}

// "Source Links Provided?" has the widest spread of real-world variants and
// typos seen in the live sheet (e.g. "Provioded and relevant",
// "Provided & Revelant"). Handle known typos explicitly, then fall back to a
// safe "contains relevant" check - while still excluding "irrelevant" /
// "not relevant" / "not provided", which would otherwise false-match on the
// substring "relevant".
function isSourceLinkRelevant(value?: string): boolean {
  const n = normalize(value);
  const knownPositiveVariants = [
    "provided & relevant",
    "provided and relevant",
    "provioded and relevant", // known typo in live data
    "provident and relevant", // known typo in live data
    "provided & revelant", // known typo in live data
  ];
  if (knownPositiveVariants.includes(n)) return true;
  if (n.includes("irrelevant") || n.includes("not relevant") || n.includes("not provided")) {
    return false;
  }
  return n.includes("relevant");
}

function trendLabel(score: number): { text: string; className: string } {
  if (score >= 70) return { text: "↑ Good", className: "text-emerald-600" };
  if (score >= 40) return { text: "→ Average", className: "text-amber-500" };
  return { text: "↓ Low", className: "text-red-500" };
}

// Formats the backend's lastSyncedAt timestamp (when the 30-min cron job
// last actually refreshed updated.csv from the Google Sheet) as a plain
// clock time, e.g. "5:30 PM".
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

// The live sheet's "Test Date" column has many real-world formats
// (DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YY, DD-Month-YYYY, plus a
// handful of one-off typos). This normalizes any of them into a proper
// "YYYY-MM-DD" string so date-range filtering and chart sorting are
// actually chronological, instead of comparing raw strings that happen to
// be in the wrong format for that (the browser's date picker always gives
// "YYYY-MM-DD", which does NOT match "DD-MM-YYYY" via plain string compare).
// Returns null for values that can't be confidently parsed.
function parseTestDateToISO(dateStr?: string): string | null {
  const s = (dateStr || "").trim();
  if (!s || isNAlike(s)) return null;

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
    // Only 2-digit ("26") or full 4-digit ("2026") years are trustworthy.
    // A 3-digit year like "206" is known data-entry corruption (a missing
    // digit, e.g. "2026" typed as "206") - guessing which digit is missing
    // would be unreliable, so treat it as unparseable instead.
    if (rawYear.length !== 2 && rawYear.length !== 4) return null;
    let year = parseInt(rawYear, 10);
    if (rawYear.length === 2) year += 2000;
    // Known issue in the live sheet: ~30 rows have sequentially-incrementing
    // years (e.g. "14-06-2027", "14-06-2028"...up to "14-06-2039") that look
    // like a Google Sheets drag-to-fill artifact, not real future test
    // dates. This dataset's real testing cycle is 2026 (with one earlier
    // 2022 row worth checking manually) - excluding anything past 2026
    // keeps these artifacts out of date-based filters/charts.
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2026) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

function criticalFailuresLabel(dateRange: string, hasCustomDates: boolean): string {
  switch (dateRange) {
    case "today":
      return "Critical Failures Today";
    case "7days":
      return "Critical Failures (Last 7 Days)";
    case "30days":
      return "Critical Failures (Last 30 Days)";
    case "custom":
      return hasCustomDates ? "Critical Failures (Custom Range)" : "Critical Failures (All Time)";
    default:
      return "Critical Failures (All Time)";
  }
}

function healthBarColor(value: number): string {
  if (value < 40) return "bg-red-500";
  if (value < 70) return "bg-yellow-500";
  return "bg-emerald-500";
}

// NOTE: the source CSV has a typo in this exact column header - a stray
// space in "Respo nse". Kept as-is to match the real data, not a bug here.
const RESPONSE_TIME_KEY = "Respo nse Time (mins) [Auto]";

const EMPTY_FILTERS = {
  dateRange: "all",
  build: "all",
  sprint: "all",
  channel: "all",
  language: "all",
  category: "all",
  tester: "all",
  type: "all",
  status: "all",
  severity: "all",
};

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All Dates" },
  { value: "today", label: "Today" },
  { value: "7days", label: "Last 7 Days" },
  { value: "30days", label: "Last 30 Days" },
  { value: "custom", label: "Custom Range" },
];

const FILTER_FIELDS: {
  key: keyof typeof EMPTY_FILTERS;
  csvKey: string;
  label: string;
  normalize?: (value?: string) => string;
}[] = [
  { key: "build", csvKey: "Build / Version", label: "Build / Version", normalize: normalizeBuildVersion },
  { key: "sprint", csvKey: "Sprint / Cycle", label: "Sprint / Cycle" },
  { key: "channel", csvKey: "Channel Tested", label: "Channel Tested", normalize: normalizeChannel },
  { key: "language", csvKey: "Language Tested", label: "Language Tested", normalize: toTitleCase },
  { key: "category", csvKey: "Question Category", label: "Question Category", normalize: toTitleCase },
  { key: "tester", csvKey: "Tester Name", label: "Tester Name", normalize: normalizeTesterName },
  { key: "type", csvKey: "Type of Question", label: "Type of Question", normalize: normalizeTypeOfQuestion },
  { key: "status", csvKey: "Overall Test Status", label: "Overall Test Status", normalize: toTitleCase },
  { key: "severity", csvKey: "Defect Severity", label: "Defect Severity", normalize: toTitleCase },
];

const TAT_STAGES: { name: string; key: string }[] = [
  { name: "Authoring", key: "Author TAT (mins) [Auto]" },
  { name: "Review 1", key: "Review1 TAT (mins) [Auto]" },
  { name: "Review 2", key: "Review2 TAT (mins) [Auto]" },
  { name: "Review 3", key: "Review3 TAT (mins) [Auto]" },
  { name: "Review 4", key: "Review4 TAT (mins) [Auto]" },
  { name: "Review 5", key: "Review5 TAT (mins) [Auto]" },
  { name: "Moderator", key: "Moderator TAT (mins) [Auto]" },
];

export function TestersDashboard() {
  const { data, isLoading, isError } = useTestersDashboardData();
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [excludeFailures, setExcludeFailures] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const allRecords = data?.records ?? [];

  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const field of FILTER_FIELDS) {
      const rawValues = allRecords.map((r) => (r[field.csvKey] || "").trim());
      const normalized = field.normalize ? rawValues.map(field.normalize) : rawValues;
      const unique = Array.from(new Set(normalized))
        .filter((v) => v !== "" && v !== "NA" && v !== "NIL")
        .sort((a, b) => a.localeCompare(b));
      options[field.key] = unique;
    }
    return options;
  }, [allRecords]);

  const filtered = useMemo(() => {
    let rows: ITestersDashboardRecord[] = allRecords;

    if (excludeFailures) {
      rows = rows.filter(
        (r) =>
          !matchesAny(r["Question Saved in DB?"], ["not saved"]) &&
          !matchesAny(r["Answer Saved in DB?"], ["not saved"]) &&
          !matchesAny(r["Q-ID Consistent Across Systems?"], ["wrongly identified as duplicate"]) &&
          !matchesAny(r["Defect Severity"], ["critical"]),
      );
    }

    for (const field of FILTER_FIELDS) {
      const value = filters[field.key];
      if (value !== "all") {
        if (field.normalize) {
          rows = rows.filter((r) => field.normalize!(r[field.csvKey]) === value);
        } else {
          rows = rows.filter((r) => r[field.csvKey] === value);
        }
      }
    }

    // "Custom Range" should behave exactly like "All Dates" until the user
    // actually enters a start or end date - selecting the dropdown alone
    // shouldn't silently drop rows with unparseable dates.
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

  const kpis = useMemo(() => {
    const N = filtered.length;

    const { score: trustScore, breakdown: trustBreakdown } = calculateTrustScore(filtered);
    const { A_sci, A_dom, S_lnk, E_exp, Q_trn, C_chn } = trustBreakdown;

    const { score: experienceScore, breakdown: experienceBreakdown } = calculateExperienceScore(filtered);
    const { S_rsp, S_sla, V_io, N_exp } = experienceBreakdown;

    const countIncorrect = filtered.filter(
      (r) => matchesAny(r["Answer Scientifically Correct?"], ["incorrect"]),
    ).length;
    const countWeatherIncorrect = filtered.filter((r) => isNo(r["Weather Q Answered Correctly?"])).length;
    const countMandiIncorrect = filtered.filter((r) => isNo(r["Mandi Price Q Correct?"])).length;
    const countSchemeIncorrect = filtered.filter((r) => isNo(r["Scheme Q Correct?"])).length;
    const countDbFailure = filtered.filter(
      (r) =>
        matchesAny(r["Question Saved in DB?"], ["not saved"]) ||
        matchesAny(r["Answer Saved in DB?"], ["not saved"]),
    ).length;
    // KPI Formula Logic doc describes this broadly as "notification
    // validations" (plural) - using all 3 notification-related fields,
    // matching the original outreach_stt tool's check, rather than just
    // the single field listed in the KPI Mapping sample list.
    const countNotifFailure = filtered.filter(
      (r) =>
        matchesAny(r["Notification Received?"], ["not received"]) ||
        isNo(r["Notification on Same Thread?"]) ||
        isNo(r["Notification Linked Correct Q-ID?"]),
    ).length;
    // Newly added per the KPI Mapping doc - previously only used in
    // Release Health, not counted here despite being listed for this KPI.
    const countDuplicateFailure = filtered.filter((r) =>
      matchesAny(r["Q-ID Consistent Across Systems?"], ["wrongly identified as duplicate"]),
    ).length;
    const countCriticalBugs = filtered.filter((r) => matchesAny(r["Defect Severity"], ["critical"])).length;
    const criticalFailuresToday =
      countIncorrect +
      countWeatherIncorrect +
      countMandiIncorrect +
      countSchemeIncorrect +
      countDbFailure +
      countNotifFailure +
      countDuplicateFailure +
      countCriticalBugs;

    const totalPassed = filtered.filter((r) => matchesAny(r["Overall Test Status"], ["pass"])).length;
    const passRate = pct(totalPassed, N);
    const criticalDefectRate = pct(countCriticalBugs, N);
    const dataIntegrityFailures = filtered.filter(
      (r) =>
        matchesAny(r["Question Saved in DB?"], ["not saved"]) ||
        matchesAny(r["Answer Saved in DB?"], ["not saved"]) ||
        matchesAny(r["Q-ID Consistent Across Systems?"], ["wrongly identified as duplicate"]),
    ).length;
    const dataIntegrityRate = pct(dataIntegrityFailures, N);
    const rawReleaseHealth = N ? Math.round(passRate - criticalDefectRate - dataIntegrityRate) : 0;
    const releaseHealth = Math.max(0, Math.min(100, rawReleaseHealth));

    return {
      N,
      trustScore,
      trustBreakdown: { A_sci, A_dom, S_lnk, E_exp, Q_trn, C_chn },
      experienceScore,
      experienceBreakdown: { S_rsp, S_sla, V_io, Q_trn, N_exp },
      criticalFailuresToday,
      criticalBreakdown: {
        countIncorrect,
        countWeatherIncorrect,
        countMandiIncorrect,
        countSchemeIncorrect,
        countDbFailure,
        countNotifFailure,
        countDuplicateFailure,
        countCriticalBugs,
      },
      releaseHealth,
      releaseBreakdown: { passRate, criticalDefects: countCriticalBugs, dataIntegrityFailures },
    };
  }, [filtered]);

  const diagnostics = useMemo(() => {
    const stageStats = TAT_STAGES.map((stage) => {
      let sum = 0;
      let count = 0;
      filtered.forEach((r) => {
        const mins = timeToMinutes(r[stage.key]);
        if (mins !== null) {
          sum += mins;
          count++;
        }
      });
      return { name: stage.name, avg: count ? sum / count : 0 };
    });

    let bottleneckName = "None";
    let bottleneckTime = 0;
    stageStats.forEach((s) => {
      if (s.avg > bottleneckTime) {
        bottleneckTime = s.avg;
        bottleneckName = s.name;
      }
    });

    // Group by normalized category name so casing variants ("Plant Protection"
    // vs "PLANT PROTECTION" vs "Plant protection") don't get split into
    // separate, tiny "categories" that can win the Weakest Module title with
    // a misleading score just from having very few rows. The most common
    // original casing is used as the display label.
    const categoryGroups: Record<string, { rows: ITestersDashboardRecord[]; labelCounts: Record<string, number> }> = {};
    filtered.forEach((r) => {
      const raw = (r["Question Category"] || "").trim();
      if (!raw || isNAlike(raw)) return;
      const key = raw.toLowerCase();
      if (!categoryGroups[key]) categoryGroups[key] = { rows: [], labelCounts: {} };
      categoryGroups[key].rows.push(r);
      categoryGroups[key].labelCounts[raw] = (categoryGroups[key].labelCounts[raw] || 0) + 1;
    });

    let weakestModule = "None";
    let weakestAccuracy = 101;
    let weakestModuleRowCount = 0;
    // Require a minimum sample size before a category is eligible - otherwise
    // a category with just 1-2 rows can "win" the weakest-module title purely
    // by chance (a single bad answer looks like 0% even though it's not a
    // meaningful signal at that sample size).
    const MIN_ROWS_FOR_WEAKEST_MODULE = 10;
    Object.values(categoryGroups).forEach(({ rows: catRows, labelCounts }) => {
      if (catRows.length < MIN_ROWS_FOR_WEAKEST_MODULE) return;
      const displayLabel = Object.entries(labelCounts).sort((a, b) => b[1] - a[1])[0][0];

      const weatherRows = catRows.filter((r) => !isNAlike(r["Weather Q Answered Correctly?"]));
      const mandiRows = catRows.filter((r) => !isNAlike(r["Mandi Price Q Correct?"]));
      const schemeRows = catRows.filter((r) => !isNAlike(r["Scheme Q Correct?"]));
      const weatherAcc = weatherRows.length
        ? pct(weatherRows.filter((r) => isYes(r["Weather Q Answered Correctly?"])).length, weatherRows.length)
        : null;
      const mandiAcc = mandiRows.length
        ? pct(mandiRows.filter((r) => isYes(r["Mandi Price Q Correct?"])).length, mandiRows.length)
        : null;
      const schemeAcc = schemeRows.length
        ? pct(schemeRows.filter((r) => isYes(r["Scheme Q Correct?"])).length, schemeRows.length)
        : null;
      const translationAcc = pct(
        catRows.filter((r) => matchesAny(r["Translation Quality"], ["correct", "good"])).length,
        catRows.length,
      );
      const voiceInAcc = pct(
        catRows.filter((r) => matchesAny(r["Voice Input Quality"], ["clear"])).length,
        catRows.length,
      );
      const voiceOutAcc = pct(
        catRows.filter((r) => matchesAny(r["Voice Output Quality"], ["clear"])).length,
        catRows.length,
      );

      const components = [weatherAcc, mandiAcc, schemeAcc, translationAcc, voiceInAcc, voiceOutAcc].filter(
        (v): v is number => v !== null,
      );
      const acc = components.length
        ? Math.round(components.reduce((sum, v) => sum + v, 0) / components.length)
        : 0;

      if (acc < weakestAccuracy) {
        weakestAccuracy = acc;
        weakestModule = displayLabel;
        weakestModuleRowCount = catRows.length;
      }
    });

    const criticalRows = filtered.filter(
      (r) => matchesAny(r["Defect Severity"], ["critical", "high"]),
    );
    const seenUrls = new Set<string>();
    const openTickets: { id: string; url: string; severity: string }[] = [];
    criticalRows.forEach((r) => {
      // The source sheet's header cell has a literal line break inside it
      // (likely from Alt+Enter in Google Sheets), which Node's csv-parser
      // preserves as an actual \n character in the column name.
      const url = (r["Defect ID / Bug Ref\nZoho Desk Ticketing"] || "").trim();
      if (url && url.toLowerCase().startsWith("http") && !seenUrls.has(url)) {
        seenUrls.add(url);
        openTickets.push({
          id: url.split("/").pop() || url,
          url,
          severity: (r["Defect Severity"] || "").toLowerCase(),
        });
      }
    });

    return {
      stageStats,
      bottleneckName,
      bottleneckTime,
      weakestModule,
      weakestModuleRowCount,
      weakestAccuracy: weakestAccuracy <= 100 ? weakestAccuracy : null,
      openTickets: openTickets.slice(0, 10),
    };
  }, [filtered]);

  const chartData = useMemo(() => {
    const dailyGroups: Record<string, ITestersDashboardRecord[]> = {};
    filtered.forEach((r) => {
      // Group by the normalized ISO date rather than the raw string - the
      // live sheet mixes DD-MM-YYYY, DD/MM/YYYY, DD-MM-YY, etc, and sorting
      // those as raw strings does NOT produce chronological order.
      const iso = parseTestDateToISO(r["Test Date"]);
      if (iso) {
        if (!dailyGroups[iso]) dailyGroups[iso] = [];
        dailyGroups[iso].push(r);
      }
    });

    const sortedDates = Object.keys(dailyGroups).sort();
    const scoreTrend = sortedDates.map((d) => {
      const rows = dailyGroups[d];
      // Same functions the KPI cards use, so the chart's daily values are
      // always consistent with what the cards show for that same period.
      const trust = calculateTrustScore(rows).score;
      const experience = calculateExperienceScore(rows).score;

      let sumMin = 0;
      let countMin = 0;
      rows.forEach((r) => {
        const m = timeToMinutes(r[RESPONSE_TIME_KEY]);
        if (m !== null) {
          sumMin += m;
          countMin++;
        }
      });
      const avgLatency = countMin ? Math.round((sumMin / countMin) * 10) / 10 : 0;

      let tatSum = 0;
      let tatCount = 0;
      rows.forEach((r) => {
        TAT_STAGES.forEach((stage) => {
          const m = timeToMinutes(r[stage.key]);
          if (m !== null) {
            tatSum += m;
            tatCount++;
          }
        });
      });
      const avgReviewTat = tatCount ? Math.round((tatSum / tatCount) * 10) / 10 : 0;

      return { date: d, trust, experience, avgLatency, avgReviewTat };
    });

    const sprintGroups: Record<string, ITestersDashboardRecord[]> = {};
    filtered.forEach((r) => {
      const s = (r["Sprint / Cycle"] || "").trim();
      // Real sprint identifiers (e.g. "Sprint 3", "Cycle 12") virtually
      // always contain a digit. Placeholder/typo values like "NIL", "NA",
      // "NL", "Ye" don't - this catches all known and future typo variants
      // without needing to enumerate each one individually.
      if (s && !isNAlike(s) && /\d/.test(s)) {
        if (!sprintGroups[s]) sprintGroups[s] = [];
        sprintGroups[s].push(r);
      }
    });
    const sortedSprints = Object.keys(sprintGroups).sort();
    const defectsBySprint = sortedSprints.map((s) => ({
      sprint: s,
      defects: sprintGroups[s].filter(
        (r) => matchesAny(r["Defect Severity"], ["critical", "high"]),
      ).length,
    }));

    return { scoreTrend, defectsBySprint };
  }, [filtered]);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading testers dashboard data...</div>;
  }

  if (isError || !data?.success) {
    return (
      <div className="p-6 text-destructive">
        Failed to load testers dashboard data. Check that the backend CSV source is configured.
      </div>
    );
  }

  const maxStageAvg = Math.max(...diagnostics.stageStats.map((s) => s.avg), 1);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Testers Dashboard</h1>
          <p className="text-sm text-muted-foreground">Minimalist Quality Assurance Performance Analytics</p>
        </div>
        <div className="flex items-start gap-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={excludeFailures}
              onChange={(e) => setExcludeFailures(e.target.checked)}
            />
            Exclude Failures
          </label>
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 border rounded-lg p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">
            Date Range
          </label>
          <Select
            value={filters.dateRange}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, dateRange: value }))
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filters.dateRange === "custom" && (
          <div className="col-span-2 md:col-span-2 flex gap-2 items-end">
            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase">Start</label>
              <input
                type="date"
                className="h-8 w-full text-sm border rounded-md px-2"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase">End</label>
              <input
                type="date"
                className="h-8 w-full text-sm border rounded-md px-2"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </div>
        )}
        {FILTER_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase">
              {field.label}
            </label>
            <Select
              value={filters[field.key]}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, [field.key]: value }))
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {filterOptions[field.key]?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Trust Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold flex items-baseline gap-2">
              {kpis.trustScore}%
              <span className={`text-sm font-medium ${trendLabel(kpis.trustScore).className}`}>
                {trendLabel(kpis.trustScore).text}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Sci Accuracy (40%)</span><span>{kpis.trustBreakdown.A_sci}%</span></div>
              <div className="flex justify-between"><span>Domain Accuracy (20%)</span><span>{kpis.trustBreakdown.A_dom}%</span></div>
              <div className="flex justify-between"><span>Source Links (10%)</span><span>{kpis.trustBreakdown.S_lnk}%</span></div>
              <div className="flex justify-between"><span>Expert Matching (10%)</span><span>{kpis.trustBreakdown.E_exp}%</span></div>
              <div className="flex justify-between"><span>Translation Quality (10%)</span><span>{kpis.trustBreakdown.Q_trn}%</span></div>
              <div className="flex justify-between"><span>Channel Consistency (10%)</span><span>{kpis.trustBreakdown.C_chn}%</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Farmer Experience Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold flex items-baseline gap-2">
              {kpis.experienceScore}%
              <span className={`text-sm font-medium ${trendLabel(kpis.experienceScore).className}`}>
                {trendLabel(kpis.experienceScore).text}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Response Speed (30%)</span><span>{kpis.experienceBreakdown.S_rsp}%</span></div>
              <div className="flex justify-between"><span>SLA Compliance (20%)</span><span>{kpis.experienceBreakdown.S_sla}%</span></div>
              <div className="flex justify-between"><span>Voice Mechanics (20%)</span><span>{kpis.experienceBreakdown.V_io}%</span></div>
              <div className="flex justify-between"><span>Translation Quality (15%)</span><span>{kpis.experienceBreakdown.Q_trn}%</span></div>
              <div className="flex justify-between"><span>Notification Exp (15%)</span><span>{kpis.experienceBreakdown.N_exp}%</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">{criticalFailuresLabel(filters.dateRange, Boolean(customStart || customEnd))}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{kpis.criticalFailuresToday}</div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Incorrect Answers</span><span>{kpis.criticalBreakdown.countIncorrect}</span></div>
              <div className="flex justify-between"><span>Weather Q Incorrect</span><span>{kpis.criticalBreakdown.countWeatherIncorrect}</span></div>
              <div className="flex justify-between"><span>Mandi Price Q Incorrect</span><span>{kpis.criticalBreakdown.countMandiIncorrect}</span></div>
              <div className="flex justify-between"><span>Scheme Q Incorrect</span><span>{kpis.criticalBreakdown.countSchemeIncorrect}</span></div>
              <div className="flex justify-between"><span>Not Saved in DB</span><span>{kpis.criticalBreakdown.countDbFailure}</span></div>
              <div className="flex justify-between"><span>Notification Failure</span><span>{kpis.criticalBreakdown.countNotifFailure}</span></div>
              <div className="flex justify-between"><span>Duplicate Q-ID Detected</span><span>{kpis.criticalBreakdown.countDuplicateFailure}</span></div>
              <div className="flex justify-between"><span>Critical Severity Bugs</span><span>{kpis.criticalBreakdown.countCriticalBugs}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Release Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{kpis.releaseHealth}%</div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full ${healthBarColor(kpis.releaseHealth)}`}
                style={{ width: `${kpis.releaseHealth}%` }}
              />
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Overall Pass Rate</span><span>{kpis.releaseBreakdown.passRate}%</span></div>
              <div className="flex justify-between"><span>Critical Defects</span><span>{kpis.releaseBreakdown.criticalDefects}</span></div>
              <div className="flex justify-between"><span>Data Integrity Failures</span><span>{kpis.releaseBreakdown.dataIntegrityFailures}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Biggest Bottleneck</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{diagnostics.bottleneckName}</div>
            <div className="text-sm text-muted-foreground mb-3">
              {diagnostics.bottleneckTime > 0 ? `${diagnostics.bottleneckTime.toFixed(1)} mins avg` : "0 mins avg"}
            </div>
            <div className="space-y-2">
              {diagnostics.stageStats.map((s) => (
                <div key={s.name} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span>{s.name}</span>
                    <span className="font-medium">{s.avg.toFixed(1)}m</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(s.avg / maxStageAvg) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Weakest Module</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{diagnostics.weakestModule}</div>
            <div className="text-sm text-red-500 font-medium mb-2">
              {diagnostics.weakestAccuracy !== null
                ? `${diagnostics.weakestAccuracy}% Accuracy (${diagnostics.weakestModuleRowCount} tests)`
                : "--% Accuracy"}
            </div>
            <p className="text-sm text-muted-foreground">
              This topic category shows the lowest average scientific accuracy across tested queries.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Open Critical Defects</CardTitle>
          </CardHeader>
          <CardContent>
            {diagnostics.openTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active critical/high defects.</p>
            ) : (
              <ul className="space-y-2">
                {diagnostics.openTickets.map((t) => (
                  <li key={t.url} className="flex items-center justify-between text-sm">
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      Ticket #{t.id}
                    </a>
                    <span className="text-xs uppercase text-muted-foreground">{t.severity}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Trust &amp; Farmer Experience Trends</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="trust" name="Trust Score" stroke="#4f46e5" strokeWidth={1.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="experience" name="Farmer Experience" stroke="#10b981" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Average Response Time (Minutes)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Line type="monotone" dataKey="avgLatency" name="Avg Response Time" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Review TAT Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Line type="monotone" dataKey="avgReviewTat" name="Avg Review TAT (mins)" stroke="#8b5cf6" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Defect Count by Sprint / Cycle</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.defectsBySprint}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="sprint" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Bar dataKey="defects" name="Defect Volume" fill="#ef4444" barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
