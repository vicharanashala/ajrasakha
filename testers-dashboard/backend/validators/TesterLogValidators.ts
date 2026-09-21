import { IsString, IsOptional, IsNotEmpty, IsNumberString, IsArray, IsBoolean } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class CreateTesterLogDto {
    @JSONSchema({ description: 'Test date formatted as YYYY-MM-DD or DD/MM/YYYY' })
    @IsString()
    @IsOptional()
    testDate?: string;

    @JSONSchema({ description: 'Type of question, e.g. Unique, GDB, Dynamic' })
    @IsString()
    @IsOptional()
    typeOfQuestion?: string;

    @JSONSchema({ description: 'Build version tested' })
    @IsString()
    @IsOptional()
    buildVersion?: string;

    @JSONSchema({ description: 'Sprint cycle name or number' })
    @IsString()
    @IsOptional()
    sprintCycle?: string;

    @JSONSchema({ description: 'Channel tested: WhatsApp, WebApp, Both' })
    @IsString()
    @IsOptional()
    channelTested?: string;

    @JSONSchema({ description: 'Language tested' })
    @IsString()
    @IsOptional()
    languageTested?: string;

    @JSONSchema({ description: 'Thread or conversation ID' })
    @IsString()
    @IsOptional()
    threadId?: string;

    @JSONSchema({ description: 'The text of the query tested' })
    @IsString()
    @IsOptional()
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
    @IsString() @IsOptional() originalLanguage?: string;
    @IsString() @IsOptional() translatedLanguage?: string;
    @IsString() @IsOptional() translationQuality?: string;
    @IsString() @IsOptional() translationErrorType?: string;
    @IsString() @IsOptional() tagging?: string;

    @IsString() @IsOptional() allocatedToReviewer?: string;
    @IsString() @IsOptional() authorsName?: string;
    @IsString() @IsOptional() authorAssignmentTime?: string;
    @IsString() @IsOptional() authorCompletionTime?: string;

    @IsString() @IsOptional() reviewer1Name?: string;
    @IsString() @IsOptional() reviewer1AssignmentTime?: string;
    @IsString() @IsOptional() reviewer1CompletionTime?: string;

    @IsString() @IsOptional() reviewer2Name?: string;
    @IsString() @IsOptional() reviewer2AssignmentTime?: string;
    @IsString() @IsOptional() reviewer2CompletionTime?: string;

    @IsString() @IsOptional() reviewer3Name?: string;
    @IsString() @IsOptional() reviewer3AssignmentTime?: string;
    @IsString() @IsOptional() reviewer3CompletionTime?: string;

    @IsString() @IsOptional() reviewer4Name?: string;
    @IsString() @IsOptional() reviewer4AssignmentTime?: string;
    @IsString() @IsOptional() reviewer4CompletionTime?: string;

    @IsString() @IsOptional() reviewer5Name?: string;
    @IsString() @IsOptional() reviewer5AssignmentTime?: string;
    @IsString() @IsOptional() reviewer5CompletionTime?: string;

    @IsString() @IsOptional() moderatorName?: string;
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
    @IsString() @IsOptional() status?: string;
}

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

export const TESTER_LOG_VALIDATORS = [CreateTesterLogDto, GetTesterLogQuery, CreateZohoTicketDto];
