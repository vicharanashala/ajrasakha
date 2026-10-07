import type { TesterLogEntry } from './ITesterLogService.js';
import type { DbFilterOptions } from '../services/dbFilterOptions.js';
import type { GetTestersDbAnalyticsQuery } from '../validators/TestersDbAnalyticsValidators.js';
import type { DbAnalyticsSummaryResponse } from '../dbAnalytics/types.js';

// The stored tester_test_cases fields Database Logs Analytics reads - the
// inputs to the existing metrics plus the per-platform (WebApp/WhatsApp)
// fields needed to split cross-platform ("Both") entries. Free text and
// personal details (query text, thread IDs, email, author/reviewer/
// moderator names, raw assignment/completion timestamps, remark/
// discrepancy notes) are not returned.
export const DB_ANALYTICS_ENTRY_FIELDS = [
    // Identity and dates
    '_id', 'testId', 'testDate', 'createdAt', 'updatedAt', 'submittedByUserId', 'testerName',
    // Section 1: Basic Info
    'typeOfQuestion', 'buildVersion', 'channelTested', 'languageTested', 'questionCategory',
    // Section 2: Timing & SLA
    'responseTimeMins', 'slaStatus',
    // Section 3: Question Quality
    'questionInReviewModel', 'questionCorrectlyFramed', 'originalLanguage', 'translatedLanguage',
    'translationQuality', 'translationErrorType', 'tagging', 'retrievalAccuracy',
    // Section 4: Reviewer Workflow (durations only)
    'allocatedToReviewer', 'authorTatMins', 'review1TatMins', 'review2TatMins', 'review3TatMins',
    'review4TatMins', 'review5TatMins', 'moderatorTatMins',
    // Section 5: Answer Quality
    'followUpQInReviewModel', 'answerScientificallyCorrect', 'expertNameDisplayed',
    'correctExpertNameDisplayed', 'correctSourceLinksProvided',
    // Section 6: Notifications & Voice
    'msg120MinShownToUser', 'notificationReceived', 'notificationOnSameThread', 'notificationLinkedCorrectQId',
    'voiceInputWorking', 'voiceOutputWorking', 'voiceInputQuality', 'voiceInputIssueDescription',
    'voiceOutputQuality', 'voiceIssueDescription',
    // Section 7: Domain Checks & Parity (incl. legacy DB-save / Q-ID fields)
    'weatherQAnsweredCorrectly', 'mandiPriceQCorrect', 'schemeQCorrect', 'questionSavedInDb',
    'answerSavedInDb', 'qIdConsistentAcrossSystems', 'whatsappVsWebAnswerMatch',
    // Section 8: Defects & Remarks (option fields only)
    'overallTestStatus', 'defectSeverity', 'defectIdBugRef', 'testerRemarks', 'status',
    // Cross-platform ("Both") per-platform fields
    'waResponseTimeMins', 'waSlaStatus', 'waNotificationReceived', 'waVoiceInputWorking',
    'waVoiceOutputWorking', 'waVoiceInputQuality', 'waVoiceInputIssueDescription', 'waVoiceOutputQuality',
    'waVoiceIssueDescription', 'webOverallTestStatus', 'waOverallTestStatus',
] as const satisfies readonly (keyof TesterLogEntry)[];

export type DbAnalyticsEntryField = (typeof DB_ANALYTICS_ENTRY_FIELDS)[number];

// A stored entry as returned to DB Analytics: the raw TesterLogEntry shape
// (same field names and values, never Sheet column names), limited to
// DB_ANALYTICS_ENTRY_FIELDS, with _id as a string.
export type DbAnalyticsEntry = Partial<Pick<TesterLogEntry, Exclude<DbAnalyticsEntryField, '_id'>>> & { _id: string };

export interface TestersDbAnalyticsEntriesResponse {
    success: boolean;
    // Every stored entry, regardless of filters.
    totalRecords: number;
    // Entries matching the requested filters (= entries.length).
    matchedRecords: number;
    entries: DbAnalyticsEntry[];
    // Same options/counts as Step 4's dbFilterOptions - over every stored
    // entry, zero-count options included.
    filterOptions: DbFilterOptions;
    lastSyncedAt: string | null;
    error?: string;
}

export interface ITestersDbAnalyticsService {
    /** Stored entries matching the DB Analytics filters, filtered in MongoDB, plus filter options. */
    getEntries(query: GetTestersDbAnalyticsQuery): Promise<TestersDbAnalyticsEntriesResponse>;
    /** DB-native summary (KPIs, diagnostics, trend, previous period) calculated from stored entries. */
    getSummary(query: GetTestersDbAnalyticsQuery): Promise<DbAnalyticsSummaryResponse>;
}
