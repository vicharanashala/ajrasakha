import { Fragment, useState, type FormEvent } from "react";
import { CalendarDays, Hash, Loader2, StickyNote, User } from "lucide-react";
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
    ALLOCATED_TO_REVIEWER_OPTIONS,
    FOLLOW_UP_MODEL_OPTIONS,
    ANSWER_CORRECT_OPTIONS,
    EXPERT_DISPLAYED_OPTIONS,
    YES_NO_NA_DUP_OPTIONS,
    MSG_120_OPTIONS,
    NOTIFICATION_OPTIONS,
    YES_NO_PARTIAL_NA_OPTIONS,
    DB_SAVE_OPTIONS,
    QID_CONSISTENT_OPTIONS,
    OVERALL_STATUS_OPTIONS,
    STATUS_OPTIONS,
    TRANSLATION_QUALITY_OPTIONS,
    DEFECT_SEVERITY_OPTIONS,
    INDIAN_LANGUAGES_OPTIONS,
    VOICE_QUALITY_OPTIONS,
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
    allocatedToReviewer: ALLOCATED_TO_REVIEWER_OPTIONS,
    followUpQInReviewModel: FOLLOW_UP_MODEL_OPTIONS,
    answerScientificallyCorrect: ANSWER_CORRECT_OPTIONS,
    expertNameDisplayed: EXPERT_DISPLAYED_OPTIONS,
    correctExpertNameDisplayed: YES_NO_NA_DUP_OPTIONS,
    correctSourceLinksProvided: YES_NO_NA_DUP_OPTIONS,
    msg120MinShownToUser: MSG_120_OPTIONS,
    notificationReceived: NOTIFICATION_OPTIONS,
    notificationOnSameThread: NOTIFICATION_OPTIONS,
    notificationLinkedCorrectQId: NOTIFICATION_OPTIONS,
    voiceInputWorking: NOTIFICATION_OPTIONS,
    voiceOutputWorking: NOTIFICATION_OPTIONS,
    voiceInputQuality: VOICE_QUALITY_OPTIONS,
    voiceOutputQuality: VOICE_QUALITY_OPTIONS,
    weatherQAnsweredCorrectly: YES_NO_PARTIAL_NA_OPTIONS,
    mandiPriceQCorrect: YES_NO_PARTIAL_NA_OPTIONS,
    schemeQCorrect: YES_NO_PARTIAL_NA_OPTIONS,
    whatsappVsWebAnswerMatch: YES_NO_PARTIAL_NA_OPTIONS,
    questionSavedInDb: DB_SAVE_OPTIONS,
    answerSavedInDb: DB_SAVE_OPTIONS,
    qIdConsistentAcrossSystems: QID_CONSISTENT_OPTIONS,
    overallTestStatus: OVERALL_STATUS_OPTIONS,
    defectSeverity: DEFECT_SEVERITY_OPTIONS,
    status: STATUS_OPTIONS,
    waSlaStatus: SLA_STATUS_OPTIONS,
    waNotificationReceived: NOTIFICATION_OPTIONS,
    waVoiceInputWorking: NOTIFICATION_OPTIONS,
    waVoiceOutputWorking: NOTIFICATION_OPTIONS,
    webOverallTestStatus: OVERALL_STATUS_OPTIONS,
    waOverallTestStatus: OVERALL_STATUS_OPTIONS,
};

// The form lets testers pick a language or type their own ("Others"), so
// these are free text with the standard list as suggestions.
const LANGUAGE_KEYS = new Set<EntryKey>(["languageTested", "originalLanguage", "translatedLanguage"]);
const LANGUAGE_LIST_ID = "tester-entry-edit-languages";

const TEXTAREA_KEYS = new Set<EntryKey>([
    "queryText",
    "reviewerRemarks",
    "testerRemarks",
    "voiceIssueDescription",
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
    return values;
}

function FieldInput({ fieldKey, isDateTime, value, disabled, onChange }: {
    fieldKey: EntryKey;
    isDateTime?: boolean;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    const id = `tester-entry-edit-${fieldKey}`;
    const options = SELECT_OPTIONS[fieldKey];

    if (options) {
        // Keep a stored value that isn't in today's list selectable, so
        // opening the editor never silently changes it.
        const withCurrent = value && !options.includes(value) ? [value, ...options] : options;
        return (
            <select id={id} className={INPUT_CLASS} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
                <option value="">-- Select --</option>
                {withCurrent.map((o) => (
                    <option key={o} value={o}>{o}</option>
                ))}
            </select>
        );
    }
    if (fieldKey === "testDate") {
        return (
            <input id={id} type="date" required className={INPUT_CLASS} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        );
    }
    if (isDateTime && (!value || DATETIME_LOCAL_RE.test(value))) {
        return (
            <input id={id} type="datetime-local" step="1" className={INPUT_CLASS} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        );
    }
    if (TEXTAREA_KEYS.has(fieldKey)) {
        return (
            <textarea id={id} rows={3} className={`${INPUT_CLASS} h-auto py-2 resize-y`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        );
    }
    return (
        <input
            id={id}
            type="text"
            list={LANGUAGE_KEYS.has(fieldKey) ? LANGUAGE_LIST_ID : undefined}
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
            return next;
        });
    }

    function renderField(field: IEntryDetailField) {
        const readOnly = READ_ONLY_KEYS.has(field.key);
        const rawValue = (entry[field.key] as string | undefined) ?? "";
        const isChanged = field.key in changes;
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
                            disabled={isPending}
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
