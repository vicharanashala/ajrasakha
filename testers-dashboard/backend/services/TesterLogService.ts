import { injectable, inject } from 'inversify';
import * as XLSX from 'xlsx';
import {
    ITesterLogService,
    TesterLogEntry,
    PaginatedTesterLogEntries,
    CreateTesterLogEntryResponse,
    TesterOption,
    TesterLogSummary,
    TesterLogExportResult,
    QuestionTypeKey,
    TesterQuestionTypeSummaryResult,
    TesterQuestionTypeRow,
    QuestionTypeCountRow,
    TesterLogSummaryResponse,
} from '../interfaces/ITesterLogService.js';
import { getTodayIST, normalizeChannel, pct } from '../testersDashboard/normalize.js';

const COLLECTION = 'tester_test_cases';
// Same 'users' collection the main app's UserRepository reads (this module
// shares the app's single Database binding) - used only to list active
// testers for the Summary tab (getActiveTesters), not for anything
// auth-related.
const USERS_COLLECTION = 'users';
const DATABASE_TOKEN = Symbol.for('Database');

interface DatabaseProvider {
    getCollection<T>(name: string): Promise<any>;
}

// Minimal shape read off the 'users' collection for getActiveTesters -
// deliberately not the app's full IUser, just the fields needed to list and
// label active testers.
interface TesterUserRecord {
    _id: unknown;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
    isBlocked?: boolean;
    status?: string;
}

// Every column of the Google Sheet's "Agri Advisory QA Test Log", in the
// Sheet's own exact order with the Sheet's own exact header text (including
// its quirks - "ModeratorCompletion Time" with no space, and "Correct Expert
// Name displayed?" with lowercase "displayed" - both preserved verbatim
// since the whole point of this export is to be a drop-in match for the
// Sheet layout). Re-derive/verify against
// backend/data/testers-dashboard/updated.csv's header row if the Sheet ever
// adds/renames a column.
//
// submittedByUserId, submittedByEmail, createdAt, updatedAt have no Sheet
// equivalent and are deliberately left out of this export (app-internal
// bookkeeping, not part of the Sheet's own log format).
const EXPORT_COLUMNS: { key: keyof TesterLogEntry; header: string }[] = [
    { key: '_id', header: 'Test ID' },
    { key: 'testDate', header: 'Test Date' },
    { key: 'testId', header: 'Test ID (TL-005)' },
    { key: 'testerName', header: 'Tester Name' },
    { key: 'typeOfQuestion', header: 'Type of Question' },
    { key: 'buildVersion', header: 'Build / Version' },
    { key: 'sprintCycle', header: 'Sprint / Cycle' },
    { key: 'channelTested', header: 'Channel Tested' },
    { key: 'languageTested', header: 'Language Tested' },
    { key: 'threadId', header: 'Question ID' },
    { key: 'queryText', header: 'Query Text (Original)' },
    { key: 'questionCategory', header: 'Question Category' },
    { key: 'timeQuestionAsked', header: 'Time Question Asked (HH:MM:SS)' },
    { key: 'timeAnswerReceived', header: 'Time Answer Received (HH:MM:SS)' },
    { key: 'responseTimeMins', header: 'Response Time (mins) [Auto] (HH:MM:SS)' },
    { key: 'slaStatus', header: 'SLA Status' },
    { key: 'questionInReviewModel', header: 'Question in Review Model?' },
    { key: 'questionCorrectlyFramed', header: 'Question Correctly Framed?' },
    { key: 'originalLanguage', header: 'Original Language' },
    { key: 'translatedLanguage', header: 'Translated Language' },
    { key: 'translationQuality', header: 'Translation Quality' },
    { key: 'translationErrorType', header: 'Translation Error Type' },
    { key: 'tagging', header: 'Tagging' },
    { key: 'allocatedToReviewer', header: 'Allocated to Reviewer?' },
    { key: 'authorsName', header: "Author's Name" },
    { key: 'authorAssignmentTime', header: 'Author Assignment Time' },
    { key: 'authorCompletionTime', header: 'Author Completion Time' },
    { key: 'authorTatMins', header: 'Author TAT (mins) [Auto]' },
    { key: 'reviewer1Name', header: 'Reviewer1 Name' },
    { key: 'reviewer1AssignmentTime', header: 'Reviewer1 Assignment Time' },
    { key: 'reviewer1CompletionTime', header: 'Reviewer1 Completion Time' },
    { key: 'review1TatMins', header: 'Review1 TAT (mins) [Auto]' },
    { key: 'reviewer2Name', header: 'Reviewer2 Name' },
    { key: 'reviewer2AssignmentTime', header: 'Reviewer2 Assignment Time' },
    { key: 'reviewer2CompletionTime', header: 'Reviewer2 Completion Time' },
    { key: 'review2TatMins', header: 'Review2 TAT (mins) [Auto]' },
    { key: 'reviewer3Name', header: 'Reviewer3 Name' },
    { key: 'reviewer3AssignmentTime', header: 'Reviewer3 Assignment Time' },
    { key: 'reviewer3CompletionTime', header: 'Reviewer3 Completion Time' },
    { key: 'review3TatMins', header: 'Review3 TAT (mins) [Auto]' },
    { key: 'reviewer4Name', header: 'Reviewer4 Name' },
    { key: 'reviewer4AssignmentTime', header: 'Reviewer4 Assignment Time' },
    { key: 'reviewer4CompletionTime', header: 'Reviewer4 Completion Time' },
    { key: 'review4TatMins', header: 'Review4 TAT (mins) [Auto]' },
    { key: 'reviewer5Name', header: 'Reviewer5 Name' },
    { key: 'reviewer5AssignmentTime', header: 'Reviewer5 Assignment Time' },
    { key: 'reviewer5CompletionTime', header: 'Reviewer5 Completion Time' },
    { key: 'review5TatMins', header: 'Review5 TAT (mins) [Auto]' },
    { key: 'moderatorName', header: "Moderator's Name" },
    { key: 'moderatorAssignmentTime', header: 'Moderator Assignment Time' },
    // Sheet quirk, preserved verbatim - no space between "Moderator" and
    // "Completion", unlike every other "Moderator ..." header here.
    { key: 'moderatorCompletionTime', header: 'ModeratorCompletion Time' },
    { key: 'moderatorTatMins', header: 'Moderator TAT (mins) [Auto]' },
    { key: 'followUpQInReviewModel', header: 'Follow-up Q in Review Model?' },
    { key: 'answerScientificallyCorrect', header: 'Answer Scientifically Correct?' },
    { key: 'expertNameDisplayed', header: 'Expert Name Displayed?' },
    // Sheet quirk, preserved verbatim - lowercase "displayed".
    { key: 'correctExpertNameDisplayed', header: 'Correct Expert Name displayed?' },
    { key: 'correctSourceLinksProvided', header: 'Correct Source Links Provided?' },
    { key: 'msg120MinShownToUser', header: '120-min Msg Shown to User?' },
    { key: 'notificationReceived', header: 'Notification Received?' },
    { key: 'notificationOnSameThread', header: 'Notification on Same Thread?' },
    { key: 'notificationLinkedCorrectQId', header: 'Notification Linked Correct Q-ID?' },
    { key: 'voiceInputWorking', header: 'Voice Input Working?' },
    { key: 'voiceOutputWorking', header: 'Voice Output Working?' },
    { key: 'voiceInputQuality', header: 'Voice Input Quality' },
    { key: 'voiceOutputQuality', header: 'Voice Output Quality' },
    { key: 'voiceIssueDescription', header: 'Voice Issue Description' },
    { key: 'weatherQAnsweredCorrectly', header: 'Weather Q Answered Correctly?' },
    { key: 'mandiPriceQCorrect', header: 'Mandi Price Q Correct?' },
    { key: 'schemeQCorrect', header: 'Scheme Q Correct?' },
    { key: 'questionSavedInDb', header: 'Question Saved in DB?' },
    { key: 'answerSavedInDb', header: 'Answer Saved in DB?' },
    { key: 'qIdConsistentAcrossSystems', header: 'Q-ID Consistent Across Systems?' },
    { key: 'whatsappVsWebAnswerMatch', header: 'WhatsApp vs Web Answer Match?' },
    { key: 'overallTestStatus', header: 'Overall Test Status' },
    { key: 'defectSeverity', header: 'Defect Severity' },
    { key: 'defectIdBugRef', header: 'Defect ID / Bug Ref\nZoho Desk Ticketing' },
    { key: 'reviewerRemarks', header: 'Reviewer Remarks' },
    { key: 'testerRemarks', header: 'Tester Remarks' },
    { key: 'status', header: 'Status' },
];

function formatExportValue(key: keyof TesterLogEntry, value: unknown): string {
    if (value === undefined || value === null) return '';
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

/**
 * Compute HH:MM:SS difference between two HH:MM:SS strings.
 * Returns '' if either value is missing or result is negative.
 */
function parseToMs(str?: string, defaultDate?: string): number | null {
    if (!str || !str.trim()) return null;
    const s = str.trim();

    if (s.includes('-') || s.includes('/')) {
        const parsed = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
        if (!isNaN(parsed)) return parsed;
    }

    const parts = s.split(':').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        if (defaultDate && (defaultDate.includes('-') || defaultDate.includes('/'))) {
            const dateStr = defaultDate.trim();
            const timeStr = `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}:${String(parts[2] || 0).padStart(2, '0')}`;
            const combined = Date.parse(`${dateStr}T${timeStr}`);
            if (!isNaN(combined)) return combined;
        }
        const secs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
        return secs * 1000;
    }

    return null;
}

function computeHmsDiff(start?: string, end?: string, defaultDate?: string): string {
    const sMs = parseToMs(start, defaultDate);
    const eMs = parseToMs(end, defaultDate);
    if (sMs === null || eMs === null || eMs < sMs) return '';

    const diffSecs = Math.floor((eMs - sMs) / 1000);
    const h = Math.floor(diffSecs / 3600);
    const m = Math.floor((diffSecs % 3600) / 60);
    const sec = diffSecs % 60;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function buildDateFilter(
    startDate?: string,
    endDate?: string,
    dateField?: string,
): Record<string, any> | null {
    if (!startDate && !endDate) return null;

    const sDate = startDate ? startDate.trim().slice(0, 10) : undefined;
    const eDate = endDate ? endDate.trim().slice(0, 10) : undefined;

    const testDateFilter: Record<string, string> = {};
    if (sDate) testDateFilter.$gte = sDate;
    if (eDate) testDateFilter.$lte = eDate;

    const createdFilter: Record<string, Date> = {};
    if (sDate) createdFilter.$gte = new Date(`${sDate}T00:00:00.000Z`);
    if (eDate) createdFilter.$lte = new Date(`${eDate}T23:59:59.999Z`);

    if (dateField === 'createdAt') {
        return { createdAt: createdFilter };
    }

    return {
        $or: [
            { testDate: testDateFilter },
            {
                $and: [
                    { testDate: { $in: [null, ''] } },
                    { createdAt: createdFilter },
                ],
            },
        ],
    };
}

// Summary tab (Database Logs Analytics side): daily per-tester targets, from
// the business's "End to End Testing Pipeline" sheet. This is the ONLY place
// these numbers are defined - the API response carries the resolved
// target/actual/achievement figures to the frontend, which has no target
// table of its own, so there's exactly one place to edit when the business
// changes them.
const QUESTION_TYPE_DAILY_TARGETS: {
    key: QuestionTypeKey;
    label: string;
    // Exact typeOfQuestion value TesterLogForm's dropdown writes for this
    // category (types.ts's TYPE_OF_QUESTION_OPTIONS) - matched via
    // normalizeQuestionTypeKey below, not the Sheet-side's fuzzy
    // Question-Category-based dynamicSubBucketFor, since a DB-native entry
    // always carries one of these exact dropdown values.
    typeOfQuestion: string;
    total: number;
    webApp: number;
    whatsApp: number;
}[] = [
    { key: 'unique', label: 'Unique', typeOfQuestion: 'Unique', total: 8, webApp: 4, whatsApp: 4 },
    { key: 'gdb', label: 'GDB', typeOfQuestion: 'GDB', total: 8, webApp: 4, whatsApp: 4 },
    { key: 'outreach', label: 'Outreach', typeOfQuestion: 'Outreach', total: 11, webApp: 6, whatsApp: 5 },
    { key: 'weather', label: 'Dynamic – Weather', typeOfQuestion: 'Weather Dynamic', total: 19, webApp: 9, whatsApp: 10 },
    { key: 'scheme', label: 'Dynamic – Scheme', typeOfQuestion: 'Scheme Dynamic', total: 6, webApp: 3, whatsApp: 3 },
    { key: 'mandi', label: 'Dynamic – Mandi', typeOfQuestion: 'Mandi Dynamic', total: 2, webApp: 1, whatsApp: 1 },
];

// typeOfQuestion -> QuestionTypeKey, matched against TYPE_OF_QUESTION_OPTIONS'
// exact dropdown values (case/whitespace-insensitive). A bare "Dynamic" (no
// Weather/Scheme/Mandi suffix) has no target row on the business's sheet and
// deliberately maps to null - excluded from every category count and the
// Total, rather than guessed into one of the 3 Dynamic sub-categories.
const QUESTION_TYPE_KEY_BY_VALUE = new Map<string, QuestionTypeKey>(
    QUESTION_TYPE_DAILY_TARGETS.map((t) => [t.typeOfQuestion.toLowerCase(), t.key]),
);
function normalizeQuestionTypeKey(typeOfQuestion?: string): QuestionTypeKey | null {
    return QUESTION_TYPE_KEY_BY_VALUE.get((typeOfQuestion || '').trim().toLowerCase()) ?? null;
}

// channelTested -> which of the 2 target columns (Web App / WhatsApp) a row
// counts against. "Both" counts toward BOTH columns' actuals (the tester
// tested the question on both channels), so Web App + WhatsApp actuals can
// exceed the category's own Total actual - by design, not a bug.
function channelCountsTowards(channelTested: string | undefined, column: 'webApp' | 'whatsApp'): boolean {
    const normalized = normalizeChannel(channelTested);
    if (normalized === 'Both') return true;
    return column === 'webApp' ? normalized === 'Web App' : normalized === 'WhatsApp';
}

function emptyTypeCounts(): Record<QuestionTypeKey, number> {
    return { unique: 0, gdb: 0, outreach: 0, weather: 0, scheme: 0, mandi: 0 };
}

// Calendar days spanned by [startDate, endDate], inclusive on both ends.
// When either bound is missing, falls back to the earliest/latest testDate
// found among the (already tester+range-filtered) entries on whichever side
// has no explicit bound. Returns 0 when there's no explicit range and no
// entries to derive one from.
function calendarDaysInRange(startDate: string | undefined, endDate: string | undefined, entries: TesterLogEntry[]): number {
    let s = startDate?.trim().slice(0, 10) || undefined;
    let e = endDate?.trim().slice(0, 10) || undefined;
    if (!s || !e) {
        const testDates = entries.map((r) => (r.testDate || '').trim()).filter(Boolean).sort();
        if (!s) s = testDates[0];
        if (!e) e = testDates[testDates.length - 1];
    }
    if (!s || !e) return 0;

    const sMs = Date.parse(`${s}T00:00:00.000Z`);
    const eMs = Date.parse(`${e}T00:00:00.000Z`);
    if (isNaN(sMs) || isNaN(eMs) || eMs < sMs) return 0;
    return Math.round((eMs - sMs) / (24 * 60 * 60 * 1000)) + 1;
}

// Testers work 6 days a week, each with their own weekly day off (some
// Saturday, some Sunday), so there's no single shared "off day" to subtract
// from a calendar range - scaling by 6/7 and rounding to the nearest whole
// day is the agreed stand-in. Every tester in a given range is scored
// against this same working-day count, whether they logged anything or not
// - do not scale a tester's target by their own distinct logged days
// instead, that makes a tester who logged nothing vanish from their target.
function workingDaysInRange(calendarDays: number): number {
    return Math.round((calendarDays * 6) / 7);
}

@injectable()
export class TesterLogService implements ITesterLogService {
    constructor(
        @inject(DATABASE_TOKEN)
        private readonly db: DatabaseProvider,
    ) {}

    async createEntry(
        userId: string,
        email: string,
        testerName: string,
        body: Omit<TesterLogEntry, '_id' | 'submittedByUserId' | 'submittedByEmail' | 'testerName' | 'createdAt' | 'updatedAt' | 'testDate'> & { testDate?: string },
    ): Promise<CreateTesterLogEntryResponse> {
        const now = new Date();
        const testDate = getTodayIST(now);

        const entry: TesterLogEntry = {
            ...body,
            testDate,
            submittedByUserId: userId,
            submittedByEmail: email,
            testerName,
            responseTimeMins: computeHmsDiff(body.timeQuestionAsked, body.timeAnswerReceived, testDate) || body.responseTimeMins || '',
            waResponseTimeMins: computeHmsDiff(body.waTimeQuestionAsked, body.waTimeAnswerReceived, testDate) || body.waResponseTimeMins || '',
            authorTatMins: computeHmsDiff(body.authorAssignmentTime, body.authorCompletionTime, testDate),
            review1TatMins: computeHmsDiff(body.reviewer1AssignmentTime, body.reviewer1CompletionTime, testDate),
            review2TatMins: computeHmsDiff(body.reviewer2AssignmentTime, body.reviewer2CompletionTime, testDate),
            review3TatMins: computeHmsDiff(body.reviewer3AssignmentTime, body.reviewer3CompletionTime, testDate),
            review4TatMins: computeHmsDiff(body.reviewer4AssignmentTime, body.reviewer4CompletionTime, testDate),
            review5TatMins: computeHmsDiff(body.reviewer5AssignmentTime, body.reviewer5CompletionTime, testDate),
            moderatorTatMins: computeHmsDiff(body.moderatorAssignmentTime, body.moderatorCompletionTime, testDate),
            createdAt: now,
            updatedAt: now,
        };

        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const result = await collection.insertOne(entry as any);

        return {
            success: true,
            entry: { ...entry, _id: result.insertedId.toString() },
        };
    }

    async getMyEntries(
        userId: string,
        page: number,
        limit: number,
        startDate?: string,
        endDate?: string,
        dateField?: string,
    ): Promise<PaginatedTesterLogEntries> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter: Record<string, any> = { submittedByUserId: userId };
        const dateFilter = buildDateFilter(startDate, endDate, dateField);
        if (dateFilter) {
            Object.assign(filter, dateFilter);
        }

        const [entries, total] = await Promise.all([
            collection
                .find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray(),
            collection.countDocuments(filter),
        ]);

        return {
            success: true,
            entries: entries.map((e: any) => ({ ...e, _id: e._id?.toString() })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    // Shared by getAllEntries/getSummary/exportEntries - equality match on
    // each of the 4 dropdown-backed fields (typed selections in the tester
    // form, not free text, so exact match is correct here - no sheet-style
    // normalization needed) plus the existing testerId/date filtering.
    private buildEntryFilter(
        testerId?: string,
        startDate?: string,
        endDate?: string,
        dateField?: string,
        typeOfQuestion?: string,
        channelTested?: string,
        overallTestStatus?: string,
        defectSeverity?: string,
    ): Record<string, any> {
        const filter: Record<string, any> = testerId ? { submittedByUserId: testerId } : {};
        const dateFilter = buildDateFilter(startDate, endDate, dateField);
        if (dateFilter) {
            Object.assign(filter, dateFilter);
        }
        if (typeOfQuestion) filter.typeOfQuestion = typeOfQuestion;
        if (channelTested) filter.channelTested = channelTested;
        if (overallTestStatus) filter.overallTestStatus = overallTestStatus;
        if (defectSeverity) filter.defectSeverity = defectSeverity;
        return filter;
    }

    async getAllEntries(
        page: number,
        limit: number,
        testerId?: string,
        startDate?: string,
        endDate?: string,
        dateField?: string,
        typeOfQuestion?: string,
        channelTested?: string,
        overallTestStatus?: string,
        defectSeverity?: string,
    ): Promise<PaginatedTesterLogEntries> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter = this.buildEntryFilter(
            testerId, startDate, endDate, dateField,
            typeOfQuestion, channelTested, overallTestStatus, defectSeverity,
        );

        const [entries, total] = await Promise.all([
            collection
                .find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray(),
            collection.countDocuments(filter),
        ]);

        return {
            success: true,
            entries: entries.map((e: any) => ({ ...e, _id: e._id?.toString() })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    // Distinct testers with at least one entry, for the admin Tester filter
    // dropdown - each labeled with that tester's most recently used
    // testerName (sorted by createdAt desc so $first picks the latest one).
    async getTesterOptions(): Promise<TesterOption[]> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const results = await collection
            .aggregate([
                { $sort: { createdAt: -1 } },
                { $group: { _id: '$submittedByUserId', testerName: { $first: '$testerName' } } },
                { $sort: { testerName: 1 } },
            ])
            .toArray();
        return results.map((r: any) => ({ id: r._id, name: r.testerName || r._id }));
    }

    async getSummary(
        testerId?: string,
        startDate?: string,
        endDate?: string,
        dateField?: string,
        typeOfQuestion?: string,
        channelTested?: string,
        overallTestStatus?: string,
        defectSeverity?: string,
    ): Promise<TesterLogSummary> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);

        const totalFilter: Record<string, any> = testerId ? { submittedByUserId: testerId } : {};
        const fullFilter = this.buildEntryFilter(
            testerId, startDate, endDate, dateField,
            typeOfQuestion, channelTested, overallTestStatus, defectSeverity,
        );
        // Ignores any Overall Test Status filter - see TesterLogSummary's
        // passRate comment for why.
        const filterForPassRate = this.buildEntryFilter(
            testerId, startDate, endDate, dateField,
            typeOfQuestion, channelTested, undefined, defectSeverity,
        );

        const [totalEntries, entriesInRange, passCount, statusRecordedCount] = await Promise.all([
            collection.countDocuments(totalFilter),
            collection.countDocuments(fullFilter),
            collection.countDocuments({ ...filterForPassRate, overallTestStatus: 'Pass' }),
            collection.countDocuments({ ...filterForPassRate, overallTestStatus: { $nin: [null, ''] } }),
        ]);

        const passRate = statusRecordedCount > 0 ? Math.round((passCount / statusRecordedCount) * 1000) / 10 : null;

        return { totalEntries, entriesInRange, passRate, passCount, statusRecordedCount };
    }

    // Excel is the only export format - no format param, since there's
    // nothing else to choose between. Deliberately takes NO filter params -
    // the download is always every row in the collection, regardless of
    // whatever the admin currently has the review table filtered to, so the
    // on-screen filters can never silently leave rows out of the file.
    async exportEntries(): Promise<TesterLogExportResult> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const entries = await collection.find({}).sort({ createdAt: -1 }).toArray();

        const rows = entries.map((e: any) => {
            const row: Record<string, string> = {};
            for (const col of EXPORT_COLUMNS) {
                row[col.header] = formatExportValue(col.key, e[col.key]);
            }
            return row;
        });

        const timestamp = new Date().toISOString().slice(0, 10);
        const headers = EXPORT_COLUMNS.map((c) => c.header);

        const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Tester Entries');
        const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
        return {
            buffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `tester-entries-${timestamp}.xlsx`,
        };
    }

    // Active testers straight from the 'users' collection's role assignment,
    // NOT derived from who happened to log an entry - this is what lets a
    // tester with zero entries in the selected range still appear on the
    // Summary tab's All Testers table (0 against their real target) instead
    // of silently disappearing. Same "active" filter
    // UserRepository.findAvailableUsersByRole uses elsewhere in the main app.
    private async getActiveTesters(): Promise<{ id: string; name: string }[]> {
        const usersCollection = await this.db.getCollection<TesterUserRecord>(USERS_COLLECTION);
        const users: TesterUserRecord[] = await usersCollection
            .find({ role: 'tester', isBlocked: { $ne: true }, status: { $ne: 'in-active' } })
            .toArray();
        return users.map((u) => ({
            id: String(u._id),
            name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || String(u._id),
        }));
    }

    // Summary tab: each tester's question counts against the fixed daily
    // targets in QUESTION_TYPE_DAILY_TARGETS, scoped to testerId/date range
    // like every other admin view here. Target scales with working days in
    // the range (workingDaysInRange) - the same figure for every tester in
    // that range, not however many days that particular tester logged.
    async getQuestionTypeSummary(
        testerId?: string,
        startDate?: string,
        endDate?: string,
    ): Promise<TesterQuestionTypeSummaryResult> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter = this.buildEntryFilter(testerId, startDate, endDate);
        const entries: TesterLogEntry[] = await collection.find(filter).toArray();

        const workingDays = workingDaysInRange(calendarDaysInRange(startDate, endDate, entries));

        // Group by tester - for actual counts and the informational
        // per-tester "days logged" figure; every tester in scope shares the
        // same workingDays value above.
        const byTesterId = new Map<
            string,
            { testerName: string; testerNameAt: Date; rows: TesterLogEntry[] }
        >();
        for (const entry of entries) {
            const id = entry.submittedByUserId;
            const existing = byTesterId.get(id);
            const createdAt = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
            if (!existing) {
                byTesterId.set(id, { testerName: entry.testerName || id, testerNameAt: createdAt, rows: [entry] });
            } else {
                existing.rows.push(entry);
                // Most-recently-created entry's name wins, same convention
                // getTesterOptions uses.
                if (createdAt > existing.testerNameAt) {
                    existing.testerName = entry.testerName || id;
                    existing.testerNameAt = createdAt;
                }
            }
        }

        function countsFor(rows: TesterLogEntry[]): Record<QuestionTypeKey, number> {
            const counts = emptyTypeCounts();
            for (const row of rows) {
                const key = normalizeQuestionTypeKey(row.typeOfQuestion);
                if (key) counts[key] += 1;
            }
            return counts;
        }

        if (testerId) {
            // Single tester selected - no roster lookup needed, a specific
            // tester was already chosen, active or not.
            const rows = byTesterId.get(testerId)?.rows ?? [];
            const counts = countsFor(rows);
            const target = QUESTION_TYPE_DAILY_TARGETS.reduce((sum, t) => sum + t.total * workingDays, 0);
            const actual = QUESTION_TYPE_DAILY_TARGETS.reduce((sum, t) => sum + counts[t.key], 0);

            const byType: QuestionTypeCountRow[] = QUESTION_TYPE_DAILY_TARGETS.map((t) => {
                const typeTarget = t.total * workingDays;
                return { key: t.key, label: t.label, target: typeTarget, actual: counts[t.key], achievementPct: pct(counts[t.key], typeTarget) };
            });
            byType.push({ key: 'total', label: 'Total', target, actual, achievementPct: pct(actual, target) });

            function channelSummarySingle(column: 'webApp' | 'whatsApp') {
                const chTarget = QUESTION_TYPE_DAILY_TARGETS.reduce((sum, t) => sum + t[column] * workingDays, 0);
                const chActual = rows.filter(
                    (e) => normalizeQuestionTypeKey(e.typeOfQuestion) && channelCountsTowards(e.channelTested, column),
                ).length;
                return { target: chTarget, actual: chActual, achievementPct: pct(chActual, chTarget) };
            }

            return {
                workingDays,
                overall: { target, actual, achievementPct: pct(actual, target) },
                webApp: channelSummarySingle('webApp'),
                whatsApp: channelSummarySingle('whatsApp'),
                byType,
                byTester: undefined,
            };
        }

        // All Testers - union of the active tester-role roster (so a tester
        // with zero entries in range still gets a row) and any
        // submittedByUserId with real entries in range but not currently on
        // that roster, so real historical data is never silently dropped.
        const activeTesters = await this.getActiveTesters();
        const testerIds = new Set<string>(activeTesters.map((t) => t.id));
        byTesterId.forEach((_v, id) => testerIds.add(id));

        const testerRows: TesterQuestionTypeRow[] = [...testerIds].map((id) => {
            const fromEntries = byTesterId.get(id);
            const fromRoster = activeTesters.find((t) => t.id === id);
            const testerName = fromRoster?.name || fromEntries?.testerName || id;
            const rows = fromEntries?.rows ?? [];
            const counts = countsFor(rows);
            const target = QUESTION_TYPE_DAILY_TARGETS.reduce((sum, t) => sum + t.total * workingDays, 0);
            const actual = QUESTION_TYPE_DAILY_TARGETS.reduce((sum, t) => sum + counts[t.key], 0);
            return {
                testerId: id,
                testerName,
                // Informational only (distinct days this tester actually
                // logged something) - not what the target scales by.
                daysWorked: new Set(rows.map((r) => r.testDate).filter(Boolean)).size,
                counts,
                target,
                actual,
                achievementPct: pct(actual, target),
            };
        }).sort((a, b) => a.testerName.localeCompare(b.testerName));

        const byType: QuestionTypeCountRow[] = QUESTION_TYPE_DAILY_TARGETS.map((t) => {
            // Sum of each included tester's own target (not a single
            // testerCount × rate × workingDays shortcut), so this can never
            // drift from testerRows' own per-tester targets above.
            const target = testerRows.reduce((sum) => sum + t.total * workingDays, 0);
            const actual = testerRows.reduce((sum, tr) => sum + tr.counts[t.key], 0);
            return { key: t.key, label: t.label, target, actual, achievementPct: pct(actual, target) };
        });
        const totalTarget = byType.reduce((sum, r) => sum + r.target, 0);
        const totalActual = byType.reduce((sum, r) => sum + r.actual, 0);
        byType.push({
            key: 'total',
            label: 'Total',
            target: totalTarget,
            actual: totalActual,
            achievementPct: pct(totalActual, totalTarget),
        });

        function channelSummary(column: 'webApp' | 'whatsApp') {
            const target = testerRows.reduce(
                (sum) => sum + QUESTION_TYPE_DAILY_TARGETS.reduce((s, t) => s + t[column] * workingDays, 0),
                0,
            );
            const actual = entries.filter(
                (e) => normalizeQuestionTypeKey(e.typeOfQuestion) && channelCountsTowards(e.channelTested, column),
            ).length;
            return { target, actual, achievementPct: pct(actual, target) };
        }

        return {
            workingDays,
            overall: { target: totalTarget, actual: totalActual, achievementPct: pct(totalActual, totalTarget) },
            webApp: channelSummary('webApp'),
            whatsApp: channelSummary('whatsApp'),
            byType,
            byTester: testerRows,
        };
    }

    async getMySummary(
        userId: string,
        startDate?: string,
        endDate?: string,
        dateField?: string,
    ): Promise<TesterLogSummaryResponse> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter: Record<string, any> = { submittedByUserId: userId };
        const dateFilter = buildDateFilter(startDate, endDate, dateField);
        if (dateFilter) {
            Object.assign(filter, dateFilter);
        }

        const entries: TesterLogEntry[] = await collection.find(filter).sort({ createdAt: -1 }).toArray();

        let passed = 0;
        let failed = 0;
        let partial = 0;
        let expectedOutput = 0;
        let anomalyFound = 0;
        let otherStatus = 0;

        let slaMet = 0;
        let slaBreached = 0;

        let responseTimeSum = 0;
        let responseTimeCount = 0;

        let totalDefects = 0;
        const defectsBySeverity = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
        };

        const byQuestionType: Record<string, number> = {};
        const byChannel: Record<string, number> = {};
        const byLanguage: Record<string, number> = {};
        const dailyMap: Record<string, { total: number; passed: number; failed: number }> = {};

        let sciCorrect = 0;
        let sciIncorrect = 0;

        let dbSaved = 0;
        let dbNotSaved = 0;

        let voiceInputWorking = 0;
        let voiceInputIssues = 0;
        let voiceOutputWorking = 0;

        let totalCrossPlatform = 0;
        let matchedAnswers = 0;

        for (const entry of entries) {
            const overall = (entry.overallTestStatus || '').trim().toLowerCase();
            if (overall === 'pass') {
                passed++;
            } else if (overall === 'fail') {
                failed++;
            } else if (overall === 'partial') {
                partial++;
            } else if (overall === 'expected output') {
                expectedOutput++;
            } else if (overall.includes('anomaly')) {
                anomalyFound++;
            } else if (overall) {
                otherStatus++;
            }

            const sla = (entry.slaStatus || '').trim().toLowerCase();
            if (sla === 'met' || sla === 'within sla' || sla === 'pass') {
                slaMet++;
            } else if (sla === 'breached' || sla === 'fail') {
                slaBreached++;
            }

            if (entry.responseTimeMins) {
                const trimmed = entry.responseTimeMins.trim();
                let mins: number | null = null;
                if (trimmed.includes(':')) {
                    const parts = trimmed.split(':').map(Number);
                    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                        mins = parts[0] * 60 + parts[1] + (parts[2] || 0) / 60;
                    }
                } else if (!isNaN(Number(trimmed))) {
                    mins = parseFloat(trimmed);
                }
                if (mins !== null && mins >= 0 && mins < 100000) {
                    responseTimeSum += mins;
                    responseTimeCount++;
                }
            }

            const sev = (entry.defectSeverity || '').trim().toLowerCase();
            const hasDefect = Boolean(
                (sev && !['na', 'nil', 'no defect', 'none'].includes(sev)) ||
                (entry.defectIdBugRef && entry.defectIdBugRef.trim() && !['na', 'nil', 'none'].includes(entry.defectIdBugRef.trim().toLowerCase()))
            );
            if (hasDefect) {
                totalDefects++;
                if (sev.includes('crit') || sev.includes('extreme')) {
                    defectsBySeverity.critical++;
                } else if (sev.includes('high')) {
                    defectsBySeverity.high++;
                } else if (sev.includes('med')) {
                    defectsBySeverity.medium++;
                } else if (sev.includes('low') || sev.includes('info')) {
                    defectsBySeverity.low++;
                }
            }

            const qType = (entry.typeOfQuestion || '').trim();
            if (qType) {
                byQuestionType[qType] = (byQuestionType[qType] || 0) + 1;
            }

            const channel = (entry.channelTested || '').trim();
            if (channel) {
                byChannel[channel] = (byChannel[channel] || 0) + 1;
            }

            const lang = (entry.languageTested || '').trim();
            if (lang) {
                byLanguage[lang] = (byLanguage[lang] || 0) + 1;
            }

            const dateKey = entry.testDate?.trim() || (entry.createdAt ? new Date(entry.createdAt).toISOString().slice(0, 10) : 'Unknown');
            if (dateKey) {
                if (!dailyMap[dateKey]) {
                    dailyMap[dateKey] = { total: 0, passed: 0, failed: 0 };
                }
                dailyMap[dateKey].total++;
                if (overall === 'pass' || overall === 'expected output') {
                    dailyMap[dateKey].passed++;
                } else if (overall === 'fail' || overall.includes('anomaly')) {
                    dailyMap[dateKey].failed++;
                }
            }

            const sci = (entry.answerScientificallyCorrect || '').trim().toLowerCase();
            if (sci === 'yes' || sci === 'correct') {
                sciCorrect++;
            } else if (sci === 'no' || sci === 'incorrect') {
                sciIncorrect++;
            }

            const qSaved = (entry.questionSavedInDb || '').trim().toLowerCase();
            const aSaved = (entry.answerSavedInDb || '').trim().toLowerCase();
            if (qSaved === 'yes' || aSaved === 'yes') {
                dbSaved++;
            } else if (qSaved === 'no' || aSaved === 'no') {
                dbNotSaved++;
            }

            const vIn = (entry.voiceInputWorking || '').trim().toLowerCase();
            if (vIn === 'yes') voiceInputWorking++;
            else if (vIn === 'no') voiceInputIssues++;

            const vOut = (entry.voiceOutputWorking || '').trim().toLowerCase();
            if (vOut === 'yes') voiceOutputWorking++;

            const ch = (entry.channelTested || '').trim().toLowerCase();
            if (ch.includes('both') || ch.includes('cross')) {
                totalCrossPlatform++;
                const match = (entry.whatsappVsWebAnswerMatch || '').trim().toLowerCase();
                if (match === 'yes' || match === 'match' || match === 'true') {
                    matchedAnswers++;
                }
            }
        }

        const totalTests = entries.length;
        const passRate = totalTests > 0 ? Math.round(((passed + expectedOutput) / totalTests) * 1000) / 10 : 0;
        const failRate = totalTests > 0 ? Math.round(((failed + anomalyFound) / totalTests) * 1000) / 10 : 0;
        const totalSla = slaMet + slaBreached;
        const slaMetRate = totalSla > 0 ? Math.round((slaMet / totalSla) * 1000) / 10 : 0;
        const avgResponseMinutes = responseTimeCount > 0 ? Math.round((responseTimeSum / responseTimeCount) * 10) / 10 : null;

        const totalSci = sciCorrect + sciIncorrect;
        const sciRate = totalSci > 0 ? Math.round((sciCorrect / totalSci) * 1000) / 10 : 0;

        const totalDb = dbSaved + dbNotSaved;
        const dbRate = totalDb > 0 ? Math.round((dbSaved / totalDb) * 1000) / 10 : 0;

        const dailyStats = Object.entries(dailyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, stats]) => ({
                date,
                total: stats.total,
                passed: stats.passed,
                failed: stats.failed,
            }));

        // Calculate Target vs. Achieved comparison
        let daysCount = 1;
        if (startDate && endDate) {
            const start = new Date(startDate.trim().slice(0, 10));
            const end = new Date(endDate.trim().slice(0, 10));
            const diffMs = end.getTime() - start.getTime();
            if (!isNaN(diffMs) && diffMs >= 0) {
                daysCount = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
            }
        }

        const categoryCounts: Record<string, { total: number; webApp: number; whatsApp: number }> = {
            'Unique': { total: 0, webApp: 0, whatsApp: 0 },
            'GDB': { total: 0, webApp: 0, whatsApp: 0 },
            'Outreach': { total: 0, webApp: 0, whatsApp: 0 },
            'Dynamic - Weather': { total: 0, webApp: 0, whatsApp: 0 },
            'Dynamic - Scheme': { total: 0, webApp: 0, whatsApp: 0 },
            'Dynamic - Mandi': { total: 0, webApp: 0, whatsApp: 0 },
        };

        for (const entry of entries) {
            const qType = (entry.typeOfQuestion || '').trim().toLowerCase();
            const cat = (entry.questionCategory || '').trim().toLowerCase();

            let targetType: string | null = null;
            if (qType === 'unique') {
                targetType = 'Unique';
            } else if (qType === 'gdb' || qType === 'gdp') {
                targetType = 'GDB';
            } else if (qType === 'outreach') {
                targetType = 'Outreach';
            } else if (qType.includes('weather') || cat.includes('weather') || cat.includes('climate') || cat.includes('stress')) {
                targetType = 'Dynamic - Weather';
            } else if (qType.includes('scheme') || cat.includes('scheme') || cat.includes('subsid')) {
                targetType = 'Dynamic - Scheme';
            } else if (qType.includes('mandi') || qType.includes('market') || cat.includes('mandi') || cat.includes('price')) {
                targetType = 'Dynamic - Mandi';
            } else if (qType.includes('dynamic')) {
                if (cat.includes('weather') || cat.includes('climate')) targetType = 'Dynamic - Weather';
                else if (cat.includes('scheme') || cat.includes('subsid')) targetType = 'Dynamic - Scheme';
                else if (cat.includes('mandi') || cat.includes('price')) targetType = 'Dynamic - Mandi';
                else targetType = 'Dynamic - Weather';
            }

            const ch = (entry.channelTested || '').trim().toLowerCase();
            const isBoth = ch.includes('both') || ch.includes('cross');
            const isWebApp = isBoth || ch.includes('web');
            const isWhatsApp = isBoth || ch.includes('whatsapp') || ch.includes('wa');

            if (targetType && categoryCounts[targetType]) {
                categoryCounts[targetType].total += isBoth ? 2 : 1;
                if (isWebApp) categoryCounts[targetType].webApp++;
                if (isWhatsApp) categoryCounts[targetType].whatsApp++;
            }
        }

        const DAILY_TARGET_DEFINITIONS = [
            { questionType: 'Unique', targetTotal: 8, targetWebApp: 4, targetWhatsApp: 4 },
            { questionType: 'GDB', targetTotal: 8, targetWebApp: 4, targetWhatsApp: 4 },
            { questionType: 'Outreach', targetTotal: 11, targetWebApp: 6, targetWhatsApp: 5 },
            { questionType: 'Dynamic - Weather', targetTotal: 19, targetWebApp: 9, targetWhatsApp: 10 },
            { questionType: 'Dynamic - Scheme', targetTotal: 6, targetWebApp: 3, targetWhatsApp: 3 },
            { questionType: 'Dynamic - Mandi', targetTotal: 2, targetWebApp: 1, targetWhatsApp: 1 },
        ];

        const targetRows = DAILY_TARGET_DEFINITIONS.map(def => {
            const counts = categoryCounts[def.questionType] || { total: 0, webApp: 0, whatsApp: 0 };
            const targetTotal = def.targetTotal * daysCount;
            const targetWebApp = def.targetWebApp * daysCount;
            const targetWhatsApp = def.targetWhatsApp * daysCount;
            const completionRate = targetTotal > 0 ? Math.round((counts.total / targetTotal) * 1000) / 10 : 0;
            return {
                questionType: def.questionType,
                targetTotal,
                achievedTotal: counts.total,
                targetWebApp,
                achievedWebApp: counts.webApp,
                targetWhatsApp,
                achievedWhatsApp: counts.whatsApp,
                completionRate,
            };
        });

        const totalAchievedTotal = targetRows.reduce((sum, r) => sum + r.achievedTotal, 0);
        const totalAchievedWebApp = targetRows.reduce((sum, r) => sum + r.achievedWebApp, 0);
        const totalAchievedWhatsApp = targetRows.reduce((sum, r) => sum + r.achievedWhatsApp, 0);
        const totalTargetTotal = 54 * daysCount;
        const totalTargetWebApp = 27 * daysCount;
        const totalTargetWhatsApp = 27 * daysCount;
        const totalCompletionRate = totalTargetTotal > 0 ? Math.round((totalAchievedTotal / totalTargetTotal) * 1000) / 10 : 0;

        const targetVsAchieved = {
            daysCount,
            rows: targetRows,
            total: {
                questionType: 'Total',
                targetTotal: totalTargetTotal,
                achievedTotal: totalAchievedTotal,
                targetWebApp: totalTargetWebApp,
                achievedWebApp: totalAchievedWebApp,
                targetWhatsApp: totalTargetWhatsApp,
                achievedWhatsApp: totalAchievedWhatsApp,
                completionRate: totalCompletionRate,
            },
        };

        return {
            success: true,
            totalTests,
            passed,
            failed,
            partial,
            expectedOutput,
            anomalyFound,
            otherStatus,
            passRate,
            failRate,
            slaMet,
            slaBreached,
            slaMetRate,
            avgResponseMinutes,
            totalDefects,
            defectsBySeverity,
            byQuestionType,
            byChannel,
            byLanguage,
            dailyStats,
            scientificAccuracy: {
                correct: sciCorrect,
                incorrect: sciIncorrect,
                rate: sciRate,
            },
            dbPersistence: {
                saved: dbSaved,
                notSaved: dbNotSaved,
                rate: dbRate,
            },
            voiceStats: {
                inputWorking: voiceInputWorking,
                inputIssues: voiceInputIssues,
                outputWorking: voiceOutputWorking,
            },
            crossPlatformStats: {
                totalCrossPlatform,
                matchedAnswers,
                parityRate: totalCrossPlatform > 0 ? Math.round((matchedAnswers / totalCrossPlatform) * 1000) / 10 : 0,
            },
            targetVsAchieved,
        };
    }
}
