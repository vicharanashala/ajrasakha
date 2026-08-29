import { injectable } from 'inversify';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import csv from 'csv-parser';
import { google } from 'googleapis';
import {
    ITestersDashboardService,
    TestersDashboardDataResponse,
    TestersDashboardRecord,
    TestersDashboardSummaryResponse,
} from '../interfaces/ITestersDashboardService.js';
import { GetTestersDashboardQuery } from '../validators/TestersDashboardValidators.js';
import { EMPTY_FILTERS, applyFilters, buildFilterOptions, type TestersDashboardFilters } from '../testersDashboard/filters.js';
import { calculateKpis, calculatePreviousPeriodStats } from '../testersDashboard/kpis.js';
import { calculateDiagnostics } from '../testersDashboard/diagnostics.js';
import { calculateChartData } from '../testersDashboard/chartData.js';
import {
    mergeSheetSources,
    type SheetFetchResult,
    type SheetSourceConfig,
} from '../testersDashboard/sheetMerge.js';

// TODO: confirm final location with the team - for now this expects the same
// updated.csv used by outreach_stt/dashboard, copied/synced into this backend.
// Configurable via env so we don't hardcode a path that only exists on one machine.
const CSV_PATH =
    process.env.TESTERS_DASHBOARD_CSV_PATH ||
    path.join(process.cwd(), 'data', 'testers-dashboard', 'updated.csv');

const SERVICE_ACCOUNT_PATH =
    process.env.TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH || '';

// Any number of Test Log sheets to merge, e.g.:
//   [{"id":"...","tab":"Test Log_1","label":"1.0"},
//    {"id":"...","tab":"Test Log","label":"2.0"},
//    {"id":"...","tab":"Test Log","label":"3.0"}]
// Replaces the old TESTERS_DASHBOARD_SHEET_ID/_TAB (+ _2 variants) pair of
// env vars, which hardcoded "exactly 2 sheets" into the config shape itself
// - adding Sheet 3.0 (or any future sheet) is now a config change, not a
// code change. Order matters only in that whichever entry is first to
// produce usable rows becomes the header baseline (see
// sheetMerge.ts's mergeSheetSources) - list the most reliable/established
// sheet first.
function parseSheetSources(): SheetSourceConfig[] {
    const raw = process.env.TESTERS_DASHBOARD_SHEETS || '';
    if (!raw.trim()) return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        console.error('[TestersDashboard] TESTERS_DASHBOARD_SHEETS is not valid JSON - sync will find no sources.', err);
        return [];
    }
    if (!Array.isArray(parsed)) {
        console.error('[TestersDashboard] TESTERS_DASHBOARD_SHEETS must be a JSON array - sync will find no sources.');
        return [];
    }

    return parsed.filter((s): s is SheetSourceConfig => {
        const valid =
            typeof s?.id === 'string' && s.id.trim() !== '' &&
            typeof s?.tab === 'string' && s.tab.trim() !== '' &&
            typeof s?.label === 'string' && s.label.trim() !== '';
        if (!valid) {
            console.error('[TestersDashboard] Skipping malformed entry in TESTERS_DASHBOARD_SHEETS (needs id/tab/label):', s);
        }
        return valid;
    });
}

const SHEET_SOURCES = parseSheetSources();

// Wraps a single CSV field in quotes if it contains a comma, quote, or newline,
// and doubles up any internal quotes - standard CSV escaping.
function escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

@injectable()
export class TestersDashboardService implements ITestersDashboardService {
    private cachedRecords: TestersDashboardRecord[] | null = null;

    private parseCSV(filePath: string): Promise<TestersDashboardRecord[]> {
        return new Promise((resolve, reject) => {
            let fileContent: string;
            try {
                fileContent = fs.readFileSync(filePath, 'utf8');
            } catch (err) {
                return reject(err);
            }

            // Same quirk as the original tool: the real header row starts with
            // "Test ID," further down the file, past some boilerplate rows.
            const headerIndex = fileContent.indexOf('Test ID,');
            if (headerIndex !== -1) {
                fileContent = fileContent.substring(headerIndex);
            }

            const results: TestersDashboardRecord[] = [];
            Readable.from([fileContent])
                .pipe(csv())
                .on('data', (data: TestersDashboardRecord) => {
                    const testId = data['Test ID'] ? data['Test ID'].trim() : '';
                    if (
                        testId &&
                        !testId.startsWith('Project:') &&
                        !testId.startsWith('Test ID')
                    ) {
                        results.push(data);
                    }
                })
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    }

    async getData(): Promise<TestersDashboardDataResponse> {
        if (!fs.existsSync(CSV_PATH)) {
            return { success: false, totalRecords: 0, records: [], lastSyncedAt: null };
        }

        const records = await this.parseCSV(CSV_PATH);
        this.cachedRecords = records;

        // The file's last-modified time is exactly when the 30-min cron job
        // (syncFromSheet) last overwrote it with fresh data from the Google
        // Sheet - this is genuinely "when did we last sync," not just "when did
        // the browser last ask for data."
        const stats = fs.statSync(CSV_PATH);

        return {
            success: true,
            totalRecords: records.length,
            records,
            lastSyncedAt: stats.mtime.toISOString(),
        };
    }

    // Serves cachedRecords when already populated instead of re-parsing the
    // whole CSV on every filter change - getData() (used by the raw /data
    // route) still always re-reads from disk, since that route's existing
    // contract is "give me the freshest possible data." The cache is
    // invalidated in syncFromSheet() below, so a stale cache can only ever
    // be at most as stale as the last sync.
    private async getRecordsForSummary(): Promise<TestersDashboardRecord[]> {
        if (this.cachedRecords) {
            return this.cachedRecords;
        }
        if (!fs.existsSync(CSV_PATH)) {
            return [];
        }
        const records = await this.parseCSV(CSV_PATH);
        this.cachedRecords = records;
        return records;
    }

    private buildFiltersFromQuery(query: GetTestersDashboardQuery): TestersDashboardFilters {
        return {
            // query.dateRange is typed as plain `string` (see
            // TestersDashboardValidators.ts's comment on why), but
            // @IsIn(['all', 'today', '7days', '30days', 'custom']) has
            // already guaranteed it's one of those exact values by the time
            // this runs, so the cast is safe.
            dateRange: (query.dateRange ?? EMPTY_FILTERS.dateRange) as TestersDashboardFilters['dateRange'],
            type: query.type ?? EMPTY_FILTERS.type,
            category: query.category ?? EMPTY_FILTERS.category,
            build: query.build ?? EMPTY_FILTERS.build,
            channel: query.channel ?? EMPTY_FILTERS.channel,
            language: query.language ?? EMPTY_FILTERS.language,
            tester: query.tester ?? EMPTY_FILTERS.tester,
            status: query.status ?? EMPTY_FILTERS.status,
            severity: query.severity ?? EMPTY_FILTERS.severity,
            // Wire format is a comma-separated string (see
            // TestersDashboardValidators.ts's comment on dynamicSubTypes);
            // parsed into the string[] TestersDashboardFilters expects here,
            // once, so every downstream consumer (applyFilters,
            // getPreviousPeriodRows via calculatePreviousPeriodStats) just
            // sees a plain array like every other filter dimension.
            dynamicSubTypes: query.dynamicSubTypes
                ? query.dynamicSubTypes
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                : EMPTY_FILTERS.dynamicSubTypes,
            // @IsIn(['all', 'Dynamic', 'Static']) on GetTestersDashboardQuery
            // has already guaranteed this is one of those exact values by the
            // time this runs (same cast rationale as dateRange above).
            typeBranch: (query.typeBranch ?? EMPTY_FILTERS.typeBranch) as TestersDashboardFilters['typeBranch'],
            // Same comma-separated wire format as dynamicSubTypes above.
            staticSubTypes: query.staticSubTypes
                ? query.staticSubTypes
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                : EMPTY_FILTERS.staticSubTypes,
        };
    }

    async getSummary(query: GetTestersDashboardQuery): Promise<TestersDashboardSummaryResponse> {
        const allRecords = await this.getRecordsForSummary();
        if (!fs.existsSync(CSV_PATH)) {
            return {
                success: false,
                totalRecords: 0,
                kpis: calculateKpis([]),
                diagnostics: calculateDiagnostics([]),
                chartData: calculateChartData([]),
                previousPeriodStats: null,
                filterOptions: buildFilterOptions([]),
                lastSyncedAt: null,
            };
        }

        const filters = this.buildFiltersFromQuery(query);
        // excludeFailures arrives as the string "true"/"false" (see
        // TestersDashboardValidators.ts's @IsBooleanString() comment) since
        // query params are always strings and this app doesn't enable
        // implicit type conversion.
        const excludeFailures = query.excludeFailures === 'true';

        const filteredRows = applyFilters(allRecords, filters, excludeFailures, query.customStart, query.customEnd);
        const kpis = calculateKpis(filteredRows);
        // Same filtered rows kpis just used - Biggest Bottleneck/Weakest
        // Modules/Open Critical Defects all apply to whatever the user is
        // currently looking at, not the unfiltered dataset.
        const diagnostics = calculateDiagnostics(filteredRows);
        // Same filtered rows again - the trend chart plots the currently
        // filtered view's daily scores, not the unfiltered dataset's.
        const chartData = calculateChartData(filteredRows);
        // Deliberately over the UNFILTERED records, same non-date filters -
        // getPreviousPeriodRows applies filters.type/category/etc itself,
        // just against the shifted date window instead of the current one.
        const previousPeriodStats = calculatePreviousPeriodStats(
            allRecords,
            filters,
            excludeFailures,
            query.customStart,
            query.customEnd,
        );
        // Built from the unfiltered records - dropdown options shouldn't
        // shrink based on the user's own filter selections (e.g. picking a
        // Tester Name shouldn't remove other Build/Version options that
        // tester never touched).
        const filterOptions = buildFilterOptions(allRecords);

        const stats = fs.statSync(CSV_PATH);

        return {
            success: true,
            totalRecords: allRecords.length,
            kpis,
            diagnostics,
            chartData,
            previousPeriodStats,
            filterOptions,
            lastSyncedAt: stats.mtime.toISOString(),
        };
    }

    // Fetches one sheet's raw rows via the Sheets API. Returns null (not
    // throws) on missing config or an empty result, so the caller can
    // gracefully skip that source without failing the whole sync.
    private async fetchSheetRows(
        auth: InstanceType<typeof google.auth.GoogleAuth>,
        sheetId: string,
        sheetTab: string,
        label: string,
    ): Promise<string[][] | null> {
        if (!sheetId) return null;

        const sheets = google.sheets({ version: 'v4', auth });
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: sheetTab,
        });

        const rows = response.data.values || [];
        if (rows.length === 0) {
            console.warn(`[TestersDashboard] ${label} returned no rows, skipping.`);
            return null;
        }
        return rows as string[][];
    }

    async syncFromSheet(): Promise<void> {
        if (SHEET_SOURCES.length === 0 || !SERVICE_ACCOUNT_PATH) {
            console.warn(
                '[TestersDashboard] Sheet sync skipped - TESTERS_DASHBOARD_SHEETS or ' +
                'TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH not configured.',
            );
            return;
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: SERVICE_ACCOUNT_PATH,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        // Fetch every configured sheet independently - one sheet's fetch
        // failing (network/auth/API error) must not be fatal to the whole
        // sync, so each gets its own try/catch rather than one wrapping the
        // whole loop. This generalizes what used to be an asymmetric
        // contract (Sheet 1.0's fetch was NOT wrapped in try/catch at all
        // and its failure aborted the entire sync; only Sheet 2.0's fetch
        // was "optional") - every sheet, including whichever one ends up
        // first in the array, is now treated as independently skippable.
        const fetchResults: SheetFetchResult[] = [];
        for (const source of SHEET_SOURCES) {
            try {
                const rawRows = await this.fetchSheetRows(auth, source.id, source.tab, source.label);
                fetchResults.push({ label: source.label, rawRows });
            } catch (err) {
                console.error(
                    `[TestersDashboard] Error fetching ${source.label} - skipping this sheet, others still merge:`,
                    err,
                );
                fetchResults.push({ label: source.label, rawRows: null });
            }
        }

        const { header, rows, merged, skipped } = mergeSheetSources(fetchResults);

        for (const s of skipped) {
            console.error(`[TestersDashboard] ${s.label}: ${s.reason} - skipped, other sheets still merged.`);
        }

        if (!header || merged.length === 0) {
            console.warn(
                '[TestersDashboard] No configured sheet returned usable, header-matching rows - ' +
                'skipping overwrite entirely rather than writing empty/malformed data.',
            );
            return;
        }

        const combinedRows: string[][] = [header, ...rows];
        const csvLines = combinedRows.map((row) =>
            row.map((cell) => escapeCsvField(String(cell ?? ''))).join(','),
        );
        const csvContent = csvLines.join('\n');

        const dir = path.dirname(CSV_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CSV_PATH, csvContent, 'utf8');

        // The just-written CSV is newer than whatever getRecordsForSummary()
        // may have cached - invalidate so the next /summary request re-reads
        // from disk instead of serving stale pre-sync data.
        this.cachedRecords = null;

        const summary = merged.map((m) => `${m.count} rows from ${m.label}`).join(' + ');
        console.log(
            `[TestersDashboard] Synced ${summary} into updated.csv ` +
            `(${merged.length}/${SHEET_SOURCES.length} sheets merged successfully)`,
        );
    }
}
