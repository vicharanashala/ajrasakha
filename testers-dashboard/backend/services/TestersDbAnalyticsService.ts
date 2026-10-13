import { injectable, inject, optional } from 'inversify';
import type {
    DbAnalyticsEntry,
    ITestersDbAnalyticsService,
    TestersDbAnalyticsEntriesResponse,
} from '../interfaces/ITestersDbAnalyticsService.js';
import { DB_ANALYTICS_ENTRY_FIELDS } from '../interfaces/ITestersDbAnalyticsService.js';
import type { IZohoTicketStatusService } from '../interfaces/IZohoTicketStatusService.js';
import type { GetTestersDbAnalyticsQuery } from '../validators/TestersDbAnalyticsValidators.js';
import {
    DB_FILTER_FIELD_CONFIGS,
    buildDbFilterOptionsFromCounts,
    canonicalTypeValue,
    isDynamicTypeValue,
    isStaticTypeValue,
    storedText,
    type DbFilterOptionInputs,
    type DbFilterOptions,
    type DbFilterSelection,
    type DbStoredValueCount,
    type DbTesterIdentity,
    type DbValueCountKey,
} from './dbFilterOptions.js';
import { DASHBOARD_TYPES } from '../types.js';
import { addDays, dbDateWindow, dbPreviousPeriodWindow, type DbDateWindow } from '../dbAnalytics/dates.js';
import { calculateDbSummary } from '../dbAnalytics/summary.js';
import type { DbAnalyticsSummaryResponse } from '../dbAnalytics/types.js';

// Database Logs Analytics data path: stored tester_test_cases entries,
// filtered in MongoDB and used in their raw TesterLogEntry shape - never
// mapped to Google Sheet rows (no mapTesterLogEntryToRecord), and never run
// through the Sheet's normalization or calculations. Filter semantics match
// Step 4's in-memory filters (dbFilterOptions.ts) exactly: the same
// option/legacy value resolution decides which stored values each selection
// matches. Summary figures come from the DB-native calculations in
// ../dbAnalytics/.

const DB_COLLECTION = 'tester_test_cases';
const USERS_COLLECTION = 'users';
const DATABASE_TOKEN = Symbol.for('Database');

interface DatabaseProvider {
    getCollection<T>(name: string): Promise<any>;
}

// Active tester-role users - same query as TesterLogService's Summary
// roster. Best effort: on failure, Tester options fall back to testers with
// entries.
export async function loadActiveTesterRoster(db: DatabaseProvider | undefined): Promise<DbTesterIdentity[]> {
    if (!db) return [];
    try {
        const users = await db.getCollection(USERS_COLLECTION);
        const docs: { _id: unknown; firstName?: string; lastName?: string; email?: string }[] = await users
            .find({ role: 'tester', isBlocked: { $ne: true }, status: { $ne: 'in-active' } })
            .toArray();
        return docs.map((u) => ({
            id: String(u._id),
            name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || String(u._id),
        }));
    } catch (err) {
        console.warn('[TestersDashboard] Could not load the tester roster for DB filter options:', err);
        return [];
    }
}

// ---- Query → filter selection ----

const splitList = (value?: string): string[] =>
    value
        ? value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : [];

export function selectionFromQuery(query: GetTestersDbAnalyticsQuery): DbFilterSelection {
    return {
        dateRange: query.dateRange ?? 'all',
        type: query.type ?? 'all',
        category: query.category ?? 'all',
        build: query.build ?? 'all',
        channel: query.channel ?? 'all',
        language: query.language ?? 'all',
        tester: query.tester ?? 'all',
        status: query.status ?? 'all',
        severity: query.severity ?? 'all',
        dynamicSubTypes: splitList(query.dynamicSubTypes),
        typeBranch: query.typeBranch ?? 'all',
        staticSubTypes: splitList(query.staticSubTypes),
    };
}

// ---- MongoDB filter ----

// Stored values (as returned by the value-count aggregation) per field.
export type DbStoredValues = Partial<Record<DbValueCountKey | 'tester', DbStoredValueCount[]>>;

// The stored values (exact, as stored) that resolve to a selection.
function storedValuesWhere(rows: DbStoredValueCount[] = [], matches: (raw: string | undefined) => boolean): unknown[] {
    return rows.filter((r) => matches(storedText(r.value))).map((r) => r.value);
}

export { dbDateWindow };

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

// An entry's date is its testDate (stored "YYYY-MM-DD"), or - only when
// testDate is missing/not a date - its createdAt calendar date (UTC), as in
// dbEntryDate. String comparison on testDate is chronological for ISO dates.
function dateCondition(window: DbDateWindow): Record<string, any> {
    const nextDay = window.end ? addDays(window.end, 1) : undefined;
    const testDateRange: Record<string, string> = {};
    if (window.start) testDateRange.$gte = window.start;
    if (nextDay) testDateRange.$lt = nextDay;
    const createdRange: Record<string, Date> = {};
    if (window.start) createdRange.$gte = new Date(`${window.start}T00:00:00.000Z`);
    if (nextDay) createdRange.$lt = new Date(`${nextDay}T00:00:00.000Z`);
    return {
        $or: [
            { $and: [{ testDate: { $regex: ISO_DATE_PREFIX } }, { testDate: testDateRange }] },
            { $and: [{ testDate: { $not: ISO_DATE_PREFIX } }, { createdAt: createdRange }] },
        ],
    };
}

// Builds the MongoDB filter for a DB Analytics selection. Each selected
// option becomes `$in` over the stored values that resolve to it (see
// dbFilterOptions.ts - case/spacing/punctuation-insensitive, legacy aliases),
// so results are identical to applyDbNonDateFilters + applyDbDateFilter.
// `dateWindowOverride` replaces the selection's own date window (used for
// the previous period, with the same non-date filters).
export function buildDbAnalyticsMatch(
    selection: DbFilterSelection,
    storedValues: DbStoredValues,
    customStart: string | undefined,
    customEnd: string | undefined,
    now: Date = new Date(),
    dateWindowOverride?: DbDateWindow,
): Record<string, any> {
    const conditions: Record<string, any>[] = [];

    if (selection.type && selection.type !== 'all') {
        conditions.push({ typeOfQuestion: { $in: storedValuesWhere(storedValues.type, (v) => canonicalTypeValue(v) === selection.type) } });
    }
    for (const field of DB_FILTER_FIELD_CONFIGS) {
        const selected = selection[field.key];
        if (selected && selected !== 'all') {
            conditions.push({ [field.source]: { $in: storedValuesWhere(storedValues[field.key], (v) => field.canonical(v) === selected) } });
        }
    }
    // Same composition as the in-memory tree filter: OR within each
    // sub-type list; whole-branch match when a branch has no sub-types.
    if (selection.dynamicSubTypes.length > 0) {
        const allowed = new Set(selection.dynamicSubTypes);
        conditions.push({ typeOfQuestion: { $in: storedValuesWhere(storedValues.type, (v) => allowed.has(canonicalTypeValue(v))) } });
    }
    if (selection.staticSubTypes.length > 0) {
        const allowed = new Set(selection.staticSubTypes);
        conditions.push({ typeOfQuestion: { $in: storedValuesWhere(storedValues.type, (v) => allowed.has(canonicalTypeValue(v))) } });
    }
    if (selection.typeBranch === 'Dynamic' && selection.dynamicSubTypes.length === 0) {
        conditions.push({ typeOfQuestion: { $in: storedValuesWhere(storedValues.type, isDynamicTypeValue) } });
    } else if (selection.typeBranch === 'Static' && selection.staticSubTypes.length === 0) {
        conditions.push({ typeOfQuestion: { $in: storedValuesWhere(storedValues.type, isStaticTypeValue) } });
    }

    const window = dateWindowOverride ?? dbDateWindow(selection.dateRange, customStart, customEnd, now);
    if (window) conditions.push(dateCondition(window));

    return conditions.length > 0 ? { $and: conditions } : {};
}

// One pass over the collection: total, latest update, stored values with
// counts per filter field, and per-tester counts/latest names. Feeds both the
// filter options and buildDbAnalyticsMatch - no documents are loaded.
export function dbValueCountsPipeline(): Record<string, any>[] {
    const groupBy = (field: string) => [{ $group: { _id: `$${field}`, count: { $sum: 1 } } }];
    const facets: Record<string, any[]> = {
        total: [{ $count: 'n' }],
        lastUpdated: [{ $group: { _id: null, at: { $max: { $ifNull: ['$updatedAt', '$createdAt'] } } } }],
        type: groupBy('typeOfQuestion'),
        testerNames: [
            { $match: { testerName: { $regex: /\S/ } } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: '$submittedByUserId', name: { $first: '$testerName' } } },
        ],
    };
    for (const field of DB_FILTER_FIELD_CONFIGS) facets[field.key] = groupBy(field.source);
    return [{ $facet: facets }];
}

const PROJECTION: Record<string, 1> = Object.fromEntries(DB_ANALYTICS_ENTRY_FIELDS.map((f) => [f, 1]));

interface CollectionOverview {
    storedValues: DbStoredValues;
    filterOptions: DbFilterOptions;
    totalRecords: number;
    lastSyncedAt: string | null;
}

@injectable()
export class TestersDbAnalyticsService implements ITestersDbAnalyticsService {
    constructor(
        @optional()
        @inject(DATABASE_TOKEN)
        private readonly db?: DatabaseProvider,
        @optional()
        @inject(DASHBOARD_TYPES.ZohoTicketStatusService)
        private readonly zohoTicketStatusService?: IZohoTicketStatusService,
    ) { }

    // The value-count aggregation, turned into filter options plus the
    // stored values buildDbAnalyticsMatch needs.
    private async loadOverview(collection: any): Promise<CollectionOverview> {
        const [facet] = await collection.aggregate(dbValueCountsPipeline()).toArray();
        const rows = (key: string): DbStoredValueCount[] =>
            (facet?.[key] ?? []).map((r: { _id: unknown; count: number }) => ({ value: r._id, count: r.count }));
        const storedValues: DbStoredValues = { type: rows('type') };
        for (const field of DB_FILTER_FIELD_CONFIGS) storedValues[field.key] = rows(field.key);

        const names = new Map<string, string>(
            (facet?.testerNames ?? []).map((r: { _id: unknown; name: string }) => [String(r._id ?? ''), String(r.name).trim()]),
        );
        const testers = rows('tester')
            .filter((r) => storedText(r.value)?.trim())
            .map((r) => ({ id: String(r.value), name: names.get(String(r.value)) ?? '', count: r.count }));
        const { tester: _tester, ...valueCounts } = storedValues;
        const inputs: DbFilterOptionInputs = { valueCounts, testers };
        const filterOptions = buildDbFilterOptionsFromCounts(inputs, await loadActiveTesterRoster(this.db));

        const totalRecords: number = facet?.total?.[0]?.n ?? 0;
        const latest: Date | null = facet?.lastUpdated?.[0]?.at ?? null;
        return {
            storedValues,
            filterOptions,
            totalRecords,
            lastSyncedAt: latest ? new Date(latest).toISOString() : totalRecords > 0 ? new Date().toISOString() : null,
        };
    }

    private async findEntries(collection: any, match: Record<string, any>): Promise<DbAnalyticsEntry[]> {
        const docs = await collection.find(match, { projection: PROJECTION }).sort({ createdAt: -1 }).toArray();
        return docs.map((d: any) => ({ ...d, _id: String(d._id) }));
    }

    async getEntries(query: GetTestersDbAnalyticsQuery, now: Date = new Date()): Promise<TestersDbAnalyticsEntriesResponse> {
        const empty = buildDbFilterOptionsFromCounts({ valueCounts: {}, testers: [] });
        if (!this.db) {
            return {
                success: false,
                totalRecords: 0,
                matchedRecords: 0,
                entries: [],
                filterOptions: empty,
                lastSyncedAt: null,
                error: 'Database provider is not available.',
            };
        }

        try {
            const collection = await this.db.getCollection(DB_COLLECTION);
            const overview = await this.loadOverview(collection);
            const match = buildDbAnalyticsMatch(selectionFromQuery(query), overview.storedValues, query.customStart, query.customEnd, now);
            const entries = await this.findEntries(collection, match);
            return {
                success: true,
                totalRecords: overview.totalRecords,
                matchedRecords: entries.length,
                entries,
                filterOptions: overview.filterOptions,
                lastSyncedAt: overview.lastSyncedAt,
            };
        } catch (err: any) {
            console.error('[TestersDashboard] Error loading DB analytics entries:', err);
            return {
                success: false,
                totalRecords: 0,
                matchedRecords: 0,
                entries: [],
                filterOptions: empty,
                lastSyncedAt: null,
                error: err?.message || 'Failed to load DB analytics entries.',
            };
        }
    }

    // DB-native summary for Database Logs Analytics. Two MongoDB queries with
    // the same non-date filters: the selected period, and (when the date
    // range has one) the equal-length previous period - each calculated on
    // its own entries. Only the calculated figures are returned.
    async getSummary(query: GetTestersDbAnalyticsQuery, now: Date = new Date()): Promise<DbAnalyticsSummaryResponse> {
        const selection = selectionFromQuery(query);
        const failure = (error: string): DbAnalyticsSummaryResponse => ({
            ...calculateDbSummary({
                current: [],
                previous: null,
                typeBranch: selection.typeBranch,
                totalRecords: 0,
                filterOptions: buildDbFilterOptionsFromCounts({ valueCounts: {}, testers: [] }),
                lastSyncedAt: null,
            }),
            success: false,
            error,
        });
        if (!this.db) return failure('Database provider is not available.');

        try {
            // Zoho tickets are fetched directly from Zoho (no cron), in
            // parallel with the MongoDB queries below.
            const zohoTicketsPromise = this.zohoTicketStatusService
                ? this.zohoTicketStatusService.getTicketStatuses().then((s) => s.statuses)
                : Promise.resolve({});
            const collection = await this.db.getCollection(DB_COLLECTION);
            const overview = await this.loadOverview(collection);
            const current = await this.findEntries(
                collection,
                buildDbAnalyticsMatch(selection, overview.storedValues, query.customStart, query.customEnd, now),
            );
            const previousWindow = dbPreviousPeriodWindow(selection.dateRange, query.customStart, query.customEnd, now);
            const previous = previousWindow
                ? {
                      window: previousWindow,
                      entries: await this.findEntries(
                          collection,
                          buildDbAnalyticsMatch(selection, overview.storedValues, query.customStart, query.customEnd, now, previousWindow),
                      ),
                  }
                : null;

            return calculateDbSummary({
                current,
                previous,
                typeBranch: selection.typeBranch,
                totalRecords: overview.totalRecords,
                filterOptions: overview.filterOptions,
                lastSyncedAt: overview.lastSyncedAt,
                zohoTickets: await zohoTicketsPromise,
            });
        } catch (err: any) {
            console.error('[TestersDashboard] Error calculating DB analytics summary:', err);
            return failure(err?.message || 'Failed to calculate DB analytics summary.');
        }
    }
}
