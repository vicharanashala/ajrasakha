import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
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
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/atoms/popover";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useTestersDashboardData } from "./hooks/useTestersDashboardData";
import { useTestersDashboardSummary } from "./hooks/useTestersDashboardSummary";
import { useZohoTicketStatuses } from "./hooks/useZohoTicketStatuses";
import type { ITestersDashboardRecord } from "@/hooks/services/testersDashboardService";
import { ShieldCheck, Smile, Clock, AlertTriangle, HeartPulse, Bell, Mic, Radio, ChevronDown, ChevronRight, CheckCircle2, XCircle, Info, ClipboardList, Languages, Gauge } from "lucide-react";

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
    const total = hrs * 60 + mins + secs / 60;
    // Same sanity bound as the plain-numeric branch above - Sheet 2.0
    // introduced H:MM:SS values with a leading minus sign (timezone/formula
    // artifact) and a few corrupted multi-million-minute values, which this
    // branch was previously not checking at all, silently corrupting every
    // average built from Response Time (avgResponseMinutes, the Farmer
    // Experience Score's speed sub-score, per-channel/per-day averages).
    if (total < 0 || total > 5000) return null;
    return total;
  }
  if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    const total = mins + secs / 60;
    if (total < 0 || total > 5000) return null;
    return total;
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

// Known real severity levels, plus the one confirmed one-off typo
// ("Crtical" - 1 row) found in the live data, and two team-confirmed
// merges: "Extreme" is the same thing as "Critical", and "Info" is the
// same thing as "Low" - not distinct severity levels of their own.
const KNOWN_SEVERITIES: Record<string, string> = {
  CRITICAL: "Critical",
  CRTICAL: "Critical",
  EXTREME: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Low",
};

// "No Defect" (several casings/typos), "NA", "NIL", "N A", and a lone "No"
// all mean the same thing here: no defect was found, so there's no real
// severity to report. Treated as NA - excluded from the filter dropdown
// the same way blanks are, rather than shown as a 5th "severity" level.
const NO_DEFECT_SEVERITY_VALUES = new Set(["NO DEFECT", "NA", "NIL", "N A", "NO", "NO DFECT"]);

// A handful of rows have an actual defect description typed into this
// field instead of a severity level (e.g. "Appearance of some gibberish
// letters in between the text.", "Missed few points"). These aren't real
// severities, so they're dropped (return "") rather than shown as bogus
// filter options.
function normalizeDefectSeverity(value?: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (NO_DEFECT_SEVERITY_VALUES.has(upper)) return "NA";
  return KNOWN_SEVERITIES[upper] || "";
}

// Generic case/whitespace normalizer for categorical fields where the
// live sheet just has inconsistent capitalization ("PASS"/"Pass"/"pass"),
// not different wording. Collapses to a single consistent Title Case form
// so duplicate-but-differently-cased values don't show as separate filter
// options.
function toTitleCase(value?: string): string {
  const v = (value || "").trim().replace(/\s+/g, " ");
  if (!v) return v;

  // "NA"/"NIL" are missing-data sentinels, not real words to title-case.
  // Without this, toTitleCase("NA") produces "Na", which slips past every field's
  // case-sensitive `v !== "NA"` filter-dropdown exclusion check (Language
  // Tested, Channel Tested) and leaks in as a separate bogus option
  // alongside the real, correctly-excluded "NA".
  const upper = v.toUpperCase();
  if (upper === "NA" || upper === "NIL") return upper;

  // Capitalizes the first letter of the string and any letter that
  // immediately follows a space, hyphen, or en-dash - real Question
  // Category values use both word-separator styles interchangeably
  // ("Insect–Pest Management" vs "Insect-Pest Management"), and only
  // treating spaces as boundaries left the letter after a dash lowercased
  // ("Insect–pest Management").
  return v.toLowerCase().replace(/(^|[\s\-–])([a-z])/g, (_match, sep: string, letter: string) => sep + letter.toUpperCase());
}

// Test Log 2.0 introduced two confirmed word-order swaps for otherwise
// identical compound Question Category names - merges into whichever
// spelling is dominant in real data, same rule as every other merge in
// this file (e.g. Kalaga Deni Sudha -> K. Deni Sudha): "Bio–Fertilizers
// And Bio–Pesticides" (122 rows combined) over "Bio–Pesticides And
// Bio–Fertilizers" (6), and "Extension And Capacity Building" (48) over
// "Capacity Building And Extension" (5). Keys/values are post-dash-
// canonicalization, post-toTitleCase (capitalized "And", en-dash "–" not
// hyphen "-"), matching every other category's actual output below.
// "Live Stock And Animal Husbandary" (10 rows) and "Animal Husbandry And
// Livestock" (2 rows) are the same confirmed category, combining a
// word-order swap with a typo ("Husbandary") and a word-form difference
// ("Live Stock" vs "Livestock") all at once. The majority raw spelling
// (10 vs 2) wins per the usual rule, but the merged output also corrects
// the typo/word-form rather than preserving them as-is - "Livestock And
// Animal Husbandry", not "Live Stock And Animal Husbandary".
const KNOWN_CATEGORY_WORD_ORDER_SWAPS: Record<string, string> = {
  "BIO–PESTICIDES AND BIO–FERTILIZERS": "Bio–Fertilizers And Bio–Pesticides",
  "CAPACITY BUILDING AND EXTENSION": "Extension And Capacity Building",
  "LIVE STOCK AND ANIMAL HUSBANDARY": "Livestock And Animal Husbandry",
  "ANIMAL HUSBANDRY AND LIVESTOCK": "Livestock And Animal Husbandry",
};

// British vs American spelling of the same category - merges into whichever
// is dominant in real data, same rule as every other merge in this file:
// "Fertiliser Use And Availability" (197 rows) over "Fertilizer Use And
// Availability" (13 rows). A full scan of the current category list found
// no other genuine British/American spelling pairs - "Agriculture
// Mechanization" vs "Farm Tools And Mechanisation" both contain a
// -ization/-isation root but are different category phrases, not a
// spelling variant of the same one, so they're deliberately NOT merged
// here (same misattribution caution as untouched name/typo pairs
// elsewhere in this file).
const KNOWN_CATEGORY_SPELLING_VARIANTS: Record<string, string> = {
  "FERTILIZER USE AND AVAILABILITY": "Fertiliser Use And Availability",
};

// "Question Category" uses "&" and "and" interchangeably for the same
// category ("Climate, Weather and Stress Management" vs "Climate, Weather
// & Stress Management") - collapsing "&" to "and" before title-casing
// merges both spellings into one filter option. Only a standalone "&"
// (surrounded by whitespace) is collapsed, matching every real occurrence
// in the live data - not one embedded in some other token.
//
// Separately, "Insect–Pest Management" (en-dash, no spaces - 1515 rows)
// and "Insect - Pest Management" (hyphen, spaced - 354 rows) are the same
// category rendered with two different dash characters/spacing. Every
// hyphen/en-dash (regardless of surrounding spacing) is canonicalized to a
// single spaceless en-dash before title-casing, so both collapse to the
// same output - confirmed via a full scan of live Question Category data
// that Insect-Pest is the only pair this currently merges (the transform
// itself is applied to the whole string, so it also protects against the
// next such pair, not just this one). Side effect: other hyphenated
// compound words in this field (e.g. "Post-Harvest", "Bio-Fertilizers")
// also render with an en-dash now, for the same reason - one canonical
// dash character throughout, not a special case for "Insect" alone.
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

// Mirrors the backend's buildFilterOptions channel whitelist exactly
// (backend/src/modules/dashboard/testersDashboard/filters.ts) - kept as a
// duplicated constant rather than a shared import since frontend/backend
// are separate packages here, same convention as normalizeChannel itself
// above already being a duplicated (not shared) port of the backend's
// version. normalizeChannel's title-case fallback passes anything
// unrecognized straight through unchanged, so a stray value shows up as
// its own bogus group unless filtered out here.
//
// Verified against real live-CSV data (13515 rows) before adding this:
// "Both"/"BOTH"/"both" (137 rows combined) is a real, legitimate channel -
// tests run across both Web App and WhatsApp - not garbage, so it's
// whitelisted alongside Web App/WhatsApp, not excluded. "English" (2 rows,
// both from the same tester/date) is a confirmed data-entry leak: both
// rows also have Language Tested = "English", meaning "English" was
// mistakenly typed into the adjacent Channel Tested column too - not a
// real 4th channel - so it's excluded, same as the backend's dropdown
// already does.
const KNOWN_CHANNEL_VALUES = new Set(["Web App", "WhatsApp", "Both"]);

// Overall Test Status has casing variants (PASS/Pass/pass), a confirmed
// one-off typo ("Pas" - 1 row - for "Pass"), and at least one row with
// garbage data (a literal "\" character, not a real status at all).
// Unrecognized values normalize to "" so they don't show up as a bogus
// filter option or get silently miscounted as a real status - "" is
// already excluded from filter dropdowns elsewhere in this file.
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

// "Tester Name" has inconsistent spacing around periods in initials
// ("Ch.sharmila" vs "Ch. Sharmila"), on top of case. This fixes the
// mechanical formatting so the same name in different punctuation styles
// merges into one filter option. Genuine spelling differences are
// deliberately NOT auto-merged by default - guessing wrong would
// misattribute one tester's results to another. "Jhoydeep" is a confirmed
// exception (1 row) - explicitly confirmed as a typo for "Joydeep", not a
// different person, so it's safe to merge here. Test Log 2.0 introduced two
// more confirmed same-person spellings: "Kalaga Deni Sudha" (270 rows) is
// the same person as the dominant "K.Deni sudha"/"K. Deni sudha" spelling
// (843 rows combined), and "Tulala vishnu Vardhan" (257 rows) is the same
// person as the dominant "T.Vishnu Vardhan" spelling (769 rows combined) -
// both merge into the majority spelling, not the other way around.
// "Lavanya" (24 rows) is a confirmed shorthand for "Lavanya Mathialagan"
// (the dominant full-name spelling), not a different person. "Joydeep
// Singha Roy" (729 rows) is a confirmed same-person spelling for the
// numerically-dominant "Joydeep" (789 rows) - merges into the majority
// spelling, same direction as the Dhaarani S./Dhaarani S trailing-period
// merge, not the fuller-name-wins direction used for Kalaga Deni Sudha/
// Tulala Vishnu Vardhan above.
//
// "TL-2523" (1 row, also checked for the no-dash "TL2523" variant) is a
// Test ID that leaked into this column - a data-entry/column-shift error,
// not a name. Excluded (returns "" - same treatment as blank/invalid)
// rather than fixed in the sheet, so it doesn't show up as a bogus tester
// filter option.
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

  // A trailing period (end of string, e.g. "Dhaarani S.") is mechanical
  // formatting - an initial at the end of a name - not a typo needing the
  // map above. The period-spacing insertion below only fires when a
  // non-space character follows the period ((?=\S)), so a trailing period
  // would otherwise never merge with the dominant no-period form
  // ("Dhaarani S." - 233 rows - vs "Dhaarani S" - 1328 rows). Stripping a
  // single trailing period here is safe: none of the real Tester Name
  // values are genuine abbreviations (like "Dr.") that need the period kept.
  const withoutTrailingPeriod = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;

  const upper = withoutTrailingPeriod.toUpperCase();
  if (KNOWN_LEAKED_TEST_IDS.has(upper)) return "";
  if (KNOWN_TESTER_NAME_TYPOS[upper]) return KNOWN_TESTER_NAME_TYPOS[upper];

  const v = withoutTrailingPeriod.replace(/\.(?=\S)/g, ". ").replace(/\s+/g, " ");
  return toTitleCase(v);
}

// Click-based "how is this calculated" popover, per Nandan's UX call -
// hover doesn't work well with this many cards or on touch devices. Each
// instance manages its own open/close state independently; clicking
// outside (or the icon again) closes it. stopPropagation on the icon
// click matters because some cards (Release Health, Weakest Modules) are
// themselves click-to-expand - without it, opening the info popover would
// also toggle the whole card.
function InfoPopover({
  title,
  children,
  align = "center",
}: {
  title: string;
  children: ReactNode;
  // "center" works for most cards. Use "start" for the leftmost card in a
  // row and "end" for the rightmost - centering under an icon that's
  // already near the viewport edge can still clip the popover off-screen.
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="h-3.5 w-3.5 rounded-full text-muted-foreground/60 hover:text-muted-foreground flex items-center justify-center"
        aria-label={`How is ${title} calculated`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-5 z-20 w-52 max-w-[calc(100vw-2rem)] rounded-md border bg-popover text-popover-foreground shadow-md p-3 text-xs space-y-1.5 ${
            align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
          }`}
        >
          <div className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
          {children}
        </div>
      )}
    </div>
  );
}

// Standard checkbox row for the Type of Question tree's expanded sub-type
// lists (Dynamic/Static) - used for both the "Select All" row and each
// individual sub-type. `indeterminate` needs a DOM ref + effect since
// React's <input> has no `indeterminate` prop (it's a DOM-only property,
// not a reflected HTML attribute) - used by "Select All" when some but not
// all sub-types are checked, the standard tri-state checkbox convention.
function TreeCheckbox({
  label,
  checked,
  indeterminate = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted cursor-pointer select-none">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 rounded border-input accent-primary"
      />
      <span className="truncate">{label}</span>
    </label>
  );
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

// Manually reviewed, one-by-one, as unambiguous typos - a missing/
// scrambled year digit, a stray extra dash, a dot-separator variant - each
// resolving to exactly one sensible real date. Deliberately a fixed lookup,
// not a generic "auto-fix short years" rule: the remaining unparseable
// values are genuinely ambiguous or not dates at all, and a generic rule
// risks silently guessing wrong on those or on future malformed values we
// haven't reviewed yet. Mirrors backend normalize.ts's KNOWN_DATE_TYPOS.
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

// Hex values for the gauge's SVG stroke, thresholded the same way as the
// rest of the dashboard's red/yellow/green indicators.
function healthColorHex(value: number): string {
  if (value < 60) return "#ef4444"; // red-500
  if (value < 80) return "#eab308"; // yellow-500
  return "#10b981"; // emerald-500
}

// Matches the corrected header (was "Respo nse Time (mins) [Auto]" with a
// stray space typo - fixed in the live sheet and here together, see the
// 10-Aug header-alignment work with Test Log 2.0).
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

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All Dates" },
  { value: "today", label: "Today" },
  { value: "7days", label: "Last 7 Days" },
  { value: "30days", label: "Last 30 Days" },
  { value: "custom", label: "Custom Range" },
];

// value must match the backend's dynamicSubBucketFor output exactly (see
// diagnostics.ts's DynamicSubBucket) - label is the short display form used
// in the Dynamic branch's checkbox list.
const DYNAMIC_SUB_TYPE_OPTIONS = [
  { value: "Weather", label: "Weather" },
  { value: "Mandi Prices", label: "Mandi / Market" },
  { value: "Government Schemes", label: "Schemes" },
];

// value must match normalizeTypeOfQuestion's output exactly (see
// backend's filters.ts) - label is the short display form used in the
// Static branch's checkbox list.
const STATIC_SUB_TYPE_OPTIONS = [
  { value: "GDB", label: "GDB" },
  { value: "Unique", label: "Unique" },
  { value: "Outreach", label: "Outreach" },
];

// "Static Dynamic" and "UX Feedback" are deliberately left completely out
// of the Dynamic/Static tree below - not forced into either branch. Static
// Dynamic is final, not a TODO: Hemanth has confirmed it should be removed
// entirely ("You can remove static dynamic category") - matches the
// backend no longer bucketing it in moduleGroupFor or listing it in the
// Type of Question dropdown whitelist. TODO(Hemanth): "UX Feedback" remains
// genuinely unresolved - still pending clarification on where, if
// anywhere, it should fit. The tree/checkbox-list UI pattern here is
// deliberately kept reusable (see the Dynamic/Static branch rendering
// below, and TreeCheckbox) so adding a 3rd branch, or more checkboxes to an
// existing one, is cheap whenever that gets resolved.

// Order matches the updated Executive Summary layout: Date Range and the
// Dynamic/Static type tree (both handled separately, not in this array) are
// followed by Question Category, Build/Version, then the remaining filters.
// "Type of Question" used to be here as a single-select dropdown - it's now
// the tree control rendered in its place. Sprint/Cycle removed per the new
// design - the source data never had real sprint identifiers anyway (see
// earlier data-quality findings).
const FILTER_FIELDS: {
  key: keyof typeof EMPTY_FILTERS;
  csvKey: string;
  label: string;
  normalize?: (value?: string) => string;
  // Most fields treat NA/NIL as "missing data", not a real thing to
  // filter by, so it's excluded from the dropdown by default. Overall
  // Test Status is the exception - NA is a consistent, real status option
  // there, not random corruption, so it stays selectable.
  keepNA?: boolean;
}[] = [
  { key: "category", csvKey: "Question Category", label: "Question Category", normalize: normalizeQuestionCategory },
  {
    key: "build",
    csvKey: "Build / Version",
    label: "Build / Version",
    // The backend's normalizeBuildVersion (normalize.ts) is the source of
    // truth: every real Build/Version value now collapses to the single
    // canonical "1.0", which is what options.build already reflects from
    // the API. This tiny inline mapping isn't a re-creation of the old
    // standalone normalizeBuildVersion function (deleted, and deliberately
    // not restored) - it's the minimum needed so the still-local
    // Channel/Language Performance filtering (applyNonDateFilters below)
    // matches raw values ("0.1", "NA", etc.) against the normalized "1.0"
    // dropdown option the same way the backend does, instead of comparing
    // raw values to "1.0" and silently matching nothing.
    normalize: (v) => ((v || "").trim() ? "1.0" : ""),
  },
  { key: "channel", csvKey: "Channel Tested", label: "Channel Tested", normalize: normalizeChannel },
  { key: "language", csvKey: "Language Tested", label: "Language Tested", normalize: toTitleCase },
  { key: "tester", csvKey: "Tester Name", label: "Tester Name", normalize: normalizeTesterName },
  { key: "status", csvKey: "Overall Test Status", label: "Overall Test Status", normalize: normalizeTestStatus, keepNA: true },
  { key: "severity", csvKey: "Defect Severity", label: "Defect Severity", normalize: normalizeDefectSeverity },
];

// ---- Score Trend chart helpers (Trust/Farmer Experience/Avg Response/Review TAT) ----
//
// Everything below is visualization-only - it never recomputes trust/
// experience/avgLatency/avgReviewTat or their trustHasData/
// experienceHasData/avgLatencySampleCount/avgReviewTatSampleCount fields
// (all confirmed correct server-side earlier today). This section only
// decides how those already-correct numbers get drawn: gaps for no-data
// days (never a plotted 0), straight-line segments instead of a smoothed
// curve, and - for Avg Response/Review TAT only - a percentile-based Y-axis
// range so one extreme day can't flatten every normal day near zero.
//
// The constants below (target tick count, percentile, headroom) are
// algorithm PARAMETERS, not data-derived hardcodes - the actual tick
// spacing/domain/outlier set are all computed fresh from whatever
// chartData.scoreTrend currently contains, not fixed dates/values from this
// specific dataset.
const X_AXIS_TARGET_TICK_COUNT = 10;
const OUTLIER_PERCENTILE = 95;
const OUTLIER_AXIS_HEADROOM = 1.15;

function formatShortDate(iso: string, includeYear = false): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(
    "en-US",
    includeYear
      ? { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" }
      : { month: "short", day: "numeric", timeZone: "UTC" },
  );
}

// Whether the given tick dates span more than one calendar year - if so,
// every tick's label needs the year suffix, or two same-month-day labels
// from different years (a stray historical outlier row next to the real
// testing window, for instance) read as if the axis went backwards. Only
// adds it when actually needed, computed from the real ticks in play, not
// assumed from this dataset's specific shape.
function xAxisTicksSpanMultipleYears(ticks: string[]): boolean {
  return new Set(ticks.map((d) => d.slice(0, 4))).size > 1;
}

function formatFullDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Picks a subset of the given (already chronologically sorted) ISO dates to
// use as X-axis tick LABELS, spaced so the total label count stays near
// X_AXIS_TARGET_TICK_COUNT regardless of how many days the loaded range
// spans - every date's data point still stays in the chart's line; this
// only thins out which dates get a text label under the axis. Always keeps
// the first and last date so the axis never looks truncated.
//
// Deliberately spaced by ARRAY INDEX, not by real calendar distance:
// Recharts renders a string dataKey as a category axis, which places every
// data point at equal PIXEL width by index regardless of how many real days
// separate it from its neighbor. A handful of much-older outlier dates in
// this dataset (a stray 2022/2023/2025 row alongside the main 2026 testing
// window) sit at only a few consecutive indices despite spanning years of
// calendar time - selecting ticks by calendar-day spacing packed most of
// the label budget into that tiny sliver of pixel width (severe overlap)
// while leaving the other 90%+ of the axis under-labeled. Index-based
// spacing matches the axis's actual rendering geometry, so labels land
// evenly across the visible width regardless of real-world date gaps - for
// the dense, mostly-consecutive-day main range this still reads as
// roughly weekly, which is what matters in practice.
function buildXAxisTicks(dates: string[]): string[] {
  if (dates.length <= X_AXIS_TARGET_TICK_COUNT) return dates;
  const step = Math.max(1, Math.ceil(dates.length / X_AXIS_TARGET_TICK_COUNT));
  const ticks: string[] = [];
  for (let i = 0; i < dates.length; i += step) {
    ticks.push(dates[i]);
  }
  const lastDate = dates[dates.length - 1];
  if (ticks[ticks.length - 1] !== lastDate) ticks.push(lastDate);
  return ticks;
}

function computePercentile(values: number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
  return sorted[idx];
}

interface OutlierInfo {
  date: string;
  value: number;
}

// Builds a "robust" Y-axis range from the OUTLIER_PERCENTILE of the day's
// own real (non-null) raw values (rawKey - null on a no-data day, so it
// never pulls the percentile down), then clamps the daily line's PLOTTED
// value to that range - any point above it is drawn right at the top edge
// and flagged via outlierKeyOut, instead of letting one extreme day stretch
// the whole axis and flatten every normal day near zero. The clamp only
// ever affects where a point is DRAWN: the original raw value (rawKey)
// survives untouched in the returned rows for the tooltip to read, so the
// actual number is never hidden - only visually capped.
//
// noDataPlotValue controls what a no-data day (rawKey null) plots as -
// null (the default) renders as a true gap; Avg Response/Review TAT
// deliberately pass 0 instead (per Hemanth's confirmed decision to
// prioritize visual line continuity over the 0-vs-no-data distinction for
// just those 2 tabs), while still excluding those same no-data days from
// the percentile/outlier math above via rawKey being null for them.
function buildRobustRangeSeries<T extends { date: string }>(
  points: T[],
  rawKey: string,
  plotKeyOut: string,
  outlierKeyOut: string,
  noDataPlotValue: number | null = null,
): { data: (T & Record<string, unknown>)[]; domainMax: number; outliers: OutlierInfo[] } {
  const realValues = points
    .map((p) => (p as Record<string, unknown>)[rawKey] as number | null | undefined)
    .filter((v): v is number => v !== null && v !== undefined);
  const percentileValue = computePercentile(realValues, OUTLIER_PERCENTILE);
  const rawMax = realValues.length ? Math.max(...realValues) : 0;
  // Guard: if the percentile itself is 0 (every real value is 0, or too few
  // points for a percentile to mean anything), fall back to the actual max
  // so the axis is never degenerate (0-height).
  const domainMax = Math.max(1, percentileValue > 0 ? Math.ceil(percentileValue * OUTLIER_AXIS_HEADROOM) : rawMax);

  const outliers: OutlierInfo[] = [];
  const data = points.map((p) => {
    const v = (p as Record<string, unknown>)[rawKey] as number | null | undefined;
    let isOutlier = false;
    let plotValue: number | null = noDataPlotValue;
    if (v !== null && v !== undefined) {
      isOutlier = v > domainMax;
      if (isOutlier) outliers.push({ date: p.date, value: v });
      plotValue = isOutlier ? domainMax : v;
    }
    return { ...p, [plotKeyOut]: plotValue, [outlierKeyOut]: isOutlier };
  });
  return { data, domainMax, outliers };
}

// Plain small circle for a normal point; a distinct upward triangle (drawn
// at the already-clamped, top-of-axis position) for a point flagged as an
// outlier by buildRobustRangeSeries. The marker's position never implies
// the real value - that's only ever shown via the tooltip.
function makeTrendDot(outlierKey: string | undefined, color: string) {
  return function TrendDot(props: {
    cx?: number;
    cy?: number;
    payload?: Record<string, unknown>;
    index?: number;
  }) {
    const { cx, cy, payload, index } = props;
    // Recharts calls this once per data point (including no-data/gap
    // points, where cx/cy come back null) and collects the results into one
    // array, so every branch needs its own stable key - index is always
    // present and unique even when payload/cx/cy aren't, so it's the
    // fallback of last resort.
    const dateKey = String(payload?.date ?? `dot-${index}`);
    // Recharts' dot renderer type requires a ReactElement, never null - an
    // empty, keyed <g/> is the "draw nothing" equivalent for a null/
    // undefined point (e.g. a gap where connectNulls has no line to attach
    // a dot to).
    if (cx == null || cy == null) return <g key={`empty-${dateKey}`} />;
    const isOutlier = outlierKey ? Boolean(payload?.[outlierKey]) : false;
    if (isOutlier) {
      return (
        <polygon
          key={`outlier-${dateKey}`}
          points={`${cx},${cy - 5} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}`}
          fill="#ef4444"
          stroke="#ef4444"
        />
      );
    }
    return <circle key={`dot-${dateKey}`} cx={cx} cy={cy} r={2} fill={color} stroke={color} />;
  };
}

interface TrendTooltipConfig {
  valueLabel: string;
  valueSuffix: string;
  rawValueKey: string;
  hasDataKey?: string;
  sampleCountKey?: string;
}

// One shared tooltip for all 4 tabs, so their format stays identical by
// construction rather than 4 hand-written copies drifting apart. Reads the
// full underlying row (payload[0].payload) rather than per-series values,
// since a "no data" day needs to say so explicitly instead of showing
// whatever a null line segment would otherwise render as.
function TrendTooltip({
  active,
  payload,
  config,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
  config: TrendTooltipConfig;
}) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  // Trust/Farmer (hasDataKey) keep the "No valid data" fallback exactly as
  // before. Avg Response/Review TAT (sampleCountKey, no hasDataKey) always
  // show the value + reading-count row now, even at 0 readings - per
  // Hemanth's confirmed decision, the line itself shows 0 rather than a gap
  // for those 2 tabs, so "0 valid readings" in the tooltip is what lets a
  // hovering user tell a real 0 apart from no data, not a separate branch.
  const hasData = config.hasDataKey ? Boolean(point[config.hasDataKey]) : true;

  const sampleCount = config.sampleCountKey ? Number(point[config.sampleCountKey] ?? 0) : null;

  return (
    <div className="rounded-md border bg-popover text-popover-foreground shadow-md p-2 text-xs space-y-0.5 min-w-[150px]">
      <div className="font-semibold">{formatFullDate(String(point.date))}</div>
      {hasData ? (
        <>
          <div>
            {config.valueLabel}: <span className="font-medium">{String(point[config.rawValueKey])}{config.valueSuffix}</span>
          </div>
          {sampleCount !== null && (
            <div className="text-muted-foreground">
              {sampleCount} valid reading{sampleCount === 1 ? "" : "s"}
            </div>
          )}
        </>
      ) : (
        <div className="text-muted-foreground">No valid data</div>
      )}
    </div>
  );
}

interface TrendChartProps {
  data: Record<string, unknown>[];
  xTicks: string[];
  plotKey: string;
  color: string;
  name: string;
  yLabel: string;
  yDomain: [number, number];
  yTicks?: number[];
  tooltipConfig: TrendTooltipConfig;
  outlierKey?: string;
  outliers?: OutlierInfo[];
}

// Shared chart shell for all 4 Score Trend tabs - a single render path is
// what actually enforces "keep all 4 charts visually consistent," rather
// than 4 hand-maintained copies that could silently drift apart.
function TrendChart({
  data,
  xTicks,
  plotKey,
  color,
  name,
  yLabel,
  yDomain,
  yTicks,
  tooltipConfig,
  outlierKey,
  outliers,
}: TrendChartProps) {
  const worstOutlier =
    outliers && outliers.length ? outliers.reduce((worst, o) => (o.value > worst.value ? o : worst), outliers[0]) : null;
  const tickIncludesYear = xAxisTicksSpanMultipleYears(xTicks);

  return (
    <div className="relative h-full w-full">
      {worstOutlier && (
        <div className="absolute top-0 right-0 z-10 text-[10px] px-2 py-1 rounded-bl-md bg-red-50 text-red-600 border-l border-b border-red-200">
          {outliers!.length} value{outliers!.length === 1 ? "" : "s"} above range (max {worstOutlier.value}
          {tooltipConfig.valueSuffix} on {formatShortDate(worstOutlier.date, true)})
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 25, right: 30, bottom: 15, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={xTicks}
            interval={0}
            tickFormatter={(iso: string) => formatShortDate(iso, tickIncludesYear)}
            tick={{ fontSize: 9 }}
            angle={-35}
            textAnchor="end"
            height={70}
            label={{ value: "Test Date", position: "insideBottom", offset: -15, fontSize: 11, fill: "#374151" }}
          />
          <YAxis
            domain={yDomain}
            ticks={yTicks}
            tick={{ fontSize: 9 }}
            label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: "#374151" }}
          />
          <Tooltip content={<TrendTooltip config={tooltipConfig} />} />
          <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 10 }} />
          <Line type="linear" dataKey={plotKey} name={name} stroke={color} strokeWidth={1.5} dot={makeTrendDot(outlierKey, color)} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TestersDashboard() {
  const { data, isLoading, isError } = useTestersDashboardData();
  const { data: zohoData } = useZohoTicketStatuses();
  const zohoStatuses = zohoData?.statuses ?? {};
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [excludeFailures, setExcludeFailures] = useState(false);
  const [releaseHealthExpanded, setReleaseHealthExpanded] = useState(false);
  const [weakestModuleExpanded, setWeakestModuleExpanded] = useState(false);
  const CRITICAL_DEFECTS_PAGE_SIZE = 10;
  // Critical Defect Tickets card: 3 independent tabs (Open/Closed/On Hold,
  // categorized by live Zoho status), each with its own pagination state so
  // switching tabs never resets or shares page position with the others.
  const [activeDefectsTab, setActiveDefectsTab] = useState<"open" | "closed" | "onHold">("open");
  const [openTicketsPage, setOpenTicketsPage] = useState(0);
  const [closedTicketsPage, setClosedTicketsPage] = useState(0);
  const [onHoldTicketsPage, setOnHoldTicketsPage] = useState(0);
  const [activeChartTab, setActiveChartTab] = useState<"trust" | "farmer" | "response" | "tat">("trust");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  // Dynamic Sub-Type filter: multi-select OR, independent of filters.type -
  // not part of `filters` since it's a string[], not one of that object's
  // single "all"/selected-value fields. Empty array = no filter. Reused
  // as-is (state/logic already built and tested) from the old standalone
  // "Dynamic Sub-Type" dropdown - only how it's rendered changed, now as a
  // checkbox list nested under Dynamic in the tree control below.
  const [dynamicSubTypes, setDynamicSubTypes] = useState<string[]>([]);
  // Dynamic/Static tree's whole-branch selection - the restructured "Type
  // of Question" filter (see the TODO on STATIC_SUB_TYPE_OPTIONS above for
  // why Static Dynamic/UX Feedback aren't part of this tree). "all" means
  // neither branch is engaged.
  const [typeBranch, setTypeBranch] = useState<"all" | "Dynamic" | "Static">("all");
  // Static's sub-types (GDB/Unique/Outreach), multi-select OR - same shape
  // and toggle/select-all pattern as dynamicSubTypes above (was a
  // single-select string in an earlier version of this tree; converted to
  // match Dynamic exactly since the checkbox-list UI below needs arbitrary
  // subsets, not "one at a time").
  const [staticSubTypes, setStaticSubTypes] = useState<string[]>([]);
  const [dynamicExpanded, setDynamicExpanded] = useState(false);
  const [staticExpanded, setStaticExpanded] = useState(false);

  // Clicking a branch's label (not its chevron, not a checkbox) selects
  // that whole branch with no sub-filter - clicking the already-selected
  // branch again deselects it back to "all". Clears the other branch's/
  // this branch's own sub-type selections, since a whole-branch selection
  // has no sub-filter by definition.
  function selectTypeBranch(branch: "Dynamic" | "Static") {
    setTypeBranch((prev) => (prev === branch ? "all" : branch));
    setDynamicSubTypes([]);
    setStaticSubTypes([]);
  }

  // "All" - same reset-to-unfiltered behavior the old flat dropdown's "All"
  // option had. Non-expandable (no chevron, no checkboxes of its own),
  // sits above both branches at the same indentation level.
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

  // Checking "Select All" selects every sub-type; unchecking it (i.e. it
  // was already fully checked) clears the selection back to none.
  // Unchecking any individual sub-type below naturally un-checks "Select
  // All" too, since its own checked state is just derived from "are all 3
  // selected" - no separate flag to keep in sync.
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

  // Same Select-All-derived-from-current-selection pattern as Dynamic's
  // toggleDynamicSelectAll above - reused, not reinvented, just for
  // Static's 3 sub-types.
  function toggleStaticSelectAll() {
    setTypeBranch("Static");
    setDynamicSubTypes([]);
    setStaticSubTypes((prev) =>
      prev.length === STATIC_SUB_TYPE_OPTIONS.length ? [] : STATIC_SUB_TYPE_OPTIONS.map((o) => o.value),
    );
  }

  // Trigger button's summary text - shows the current selection as a single
  // line, same as a plain <Select> would: "All" (default/reset), "Dynamic"/
  // "Static" (whole branch - either clicked directly with no sub-filter, OR
  // every sub-type checked via Select All - both read the same to the
  // user), or "Dynamic (2 selected)" for a partial pick.
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

  // Server-side-computed KPIs/diagnostics/chartData/previousPeriodStats/
  // filterOptions for the current filter state (see
  // backend/src/modules/dashboard/testersDashboard/
  // {kpis,diagnostics,chartData,filters}.ts). The Channel Tested and
  // Language Tested stats tables below were never ported to the backend
  // (out of scope for the phased cutover) and still compute client-side
  // from `filtered`/`allRecords` - they're the only remaining client-side
  // calculation in this component, and NOTE: they don't currently apply
  // the dynamicSubTypes/typeBranch/staticSubTypes filters below
  // (dynamicSubBucketFor/normalizeTypeOfQuestion were deliberately not
  // duplicated client-side, matching this file's existing server-migration
  // direction) - only the server-computed Executive Summary/Diagnostics/
  // Chart Data reflect a Dynamic/Static tree selection.
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
          normalizeDefectSeverity(r["Defect Severity"]) !== "Critical",
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

  // Generic "vs previous period" delta label. The arrow (↑/↓) is always the
  // literal factual direction the number moved. The COLOR is metric-aware:
  // `lowerIsBetter` tells this whether a decrease is the desirable
  // direction for that specific metric (e.g. Fail Rate, Avg Response Time,
  // Critical Defects - lower is better) vs the default of an increase being
  // desirable (Pass Rate, Scientific Accuracy, etc.) - a metric can
  // decrease while still showing green if that's the good direction for it.
  // Required (no default) so every call site has to state its own
  // desirability explicitly rather than silently inheriting a default that
  // could be wrong for a metric added later.
  function periodDelta(
    current: number,
    previous: number,
    lowerIsBetter: boolean,
  ): { text: string; className: string } | null {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return { text: "New", className: "text-muted-foreground" };
    const change = Math.round(((current - previous) / previous) * 1000) / 10;
    if (change === 0) return { text: "→ No change", className: "text-muted-foreground" };
    const isGoodDirection = lowerIsBetter ? change < 0 : change > 0;
    return {
      text: `${change > 0 ? "↑" : "↓"} ${Math.abs(change)}% vs previous period`,
      className: isGoodDirection ? "text-emerald-600" : "text-red-500",
    };
  }

  // Reset each tab's own page whenever ITS OWN ticket list length changes,
  // so the user isn't silently stuck on a now-empty or out-of-range page -
  // one independent effect per tab, not shared, so switching tabs never
  // resets a page position the user hasn't touched. Reads
  // summaryQuery.data/zohoStatuses directly (rather than the tab-list
  // locals declared below) since these hooks must run unconditionally on
  // every render, before the loading/error gate further down where
  // `diagnostics` gets bound.
  useEffect(() => {
    setOpenTicketsPage(0);
  }, [
    summaryQuery.data?.diagnostics.openTickets.filter((t) => {
      const status = zohoStatuses[t.id]?.status?.toLowerCase();
      return !status || status === "open";
    }).length,
  ]);

  useEffect(() => {
    setClosedTicketsPage(0);
  }, [
    summaryQuery.data?.diagnostics.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "closed",
    ).length,
  ]);

  useEffect(() => {
    setOnHoldTicketsPage(0);
  }, [
    summaryQuery.data?.diagnostics.openTickets.filter(
      (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "on hold",
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
        // Pass % scoped to Pass+Fail rows only, matching the main
        // dashboard's already-confirmed Pass Rate formula - Partial/NA/
        // ungraded rows were previously folded into the ÷tests denominator,
        // understating every channel's Pass % by 15-37 points depending on
        // channel (confirmed via a live-data investigation before this fix).
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
        // Per Hemanth's confirmation, Translation Quality excludes blank/NA
        // rows from its denominator - same fix applied to Trust Score's and
        // Farmer Experience's Q_trn (backend kpis.ts's shared
        // translationQualityPct helper). This is a separate, client-side
        // implementation of the identical formula (Language Performance was
        // never ported to the backend), so it has to be kept in sync by
        // hand rather than sharing that helper directly.
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

  // ---- Score Trend chart data (all 4 tabs) ----
  // Trust/Farmer: Recharts breaks the line at a null/undefined y-value by
  // default, so *Plot is nulled out on days with no real data behind it -
  // rendering a visible gap instead of a misleading dip to a placeholder
  // number (Trust Score's old ~20% floor). Every date still gets an x-axis
  // data point from the underlying chartData.scoreTrend array - only the
  // plotted value is suppressed, not the row itself.
  //
  // Avg Response/Review TAT: deliberately the OPPOSITE - per Hemanth's
  // confirmed decision, these 2 tabs keep visual line continuity over the
  // 0-vs-no-data distinction, so a no-data day plots as 0 rather than a
  // gap. The tooltip's reading count is how a hovering user still tells a
  // real 0 apart from no data (see buildRobustRangeSeries's noDataPlotValue
  // and TrendTooltip below).
  //
  // See the TrendChart/buildRobustRangeSeries helpers above for the
  // percentile-range mechanics.
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

  // Avg Response/Review TAT deliberately do NOT gap out no-data days on the
  // line (per Hemanth's confirmed decision - visual continuity wins over
  // the 0-vs-no-data distinction for just these 2 tabs) - avgLatency/
  // avgReviewTat below are always the real value (already 0 on a no-data
  // day server-side), so the tooltip can show it plainly. avgLatencyForRange/
  // avgReviewTatForRange are a SEPARATE null-on-no-data field fed only to
  // buildRobustRangeSeries, so those days still don't pull the percentile/
  // outlier math down toward 0 - outlier handling stays numerically
  // identical to before this change.
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

  const maxStageAvg = Math.max(...diagnostics.stageStats.map((s) => s.avg), 1);

  // Critical Defect Tickets card: diagnostics.openTickets categorized into
  // 3 tabs by live Zoho status. A ticket with no live status yet (not
  // synced/matched) is treated as Open, since we don't know it's not open.
  // diagnostics.openTickets itself stays severity-scoped (Critical/High)
  // only; this is a separate, live-status-driven categorization on top of
  // that. Exhaustive over the 3 known real-world statuses - a hypothetical
  // future status we haven't seen yet wouldn't match any tab.
  const openTabTickets = diagnostics.openTickets.filter((t) => {
    const status = zohoStatuses[t.id]?.status?.toLowerCase();
    return !status || status === "open";
  });
  const closedTabTickets = diagnostics.openTickets.filter(
    (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "closed",
  );
  const onHoldTabTickets = diagnostics.openTickets.filter(
    (t) => zohoStatuses[t.id]?.status?.toLowerCase() === "on hold",
  );

  const DEFECTS_TABS = [
    { key: "open" as const, label: "Open", tickets: openTabTickets, page: openTicketsPage, setPage: setOpenTicketsPage },
    { key: "closed" as const, label: "Closed", tickets: closedTabTickets, page: closedTicketsPage, setPage: setClosedTicketsPage },
    { key: "onHold" as const, label: "On Hold", tickets: onHoldTabTickets, page: onHoldTicketsPage, setPage: setOnHoldTicketsPage },
  ];
  const activeDefectsTabInfo = DEFECTS_TABS.find((t) => t.key === activeDefectsTab)!;

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

      {/* flex-wrap, not a fixed grid-cols-N, deliberately: a grid-cols-N
          layout has to be hand-kept in sync with the exact number of
          top-level cells (Date Range + the tree + FILTER_FIELDS.length) -
          that count changed when Type of Question/Dynamic Sub-Type merged
          into one tree cell, and a stale N leaves an empty, unfillable
          track (fr units still reserve its share of width even with no
          content in it) - visible as dead space that doesn't reach the
          container's right edge. flex-1 items instead just proportionally
          share whatever width is available, self-correcting no matter how
          many filter cells exist or how wide any one of them's content is;
          min-w-[150px] keeps a cell (particularly the tree, whose label +
          chevron content is wider than a short Select's) from being
          squeezed to unreadable width before wrapping to a new row.

          The Custom Range Start/End inputs are DELIBERATELY NOT nested
          inside the Date Range cell below - they used to be, which meant
          Start+End had to share that single ~150-170px flex-1 column
          (confirmed via live DOM inspection: the wrapper measured
          167.69px total for both fields combined), crushing End to an
          unusable/unclickable width. They're now their own `basis-full`
          sibling in this same flex flex-wrap row: `basis-full` forces a
          flex item onto its own new line and lets it claim the row's full
          width, regardless of where it sits among its siblings - so Start
          and End each get real, comfortable width (capped at 240px so
          they don't stretch absurdly wide on large screens) instead of
          splitting one filter-sized column. */}
      <div className="flex flex-wrap gap-3 border rounded-lg p-4 w-full">
        <div className="flex-1 min-w-[150px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">
            Date Range
          </label>
          <Select
            value={filters.dateRange}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, dateRange: value }))
            }
          >
            <SelectTrigger className="h-8 w-full text-sm">
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

        {/* Dynamic/Static tree control - replaces the old single "Type of
            Question" dropdown AND the standalone "Dynamic Sub-Type"
            dropdown above, merged into one nested control. Rendered as a
            Popover (same primitive DropdownMenu/Select already use
            elsewhere in this file - Radix Portal + floating-ui positioning),
            NOT a plain inline div: the earlier version rendered the full
            All/Dynamic/Static tree directly in document flow, which grew
            this cell's height/collided with neighboring cells (e.g. Date
            Range's Custom Range inputs) whenever a branch was expanded, and
            contributed to the row not filling full width. The trigger
            button is a fixed-height, fixed-in-flow element - identical
            footprint whether the popover is open or closed - and the tree
            itself lives entirely inside PopoverContent, which portals
            outside this grid/flex row and floats on top, so it can never
            push or resize sibling filter cells. Each branch's chevron (on
            the right, rotates 90° when open) toggles that branch's
            checkbox list open/closed only; clicking the branch's own label
            selects the whole branch (no sub-filter). PopoverContent has a
            fixed width (w-60) rather than sizing to content, so it doesn't
            grow/shrink as different branches expand. */}
        <div className="flex-1 min-w-[150px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">
            Type of Question
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                // Classes here are lifted verbatim from atoms/select.tsx's
                // SelectTrigger so this plain <button> (no built-in styling
                // of its own, unlike SelectTrigger) is visually
                // indistinguishable from its sibling filters:
                // - border-input is the same border color SelectTrigger
                //   uses (confirmed by reading its source - it's not a
                //   different/lighter value), but SelectTrigger also
                //   carries shadow-xs, a subtle drop-shadow that visually
                //   reinforces the edge - without it, the identical border
                //   color alone reads as fainter, which is what was
                //   actually happening here.
                // - dark:bg-input/30 dark:hover:bg-input/50 for full dark-
                //   mode parity, same as SelectTrigger.
                // - outline-none + the focus-visible:* trio for the focus
                //   ring, matching SelectTrigger's own focus treatment
                //   instead of the browser's raw default outline.
                className="h-8 w-full text-sm border border-input rounded-md px-3 flex items-center justify-between gap-2 bg-transparent shadow-xs dark:bg-input/30 dark:hover:bg-input/50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                {/* text-foreground pinned explicitly: neither SelectTrigger
                    nor SelectValue sets an explicit non-placeholder text
                    color in their own source - Select's "All" text is just
                    inheriting the page's default text-foreground (set on
                    <body>). This span had no color class at all, leaving it
                    exposed to whatever color its own ancestor chain
                    happened to resolve to instead - pinning it explicitly
                    to the same text-foreground value removes that
                    ambiguity rather than relying on inheritance lining up
                    by accident. */}
                <span className="truncate text-foreground">{typeSummaryLabel()}</span>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-2 text-sm">
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={selectAllTypes}
                  aria-pressed={typeBranch === "all"}
                  className={`w-full text-left px-1.5 py-1 rounded truncate ${
                    typeBranch === "all" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                  }`}
                >
                  All
                </button>

                <div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => selectTypeBranch("Dynamic")}
                      aria-pressed={typeBranch === "Dynamic"}
                      className={`flex-1 text-left px-1.5 py-1 rounded truncate ${
                        typeBranch === "Dynamic" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                      }`}
                    >
                      Dynamic
                    </button>
                    <button
                      type="button"
                      onClick={() => setDynamicExpanded((v) => !v)}
                      className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={dynamicExpanded ? "Collapse Dynamic" : "Expand Dynamic"}
                      aria-expanded={dynamicExpanded}
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${dynamicExpanded ? "rotate-90" : ""}`}
                      />
                    </button>
                  </div>
                  {dynamicExpanded && (
                    <div className="pl-3 pb-1 space-y-0.5">
                      <TreeCheckbox
                        label="Select All"
                        checked={dynamicSubTypes.length === DYNAMIC_SUB_TYPE_OPTIONS.length}
                        indeterminate={dynamicSubTypes.length > 0 && dynamicSubTypes.length < DYNAMIC_SUB_TYPE_OPTIONS.length}
                        onChange={toggleDynamicSelectAll}
                      />
                      {DYNAMIC_SUB_TYPE_OPTIONS.map((opt) => (
                        <TreeCheckbox
                          key={opt.value}
                          label={opt.label}
                          checked={dynamicSubTypes.includes(opt.value)}
                          onChange={() => toggleDynamicSubType(opt.value)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => selectTypeBranch("Static")}
                      aria-pressed={typeBranch === "Static"}
                      className={`flex-1 text-left px-1.5 py-1 rounded truncate ${
                        typeBranch === "Static" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                      }`}
                    >
                      Static
                    </button>
                    <button
                      type="button"
                      onClick={() => setStaticExpanded((v) => !v)}
                      className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={staticExpanded ? "Collapse Static" : "Expand Static"}
                      aria-expanded={staticExpanded}
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${staticExpanded ? "rotate-90" : ""}`}
                      />
                    </button>
                  </div>
                  {staticExpanded && (
                    <div className="pl-3 pb-1 space-y-0.5">
                      <TreeCheckbox
                        label="Select All"
                        checked={staticSubTypes.length === STATIC_SUB_TYPE_OPTIONS.length}
                        indeterminate={staticSubTypes.length > 0 && staticSubTypes.length < STATIC_SUB_TYPE_OPTIONS.length}
                        onChange={toggleStaticSelectAll}
                      />
                      {STATIC_SUB_TYPE_OPTIONS.map((opt) => (
                        <TreeCheckbox
                          key={opt.value}
                          label={opt.label}
                          checked={staticSubTypes.includes(opt.value)}
                          onChange={() => toggleStaticSubType(opt.value)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {FILTER_FIELDS.map((field) => (
          <div key={field.key} className="flex-1 min-w-[150px] space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase">
              {field.label}
            </label>
            <Select
              value={filters[field.key]}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, [field.key]: value }))
              }
            >
              <SelectTrigger className="h-8 w-full text-sm">
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

        {/* Own full-width row: `basis-full` forces this flex item onto a
            new line within the `flex flex-wrap` row above and lets it
            claim the ENTIRE row width for itself, regardless of its
            position among siblings - so Start/End are no longer squeezed
            into sharing the Date Range cell's ~150-170px column (see the
            comment above the row's opening div for the full root-cause
            history). Each input is capped at max-w-[240px] so they don't
            stretch to an awkward full-row width on large screens, just
            get comfortably more room than before. */}
        {filters.dateRange === "custom" && (
          <div className="basis-full flex gap-3">
            <div className="space-y-1 flex-1 min-w-[150px] max-w-[240px]">
              <label className="text-xs font-medium text-muted-foreground uppercase">Start</label>
              <input
                type="date"
                className="h-8 w-full text-sm border rounded-md px-2"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[150px] max-w-[240px]">
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
      </div>

      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Executive Summary</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <Card className="border-muted-foreground/10 min-h-[130px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Total Tests Executed</CardTitle>
              <InfoPopover title="Total Tests Executed" align="start">
                <p>Count of all test rows matching the current filters.</p>
                <div className="flex justify-between pt-1 border-t"><span>Total</span><span className="font-medium">{kpis.totalTests.toLocaleString()}</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <div className="text-3xl font-bold">{kpis.totalTests.toLocaleString()}</div>
              <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><ClipboardList className="h-5 w-5 text-blue-600" /></div>
            </div>
            {previousPeriodStats && periodDelta(kpis.totalTests, previousPeriodStats.totalTests, false) && (
              <div className={`text-xs font-medium mt-1 ${periodDelta(kpis.totalTests, previousPeriodStats.totalTests, false)!.className}`}>
                {periodDelta(kpis.totalTests, previousPeriodStats.totalTests, false)!.text}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-muted-foreground/10 min-h-[130px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Pass Rate</CardTitle>
              <InfoPopover title="Pass Rate">
                <p>"Overall Test Status" = Pass ÷ Total Tests × 100</p>
                <div className="flex justify-between"><span>Passed</span><span className="font-medium">{kpis.totalPassed.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Total</span><span className="font-medium">{kpis.totalTests.toLocaleString()}</span></div>
                <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.passRate}%</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <div className="text-3xl font-bold">{kpis.passRate}%</div>
              <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
            </div>
            {previousPeriodStats && periodDelta(kpis.passRate, previousPeriodStats.passRate, false) && (
              <div className={`text-xs font-medium mt-1 ${periodDelta(kpis.passRate, previousPeriodStats.passRate, false)!.className}`}>
                {periodDelta(kpis.passRate, previousPeriodStats.passRate, false)!.text}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-muted-foreground/10 min-h-[130px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Fail Rate</CardTitle>
              <InfoPopover title="Fail Rate">
                <p>"Overall Test Status" = Fail ÷ Total Tests × 100</p>
                <div className="flex justify-between"><span>Failed</span><span className="font-medium">{kpis.totalFailed.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Total</span><span className="font-medium">{kpis.totalTests.toLocaleString()}</span></div>
                <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.failRate}%</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <div className="text-3xl font-bold">{kpis.failRate}%</div>
              <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center shrink-0"><XCircle className="h-5 w-5 text-red-600" /></div>
            </div>
            {previousPeriodStats && periodDelta(kpis.failRate, previousPeriodStats.failRate, true) && (
              <div className={`text-xs font-medium mt-1 ${periodDelta(kpis.failRate, previousPeriodStats.failRate, true)!.className}`}>
                {periodDelta(kpis.failRate, previousPeriodStats.failRate, true)!.text}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-muted-foreground/10 min-h-[130px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Avg Response Time</CardTitle>
              <InfoPopover title="Avg Response Time">
                <p>Average of "Response Time (mins)" across valid readings</p>
                <div className="flex justify-between"><span>Valid readings</span><span className="font-medium">{kpis.avgResponseSampleCount.toLocaleString()}</span></div>
                <div className="flex justify-between pt-1 border-t"><span>Average</span><span className="font-medium">{kpis.avgResponseMinutes} min</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <div className="text-3xl font-bold">
                {kpis.avgResponseMinutes} <span className="text-base font-medium text-muted-foreground">min</span>
              </div>
              <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><Clock className="h-5 w-5 text-amber-600" /></div>
            </div>
            {previousPeriodStats && periodDelta(kpis.avgResponseMinutes, previousPeriodStats.avgResponseMinutes, true) && (
              <div className={`text-xs font-medium mt-1 ${periodDelta(kpis.avgResponseMinutes, previousPeriodStats.avgResponseMinutes, true)!.className}`}>
                {periodDelta(kpis.avgResponseMinutes, previousPeriodStats.avgResponseMinutes, true)!.text}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-muted-foreground/10 min-h-[130px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Scientific Accuracy</CardTitle>
              <InfoPopover title="Scientific Accuracy">
                <p>"Answer Scientifically Correct?" = Correct ÷ Total Tests × 100</p>
                <div className="flex justify-between"><span>Correct</span><span className="font-medium">{kpis.sciCorrectCount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Total</span><span className="font-medium">{kpis.totalTests.toLocaleString()}</span></div>
                <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.trustBreakdown.A_sci}%</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <div className="text-3xl font-bold">{kpis.trustBreakdown.A_sci}%</div>
              <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5 text-indigo-600" /></div>
            </div>
            {previousPeriodStats && periodDelta(kpis.trustBreakdown.A_sci, previousPeriodStats.scientificAccuracy, false) && (
              <div className={`text-xs font-medium mt-1 ${periodDelta(kpis.trustBreakdown.A_sci, previousPeriodStats.scientificAccuracy, false)!.className}`}>
                {periodDelta(kpis.trustBreakdown.A_sci, previousPeriodStats.scientificAccuracy, false)!.text}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-muted-foreground/10 min-h-[130px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Critical Defects</CardTitle>
              <InfoPopover title="Critical Defects">
                <p>Count of rows where Defect Severity is Critical. Matches Release Health's Critical Defects count.</p>
                <div className="flex justify-between pt-1 border-t"><span>Count</span><span className="font-medium">{kpis.criticalBreakdown.countCriticalBugs.toLocaleString()}</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <div className="text-3xl font-bold">{kpis.criticalBreakdown.countCriticalBugs}</div>
              <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center shrink-0"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
            </div>
            {previousPeriodStats && periodDelta(kpis.criticalBreakdown.countCriticalBugs, previousPeriodStats.countCriticalBugs, true) && (
              <div className={`text-xs font-medium mt-1 ${periodDelta(kpis.criticalBreakdown.countCriticalBugs, previousPeriodStats.countCriticalBugs, true)!.className}`}>
                {periodDelta(kpis.criticalBreakdown.countCriticalBugs, previousPeriodStats.countCriticalBugs, true)!.text}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-muted-foreground/10 min-h-[130px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Notification Success</CardTitle>
              <InfoPopover title="Notification Success">
                <p>"Notification Received?" = On Time ÷ rows with a result logged × 100</p>
                <div className="flex justify-between"><span>Received on Time</span><span className="font-medium">{kpis.notificationSuccessOnTimeCount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Notification Results</span><span className="font-medium">{kpis.notificationSuccessTotalCount.toLocaleString()}</span></div>
                <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.notificationSuccess}%</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <div className="text-3xl font-bold">{kpis.notificationSuccess}%</div>
              <div className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center shrink-0"><Bell className="h-5 w-5 text-purple-600" /></div>
            </div>
            {previousPeriodStats && periodDelta(kpis.notificationSuccess, previousPeriodStats.notificationSuccess, false) && (
              <div className={`text-xs font-medium mt-1 ${periodDelta(kpis.notificationSuccess, previousPeriodStats.notificationSuccess, false)!.className}`}>
                {periodDelta(kpis.notificationSuccess, previousPeriodStats.notificationSuccess, false)!.text}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-muted-foreground/10 min-h-[130px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Voice Success</CardTitle>
              <InfoPopover title="Voice Success" align="end">
                <p>Average of "Voice Input Quality" and "Voice Output Quality"</p>
                <div className="grid grid-cols-2 gap-x-2 pt-1 border-t">
                  <span>Clear: 10</span><span>Good: 8</span>
                  <span>Low Volume: 4</span><span>Distorted: 3</span>
                  <span className="col-span-2">No Output/Input: 0</span>
                </div>
                <div className="flex justify-between pt-1 border-t"><span>Valid scores</span><span className="font-medium">{kpis.voiceSuccess.sampleSize.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Average</span><span className="font-medium">{kpis.voiceSuccess.score}/10</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <div className="text-3xl font-bold">
                {kpis.voiceSuccess.score} <span className="text-base font-medium text-muted-foreground">/10</span>
              </div>
              <div className="h-9 w-9 rounded-full bg-cyan-100 flex items-center justify-center shrink-0"><Mic className="h-5 w-5 text-cyan-600" /></div>
            </div>
            {previousPeriodStats && periodDelta(kpis.voiceSuccess.score, previousPeriodStats.voiceSuccess, false) && (
              <div className={`text-xs font-medium mt-1 ${periodDelta(kpis.voiceSuccess.score, previousPeriodStats.voiceSuccess, false)!.className}`}>
                {periodDelta(kpis.voiceSuccess.score, previousPeriodStats.voiceSuccess, false)!.text}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">
        Additional Metrics
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0"><ShieldCheck className="h-3.5 w-3.5 text-indigo-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">Trust Score</CardTitle>
              </div>
              <InfoPopover title="Trust Score" align="start">
                <p>40% Sci Accuracy + 20% Domain + 10% Source Links + 10% Expert + 10% Translation + 10% Channel Consistency</p>
                <div className="flex justify-between"><span>Sci Accuracy</span><span className="font-medium">{kpis.trustBreakdown.A_sci}%</span></div>
                <div className="flex justify-between"><span>Domain Accuracy</span><span className="font-medium">{kpis.trustBreakdown.A_dom}%</span></div>
                <div className="flex justify-between"><span>Source Links</span><span className="font-medium">{kpis.trustBreakdown.S_lnk}%</span></div>
                <div className="flex justify-between"><span>Expert Matching</span><span className="font-medium">{kpis.trustBreakdown.E_exp}%</span></div>
                <div className="flex justify-between"><span>Translation</span><span className="font-medium">{kpis.trustBreakdown.Q_trn}%</span></div>
                <div className="flex justify-between"><span>Channel Consistency</span><span className="font-medium">{kpis.trustBreakdown.C_chn}%</span></div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Channel Consistency is based on questions tested on both channels only (n={kpis.trustBreakdown.C_chn_sampleSize.toLocaleString()}) - Channel Tested = "Both" - not the full dataset.
                </p>
                <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.trustScore}%</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            <div className="text-3xl font-bold flex items-baseline gap-2">
              {kpis.trustScore}%
              <span className={`text-xs font-medium ${trendLabel(kpis.trustScore).className}`}>
                {trendLabel(kpis.trustScore).text}
              </span>
            </div>
            <div className="mt-2 space-y-0.5 text-xs">
              <div className="flex justify-between"><span>Sci Accuracy (40%)</span><span>{kpis.trustBreakdown.A_sci}%</span></div>
              <div className="flex justify-between"><span>Domain Accuracy (20%)</span><span>{kpis.trustBreakdown.A_dom}%</span></div>
              <div className="flex justify-between"><span>Source Links (10%)</span><span>{kpis.trustBreakdown.S_lnk}%</span></div>
              <div className="flex justify-between"><span>Expert Matching (10%)</span><span>{kpis.trustBreakdown.E_exp}%</span></div>
              <div className="flex justify-between"><span>Translation Quality (10%)</span><span>{kpis.trustBreakdown.Q_trn}%</span></div>
              <div className="flex justify-between"><span>Channel Consistency (10%)</span><span>{kpis.trustBreakdown.C_chn}%</span></div>
            </div>
          </CardContent>
        </Card>


        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><Smile className="h-3.5 w-3.5 text-emerald-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">Farmer Experience</CardTitle>
              </div>
              <InfoPopover title="Farmer Experience">
                <p>30% Response Speed + 20% SLA + 20% Voice Mechanics + 15% Translation + 15% Notification Exp</p>
                <div className="flex justify-between"><span>Response Speed</span><span className="font-medium">{kpis.experienceBreakdown.S_rsp}%</span></div>
                <div className="flex justify-between"><span>SLA Compliance</span><span className="font-medium">{kpis.experienceBreakdown.S_sla}%</span></div>
                <div className="flex justify-between"><span>Voice Mechanics</span><span className="font-medium">{kpis.experienceBreakdown.V_io}%</span></div>
                <div className="flex justify-between"><span>Translation</span><span className="font-medium">{kpis.experienceBreakdown.Q_trn}%</span></div>
                <div className="flex justify-between"><span>Notification Exp</span><span className="font-medium">{kpis.experienceBreakdown.N_exp}%</span></div>
                <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.experienceScore}%</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            <div className="text-3xl font-bold flex items-baseline gap-2">
              {kpis.experienceScore}%
              <span className={`text-xs font-medium ${trendLabel(kpis.experienceScore).className}`}>
                {trendLabel(kpis.experienceScore).text}
              </span>
            </div>
            <div className="mt-2 space-y-0.5 text-xs">
              <div className="flex justify-between"><span>Response Speed (30%)</span><span>{kpis.experienceBreakdown.S_rsp}%</span></div>
              <div className="flex justify-between"><span>SLA Compliance (20%)</span><span>{kpis.experienceBreakdown.S_sla}%</span></div>
              <div className="flex justify-between"><span>Voice Mechanics (20%)</span><span>{kpis.experienceBreakdown.V_io}%</span></div>
              <div className="flex justify-between"><span>Translation Quality (15%)</span><span>{kpis.experienceBreakdown.Q_trn}%</span></div>
              <div className="flex justify-between"><span>Notification Exp (15%)</span><span>{kpis.experienceBreakdown.N_exp}%</span></div>
            </div>
          </CardContent>
        </Card>


        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center shrink-0"><AlertTriangle className="h-3.5 w-3.5 text-red-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">{criticalFailuresLabel(filters.dateRange, Boolean(customStart || customEnd))}</CardTitle>
              </div>
              <InfoPopover title="Critical Failures">
                <p>Sum of 8 failure-type counts, listed below.</p>
                <div className="flex justify-between pt-1 border-t"><span>Total</span><span className="font-medium">{kpis.criticalFailuresToday.toLocaleString()}</span></div>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            <div className="text-3xl font-bold">{kpis.criticalFailuresToday}</div>
            <div className="mt-2 space-y-1 text-xs">
              {[
                { label: "Incorrect Answers", value: kpis.criticalBreakdown.countIncorrect },
                { label: "Weather Q Incorrect", value: kpis.criticalBreakdown.countWeatherIncorrect },
                { label: "Mandi Price Q Incorrect", value: kpis.criticalBreakdown.countMandiIncorrect },
                { label: "Scheme Q Incorrect", value: kpis.criticalBreakdown.countSchemeIncorrect },
                { label: "Not Saved in DB", value: kpis.criticalBreakdown.countDbFailure },
                { label: "Notification Failure", value: kpis.criticalBreakdown.countNotifFailure },
                { label: "Duplicate Q-ID Detected", value: kpis.criticalBreakdown.countDuplicateFailure },
                { label: "Critical Severity Bugs", value: kpis.criticalBreakdown.countCriticalBugs },
              ]
                .sort((a, b) => b.value - a.value)
                .map((row, i) => {
                  const dotColor = i === 0 ? "bg-red-500" : i === 1 ? "bg-orange-500" : i === 2 ? "bg-yellow-500" : "bg-slate-300";
                  return (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                        {row.label}
                      </span>
                      <span>{row.value}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>


        <Card
          className="border-muted-foreground/10 min-h-[260px] flex flex-col cursor-pointer select-none hover:border-muted-foreground/30 transition-colors"
          onClick={() => setReleaseHealthExpanded((v) => !v)}
        >
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-sky-100 flex items-center justify-center shrink-0"><HeartPulse className="h-3.5 w-3.5 text-sky-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">Release Health</CardTitle>
              </div>
              <div className="flex items-center gap-1.5">
                <InfoPopover title="Release Health" align="end">
                  <p>Pass Rate − Critical Defect Rate − Data Integrity Rate</p>
                  <div className="flex justify-between"><span>Pass Rate</span><span className="font-medium">{kpis.releaseBreakdown.passRate}%</span></div>
                  <div className="flex justify-between"><span>Critical Defect Rate</span><span className="font-medium">{kpis.releaseBreakdown.criticalDefectRate}%</span></div>
                  <div className="flex justify-between"><span>Data Integrity Rate</span><span className="font-medium">{kpis.releaseBreakdown.dataIntegrityRate}%</span></div>
                  <div className="flex justify-between pt-1 border-t"><span>Result</span><span className="font-medium">{kpis.releaseHealth}%</span></div>
                </InfoPopover>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ${releaseHealthExpanded ? "rotate-180" : ""}`}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            <div className="relative w-full max-w-[160px] mx-auto">
              <svg viewBox="0 0 100 55" className="w-full h-auto overflow-visible">
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="currentColor"
                  className="text-muted"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke={healthColorHex(kpis.releaseHealth)}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray="125.6"
                  strokeDashoffset={125.6 * (1 - kpis.releaseHealth / 100)}
                  style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.5s ease" }}
                />
              </svg>
              <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
                <span className="text-2xl font-bold leading-none">{kpis.releaseHealth}%</span>
              </div>
            </div>
            <div className="text-center text-xs text-muted-foreground -mt-1">Release Health Score</div>

            <div
              className={`grid transition-all duration-300 ease-in-out ${
                releaseHealthExpanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden space-y-2 text-xs border-t pt-2">
                {[
                  {
                    label: "Overall Pass Rate",
                    value: `${kpis.releaseBreakdown.passRate}%`,
                    ok: kpis.releaseBreakdown.passRate >= 80,
                    warn: kpis.releaseBreakdown.passRate >= 60,
                    barPct: kpis.releaseBreakdown.passRate,
                  },
                  {
                    label: "Critical Defects",
                    value: `${kpis.releaseBreakdown.criticalDefects}`,
                    ok: kpis.releaseBreakdown.criticalDefects === 0,
                    warn: false,
                    barPct: Math.min(100, pct(kpis.releaseBreakdown.criticalDefects, kpis.N)),
                  },
                  {
                    label: "Data Integrity Failures",
                    value: `${kpis.releaseBreakdown.dataIntegrityFailures}`,
                    ok: kpis.releaseBreakdown.dataIntegrityFailures === 0,
                    warn: false,
                    barPct: Math.min(100, pct(kpis.releaseBreakdown.dataIntegrityFailures, kpis.N)),
                  },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        {row.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : row.warn ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {row.label}
                      </span>
                      <span className="font-medium">{row.value}</span>
                    </div>
                    {row.barPct !== null && (
                      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${row.ok ? "bg-emerald-500" : row.warn ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${row.barPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>




        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0"><Radio className="h-3.5 w-3.5 text-orange-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">Channel-wise Performance</CardTitle>
              </div>
              <InfoPopover title="Channel-wise Performance" align="start">
                <p>Grouped by Channel Tested.</p>
                <p>Pass % = Passed ÷ (Passed + Failed) for that channel - Partial/NA/ungraded rows excluded, matching the main dashboard's Pass Rate.</p>
                <p>Avg Resp = average response time for that channel's rows.</p>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            {channelStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No channel data for current filters.</p>
            ) : (
              <div className="text-xs">
                <div className="grid grid-cols-4 gap-1 font-medium text-muted-foreground uppercase text-[9px] border-b pb-1.5">
                  <span>Channel</span>
                  <span className="text-right">Tests</span>
                  <span className="text-right">Pass %</span>
                  <span className="text-right">Resp</span>
                </div>
                <div className="divide-y">
                  {channelStats.map((c) => (
                    <div key={c.channel} className="grid grid-cols-4 gap-1 py-1.5">
                      <span className="truncate">{c.channel}</span>
                      <span className="text-right">{c.tests}</span>
                      <span className="text-right">{c.passRate}%</span>
                      <span className="text-right">{c.avgResponse}m</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>


        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-full bg-teal-100 flex items-center justify-center shrink-0"><Languages className="h-3.5 w-3.5 text-teal-600" /></div>
              <CardTitle className="text-xs text-muted-foreground uppercase">Language Performance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            {languageStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No language data for current filters.</p>
            ) : (
              <div className="text-xs">
                <div className="grid grid-cols-3 gap-1 font-medium text-muted-foreground uppercase text-[9px] border-b pb-1.5">
                  <span>Language</span>
                  <span className="text-right">Tests</span>
                  <span className="text-right">Translation Acc.</span>
                </div>
                <div className="divide-y">
                  {languageStats.map((l) => (
                    <div key={l.language} className="grid grid-cols-3 gap-1 py-1.5">
                      <span className="truncate">{l.language}</span>
                      <span className="text-right">{l.tests}</span>
                      <span className="text-right">{l.translationAcc}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>


        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-full bg-cyan-100 flex items-center justify-center shrink-0"><Mic className="h-3.5 w-3.5 text-cyan-600" /></div>
              <CardTitle className="text-xs text-muted-foreground uppercase">Voice Performance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col justify-center space-y-3 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Voice Input Quality</span>
                <span className="font-medium">
                  {kpis.voiceSuccess.inputAvg !== null ? `${kpis.voiceSuccess.inputAvg}/10` : "No data"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-cyan-500"
                  style={{ width: `${((kpis.voiceSuccess.inputAvg || 0) / 10) * 100}%` }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Voice Output Quality</span>
                <span className="font-medium">
                  {kpis.voiceSuccess.outputAvg !== null ? `${kpis.voiceSuccess.outputAvg}/10` : "No data"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-cyan-500"
                  style={{ width: `${((kpis.voiceSuccess.outputAvg || 0) / 10) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground pt-1">
              {kpis.voiceSuccess.inputCount} input readings, {kpis.voiceSuccess.outputCount} output readings scored ({kpis.voiceSuccess.sampleSize} total).
            </p>
          </CardContent>
        </Card>


        <Card className="border-muted-foreground/10 min-h-[260px] flex flex-col">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><Gauge className="h-3.5 w-3.5 text-blue-600" /></div>
                <CardTitle className="text-xs text-muted-foreground uppercase">SLA Compliance</CardTitle>
              </div>
              <InfoPopover title="SLA Compliance" align="end">
                <p>Based on the "SLA Status" column as marked by testers (Within SLA vs SLA Breached) - blank/NA/Not Applicable rows are excluded, not counted as breached.</p>
                <div className="flex justify-between pt-1 border-t"><span>Valid SLA rows</span><span className="font-medium">{kpis.slaBreakdown.validRows.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Within SLA</span><span className="font-medium">{kpis.slaBreakdown.withinSlaCount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>SLA Breached</span><span className="font-medium">{kpis.slaBreakdown.breachedCount.toLocaleString()}</span></div>
                <div className="flex justify-between pt-1 border-t"><span>Avg Delay</span><span className="font-medium">{kpis.slaBreakdown.avgDelayMinutes} min</span></div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Avg Delay = Response Time − 120 min, averaged over {(kpis.slaBreakdown.breachedCount - kpis.slaBreakdown.breachedWithoutTimeCount).toLocaleString()} of {kpis.slaBreakdown.breachedCount.toLocaleString()} breached rows ({kpis.slaBreakdown.breachedWithoutTimeCount.toLocaleString()} breached rows had no usable Response Time reading).
                </p>
              </InfoPopover>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col">
            <div className="relative w-full max-w-[160px] mx-auto">
              <svg viewBox="0 0 100 55" className="w-full h-auto overflow-visible">
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="currentColor"
                  className="text-muted"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke={healthColorHex(kpis.slaBreakdown.withinSlaPct)}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray="125.6"
                  strokeDashoffset={125.6 * (1 - kpis.slaBreakdown.withinSlaPct / 100)}
                  style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.5s ease" }}
                />
              </svg>
              <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
                <span className="text-2xl font-bold leading-none">{kpis.slaBreakdown.withinSlaPct}%</span>
              </div>
            </div>
            <div className="text-center text-xs text-muted-foreground -mt-1">Within SLA</div>

            <div className="mt-3 space-y-1.5 text-xs border-t pt-2">
              <div className="flex justify-between">
                <span>Exceeded SLA</span>
                <span className="font-medium">{kpis.slaBreakdown.exceededSlaPct}%</span>
              </div>
              <div className="flex justify-between">
                <span>Avg Delay</span>
                <span className="font-medium">{kpis.slaBreakdown.avgDelayMinutes} mins</span>
              </div>
            </div>
          </CardContent>
        </Card>


      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-muted-foreground/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Biggest Bottleneck</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
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

        <Card
          className="border-muted-foreground/10 cursor-pointer select-none hover:border-muted-foreground/30 transition-colors"
          onClick={() => setWeakestModuleExpanded((v) => !v)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Weakest Modules</CardTitle>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ${weakestModuleExpanded ? "rotate-180" : ""}`}
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold">{diagnostics.weakestModule}</div>
            <div className="text-sm text-red-500 font-medium mb-2">
              {diagnostics.weakestModuleScore !== null
                ? `${diagnostics.weakestModuleScore}% Overall (${diagnostics.weakestModuleRowCount} tests)`
                : "Awaiting data"}
            </div>
            <p className="text-sm text-muted-foreground">
              Calculated from the average of all applicable quality metrics for this module (Pass Rate, Accuracy,
              Translation, Voice, SLA, Notification, and Defect Rate) — metrics with no data for this module are
              excluded, not counted as a failure.
            </p>
            <div
              className={`grid transition-all duration-300 ease-in-out ${
                weakestModuleExpanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden space-y-2 text-xs border-t pt-2">
                {diagnostics.modulePerformance.map((m) => (
                  <div key={m.bucket} className="flex justify-between">
                    <span>{m.bucket}</span>
                    <span className="font-medium">
                      {m.overallScore !== null ? `${m.overallScore}% (${m.totalRows})` : `${m.totalRows} tests`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-muted-foreground/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
              Critical Defect Tickets
            </CardTitle>
            <div className="flex flex-wrap gap-1 mt-2">
              {DEFECTS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveDefectsTab(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeDefectsTab === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {diagnostics.criticalDefectCount === 0 ? (
              <p className="text-sm text-muted-foreground">No active critical/high defects.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  {activeDefectsTabInfo.tickets.length} {activeDefectsTabInfo.label.toLowerCase()} critical/high
                  defect{activeDefectsTabInfo.tickets.length === 1 ? "" : "s"} total.
                </p>
                {diagnostics.openTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No ticket links logged for these yet.</p>
                ) : activeDefectsTabInfo.tickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No {activeDefectsTabInfo.label.toLowerCase()} critical/high tickets.
                  </p>
                ) : (
                  <>
                    <ul className="space-y-2">
                      {activeDefectsTabInfo.tickets
                        .slice(
                          activeDefectsTabInfo.page * CRITICAL_DEFECTS_PAGE_SIZE,
                          (activeDefectsTabInfo.page + 1) * CRITICAL_DEFECTS_PAGE_SIZE,
                        )
                        .map((t) => (
                          <li key={t.url} className="flex items-center justify-between text-sm">
                            <a
                              href={t.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline"
                            >
                              Ticket #{t.id}
                            </a>
                            {/* Status isn't shown per row - the active tab
                                (Open/Closed/On Hold) already states it, same
                                "implied by context" principle the single-view
                                card used before this tab layout existed. */}
                            <span
                              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                                t.severity === "critical" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                              }`}
                            >
                              {t.severity}
                            </span>
                          </li>
                        ))}
                    </ul>
                    {activeDefectsTabInfo.tickets.length > CRITICAL_DEFECTS_PAGE_SIZE && (
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <button
                          type="button"
                          disabled={activeDefectsTabInfo.page === 0}
                          onClick={() => activeDefectsTabInfo.setPage((p) => Math.max(0, p - 1))}
                          className="px-2 py-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
                        >
                          Previous
                        </button>
                        <span className="text-muted-foreground">
                          Page {activeDefectsTabInfo.page + 1} of{" "}
                          {Math.ceil(activeDefectsTabInfo.tickets.length / CRITICAL_DEFECTS_PAGE_SIZE)}
                        </span>
                        <button
                          type="button"
                          disabled={
                            (activeDefectsTabInfo.page + 1) * CRITICAL_DEFECTS_PAGE_SIZE >=
                            activeDefectsTabInfo.tickets.length
                          }
                          onClick={() =>
                            activeDefectsTabInfo.setPage((p) =>
                              (p + 1) * CRITICAL_DEFECTS_PAGE_SIZE < activeDefectsTabInfo.tickets.length ? p + 1 : p,
                            )
                          }
                          className="px-2 py-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

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
