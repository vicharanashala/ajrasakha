// Filtering logic for the Testers Dashboard CSV - date-range filtering, the
// 9 filter dimensions, the "vs previous period" date-window calculation,
// and filter-dropdown option building.
//
// Deliberately scoped to filtering/window-math only, not KPI aggregation -
// pass rate, scientific accuracy, voice success etc. over the previous-period
// rows are computed by kpis.ts. getPreviousPeriodRows() below returns the
// previous-period ROWS; kpis.ts's functions run over whatever rows this
// returns.

import type { TestersDashboardRecord } from '../interfaces/ITestersDashboardService.js';
import {
    normalizeTypeOfQuestion,
    normalizeBuildVersion,
    normalizeDefectSeverity,
    toTitleCase,
    normalizeQuestionCategory,
    normalizeChannel,
    normalizeTestStatus,
    normalizeTesterName,
    matchesAny,
    parseTestDateToISO,
    getTodayIST,
} from './normalize.js';
import { dynamicSubBucketFor, type DynamicSubBucket } from './diagnostics.js';

export type TestersDashboardDateRange = 'all' | 'today' | '7days' | '30days' | 'custom';

// Named `typeBranch`, NOT `category` - `category` on this same interface
// already means the unrelated "Question Category" filter dimension.
export type TypeBranch = 'all' | 'Dynamic' | 'Static';

export interface TestersDashboardFilters {
    dateRange: TestersDashboardDateRange;
    type: string;
    category: string;
    build: string;
    channel: string;
    language: string;
    tester: string;
    status: string;
    severity: string;
    // Multi-select OR filter on Dynamic's sub-components (see
    // dynamicSubBucketFor in diagnostics.ts), independent of the `type`
    // field above - a user can filter by sub-component without also
    // setting type=Dynamic. Empty array = no filter.
    dynamicSubTypes: string[];
    // 'Dynamic' or 'Static' selects that whole branch; 'all' means the tree
    // isn't engaged. Independent of the legacy `type` field (kept for API
    // back-compat) rather than replacing it.
    //
    // "Static Dynamic" is deliberately left out of both branches, matching
    // moduleGroupFor in diagnostics.ts and the Type of Question dropdown
    // whitelist below.
    typeBranch: TypeBranch;
    // Multi-select OR filter on Static's sub-types - GDB/Unique/Outreach.
    // Empty array = no narrowing; when typeBranch === 'Static' with an
    // empty array, matches the whole branch (all 3 combined) - see
    // applyNonDateFilters below.
    staticSubTypes: string[];
}

export const EMPTY_FILTERS: TestersDashboardFilters = {
    dateRange: 'all',
    type: 'all',
    category: 'all',
    build: 'all',
    channel: 'all',
    language: 'all',
    tester: 'all',
    status: 'all',
    severity: 'all',
    dynamicSubTypes: [],
    typeBranch: 'all',
    staticSubTypes: [],
};

// Static branch's confirmed sub-types - matches normalizeTypeOfQuestion's
// output for these three. Used both to match a whole-branch Static
// selection (no staticSubTypes chosen) and to validate staticSubTypes.
const STATIC_SUB_TYPES = new Set(['GDB', 'Unique', 'Outreach']);

// typeBranch/dynamicSubTypes/staticSubTypes are multi-value or tree
// selections, not single-select exact-match dimensions, so they have no
// place in a per-field dropdown-options record.
type NonDateFilterKey = Exclude<keyof TestersDashboardFilters, 'dateRange' | 'dynamicSubTypes' | 'typeBranch' | 'staticSubTypes'>;

interface FilterFieldConfig {
    key: NonDateFilterKey;
    csvKey: string;
    normalize?: (value?: string) => string;
    // Most fields treat NA/NIL as missing data, excluded from the dropdown.
    // Overall Test Status is the exception - NA is a real, selectable status
    // there, not missing data.
    keepNA?: boolean;
}

const FILTER_FIELDS: FilterFieldConfig[] = [
    { key: 'type', csvKey: 'Type of Question', normalize: normalizeTypeOfQuestion },
    { key: 'category', csvKey: 'Question Category', normalize: normalizeQuestionCategory },
    { key: 'build', csvKey: 'Build / Version', normalize: normalizeBuildVersion },
    { key: 'channel', csvKey: 'Channel Tested', normalize: normalizeChannel },
    { key: 'language', csvKey: 'Language Tested', normalize: toTitleCase },
    { key: 'tester', csvKey: 'Tester Name', normalize: normalizeTesterName },
    { key: 'status', csvKey: 'Overall Test Status', normalize: normalizeTestStatus, keepNA: true },
    { key: 'severity', csvKey: 'Defect Severity', normalize: normalizeDefectSeverity },
];

// Not used by filtering itself, but re-exported here since
// getPreviousPeriodRows' callers need it for the same rows this returns.
export const RESPONSE_TIME_KEY = 'Response Time (mins) [Auto] (HH:MM:SS)';

// Applies the 9 non-date filter dimensions plus the optional "exclude
// failures" toggle. Split out from date-range filtering because
// getPreviousPeriodRows() below needs to apply these same non-date filters
// to a *different* date window, not the currently-selected one.
export function applyNonDateFilters(
    rows: TestersDashboardRecord[],
    filters: TestersDashboardFilters,
    excludeFailures: boolean,
): TestersDashboardRecord[] {
    let out = rows;
    if (excludeFailures) {
        out = out.filter(
            (r) =>
                !matchesAny(r['Question Saved in DB?'], ['not saved']) &&
                !matchesAny(r['Answer Saved in DB?'], ['not saved']) &&
                !matchesAny(r['Q-ID Consistent Across Systems?'], ['wrongly identified as duplicate']) &&
                normalizeDefectSeverity(r['Defect Severity']) !== 'Critical' &&
                // A row with no identifiable Type of Question can't be
                // attributed to any real module, so it's treated as a failure
                // too. Reuses the exact same classifiers the Dynamic/Static
                // branch filters below use, so this can't drift from how
                // Dynamic/Static are defined elsewhere.
                (dynamicSubBucketFor(r['Question Category'], r['Type of Question']) !== null ||
                    STATIC_SUB_TYPES.has(normalizeTypeOfQuestion(r['Type of Question']))),
        );
    }
    for (const field of FILTER_FIELDS) {
        const value = filters[field.key];
        if (value !== 'all') {
            if (field.normalize) {
                out = out.filter((r) => field.normalize!(r[field.csvKey]) === value);
            } else {
                out = out.filter((r) => r[field.csvKey] === value);
            }
        }
    }
    // OR logic across the selected sub-types, independent of the `type`
    // filter above - a row doesn't need type=Dynamic to match here too.
    if (filters.dynamicSubTypes.length > 0) {
        const allowed = new Set<DynamicSubBucket>(filters.dynamicSubTypes as DynamicSubBucket[]);
        out = out.filter((r) => {
            const sub = dynamicSubBucketFor(r['Question Category'], r['Type of Question']);
            return sub !== null && allowed.has(sub);
        });
    }

    // OR logic across Static's selected sub-types - independent of
    // typeBranch, a row just needs its normalized Type of Question in the
    // selected set.
    if (filters.staticSubTypes.length > 0) {
        const allowed = new Set(filters.staticSubTypes);
        out = out.filter((r) => allowed.has(normalizeTypeOfQuestion(r['Type of Question'])));
    }

    // Whole-branch selection (no sub-type chosen) - the non-empty-array cases
    // are already handled by the two OR blocks above. Uses the SAME
    // classifier the sub-type OR blocks use for each branch, so the
    // whole-branch count is always exactly the sum of its sub-types.
    if (filters.typeBranch === 'Dynamic' && filters.dynamicSubTypes.length === 0) {
        out = out.filter((r) => dynamicSubBucketFor(r['Question Category'], r['Type of Question']) !== null);
    } else if (filters.typeBranch === 'Static' && filters.staticSubTypes.length === 0) {
        out = out.filter((r) => STATIC_SUB_TYPES.has(normalizeTypeOfQuestion(r['Type of Question'])));
    }

    return out;
}

// Applies the Date Range filter on top of already non-date-filtered rows.
// `now` is injectable (defaults to the real current time) purely so
// "today"/"7days"/"30days" are deterministic in tests - production callers
// should omit it.
export function applyDateRangeFilter(
    rows: TestersDashboardRecord[],
    dateRange: TestersDashboardDateRange,
    customStart: string | undefined,
    customEnd: string | undefined,
    now: Date = new Date(),
): TestersDashboardRecord[] {
    // "Custom Range" should behave exactly like "All Dates" until the user
    // actually enters a start or end date - selecting the dropdown alone
    // shouldn't silently drop rows with unparseable dates.
    const isCustomWithNoDatesYet = dateRange === 'custom' && !customStart && !customEnd;
    if (dateRange === 'all' || isCustomWithNoDatesYet) {
        return rows;
    }

    const todayISO = getTodayIST(now);
    // Calendar-date windows (IST), consistent with getTodayIST and Custom
    // Range - not an epoch-timestamp distance, which would shift its
    // boundary with the server's time-of-day and match future-dated rows via
    // Math.abs. addDaysISO's UTC-internal math keeps this timezone-agnostic
    // since we only ever compare calendar-date strings, never a time.
    const last7StartISO = addDaysISO(todayISO, -6);
    const last30StartISO = addDaysISO(todayISO, -29);
    return rows.filter((r) => {
        const iso = parseTestDateToISO(r['Test Date'], now);
        if (!iso) return false;

        if (dateRange === 'today') {
            return iso === todayISO;
        } else if (dateRange === '7days') {
            return iso >= last7StartISO && iso <= todayISO;
        } else if (dateRange === '30days') {
            return iso >= last30StartISO && iso <= todayISO;
        } else if (dateRange === 'custom') {
            if (customStart && iso < customStart) return false;
            if (customEnd && iso > customEnd) return false;
            return true;
        }
        return true;
    });
}

// Convenience wrapper composing both filter stages, matching the
// frontend's `filtered` useMemo.
export function applyFilters(
    allRecords: TestersDashboardRecord[],
    filters: TestersDashboardFilters,
    excludeFailures: boolean,
    customStart: string | undefined,
    customEnd: string | undefined,
    now: Date = new Date(),
): TestersDashboardRecord[] {
    const nonDateFiltered = applyNonDateFilters(allRecords, filters, excludeFailures);
    return applyDateRangeFilter(nonDateFiltered, filters.dateRange, customStart, customEnd, now);
}

// Adds (or subtracts, with a negative value) whole days to a "YYYY-MM-DD"
// string, using UTC internally so local-timezone DST shifts can't cause an
// off-by-one day - the date math is otherwise timezone-agnostic since we
// only ever compare/display the date part, never a time. Used by
// applyDateRangeFilter's 7days/30days windows above and by
// getPreviousPeriodWindow() below.
export function addDaysISO(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

export interface PreviousPeriodWindow {
    prevStart: string;
    prevEnd: string;
}

// Computes the equal-length window immediately preceding the currently
// selected Date Range - e.g. for "Last 7 Days" this is the 7 days before
// that. Returns null when there's no well-defined period to compare
// against (Date Range = "All Dates", or "Custom Range" with only one of
// start/end set - an open-ended range has no defined length to mirror).
export function getPreviousPeriodWindow(
    dateRange: TestersDashboardDateRange,
    customStart: string | undefined,
    customEnd: string | undefined,
    now: Date = new Date(),
): PreviousPeriodWindow | null {
    const isCustomWithNoDatesYet = dateRange === 'custom' && !customStart && !customEnd;
    const isCustomOpenEnded = dateRange === 'custom' && Boolean(customStart) !== Boolean(customEnd);
    if (dateRange === 'all' || isCustomWithNoDatesYet || isCustomOpenEnded) {
        return null;
    }

    const todayISO = getTodayIST(now);
    let prevStart: string;
    let prevEnd: string;

    if (dateRange === 'today') {
        prevStart = prevEnd = addDaysISO(todayISO, -1);
    } else if (dateRange === '7days') {
        const currentStart = addDaysISO(todayISO, -6);
        prevEnd = addDaysISO(currentStart, -1);
        prevStart = addDaysISO(prevEnd, -6);
    } else if (dateRange === '30days') {
        const currentStart = addDaysISO(todayISO, -29);
        prevEnd = addDaysISO(currentStart, -1);
        prevStart = addDaysISO(prevEnd, -29);
    } else {
        // custom, both dates present (guaranteed by isCustomOpenEnded above)
        const lengthDays =
            Math.round((new Date(customEnd!).getTime() - new Date(customStart!).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        prevEnd = addDaysISO(customStart!, -1);
        prevStart = addDaysISO(prevEnd, -(lengthDays - 1));
    }

    return { prevStart, prevEnd };
}

// Returns the rows falling in the previous-period window (same non-date
// filters as the current view, shifted date window) - or null when there's
// no well-defined previous period (see getPreviousPeriodWindow). kpis.ts's
// functions run over whatever rows this returns to produce the "vs previous
// period" metrics.
export function getPreviousPeriodRows(
    allRecords: TestersDashboardRecord[],
    filters: TestersDashboardFilters,
    excludeFailures: boolean,
    customStart: string | undefined,
    customEnd: string | undefined,
    now: Date = new Date(),
): TestersDashboardRecord[] | null {
    const window = getPreviousPeriodWindow(filters.dateRange, customStart, customEnd, now);
    if (!window) return null;

    return applyNonDateFilters(allRecords, filters, excludeFailures).filter((r) => {
        const iso = parseTestDateToISO(r['Test Date'], now);
        return iso !== null && iso >= window.prevStart && iso <= window.prevEnd;
    });
}

// Builds each filter dropdown's available values from the normalized,
// deduplicated data - i.e. what the frontend's filterOptions computes from
// allRecords (unfiltered), not from the currently-filtered rows.
export function buildFilterOptions(allRecords: TestersDashboardRecord[]): Record<NonDateFilterKey, string[]> {
    const options = {} as Record<NonDateFilterKey, string[]>;
    for (const field of FILTER_FIELDS) {
        const rawValues = allRecords.map((r) => (r[field.csvKey] || '').trim());
        const normalized = field.normalize ? rawValues.map(field.normalize) : rawValues;
        let unique = Array.from(new Set(normalized))
            .filter((v) => v !== '' && v !== 'NIL' && (field.keepNA || v !== 'NA'))
            .sort((a, b) => a.localeCompare(b));

        // Type of Question: hardcoded to exactly these 4 real top-level
        // values, in this fixed display order (not alphabetical), always
        // shown regardless of how many currently have rows - Weather/Mandi/
        // Scheme are Dynamic subtypes, not shown at this top level (see
        // dynamicSubBucketFor in diagnostics.ts). Hardcoding rather than
        // filtering `unique` means any leaked garbage value is excluded by
        // construction.
        if (field.key === 'type') {
            unique = ['GDB', 'Unique', 'Outreach', 'Dynamic'];
        }

        // "General" is an invalid/unclassified placeholder value, not a real
        // Question Category - excluded so it can't be selected as a filter
        // option.
        if (field.key === 'category') {
            unique = unique.filter((v) => v !== 'General');
        }

        // Same whitelist principle as Type of Question above: a stray leaked
        // value would otherwise pass through normalizeChannel's title-case
        // fallback unchanged and show up as a bogus option.
        if (field.key === 'channel') {
            const KNOWN_CHANNEL_VALUES = new Set(['Web App', 'WhatsApp', 'Both']);
            unique = unique.filter((v) => KNOWN_CHANNEL_VALUES.has(v));
        }

        options[field.key] = unique;
    }
    return options;
}
