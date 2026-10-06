import { injectable, inject, optional } from 'inversify';
import fs from 'fs';
import { Readable } from 'stream';
import { google } from 'googleapis';
import {
    ITestersDashboardService,
    SheetSourceInfo,
    TestersDashboardDataResponse,
    TestersDashboardRecord,
    TestersDashboardSummaryResponse,
} from '../interfaces/ITestersDashboardService.js';
import { GetTestersDashboardQuery } from '../validators/TestersDashboardValidators.js';
import { EMPTY_FILTERS, applyFilters, buildFilterOptions, type TestersDashboardFilters } from '../testersDashboard/filters.js';
import { calculateKpis, calculatePreviousPeriodStats, calculateChannelStats, calculateLanguageStats } from '../testersDashboard/kpis.js';
import { calculateDiagnostics } from '../testersDashboard/diagnostics.js';
import { calculateChartData } from '../testersDashboard/chartData.js';
import { DASHBOARD_TYPES } from '../types.js';
import type { IZohoTicketStatusService } from '../interfaces/IZohoTicketStatusService.js';

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

interface SheetSourceConfig {
    id: string;
    tab: string;
    label: string;
}

function parseSheetSources(): SheetSourceConfig[] {
    const raw = (process.env.TESTERS_DASHBOARD_SHEETS || '').trim();
    if (!raw) return [];
    let parsed: unknown = tryParseJson(raw);
    if (typeof parsed === 'string') {
        parsed = tryParseJson(parsed);
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is SheetSourceConfig => {
        return (
            typeof s?.id === 'string' && s.id.trim() !== '' &&
            typeof s?.tab === 'string' && s.tab.trim() !== '' &&
            typeof s?.label === 'string' && s.label.trim() !== ''
        );
    });
}

let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getGoogleAuth(): InstanceType<typeof google.auth.GoogleAuth> | null {
    if (cachedAuth) return cachedAuth;
    const raw = (process.env.TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH || '').trim();
    if (!raw) return null;
    const parsed = tryParseJson(raw);
    if (parsed && typeof parsed === 'object') {
        const credentials = parsed as Record<string, any>;
        if (credentials.client_email || credentials.private_key || credentials.type === 'service_account') {
            try {
                cachedAuth = new google.auth.GoogleAuth({
                    credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
                });
                return cachedAuth;
            } catch (err: any) {
                console.error('[TestersDashboard] Failed to initialize GoogleAuth:', err?.message || err);
                return null;
            }
        }
    }
    if (fs.existsSync(raw)) {
        cachedAuth = new google.auth.GoogleAuth({
            keyFile: raw,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        return cachedAuth;
    }
    return null;
}

async function getValidAccessToken(): Promise<string | null> {
    const now = Date.now();
    if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60 * 1000) {
        return cachedAccessToken.token;
    }
    const auth = getGoogleAuth();
    if (!auth) return null;
    try {
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        const token = tokenResponse.token || null;
        if (token) {
            // Google tokens expire in ~1 hour (3600 seconds); refresh after 50 minutes
            cachedAccessToken = { token, expiresAt: now + 50 * 60 * 1000 };
        }
        return token;
    } catch (err: any) {
        console.error('[TestersDashboard] Error obtaining Google access token:', err?.message || err);
        return null;
    }
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
    private cachedDbRecords: TestersDashboardRecord[] | null = null;
    private cachedDbRecordsTimestamp: number = 0;
    private cachedDbLastSyncedAt: string | null = null;
    private readonly DB_CACHE_TTL_MS = 30 * 1000; // 30 seconds

    constructor(
        @optional()
        @inject(DATABASE_TOKEN)
        private readonly db?: DatabaseProvider,
        @optional()
        @inject(DASHBOARD_TYPES.ZohoTicketStatusService)
        private readonly zohoTicketStatusService?: IZohoTicketStatusService,
    ) { }

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

        return {
            success: false,
            totalRecords: 0,
            records: [],
            lastSyncedAt: null,
            error: 'Google Sheet data is streamed and processed client-side to ensure 0 server RAM & heap usage.',
        };
    }

    private buildFiltersFromQuery(query: GetTestersDashboardQuery): TestersDashboardFilters {
        return {
            dateRange: (query.dateRange ?? EMPTY_FILTERS.dateRange) as TestersDashboardFilters['dateRange'],
            type: query.type ?? EMPTY_FILTERS.type,
            category: query.category ?? EMPTY_FILTERS.category,
            build: query.build ?? EMPTY_FILTERS.build,
            channel: query.channel ?? EMPTY_FILTERS.channel,
            language: query.language ?? EMPTY_FILTERS.language,
            tester: query.tester ?? EMPTY_FILTERS.tester,
            status: query.status ?? EMPTY_FILTERS.status,
            severity: query.severity ?? EMPTY_FILTERS.severity,
            dynamicSubTypes: query.dynamicSubTypes
                ? query.dynamicSubTypes
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                : EMPTY_FILTERS.dynamicSubTypes,
            typeBranch: (query.typeBranch ?? EMPTY_FILTERS.typeBranch) as TestersDashboardFilters['typeBranch'],
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

        return {
            success: false,
            needClientData: true,
            message: 'Google Sheet analytics is processed directly in the client browser with 0 server memory.',
            totalRecords: 0,
            kpis: calculateKpis([]),
            diagnostics: calculateDiagnostics([], zohoTickets),
            chartData: calculateChartData([]),
            previousPeriodStats: null,
            filterOptions: buildFilterOptions([]),
            lastSyncedAt: null,
            channelStats: calculateChannelStats([]),
            languageStats: calculateLanguageStats([]),
        };
    }

    async syncFromSheet(): Promise<void> {
        return Promise.resolve();
    }

    getSheetSources(): SheetSourceInfo[] {
        const sources = parseSheetSources();
        return sources.map((s, index) => ({
            index,
            label: s.label,
            tab: s.tab,
        }));
    }

    async streamSheet(index: number, res: any): Promise<void> {
        const sources = parseSheetSources();
        if (index < 0 || index >= sources.length) {
            res.status(400).json({ success: false, error: `Invalid sheet index: ${index}` });
            return;
        }

        const source = sources[index];
        const token = await getValidAccessToken();
        if (!token) {
            res.status(500).json({
                success: false,
                error: 'Could not obtain Google Service Account access token. Verify TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH.',
            });
            return;
        }

        const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(source.id)}/values/${encodeURIComponent(source.tab)}`;

        try {
            const googleRes = await fetch(sheetsUrl, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!googleRes.ok) {
                const errText = await googleRes.text();
                res.status(googleRes.status).json({
                    success: false,
                    error: `Google Sheets API returned ${googleRes.status}: ${errText}`,
                });
                return;
            }

            if (!googleRes.body) {
                res.status(500).json({ success: false, error: 'Google Sheets API returned empty response body.' });
                return;
            }

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');

            await new Promise<void>((resolve, reject) => {
                const readable = Readable.fromWeb(googleRes.body as any);
                readable.pipe(res);
                readable.on('error', (err) => {
                    console.error('[TestersDashboard] Stream read error:', err);
                    if (!res.headersSent) res.status(500).end();
                    reject(err);
                });
                res.on('finish', () => resolve());
                res.on('close', () => resolve());
            });
        } catch (err: any) {
            console.error(`[TestersDashboard] Error streaming sheet ${source.label}:`, err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: err?.message || 'Error streaming sheet data.' });
            }
        }
    }
}
