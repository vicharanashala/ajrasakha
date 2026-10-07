import { Fragment, useState, type FormEvent } from "react";
import { CalendarDays, Hash, Loader2, StickyNote, User } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import type { ITesterLogEntry } from "../types";
import {
    isCrossPlatform,
    synthesizeOverallTestStatus,
    TYPE_OF_QUESTION_OPTIONS,
    CHANNEL_OPTIONS,
    QUESTION_CATEGORY_OPTIONS,
    SLA_STATUS_OPTIONS,
    REVIEW_MODEL_OPTIONS,
    QUESTION_FRAMED_OPTIONS,
    ALLOCATED_TO_AUTHOR_OPTIONS,
    FOLLOW_UP_MODEL_OPTIONS,
    ANSWER_CORRECT_OPTIONS,
    EXPERT_DISPLAYED_OPTIONS,
    SOURCE_LINKS_OPTIONS,
    DISCLAIMER_120_OPTIONS,
    NOTIFICATION_RECEIVED_OPTIONS,
    NOTIFICATION_SAME_THREAD_OPTIONS,
    NOTIFICATION_LINKED_QID_OPTIONS,
    YES_NO_NA_OPTIONS,
    YES_NO_PARTIAL_NA_OPTIONS,
    OVERALL_STATUS_OPTIONS,
    TRANSLATION_QUALITY_OPTIONS,
    TRANSLATION_ERROR_TYPE_OPTIONS,
    TRANSLATION_ERROR_MAP,
    getTranslationErrorOptions,
    DEFECT_SEVERITY_OPTIONS,
    INDIAN_LANGUAGES_OPTIONS,
    VOICE_ISSUE_OPTIONS,
    VOICE_INPUT_QUALITY_OPTIONS,
    VOICE_OUTPUT_QUALITY_OPTIONS,
    WHATSAPP_VS_WEB_MATCH_OPTIONS,
    TAGGING_OPTIONS,
    RETRIEVAL_ACCURACY_OPTIONS,
    TESTER_REMARKS_OPTIONS,
    TEXT_FIELD_LIMITS,
    BUILD_VERSION_REGEX,
    THREAD_ID_REGEX,
    WA_THREAD_ID_REGEX,
    PERSON_NAME_REGEX,
    LANGUAGE_NAME_REGEX,
    HTTP_URL_REGEX,
} from "../types";
import {
    CROSS_PLATFORM_AFTER_GROUP,
    CROSS_PLATFORM_FIELD_PAIRS,
    CROSS_PLATFORM_NOTES_FIELD,
    CROSS_PLATFORM_ONLY_KEYS,
    ENTRY_DETAIL_GROUPS,
    entryDetailGroupsFor,
    type IEntryDetailField,
} from "../entryDetailFields";
import { formatDateTimeIST } from "../utils/formatIST";
import { isTimeEarlier, isTimeInFuture, getLocalDatetimeMax } from "../utils/timingUtils";
import { useUpdateTesterLogEntry } from "../hooks/useTesterLogAdminActions";
import { CrossPlatformComparison, EntryDetailSection } from "./CrossPlatformComparison";

type EntryKey = keyof ITesterLogEntry;

// Shown but never editable: the record's identity and bookkeeping (the
// server ignores these on update), and the [Auto] durations, which the
// server recomputes from the edited start/end times on save.
const READ_ONLY_KEYS = new Set<EntryKey>([
    "_id",
    "testerName",
    "submittedByEmail",
    "submittedByUserId",
    "createdAt",
    "updatedAt",
    "responseTimeMins",
    "waResponseTimeMins",
    "authorTatMins",
    "review1TatMins",
    "review2TatMins",
    "review3TatMins",
    "review4TatMins",
    "review5TatMins",
    "moderatorTatMins",
]);

// Same option lists TesterLogForm.tsx offers for each field at submission.
const SELECT_OPTIONS: Partial<Record<EntryKey, string[]>> = {
    typeOfQuestion: TYPE_OF_QUESTION_OPTIONS,
    channelTested: CHANNEL_OPTIONS,
    questionCategory: QUESTION_CATEGORY_OPTIONS,
    slaStatus: SLA_STATUS_OPTIONS,
    questionInReviewModel: REVIEW_MODEL_OPTIONS,
    questionCorrectlyFramed: QUESTION_FRAMED_OPTIONS,
    translationQuality: TRANSLATION_QUALITY_OPTIONS,
    translationErrorType: TRANSLATION_ERROR_TYPE_OPTIONS,
    tagging: TAGGING_OPTIONS,
    retrievalAccuracy: RETRIEVAL_ACCURACY_OPTIONS,
    allocatedToReviewer: ALLOCATED_TO_AUTHOR_OPTIONS,
    followUpQInReviewModel: FOLLOW_UP_MODEL_OPTIONS,
    answerScientificallyCorrect: ANSWER_CORRECT_OPTIONS,
    expertNameDisplayed: EXPERT_DISPLAYED_OPTIONS,
    correctSourceLinksProvided: SOURCE_LINKS_OPTIONS,
    msg120MinShownToUser: DISCLAIMER_120_OPTIONS,
    notificationReceived: NOTIFICATION_RECEIVED_OPTIONS,
    notificationOnSameThread: NOTIFICATION_SAME_THREAD_OPTIONS,
    notificationLinkedCorrectQId: NOTIFICATION_LINKED_QID_OPTIONS,
    voiceInputWorking: YES_NO_NA_OPTIONS,
    voiceOutputWorking: YES_NO_NA_OPTIONS,
    voiceInputIssueDescription: VOICE_ISSUE_OPTIONS,
    voiceInputQuality: VOICE_INPUT_QUALITY_OPTIONS,
    voiceOutputQuality: VOICE_OUTPUT_QUALITY_OPTIONS,
    voiceIssueDescription: VOICE_ISSUE_OPTIONS,
    weatherQAnsweredCorrectly: YES_NO_PARTIAL_NA_OPTIONS,
    mandiPriceQCorrect: YES_NO_PARTIAL_NA_OPTIONS,
    schemeQCorrect: YES_NO_PARTIAL_NA_OPTIONS,
    whatsappVsWebAnswerMatch: WHATSAPP_VS_WEB_MATCH_OPTIONS,
    overallTestStatus: OVERALL_STATUS_OPTIONS,
    defectSeverity: DEFECT_SEVERITY_OPTIONS,
    testerRemarks: TESTER_REMARKS_OPTIONS,
    waSlaStatus: SLA_STATUS_OPTIONS,
    waNotificationReceived: NOTIFICATION_RECEIVED_OPTIONS,
    waVoiceInputWorking: YES_NO_NA_OPTIONS,
    waVoiceOutputWorking: YES_NO_NA_OPTIONS,
    waVoiceInputIssueDescription: VOICE_ISSUE_OPTIONS,
    waVoiceIssueDescription: VOICE_ISSUE_OPTIONS,
    webOverallTestStatus: OVERALL_STATUS_OPTIONS,
    waOverallTestStatus: OVERALL_STATUS_OPTIONS,
};

// The form lets testers pick a language or type their own ("Others"), so
// these are free text with the standard list as suggestions.
const LANGUAGE_KEYS = new Set<EntryKey>(["languageTested", "originalLanguage", "translatedLanguage"]);
const LANGUAGE_LIST_ID = "tester-entry-edit-languages";

const TEXTAREA_KEYS = new Set<EntryKey>([
    "queryText",
    "testerRemarksNotes",
    "crossPlatformDiscrepancyNotes",
]);

const CROSS_PLATFORM_ONLY = new Set<EntryKey>(CROSS_PLATFORM_ONLY_KEYS);

// What <input type="datetime-local"> can display. Older entries may hold
// other formats (bare HH:MM:SS, "NA", ...) - those get a text box instead,
// so the admin sees the stored value rather than a blank picker.
const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

const INPUT_CLASS =
    "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:[color-scheme:dark] [&_option]:bg-background [&_option]:text-foreground";

type FormValues = Partial<Record<EntryKey, string>>;

// Every editable field, the cross-platform ones included, so switching
// Channel Tested to Both in the editor shows their stored values.
function initialValues(entry: ITesterLogEntry): FormValues {
    const values: FormValues = {};
    const keys = [...ENTRY_DETAIL_GROUPS.flatMap((g) => g.fields.map((f) => f.key)), ...CROSS_PLATFORM_ONLY_KEYS];
    for (const key of keys) {
        if (!READ_ONLY_KEYS.has(key)) values[key] = (entry[key] as string | undefined) ?? "";
    }
    if ((values.overallTestStatus || "").trim().toLowerCase() === "pass") {
        values.defectSeverity = "NA";
        values.defectIdBugRef = "NA";
    }
    return values;
}

const FIELD_MAX_LENGTHS: Partial<Record<EntryKey, number>> = {
    buildVersion: TEXT_FIELD_LIMITS.BUILD_VERSION_MAX,
    threadId: TEXT_FIELD_LIMITS.THREAD_ID_MAX,
    waThreadId: TEXT_FIELD_LIMITS.WA_THREAD_ID_MAX,
    languageTested: TEXT_FIELD_LIMITS.LANGUAGE_MAX,
    originalLanguage: TEXT_FIELD_LIMITS.LANGUAGE_MAX,
    translatedLanguage: TEXT_FIELD_LIMITS.LANGUAGE_MAX,
    authorsName: TEXT_FIELD_LIMITS.NAME_MAX,
    reviewer1Name: TEXT_FIELD_LIMITS.NAME_MAX,
    reviewer2Name: TEXT_FIELD_LIMITS.NAME_MAX,
    reviewer3Name: TEXT_FIELD_LIMITS.NAME_MAX,
    reviewer4Name: TEXT_FIELD_LIMITS.NAME_MAX,
    reviewer5Name: TEXT_FIELD_LIMITS.NAME_MAX,
    moderatorName: TEXT_FIELD_LIMITS.NAME_MAX,
    queryText: TEXT_FIELD_LIMITS.QUERY_TEXT_MAX,
    defectIdBugRef: TEXT_FIELD_LIMITS.DEFECT_URL_MAX,
    crossPlatformDiscrepancyNotes: TEXT_FIELD_LIMITS.DISCREPANCY_NOTES_MAX,
    testerRemarksNotes: TEXT_FIELD_LIMITS.REMARKS_NOTES_MAX,
};

function FieldInput({ fieldKey, isDateTime, value, disabled, onChange, translationQuality }: {
    fieldKey: EntryKey;
    isDateTime?: boolean;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
    translationQuality?: string;
}) {
    const id = `tester-entry-edit-${fieldKey}`;
    let options = SELECT_OPTIONS[fieldKey];
    if (fieldKey === "translationErrorType") {
        options = getTranslationErrorOptions(translationQuality);
    }

    if (options) {
        // Keep a stored value that isn't in today's list selectable, so
        // opening the editor never silently changes it.
        const withCurrent = value && !options.includes(value) ? [value, ...options] : options;
        const isDisabled = disabled || (fieldKey === "translationErrorType" && !translationQuality);
        const placeholder = fieldKey === "translationErrorType" && !translationQuality
            ? "-- Select Translation Quality first --"
            : "-- Select --";
        return (
            <select id={id} className={INPUT_CLASS} value={value} disabled={isDisabled} onChange={(e) => onChange(e.target.value)}>
                <option value="">{placeholder}</option>
                {withCurrent.map((o) => (
                    <option key={o} value={o}>{o}</option>
                ))}
            </select>
        );
    }
    if (fieldKey === "testDate") {
        return (
            <input id={id} type="date" required max={new Date().toISOString().slice(0, 10)} className={INPUT_CLASS} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        );
    }
    if (isDateTime && (!value || DATETIME_LOCAL_RE.test(value))) {
        return (
            <input id={id} type="datetime-local" step="1" max={getLocalDatetimeMax()} className={INPUT_CLASS} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        );
    }
    if (TEXTAREA_KEYS.has(fieldKey)) {
        return (
            <textarea
                id={id}
                rows={3}
                maxLength={FIELD_MAX_LENGTHS[fieldKey]}
                className={`${INPUT_CLASS} h-auto py-2 resize-y`}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />
        );
    }
    return (
        <input
            id={id}
            type="text"
            list={LANGUAGE_KEYS.has(fieldKey) ? LANGUAGE_LIST_ID : undefined}
            maxLength={FIELD_MAX_LENGTHS[fieldKey]}
            className={INPUT_CLASS}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

// Mounted only while the dialog is open, so every open starts from the
// entry's current values.
function EditForm({ entry, onDone, mutation }: {
    entry: ITesterLogEntry;
    onDone: () => void;
    mutation: ReturnType<typeof useUpdateTesterLogEntry>;
}) {
    const [values, setValues] = useState<FormValues>(() => initialValues(entry));
    const { mutate, isPending } = mutation;
    // Follows the edited Channel Tested, so picking Both reveals the
    // WhatsApp fields and picking a single channel hides them.
    const isCross = isCrossPlatform(values.channelTested);

    // Only fields the admin actually changed are sent, so values the editor
    // can't represent exactly are never rewritten by an untouched input. The
    // cross-platform fields are hidden, and so not sent, off a Both entry.
    const changes: FormValues = {};
    for (const [key, value] of Object.entries(values) as [EntryKey, string][]) {
        if (!isCross && CROSS_PLATFORM_ONLY.has(key)) continue;
        if (value !== ((entry[key] as string | undefined) ?? "")) changes[key] = value;
    }
    const hasChanges = Object.keys(changes).length > 0;

    function setField(key: EntryKey, value: string) {
        setValues((prev) => {
            const next = { ...prev, [key]: value };
            // Same rule the submission form applies (see
            // synthesizeOverallTestStatus): changing either channel's status
            // re-derives the overall one, which stays editable afterwards.
            if (key === "webOverallTestStatus" || key === "waOverallTestStatus") {
                const synthesized = isCrossPlatform(next.channelTested)
                    ? synthesizeOverallTestStatus(next.webOverallTestStatus, next.waOverallTestStatus)
                    : undefined;
                if (synthesized) next.overallTestStatus = synthesized;
            }
            const isPass = (next.overallTestStatus || "").trim().toLowerCase() === "pass";
            const wasPass = (prev.overallTestStatus || "").trim().toLowerCase() === "pass";
            if (isPass) {
                next.defectSeverity = "NA";
                next.defectIdBugRef = "NA";
            } else if (wasPass && (next.overallTestStatus || "").trim().toLowerCase() === "fail") {
                if (next.defectSeverity === "NA") next.defectSeverity = "";
                if (next.defectIdBugRef === "NA") next.defectIdBugRef = "";
            }
            if (key === "translationQuality") {
                const allowed = TRANSLATION_ERROR_MAP[value.trim()];
                if (allowed) {
                    if (allowed.length === 1) {
                        next.translationErrorType = allowed[0];
                    } else if (!allowed.includes(next.translationErrorType || "")) {
                        next.translationErrorType = "";
                    }
                } else {
                    next.translationErrorType = "";
                }
            }
            return next;
        });
    }

    function renderField(field: IEntryDetailField) {
        const readOnly = READ_ONLY_KEYS.has(field.key);
        const rawValue = (entry[field.key] as string | undefined) ?? "";
        const isChanged = field.key in changes;
        const isPass = (values.overallTestStatus || "").trim().toLowerCase() === "pass";
        const isDefectFieldDisabled = isPass && (field.key === "defectSeverity" || field.key === "defectIdBugRef");
        return (
            <div
                key={String(field.key)}
                className={`min-w-0 rounded-lg border px-3 py-2 ${
                    TEXTAREA_KEYS.has(field.key) ? "sm:col-span-2" : ""
                } ${
                    isChanged
                        ? "border-primary/40 bg-primary/5"
                        : "border-muted-foreground/10 bg-muted/30"
                }`}
            >
                <label
                    htmlFor={readOnly ? undefined : `tester-entry-edit-${field.key}`}
                    className="block text-[11px] font-medium leading-tight text-muted-foreground"
                >
                    {field.label}
                    {readOnly && <span className="ml-1 text-muted-foreground/60">(read-only)</span>}
                </label>
                <div className="mt-1">
                    {readOnly ? (
                        <p className="text-sm font-medium text-foreground tabular-nums whitespace-pre-wrap [overflow-wrap:anywhere]">
                            {(field.isDateTime ? formatDateTimeIST(rawValue) : rawValue) || (
                                <span className="text-muted-foreground/40">—</span>
                            )}
                        </p>
                    ) : (
                        <FieldInput
                            fieldKey={field.key}
                            isDateTime={field.isDateTime}
                            value={values[field.key] ?? ""}
                            disabled={isPending || isDefectFieldDisabled}
                            translationQuality={values.translationQuality}
                            onChange={(v) => setField(field.key, v)}
                        />
                    )}
                </div>
            </div>
        );
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!entry._id || !hasChanges) return;

        const effectiveDate = values.testDate || entry.testDate;
        if (effectiveDate && effectiveDate > new Date().toISOString().slice(0, 10)) {
            toast.error("Test Date cannot be in the future");
            return;
        }

        const asked = values.timeQuestionAsked !== undefined ? values.timeQuestionAsked : entry.timeQuestionAsked;
        const answered = values.timeAnswerReceived !== undefined ? values.timeAnswerReceived : entry.timeAnswerReceived;
        if (isTimeInFuture(asked, effectiveDate)) {
            toast.error("Time Question Asked cannot be in the future");
            return;
        }
        if (isTimeInFuture(answered, effectiveDate)) {
            toast.error("Time Answer Received cannot be in the future");
            return;
        }
        if (isTimeEarlier(answered, asked, effectiveDate)) {
            toast.error("Time Answer Received cannot be earlier than Time Question Asked");
            return;
        }

        if (isCross) {
            const waAsked = values.waTimeQuestionAsked !== undefined ? values.waTimeQuestionAsked : entry.waTimeQuestionAsked;
            const waAnswered = values.waTimeAnswerReceived !== undefined ? values.waTimeAnswerReceived : entry.waTimeAnswerReceived;
            if (isTimeInFuture(waAsked, effectiveDate)) {
                toast.error("WhatsApp Time Question Asked cannot be in the future");
                return;
            }
            if (isTimeInFuture(waAnswered, effectiveDate)) {
                toast.error("WhatsApp Time Answer Received cannot be in the future");
                return;
            }
            if (isTimeEarlier(waAnswered, waAsked, effectiveDate)) {
                toast.error("WhatsApp Time Answer Received cannot be earlier than WhatsApp Time Asked");
                return;
            }
        }

        const authorAssigned = values.authorAssignmentTime !== undefined ? values.authorAssignmentTime : entry.authorAssignmentTime;
        const authorCompleted = values.authorCompletionTime !== undefined ? values.authorCompletionTime : entry.authorCompletionTime;
        if (isTimeInFuture(authorAssigned, effectiveDate)) {
            toast.error("Author Assignment Time cannot be in the future");
            return;
        }
        if (isTimeInFuture(authorCompleted, effectiveDate)) {
            toast.error("Author Completion Time cannot be in the future");
            return;
        }
        if (isTimeEarlier(authorCompleted, authorAssigned, effectiveDate)) {
            toast.error("Author Completion Time cannot be earlier than Author Assignment Time");
            return;
        }

        for (let i = 1; i <= 5; i++) {
            const aKey = `reviewer${i}AssignmentTime` as EntryKey;
            const cKey = `reviewer${i}CompletionTime` as EntryKey;
            const rAssigned = (values[aKey] !== undefined ? values[aKey] : entry[aKey]) as string | undefined;
            const rCompleted = (values[cKey] !== undefined ? values[cKey] : entry[cKey]) as string | undefined;
            if (isTimeInFuture(rAssigned, effectiveDate)) {
                toast.error(`Reviewer ${i} Assignment Time cannot be in the future`);
                return;
            }
            if (isTimeInFuture(rCompleted, effectiveDate)) {
                toast.error(`Reviewer ${i} Completion Time cannot be in the future`);
                return;
            }
            if (isTimeEarlier(rCompleted, rAssigned, effectiveDate)) {
                toast.error(`Reviewer ${i} Completion Time cannot be earlier than Assignment Time`);
                return;
            }
        }

        const modAssigned = values.moderatorAssignmentTime !== undefined ? values.moderatorAssignmentTime : entry.moderatorAssignmentTime;
        const modCompleted = values.moderatorCompletionTime !== undefined ? values.moderatorCompletionTime : entry.moderatorCompletionTime;
        if (isTimeInFuture(modAssigned, effectiveDate)) {
            toast.error("Moderator Assignment Time cannot be in the future");
            return;
        }
        if (isTimeInFuture(modCompleted, effectiveDate)) {
            toast.error("Moderator Completion Time cannot be in the future");
            return;
        }
        if (isTimeEarlier(modCompleted, modAssigned, effectiveDate)) {
            toast.error("Moderator Completion Time cannot be earlier than Assignment Time");
            return;
        }

        const bv = values.buildVersion !== undefined ? values.buildVersion.trim() : entry.buildVersion?.trim();
        if (bv) {
            if (bv.length > TEXT_FIELD_LIMITS.BUILD_VERSION_MAX) {
                toast.error(`Build / Version cannot exceed ${TEXT_FIELD_LIMITS.BUILD_VERSION_MAX} characters`);
                return;
            }
            if (!BUILD_VERSION_REGEX.test(bv)) {
                toast.error("Build / Version must contain numbers and valid version characters (e.g. 1.0, 2.1.0, v1.0.1)");
                return;
            }
        }

        const qt = values.queryText !== undefined ? values.queryText.trim() : entry.queryText?.trim();
        if (qt) {
            if (qt.length < TEXT_FIELD_LIMITS.QUERY_TEXT_MIN) {
                toast.error(`Query Text must be at least ${TEXT_FIELD_LIMITS.QUERY_TEXT_MIN} characters`);
                return;
            }
            const fullQt = values.queryText !== undefined ? values.queryText : (entry.queryText || "");
            if (fullQt.length > TEXT_FIELD_LIMITS.QUERY_TEXT_MAX) {
                toast.error(`Query Text cannot exceed ${TEXT_FIELD_LIMITS.QUERY_TEXT_MAX} characters`);
                return;
            }
        }

        const tid = values.threadId !== undefined ? values.threadId.trim() : entry.threadId?.trim();
        if (tid) {
            if (tid.length > TEXT_FIELD_LIMITS.THREAD_ID_MAX) {
                toast.error(`Thread ID cannot exceed ${TEXT_FIELD_LIMITS.THREAD_ID_MAX} characters`);
                return;
            }
            if (!THREAD_ID_REGEX.test(tid)) {
                toast.error("Thread ID contains invalid characters");
                return;
            }
        }

        if (isCross) {
            const wtid = values.waThreadId !== undefined ? values.waThreadId.trim() : entry.waThreadId?.trim();
            if (wtid) {
                if (wtid.length > TEXT_FIELD_LIMITS.WA_THREAD_ID_MAX) {
                    toast.error(`WhatsApp Thread cannot exceed ${TEXT_FIELD_LIMITS.WA_THREAD_ID_MAX} characters`);
                    return;
                }
                if (!WA_THREAD_ID_REGEX.test(wtid)) {
                    toast.error("WhatsApp Thread / Phone Number format is invalid");
                    return;
                }
            }
        }

        for (const lKey of ["languageTested", "originalLanguage", "translatedLanguage"] as EntryKey[]) {
            const lVal = (values[lKey] !== undefined ? values[lKey] : entry[lKey]) as string | undefined;
            if (lVal?.trim() && lVal.trim() !== "Others") {
                if (lVal.trim().length > TEXT_FIELD_LIMITS.LANGUAGE_MAX || !LANGUAGE_NAME_REGEX.test(lVal.trim())) {
                    toast.error("Language name must be letters only and under 50 characters");
                    return;
                }
            }
        }

        const an = values.authorsName !== undefined ? values.authorsName.trim() : entry.authorsName?.trim();
        if (an) {
            if (an.length < TEXT_FIELD_LIMITS.NAME_MIN || an.length > TEXT_FIELD_LIMITS.NAME_MAX || !PERSON_NAME_REGEX.test(an)) {
                toast.error("Author Name must be 2-100 characters and contain letters only");
                return;
            }
        }
        for (let i = 1; i <= 5; i++) {
            const rKey = `reviewer${i}Name` as EntryKey;
            const rn = (values[rKey] !== undefined ? values[rKey] : entry[rKey]) as string | undefined;
            if (rn?.trim()) {
                if (rn.trim().length < TEXT_FIELD_LIMITS.NAME_MIN || rn.trim().length > TEXT_FIELD_LIMITS.NAME_MAX || !PERSON_NAME_REGEX.test(rn.trim())) {
                    toast.error(`Reviewer ${i} Name must be 2-100 characters and contain letters only`);
                    return;
                }
            }
        }
        const mn = values.moderatorName !== undefined ? values.moderatorName.trim() : entry.moderatorName?.trim();
        if (mn) {
            if (mn.length < TEXT_FIELD_LIMITS.NAME_MIN || mn.length > TEXT_FIELD_LIMITS.NAME_MAX || !PERSON_NAME_REGEX.test(mn)) {
                toast.error("Moderator Name must be 2-100 characters and contain letters only");
                return;
            }
        }

        const cNotes = values.crossPlatformDiscrepancyNotes !== undefined ? values.crossPlatformDiscrepancyNotes : entry.crossPlatformDiscrepancyNotes;
        if (cNotes && cNotes.length > TEXT_FIELD_LIMITS.DISCREPANCY_NOTES_MAX) {
            toast.error(`Discrepancy Notes cannot exceed ${TEXT_FIELD_LIMITS.DISCREPANCY_NOTES_MAX} characters`);
            return;
        }

        const bugRef = values.defectIdBugRef !== undefined ? values.defectIdBugRef.trim() : entry.defectIdBugRef?.trim();
        if (bugRef && bugRef !== "NA") {
            if (bugRef.length > TEXT_FIELD_LIMITS.DEFECT_URL_MAX) {
                toast.error(`Defect URL cannot exceed ${TEXT_FIELD_LIMITS.DEFECT_URL_MAX} characters`);
                return;
            }
            if (!HTTP_URL_REGEX.test(bugRef)) {
                toast.error("Defect ID must be 'NA' or a valid URL starting with http:// or https://");
                return;
            }
        }

        const rNotes = values.testerRemarksNotes !== undefined ? values.testerRemarksNotes.trim() : entry.testerRemarksNotes?.trim();
        if (rNotes) {
            if (rNotes.length < TEXT_FIELD_LIMITS.REMARKS_NOTES_MIN) {
                toast.error(`Remarks Details must be at least ${TEXT_FIELD_LIMITS.REMARKS_NOTES_MIN} characters`);
                return;
            }
            const fullRn = values.testerRemarksNotes !== undefined ? values.testerRemarksNotes : (entry.testerRemarksNotes || "");
            if (fullRn.length > TEXT_FIELD_LIMITS.REMARKS_NOTES_MAX) {
                toast.error(`Remarks Details cannot exceed ${TEXT_FIELD_LIMITS.REMARKS_NOTES_MAX} characters`);
                return;
            }
        }

        mutate({ id: entry._id, changes }, { onSuccess: onDone });
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
            <datalist id={LANGUAGE_LIST_ID}>
                {INDIAN_LANGUAGES_OPTIONS.filter((o) => o !== "Others").map((o) => (
                    <option key={o} value={o} />
                ))}
            </datalist>

            <ScrollArea className="flex-1 min-h-0 bg-muted/20">
                <div className="space-y-4 p-4 sm:p-6">
                    {entryDetailGroupsFor(isCross).map((group) => (
                        <Fragment key={group.title}>
                            <EntryDetailSection title={group.title} icon={group.icon}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 p-3">
                                    {group.fields.map(renderField)}
                                </div>
                            </EntryDetailSection>
                            {isCross && group.title === CROSS_PLATFORM_AFTER_GROUP && (
                                <>
                                    <CrossPlatformComparison
                                        values={{ ...entry, ...values }}
                                        renderField={renderField}
                                        changedCount={{
                                            web: CROSS_PLATFORM_FIELD_PAIRS.filter((p) => p.webKey in changes).length,
                                            wa: CROSS_PLATFORM_FIELD_PAIRS.filter((p) => p.waKey in changes).length,
                                        }}
                                    />
                                    <EntryDetailSection title="Cross-Platform Discrepancy Notes" icon={StickyNote}>
                                        <div className="grid grid-cols-1 gap-2 p-3">
                                            {renderField(CROSS_PLATFORM_NOTES_FIELD)}
                                        </div>
                                    </EntryDetailSection>
                                </>
                            )}
                        </Fragment>
                    ))}
                </div>
            </ScrollArea>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-3">
                <p className="text-xs text-muted-foreground">
                    {hasChanges
                        ? `${Object.keys(changes).length} field${Object.keys(changes).length === 1 ? "" : "s"} changed. [Auto] times are recalculated on save.`
                        : "No changes yet."}
                </p>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onDone}
                        disabled={isPending}
                        className="px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isPending || !hasChanges}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isPending ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>
        </form>
    );
}

interface TesterEntryEditDialogProps {
    entry: ITesterLogEntry;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Admin edit of one tester log entry - the same layout as
// TesterEntryDetailDialog (View), with an input in place of each value.
export function TesterEntryEditDialog({ entry, open, onOpenChange }: TesterEntryEditDialogProps) {
    // Owned here rather than in EditForm so the dialog can refuse to close
    // (Esc, overlay, X) while a save is still in flight.
    const mutation = useUpdateTesterLogEntry();

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) onOpenChange(next); }}>
            {/* sm:max-w-* - see TesterEntryDetailDialog for why. */}
            <DialogContent className="w-[96vw] sm:max-w-[1600px] h-[92vh] flex flex-col gap-0 p-0 overflow-hidden rounded-xl shadow-xl">
                <DialogHeader className="px-6 pt-5 pb-4 pr-12 border-b text-left gap-2">
                    <DialogTitle className="text-lg font-semibold">Edit Test Entry</DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            {entry.testerName || "Unknown tester"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {entry.testDate || "No date"}
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                            <Hash className="h-3.5 w-3.5 shrink-0" />
                            Test ID: <span className="font-mono [overflow-wrap:anywhere]">{entry.testId || "—"}</span>
                        </span>
                    </DialogDescription>
                </DialogHeader>
                {open && <EditForm entry={entry} onDone={() => onOpenChange(false)} mutation={mutation} />}
            </DialogContent>
        </Dialog>
    );
}
