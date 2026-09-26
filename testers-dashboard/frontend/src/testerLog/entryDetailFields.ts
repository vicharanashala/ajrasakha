import {
    Bell,
    Bug,
    CircleCheckBig,
    Clock,
    FileText,
    Info,
    MessageCircleQuestion,
    ShieldCheck,
    Users,
    type LucideIcon,
} from "lucide-react";
import type { ITesterLogEntry } from "./types";

export interface IEntryDetailField {
    key: keyof ITesterLogEntry;
    label: string;
    /** Render the value with formatDateTimeIST instead of as raw text. */
    isDateTime?: boolean;
}

export interface IEntryDetailGroup {
    title: string;
    /** Shown beside the section title in the Test Entry Details dialog. */
    icon: LucideIcon;
    fields: IEntryDetailField[];
}

// Every field on ITesterLogEntry, grouped, ordered and labelled the same way
// TesterLogForm.tsx presents them at submission time - so "View" shows
// the same field names as the form, not a second vocabulary. The table
// (TABLE_COLUMNS in TesterDataView.tsx) only shows a handful of columns at a
// glance; this is the complete record behind that row.
export const ENTRY_DETAIL_GROUPS: IEntryDetailGroup[] = [
    {
        title: "Record Information",
        icon: FileText,
        fields: [
            { key: "testerName", label: "Tester Name" },
            { key: "submittedByEmail", label: "Submitted By (Email)" },
            { key: "submittedByUserId", label: "Submitted By (User ID)" },
            { key: "createdAt", label: "Submitted At", isDateTime: true },
            { key: "updatedAt", label: "Last Updated At", isDateTime: true },
        ],
    },
    {
        title: "Basic Information",
        icon: Info,
        fields: [
            { key: "testDate", label: "Test Date" },
            { key: "testId", label: "Test ID" },
            { key: "typeOfQuestion", label: "Type of Question" },
            { key: "buildVersion", label: "Build / Version" },
            { key: "channelTested", label: "Channel Tested" },
            { key: "languageTested", label: "Language Tested" },
            { key: "threadId", label: "Thread ID" },
            { key: "questionCategory", label: "Question Category" },
            { key: "queryText", label: "Query Text (Original)" },
        ],
    },
    {
        title: "Timing & SLA",
        icon: Clock,
        fields: [
            { key: "timeQuestionAsked", label: "Time Question Asked", isDateTime: true },
            { key: "timeAnswerReceived", label: "Time Answer Received", isDateTime: true },
            { key: "responseTimeMins", label: "Response Time [Auto]" },
            { key: "slaStatus", label: "SLA Status" },
        ],
    },
    {
        title: "Question Quality",
        icon: MessageCircleQuestion,
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
        title: "Reviewer Workflow — Author",
        icon: Users,
        fields: [
            { key: "allocatedToReviewer", label: "Allocated to Reviewer?" },
            { key: "authorsName", label: "Author Name" },
            { key: "authorAssignmentTime", label: "Author Assignment Time", isDateTime: true },
            { key: "authorCompletionTime", label: "Author Completion Time", isDateTime: true },
            { key: "authorTatMins", label: "Author TAT [Auto]" },
        ],
    },
    {
        title: "Reviewer Workflow — Reviewer 1",
        icon: Users,
        fields: [
            { key: "reviewer1Name", label: "Reviewer 1 Name" },
            { key: "reviewer1AssignmentTime", label: "Reviewer 1 Assignment Time", isDateTime: true },
            { key: "reviewer1CompletionTime", label: "Reviewer 1 Completion Time", isDateTime: true },
            { key: "review1TatMins", label: "Review 1 TAT [Auto]" },
        ],
    },
    {
        title: "Reviewer Workflow — Reviewer 2",
        icon: Users,
        fields: [
            { key: "reviewer2Name", label: "Reviewer 2 Name" },
            { key: "reviewer2AssignmentTime", label: "Reviewer 2 Assignment Time", isDateTime: true },
            { key: "reviewer2CompletionTime", label: "Reviewer 2 Completion Time", isDateTime: true },
            { key: "review2TatMins", label: "Review 2 TAT [Auto]" },
        ],
    },
    {
        title: "Reviewer Workflow — Reviewer 3",
        icon: Users,
        fields: [
            { key: "reviewer3Name", label: "Reviewer 3 Name" },
            { key: "reviewer3AssignmentTime", label: "Reviewer 3 Assignment Time", isDateTime: true },
            { key: "reviewer3CompletionTime", label: "Reviewer 3 Completion Time", isDateTime: true },
            { key: "review3TatMins", label: "Review 3 TAT [Auto]" },
        ],
    },
    {
        title: "Reviewer Workflow — Reviewer 4",
        icon: Users,
        fields: [
            { key: "reviewer4Name", label: "Reviewer 4 Name" },
            { key: "reviewer4AssignmentTime", label: "Reviewer 4 Assignment Time", isDateTime: true },
            { key: "reviewer4CompletionTime", label: "Reviewer 4 Completion Time", isDateTime: true },
            { key: "review4TatMins", label: "Review 4 TAT [Auto]" },
        ],
    },
    {
        title: "Reviewer Workflow — Reviewer 5",
        icon: Users,
        fields: [
            { key: "reviewer5Name", label: "Reviewer 5 Name" },
            { key: "reviewer5AssignmentTime", label: "Reviewer 5 Assignment Time", isDateTime: true },
            { key: "reviewer5CompletionTime", label: "Reviewer 5 Completion Time", isDateTime: true },
            { key: "review5TatMins", label: "Review 5 TAT [Auto]" },
        ],
    },
    {
        title: "Reviewer Workflow — Moderator",
        icon: Users,
        fields: [
            { key: "moderatorName", label: "Moderator Name" },
            { key: "moderatorAssignmentTime", label: "Moderator Assignment Time", isDateTime: true },
            { key: "moderatorCompletionTime", label: "Moderator Completion Time", isDateTime: true },
            { key: "moderatorTatMins", label: "Moderator TAT [Auto]" },
        ],
    },
    {
        title: "Answer Quality",
        icon: CircleCheckBig,
        fields: [
            { key: "followUpQInReviewModel", label: "Follow-up Q in Review Model?" },
            { key: "answerScientificallyCorrect", label: "Answer Scientifically Correct?" },
            { key: "expertNameDisplayed", label: "Expert Name Displayed?" },
            { key: "correctExpertNameDisplayed", label: "Correct Expert Name Displayed?" },
            { key: "correctSourceLinksProvided", label: "Correct Source Links Provided?" },
        ],
    },
    {
        title: "Notifications & Voice",
        icon: Bell,
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
        title: "Domain Checks",
        icon: ShieldCheck,
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
        title: "Defects & Remarks",
        icon: Bug,
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

export interface ICrossPlatformFieldPair {
    webKey: keyof ITesterLogEntry;
    webLabel: string;
    waKey: keyof ITesterLogEntry;
    waLabel: string;
    isDateTime?: boolean;
}

// A cross-platform ("Both") entry stores its Web App half in the common
// fields - the same ones a single-channel entry uses - and its WhatsApp half
// in the wa* fields (see TesterLogForm.tsx). Each pair is one field of the
// Cross-Platform Comparison's WebApp and WhatsApp tabs, in the View and Edit
// dialogs. The WhatsApp labels name the platform, and so does the Web
// status, which would otherwise read like the entry's own Overall Test Status.
export const CROSS_PLATFORM_FIELD_PAIRS: ICrossPlatformFieldPair[] = [
    { webKey: "threadId", webLabel: "Thread ID", waKey: "waThreadId", waLabel: "WhatsApp Thread ID" },
    {
        webKey: "timeQuestionAsked", webLabel: "Time Question Asked",
        waKey: "waTimeQuestionAsked", waLabel: "WhatsApp Time Question Asked",
        isDateTime: true,
    },
    {
        webKey: "timeAnswerReceived", webLabel: "Time Answer Received",
        waKey: "waTimeAnswerReceived", waLabel: "WhatsApp Time Answer Received",
        isDateTime: true,
    },
    {
        webKey: "responseTimeMins", webLabel: "Response Time [Auto]",
        waKey: "waResponseTimeMins", waLabel: "WhatsApp Response Time [Auto]",
    },
    { webKey: "slaStatus", webLabel: "SLA Status", waKey: "waSlaStatus", waLabel: "WhatsApp SLA Status" },
    {
        webKey: "notificationReceived", webLabel: "Notification Received?",
        waKey: "waNotificationReceived", waLabel: "WhatsApp Notification Received?",
    },
    {
        webKey: "voiceInputWorking", webLabel: "Voice Input Working?",
        waKey: "waVoiceInputWorking", waLabel: "WhatsApp Voice Input Working?",
    },
    {
        webKey: "voiceOutputWorking", webLabel: "Voice Output Working?",
        waKey: "waVoiceOutputWorking", waLabel: "WhatsApp Voice Output Working?",
    },
    {
        webKey: "webOverallTestStatus", webLabel: "Web Overall Test Status",
        waKey: "waOverallTestStatus", waLabel: "WhatsApp Overall Test Status",
    },
];

export const CROSS_PLATFORM_NOTES_FIELD: IEntryDetailField = {
    key: "crossPlatformDiscrepancyNotes",
    label: "WebApp vs WhatsApp Discrepancy Notes",
};

// Fields that only mean something on a Both entry. A single-channel entry
// never shows them, even if it still holds values from before its channel
// was changed.
export const CROSS_PLATFORM_ONLY_KEYS: (keyof ITesterLogEntry)[] = [
    ...CROSS_PLATFORM_FIELD_PAIRS.map((p) => p.waKey),
    "webOverallTestStatus",
    CROSS_PLATFORM_NOTES_FIELD.key,
];

// The Cross-Platform Comparison is placed right after this group.
export const CROSS_PLATFORM_AFTER_GROUP = "Basic Information";

const CROSS_PLATFORM_WEB_KEYS = new Set(CROSS_PLATFORM_FIELD_PAIRS.map((p) => p.webKey));

/** The general groups for an entry. On a cross-platform entry, the fields
 * shown in the comparison's WebApp column are taken out of their usual
 * group (and a group left empty by that is dropped), so nothing is listed
 * twice. */
export function entryDetailGroupsFor(isCross: boolean): IEntryDetailGroup[] {
    if (!isCross) return ENTRY_DETAIL_GROUPS;
    return ENTRY_DETAIL_GROUPS
        .map((group) => ({ ...group, fields: group.fields.filter((f) => !CROSS_PLATFORM_WEB_KEYS.has(f.key)) }))
        .filter((group) => group.fields.length > 0);
}
