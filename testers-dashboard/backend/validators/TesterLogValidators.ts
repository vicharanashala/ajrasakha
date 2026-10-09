import { IsString, IsOptional, IsNotEmpty, IsNumberString, IsArray, IsBoolean, MaxLength, MinLength, Matches, ValidateIf } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
import {
    TEXT_FIELD_LIMITS,
    BUILD_VERSION_REGEX,
    THREAD_ID_REGEX,
    WA_THREAD_ID_REGEX,
    PERSON_NAME_REGEX,
    LANGUAGE_NAME_REGEX,
    TEST_ID_REGEX,
} from '../services/TesterLogService.js';

const isNonEmptyString = (_o: any, v: any) => v !== undefined && v !== null && (typeof v !== 'string' || v.trim() !== '');

export class CreateTesterLogDto {
    @JSONSchema({ description: 'Test date formatted as YYYY-MM-DD or DD/MM/YYYY' })
    @IsString()
    @IsOptional()
    testDate?: string;

    @JSONSchema({ description: 'Type of question, e.g. Unique, GDB, Dynamic' })
    @IsString()
    @IsOptional()
    typeOfQuestion?: string;

    @JSONSchema({ description: 'Test ID – tester-entered identifier for the test case' })
    @IsString()
    @IsOptional()
    @ValidateIf(isNonEmptyString)
    @MaxLength(TEXT_FIELD_LIMITS.TEST_ID_MAX)
    @Matches(TEST_ID_REGEX)
    testId?: string;

    @JSONSchema({ description: 'Build version tested' })
    @IsString()
    @IsOptional()
    @ValidateIf(isNonEmptyString)
    @MaxLength(TEXT_FIELD_LIMITS.BUILD_VERSION_MAX)
    @Matches(BUILD_VERSION_REGEX)
    buildVersion?: string;

    @JSONSchema({ description: 'Sprint cycle name or number' })
    @IsString()
    @IsOptional()
    @MaxLength(TEXT_FIELD_LIMITS.SPRINT_CYCLE_MAX)
    sprintCycle?: string;

    @JSONSchema({ description: 'Channel tested: WhatsApp, WebApp, Both' })
    @IsString()
    @IsOptional()
    channelTested?: string;

    @JSONSchema({ description: 'Language tested' })
    @IsString()
    @IsOptional()
    @ValidateIf(isNonEmptyString)
    @MaxLength(TEXT_FIELD_LIMITS.LANGUAGE_MAX)
    @Matches(LANGUAGE_NAME_REGEX)
    languageTested?: string;

    @JSONSchema({ description: 'Thread or conversation ID' })
    @IsString()
    @IsOptional()
    @ValidateIf(isNonEmptyString)
    @MaxLength(TEXT_FIELD_LIMITS.THREAD_ID_MAX)
    @Matches(THREAD_ID_REGEX)
    threadId?: string;

    @JSONSchema({ description: 'The text of the query tested' })
    @IsString()
    @IsOptional()
    @ValidateIf(isNonEmptyString)
    @MinLength(TEXT_FIELD_LIMITS.QUERY_TEXT_MIN)
    @MaxLength(TEXT_FIELD_LIMITS.QUERY_TEXT_MAX)
    queryText?: string;

    @JSONSchema({ description: 'Question category' })
    @IsString()
    @IsOptional()
    questionCategory?: string;

    @JSONSchema({ description: 'Time question asked (HH:MM:SS)' })
    @IsString()
    @IsOptional()
    timeQuestionAsked?: string;

    @JSONSchema({ description: 'Time answer received (HH:MM:SS)' })
    @IsString()
    @IsOptional()
    timeAnswerReceived?: string;

    @JSONSchema({ description: 'SLA status: Within SLA, SLA Breached, Not Applicable' })
    @IsString()
    @IsOptional()
    slaStatus?: string;

    @IsString() @IsOptional() questionInReviewModel?: string;
    @IsString() @IsOptional() questionCorrectlyFramed?: string;
    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.LANGUAGE_MAX) @Matches(LANGUAGE_NAME_REGEX) originalLanguage?: string;
    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.LANGUAGE_MAX) @Matches(LANGUAGE_NAME_REGEX) translatedLanguage?: string;
    @IsString() @IsOptional() translationQuality?: string;
    @IsString() @IsOptional() translationErrorType?: string;
    @IsString() @IsOptional() tagging?: string;
    @IsString() @IsOptional() retrievalAccuracy?: string;

    @IsString() @IsOptional() allocatedToReviewer?: string;
    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.NAME_MAX) @Matches(PERSON_NAME_REGEX) authorsName?: string;
    @IsString() @IsOptional() authorAssignmentTime?: string;
    @IsString() @IsOptional() authorCompletionTime?: string;

    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.NAME_MAX) @Matches(PERSON_NAME_REGEX) reviewer1Name?: string;
    @IsString() @IsOptional() reviewer1AssignmentTime?: string;
    @IsString() @IsOptional() reviewer1CompletionTime?: string;

    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.NAME_MAX) @Matches(PERSON_NAME_REGEX) reviewer2Name?: string;
    @IsString() @IsOptional() reviewer2AssignmentTime?: string;
    @IsString() @IsOptional() reviewer2CompletionTime?: string;

    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.NAME_MAX) @Matches(PERSON_NAME_REGEX) reviewer3Name?: string;
    @IsString() @IsOptional() reviewer3AssignmentTime?: string;
    @IsString() @IsOptional() reviewer3CompletionTime?: string;

    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.NAME_MAX) @Matches(PERSON_NAME_REGEX) reviewer4Name?: string;
    @IsString() @IsOptional() reviewer4AssignmentTime?: string;
    @IsString() @IsOptional() reviewer4CompletionTime?: string;

    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.NAME_MAX) @Matches(PERSON_NAME_REGEX) reviewer5Name?: string;
    @IsString() @IsOptional() reviewer5AssignmentTime?: string;
    @IsString() @IsOptional() reviewer5CompletionTime?: string;

    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.NAME_MAX) @Matches(PERSON_NAME_REGEX) moderatorName?: string;
    @IsString() @IsOptional() moderatorAssignmentTime?: string;
    @IsString() @IsOptional() moderatorCompletionTime?: string;

    @IsString() @IsOptional() followUpQInReviewModel?: string;
    @IsString() @IsOptional() answerScientificallyCorrect?: string;
    @IsString() @IsOptional() expertNameDisplayed?: string;
    @IsString() @IsOptional() correctExpertNameDisplayed?: string;
    @IsString() @IsOptional() correctSourceLinksProvided?: string;

    @IsString() @IsOptional() msg120MinShownToUser?: string;
    @IsString() @IsOptional() notificationReceived?: string;
    @IsString() @IsOptional() notificationOnSameThread?: string;
    @IsString() @IsOptional() notificationLinkedCorrectQId?: string;
    @IsString() @IsOptional() voiceInputWorking?: string;
    @IsString() @IsOptional() voiceOutputWorking?: string;
    @IsString() @IsOptional() voiceInputQuality?: string;
    @IsString() @IsOptional() voiceInputIssueDescription?: string;
    @IsString() @IsOptional() voiceOutputQuality?: string;
    @IsString() @IsOptional() voiceIssueDescription?: string;

    @IsString() @IsOptional() weatherQAnsweredCorrectly?: string;
    @IsString() @IsOptional() mandiPriceQCorrect?: string;
    @IsString() @IsOptional() schemeQCorrect?: string;
    @IsString() @IsOptional() questionSavedInDb?: string;
    @IsString() @IsOptional() answerSavedInDb?: string;
    @IsString() @IsOptional() qIdConsistentAcrossSystems?: string;
    @IsString() @IsOptional() whatsappVsWebAnswerMatch?: string;

    @IsString() @IsOptional() overallTestStatus?: string;
    @IsString() @IsOptional() defectSeverity?: string;
    @IsString() @IsOptional() defectIdBugRef?: string;
    @IsString() @IsOptional() reviewerRemarks?: string;
    @IsString() @IsOptional() testerRemarks?: string;
    @IsString() @IsOptional() @MaxLength(TEXT_FIELD_LIMITS.REMARKS_NOTES_MAX) testerRemarksNotes?: string;
    @IsString() @IsOptional() status?: string;

    // Cross-Platform Dual-Channel Fields
    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.THREAD_ID_MAX) @Matches(THREAD_ID_REGEX) webThreadId?: string;
    @IsString() @IsOptional() @ValidateIf(isNonEmptyString) @MaxLength(TEXT_FIELD_LIMITS.WA_THREAD_ID_MAX) @Matches(WA_THREAD_ID_REGEX) waThreadId?: string;
    @IsString() @IsOptional() waTimeQuestionAsked?: string;
    @IsString() @IsOptional() waTimeAnswerReceived?: string;
    @IsString() @IsOptional() waResponseTimeMins?: string;
    @IsString() @IsOptional() waSlaStatus?: string;
    @IsString() @IsOptional() waVoiceInputWorking?: string;
    @IsString() @IsOptional() waVoiceOutputWorking?: string;
    @IsString() @IsOptional() waVoiceInputQuality?: string;
    @IsString() @IsOptional() waVoiceInputIssueDescription?: string;
    @IsString() @IsOptional() waVoiceOutputQuality?: string;
    @IsString() @IsOptional() waVoiceIssueDescription?: string;
    @IsString() @IsOptional() waNotificationReceived?: string;
    @IsString() @IsOptional() webOverallTestStatus?: string;
    @IsString() @IsOptional() waOverallTestStatus?: string;
    @IsString() @IsOptional() @MaxLength(TEXT_FIELD_LIMITS.DISCREPANCY_NOTES_MAX) crossPlatformDiscrepancyNotes?: string;
}

// Admin edit - the same form fields as a submission, every one optional
// (only the ones sent are changed). TesterLogController.updateEntry also
// requires testDate, when sent, to be YYYY-MM-DD, since the date filters
// compare it as a string.
export class UpdateTesterLogDto extends CreateTesterLogDto {}

export class GetTesterLogQuery {
    @IsNumberString()
    @IsOptional()
    page?: string;

    @IsNumberString()
    @IsOptional()
    limit?: string;

    @IsString()
    @IsOptional()
    testerId?: string;

    @IsString()
    @IsOptional()
    startDate?: string;

    @IsString()
    @IsOptional()
    endDate?: string;

    @IsString()
    @IsOptional()
    dateField?: string;

    @JSONSchema({ description: 'Type of question, e.g. Unique, GDB, Dynamic' })
    @IsString()
    @IsOptional()
    typeOfQuestion?: string;

    @JSONSchema({ description: 'Channel tested: WhatsApp, WebApp, Both' })
    @IsString()
    @IsOptional()
    channelTested?: string;

    @JSONSchema({ description: 'Overall Test Status: Pass, Fail, Partial, NA' })
    @IsString()
    @IsOptional()
    overallTestStatus?: string;

    @JSONSchema({ description: 'Defect Severity: Critical, High, Medium, Low, Nil' })
    @IsString()
    @IsOptional()
    defectSeverity?: string;

    @JSONSchema({ description: 'Free-text search across thread ID, query text, test ID, defect ID, etc.' })
    @IsString()
    @IsOptional()
    search?: string;

    @JSONSchema({ description: 'Status filter: all, pass, fail, partial, defects' })
    @IsString()
    @IsOptional()
    status?: string;
}

export class CreateZohoTicketDto {
    @JSONSchema({ description: 'Ticket subject / title' })
    @IsString()
    @IsNotEmpty()
    subject!: string;

    @JSONSchema({ description: 'Detailed bug description or query notes' })
    @IsString()
    @IsNotEmpty()
    description!: string;

    @JSONSchema({ description: 'Ticket priority: Low, Medium, High, Urgent' })
    @IsString()
    @IsOptional()
    priority?: string;

    @JSONSchema({ description: 'Tester contact email' })
    @IsString()
    @IsOptional()
    email?: string;

    @JSONSchema({ description: 'Tester contact name' })
    @IsString()
    @IsOptional()
    testerName?: string;

    @JSONSchema({ description: 'Zoho Desk department ID' })
    @IsString()
    @IsOptional()
    departmentId?: string;

    @JSONSchema({ description: 'Zoho Desk owner team ID' })
    @IsString()
    @IsOptional()
    teamId?: string;

    @JSONSchema({ description: 'App Name (e.g. Whatsapp Bot, Web App, Reviewer System, etc.)' })
    @IsString()
    @IsOptional()
    appName?: string;

    @JSONSchema({ description: 'Whether the issue reoccurred before' })
    @IsBoolean()
    @IsOptional()
    issueReoccurredBefore?: boolean;

    @JSONSchema({ description: 'Ticket due date (e.g. YYYY-MM-DD)' })
    @IsString()
    @IsOptional()
    dueDate?: string;

    @JSONSchema({ description: 'List of base64 screenshots / attachments to upload to Zoho' })
    @IsArray()
    @IsOptional()
    attachments?: {
        filename: string;
        contentBase64: string;
        contentType?: string;
        inlineBase64?: string;
    }[];
}

export const TESTER_LOG_VALIDATORS = [CreateTesterLogDto, UpdateTesterLogDto, GetTesterLogQuery, CreateZohoTicketDto];
