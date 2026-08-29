// Filtering logic for the Testers Dashboard CSV - date-range filtering, the
// 9 filter dimensions, the "vs previous period" date-window calculation,
// and filter-dropdown option building.
//
// Ported near-verbatim from frontend/src/features/testersDashboard/TestersDashboard.tsx
// (Phase 2 of moving KPI/diagnostics/chart calculation server-side - see
// normalize.ts for Phase 1's normalizers, which these compose).
//
// Deliberately scoped to filtering/window-math only, not KPI aggregation:
// the frontend's previousPeriodStats also computes pass rate, scientific
// accuracy, voice success etc. over the previous-period rows - that's
// KPI-calculation logic (Phase 3, alongside calculateTrustScore /
// calculateExperienceScore), not filtering, so it's intentionally left out
// here. getPreviousPeriodRows() below returns the previous-period ROWS;
// Phase 3's KPI functions will run over whatever rows this returns.
//
// NOTE for Phase 3: two KPI-level fixes have landed directly in the
// frontend since Phase 1 (not yet ported anywhere) - countNotifFailure
// recognizing "no"/"NO" as a notification failure, and E_exp recognizing
// "displayed" (not just "yes"/"y") as a correct Expert Name match. When
// calculateTrustScore/criticalFailuresToday are ported, port the CURRENT
// (fixed) frontend versions, not the older versions from before those
// fixes.

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

// Whole-branch selection for the frontend's Dynamic/Static tree control
// (TestersDashboard.tsx) that replaced the old single "Type of Question"
// dropdown. Named `typeBranch`, NOT `category` - `category` on this same
// interface already means the unrelated "Question Category" filter
// dimension, so reusing that name here would collide with it.
export type TypeBranch = 'all' | 'Dynamic' | 'Static';

// Mirrors EMPTY_FILTERS - dateRange plus the 9 filter dimensions' current
// selections, plus dynamicSubTypes. Every non-dateRange, non-dynamicSubTypes
// field is a normalized filter value (as produced by that field's
// normalizer) or "all" for no filter.
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
    // Multi-select OR filter on Dynamic's sub-components (Weather/Mandi
    // Prices/Government Schemes - see dynamicSubBucketFor in
    // diagnostics.ts), independent of the `type` filter above - a user can
    // filter directly on sub-components without also setting type=Dynamic.
    // Empty array = no filter (match all rows). Deliberately NOT one of the
    // 9 NonDateFilterKey dimensions below: those are all single-select,
    // exact-match-after-normalize fields driven by FILTER_FIELDS: this is a
    // bespoke multi-value OR filter with no single raw column to normalize
    // against.
    dynamicSubTypes: string[];
    // Dynamic/Static tree filter (see TypeBranch above) - 'Dynamic' or
    // 'Static' selects that whole branch; 'all' means the tree isn't
    // engaged at all. Deliberately independent of the legacy `type` field
    // (kept above for API back-compat) rather than replacing it.
    //
    // "Static Dynamic" is deliberately left out of both branches below -
    // not forced into either one. Hemanth has now confirmed it should be
    // removed entirely ("You can remove static dynamic category"), so this
    // is final, not a placeholder pending his answer - matches
    // moduleGroupFor in diagnostics.ts and the Type of Question dropdown
    // whitelist above no longer including it either. "UX Feedback" remains
    // genuinely unresolved (TODO) - still pending clarification on where,
    // if anywhere, it should fit.
    typeBranch: TypeBranch;
    // Multi-select OR filter on Static's sub-types - GDB/Unique/Outreach
    // (matching normalizeTypeOfQuestion's output) - structurally identical
    // to dynamicSubTypes above (same OR-across-array semantics, same
    // independent-of-typeBranch matching pattern below), just for Static's
    // 3 sub-types instead of Dynamic's. Empty array = no narrowing; when
    // typeBranch === 'Static' with an empty array, matches the whole
    // branch (all 3 combined) - see applyNonDateFilters below.
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

// Static branch's confirmed sub-types (GDB/Unique/Outreach) - matches
// normalizeTypeOfQuestion's output for these three. Used both to match a
// whole-branch Static selection (no staticSubTypes chosen) and to validate
// the staticSubTypes array's contents.
const STATIC_SUB_TYPES = new Set(['GDB', 'Unique', 'Outreach']);

// typeBranch is also excluded here (alongside dynamicSubTypes/
// staticSubTypes) - none of these 3 are single-select, exact-match-after-
// normalize dimensions driven by FILTER_FIELDS below, so they have no
// place in a per-field dropdown-options record.
type NonDateFilterKey = Exclude<keyof TestersDashboardFilters, 'dateRange' | 'dynamicSubTypes' | 'typeBranch' | 'staticSubTypes'>;

interface FilterFieldConfig {
    key: NonDateFilterKey;
    csvKey: string;
    normalize?: (value?: string) => string;
    // Most fields treat NA/NIL as "missing data", not a real thing to
    // filter by, so it's excluded from the dropdown by default. Overall
    // Test Status is the exception - NA is a consistent, real status
    // option there, not random corruption, so it stays selectable.
    // (Build/Version used to be a similar exception, but normalizeBuildVersion
    // now folds every real value - NA included - into the single canonical
    // "1.0", so there's no distinct "NA" output left for this flag to keep.)
    keepNA?: boolean;
}

// Order matches the frontend's Executive Summary layout: Type of Question,
// Question Category, Build/Version, then the remaining filters. Sprint/Cycle
// omitted per the frontend's design - the source data never had real
// sprint identifiers anyway.
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

// Matches the corrected header (was "Respo nse Time (mins) [Auto]" with a
// stray space typo - fixed in the live sheet, see the 10-Aug
// header-alignment work with Test Log 2.0). Not used by filtering itself,
// but re-exported here since getPreviousPeriodRows' callers (Phase 3) will
// need it for the same rows this returns.
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
                normalizeDefectSeverity(r['Defect Severity']) !== 'Critical',
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
    // OR logic across the selected sub-types (e.g. Weather+Mandi selected
    // means rows matching either) - independent of the `type` filter above,
    // so a row doesn't need type=Dynamic to match here too. A row with no
    // resolvable sub-bucket (dynamicSubBucketFor returns null) never
    // matches a non-empty selection.
    if (filters.dynamicSubTypes.length > 0) {
        const allowed = new Set<DynamicSubBucket>(filters.dynamicSubTypes as DynamicSubBucket[]);
        out = out.filter((r) => {
            const sub = dynamicSubBucketFor(r['Question Category'], r['Type of Question']);
            return sub !== null && allowed.has(sub);
        });
    }

    // OR logic across Static's selected sub-types - structurally identical
    // to the dynamicSubTypes block above (independent of typeBranch, a row
    // just needs its normalized Type of Question in the selected set).
    if (filters.staticSubTypes.length > 0) {
        const allowed = new Set(filters.staticSubTypes);
        out = out.filter((r) => allowed.has(normalizeTypeOfQuestion(r['Type of Question'])));
    }

    // Dynamic/Static tree filter (TypeBranch) - the frontend restructure of
    // the old single "Type of Question" dropdown into a two-branch tree.
    // Only handles the "whole branch, no sub-type chosen" case here:
    //   - typeBranch='Dynamic'/'Static' with dynamicSubTypes/staticSubTypes
    //     already narrows rows via the two OR blocks above, so there's
    //     nothing left to do for those cases - handled before this runs.
    //   - typeBranch='Dynamic' with dynamicSubTypes EMPTY means "match all
    //     of Dynamic" - reuses the exact same exact-match logic as the
    //     legacy `type` FILTER_FIELDS dimension above (normalizeTypeOfQuestion
    //     === 'Dynamic'), NOT diagnostics.ts's moduleGroupFor "contains
    //     dynamic" fuzzy match - that's a separate, already-correct system
    //     for the Weakest Modules card and is intentionally left untouched.
    //   - typeBranch='Static' with staticSubTypes EMPTY means "match all of
    //     GDB+Unique+Outreach combined".
    // Static Dynamic and UX Feedback rows never match either branch - see
    // the comment on typeBranch above (Static Dynamic: confirmed excluded
    // for good; UX Feedback: still pending).
    if (filters.typeBranch === 'Dynamic' && filters.dynamicSubTypes.length === 0) {
        out = out.filter((r) => normalizeTypeOfQuestion(r['Type of Question']) === 'Dynamic');
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
    return rows.filter((r) => {
        const iso = parseTestDateToISO(r['Test Date']);
        if (!iso) return false;
        const rDate = new Date(iso);

        if (dateRange === 'today') {
            return iso === todayISO;
        } else if (dateRange === '7days') {
            const diffDays = Math.ceil(Math.abs(now.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays <= 7;
        } else if (dateRange === '30days') {
            const diffDays = Math.ceil(Math.abs(now.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays <= 30;
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
// only ever compare/display the date part, never a time. Sole consumer is
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
// no well-defined previous period (see getPreviousPeriodWindow). This is
// the filtering half of the frontend's previousPeriodStats; Phase 3's KPI
// functions will run over whatever rows this returns to produce the actual
// "vs previous period" metrics.
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
        const iso = parseTestDateToISO(r['Test Date']);
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

        // Type of Question: exactly these 4 confirmed real top-level
        // values, in this fixed display order (not alphabetical). "Static
        // Dynamic" was briefly its own 5th top-level bucket per an earlier
        // confirmation from Hemanth, but he later explicitly reversed that
        // ("You can remove static dynamic category") - it's excluded here
        // now, same as diagnostics.ts's moduleGroupFor no longer bucketing
        // it. The underlying rows aren't deleted or reassigned anywhere -
        // they just no longer appear as a selectable Type of Question
        // filter option. Weather/Mandi/Scheme also stay excluded from this
        // top-level list (they're Dynamic subtypes, only visible via
        // Weakest Modules' Dynamic sub-breakdown - see dynamicSubBucketFor
        // in diagnostics.ts). All 4 are always shown regardless of how many
        // currently have rows in a given data snapshot - same "confirmed
        // real category, possibly just empty right now" treatment
        // "Outreach" originally got. Hardcoding the list (rather than
        // filtering `unique` down to a whitelist) also means any leaked
        // garbage value - e.g. the "Ithagani Shireesha" / "Lavanya
        // Mathialagan" column-shift leaks - is excluded by construction,
        // not by filtering it out after the fact.
        if (field.key === 'type') {
            unique = ['GDB', 'Unique', 'Outreach', 'Dynamic'];
        }

        // "General" is an invalid/unclassified placeholder value, not a real
        // Question Category - excluded so it can't be selected as a filter
        // option, same treatment as the other category cleanups this
        // session (word-order swaps, spelling merges).
        if (field.key === 'category') {
            unique = unique.filter((v) => v !== 'General');
        }

        // Same whitelist principle as Type of Question above: Channel
        // Tested has exactly 3 confirmed real values. normalizeChannel's
        // title-case fallback passes anything unrecognized straight
        // through unchanged, so a stray value ("English" - 2 real rows,
        // not an actual channel) shows up as a bogus selectable option.
        // Whitelisting means the next garbage value - not just "English"
        // specifically - is excluded automatically too.
        if (field.key === 'channel') {
            const KNOWN_CHANNEL_VALUES = new Set(['Web App', 'WhatsApp', 'Both']);
            unique = unique.filter((v) => KNOWN_CHANNEL_VALUES.has(v));
        }

        options[field.key] = unique;
    }
    return options;
}
