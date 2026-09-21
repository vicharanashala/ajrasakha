/** Shape of a single tester log entry returned from the API. */
export interface ITesterLogEntry {
    _id?: string;
    submittedByUserId?: string;
    submittedByEmail?: string;
    testerName?: string;
    createdAt?: string;
    updatedAt?: string;

    testDate: string;
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
    status?: string;
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
}

export interface ICreateTesterLogEntryResponse {
    success: boolean;
    entry: ITesterLogEntry;
}

/** Dropdown option definitions reused by the form */
export const TYPE_OF_QUESTION_OPTIONS = [
    'Unique', 'GDB', 'Dynamic', 'Outreach', 'Static Dynamic',
    'Weather Dynamic', 'Scheme Dynamic', 'Mandi Dynamic',
];

export const CHANNEL_OPTIONS = ['WhatsApp', 'WebApp', 'Both'];

export const QUESTION_CATEGORY_OPTIONS = [
    'Weed Management',
    'Agricultural Schemes and Subsidies',
    'Climate, Weather and Stress Management',
    'Credit, Loan and Insurance',
    'Cultural and Crop management practices',
    'Disease Management',
    'Farm Tools and Mechanisation',
    'Insect-Pest Management',
    'Irrigation and Water Management',
    'Market Prices, MSP and Marketing',
    'Organic and Natural farming',
    'Post-Harvest Management and Storage',
    'Seed and Variety Selection',
    'Soil Health and Nutrient management',
    'Plant Protection',
    'Bio-Fertilizers and Bio-pesticides',
    'Extension and Capacity Building',
    'Live Stock and Animal Husbandry',
    'Horticulture and allied agriculture',
    'Sowing time and weather',
    'Fertiliser use and Availability',
    'Financial and Institutional services',
    'Market Information',
    'Field Preparation',
    'Yield and Plant Population',
    'Agriculture Mechanisation',
    'Wild animal',
    'Soil Testing',
    'Infrastructure and utilities',
];

export const SLA_STATUS_OPTIONS = ['Within SLA', 'SLA Breached', 'Not Applicable'];

export const REVIEW_MODEL_OPTIONS = [
    'Yes', 'No', 'NA', 'Successfully Identified as duplicate', 'Wrongly Identified as duplicate',
];

export const QUESTION_FRAMED_OPTIONS = ['Well Framed', 'Ambiguous', 'Incorrectly Framed', 'NA'];

export const ALLOCATED_TO_REVIEWER_OPTIONS = ['Yes', 'No', 'NA', 'Duplicate'];

export const FOLLOW_UP_MODEL_OPTIONS = [
    'Yes', 'No', 'NA', 'Successfully identified as Duplicate', 'wrongly identified as duplicate',
];

export const ANSWER_CORRECT_OPTIONS = ['Correct', 'Incorrect', 'Partially Correct'];

export const EXPERT_DISPLAYED_OPTIONS = ['Displayed', 'Not Displayed', 'Wrong Expert', 'NA'];

export const YES_NO_NA_DUP_OPTIONS = [
    'Yes', 'No', 'NA', 'Successfully identified as Duplicate', 'wrongly identified as duplicate',
];

export const MSG_120_OPTIONS = ['Yes', 'No', 'NA', 'Duplicate'];

export const NOTIFICATION_OPTIONS = ['Yes', 'No', 'Received on time', 'Received Late', 'Not Received', 'NA'];

export const YES_NO_PARTIAL_NA_OPTIONS = ['Yes', 'No', 'Partial', 'NA'];

export const DB_SAVE_OPTIONS = ['Saved', 'Not Saved', 'Partial Save', 'NA', 'Duplicate'];

export const QID_CONSISTENT_OPTIONS = [
    'Yes', 'No', 'NA', 'Successfully Identified as duplicate', 'Wrongly Identified as duplicate',
];

export const OVERALL_STATUS_OPTIONS = ['Pass', 'Fail', 'NA', 'Partial'];

export const STATUS_OPTIONS = ['Anomaly Found in Output', 'Expected Output', 'Pending'];

export const TRANSLATION_QUALITY_OPTIONS = ['Good', 'Fair', 'Poor', 'NA'];

export const DEFECT_SEVERITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low', 'Nil'];

export const VOICE_QUALITY_OPTIONS = [
    'Clear',
    'Distorted',
    'Low Volume',
    'High Volume',
    'No Output',
    'NA',
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
