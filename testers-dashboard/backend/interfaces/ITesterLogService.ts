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

export interface ITesterLogService {
    createEntry(
        userId: string,
        email: string,
        testerName: string,
        body: Omit<TesterLogEntry, '_id' | 'submittedByUserId' | 'submittedByEmail' | 'testerName' | 'createdAt' | 'updatedAt' | 'testDate'> & { testDate?: string },
    ): Promise<CreateTesterLogEntryResponse>;

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
    ): Promise<PaginatedTesterLogEntries>;
}
