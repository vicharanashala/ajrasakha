import { injectable, inject } from 'inversify';
import { ObjectId } from 'mongodb';
import { BadRequestError } from 'routing-controllers';
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
const COUNTER_COLLECTION = 'tester_log_counters';
const TEST_CASE_COUNTER_ID = 'test_case_id';
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
// The Sheet's "Test ID" is the tester-entered ID (testId). _id,
// submittedByUserId, submittedByEmail, createdAt, updatedAt have no Sheet
// equivalent and are deliberately left out of this export (app-internal
// bookkeeping, not part of the Sheet's own log format).
//
// The one deliberate departure from the Sheet: its "Sprint / Cycle" column
// (sprintCycle) is left out. The form no longer collects it and the admin
// views no longer show it; stored values are kept in the database. Since
// EDITABLE_FIELDS below derives from these columns, it isn't admin-editable
// either.
const EXPORT_COLUMNS: { key: keyof TesterLogEntry; header: string }[] = [
    { key: 'testId', header: 'Test ID' },
    { key: 'testDate', header: 'Test Date' },
    { key: 'testerName', header: 'Tester Name' },
    { key: 'typeOfQuestion', header: 'Type of Question' },
    { key: 'buildVersion', header: 'Build / Version' },
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

function formatExportValue(key: keyof TesterLogEntry, value: unknown, entry?: TesterLogEntry): string {
    if (key === 'testerRemarks' && entry?.testerRemarksNotes) {
        return entry.testerRemarks ? `${entry.testerRemarks} - ${entry.testerRemarksNotes}` : entry.testerRemarksNotes;
    }
    if (value === undefined || value === null) return '';
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

/**
 * Compute HH:MM:SS difference between two HH:MM:SS strings.
 * Returns '' if either value is missing or result is negative.
 */
export function parseEpochMs(str?: string, defaultDate?: string): number | null {
    if (!str || !str.trim()) return null;
    const s = str.trim();

    let fullStr: string | null = null;
    const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})([ T].*)?$/);
    if (dmyMatch) {
        const day = String(dmyMatch[1]).padStart(2, '0');
        const month = String(dmyMatch[2]).padStart(2, '0');
        const year = dmyMatch[3];
        const rest = dmyMatch[4] ? dmyMatch[4].trim() : '';
        const timePart = rest ? (rest.startsWith('T') ? rest : `T${rest}`) : 'T00:00:00';
        fullStr = `${year}-${month}-${day}${timePart}`;
    } else if (s.includes('-') || s.includes('/')) {
        fullStr = s.includes('T') ? s : s.replace(' ', 'T');
    } else {
        const parts = s.split(':').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const dateStr = defaultDate?.trim();
            if (dateStr && (dateStr.includes('-') || dateStr.includes('/'))) {
                const timeStr = `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}:${String(parts[2] || 0).padStart(2, '0')}`;
                fullStr = `${dateStr}T${timeStr}`;
            }
        }
    }

    if (!fullStr) return null;

    const hasTz = /([zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(fullStr);
    const withTz = hasTz ? fullStr : `${fullStr}+05:30`;
    const parsed = Date.parse(withTz);
    return isNaN(parsed) ? null : parsed;
}

/**
 * Unified parser: returns epoch milliseconds for datetimes (always anchored to IST +05:30),
 * or milliseconds since midnight for time-only strings without defaultDate.
 */
function parseToMs(str?: string, defaultDate?: string): number | null {
    if (!str || !str.trim()) return null;
    const s = str.trim();

    // If date is present in string or defaultDate is provided, delegate to IST-aware parseEpochMs
    if (s.includes('-') || s.includes('/') || (defaultDate && (defaultDate.includes('-') || defaultDate.includes('/')))) {
        return parseEpochMs(str, defaultDate);
    }

    // Time-only string (HH:MM:SS or HH:MM) without date: milliseconds of the day
    const parts = s.split(':').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const secs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
        return secs * 1000;
    }

    return null;
}

function computeHmsDiff(start?: string, end?: string, defaultDate?: string): string {
    const sMs = parseToMs(start, defaultDate);
    const eMs = parseToMs(end, defaultDate);
    if (sMs === null || eMs === null) return '';

    let diffMs = eMs - sMs;
    const isTimeOnly = (!start?.includes('-') && !start?.includes('/')) &&
                       (!end?.includes('-') && !end?.includes('/'));
    if (diffMs < 0 && isTimeOnly) {
        const rolloverDiff = diffMs + 24 * 3600 * 1000;
        if (rolloverDiff > 0 && rolloverDiff < 14 * 3600 * 1000) {
            diffMs = rolloverDiff;
        }
    }

    if (diffMs < 0) return '';

    const diffSecs = Math.floor(diffMs / 1000);
    const h = Math.floor(diffSecs / 3600);
    const m = Math.floor((diffSecs % 3600) / 60);
    const sec = diffSecs % 60;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

export function validateNotFuture(
    time?: string,
    label: string = 'Time',
    defaultDate?: string,
    nowMs: number = Date.now(),
    graceMs: number = 5 * 60 * 1000,
): void {
    if (!time || !time.trim()) return;
    const ms = parseEpochMs(time, defaultDate);
    if (ms !== null && ms > nowMs + graceMs) {
        throw new BadRequestError(`${label} cannot be in the future`);
    }
}

const YYYY_MM_DD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateTestDateNotFuture(testDate?: string, now: Date = new Date()): void {
    if (!testDate || !testDate.trim()) return;
    const trimmed = testDate.trim();
    if (!YYYY_MM_DD_RE.test(trimmed)) {
        throw new BadRequestError('Test date must be formatted as YYYY-MM-DD');
    }
    const todayIST = getTodayIST(now);
    if (trimmed > todayIST) {
        throw new BadRequestError('Test date cannot be in the future');
    }
}

export const TRANSLATION_ERROR_MAP: Record<string, string[]> = {
    Good: ['No Error'],
    Acceptable: ['Grammar Error'],
    'Not Acceptable': ['Intent Error', 'Word Error', 'Partial Translation'],
    NA: ['NA'],
};

export function validateTranslationMapping(quality?: string, errorType?: string): void {
    if (!quality || !errorType) return;
    const trimmedQ = quality.trim();
    const trimmedE = errorType.trim();
    if (!trimmedQ || !trimmedE) return;
    const allowed = TRANSLATION_ERROR_MAP[trimmedQ];
    if (allowed && !allowed.includes(trimmedE)) {
        throw new BadRequestError(
            `Translation Error Type "${trimmedE}" is not valid for Translation Quality "${trimmedQ}". Allowed: ${allowed.join(', ')}`,
        );
    }
}

export const TEXT_FIELD_LIMITS = {
    QUERY_TEXT_MIN: 3,
    QUERY_TEXT_MAX: 1000,
    BUILD_VERSION_MAX: 50,
    THREAD_ID_MAX: 100,
    WA_THREAD_ID_MAX: 50,
    NAME_MIN: 2,
    NAME_MAX: 100,
    DISCREPANCY_NOTES_MAX: 1000,
    REMARKS_NOTES_MIN: 3,
    REMARKS_NOTES_MAX: 2000,
    LANGUAGE_MAX: 50,
    DEFECT_URL_MAX: 500,
    TEST_ID_MAX: 30,
    SPRINT_CYCLE_MAX: 50,
} as const;

export const BUILD_VERSION_REGEX = /^(?=.*\d)[a-zA-Z0-9][a-zA-Z0-9.\-_/\s()]{0,49}$/;
export const THREAD_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._:\-\/]{0,99}$/;
export const WA_THREAD_ID_REGEX = /^(\+?[0-9]{7,15}|[a-zA-Z0-9._\-]{1,50})$/;
export const PERSON_NAME_REGEX = /^[a-zA-Z\s.'\-]{2,100}$/;
export const LANGUAGE_NAME_REGEX = /^[a-zA-Z\s,+/.\-]{2,50}$/;
export const TEST_ID_REGEX = /^[a-zA-Z0-9._\-]{1,30}$/;
export const HTTP_URL_REGEX = /^https?:\/\/.+/i;

export function validateTextFields(e: Partial<TesterLogEntry>): void {
    if (e.buildVersion !== undefined && e.buildVersion !== null) {
        const bv = e.buildVersion.trim();
        if (bv) {
            if (bv.length > TEXT_FIELD_LIMITS.BUILD_VERSION_MAX || !BUILD_VERSION_REGEX.test(bv)) {
                throw new BadRequestError(
                    `Invalid Build / Version "${bv}". Must be a valid version format containing numbers (e.g. 1.0, 2.1.0, v1.0.1) and up to ${TEXT_FIELD_LIMITS.BUILD_VERSION_MAX} characters.`,
                );
            }
        }
    }

    if (e.queryText !== undefined && e.queryText !== null) {
        const q = e.queryText.trim();
        if (q) {
            if (q.length < TEXT_FIELD_LIMITS.QUERY_TEXT_MIN) {
                throw new BadRequestError(`Query Text must be at least ${TEXT_FIELD_LIMITS.QUERY_TEXT_MIN} characters.`);
            }
            if (q.length > TEXT_FIELD_LIMITS.QUERY_TEXT_MAX) {
                throw new BadRequestError(
                    `Query Text must not exceed ${TEXT_FIELD_LIMITS.QUERY_TEXT_MAX} characters (received ${q.length} characters).`,
                );
            }
        }
    }

    if (e.threadId !== undefined && e.threadId !== null) {
        const t = e.threadId.trim();
        if (t) {
            if (t.length > TEXT_FIELD_LIMITS.THREAD_ID_MAX || !THREAD_ID_REGEX.test(t)) {
                throw new BadRequestError(
                    `Thread ID must be between 1 and ${TEXT_FIELD_LIMITS.THREAD_ID_MAX} characters and contain valid identifier characters.`,
                );
            }
        }
    }

    if (e.waThreadId !== undefined && e.waThreadId !== null) {
        const wt = e.waThreadId.trim();
        if (wt) {
            if (wt.length > TEXT_FIELD_LIMITS.WA_THREAD_ID_MAX || !WA_THREAD_ID_REGEX.test(wt)) {
                throw new BadRequestError(
                    `WhatsApp Thread / Phone Number must be a valid phone number or identifier up to ${TEXT_FIELD_LIMITS.WA_THREAD_ID_MAX} characters.`,
                );
            }
        }
    }

    const nameFields: [keyof TesterLogEntry, string][] = [
        ['authorsName', 'Author Name'],
        ['reviewer1Name', 'Reviewer 1 Name'],
        ['reviewer2Name', 'Reviewer 2 Name'],
        ['reviewer3Name', 'Reviewer 3 Name'],
        ['reviewer4Name', 'Reviewer 4 Name'],
        ['reviewer5Name', 'Reviewer 5 Name'],
        ['moderatorName', 'Moderator Name'],
    ];
    for (const [key, label] of nameFields) {
        const val = e[key] as string | undefined;
        if (val !== undefined && val !== null) {
            const trimmed = val.trim();
            if (trimmed && (trimmed.length < TEXT_FIELD_LIMITS.NAME_MIN || trimmed.length > TEXT_FIELD_LIMITS.NAME_MAX || !PERSON_NAME_REGEX.test(trimmed))) {
                throw new BadRequestError(
                    `${label} must contain only letters and standard name characters (${TEXT_FIELD_LIMITS.NAME_MIN} to ${TEXT_FIELD_LIMITS.NAME_MAX} characters).`,
                );
            }
        }
    }

    if (e.testerRemarksNotes !== undefined && e.testerRemarksNotes !== null) {
        const notes = e.testerRemarksNotes.trim();
        if (notes && (notes.length < TEXT_FIELD_LIMITS.REMARKS_NOTES_MIN || notes.length > TEXT_FIELD_LIMITS.REMARKS_NOTES_MAX)) {
            throw new BadRequestError(
                `Remarks Details must be between ${TEXT_FIELD_LIMITS.REMARKS_NOTES_MIN} and ${TEXT_FIELD_LIMITS.REMARKS_NOTES_MAX} characters.`,
            );
        }
    }

    if (e.crossPlatformDiscrepancyNotes !== undefined && e.crossPlatformDiscrepancyNotes !== null) {
        const disc = e.crossPlatformDiscrepancyNotes.trim();
        if (disc && disc.length > TEXT_FIELD_LIMITS.DISCREPANCY_NOTES_MAX) {
            throw new BadRequestError(
                `Discrepancy Notes must not exceed ${TEXT_FIELD_LIMITS.DISCREPANCY_NOTES_MAX} characters.`,
            );
        }
    }

    const langFields: [keyof TesterLogEntry, string][] = [
        ['languageTested', 'Language Tested'],
        ['originalLanguage', 'Original Language'],
        ['translatedLanguage', 'Translated Language'],
    ];
    for (const [key, label] of langFields) {
        const l = e[key] as string | undefined;
        if (l !== undefined && l !== null) {
            const trimmed = l.trim();
            if (trimmed && (trimmed.length > TEXT_FIELD_LIMITS.LANGUAGE_MAX || !LANGUAGE_NAME_REGEX.test(trimmed))) {
                throw new BadRequestError(
                    `${label} must be a valid language name up to ${TEXT_FIELD_LIMITS.LANGUAGE_MAX} characters.`,
                );
            }
        }
    }

    if (e.defectIdBugRef !== undefined && e.defectIdBugRef !== null) {
        const bugRef = e.defectIdBugRef.trim();
        if (bugRef && bugRef !== 'NA' && bugRef.toLowerCase() !== 'na') {
            if (bugRef.startsWith('http://') || bugRef.startsWith('https://')) {
                if (bugRef.length > TEXT_FIELD_LIMITS.DEFECT_URL_MAX) {
                    throw new BadRequestError(
                        `Defect ID / Zoho Ticket URL must not exceed ${TEXT_FIELD_LIMITS.DEFECT_URL_MAX} characters.`,
                    );
                }
            }
        }
    }

    if (e.testId !== undefined && e.testId !== null) {
        const tid = e.testId.trim();
        if (tid && (tid.length > TEXT_FIELD_LIMITS.TEST_ID_MAX || !TEST_ID_REGEX.test(tid))) {
            throw new BadRequestError(
                `Test ID must be a valid identifier up to ${TEXT_FIELD_LIMITS.TEST_ID_MAX} characters.`,
            );
        }
    }
}

export function validateTimingPair(
    start?: string,
    end?: string,
    startLabel: string = 'Time Question Asked',
    endLabel: string = 'Time Answer Received',
    defaultDate?: string,
): void {
    if (!start || !end) return;
    const sMs = parseToMs(start, defaultDate);
    const eMs = parseToMs(end, defaultDate);
    if (sMs === null || eMs === null) return;

    if (eMs < sMs) {
        const isTimeOnly = (!start.includes('-') && !start.includes('/')) &&
                           (!end.includes('-') && !end.includes('/'));
        if (isTimeOnly) {
            const rolloverDiff = (eMs + 24 * 3600 * 1000) - sMs;
            if (rolloverDiff > 0 && rolloverDiff < 14 * 3600 * 1000) {
                return;
            }
        }
        throw new BadRequestError(`${endLabel} cannot be earlier than ${startLabel}`);
    }
}

export const TIMING_PAIRS: { startKey: keyof TesterLogEntry; endKey: keyof TesterLogEntry; startLabel: string; endLabel: string }[] = [
    { startKey: 'timeQuestionAsked', endKey: 'timeAnswerReceived', startLabel: 'Time Question Asked', endLabel: 'Time Answer Received' },
    { startKey: 'waTimeQuestionAsked', endKey: 'waTimeAnswerReceived', startLabel: 'WhatsApp Time Asked', endLabel: 'WhatsApp Time Received' },
    { startKey: 'authorAssignmentTime', endKey: 'authorCompletionTime', startLabel: 'Author Assignment Time', endLabel: 'Author Completion Time' },
    { startKey: 'reviewer1AssignmentTime', endKey: 'reviewer1CompletionTime', startLabel: 'Reviewer 1 Assignment Time', endLabel: 'Reviewer 1 Completion Time' },
    { startKey: 'reviewer2AssignmentTime', endKey: 'reviewer2CompletionTime', startLabel: 'Reviewer 2 Assignment Time', endLabel: 'Reviewer 2 Completion Time' },
    { startKey: 'reviewer3AssignmentTime', endKey: 'reviewer3CompletionTime', startLabel: 'Reviewer 3 Assignment Time', endLabel: 'Reviewer 3 Completion Time' },
    { startKey: 'reviewer4AssignmentTime', endKey: 'reviewer4CompletionTime', startLabel: 'Reviewer 4 Assignment Time', endLabel: 'Reviewer 4 Completion Time' },
    { startKey: 'reviewer5AssignmentTime', endKey: 'reviewer5CompletionTime', startLabel: 'Reviewer 5 Assignment Time', endLabel: 'Reviewer 5 Completion Time' },
    { startKey: 'moderatorAssignmentTime', endKey: 'moderatorCompletionTime', startLabel: 'Moderator Assignment Time', endLabel: 'Moderator Completion Time' },
];

export const TIMING_FIELDS: { key: keyof TesterLogEntry; label: string }[] = [
    { key: 'timeQuestionAsked', label: 'Time Question Asked' },
    { key: 'timeAnswerReceived', label: 'Time Answer Received' },
    { key: 'waTimeQuestionAsked', label: 'WhatsApp Time Asked' },
    { key: 'waTimeAnswerReceived', label: 'WhatsApp Time Received' },
    { key: 'authorAssignmentTime', label: 'Author Assignment Time' },
    { key: 'authorCompletionTime', label: 'Author Completion Time' },
    { key: 'reviewer1AssignmentTime', label: 'Reviewer 1 Assignment Time' },
    { key: 'reviewer1CompletionTime', label: 'Reviewer 1 Completion Time' },
    { key: 'reviewer2AssignmentTime', label: 'Reviewer 2 Assignment Time' },
    { key: 'reviewer2CompletionTime', label: 'Reviewer 2 Completion Time' },
    { key: 'reviewer3AssignmentTime', label: 'Reviewer 3 Assignment Time' },
    { key: 'reviewer3CompletionTime', label: 'Reviewer 3 Completion Time' },
    { key: 'reviewer4AssignmentTime', label: 'Reviewer 4 Assignment Time' },
    { key: 'reviewer4CompletionTime', label: 'Reviewer 4 Completion Time' },
    { key: 'reviewer5AssignmentTime', label: 'Reviewer 5 Assignment Time' },
    { key: 'reviewer5CompletionTime', label: 'Reviewer 5 Completion Time' },
    { key: 'moderatorAssignmentTime', label: 'Moderator Assignment Time' },
    { key: 'moderatorCompletionTime', label: 'Moderator Completion Time' },
];

export function isMidnightRollover(start?: string, end?: string): boolean {
    if (!start || !end) return false;
    const isTimeOnly = (!start.includes('-') && !start.includes('/')) &&
                       (!end.includes('-') && !end.includes('/'));
    if (!isTimeOnly) return false;
    const sMs = parseToMs(start);
    const eMs = parseToMs(end);
    if (sMs === null || eMs === null || eMs >= sMs) return false;
    const rolloverDiff = (eMs + 24 * 3600 * 1000) - sMs;
    return rolloverDiff > 0 && rolloverDiff < 14 * 3600 * 1000;
}

export function validateTimingPairWithFuture(
    start?: string,
    end?: string,
    startLabel: string = 'Time Question Asked',
    endLabel: string = 'Time Answer Received',
    defaultDate?: string,
    nowMs: number = Date.now(),
): void {
    const isRollover = isMidnightRollover(start, end);

    if (start && end && !isRollover) {
        validateTimingPair(start, end, startLabel, endLabel, defaultDate);
    }

    if (start && !isRollover) {
        validateNotFuture(start, startLabel, defaultDate, nowMs);
    }

    if (end) {
        validateNotFuture(end, endLabel, defaultDate, nowMs);
    }
}

export function validateAllTimingPairs(e: Partial<TesterLogEntry>, testDate?: string, nowMs: number = Date.now()): void {
    for (const pair of TIMING_PAIRS) {
        validateTimingPairWithFuture(
            e[pair.startKey] as string | undefined,
            e[pair.endKey] as string | undefined,
            pair.startLabel,
            pair.endLabel,
            testDate,
            nowMs,
        );
    }
}

export function validateSlaStatus(e: Partial<TesterLogEntry>, testDate?: string): void {
    if (e.timeQuestionAsked && e.timeAnswerReceived && e.slaStatus) {
        const sMs = parseToMs(e.timeQuestionAsked, testDate);
        const eMs = parseToMs(e.timeAnswerReceived, testDate);
        if (sMs !== null && eMs !== null) {
            let diffMs = eMs - sMs;
            if (diffMs < 0 && isMidnightRollover(e.timeQuestionAsked, e.timeAnswerReceived)) {
                diffMs += 24 * 3600 * 1000;
            }
            if (diffMs >= 0) {
                const diffMins = diffMs / (1000 * 60);
                if (diffMins > 120 && e.slaStatus !== 'SLA Breached') {
                    throw new BadRequestError("Response time exceeds 120 minutes; SLA Status must be 'SLA Breached'");
                }
                if (diffMins <= 120 && e.slaStatus === 'SLA Breached') {
                    throw new BadRequestError("Response time is within 120 minutes; SLA Status cannot be 'SLA Breached'");
                }
            }
        }
    }
    if (e.waTimeQuestionAsked && e.waTimeAnswerReceived && e.waSlaStatus) {
        const sMs = parseToMs(e.waTimeQuestionAsked, testDate);
        const eMs = parseToMs(e.waTimeAnswerReceived, testDate);
        if (sMs !== null && eMs !== null) {
            let diffMs = eMs - sMs;
            if (diffMs < 0 && isMidnightRollover(e.waTimeQuestionAsked, e.waTimeAnswerReceived)) {
                diffMs += 24 * 3600 * 1000;
            }
            if (diffMs >= 0) {
                const diffMins = diffMs / (1000 * 60);
                if (diffMins > 120 && e.waSlaStatus !== 'SLA Breached') {
                    throw new BadRequestError("WhatsApp response time exceeds 120 minutes; SLA Status must be 'SLA Breached'");
                }
                if (diffMins <= 120 && e.waSlaStatus === 'SLA Breached') {
                    throw new BadRequestError("WhatsApp response time is within 120 minutes; SLA Status cannot be 'SLA Breached'");
                }
            }
        }
    }
}

// The [Auto] duration fields - computed here from their start/end pair
// (create and admin edit). The TAT fields are never taken from a request body.
//
// The two response times keep an already-supplied value when their
// timestamps can't produce one (e.g. an entry saved without both times), so
// a submission's value - or, on an admin edit, the stored one - isn't wiped.
// waResponseTimeMins is the WhatsApp half of a cross-platform ("Both") test.
function computeDurations(e: Partial<TesterLogEntry>, testDate: string): Partial<TesterLogEntry> {
    return {
        responseTimeMins: computeHmsDiff(e.timeQuestionAsked, e.timeAnswerReceived, testDate) || e.responseTimeMins || '',
        waResponseTimeMins: computeHmsDiff(e.waTimeQuestionAsked, e.waTimeAnswerReceived, testDate) || e.waResponseTimeMins || '',
        authorTatMins: computeHmsDiff(e.authorAssignmentTime, e.authorCompletionTime, testDate),
        review1TatMins: computeHmsDiff(e.reviewer1AssignmentTime, e.reviewer1CompletionTime, testDate),
        review2TatMins: computeHmsDiff(e.reviewer2AssignmentTime, e.reviewer2CompletionTime, testDate),
        review3TatMins: computeHmsDiff(e.reviewer3AssignmentTime, e.reviewer3CompletionTime, testDate),
        review4TatMins: computeHmsDiff(e.reviewer4AssignmentTime, e.reviewer4CompletionTime, testDate),
        review5TatMins: computeHmsDiff(e.reviewer5AssignmentTime, e.reviewer5CompletionTime, testDate),
        moderatorTatMins: computeHmsDiff(e.moderatorAssignmentTime, e.moderatorCompletionTime, testDate),
    };
}

// The cross-platform ("Both") fields - not Sheet columns, so absent from
// EXPORT_COLUMNS, but still form-entered and so editable.
const CROSS_PLATFORM_FIELDS: (keyof TesterLogEntry)[] = [
    'webThreadId',
    'waThreadId',
    'waTimeQuestionAsked',
    'waTimeAnswerReceived',
    'waResponseTimeMins',
    'waSlaStatus',
    'waVoiceInputWorking',
    'waVoiceOutputWorking',
    'waVoiceInputQuality',
    'waVoiceOutputQuality',
    'waVoiceIssueDescription',
    'waNotificationReceived',
    'webOverallTestStatus',
    'waOverallTestStatus',
    'crossPlatformDiscrepancyNotes',
];

// Fields an admin edit may change: every form-entered field, i.e. the
// export columns plus the cross-platform fields, minus the record's identity
// (_id - not exported, but excluded here regardless - and testerName) and
// the computed durations. testId is tester-entered, so it stays editable. Anything else in the request
// body is ignored, so an edit can never rewrite who submitted an entry or when.
const DERIVED_FIELDS = new Set(Object.keys(computeDurations({}, '')));
const EDITABLE_FIELDS: (keyof TesterLogEntry)[] = [...EXPORT_COLUMNS.map((c) => c.key), ...CROSS_PLATFORM_FIELDS]
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

/**
 * Auto-increments a Test ID string while preserving its prefix and zero-padding.
 * Examples:
 *   "TL-0005" => "TL-0006"
 *   "TL-005" => "TL-006"
 *   "TL_1-6513" => "TL_1-6514"
 *   "TL-999" => "TL-1000"
 *   "123" => "124"
 */
export function incrementTestId(lastId?: string | null): string {
    if (!lastId || typeof lastId !== 'string') {
        return 'TL-0001';
    }
    const trimmed = lastId.trim();
    const match = trimmed.match(/^(.*?)(\d+)$/);
    if (!match) {
        return `${trimmed}-0001`;
    }
    const prefix = match[1];
    const digitsStr = match[2];
    const currentNum = parseInt(digitsStr, 10);
    const nextNum = currentNum + 1;
    const nextDigits = String(nextNum).padStart(digitsStr.length, '0');
    return `${prefix}${nextDigits}`;
}

@injectable()
export class TesterLogService implements ITesterLogService {
    private indexesEnsured = false;

    constructor(
        @inject(DATABASE_TOKEN)
        private readonly db: DatabaseProvider,
    ) {}

    private async ensureIndexes(): Promise<void> {
        if (this.indexesEnsured) return;
        try {
            const collection = await this.db.getCollection(COLLECTION);
            if (collection && typeof collection.createIndex === 'function') {
                await Promise.all([
                    collection.createIndex({ createdAt: -1 }),
                    collection.createIndex({ submittedByUserId: 1, createdAt: -1 }),
                    collection.createIndex({ testDate: -1, createdAt: -1 }),
                    collection.createIndex({ testId: 1 }),
                    collection.createIndex({ submittedByUserId: 1, testDate: -1 }),
                    collection.createIndex({ overallTestStatus: 1, testDate: -1 }),
                ]);
            }
            const auditCollection = await this.db.getCollection(AUDIT_COLLECTION);
            if (auditCollection && typeof auditCollection.createIndex === 'function') {
                await auditCollection.createIndex({ entryId: 1, createdAt: -1 });
            }
            this.indexesEnsured = true;
        } catch (err) {
            console.error('[TesterLogService] Error creating MongoDB indexes:', err);
        }
    }

    private async ensureCounterInitialized(): Promise<void> {
        try {
            const counters = await this.db.getCollection(COUNTER_COLLECTION);
            const existing = await counters.findOne({ _id: TEST_CASE_COUNTER_ID });
            if (existing) return;

            // Determine starting seq from existing entries in tester_test_cases
            let startSeq = 0;
            let prefix = 'TL-';
            let padLen = 4;

            try {
                const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
                const docs = await collection
                    .find({ testId: { $exists: true, $nin: [null, ''] } })
                    .sort({ createdAt: -1, _id: -1 })
                    .limit(100)
                    .toArray();

                for (const doc of docs) {
                    const rawId = doc.testId?.trim();
                    if (!rawId) continue;
                    const match = rawId.match(/^(.*?)(\d+)$/);
                    if (match) {
                        const num = parseInt(match[2], 10);
                        if (num > startSeq) {
                            startSeq = num;
                            prefix = match[1];
                            padLen = match[2].length;
                        }
                    }
                }
            } catch (err) {
                console.error('[TesterLogService] Error scanning existing testIds for counter init:', err);
            }

            try {
                await counters.insertOne({
                    _id: TEST_CASE_COUNTER_ID,
                    seq: startSeq,
                    prefix,
                    padLen,
                    updatedAt: new Date(),
                });
            } catch (err: any) {
                // If another concurrent request inserted it first (E11000 duplicate key), ignore safely
                if (err?.code !== 11000 && !err?.message?.includes('duplicate key')) {
                    console.error('[TesterLogService] Error inserting counter doc:', err);
                }
            }
        } catch (err) {
            console.error('[TesterLogService] Error ensuring counter initialized:', err);
        }
    }

    async allocateNextTestId(): Promise<string> {
        await this.ensureCounterInitialized();
        try {
            const counters = await this.db.getCollection(COUNTER_COLLECTION);
            const res = await counters.findOneAndUpdate(
                { _id: TEST_CASE_COUNTER_ID },
                { $inc: { seq: 1 }, $setOnInsert: { prefix: 'TL-', padLen: 4 } },
                { upsert: true, returnDocument: 'after' },
            );
            const doc = (res && typeof res === 'object' && 'value' in res) ? res.value : res;
            if (doc && typeof doc.seq === 'number') {
                const prefix = doc.prefix ?? 'TL-';
                const padLen = doc.padLen ?? 4;
                return `${prefix}${String(doc.seq).padStart(padLen, '0')}`;
            }
        } catch (err) {
            console.error('[TesterLogService] Error allocating next testId via atomic counter:', err);
        }

        const lastId = await this.getLastTestId();
        return incrementTestId(lastId);
    }

    async getLastTestId(): Promise<string | null> {
        try {
            const counters = await this.db.getCollection(COUNTER_COLLECTION);
            const counterDoc = await counters.findOne({ _id: TEST_CASE_COUNTER_ID });
            if (counterDoc && typeof counterDoc.seq === 'number' && counterDoc.seq > 0) {
                const prefix = counterDoc.prefix ?? 'TL-';
                const padLen = counterDoc.padLen ?? 4;
                return `${prefix}${String(counterDoc.seq).padStart(padLen, '0')}`;
            }
        } catch (err) {
            console.error('[TesterLogService] Error fetching counter doc:', err);
        }

        try {
            const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
            const latestDocs = await collection
                .find({ testId: { $exists: true, $nin: [null, ''] } })
                .sort({ createdAt: -1, _id: -1 })
                .limit(1)
                .toArray();

            if (latestDocs && latestDocs.length > 0 && latestDocs[0].testId?.trim()) {
                return latestDocs[0].testId.trim();
            }
        } catch (err) {
            console.error('[TesterLogService] Error fetching latest testId from DB:', err);
        }

        return null;
    }

    async getNextTestId(): Promise<string> {
        await this.ensureCounterInitialized();
        try {
            const counters = await this.db.getCollection(COUNTER_COLLECTION);
            const counterDoc = await counters.findOne({ _id: TEST_CASE_COUNTER_ID });
            if (counterDoc && typeof counterDoc.seq === 'number') {
                const nextSeq = counterDoc.seq + 1;
                const prefix = counterDoc.prefix ?? 'TL-';
                const padLen = counterDoc.padLen ?? 4;
                return `${prefix}${String(nextSeq).padStart(padLen, '0')}`;
            }
        } catch (err) {
            console.error('[TesterLogService] Error getting next testId from counter:', err);
        }

        const lastId = await this.getLastTestId();
        return incrementTestId(lastId);
    }

    async createEntry(
        userId: string,
        email: string,
        testerName: string,
        body: Omit<TesterLogEntry, '_id' | 'submittedByUserId' | 'submittedByEmail' | 'testerName' | 'createdAt' | 'updatedAt' | 'testDate'> & { testDate?: string },
    ): Promise<CreateTesterLogEntryResponse> {
        const now = new Date();
        const todayIST = getTodayIST(now);

        // Validate client testDate format/future if provided, but server enforces todayIST for new submissions
        if (body.testDate?.trim()) {
            validateTestDateNotFuture(body.testDate, now);
        }
        const testDate = todayIST;

        // Reject inverted or future timestamps
        validateAllTimingPairs(body, testDate, now.getTime());

        // Reject contradictory SLA statuses
        validateSlaStatus(body, testDate);

        // Validate translation quality to error type mapping
        validateTranslationMapping(body.translationQuality, body.translationErrorType);

        // Validate text fields for format and length limits
        validateTextFields(body);

        let testId = body.testId?.trim();
        if (!testId) {
            testId = await this.allocateNextTestId();
        } else {
            // If an explicit testId was provided, synchronize counter sequence if higher
            const match = testId.match(/^(.*?)(\d+)$/);
            if (match) {
                const num = parseInt(match[2], 10);
                try {
                    const counters = await this.db.getCollection(COUNTER_COLLECTION);
                    await counters.updateOne(
                        { _id: TEST_CASE_COUNTER_ID, seq: { $lt: num } },
                        { $set: { seq: num, prefix: match[1], padLen: match[2].length } },
                    );
                } catch {
                    // best effort
                }
            }
        }

        const entry: TesterLogEntry = {
            ...body,
            testId,
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

        // Only validate testDate if it was modified
        if (changes.testDate !== undefined) {
            validateTestDateNotFuture(changes.testDate);
        }

        const nowMs = Date.now();
        // Only validate timing pairs where at least one field of the pair was modified
        for (const pair of TIMING_PAIRS) {
            if (changes[pair.startKey] !== undefined || changes[pair.endKey] !== undefined) {
                validateTimingPairWithFuture(
                    merged[pair.startKey] as string | undefined,
                    merged[pair.endKey] as string | undefined,
                    pair.startLabel,
                    pair.endLabel,
                    merged.testDate,
                    nowMs,
                );
            }
        }

        // Only validate translation mapping if quality or error type was modified
        if (changes.translationQuality !== undefined || changes.translationErrorType !== undefined) {
            validateTranslationMapping(merged.translationQuality, merged.translationErrorType);
        }

        // Validate modified text fields for format and length limits
        validateTextFields(changes);

        // Validate SLA status if SLA or timing fields were modified
        if (
            changes.slaStatus !== undefined ||
            changes.timeQuestionAsked !== undefined ||
            changes.timeAnswerReceived !== undefined ||
            changes.waSlaStatus !== undefined ||
            changes.waTimeQuestionAsked !== undefined ||
            changes.waTimeAnswerReceived !== undefined
        ) {
            validateSlaStatus(merged, merged.testDate);
        }

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
        search?: string,
        status?: string,
    ): Promise<PaginatedTesterLogEntries> {
        await this.ensureIndexes();
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter = this.buildEntryFilter(
            userId,
            startDate,
            endDate,
            dateField,
            undefined,
            undefined,
            undefined,
            undefined,
            search,
            status,
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

    // Shared by getMyEntries/getAllEntries/getSummary/exportEntries - equality match on
    // each of the 4 dropdown-backed fields plus date filtering, free-text search, and status.
    private buildEntryFilter(
        testerId?: string,
        startDate?: string,
        endDate?: string,
        dateField?: string,
        typeOfQuestion?: string,
        channelTested?: string,
        overallTestStatus?: string,
        defectSeverity?: string,
        search?: string,
        status?: string,
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

        const extraConditions: any[] = [];
        if (status && status !== 'all') {
            const s = status.trim().toLowerCase();
            if (s === 'pass') {
                extraConditions.push({
                    $or: [
                        { overallTestStatus: { $regex: /^pass$/i } },
                        { overallTestStatus: { $regex: /^expected output$/i } },
                    ],
                });
            } else if (s === 'fail') {
                extraConditions.push({
                    $or: [
                        { overallTestStatus: { $regex: /^fail$/i } },
                        { overallTestStatus: { $regex: /anomaly/i } },
                    ],
                });
            } else if (s === 'partial') {
                extraConditions.push({ overallTestStatus: { $regex: /^partial$/i } });
            } else if (s === 'defects') {
                extraConditions.push({
                    $or: [
                        { defectSeverity: { $nin: [null, '', 'NA', 'na', 'nil', 'Nil', 'no defect', 'none', 'None'] } },
                        { defectIdBugRef: { $nin: [null, '', 'NA', 'na', 'nil', 'Nil', 'none', 'None'] } },
                    ],
                });
            }
        }

        if (search && search.trim()) {
            const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const sRegex = new RegExp(escaped, 'i');
            extraConditions.push({
                $or: [
                    { queryText: sRegex },
                    { threadId: sRegex },
                    { webThreadId: sRegex },
                    { waThreadId: sRegex },
                    { testId: sRegex },
                    { typeOfQuestion: sRegex },
                    { defectIdBugRef: sRegex },
                ],
            });
        }

        if (extraConditions.length > 0) {
            filter.$and = extraConditions;
        }

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
        search?: string,
        status?: string,
    ): Promise<PaginatedTesterLogEntries> {
        await this.ensureIndexes();
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const filter = this.buildEntryFilter(
            testerId,
            startDate,
            endDate,
            dateField,
            typeOfQuestion,
            channelTested,
            overallTestStatus,
            defectSeverity,
            search,
            status,
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
        await this.ensureIndexes();
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
        await this.ensureIndexes();
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
        await this.ensureIndexes();
        const collection = await this.db.getCollection<TesterLogEntry>(COLLECTION);
        const entries = await collection.find({}).sort({ createdAt: -1 }).toArray();

        const rows = entries.map((e: any) => {
            const row: Record<string, string> = {};
            for (const col of EXPORT_COLUMNS) {
                row[col.header] = formatExportValue(col.key, e[col.key], e);
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
        let sciPartiallyCorrect = 0;

        let dbSaved = 0;
        let dbNotSaved = 0;

        let voiceInputWorking = 0;
        let voiceInputIssues = 0;
        let voiceOutputWorking = 0;

        let totalCrossPlatform = 0;
        let matchedAnswers = 0;
        let partialMatches = 0;
        let mismatchedAnswers = 0;

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

            const checkSla = (statusStr?: string) => {
                const s = (statusStr || '').trim().toLowerCase();
                if (s === 'met' || s === 'within sla' || s === 'pass' || s.includes('within')) {
                    slaMet++;
                } else if (s === 'breached' || s === 'fail' || s.includes('breach')) {
                    slaBreached++;
                }
            };

            const chSla = (entry.channelTested || '').trim().toLowerCase();
            const isBothSla = chSla.includes('both') || chSla.includes('cross');
            if (isBothSla) {
                checkSla(entry.slaStatus);
                checkSla(entry.waSlaStatus);
            } else {
                checkSla(entry.slaStatus || entry.waSlaStatus);
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
            } else if (sci === 'partially correct' || sci.includes('partial')) {
                sciPartiallyCorrect++;
            }

            const isSaved = (v: string) => v === 'saved' || v === 'yes';
            const isNotSaved = (v: string) => v === 'not saved' || v === 'no' || v === 'partial save';

            const qSaved = (entry.questionSavedInDb || '').trim().toLowerCase();
            const aSaved = (entry.answerSavedInDb || '').trim().toLowerCase();
            if (isNotSaved(qSaved) || isNotSaved(aSaved)) {
                dbNotSaved++;
            } else if (isSaved(qSaved) || isSaved(aSaved)) {
                dbSaved++;
            }

            const vIn = (entry.voiceInputWorking || '').trim().toLowerCase();
            if (vIn === 'yes') voiceInputWorking++;
            else if (vIn === 'no') voiceInputIssues++;

            const vOut = (entry.voiceOutputWorking || '').trim().toLowerCase();
            if (vOut === 'yes') voiceOutputWorking++;

            const ch = (entry.channelTested || '').trim().toLowerCase();
            const isCross = ch.includes('both') || ch.includes('cross');
            if (isCross) {
                const rawMatch = (entry.whatsappVsWebAnswerMatch || '').trim().toLowerCase();
                const compactMatch = rawMatch.replace(/[^a-z]/g, '');

                const isMatch = compactMatch === 'propermatch' || compactMatch === 'match' || compactMatch === 'yes' || compactMatch === 'y' || compactMatch === 'true' || compactMatch === 'proper';
                const isPartial = compactMatch === 'partialmatch' || compactMatch === 'partial';
                const isMismatch = compactMatch === 'mismatch' || compactMatch === 'no' || compactMatch === 'n' || compactMatch === 'false';

                if (isMatch || isPartial || isMismatch) {
                    totalCrossPlatform++;
                    if (isMatch) {
                        matchedAnswers++;
                    } else if (isPartial) {
                        partialMatches++;
                    } else if (isMismatch) {
                        mismatchedAnswers++;
                    }
                }
            }
        }

        const totalTests = entries.length;
        const passRate = totalTests > 0 ? Math.round(((passed + expectedOutput) / totalTests) * 1000) / 10 : 0;
        const failRate = totalTests > 0 ? Math.round(((failed + anomalyFound) / totalTests) * 1000) / 10 : 0;
        const totalSla = slaMet + slaBreached;
        const slaMetRate = totalSla > 0 ? Math.round((slaMet / totalSla) * 1000) / 10 : 0;
        const avgResponseMinutes = responseTimeCount > 0 ? Math.round((responseTimeSum / responseTimeCount) * 10) / 10 : null;

        const totalSci = sciCorrect + sciIncorrect + sciPartiallyCorrect;
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
        } else if (startDate && !endDate) {
            const start = new Date(startDate.trim().slice(0, 10));
            const now = new Date();
            const todayIST = getTodayIST(now);
            const end = new Date(todayIST);
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
            'Static Dynamic': { total: 0, webApp: 0, whatsApp: 0 },
        };

        for (const entry of entries) {
            const qType = (entry.typeOfQuestion || '').trim().toLowerCase();
            const cat = (entry.questionCategory || '').trim().toLowerCase();
            const compactQType = qType.replace(/[^a-z]/g, '');

            let targetType: string | null = null;
            if (compactQType === 'staticdynamic' || qType.includes('static dynamic')) {
                targetType = 'Static Dynamic';
            } else if (qType === 'unique') {
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
            { questionType: 'Static Dynamic', targetTotal: 0, targetWebApp: 0, targetWhatsApp: 0 },
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

        const rawAchievedTotal = targetRows.reduce((sum, r) => sum + r.achievedTotal, 0);
        const rawAchievedWebApp = targetRows.reduce((sum, r) => sum + r.achievedWebApp, 0);
        const rawAchievedWhatsApp = targetRows.reduce((sum, r) => sum + r.achievedWhatsApp, 0);

        // Target progress is capped per question type:
        // Exceeding one category's quota does not fulfill targets for other categories.
        const cappedAchievedTotal = targetRows.reduce((sum, r) => sum + (r.targetTotal > 0 ? Math.min(r.achievedTotal, r.targetTotal) : 0), 0);
        const cappedAchievedWebApp = targetRows.reduce((sum, r) => sum + (r.targetWebApp > 0 ? Math.min(r.achievedWebApp, r.targetWebApp) : 0), 0);
        const cappedAchievedWhatsApp = targetRows.reduce((sum, r) => sum + (r.targetWhatsApp > 0 ? Math.min(r.achievedWhatsApp, r.targetWhatsApp) : 0), 0);

        const totalTargetTotal = 54 * daysCount;
        const totalTargetWebApp = 27 * daysCount;
        const totalTargetWhatsApp = 27 * daysCount;
        const totalCompletionRate = totalTargetTotal > 0 ? Math.round((cappedAchievedTotal / totalTargetTotal) * 1000) / 10 : 0;

        const targetVsAchieved = {
            daysCount,
            rows: targetRows,
            total: {
                questionType: 'Total',
                targetTotal: totalTargetTotal,
                achievedTotal: cappedAchievedTotal,
                rawAchievedTotal,
                targetWebApp: totalTargetWebApp,
                achievedWebApp: cappedAchievedWebApp,
                rawAchievedWebApp,
                targetWhatsApp: totalTargetWhatsApp,
                achievedWhatsApp: cappedAchievedWhatsApp,
                rawAchievedWhatsApp,
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
                partiallyCorrect: sciPartiallyCorrect,
                totalChecked: totalSci,
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
                partialMatches,
                mismatches: mismatchedAnswers,
                parityRate: totalCrossPlatform > 0 ? Math.round((matchedAnswers / totalCrossPlatform) * 1000) / 10 : 0,
            },
            targetVsAchieved,
        };
    }
}
