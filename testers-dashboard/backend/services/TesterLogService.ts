import { injectable, inject } from 'inversify';
import { ObjectId } from 'mongodb';
import * as XLSX from 'xlsx';
import {
    ITesterLogService,
    TesterLogEntry,
    PaginatedTesterLogEntries,
    CreateTesterLogEntryResponse,
    TesterLogActor,
    TesterLogAuditRecord,
    TesterOption,
    TesterLogSummary,
    TesterLogExportResult,
    TesterQuestionTypeSummaryResult,
    TesterQuestionTypeRow,
    TesterLogSummaryResponse,
} from '../interfaces/ITesterLogService.js';
import { getTodayIST } from '../testersDashboard/normalize.js';
import {
    DAILY_TARGETS_PER_TESTER,
    calendarDaysBetween,
    summarizeEntries,
    workingDaysFor,
} from './adminSummaryTargets.js';

const COLLECTION = 'tester_test_cases';
// One row per admin edit/delete of a tester_test_cases entry (see
// TesterLogAuditRecord) - a delete's row holds the full removed document.
const AUDIT_COLLECTION = 'tester_test_cases_audit';
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

// The [Auto] duration fields - always computed here from their start/end
// pair, never taken from a request body (create or admin edit).
function computeDurations(e: Partial<TesterLogEntry>, testDate: string): Partial<TesterLogEntry> {
    return {
        responseTimeMins: computeHmsDiff(e.timeQuestionAsked, e.timeAnswerReceived, testDate),
        authorTatMins: computeHmsDiff(e.authorAssignmentTime, e.authorCompletionTime, testDate),
        review1TatMins: computeHmsDiff(e.reviewer1AssignmentTime, e.reviewer1CompletionTime, testDate),
        review2TatMins: computeHmsDiff(e.reviewer2AssignmentTime, e.reviewer2CompletionTime, testDate),
        review3TatMins: computeHmsDiff(e.reviewer3AssignmentTime, e.reviewer3CompletionTime, testDate),
        review4TatMins: computeHmsDiff(e.reviewer4AssignmentTime, e.reviewer4CompletionTime, testDate),
        review5TatMins: computeHmsDiff(e.reviewer5AssignmentTime, e.reviewer5CompletionTime, testDate),
        moderatorTatMins: computeHmsDiff(e.moderatorAssignmentTime, e.moderatorCompletionTime, testDate),
    };
}

// Fields an admin edit may change: every form-entered column, i.e. the
// export columns minus the record's identity (_id, testerName) and the
// computed durations. Anything else in the request body is ignored, so an
// edit can never rewrite who submitted an entry or when.
const DERIVED_FIELDS = new Set(Object.keys(computeDurations({}, '')));
const EDITABLE_FIELDS: (keyof TesterLogEntry)[] = EXPORT_COLUMNS
    .map((c) => c.key)
    .filter((k) => k !== '_id' && k !== 'testerName' && !DERIVED_FIELDS.has(k));

function toObjectId(id: string): ObjectId | null {
    return ObjectId.isValid(id) ? new ObjectId(id) : null;
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
            ...computeDurations(body, testDate),
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

    async updateEntry(
        id: string,
        body: Partial<TesterLogEntry>,
        actor: TesterLogActor,
    ): Promise<CreateTesterLogEntryResponse | null> {
        const _id = toObjectId(id);
        if (!_id) return null;

        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const before: TesterLogEntry | null = await collection.findOne({ _id });
        if (!before) return null;

        const changes: Partial<TesterLogEntry> = {};
        for (const key of EDITABLE_FIELDS) {
            if (body[key] !== undefined) (changes as any)[key] = body[key];
        }
        const merged = { ...before, ...changes };
        const $set: Partial<TesterLogEntry> = {
            ...changes,
            ...computeDurations(merged, merged.testDate),
            updatedAt: new Date(),
        };

        const result = await collection.updateOne({ _id }, { $set });
        // Deleted between the read above and this write.
        if (result.matchedCount === 0) return null;

        const after: TesterLogEntry = { ...before, ...$set };
        // The edit has already been applied, so a failed audit write is
        // logged rather than turned into an error response for it.
        try {
            await this.writeAudit({ entryId: id, action: 'update', actor, before, after, createdAt: new Date() });
        } catch (err) {
            console.error(`[TesterLog] Failed to write audit record for update of ${id}:`, err);
        }

        return { success: true, entry: { ...after, _id: id } };
    }

    async deleteEntry(id: string, actor: TesterLogActor): Promise<boolean> {
        const _id = toObjectId(id);
        if (!_id) return false;

        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const before: TesterLogEntry | null = await collection.findOne({ _id });
        if (!before) return false;

        // Snapshot first, and let a failure here abort the delete - an entry
        // is only ever removed once a restorable copy of it exists.
        await this.writeAudit({ entryId: id, action: 'delete', actor, before, createdAt: new Date() });

        const result = await collection.deleteOne({ _id });
        return result.deletedCount === 1;
    }

    private async writeAudit(record: TesterLogAuditRecord): Promise<void> {
        const audit = await this.db.getCollection<TesterLogAuditRecord>(AUDIT_COLLECTION);
        await audit.insertOne(record);
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

    // The date window a Summary target is computed over. Explicit ends are
    // used as given; a missing end (All Time, or a one-sided custom range)
    // is filled from the whole team's earliest/latest testDate - never from
    // the selected tester's own entries, which would give the same tester a
    // different All Time target alone than in the All Testers table.
    private async resolveSummaryRange(
        collection: any,
        startDate?: string,
        endDate?: string,
    ): Promise<{ rangeStart: string | null; rangeEnd: string | null }> {
        let rangeStart = startDate?.trim().slice(0, 10) || null;
        let rangeEnd = endDate?.trim().slice(0, 10) || null;
        if (!rangeStart || !rangeEnd) {
            const [span] = await collection
                .aggregate([
                    { $match: { testDate: { $nin: [null, ''] } } },
                    { $group: { _id: null, first: { $min: '$testDate' }, last: { $max: '$testDate' } } },
                ])
                .toArray();
            rangeStart = rangeStart ?? span?.first ?? null;
            rangeEnd = rangeEnd ?? span?.last ?? null;
        }
        return { rangeStart, rangeEnd };
    }

    // Summary tab: question counts against the Admin Summary target model
    // (adminSummaryTargets.ts), scoped to testerId/date range like every
    // other admin view here. Targets scale with the working days in the
    // range - the same figure for every tester, not however many days a
    // particular tester logged. Every figure comes from summarizeEntries, so
    // a single tester's view and their row in the All Testers table agree.
    async getQuestionTypeSummary(
        testerId?: string,
        startDate?: string,
        endDate?: string,
    ): Promise<TesterQuestionTypeSummaryResult> {
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter = this.buildEntryFilter(testerId, startDate, endDate);
        const entries: TesterLogEntry[] = await collection.find(filter).toArray();

        const { rangeStart, rangeEnd } = await this.resolveSummaryRange(collection, startDate, endDate);
        const workingDays = workingDaysFor(calendarDaysBetween(rangeStart ?? undefined, rangeEnd ?? undefined));
        const range = { workingDays, rangeStart, rangeEnd, dailyTargetsPerTester: DAILY_TARGETS_PER_TESTER };

        if (testerId) {
            // Single tester selected - entries are already scoped to them,
            // and no roster lookup is needed (active or not).
            const { overall, webApp, whatsApp, byType, uncategorizedCount } = summarizeEntries(entries, workingDays, 1);
            return { ...range, headcount: 1, overall, webApp, whatsApp, byType, uncategorizedCount, byTester: undefined };
        }

        // Group by tester - for each row's counts and the informational
        // "days logged" figure.
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
            const rows = fromEntries?.rows ?? [];
            const { overall, counts } = summarizeEntries(rows, workingDays, 1);
            return {
                testerId: id,
                testerName: fromRoster?.name || fromEntries?.testerName || id,
                // Informational only (distinct days this tester actually
                // logged something) - not what the target scales by.
                daysWorked: new Set(rows.map((r) => r.testDate).filter(Boolean)).size,
                counts,
                target: overall.target,
                actual: overall.actual,
                achievementPct: overall.achievementPct,
            };
        }).sort((a, b) => a.testerName.localeCompare(b.testerName));

        // Headcount × the per-tester targets: the same as adding up each
        // row's own target above, since every tester shares workingDays.
        const headcount = testerRows.length;
        const { overall, webApp, whatsApp, byType, uncategorizedCount } = summarizeEntries(entries, workingDays, headcount);
        return { ...range, headcount, overall, webApp, whatsApp, byType, uncategorizedCount, byTester: testerRows };
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
            const isBoth = ch.includes('both');
            const isWebApp = isBoth || ch.includes('web');
            const isWhatsApp = isBoth || ch.includes('whatsapp') || ch.includes('wa');

            if (targetType && categoryCounts[targetType]) {
                categoryCounts[targetType].total++;
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
            targetVsAchieved,
        };
    }
}
