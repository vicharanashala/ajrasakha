import { ObjectId } from 'mongodb';

/** Stored document shape in tester_test_cases collection. */
export interface TesterLogEntry {
    _id?: ObjectId | string;
    // Auto-populated
    submittedByUserId: string;
    submittedByEmail: string;
    testerName: string;
    createdAt: Date;
    updatedAt: Date;

    // Section 1: Basic Info
    testDate: string;
    testId?: string;
    typeOfQuestion?: string;
    buildVersion?: string;
    sprintCycle?: string;
    channelTested?: string;
    languageTested?: string;
    threadId?: string;
    queryText?: string;
    questionCategory?: string;

    // Section 2: Timing & SLA
    timeQuestionAsked?: string;
    timeAnswerReceived?: string;
    responseTimeMins?: string;
    slaStatus?: string;

    // Section 3: Question Quality
    questionInReviewModel?: string;
    questionCorrectlyFramed?: string;
    originalLanguage?: string;
    translatedLanguage?: string;
    translationQuality?: string;
    translationErrorType?: string;
    tagging?: string;

    // Section 4: Reviewer Workflow
    allocatedToReviewer?: string;
    authorsName?: string;
    authorAssignmentTime?: string;
    authorCompletionTime?: string;
    authorTatMins?: string;

    reviewer1Name?: string;
    reviewer1AssignmentTime?: string;
    reviewer1CompletionTime?: string;
    review1TatMins?: string;

    reviewer2Name?: string;
    reviewer2AssignmentTime?: string;
    reviewer2CompletionTime?: string;
    review2TatMins?: string;

    reviewer3Name?: string;
    reviewer3AssignmentTime?: string;
    reviewer3CompletionTime?: string;
    review3TatMins?: string;

    reviewer4Name?: string;
    reviewer4AssignmentTime?: string;
    reviewer4CompletionTime?: string;
    review4TatMins?: string;

    reviewer5Name?: string;
    reviewer5AssignmentTime?: string;
    reviewer5CompletionTime?: string;
    review5TatMins?: string;

    moderatorName?: string;
    moderatorAssignmentTime?: string;
    moderatorCompletionTime?: string;
    moderatorTatMins?: string;

    // Section 5: Answer Quality
    followUpQInReviewModel?: string;
    answerScientificallyCorrect?: string;
    expertNameDisplayed?: string;
    correctExpertNameDisplayed?: string;
    correctSourceLinksProvided?: string;

    // Section 6: Notifications & Voice
    msg120MinShownToUser?: string;
    notificationReceived?: string;
    notificationOnSameThread?: string;
    notificationLinkedCorrectQId?: string;
    voiceInputWorking?: string;
    voiceOutputWorking?: string;
    voiceInputQuality?: string;
    voiceOutputQuality?: string;
    voiceIssueDescription?: string;

    // Section 7: Domain Checks
    weatherQAnsweredCorrectly?: string;
    mandiPriceQCorrect?: string;
    schemeQCorrect?: string;
    questionSavedInDb?: string;
    answerSavedInDb?: string;
    qIdConsistentAcrossSystems?: string;
    whatsappVsWebAnswerMatch?: string;

    // Section 8: Defects & Remarks
    overallTestStatus?: string;
    defectSeverity?: string;
    defectIdBugRef?: string;
    reviewerRemarks?: string;
    testerRemarks?: string;
    status?: string;

    // Cross-Platform Dual-Channel Fields (Used when channelTested === 'Both')
    webThreadId?: string;
    waThreadId?: string;
    waTimeQuestionAsked?: string;
    waTimeAnswerReceived?: string;
    waResponseTimeMins?: string;
    waSlaStatus?: string;
    waVoiceInputWorking?: string;
    waVoiceOutputWorking?: string;
    waVoiceInputQuality?: string;
    waVoiceOutputQuality?: string;
    waVoiceIssueDescription?: string;
    waNotificationReceived?: string;
    webOverallTestStatus?: string;
    waOverallTestStatus?: string;
    crossPlatformDiscrepancyNotes?: string;
}

export interface PaginatedTesterLogEntries {
    success: boolean;
    entries: TesterLogEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface CreateTesterLogEntryResponse {
    success: boolean;
    entry: TesterLogEntry;
}

// The admin making an edit/delete, recorded on the audit log row.
export interface TesterLogActor {
    userId: string;
    email: string;
    name: string;
}

// One row of the tester_test_cases_audit collection. A delete keeps the full
// document in `before`, so a deleted entry can be restored from here.
export interface TesterLogAuditRecord {
    entryId: string;
    action: 'update' | 'delete';
    actor: TesterLogActor;
    before: TesterLogEntry;
    after?: TesterLogEntry;
    createdAt: Date;
}

// One dropdown option for the admin Tester filter - every distinct submittedByUserId
// with at least one entry, labeled with that tester's most recently used testerName.
export interface TesterOption {
    id: string;
    name: string;
}

export interface TesterLogSummary {
    // Every entry by this tester (or, with none selected, the whole collection), regardless
    // of any filter - a stable "how many has this tester ever logged" baseline.
    totalEntries: number;
    // Entries matching the full current filter set - the same count the table below paginates over.
    entriesInRange: number;
    // Pass ÷ (entries with Overall Test Status recorded), as a percentage. Ignores any Overall
    // Test Status filter itself (else filtering to "Fail" would always show 0% pass rate).
    // Null when no entry in scope has a status recorded.
    passRate: number | null;
    passCount: number;
    statusRecordedCount: number;
}

export interface TesterLogExportResult {
    buffer: Buffer;
    contentType: string;
    filename: string;
}

// The 6 question-type categories the Summary tab's targets are defined over. Target numbers
// come from the business's "End to End Testing Pipeline" sheet - see
// services/adminSummaryTargets.ts's QUESTION_TYPE_TARGETS.
export type QuestionTypeKey = 'unique' | 'gdb' | 'outreach' | 'weather' | 'scheme' | 'mandi';

export interface ChannelCountSummary {
    target: number;
    actual: number;
    achievementPct: number;
}

export interface QuestionTypeCountRow {
    // 'total' appears once, as the summed row across all 6 categories.
    key: QuestionTypeKey | 'total';
    label: string;
    target: number;
    actual: number;
    achievementPct: number;
    // This category's own Web App / WhatsApp split (the Excel's per-type
    // channel targets); on the Total row, the sums across categories.
    webApp: ChannelCountSummary;
    whatsApp: ChannelCountSummary;
}

// One tester's daily targets, straight from the Admin Summary target model.
export interface AdminSummaryDailyTargets {
    workingMinutes: number;
    total: number;
    webApp: number;
    whatsApp: number;
}

// What adminSummaryTargets.summarizeEntries produces for a set of entries.
export interface AdminSummaryCounts {
    overall: ChannelCountSummary;
    webApp: ChannelCountSummary;
    whatsApp: ChannelCountSummary;
    byType: QuestionTypeCountRow[];
    counts: Record<QuestionTypeKey, number>;
    // Entries in scope whose typeOfQuestion maps to none of the 6
    // categories (e.g. a bare historical "Dynamic", or blank).
    uncategorizedCount: number;
}

// One row of the Summary tab's per-tester table (All Testers view only).
export interface TesterQuestionTypeRow {
    testerId: string;
    testerName: string;
    // Distinct testDate values this tester logged at least one entry against, within the
    // current date filter - informational only (attendance); targets scale by workingDays
    // (see TesterQuestionTypeSummaryResult), not this figure.
    daysWorked: number;
    counts: Record<QuestionTypeKey, number>;
    target: number;
    actual: number;
    achievementPct: number;
}

export interface TesterQuestionTypeSummaryResult {
    // Working days in the filter range (calendar days × 6/7, rounded - testers work 6 days a
    // week with their own weekly day off). The SAME figure every tester's (and every
    // per-type/per-channel) target scales by, regardless of whether that tester logged
    // anything. See services/adminSummaryTargets.ts's workingDaysFor.
    workingDays: number;
    // The date window the targets were computed over. Equals the requested range when both
    // ends are given; a missing end is filled from the whole team's earliest/latest testDate
    // (never the selected tester's own), so All Time scores a tester the same way whether
    // they are viewed alone or in the All Testers table. Null when nothing can be derived.
    rangeStart: string | null;
    rangeEnd: string | null;
    // Testers the targets are multiplied by: 1 for a single tester, else the byTester rows.
    headcount: number;
    dailyTargetsPerTester: AdminSummaryDailyTargets;
    overall: {
        target: number;
        actual: number;
        achievementPct: number;
    };
    webApp: ChannelCountSummary;
    whatsApp: ChannelCountSummary;
    // The 6 categories plus a trailing Total row (7 entries).
    byType: QuestionTypeCountRow[];
    // Entries in scope not counted in any category - see AdminSummaryCounts.
    uncategorizedCount: number;
    // Present only when no single tester is selected (All Testers).
    byTester?: TesterQuestionTypeRow[];
}

export interface TesterLogSummaryResponse {
    success: boolean;
    totalTests: number;
    passed: number;
    failed: number;
    partial: number;
    expectedOutput: number;
    anomalyFound: number;
    otherStatus: number;
    passRate: number;
    failRate: number;
    slaMet: number;
    slaBreached: number;
    slaMetRate: number;
    avgResponseMinutes: number | null;
    totalDefects: number;
    defectsBySeverity: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    byQuestionType: Record<string, number>;
    byChannel: Record<string, number>;
    byLanguage: Record<string, number>;
    dailyStats: Array<{
        date: string;
        total: number;
        passed: number;
        failed: number;
    }>;
    scientificAccuracy: {
        correct: number;
        incorrect: number;
        rate: number;
    };
    dbPersistence: {
        saved: number;
        notSaved: number;
        rate: number;
    };
    voiceStats: {
        inputWorking: number;
        inputIssues: number;
        outputWorking: number;
    };
    crossPlatformStats?: {
        totalCrossPlatform: number;
        matchedAnswers: number;
        parityRate: number;
    };
    targetVsAchieved: TargetVsAchievedSummary;
}

export interface TargetAchievedRow {
    questionType: string;
    targetTotal: number;
    achievedTotal: number;
    targetWebApp: number;
    achievedWebApp: number;
    targetWhatsApp: number;
    achievedWhatsApp: number;
    completionRate: number;
}

export interface TargetVsAchievedSummary {
    daysCount: number;
    rows: TargetAchievedRow[];
    total: TargetAchievedRow;
}

export interface ITesterLogService {
    createEntry(
        userId: string,
        email: string,
        testerName: string,
        body: Omit<TesterLogEntry, '_id' | 'submittedByUserId' | 'submittedByEmail' | 'testerName' | 'createdAt' | 'updatedAt' | 'testDate'> & { testDate?: string },
    ): Promise<CreateTesterLogEntryResponse>;

    // Computes the next auto-incremented Test ID based on the last recorded test case.
    getNextTestId(): Promise<string>;

    // Atomically increments and allocates the next unique Test ID.
    allocateNextTestId(): Promise<string>;

    // Admin edit. Only the form's own input fields are applied - record
    // bookkeeping (_id, submittedBy*, testerName, createdAt) is never
    // touched, and the [Auto] duration fields are recomputed. Returns null
    // when no entry has this id.
    updateEntry(
        id: string,
        body: Partial<TesterLogEntry>,
        actor: TesterLogActor,
    ): Promise<CreateTesterLogEntryResponse | null>;

    // Admin delete. Snapshots the entry to the audit collection before
    // removing it. Returns false when no entry has this id.
    deleteEntry(id: string, actor: TesterLogActor): Promise<boolean>;

    getMyEntries(
        userId: string,
        page: number,
        limit: number,
        startDate?: string,
        endDate?: string,
        dateField?: string,
    ): Promise<PaginatedTesterLogEntries>;

    getAllEntries(
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
    ): Promise<PaginatedTesterLogEntries>;

    getTesterOptions(): Promise<TesterOption[]>;

    getSummary(
        testerId?: string,
        startDate?: string,
        endDate?: string,
        dateField?: string,
        typeOfQuestion?: string,
        channelTested?: string,
        overallTestStatus?: string,
        defectSeverity?: string,
    ): Promise<TesterLogSummary>;

    // Excel is the only export format. Takes no filter params - always every row, regardless
    // of the review table's current on-screen filters.
    exportEntries(): Promise<TesterLogExportResult>;

    getQuestionTypeSummary(
        testerId?: string,
        startDate?: string,
        endDate?: string,
    ): Promise<TesterQuestionTypeSummaryResult>;

    getMySummary(
        userId: string,
        startDate?: string,
        endDate?: string,
        dateField?: string,
    ): Promise<TesterLogSummaryResponse>;
}

