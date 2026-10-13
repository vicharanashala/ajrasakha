// DB-native filter options, counts, and filter matching for Database Logs
// Analytics. Works directly on stored tester_test_cases entries
// (TesterLogEntry) - never on the Google Sheet-shaped rows, and never through
// the Sheet's normalization (testersDashboard/normalize.ts typo maps, leaked
// ID/name lists, the 2026 date cap, the blank-Type fallback, or the Sheet's
// Static Dynamic exclusion).
//
// Option lists mirror the Tester UI form (frontend/src/testerLog/types.ts) -
// tests/dbFilterOptions.test.ts fails if the two drift apart.
//
// Legacy values (stored before the form's options changed) are matched to the
// current option only for counting/filtering here - stored values are never
// rewritten. Values that match no current option still appear as their own
// option (legacy: true), so no stored record silently becomes unfilterable.

import type { TesterLogEntry } from '../interfaces/ITesterLogService.js';
import { addDays, getTodayISTDate } from '../dbAnalytics/dates.js';

// ---- Tester UI option lists (mirror frontend/src/testerLog/types.ts) ----

// TYPE_OF_QUESTION_OPTIONS, split into the dashboard's Dynamic/Static tree.
// "Static Dynamic" is placed under Dynamic, matching the Tester UI's own
// isDynamicQuestionType() - see the report for this business decision.
export const DB_DYNAMIC_TYPE_OPTIONS = ['Weather Dynamic', 'Scheme Dynamic', 'Mandi Dynamic', 'Static Dynamic'];
export const DB_STATIC_TYPE_OPTIONS = ['Unique', 'GDB', 'Outreach'];

export const DB_QUESTION_CATEGORY_OPTIONS = [
    'Soil Health and Nutrient Management',
    'Irrigation and Water Management',
    'Insect-Pest Management',
    'Disease Management',
    'Seed and Variety Selection',
    'Cultural and Crop Management Practices',
    'Organic and Natural Farming',
    'Weed Management',
    'Climate, Weather & Stress Management',
    'Farm Tools & Mechanisation',
    'Post-Harvest Management & Storage',
    'Market Prices, MSP & Marketing',
    'Agricultural Schemes & Subsidies',
    'Credit, Loan & Insurance',
    'Capacity Building, Extension and Communication',
    'Rural Infrastructure',
    'Animal Husbandry & Livestock',
    'Fisheries & Aquaculture',
    'Allied Agricultural Activities',
];

export const DB_CHANNEL_OPTIONS = ['WhatsApp', 'WebApp', 'Both'];

// INDIAN_LANGUAGES_OPTIONS minus "Others" - the form replaces "Others" with
// the free-text language the tester types, so "Others" is never stored.
export const DB_LANGUAGE_OPTIONS = [
    'English', 'Assamese', 'Bengali', 'Bodo', 'Dogri', 'Gujarati', 'Hindi', 'Kannada', 'Kashmiri',
    'Konkani', 'Maithili', 'Malayalam', 'Manipuri', 'Marathi', 'Nepali', 'Odia', 'Punjabi', 'Sanskrit',
    'Santali', 'Sindhi', 'Tamil', 'Telugu', 'Urdu',
];

export const DB_OVERALL_STATUS_OPTIONS = ['Pass', 'Fail'];

export const DB_DEFECT_SEVERITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low', 'NA'];

// ---- Value matching ----

// Case-, spacing- and punctuation-insensitive key, with "&" read as "and" -
// matches e.g. "WEATHER DYNAMIC", "Web App", and the old category spelling
// "Climate, Weather and Stress Management" to their current form options.
export function optionKey(value?: string): string {
    return (value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

// Legacy values whose key differs from their current option's key.
const LEGACY_ALIASES: Record<string, Record<string, string>> = {
    severity: { nil: 'NA' },
};

// The bare legacy "Dynamic" type (no sub-type) - part of the Dynamic branch,
// but not any single Dynamic sub-type option.
const LEGACY_BARE_DYNAMIC_KEY = 'dynamic';

// Resolves a stored value to its current form option (if any), else its
// trimmed stored text. '' for blank values.
export function canonicalValue(field: string, raw: string | undefined, options: string[]): string {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    const key = optionKey(trimmed);
    const alias = LEGACY_ALIASES[field]?.[key];
    if (alias) return alias;
    return options.find((o) => optionKey(o) === key) ?? trimmed;
}

const ALL_TYPE_OPTIONS = [...DB_STATIC_TYPE_OPTIONS, ...DB_DYNAMIC_TYPE_OPTIONS];

// ---- Stored-value classification ----
// Shared by the in-memory path below and the MongoDB query builder in
// TestersDbAnalyticsService, so both resolve stored values identically.

export function canonicalTypeValue(raw: string | undefined): string {
    return canonicalValue('type', raw, ALL_TYPE_OPTIONS);
}

export function isDynamicTypeValue(raw: string | undefined): boolean {
    const type = canonicalTypeValue(raw);
    return DB_DYNAMIC_TYPE_OPTIONS.includes(type) || optionKey(type) === LEGACY_BARE_DYNAMIC_KEY;
}

export function isStaticTypeValue(raw: string | undefined): boolean {
    return DB_STATIC_TYPE_OPTIONS.includes(canonicalTypeValue(raw));
}

function canonicalType(entry: Partial<TesterLogEntry>): string {
    return canonicalTypeValue(entry.typeOfQuestion);
}

function isDynamicEntry(entry: Partial<TesterLogEntry>): boolean {
    return isDynamicTypeValue(entry.typeOfQuestion);
}

function isStaticEntry(entry: Partial<TesterLogEntry>): boolean {
    return isStaticTypeValue(entry.typeOfQuestion);
}

// Single-select dropdown dimensions: the stored field each one reads and how
// a stored value resolves to its option. `tester` is matched on
// submittedByUserId (the stored tester identity), and `build` has no form
// option list (free text), so its options are the stored values themselves.
export interface DbFilterFieldConfig {
    key: 'category' | 'build' | 'channel' | 'language' | 'tester' | 'status' | 'severity';
    source:
        | 'questionCategory'
        | 'buildVersion'
        | 'channelTested'
        | 'languageTested'
        | 'submittedByUserId'
        | 'overallTestStatus'
        | 'defectSeverity';
    options: string[];
    canonical: (raw: string | undefined) => string;
}

export const DB_FILTER_FIELD_CONFIGS: DbFilterFieldConfig[] = [
    { key: 'category', source: 'questionCategory', options: DB_QUESTION_CATEGORY_OPTIONS, canonical: (v) => canonicalValue('category', v, DB_QUESTION_CATEGORY_OPTIONS) },
    { key: 'build', source: 'buildVersion', options: [], canonical: (v) => canonicalValue('build', v, []) },
    { key: 'channel', source: 'channelTested', options: DB_CHANNEL_OPTIONS, canonical: (v) => canonicalValue('channel', v, DB_CHANNEL_OPTIONS) },
    { key: 'language', source: 'languageTested', options: DB_LANGUAGE_OPTIONS, canonical: (v) => canonicalValue('language', v, DB_LANGUAGE_OPTIONS) },
    { key: 'tester', source: 'submittedByUserId', options: [], canonical: (v) => (v || '').trim() },
    { key: 'status', source: 'overallTestStatus', options: DB_OVERALL_STATUS_OPTIONS, canonical: (v) => canonicalValue('status', v, DB_OVERALL_STATUS_OPTIONS) },
    { key: 'severity', source: 'defectSeverity', options: DB_DEFECT_SEVERITY_OPTIONS, canonical: (v) => canonicalValue('severity', v, DB_DEFECT_SEVERITY_OPTIONS) },
];

// Stored values aren't guaranteed to be strings - anything else is read as
// its string form, and null/undefined as blank.
export function storedText(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value : String(value);
}

function fieldValue(field: DbFilterFieldConfig, entry: Partial<TesterLogEntry>): string {
    return field.canonical(storedText(entry[field.source]));
}

export type DbFilterFieldKey = DbFilterFieldConfig['key'];

// ---- Filter options with counts ----

export interface DbFilterOption {
    value: string;
    label: string;
    count: number;
    // A stored value that matches no current Tester UI option.
    legacy?: boolean;
}

export interface DbFilterOptions {
    fields: Record<DbFilterFieldKey, DbFilterOption[]>;
    typeTree: {
        dynamic: DbFilterOption[];
        static: DbFilterOption[];
        // Whole-branch counts. dynamicTotal also includes legacy bare
        // "Dynamic" entries, which belong to no single sub-type option.
        dynamicTotal: number;
        staticTotal: number;
    };
}

export interface DbTesterIdentity {
    id: string;
    name: string;
}

// What the options are built from: each stored value with its record count,
// plus per-tester counts. Produced in memory by buildDbFilterOptions, or by
// a MongoDB aggregation in TestersDbAnalyticsService - one builder for both.
export interface DbStoredValueCount {
    value: unknown;
    count: number;
}

export interface DbTesterStat {
    id: string;
    // The tester's most recently stored non-blank testerName ('' if none).
    name: string;
    count: number;
}

export type DbValueCountKey = Exclude<DbFilterFieldKey, 'tester'> | 'type';

export interface DbFilterOptionInputs {
    // Stored values per dropdown field (by DbFilterFieldKey), plus 'type'
    // for typeOfQuestion.
    valueCounts: Partial<Record<DbValueCountKey, DbStoredValueCount[]>>;
    testers: DbTesterStat[];
}

function canonicalCounts(rows: DbStoredValueCount[] = [], canonical: (raw: string | undefined) => string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const { value, count } of rows) {
        const v = canonical(storedText(value));
        if (v) counts.set(v, (counts.get(v) ?? 0) + count);
    }
    return counts;
}

// Every current form option (count 0 when unused), then any non-matching
// stored values (legacy), in a stable order.
function optionsWithCounts(options: string[], counts: Map<string, number>): DbFilterOption[] {
    const known: DbFilterOption[] = options.map((o) => ({ value: o, label: o, count: counts.get(o) ?? 0 }));
    const extra: DbFilterOption[] = [...counts.entries()]
        .filter(([v]) => !options.includes(v))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([v, count]) => ({ value: v, label: v, count, legacy: true }));
    return [...known, ...extra];
}

// Tester options: every tester identity (submittedByUserId) with entries,
// plus the active tester roster so a tester with no entries still appears
// with count 0. Labeled with the roster name, else the tester's most
// recently stored testerName - the stored name is never cleaned up/mapped.
function testerOptions(testers: DbTesterStat[], roster: DbTesterIdentity[]): DbFilterOption[] {
    const byId = new Map<string, DbTesterStat>();
    for (const t of testers) {
        const id = t.id.trim();
        if (id) byId.set(id, { ...t, id });
    }
    const ids = new Set<string>([...roster.map((t) => t.id), ...byId.keys()]);
    return [...ids]
        .map((id) => ({
            value: id,
            label: roster.find((t) => t.id === id)?.name || byId.get(id)?.name || id,
            count: byId.get(id)?.count ?? 0,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildDbFilterOptionsFromCounts(inputs: DbFilterOptionInputs, roster: DbTesterIdentity[] = []): DbFilterOptions {
    const fields = {} as Record<DbFilterFieldKey, DbFilterOption[]>;
    for (const field of DB_FILTER_FIELD_CONFIGS) {
        if (field.key === 'tester') {
            fields.tester = testerOptions(inputs.testers, roster);
            continue;
        }
        const counts = canonicalCounts(inputs.valueCounts[field.key], field.canonical);
        fields[field.key] =
            field.key === 'build'
                ? optionsWithCounts([], counts).map(({ legacy: _legacy, ...o }) => o)
                : optionsWithCounts(field.options, counts);
    }

    const typeRows = inputs.valueCounts.type ?? [];
    const typeCounts = canonicalCounts(typeRows, canonicalTypeValue);
    const subTypeOptions = (options: string[]): DbFilterOption[] =>
        options.map((o) => ({ value: o, label: o, count: typeCounts.get(o) ?? 0 }));
    const branchTotal = (inBranch: (raw: string | undefined) => boolean) =>
        typeRows.reduce((sum, { value, count }) => sum + (inBranch(storedText(value)) ? count : 0), 0);

    return {
        fields,
        typeTree: {
            dynamic: subTypeOptions(DB_DYNAMIC_TYPE_OPTIONS),
            static: subTypeOptions(DB_STATIC_TYPE_OPTIONS),
            dynamicTotal: branchTotal(isDynamicTypeValue),
            staticTotal: branchTotal(isStaticTypeValue),
        },
    };
}

// Built from ALL stored entries (not the currently-filtered subset), the same
// scope the dropdowns have always used.
export function buildDbFilterOptions(entries: Partial<TesterLogEntry>[], roster: DbTesterIdentity[] = []): DbFilterOptions {
    const rawCounts = (read: (e: Partial<TesterLogEntry>) => unknown): DbStoredValueCount[] => {
        const counts = new Map<unknown, number>();
        for (const e of entries) {
            const v = read(e);
            counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        return [...counts.entries()].map(([value, count]) => ({ value, count }));
    };

    const valueCounts: DbFilterOptionInputs['valueCounts'] = { type: rawCounts((e) => e.typeOfQuestion) };
    for (const field of DB_FILTER_FIELD_CONFIGS) {
        if (field.key !== 'tester') valueCounts[field.key] = rawCounts((e) => e[field.source]);
    }

    const testers = new Map<string, DbTesterStat & { at: number }>();
    for (const e of entries) {
        const id = (e.submittedByUserId || '').trim();
        if (!id) continue;
        const at = e.createdAt ? new Date(e.createdAt).getTime() : 0;
        const name = (e.testerName || '').trim();
        const existing = testers.get(id);
        if (!existing) {
            testers.set(id, { id, name, count: 1, at: name ? at : -Infinity });
        } else {
            existing.count++;
            if (name && at > existing.at) {
                existing.name = name;
                existing.at = at;
            }
        }
    }

    return buildDbFilterOptionsFromCounts(
        { valueCounts, testers: [...testers.values()].map(({ at: _at, ...t }) => t) },
        roster,
    );
}

// The flat value list per dimension, for the response's legacy
// `filterOptions` field.
export function dbFilterOptionValues(options: DbFilterOptions): Record<string, string[]> {
    const values: Record<string, string[]> = {
        type: [...DB_STATIC_TYPE_OPTIONS, ...DB_DYNAMIC_TYPE_OPTIONS],
    };
    for (const [key, list] of Object.entries(options.fields)) values[key] = list.map((o) => o.value);
    return values;
}

// ---- Filtering ----

export interface DbFilterSelection {
    dateRange: string;
    type: string;
    category: string;
    build: string;
    channel: string;
    language: string;
    tester: string;
    status: string;
    severity: string;
    dynamicSubTypes: string[];
    typeBranch: string;
    staticSubTypes: string[];
}

// Every filter except the date range - split out so the "vs previous
// period" window can reuse the same non-date selection.
export function applyDbNonDateFilters<T extends Partial<TesterLogEntry>>(entries: T[], f: DbFilterSelection): T[] {
    let out = entries;
    if (f.type && f.type !== 'all') out = out.filter((e) => canonicalType(e) === f.type);
    for (const field of DB_FILTER_FIELD_CONFIGS) {
        const selected = f[field.key];
        if (selected && selected !== 'all') out = out.filter((e) => fieldValue(field, e) === selected);
    }
    // Same composition as the Sheet's tree filter: OR within each sub-type
    // list, whole-branch match when a branch is selected with no sub-types.
    if (f.dynamicSubTypes.length > 0) {
        const allowed = new Set(f.dynamicSubTypes);
        out = out.filter((e) => allowed.has(canonicalType(e)));
    }
    if (f.staticSubTypes.length > 0) {
        const allowed = new Set(f.staticSubTypes);
        out = out.filter((e) => allowed.has(canonicalType(e)));
    }
    if (f.typeBranch === 'Dynamic' && f.dynamicSubTypes.length === 0) {
        out = out.filter(isDynamicEntry);
    } else if (f.typeBranch === 'Static' && f.staticSubTypes.length === 0) {
        out = out.filter(isStaticEntry);
    }
    return out;
}

// The entry's test date as "YYYY-MM-DD": the stored testDate (set by the
// server in IST on submission), falling back to createdAt for entries
// without one - the same fallback mapTesterLogEntryToRecord uses. No Sheet
// date parsing, no year cap.
export function dbEntryDate(entry: Partial<TesterLogEntry>): string | null {
    const testDate = (entry.testDate || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(testDate)) return testDate;
    if (entry.createdAt) {
        const created = new Date(entry.createdAt);
        if (!isNaN(created.getTime())) return created.toISOString().slice(0, 10);
    }
    return null;
}

// Same windows as the Sheet's Date Range filter (IST calendar days):
// today, last 7/30 days ending today, or an inclusive custom range. "Custom"
// with neither date set behaves like "All Dates".
export function applyDbDateFilter<T extends Partial<TesterLogEntry>>(
    entries: T[],
    dateRange: string,
    customStart: string | undefined,
    customEnd: string | undefined,
    now: Date = new Date(),
): T[] {
    if (dateRange === 'all' || !dateRange || (dateRange === 'custom' && !customStart && !customEnd)) return entries;
    const today = getTodayISTDate(now);
    const windowStart =
        dateRange === 'today' ? today : dateRange === '7days' ? addDays(today, -6) : dateRange === '30days' ? addDays(today, -29) : null;
    return entries.filter((e) => {
        const date = dbEntryDate(e);
        if (!date) return false;
        if (dateRange === 'custom') {
            if (customStart && date < customStart) return false;
            if (customEnd && date > customEnd) return false;
            return true;
        }
        return windowStart !== null && date >= windowStart && date <= today;
    });
}
