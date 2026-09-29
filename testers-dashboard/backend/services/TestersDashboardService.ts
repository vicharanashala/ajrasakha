import { injectable, inject, optional } from 'inversify';
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
import { isFutureTestDate } from '../testersDashboard/normalize.js';
import { calculateKpis, calculatePreviousPeriodStats, calculateChannelStats, calculateLanguageStats } from '../testersDashboard/kpis.js';
import { calculateDiagnostics } from '../testersDashboard/diagnostics.js';
import { calculateChartData } from '../testersDashboard/chartData.js';
import {
    mergeSheetSources,
    type SheetFetchResult,
    type SheetSourceConfig,
} from '../testersDashboard/sheetMerge.js';
import { DASHBOARD_TYPES } from '../types.js';
import type { IZohoTicketStatusService } from '../interfaces/IZohoTicketStatusService.js';
import { streamAggregateSummary } from '../testersDashboard/streamAggregator.js';

// Configurable via env so this doesn't hardcode a path that only exists on one machine.
const CSV_PATH =
    process.env.TESTERS_DASHBOARD_CSV_PATH ||
    path.join(process.cwd(), 'data', 'testers-dashboard', 'updated.csv');

const SERVICE_ACCOUNT_PATH =
    process.env.TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH || '';

function cleanJsonString(raw: string): string {
    let str = raw.trim();
    if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
        str = str.slice(1, -1).trim();
    }
    return str;
}

function tryParseJson(raw: string): any {
    const cleaned = cleanJsonString(raw);
    try {
        return JSON.parse(cleaned);
    } catch {
        try {
            const decoded = Buffer.from(cleaned, 'base64').toString('utf8').trim();
            if (decoded.startsWith('{') || decoded.startsWith('[')) {
                return JSON.parse(cleanJsonString(decoded));
            }
        } catch {
            // Not valid base64
        }
        return null;
    }
}

function getGoogleAuth(): InstanceType<typeof google.auth.GoogleAuth> | null {
    const raw = (process.env.TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH || '').trim();
    if (!raw) {
        console.warn('[TestersDashboard] TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH is not configured.');
        return null;
    }

    const parsed = tryParseJson(raw);
    if (parsed && typeof parsed === 'object') {
        const credentials = parsed as Record<string, any>;
        if (credentials.client_email || credentials.private_key || credentials.type === 'service_account') {
            try {
                return new google.auth.GoogleAuth({
                    credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
                });
            } catch (err: any) {
                console.error('[TestersDashboard] Failed to initialize GoogleAuth from credentials:', err?.message || err);
                return null;
            }
        }
    }

    if (fs.existsSync(raw)) {
        return new google.auth.GoogleAuth({
            keyFile: raw,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
    }

    console.error(
        `[TestersDashboard] TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH is neither valid credentials JSON/Base64 nor an existing file on disk. Length: ${raw.length}, Preview: ${raw.substring(0, 30)}...`,
    );
    return null;
}

function parseSheetSources(): SheetSourceConfig[] {
    const raw = (process.env.TESTERS_DASHBOARD_SHEETS || '').trim();
    if (!raw) {
        console.warn('[TestersDashboard] TESTERS_DASHBOARD_SHEETS is not configured.');
        return [];
    }

    let parsed: unknown = tryParseJson(raw);
    if (typeof parsed === 'string') {
        parsed = tryParseJson(parsed);
    }

    if (!Array.isArray(parsed)) {
        console.error(
            `[TestersDashboard] TESTERS_DASHBOARD_SHEETS could not be parsed as a JSON array. Length: ${raw.length}, Preview: ${raw.substring(0, 40)}...`,
        );
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

// Standard CSV field escaping. Exported for reuse by TesterLogService's own CSV export.
export function escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

const DB_COLLECTION = 'tester_test_cases';
const DATABASE_TOKEN = Symbol.for('Database');

interface DatabaseProvider {
    getCollection<T>(name: string): Promise<any>;
}

export function mapTesterLogEntryToRecord(entry: any): TestersDashboardRecord {
    return {
        'Test ID': entry._id ? String(entry._id) : '',
        'Test Date': entry.testDate || (entry.createdAt ? new Date(entry.createdAt).toISOString().slice(0, 10) : ''),
        'Tester Name': entry.testerName || '',
        'Type of Question': entry.typeOfQuestion || '',
        'Build / Version': entry.buildVersion || '',
        'Sprint / Cycle': entry.sprintCycle || '',
        'Channel Tested': entry.channelTested || '',
        'Language Tested': entry.languageTested || '',
        'Question ID': entry.threadId || entry.webThreadId || entry.waThreadId || '',
        'Query Text (Original)': entry.queryText || '',
        'Question Category': entry.questionCategory || '',
        'Time Question Asked (HH:MM:SS)': entry.timeQuestionAsked || entry.waTimeQuestionAsked || '',
        'Time Answer Received (HH:MM:SS)': entry.timeAnswerReceived || entry.waTimeAnswerReceived || '',
        'Response Time (mins) [Auto] (HH:MM:SS)': entry.responseTimeMins || entry.waResponseTimeMins || '',
        'SLA Status': entry.slaStatus || entry.waSlaStatus || '',
        'Question in Review Model?': entry.questionInReviewModel || '',
        'Question Correctly Framed?': entry.questionCorrectlyFramed || '',
        'Original Language': entry.originalLanguage || '',
        'Translated Language': entry.translatedLanguage || '',
        'Translation Quality': entry.translationQuality || '',
        'Translation Error Type': entry.translationErrorType || '',
        'Tagging': entry.tagging || '',
        'Allocated to Reviewer?': entry.allocatedToReviewer || '',
        "Author's Name": entry.authorsName || '',
        'Author Assignment Time': entry.authorAssignmentTime || '',
        'Author Completion Time': entry.authorCompletionTime || '',
        'Author TAT (mins) [Auto]': entry.authorTatMins || '',
        'Reviewer1 Name': entry.reviewer1Name || '',
        'Reviewer1 Assignment Time': entry.reviewer1AssignmentTime || '',
        'Reviewer1 Completion Time': entry.reviewer1CompletionTime || '',
        'Review1 TAT (mins) [Auto]': entry.review1TatMins || '',
        'Reviewer2 Name': entry.reviewer2Name || '',
        'Reviewer2 Assignment Time': entry.reviewer2AssignmentTime || '',
        'Reviewer2 Completion Time': entry.reviewer2CompletionTime || '',
        'Review2 TAT (mins) [Auto]': entry.review2TatMins || '',
        'Reviewer3 Name': entry.reviewer3Name || '',
        'Reviewer3 Assignment Time': entry.reviewer3AssignmentTime || '',
        'Reviewer3 Completion Time': entry.reviewer3CompletionTime || '',
        'Review3 TAT (mins) [Auto]': entry.review3TatMins || '',
        'Reviewer4 Name': entry.reviewer4Name || '',
        'Reviewer4 Assignment Time': entry.reviewer4AssignmentTime || '',
        'Reviewer4 Completion Time': entry.reviewer4CompletionTime || '',
        'Review4 TAT (mins) [Auto]': entry.review4TatMins || '',
        'Reviewer5 Name': entry.reviewer5Name || '',
        'Reviewer5 Assignment Time': entry.reviewer5AssignmentTime || '',
        'Reviewer5 Completion Time': entry.reviewer5CompletionTime || '',
        'Review5 TAT (mins) [Auto]': entry.review5TatMins || '',
        "Moderator's Name": entry.moderatorName || '',
        'Moderator Assignment Time': entry.moderatorAssignmentTime || '',
        'ModeratorCompletion Time': entry.moderatorCompletionTime || '',
        'Moderator TAT (mins) [Auto]': entry.moderatorTatMins || '',
        'Follow-up Q in Review Model?': entry.followUpQInReviewModel || '',
        'Answer Scientifically Correct?': entry.answerScientificallyCorrect || '',
        'Expert Name Displayed?': entry.expertNameDisplayed || '',
        'Correct Expert Name displayed?': entry.correctExpertNameDisplayed || '',
        'Correct Source Links Provided?': entry.correctSourceLinksProvided || '',
        '120-min Msg Shown to User?': entry.msg120MinShownToUser || '',
        'Notification Received?': entry.notificationReceived || '',
        'Notification on Same Thread?': entry.notificationOnSameThread || '',
        'Notification Linked Correct Q-ID?': entry.notificationLinkedCorrectQId || '',
        'Voice Input Working?': entry.voiceInputWorking || '',
        'Voice Output Working?': entry.voiceOutputWorking || '',
        'Voice Input Quality': entry.voiceInputQuality || '',
        'Voice Output Quality': entry.voiceOutputQuality || '',
        'Voice Issue Description': entry.voiceIssueDescription || '',
        'Weather Q Answered Correctly?': entry.weatherQAnsweredCorrectly || '',
        'Mandi Price Q Correct?': entry.mandiPriceQCorrect || '',
        'Scheme Q Correct?': entry.schemeQCorrect || '',
        'Question Saved in DB?': entry.questionSavedInDb || '',
        'Answer Saved in DB?': entry.answerSavedInDb || '',
        'Q-ID Consistent Across Systems?': entry.qIdConsistentAcrossSystems || '',
        'WhatsApp vs Web Answer Match?': entry.whatsappVsWebAnswerMatch || '',
        'Overall Test Status': entry.overallTestStatus || '',
        'Defect Severity': entry.defectSeverity || '',
        "Defect ID / Bug Ref\nZoho Desk Ticketing": entry.defectIdBugRef || '',
        'Reviewer Remarks': entry.reviewerRemarks || '',
        'Tester Remarks': entry.testerRemarks || '',
        'Status': entry.status || '',
    };
}

@injectable()
export class TestersDashboardService implements ITestersDashboardService {
    private cachedRecords: TestersDashboardRecord[] | null = null;
    private cachedDbRecords: TestersDashboardRecord[] | null = null;
    private cachedDbRecordsTimestamp: number = 0;
    private cachedDbLastSyncedAt: string | null = null;
    private lastSyncError: string | null = null;
    private readonly DB_CACHE_TTL_MS = 30 * 1000; // 30 seconds
    private summaryCache: Map<string, { mtimeMs: number; response: TestersDashboardSummaryResponse }> = new Map();

    constructor(
        @optional()
        @inject(DATABASE_TOKEN)
        private readonly db?: DatabaseProvider,
        // Optional so every existing `new TestersDashboardService()`/
        // `new TestersDashboardService(db)` call (tests included) keeps
        // working unchanged - when absent, the ticket card's Zoho-sourced
        // openTickets/allTickets just come back empty (see getSummary
        // below) rather than throwing.
        // Optional for backward compatibility with existing call sites; when absent, the
        // ticket card's Zoho-sourced openTickets/allTickets just come back empty (see
        // getSummary below) rather than throwing.
        @optional()
        @inject(DASHBOARD_TYPES.ZohoTicketStatusService)
        private readonly zohoTicketStatusService?: IZohoTicketStatusService,
    ) { }

    private parseCSV(filePath: string): Promise<TestersDashboardRecord[]> {
        return new Promise((resolve, reject) => {
            let fileContent: string;
            try {
                fileContent = fs.readFileSync(filePath, 'utf8');
            } catch (err) {
                return reject(err);
            }

            // The real header row starts with "Test ID," further down the
            // file, past some boilerplate rows.
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
                        !testId.startsWith('Test ID') &&
                        // Future-dated rows (Test Date after today, IST) are dropped before any
                        // filter/calculation sees them - these are data-entry mistakes, not real
                        // results. Unparseable dates are kept (isFutureTestDate only returns true
                        // for a row that parses AND is in the future).
                        !isFutureTestDate(data['Test Date'])
                    ) {
                        results.push(data);
                    }
                })
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    }

    private async getDbRecords(): Promise<{ records: TestersDashboardRecord[]; lastSyncedAt: string | null }> {
        const now = Date.now();
        if (this.cachedDbRecords && now - this.cachedDbRecordsTimestamp < this.DB_CACHE_TTL_MS) {
            return {
                records: this.cachedDbRecords,
                lastSyncedAt: this.cachedDbLastSyncedAt,
            };
        }

        if (!this.db) {
            console.warn('[TestersDashboard] Database provider is not available for db source.');
            return { records: [], lastSyncedAt: null };
        }

        try {
            const collection = await this.db.getCollection(DB_COLLECTION);
            const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
            const records: TestersDashboardRecord[] = docs.map(mapTesterLogEntryToRecord);

            let latestDate: Date | null = null;
            for (const doc of docs) {
                const d = doc.updatedAt || doc.createdAt;
                if (d) {
                    const dt = new Date(d);
                    if (!latestDate || dt > latestDate) latestDate = dt;
                }
            }
            const lastSyncedAt = latestDate ? latestDate.toISOString() : (records.length > 0 ? new Date().toISOString() : null);

            this.cachedDbRecords = records;
            this.cachedDbRecordsTimestamp = now;
            this.cachedDbLastSyncedAt = lastSyncedAt;

            return { records, lastSyncedAt };
        } catch (err) {
            console.error('[TestersDashboard] Error fetching tester_test_cases from database:', err);
            return { records: [], lastSyncedAt: null };
        }
    }

    async getData(source: 'sheet' | 'db' = 'sheet'): Promise<TestersDashboardDataResponse> {
        if (source === 'db') {
            const { records, lastSyncedAt } = await this.getDbRecords();
            return {
                success: true,
                totalRecords: records.length,
                records,
                lastSyncedAt,
            };
        }

        if (!fs.existsSync(CSV_PATH)) {
            const sources = parseSheetSources();
            const auth = getGoogleAuth();
            if (sources.length > 0 && auth) {
                console.log('[TestersDashboard] CSV missing on request - attempting initial sheet sync...');
                await this.syncFromSheet();
            }
        }

        if (!fs.existsSync(CSV_PATH)) {
            return {
                success: false,
                totalRecords: 0,
                records: [],
                lastSyncedAt: null,
                error: this.lastSyncError || 'CSV source file not found on disk and Google Sheet sync failed or is not configured.',
            };
        }

        const records = await this.parseCSV(CSV_PATH);
        this.cachedRecords = records;

        // File's last-modified time is when the sync cron (syncFromSheet) last overwrote it -
        // genuinely "when did we last sync," not just "when did the browser last ask."
        const stats = fs.statSync(CSV_PATH);

        return {
            success: true,
            totalRecords: records.length,
            records,
            lastSyncedAt: stats.mtime.toISOString(),
        };
    }

    // Serves cachedRecords when populated instead of re-parsing the whole CSV on every
    // filter change. getData() (the raw /data route) always re-reads from disk since that
    // route's contract is "freshest possible data." Cache is invalidated in syncFromSheet().
    private async getRecordsForSummary(): Promise<TestersDashboardRecord[]> {
        if (this.cachedRecords) {
            return this.cachedRecords;
        }
        if (!fs.existsSync(CSV_PATH)) {
            const sources = parseSheetSources();
            const auth = getGoogleAuth();
            if (sources.length > 0 && auth) {
                console.log('[TestersDashboard] CSV missing for summary - attempting initial sheet sync...');
                await this.syncFromSheet();
            }
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
            // query.dateRange is typed as plain `string` (see TestersDashboardValidators.ts),
            // but @IsIn(...) already guarantees it's one of the valid values, so the cast is safe.
            dateRange: (query.dateRange ?? EMPTY_FILTERS.dateRange) as TestersDashboardFilters['dateRange'],
            type: query.type ?? EMPTY_FILTERS.type,
            category: query.category ?? EMPTY_FILTERS.category,
            build: query.build ?? EMPTY_FILTERS.build,
            channel: query.channel ?? EMPTY_FILTERS.channel,
            language: query.language ?? EMPTY_FILTERS.language,
            tester: query.tester ?? EMPTY_FILTERS.tester,
            status: query.status ?? EMPTY_FILTERS.status,
            severity: query.severity ?? EMPTY_FILTERS.severity,
            // Wire format is a comma-separated string (see TestersDashboardValidators.ts),
            // parsed into a string[] here once so every downstream consumer sees a plain array.
            dynamicSubTypes: query.dynamicSubTypes
                ? query.dynamicSubTypes
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                : EMPTY_FILTERS.dynamicSubTypes,
            // Same cast rationale as dateRange above.
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
        const isDb = query.source === 'db';

        // Ticket card's Critical Defect Tickets / All Tickets lists come from this cache
        // (see calculateDiagnostics's zohoTickets param) - independent of source/filters.
        const zohoTickets = this.zohoTicketStatusService?.getCachedStatuses() ?? {};

        if (isDb) {
            const dbData = await this.getDbRecords();
            const allRecords = dbData.records;
            const lastSyncedAt = dbData.lastSyncedAt;
            const filters = this.buildFiltersFromQuery(query);
            const excludeFailures = query.excludeFailures === 'true';

            const filteredRows = applyFilters(allRecords, filters, excludeFailures, query.customStart, query.customEnd);
            const kpis = calculateKpis(filteredRows, filters.typeBranch);
            const diagnostics = calculateDiagnostics(filteredRows, zohoTickets);
            const chartData = calculateChartData(filteredRows, undefined, filters.typeBranch);
            const channelStats = calculateChannelStats(filteredRows);
            const languageStats = calculateLanguageStats(filteredRows);
            const previousPeriodStats = calculatePreviousPeriodStats(
                allRecords,
                filters,
                excludeFailures,
                query.customStart,
                query.customEnd,
            );
            const filterOptions = buildFilterOptions(allRecords);

            return {
                success: true,
                totalRecords: allRecords.length,
                kpis,
                diagnostics,
                chartData,
                previousPeriodStats,
                filterOptions,
                lastSyncedAt,
                channelStats,
                languageStats,
            };
        }

        if (!fs.existsSync(CSV_PATH)) {
            const sources = parseSheetSources();
            const auth = getGoogleAuth();
            if (sources.length > 0 && auth) {
                console.log('[TestersDashboard] CSV missing for summary - attempting initial sheet sync...');
                await this.syncFromSheet();
            }
        }

        if (!fs.existsSync(CSV_PATH)) {
            return {
                success: false,
                totalRecords: 0,
                kpis: calculateKpis([]),
                diagnostics: calculateDiagnostics([], zohoTickets),
                chartData: calculateChartData([]),
                previousPeriodStats: null,
                filterOptions: buildFilterOptions([]),
                lastSyncedAt: null,
                channelStats: calculateChannelStats([]),
                languageStats: calculateLanguageStats([]),
                error: this.lastSyncError || 'CSV source file not found on disk and Google Sheet sync failed or is not configured.',
            };
        }

        const stats = fs.statSync(CSV_PATH);
        const cacheKey = JSON.stringify({
            ...query,
            zohoKeys: Object.keys(zohoTickets).length,
        });
        const cached = this.summaryCache.get(cacheKey);
        if (cached && cached.mtimeMs === stats.mtimeMs) {
            return cached.response;
        }

        const filters = this.buildFiltersFromQuery(query);
        const excludeFailures = query.excludeFailures === 'true';

        const response = await streamAggregateSummary(
            CSV_PATH,
            filters,
            excludeFailures,
            query.customStart,
            query.customEnd,
            zohoTickets,
        );

        this.summaryCache.set(cacheKey, { mtimeMs: stats.mtimeMs, response });
        if (this.summaryCache.size > 50) {
            const firstKey = this.summaryCache.keys().next().value;
            if (firstKey) this.summaryCache.delete(firstKey);
        }

        return response;
    }

    // Fetches one sheet's raw rows via the Sheets API. Returns null (not throws) on missing
    // config or an empty result, so the caller can skip that source without failing the sync.
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

    private activeSyncPromise: Promise<void> | null = null;

    async syncFromSheet(): Promise<void> {
        if (this.activeSyncPromise) {
            return this.activeSyncPromise;
        }
        this.activeSyncPromise = this.performSyncFromSheet().finally(() => {
            this.activeSyncPromise = null;
        });
        return this.activeSyncPromise;
    }

    private async performSyncFromSheet(): Promise<void> {
        const auth = getGoogleAuth();
        const sources = parseSheetSources();
        if (sources.length === 0 || !auth) {
            const msg = `[TestersDashboard] Sheet sync skipped - TESTERS_DASHBOARD_SHEETS (sources found: ${sources.length}) or TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH (valid credentials: ${Boolean(auth)}) not configured or invalid.`;
            console.warn(msg);
            this.lastSyncError = msg;
            return;
        }

        console.log(`[TestersDashboard] Starting Google Sheet sync for ${sources.length} sources...`);
        const fetchResults: SheetFetchResult[] = [];
        const errorsOccurred: string[] = [];

        for (const source of sources) {
            try {
                const rawRows = await this.fetchSheetRows(auth, source.id, source.tab, source.label);
                fetchResults.push({ label: source.label, rawRows });
                console.log(`[TestersDashboard] Successfully fetched ${rawRows?.length || 0} rows from ${source.label}`);
            } catch (err: any) {
                const errDetail = err?.message || String(err);
                console.error(
                    `[TestersDashboard] Error fetching ${source.label} (${source.id} / ${source.tab}):`,
                    errDetail,
                );
                errorsOccurred.push(`${source.label}: ${errDetail}`);
                fetchResults.push({ label: source.label, rawRows: null });
            }
        }

        const { header, rows, merged, skipped } = mergeSheetSources(fetchResults);

        for (const s of skipped) {
            console.error(`[TestersDashboard] ${s.label}: ${s.reason} - skipped, other sheets still merged.`);
        }

        if (!header || merged.length === 0) {
            const warnMsg = `[TestersDashboard] No configured sheet returned usable, header-matching rows. ` +
                (errorsOccurred.length > 0 ? `Errors: ${errorsOccurred.join('; ')}` : '');
            console.warn(warnMsg);
            this.lastSyncError = warnMsg;
            return;
        }

        const dir = path.dirname(CSV_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const writeStream = fs.createWriteStream(CSV_PATH, { encoding: 'utf8' });
        writeStream.write(header.map(escapeCsvField).join(',') + '\n');
        for (let i = 0; i < rows.length; i++) {
            writeStream.write(rows[i].map((cell) => escapeCsvField(String(cell ?? ''))).join(',') + '\n');
        }
        await new Promise<void>((resolve, reject) => {
            writeStream.end();
            writeStream.on('finish', () => resolve());
            writeStream.on('error', reject);
        });

        // Invalidate the cache so the next /summary request re-reads from disk instead of
        // serving stale pre-sync data.
        this.cachedRecords = null;
        this.summaryCache.clear();
        this.lastSyncError = null;

        const summary = merged.map((m) => `${m.count} rows from ${m.label}`).join(' + ');
        console.log(
            `[TestersDashboard] Synced ${summary} into updated.csv ` +
            `(${merged.length}/${sources.length} sheets merged successfully)`,
        );
    }
}
