import type { ITesterLogEntry } from "./types";

export interface IEntryDetailField {
    key: keyof ITesterLogEntry;
    label: string;
}

export interface IEntryDetailGroup {
    title: string;
    fields: IEntryDetailField[];
}

// Every field on ITesterLogEntry, grouped and labelled the same way
// TesterLogForm.tsx presents them at submission time - so a reviewer opening
// "View more" sees the same field names they already know from the form,
// not a second, differently-worded vocabulary. Covers all ~82 fields on the
// interface (verified against ITesterLogService.ts): the table above shows
// only the 10 columns reviewers need at a glance (TABLE_COLUMNS in
// TesterDataView.tsx); this is the complete record behind that row.
export const ENTRY_DETAIL_GROUPS: IEntryDetailGroup[] = [
    {
        title: "Record Info",
        fields: [
            { key: "_id", label: "Test ID" },
            { key: "testerName", label: "Tester Name" },
            { key: "submittedByEmail", label: "Submitted By Email" },
            { key: "submittedByUserId", label: "Submitted By (User ID)" },
            { key: "createdAt", label: "Submitted At" },
            { key: "updatedAt", label: "Last Updated At" },
        ],
    },
    {
        title: "1. Basic Info",
        fields: [
            { key: "testDate", label: "Test Date" },
            { key: "typeOfQuestion", label: "Type of Question" },
            { key: "buildVersion", label: "Build / Version" },
            { key: "sprintCycle", label: "Sprint / Cycle" },
            { key: "channelTested", label: "Channel Tested" },
            { key: "languageTested", label: "Language Tested" },
            { key: "threadId", label: "Thread ID" },
            { key: "questionCategory", label: "Question Category" },
            { key: "queryText", label: "Query Text (Original)" },
        ],
    },
    {
        title: "2. Timing & SLA",
        fields: [
            { key: "timeQuestionAsked", label: "Time Question Asked" },
            { key: "timeAnswerReceived", label: "Time Answer Received" },
            { key: "responseTimeMins", label: "Response Time [Auto]" },
            { key: "slaStatus", label: "SLA Status" },
        ],
    },
    {
        title: "3. Question Quality",
        fields: [
            { key: "questionInReviewModel", label: "Question in Review Model?" },
            { key: "questionCorrectlyFramed", label: "Question Correctly Framed?" },
            { key: "originalLanguage", label: "Original Language" },
            { key: "translatedLanguage", label: "Translated Language" },
            { key: "translationQuality", label: "Translation Quality" },
            { key: "translationErrorType", label: "Translation Error Type" },
            { key: "tagging", label: "Tagging" },
        ],
    },
    {
        title: "4. Reviewer Workflow - Author",
        fields: [
            { key: "allocatedToReviewer", label: "Allocated to Reviewer?" },
            { key: "authorsName", label: "Author Name" },
            { key: "authorAssignmentTime", label: "Author Assignment Time" },
            { key: "authorCompletionTime", label: "Author Completion Time" },
            { key: "authorTatMins", label: "Author TAT [Auto]" },
        ],
    },
    {
        title: "4. Reviewer Workflow - Reviewer 1",
        fields: [
            { key: "reviewer1Name", label: "Reviewer 1 Name" },
            { key: "reviewer1AssignmentTime", label: "Reviewer 1 Assignment Time" },
            { key: "reviewer1CompletionTime", label: "Reviewer 1 Completion Time" },
            { key: "review1TatMins", label: "Review 1 TAT [Auto]" },
        ],
    },
    {
        title: "4. Reviewer Workflow - Reviewer 2",
        fields: [
            { key: "reviewer2Name", label: "Reviewer 2 Name" },
            { key: "reviewer2AssignmentTime", label: "Reviewer 2 Assignment Time" },
            { key: "reviewer2CompletionTime", label: "Reviewer 2 Completion Time" },
            { key: "review2TatMins", label: "Review 2 TAT [Auto]" },
        ],
    },
    {
        title: "4. Reviewer Workflow - Reviewer 3",
        fields: [
            { key: "reviewer3Name", label: "Reviewer 3 Name" },
            { key: "reviewer3AssignmentTime", label: "Reviewer 3 Assignment Time" },
            { key: "reviewer3CompletionTime", label: "Reviewer 3 Completion Time" },
            { key: "review3TatMins", label: "Review 3 TAT [Auto]" },
        ],
    },
    {
        title: "4. Reviewer Workflow - Reviewer 4",
        fields: [
            { key: "reviewer4Name", label: "Reviewer 4 Name" },
            { key: "reviewer4AssignmentTime", label: "Reviewer 4 Assignment Time" },
            { key: "reviewer4CompletionTime", label: "Reviewer 4 Completion Time" },
            { key: "review4TatMins", label: "Review 4 TAT [Auto]" },
        ],
    },
    {
        title: "4. Reviewer Workflow - Reviewer 5",
        fields: [
            { key: "reviewer5Name", label: "Reviewer 5 Name" },
            { key: "reviewer5AssignmentTime", label: "Reviewer 5 Assignment Time" },
            { key: "reviewer5CompletionTime", label: "Reviewer 5 Completion Time" },
            { key: "review5TatMins", label: "Review 5 TAT [Auto]" },
        ],
    },
    {
        title: "4. Reviewer Workflow - Moderator",
        fields: [
            { key: "moderatorName", label: "Moderator Name" },
            { key: "moderatorAssignmentTime", label: "Moderator Assignment Time" },
            { key: "moderatorCompletionTime", label: "Moderator Completion Time" },
            { key: "moderatorTatMins", label: "Moderator TAT [Auto]" },
        ],
    },
    {
        title: "5. Answer Quality",
        fields: [
            { key: "followUpQInReviewModel", label: "Follow-up Q in Review Model?" },
            { key: "answerScientificallyCorrect", label: "Answer Scientifically Correct?" },
            { key: "expertNameDisplayed", label: "Expert Name Displayed?" },
            { key: "correctExpertNameDisplayed", label: "Correct Expert Name Displayed?" },
            { key: "correctSourceLinksProvided", label: "Correct Source Links Provided?" },
        ],
    },
    {
        title: "6. Notifications & Voice",
        fields: [
            { key: "msg120MinShownToUser", label: "120-min Msg Shown to User?" },
            { key: "notificationReceived", label: "Notification Received?" },
            { key: "notificationOnSameThread", label: "Notification on Same Thread?" },
            { key: "notificationLinkedCorrectQId", label: "Notification Linked Correct Q-ID?" },
            { key: "voiceInputWorking", label: "Voice Input Working?" },
            { key: "voiceOutputWorking", label: "Voice Output Working?" },
            { key: "voiceInputQuality", label: "Voice Input Quality" },
            { key: "voiceOutputQuality", label: "Voice Output Quality" },
            { key: "voiceIssueDescription", label: "Voice Issue Description" },
        ],
    },
    {
        title: "7. Domain Checks",
        fields: [
            { key: "weatherQAnsweredCorrectly", label: "Weather Q Answered Correctly?" },
            { key: "mandiPriceQCorrect", label: "Mandi Price Q Correct?" },
            { key: "schemeQCorrect", label: "Scheme Q Correct?" },
            { key: "questionSavedInDb", label: "Question Saved in DB?" },
            { key: "answerSavedInDb", label: "Answer Saved in DB?" },
            { key: "qIdConsistentAcrossSystems", label: "Q-ID Consistent Across Systems?" },
            { key: "whatsappVsWebAnswerMatch", label: "WhatsApp vs Web Answer Match?" },
        ],
    },
    {
        title: "8. Defects & Remarks",
        fields: [
            { key: "overallTestStatus", label: "Overall Test Status" },
            { key: "defectSeverity", label: "Defect Severity" },
            { key: "defectIdBugRef", label: "Defect ID / Bug Ref" },
            { key: "reviewerRemarks", label: "Reviewer Remarks" },
            { key: "testerRemarks", label: "Tester Remarks" },
            { key: "status", label: "Status" },
        ],
    },
];
