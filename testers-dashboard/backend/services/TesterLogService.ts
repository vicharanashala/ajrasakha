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
} from '../interfaces/ITesterLogService.js';

const COLLECTION = 'tester_test_cases';
const DATABASE_TOKEN = Symbol.for('Database');

interface DatabaseProvider {
    getCollection<T>(name: string): Promise<any>;
}

// Every column of the Google Sheet's "Agri Advisory QA Test Log", in the
// Sheet's own exact order with the Sheet's own exact header text (including
// its 2 quirks: "ModeratorCompletion Time" - no space - and "Correct Expert
// Name displayed?" - lowercase "displayed", inconsistent with "Expert Name
// Displayed?" above it - both preserved verbatim rather than "corrected",
// since the whole point of this export is to be a drop-in match for the
// Sheet layout). Re-derive/verify against
// backend/data/testers-dashboard/updated.csv's header row if the Sheet ever
// adds/renames a column.
//
// Every one of these 78 Sheet columns has exactly one DB field behind it
// (confirmed by walking the Sheet header against TesterLogEntry field by
// field) - there is no Sheet column left without a DB equivalent, so no
// blank placeholder columns are needed here. The Defect ID / Bug Ref header
// carries the Sheet's own embedded line break (Alt+Enter in the header
// cell) as a literal "\n", matching the live Sheet exactly.
//
// 4 DB fields have NO Sheet equivalent and are deliberately left out of this
// export so the column layout stays an exact match: submittedByUserId,
// submittedByEmail, createdAt, updatedAt (all app-internal bookkeeping, not
// part of the Sheet's own log format).
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
        body: Omit<TesterLogEntry, '_id' | 'submittedByUserId' | 'submittedByEmail' | 'testerName' | 'createdAt' | 'updatedAt'>,
    ): Promise<CreateTesterLogEntryResponse> {
        const now = new Date();

        const entry: TesterLogEntry = {
            ...body,
            submittedByUserId: userId,
            submittedByEmail: email,
            testerName,
            responseTimeMins: computeHmsDiff(body.timeQuestionAsked, body.timeAnswerReceived, body.testDate),
            authorTatMins: computeHmsDiff(body.authorAssignmentTime, body.authorCompletionTime, body.testDate),
            review1TatMins: computeHmsDiff(body.reviewer1AssignmentTime, body.reviewer1CompletionTime, body.testDate),
            review2TatMins: computeHmsDiff(body.reviewer2AssignmentTime, body.reviewer2CompletionTime, body.testDate),
            review3TatMins: computeHmsDiff(body.reviewer3AssignmentTime, body.reviewer3CompletionTime, body.testDate),
            review4TatMins: computeHmsDiff(body.reviewer4AssignmentTime, body.reviewer4CompletionTime, body.testDate),
            review5TatMins: computeHmsDiff(body.reviewer5AssignmentTime, body.reviewer5CompletionTime, body.testDate),
            moderatorTatMins: computeHmsDiff(body.moderatorAssignmentTime, body.moderatorCompletionTime, body.testDate),
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
    // testerName (sorted by createdAt desc before grouping so $first picks
    // the latest one, in case a name ever changes).
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
}
