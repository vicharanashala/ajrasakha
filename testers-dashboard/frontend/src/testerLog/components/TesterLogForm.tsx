import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FormSection } from "./FormSection";
import { TimeInput } from "./TimeInput";
import { useTesterLogSubmit } from "../hooks/useTesterLogSubmit";
import { Plus, ExternalLink } from "lucide-react";
import { useZohoTicketStatuses } from "../../hooks/useZohoTicketStatuses";
import { CreateZohoTicketModal } from "./CreateZohoTicketModal";
import type { ITesterLogEntry } from "../types";
import {
    TYPE_OF_QUESTION_OPTIONS,
    isDynamicQuestionType,
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

type FormValues = Omit<ITesterLogEntry, "_id" | "submittedByUserId" | "submittedByEmail" | "testerName" | "createdAt" | "updatedAt">;

function getTodayDateString(): string {
    const d = new Date();
    try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        return formatter.format(d);
    } catch {
        const istShifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
        return istShifted.toISOString().slice(0, 10);
    }
}

function parseToMs(str?: string, defaultDate?: string): number | null {
    if (!str || !str.trim()) return null;
    const s = str.trim();

    if (s.includes("-") || s.includes("/")) {
        const parsed = Date.parse(s.includes("T") ? s : s.replace(" ", "T"));
        if (!isNaN(parsed)) return parsed;
    }

    const parts = s.split(":").map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        if (defaultDate && (defaultDate.includes("-") || defaultDate.includes("/"))) {
            const dateStr = defaultDate.trim();
            const timeStr = `${String(parts[0]).padStart(2, "0")}:${String(parts[1]).padStart(2, "0")}:${String(parts[2] || 0).padStart(2, "0")}`;
            const combined = Date.parse(`${dateStr}T${timeStr}`);
            if (!isNaN(combined)) return combined;
        }
        const secs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
        return secs * 1000;
    }

    return null;
}

function hmsDiff(start?: string, end?: string, defaultDate?: string): string {
    const sMs = parseToMs(start, defaultDate);
    const eMs = parseToMs(end, defaultDate);
    if (sMs === null || eMs === null || eMs < sMs) return "";

    const diffSecs = Math.floor((eMs - sMs) / 1000);
    const h = Math.floor(diffSecs / 3600);
    const m = Math.floor((diffSecs % 3600) / 60);
    const s = diffSecs % 60;

    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

const inputClass =
    "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&_option]:bg-background [&_option]:text-foreground";

const labelClass = "text-sm font-medium text-foreground";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <label className={labelClass}>{label}</label>
            {children}
        </div>
    );
}

function TextInput({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <Field label={label}>
            <input type="text" className={inputClass} {...props} />
        </Field>
    );
}

function SelectInput({ label, options, ...props }: { label: string; options: string[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <Field label={label}>
            <select className={inputClass} {...props}>
                <option value="">-- Select --</option>
                {options.map(o => (
                    <option key={o} value={o}>{o}</option>
                ))}
            </select>
        </Field>
    );
}

function TextareaInput({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <label className={labelClass}>{label}</label>
            <textarea rows={3} className={inputClass + " h-auto py-2 resize-y"} {...props} />
        </div>
    );
}

function LanguageSelectInput({
    label,
    value,
    onChange,
}: {
    label: string;
    value?: string;
    onChange: (val: string) => void;
}) {
    const val = value || "";
    const isStandard = INDIAN_LANGUAGES_OPTIONS.filter(o => o !== "Others").includes(val);
    const isOthers = !isStandard && val !== "";

    const selectedOption = isStandard ? val : (isOthers || val === "Others") ? "Others" : "";
    const customText = isOthers && val !== "Others" ? val : "";

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sel = e.target.value;
        if (sel === "Others") {
            onChange(customText || "Others");
        } else {
            onChange(sel);
        }
    };

    const handleCustomTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const text = e.target.value;
        onChange(text ? text : "Others");
    };

    return (
        <Field label={label}>
            <select className={inputClass} value={selectedOption} onChange={handleSelectChange}>
                <option value="">-- Select --</option>
                {INDIAN_LANGUAGES_OPTIONS.map(o => (
                    <option key={o} value={o}>{o}</option>
                ))}
            </select>
            {selectedOption === "Others" && (
                <input
                    type="text"
                    className={inputClass + " mt-1.5"}
                    placeholder="Specify language (e.g. Hinglish, Telugu + English)"
                    value={customText}
                    onChange={handleCustomTextChange}
                />
            )}
        </Field>
    );
}

function extractZohoTicketId(urlOrId?: string): string {
    if (!urlOrId) return "";
    const trimmed = urlOrId.trim();
    const parts = trimmed.split("/");
    return parts[parts.length - 1] || trimmed;
}

function getStatusBadgeStyle(status?: string): { bg: string; text: string; dot: string } {
    const s = (status || "").toLowerCase();
    if (s === "open") {
        return { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" };
    }
    if (s === "closed" || s === "resolved") {
        return { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" };
    }
    if (s === "on hold") {
        return { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" };
    }
    if (s === "escalated") {
        return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" };
    }
    return { bg: "bg-muted/60 border-border", text: "text-muted-foreground", dot: "bg-muted-foreground" };
}

function DefectIdBugRefInput({
    value,
    onChange,
    onOpenCreateModal,
    zohoStatuses,
}: {
    value?: string;
    onChange: (val: string) => void;
    onOpenCreateModal: () => void;
    zohoStatuses?: Record<string, any>;
}) {
    const val = value || "";
    const selectedOption = val === "NA" ? "NA" : val !== "" ? "Zoho Ticket URL" : "";
    const customUrl = val !== "NA" && val !== "Zoho Ticket URL" ? val : "";

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sel = e.target.value;
        if (sel === "NA") {
            onChange("NA");
        } else if (sel === "Zoho Ticket URL") {
            onChange(customUrl || "Zoho Ticket URL");
        } else {
            onChange("");
        }
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const urlText = e.target.value;
        onChange(urlText ? urlText : "Zoho Ticket URL");
    };

    const isValidUrl = customUrl.startsWith("http://") || customUrl.startsWith("https://");
    const ticketId = extractZohoTicketId(customUrl);
    const cachedStatus = ticketId && zohoStatuses ? zohoStatuses[ticketId] : null;
    const badgeStyle = getStatusBadgeStyle(cachedStatus?.status);

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
                <label className={labelClass}>Defect ID / Bug Ref</label>
                <button
                    type="button"
                    onClick={onOpenCreateModal}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors py-0.5 px-2 rounded-md hover:bg-primary/10 border border-primary/20"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Create Zoho Ticket
                </button>
            </div>

            <select className={inputClass} value={selectedOption} onChange={handleSelectChange}>
                <option value="">-- Select --</option>
                <option value="NA">NA</option>
                <option value="Zoho Ticket URL">Zoho Ticket URL</option>
            </select>

            {selectedOption === "Zoho Ticket URL" && (
                <div className="mt-1.5 flex flex-col gap-2">
                    <input
                        type="text"
                        className={inputClass}
                        placeholder="Paste Zoho ticket URL (e.g. https://desk.zoho.in/...)"
                        value={customUrl}
                        onChange={handleUrlChange}
                    />

                    {isValidUrl && (
                        <div className={`p-2.5 rounded-md border flex items-center justify-between text-xs transition-colors ${badgeStyle.bg}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${badgeStyle.dot}`} />
                                <span className="font-semibold text-foreground">
                                    Ticket {cachedStatus?.ticketNumber ? `#${cachedStatus.ticketNumber}` : (ticketId ? `#${ticketId}` : "")}
                                </span>
                                {cachedStatus?.status && (
                                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium border ${badgeStyle.bg} ${badgeStyle.text}`}>
                                        {cachedStatus.status}
                                    </span>
                                )}
                                {cachedStatus?.team && (
                                    <span className="text-muted-foreground text-[11px]">
                                        • Team: {cachedStatus.team}
                                    </span>
                                )}
                            </div>
                            <a
                                href={customUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline font-medium inline-flex items-center gap-1 shrink-0 ml-2"
                            >
                                Open in Zoho
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface TesterLogFormProps {
    testerName: string;
    userEmail?: string;
    onSuccess?: () => void;
}

export function TesterLogForm({ testerName, userEmail, onSuccess }: TesterLogFormProps) {
    const { mutate, isPending, isSuccess } = useTesterLogSubmit();
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const { data: zohoData } = useZohoTicketStatuses();
    const zohoStatuses = zohoData?.statuses;

    const todayDate = getTodayDateString();

    const { register, handleSubmit, watch, setValue, reset } = useForm<FormValues>({
        defaultValues: { testDate: todayDate },
    });

    // Watch fields for dynamic workflow and TAT auto-computations
    const [
        testDate,
        typeOfQuestion,
        timeQuestionAsked, timeAnswerReceived,
        authorAssignmentTime, authorCompletionTime,
        reviewer1AssignmentTime, reviewer1CompletionTime,
        reviewer2AssignmentTime, reviewer2CompletionTime,
        reviewer3AssignmentTime, reviewer3CompletionTime,
        reviewer4AssignmentTime, reviewer4CompletionTime,
        reviewer5AssignmentTime, reviewer5CompletionTime,
        moderatorAssignmentTime, moderatorCompletionTime,
    ] = watch([
        "testDate",
        "typeOfQuestion",
        "timeQuestionAsked", "timeAnswerReceived",
        "authorAssignmentTime", "authorCompletionTime",
        "reviewer1AssignmentTime", "reviewer1CompletionTime",
        "reviewer2AssignmentTime", "reviewer2CompletionTime",
        "reviewer3AssignmentTime", "reviewer3CompletionTime",
        "reviewer4AssignmentTime", "reviewer4CompletionTime",
        "reviewer5AssignmentTime", "reviewer5CompletionTime",
        "moderatorAssignmentTime", "moderatorCompletionTime",
    ]);

    const isDynamic = isDynamicQuestionType(typeOfQuestion);

    useEffect(() => { setValue("responseTimeMins", hmsDiff(timeQuestionAsked, timeAnswerReceived, testDate)); }, [timeQuestionAsked, timeAnswerReceived, testDate]);
    useEffect(() => { setValue("authorTatMins", hmsDiff(authorAssignmentTime, authorCompletionTime, testDate)); }, [authorAssignmentTime, authorCompletionTime, testDate]);
    useEffect(() => { setValue("review1TatMins", hmsDiff(reviewer1AssignmentTime, reviewer1CompletionTime, testDate)); }, [reviewer1AssignmentTime, reviewer1CompletionTime, testDate]);
    useEffect(() => { setValue("review2TatMins", hmsDiff(reviewer2AssignmentTime, reviewer2CompletionTime, testDate)); }, [reviewer2AssignmentTime, reviewer2CompletionTime, testDate]);
    useEffect(() => { setValue("review3TatMins", hmsDiff(reviewer3AssignmentTime, reviewer3CompletionTime, testDate)); }, [reviewer3AssignmentTime, reviewer3CompletionTime, testDate]);
    useEffect(() => { setValue("review4TatMins", hmsDiff(reviewer4AssignmentTime, reviewer4CompletionTime, testDate)); }, [reviewer4AssignmentTime, reviewer4CompletionTime, testDate]);
    useEffect(() => { setValue("review5TatMins", hmsDiff(reviewer5AssignmentTime, reviewer5CompletionTime, testDate)); }, [reviewer5AssignmentTime, reviewer5CompletionTime, testDate]);
    useEffect(() => { setValue("moderatorTatMins", hmsDiff(moderatorAssignmentTime, moderatorCompletionTime, testDate)); }, [moderatorAssignmentTime, moderatorCompletionTime, testDate]);

    const responseTimeMins = watch("responseTimeMins");
    const authorTatMins = watch("authorTatMins");
    const review1TatMins = watch("review1TatMins");
    const review2TatMins = watch("review2TatMins");
    const review3TatMins = watch("review3TatMins");
    const review4TatMins = watch("review4TatMins");
    const review5TatMins = watch("review5TatMins");
    const moderatorTatMins = watch("moderatorTatMins");

    const [languageTested, originalLanguage, translatedLanguage, defectIdBugRef] = watch([
        "languageTested",
        "originalLanguage",
        "translatedLanguage",
        "defectIdBugRef",
    ]);

    useEffect(() => { if (isSuccess) { reset({ testDate: getTodayDateString() }); onSuccess?.(); } }, [isSuccess]);

    const onSubmit = (data: FormValues) => {
        const payload: FormValues = {
            ...data,
            testDate: getTodayDateString(),
        };
        if (isDynamic) {
            delete payload.allocatedToReviewer;
            delete payload.authorsName;
            delete payload.authorAssignmentTime;
            delete payload.authorCompletionTime;
            delete payload.authorTatMins;
            delete payload.reviewer1Name;
            delete payload.reviewer1AssignmentTime;
            delete payload.reviewer1CompletionTime;
            delete payload.review1TatMins;
            delete payload.reviewer2Name;
            delete payload.reviewer2AssignmentTime;
            delete payload.reviewer2CompletionTime;
            delete payload.review2TatMins;
            delete payload.reviewer3Name;
            delete payload.reviewer3AssignmentTime;
            delete payload.reviewer3CompletionTime;
            delete payload.review3TatMins;
            delete payload.reviewer4Name;
            delete payload.reviewer4AssignmentTime;
            delete payload.reviewer4CompletionTime;
            delete payload.review4TatMins;
            delete payload.reviewer5Name;
            delete payload.reviewer5AssignmentTime;
            delete payload.reviewer5CompletionTime;
            delete payload.review5TatMins;
            delete payload.moderatorName;
            delete payload.moderatorAssignmentTime;
            delete payload.moderatorCompletionTime;
            delete payload.moderatorTatMins;
        }
        mutate(payload);
    };

    return (
        <>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Section 1 */}
            <FormSection title="1. Basic Info">
                <Field label="Test Date">
                    <input
                        type="date"
                        className={inputClass + " bg-muted text-muted-foreground cursor-default"}
                        {...register("testDate")}
                        value={testDate || todayDate}
                        readOnly
                    />
                </Field>
                <Field label="Tester Name">
                    <input type="text" className={inputClass + " bg-muted text-muted-foreground cursor-default"} value={testerName} readOnly />
                </Field>
                <SelectInput label="Type of Question" options={TYPE_OF_QUESTION_OPTIONS} {...register("typeOfQuestion")} />
                <TextInput label="Build / Version" placeholder="e.g. 2.1.0" {...register("buildVersion")} />
                <SelectInput label="Channel Tested" options={CHANNEL_OPTIONS} {...register("channelTested")} />
                <LanguageSelectInput
                    label="Language Tested"
                    value={languageTested}
                    onChange={val => setValue("languageTested", val)}
                />
                <TextInput label="Thread ID" placeholder="Thread ID" {...register("threadId")} />
                <SelectInput label="Question Category" options={QUESTION_CATEGORY_OPTIONS} {...register("questionCategory")} />
                <TextareaInput label="Query Text (Original)" placeholder="Enter the original query text..." {...register("queryText")} />
            </FormSection>

            {/* Section 2 */}
            <FormSection title="2. Timing & SLA">
                <TimeInput label="Time Question Asked" {...register("timeQuestionAsked")} />
                <TimeInput label="Time Answer Received" {...register("timeAnswerReceived")} />
                <TimeInput label="Response Time [Auto]" readOnly value={responseTimeMins ?? ""} onChange={() => {}} />
                <SelectInput label="SLA Status" options={SLA_STATUS_OPTIONS} {...register("slaStatus")} />
            </FormSection>

            {/* Section 3 */}
            <FormSection title="3. Question Quality">
                <SelectInput label="Question in Review Model?" options={REVIEW_MODEL_OPTIONS} {...register("questionInReviewModel")} />
                <SelectInput label="Question Correctly Framed?" options={QUESTION_FRAMED_OPTIONS} {...register("questionCorrectlyFramed")} />
                <LanguageSelectInput
                    label="Original Language"
                    value={originalLanguage}
                    onChange={val => setValue("originalLanguage", val)}
                />
                <LanguageSelectInput
                    label="Translated Language"
                    value={translatedLanguage}
                    onChange={val => setValue("translatedLanguage", val)}
                />
                <SelectInput label="Translation Quality" options={TRANSLATION_QUALITY_OPTIONS} {...register("translationQuality")} />
                <TextInput label="Translation Error Type" placeholder="Describe error type" {...register("translationErrorType")} />
                <TextInput label="Tagging" placeholder="Tags" {...register("tagging")} />
            </FormSection>

            {/* Section 4 */}
            {!isDynamic && (
                <FormSection title="4. Reviewer Workflow" defaultOpen={false}>
                    <SelectInput label="Allocated to Reviewer?" options={ALLOCATED_TO_REVIEWER_OPTIONS} {...register("allocatedToReviewer")} />

                    <div className="sm:col-span-2 lg:col-span-3 border-t border-border pt-3 mt-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Author</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <TextInput label="Author Name" {...register("authorsName")} />
                            <TimeInput label="Author Assignment Time" {...register("authorAssignmentTime")} />
                            <TimeInput label="Author Completion Time" {...register("authorCompletionTime")} />
                            <TimeInput label="Author TAT [Auto]" readOnly value={authorTatMins ?? ""} onChange={() => {}} />
                        </div>
                    </div>

                    {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} className="sm:col-span-2 lg:col-span-3 border-t border-border pt-3 mt-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Reviewer {n}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <TextInput label={`Reviewer ${n} Name`} {...register(`reviewer${n}Name` as any)} />
                                <TimeInput label={`Reviewer ${n} Assignment Time`} {...register(`reviewer${n}AssignmentTime` as any)} />
                                <TimeInput label={`Reviewer ${n} Completion Time`} {...register(`reviewer${n}CompletionTime` as any)} />
                                <TimeInput label={`Review ${n} TAT [Auto]`} readOnly value={[review1TatMins, review2TatMins, review3TatMins, review4TatMins, review5TatMins][n - 1] ?? ""} onChange={() => {}} />
                            </div>
                        </div>
                    ))}

                    <div className="sm:col-span-2 lg:col-span-3 border-t border-border pt-3 mt-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Moderator</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <TextInput label="Moderator Name" {...register("moderatorName")} />
                            <TimeInput label="Moderator Assignment Time" {...register("moderatorAssignmentTime")} />
                            <TimeInput label="Moderator Completion Time" {...register("moderatorCompletionTime")} />
                            <TimeInput label="Moderator TAT [Auto]" readOnly value={moderatorTatMins ?? ""} onChange={() => {}} />
                        </div>
                    </div>
                </FormSection>
            )}

            {/* Section 5 (or 4 if dynamic) */}
            <FormSection title={`${isDynamic ? 4 : 5}. Answer Quality`} defaultOpen={false}>
                <SelectInput label="Follow-up Q in Review Model?" options={FOLLOW_UP_MODEL_OPTIONS} {...register("followUpQInReviewModel")} />
                <SelectInput label="Answer Scientifically Correct?" options={ANSWER_CORRECT_OPTIONS} {...register("answerScientificallyCorrect")} />
                <SelectInput label="Expert Name Displayed?" options={EXPERT_DISPLAYED_OPTIONS} {...register("expertNameDisplayed")} />
                <SelectInput label="Correct Expert Name Displayed?" options={YES_NO_NA_DUP_OPTIONS} {...register("correctExpertNameDisplayed")} />
                <SelectInput label="Correct Source Links Provided?" options={YES_NO_NA_DUP_OPTIONS} {...register("correctSourceLinksProvided")} />
            </FormSection>

            {/* Section 6 (or 5 if dynamic) */}
            <FormSection title={`${isDynamic ? 5 : 6}. Notifications & Voice`} defaultOpen={false}>
                <SelectInput label="120-min Msg Shown to User?" options={MSG_120_OPTIONS} {...register("msg120MinShownToUser")} />
                <SelectInput label="Notification Received?" options={NOTIFICATION_OPTIONS} {...register("notificationReceived")} />
                <SelectInput label="Notification on Same Thread?" options={NOTIFICATION_OPTIONS} {...register("notificationOnSameThread")} />
                <SelectInput label="Notification Linked Correct Q-ID?" options={NOTIFICATION_OPTIONS} {...register("notificationLinkedCorrectQId")} />
                <SelectInput label="Voice Input Working?" options={NOTIFICATION_OPTIONS} {...register("voiceInputWorking")} />
                <SelectInput label="Voice Output Working?" options={NOTIFICATION_OPTIONS} {...register("voiceOutputWorking")} />
                <SelectInput label="Voice Input Quality" options={VOICE_QUALITY_OPTIONS} {...register("voiceInputQuality")} />
                <SelectInput label="Voice Output Quality" options={VOICE_QUALITY_OPTIONS} {...register("voiceOutputQuality")} />
                <TextInput label="Voice Issue Description" placeholder="Describe any voice issue..." {...register("voiceIssueDescription")} />
            </FormSection>

            {/* Section 7 (or 6 if dynamic) */}
            <FormSection title={`${isDynamic ? 6 : 7}. Domain Checks`} defaultOpen={false}>
                <SelectInput label="Weather Q Answered Correctly?" options={YES_NO_PARTIAL_NA_OPTIONS} {...register("weatherQAnsweredCorrectly")} />
                <SelectInput label="Mandi Price Q Correct?" options={YES_NO_PARTIAL_NA_OPTIONS} {...register("mandiPriceQCorrect")} />
                <SelectInput label="Scheme Q Correct?" options={YES_NO_PARTIAL_NA_OPTIONS} {...register("schemeQCorrect")} />
                <SelectInput label="Question Saved in DB?" options={DB_SAVE_OPTIONS} {...register("questionSavedInDb")} />
                <SelectInput label="Answer Saved in DB?" options={DB_SAVE_OPTIONS} {...register("answerSavedInDb")} />
                <SelectInput label="Q-ID Consistent Across Systems?" options={QID_CONSISTENT_OPTIONS} {...register("qIdConsistentAcrossSystems")} />
                <SelectInput label="WhatsApp vs Web Answer Match?" options={YES_NO_PARTIAL_NA_OPTIONS} {...register("whatsappVsWebAnswerMatch")} />
            </FormSection>

            {/* Section 8 (or 7 if dynamic) */}
            <FormSection title={`${isDynamic ? 7 : 8}. Defects & Remarks`} defaultOpen={false}>
                <SelectInput label="Overall Test Status" options={OVERALL_STATUS_OPTIONS} {...register("overallTestStatus")} />
                <SelectInput label="Defect Severity" options={DEFECT_SEVERITY_OPTIONS} {...register("defectSeverity")} />
                <DefectIdBugRefInput
                    value={defectIdBugRef}
                    onChange={val => setValue("defectIdBugRef", val)}
                    onOpenCreateModal={() => setIsTicketModalOpen(true)}
                    zohoStatuses={zohoStatuses}
                />
                <TextareaInput label="Reviewer Remarks" placeholder="Reviewer remarks..." {...register("reviewerRemarks")} />
                <TextareaInput label="Tester Remarks" placeholder="Your remarks..." {...register("testerRemarks")} />
                <SelectInput label="Status" options={STATUS_OPTIONS} {...register("status")} />
            </FormSection>

            <div className="flex items-center justify-end gap-3 pt-2">
                <button
                    type="button"
                    onClick={() => reset({ testDate: getTodayDateString() })}
                    className="px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
                    disabled={isPending}
                >
                    Reset Form
                </button>
                <button
                    type="submit"
                    disabled={isPending}
                    className="px-6 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {isPending ? "Submitting..." : "Submit Test Case"}
                </button>
            </div>
        </form>

        <CreateZohoTicketModal
            isOpen={isTicketModalOpen}
            onClose={() => setIsTicketModalOpen(false)}
            onTicketCreated={(url) => {
                setValue("defectIdBugRef", url, { shouldDirty: true });
            }}
            initialData={{
                queryText: watch("queryText"),
                questionCategory: watch("questionCategory"),
                channelTested: watch("channelTested"),
                languageTested: watch("languageTested"),
                threadId: watch("threadId"),
                buildVersion: watch("buildVersion"),
                defectSeverity: watch("defectSeverity"),
                testerRemarks: watch("testerRemarks"),
                overallTestStatus: watch("overallTestStatus"),
                testerName,
                userEmail,
            }}
        />
    </>
    );
}

