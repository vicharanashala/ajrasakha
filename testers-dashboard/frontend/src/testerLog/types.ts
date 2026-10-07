/** Shape of a single tester log entry returned from the API. */
export interface ITesterLogEntry {
    _id?: string;
    submittedByUserId?: string;
    submittedByEmail?: string;
    testerName?: string;
    createdAt?: string;
    updatedAt?: string;

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

    timeQuestionAsked?: string;
    timeAnswerReceived?: string;
    responseTimeMins?: string;
    slaStatus?: string;

    questionInReviewModel?: string;
    questionCorrectlyFramed?: string;
    originalLanguage?: string;
    translatedLanguage?: string;
    translationQuality?: string;
    translationErrorType?: string;
    tagging?: string;
    retrievalAccuracy?: string;

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

    followUpQInReviewModel?: string;
    answerScientificallyCorrect?: string;
    expertNameDisplayed?: string;
    correctExpertNameDisplayed?: string;
    correctSourceLinksProvided?: string;

    msg120MinShownToUser?: string;
    notificationReceived?: string;
    notificationOnSameThread?: string;
    notificationLinkedCorrectQId?: string;
    voiceInputWorking?: string;
    voiceOutputWorking?: string;
    voiceInputIssueDescription?: string;
    voiceInputQuality?: string;
    voiceOutputQuality?: string;
    voiceIssueDescription?: string;

    weatherQAnsweredCorrectly?: string;
    mandiPriceQCorrect?: string;
    schemeQCorrect?: string;
    questionSavedInDb?: string;
    answerSavedInDb?: string;
    qIdConsistentAcrossSystems?: string;
    whatsappVsWebAnswerMatch?: string;

    overallTestStatus?: string;
    defectSeverity?: string;
    defectIdBugRef?: string;
    reviewerRemarks?: string;
    testerRemarks?: string;
    testerRemarksNotes?: string;
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
    waVoiceInputIssueDescription?: string;
    waVoiceInputQuality?: string;
    waVoiceOutputQuality?: string;
    waVoiceIssueDescription?: string;
    waNotificationReceived?: string;
    webOverallTestStatus?: string;
    waOverallTestStatus?: string;
    crossPlatformDiscrepancyNotes?: string;
}

export interface IPaginatedTesterLogEntries {
    success: boolean;
    entries: ITesterLogEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

/** One Tester filter dropdown option - mirrors backend's TesterOption. */
export interface ITesterOption {
    id: string;
    name: string;
}

/** Mirrors backend's TesterLogSummary. */
export interface ITesterLogSummary {
    totalEntries: number;
    entriesInRange: number;
    passRate: number | null;
    passCount: number;
    statusRecordedCount: number;
}

/** Filters shared by the admin review table, summary, and export - mirrors
 * the backend's GetTesterLogQuery fields (minus page/limit). */
export interface ITesterLogAdminFilters {
    testerId?: string;
    startDate?: string;
    endDate?: string;
    dateField?: string;
    typeOfQuestion?: string;
    channelTested?: string;
    overallTestStatus?: string;
    defectSeverity?: string;
    search?: string;
    status?: string;
}

export interface ICreateTesterLogEntryResponse {
    success: boolean;
    entry: ITesterLogEntry;
}

export interface INextTestIdResponse {
    success: boolean;
    nextTestId: string;
}

/** The question-type categories the Summary tab's targets are defined over.
 * Mirrors the backend's QuestionTypeKey - see the backend's
 * services/adminSummaryTargets.ts for the actual numbers (this side has no
 * target table of its own; the API response carries the resolved
 * target/actual/achievement figures). */
export type IQuestionTypeKey = 'unique' | 'gdb' | 'outreach' | 'weather' | 'scheme' | 'mandi';

export interface IChannelCountSummary {
    target: number;
    actual: number;
    achievementPct: number;
}

export interface IQuestionTypeCountRow {
    key: IQuestionTypeKey | 'total';
    label: string;
    target: number;
    actual: number;
    achievementPct: number;
    /** This category's Web App / WhatsApp split; sums on the Total row. */
    webApp: IChannelCountSummary;
    whatsApp: IChannelCountSummary;
}

/** One tester's daily targets from the Admin Summary target model. */
export interface IAdminSummaryDailyTargets {
    workingMinutes: number;
    total: number;
    webApp: number;
    whatsApp: number;
}

export interface ITesterQuestionTypeRow {
    testerId: string;
    testerName: string;
    /** Distinct days this tester actually logged something in range -
     * informational (attendance) only, not what the target scales by. */
    daysWorked: number;
    counts: Record<IQuestionTypeKey, number>;
    target: number;
    actual: number;
    achievementPct: number;
}

export interface ITesterQuestionTypeSummary {
    /** Working days in the filter range (calendar days × 6÷7, rounded) -
     * the same figure every tester's target scales by, whether they
     * logged anything or not. See TesterQuestionTypeSummaryView's card
     * copy for the plain-language rule. */
    workingDays: number;
    /** The window the targets cover - the requested range, with any
     * missing end (All Time) filled from the whole team's first/last
     * test date. Null when there is no data to derive it from. */
    rangeStart: string | null;
    rangeEnd: string | null;
    /** Testers the targets are multiplied by (1 for a single tester). */
    headcount: number;
    dailyTargetsPerTester: IAdminSummaryDailyTargets;
    overall: { target: number; actual: number; achievementPct: number };
    webApp: IChannelCountSummary;
    whatsApp: IChannelCountSummary;
    byType: IQuestionTypeCountRow[];
    /** Entries in range whose question type is none of the 6 categories
     * (e.g. a historical bare "Dynamic") - not counted anywhere. */
    uncategorizedCount: number;
    byTester?: ITesterQuestionTypeRow[];
}

/** Filters for the Summary tab - just Tester and Date, unlike the wider
 * Tester Data review table's filter set. */
export interface ITesterQuestionTypeSummaryFilters {
    testerId?: string;
    startDate?: string;
    endDate?: string;
}

export interface ITesterLogSummaryResponse {
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
    targetVsAchieved?: ITargetVsAchievedSummary;
}

export interface ITargetAchievedRow {
    questionType: string;
    targetTotal: number;
    achievedTotal: number;
    targetWebApp: number;
    achievedWebApp: number;
    targetWhatsApp: number;
    achievedWhatsApp: number;
    completionRate: number;
}

export interface ITargetVsAchievedSummary {
    daysCount: number;
    rows: ITargetAchievedRow[];
    total: ITargetAchievedRow;
}

/** Dropdown option definitions reused by the form */
export const TYPE_OF_QUESTION_OPTIONS = [
    'Unique', 'GDB', 'Outreach',
    'Weather Dynamic', 'Scheme Dynamic', 'Mandi Dynamic',
    'Static Dynamic',
];

/**
 * Returns true if the question type is dynamic (e.g. Dynamic, Weather Dynamic,
 * Scheme Dynamic, Mandi Dynamic, or any market/weather/scheme testing).
 */
export function isDynamicQuestionType(type?: string): boolean {
    if (!type) return false;
    const lower = type.trim().toLowerCase();
    return (
        lower.includes('dynamic') ||
        lower.includes('weather') ||
        lower.includes('scheme') ||
        lower.includes('mandi') ||
        lower.includes('market')
    );
}

/**
 * Returns true if tagging indicates a dynamic question.
 * The logic to exclude Section 4 reviewer workflow moves from Question Type to Tagging.
 */
export function isDynamicTagging(tagging?: string): boolean {
    if (!tagging) return false;
    return tagging.toLowerCase().includes('dynamic');
}

/**
 * Returns true if tagging indicates a duplicate question.
 */
export function isDuplicateTagging(tagging?: string): boolean {
    if (!tagging) return false;
    return tagging.toLowerCase().includes('duplicate');
}

export function isCrossPlatform(channel?: string): boolean {
    if (!channel) return false;
    const lower = channel.trim().toLowerCase();
    return lower === 'both' || lower.includes('cross');
}

/**
 * A cross-platform entry's Overall Test Status, derived from its Web App and
 * WhatsApp statuses: Pass/Fail/NA only when both channels agree, otherwise
 * Partial. Returns undefined until both are set. The form and the admin
 * editor apply it when either status changes; the result stays overridable.
 */
export function synthesizeOverallTestStatus(webStatus?: string, waStatus?: string): string | undefined {
    if (!webStatus || !waStatus) return undefined;
    const w1 = webStatus.toLowerCase();
    const w2 = waStatus.toLowerCase();
    if (w1 === "pass" && w2 === "pass") return "Pass";
    if (w1 === "fail" && w2 === "fail") return "Fail";
    if (w1 === "na" && w2 === "na") return "NA";
    return "Partial";
}

export const CHANNEL_OPTIONS = ['WhatsApp', 'WebApp', 'Both'];

export const QUESTION_CATEGORY_OPTIONS = [
    'Soil Health and Nutrient Management',
    'Irrigation and Water Management',
    'Insect-Pest Management',
    'Disease Management',
    'Seed and Variety Selection',
    'Cultural and Crop Management Practices',
    'Organic and Natural Farming',
    'Weed Management',
    'Climate, Weather & Stress Management',
    'Farm Tools & Mechanisation',
    'Post-Harvest Management & Storage',
    'Market Prices, MSP & Marketing',
    'Agricultural Schemes & Subsidies',
    'Credit, Loan & Insurance',
    'Capacity Building, Extension and Communication',
    'Rural Infrastructure',
    'Animal Husbandry & Livestock',
    'Fisheries & Aquaculture',
    'Allied Agricultural Activities',
];

export const SLA_STATUS_OPTIONS = ['Within SLA', 'SLA Breached', 'Not Applicable'];

export const REVIEW_MODEL_OPTIONS = ['Yes', 'No', 'NA'];

export const QUESTION_FRAMED_OPTIONS = ['Yes', 'No', 'Partially Correct', 'NA'];

export const ALLOCATED_TO_AUTHOR_OPTIONS = ['Yes', 'No', 'NA'];
export const ALLOCATED_TO_REVIEWER_OPTIONS = ALLOCATED_TO_AUTHOR_OPTIONS;

export const FOLLOW_UP_MODEL_OPTIONS = ['Yes', 'No', 'NA'];

export const ANSWER_CORRECT_OPTIONS = ['Correct', 'Incorrect', 'Partially Correct'];

export const EXPERT_DISPLAYED_OPTIONS = ['Displayed', 'Not Displayed', 'Expert Name Mismatch', 'NA'];

export const SOURCE_LINKS_OPTIONS = [
    'Correct link provided',
    'Incorrect Link provided',
    'Link not provided',
    'Link not accessible',
    'NA',
];

export const YES_NO_NA_DUP_OPTIONS = [
    'Yes', 'No', 'NA', 'Successfully identified as Duplicate', 'wrongly identified as duplicate',
];

export const DISCLAIMER_120_OPTIONS = ['Received', 'Not Received', 'NA'];
export const MSG_120_OPTIONS = DISCLAIMER_120_OPTIONS;

export const NOTIFICATION_RECEIVED_OPTIONS = ['Received', 'Not Received', 'NA'];
export const NOTIFICATION_OPTIONS = NOTIFICATION_RECEIVED_OPTIONS;

export const NOTIFICATION_SAME_THREAD_OPTIONS = [
    'Yes - on same thread',
    'No - on Different Thread',
    'Notification not received',
    'NA',
];

export const NOTIFICATION_LINKED_QID_OPTIONS = [
    'Yes',
    'Incorrect Q-ID',
    'Q-ID missing',
    'NA',
];

export const YES_NO_NA_OPTIONS = ['Yes', 'No', 'NA'];

export const YES_NO_PARTIAL_NA_OPTIONS = ['Yes', 'No', 'Partial', 'NA'];

export const DB_SAVE_OPTIONS = ['Saved', 'Not Saved', 'Partial Save', 'NA', 'Duplicate'];

export const QID_CONSISTENT_OPTIONS = [
    'Yes', 'No', 'NA', 'Successfully Identified as duplicate', 'Wrongly Identified as duplicate',
];

export const OVERALL_STATUS_OPTIONS = ['Pass', 'Fail', 'Partial', 'NA'];

export const STATUS_OPTIONS = ['Anomaly Found in Output', 'Expected Output', 'Pending'];

export const TRANSLATION_QUALITY_OPTIONS = ['Good', 'Acceptable', 'Not Acceptable', 'NA'];

export const TRANSLATION_ERROR_TYPE_OPTIONS = [
    'No Error',
    'Intent Error',
    'Word Error',
    'Grammar Error',
    'Partial Translation',
    'NA',
];

export const DEFECT_SEVERITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low', 'NA'];

export const VOICE_ISSUE_OPTIONS = [
    'Speech Not Recognized',
    'Incorrect Transcription',
    'Words Missing',
    'Wrong/Extra Words',
    'Local Language/Dialect Not Recognized',
    'Background Noise',
    'N/A',
];

export const VOICE_INPUT_QUALITY_OPTIONS = ['Correct', 'Incorrect', 'Error Displayed', 'NA'];

export const VOICE_OUTPUT_QUALITY_OPTIONS = ['Clear', 'Unclear', 'Error Displayed', 'NA'];

export const VOICE_QUALITY_OPTIONS = [
    'Clear',
    'Distorted',
    'Low Volume',
    'High Volume',
    'No Output',
    'NA',
];

export const WHATSAPP_VS_WEB_MATCH_OPTIONS = ['Proper Match', 'Partial Match', 'Mismatch', 'NA'];

export const TESTER_REMARKS_OPTIONS = [
    'No Action Required',
    'Minor Modification',
    'Major Modification',
    'Needs Review',
];

export const INDIAN_LANGUAGES_OPTIONS = [
    'English',
    'Assamese',
    'Bengali',
    'Bodo',
    'Dogri',
    'Gujarati',
    'Hindi',
    'Kannada',
    'Kashmiri',
    'Konkani',
    'Maithili',
    'Malayalam',
    'Manipuri',
    'Marathi',
    'Nepali',
    'Odia',
    'Punjabi',
    'Sanskrit',
    'Santali',
    'Sindhi',
    'Tamil',
    'Telugu',
    'Urdu',
    'Others',
];

export const TAGGING_OPTIONS = [
    'Correctly tagged as duplicate',
    'Wrongly tagged as duplicate',
    'Duplicate but not tagged',
    'Queue Duplicate',
    'Correctly tagged as dynamic',
    'Wrongly tagged as dynamic',
    'Dynamic but not tagged',
    'New Question',
    'Correctly tagged as Static Dynamic',
    'Wrongly tagged as Static Dynamic',
    'Static Dynamic but not tagged',
];

export const RETRIEVAL_ACCURACY_OPTIONS = [
    'Correct Retrieval',
    'Incorrect Retrieval',
    'No Retrieval',
];
