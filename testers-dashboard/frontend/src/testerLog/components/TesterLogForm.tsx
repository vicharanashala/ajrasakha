import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FormSection } from "./FormSection";
import { TimeInput } from "./TimeInput";
import { useTesterLogSubmit } from "../hooks/useTesterLogSubmit";
import { useNextTestId } from "../hooks/useTesterLogHistory";
import { Plus, ExternalLink, Laptop, Smartphone, Check, Trash2 } from "lucide-react";
import { useZohoTicketStatuses } from "../../hooks/useZohoTicketStatuses";
import { CreateZohoTicketModal } from "./CreateZohoTicketModal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { hmsDiff, isTimeEarlier, isTimeInFuture, getLocalDatetimeMax } from "../utils/timingUtils";
import type { ITesterLogEntry } from "../types";
import {
    TYPE_OF_QUESTION_OPTIONS,
    isDynamicQuestionType,
    isCrossPlatform,
    synthesizeOverallTestStatus,
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
    TAGGING_OPTIONS,
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

const inputClass =
    "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&_option]:bg-background [&_option]:text-foreground";

const labelClass = "text-sm font-medium text-foreground";

function Field({
    label,
    children,
    required,
    error,
    className,
}: {
    label: string;
    children: React.ReactNode;
    required?: boolean;
    error?: string;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-1", className)}>
            <label className={labelClass}>
                {label}
                {required && <span className="text-destructive dark:text-red-400 font-bold ml-1 text-sm select-none" aria-hidden="true">*</span>}
            </label>
            {children}
            {error && <span className="text-xs text-destructive mt-0.5">{error}</span>}
        </div>
    );
}

function TextInput({
    label,
    required,
    error,
    className,
    ...props
}: { label: string; required?: boolean; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <Field label={label} required={required} error={error}>
            <input
                type="text"
                className={cn(inputClass, error && "border-destructive focus-visible:ring-destructive", className)}
                {...props}
            />
        </Field>
    );
}

function SelectInput({
    label,
    options,
    required,
    error,
    className,
    ...props
}: { label: string; options: string[]; required?: boolean; error?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <Field label={label} required={required} error={error}>
            <select
                className={cn(inputClass, error && "border-destructive focus-visible:ring-destructive", className)}
                {...props}
            >
                <option value="">-- Select --</option>
                {options.map(o => (
                    <option key={o} value={o}>{o}</option>
                ))}
            </select>
        </Field>
    );
}

function TextareaInput({
    label,
    required,
    error,
    className,
    ...props
}: { label: string; required?: boolean; error?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <Field label={label} required={required} error={error} className="sm:col-span-2 lg:col-span-3">
            <textarea
                rows={3}
                className={cn(inputClass, "h-auto py-2 resize-y", error && "border-destructive focus-visible:ring-destructive", className)}
                {...props}
            />
        </Field>
    );
}

function LanguageSelectInput({
    label,
    value,
    onChange,
    required,
    error,
}: {
    label: string;
    value?: string;
    onChange: (val: string) => void;
    required?: boolean;
    error?: string;
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
        <Field label={label} required={required} error={error}>
            <select
                className={cn(inputClass, error && "border-destructive focus-visible:ring-destructive")}
                value={selectedOption}
                onChange={handleSelectChange}
            >
                <option value="">-- Select --</option>
                {INDIAN_LANGUAGES_OPTIONS.map(o => (
                    <option key={o} value={o}>{o}</option>
                ))}
            </select>
            {selectedOption === "Others" && (
                <input
                    type="text"
                    className={cn(inputClass, "mt-1.5", error && "border-destructive focus-visible:ring-destructive")}
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
    required,
    error,
}: {
    value?: string;
    onChange: (val: string) => void;
    onOpenCreateModal: () => void;
    zohoStatuses?: Record<string, any>;
    required?: boolean;
    error?: string;
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
                <label className={labelClass}>
                    Defect ID / Bug Ref
                    {required && <span className="text-destructive dark:text-red-400 font-bold ml-1 text-sm select-none" aria-hidden="true">*</span>}
                </label>
                {!isValidUrl && (
                    <button
                        type="button"
                        onClick={onOpenCreateModal}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors py-0.5 px-2 rounded-md hover:bg-primary/10 border border-primary/20"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Create Zoho Ticket
                    </button>
                )}
                {isValidUrl && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        Ticket Connected
                    </span>
                )}
            </div>

            {isValidUrl ? (
                <div className="mt-1 flex flex-col gap-1.5">
                    <div className={`p-2.5 rounded-md border flex items-center justify-between text-xs transition-colors ${badgeStyle.bg}`}>
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${badgeStyle.dot}`} />
                            <span className="font-semibold text-foreground text-sm">
                                Ticket {cachedStatus?.ticketNumber ? `#${cachedStatus.ticketNumber}` : (ticketId ? `#${ticketId}` : "")}
                            </span>
                            {cachedStatus?.status && (
                                <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${badgeStyle.bg} ${badgeStyle.text}`}>
                                    {cachedStatus.status}
                                </span>
                            )}
                            {cachedStatus?.team && (
                                <span className="text-muted-foreground text-[11px]">
                                    • Team: {cachedStatus.team}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                            <a
                                href={customUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline font-medium inline-flex items-center gap-1 text-xs"
                            >
                                Open in Zoho
                                <ExternalLink className="h-3 w-3" />
                            </a>
                            <button
                                type="button"
                                onClick={() => onChange("")}
                                title="Disconnect ticket to choose NA or enter a different URL"
                                className="inline-flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 font-medium px-2 py-0.5 rounded hover:bg-destructive/10 transition-colors border border-destructive/20"
                            >
                                <Trash2 className="h-3 w-3" />
                                Disconnect
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <select
                        className={cn(inputClass, error && "border-destructive focus-visible:ring-destructive")}
                        value={selectedOption}
                        onChange={handleSelectChange}
                    >
                        <option value="">-- Select --</option>
                        <option value="NA">NA</option>
                        <option value="Zoho Ticket URL">Zoho Ticket URL</option>
                    </select>

                    {selectedOption === "Zoho Ticket URL" && (
                        <div className="mt-1.5 flex flex-col gap-2">
                            <input
                                type="text"
                                className={cn(inputClass, error && "border-destructive focus-visible:ring-destructive")}
                                placeholder="Paste Zoho ticket URL (e.g. https://desk.zoho.in/...)"
                                value={customUrl}
                                onChange={handleUrlChange}
                            />
                        </div>
                    )}
                </>
            )}
            {error && <span className="text-xs text-destructive mt-0.5">{error}</span>}
        </div>
    );
}

function TaggingInput({
    value,
    onChange,
    required,
    error,
}: {
    value?: string;
    onChange: (val: string) => void;
    required?: boolean;
    error?: string;
}) {
    const [selectedOption, setSelectedOption] = useState<string>(() => {
        if (value === "Tagged as Duplicate") return "Tagged as Duplicate";
        if (value) return "Other";
        return "";
    });
    const [customTag, setCustomTag] = useState<string>(() => {
        return value && value !== "Tagged as Duplicate" ? value : "";
    });

    useEffect(() => {
        if (value === "Tagged as Duplicate") {
            setSelectedOption("Tagged as Duplicate");
        } else if (value && value !== customTag) {
            setSelectedOption("Other");
            setCustomTag(value);
        } else if (!value && (selectedOption === "Tagged as Duplicate" || customTag !== "")) {
            setSelectedOption("");
            setCustomTag("");
        }
    }, [value]);

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sel = e.target.value;
        setSelectedOption(sel);
        if (sel === "Tagged as Duplicate") {
            onChange("Tagged as Duplicate");
        } else if (sel === "Other") {
            onChange(customTag);
        } else {
            onChange("");
        }
    };

    const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const text = e.target.value;
        setCustomTag(text);
        onChange(text);
    };

    return (
        <div className="flex flex-col gap-1">
            <label className={labelClass}>
                Tagging
                {required && <span className="text-destructive dark:text-red-400 font-bold ml-1 text-sm select-none" aria-hidden="true">*</span>}
            </label>
            <select
                className={cn(inputClass, error && "border-destructive focus-visible:ring-destructive")}
                value={selectedOption}
                onChange={handleSelectChange}
            >
                <option value="">-- Select --</option>
                {TAGGING_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
            {selectedOption === "Other" && (
                <div className="mt-1.5">
                    <input
                        type="text"
                        className={cn(inputClass, error && "border-destructive focus-visible:ring-destructive")}
                        placeholder="Enter tag..."
                        value={customTag}
                        onChange={handleCustomChange}
                        autoFocus
                    />
                </div>
            )}
            {error && <span className="text-xs text-destructive mt-0.5">{error}</span>}
        </div>
    );
}

function validateTesterLogForm(
    data: FormValues,
    flags: { isCross: boolean; excludeReviewerWorkflow: boolean }
): Record<string, string> {
    const errors: Record<string, string> = {};

    const checkRequired = (key: keyof FormValues, label: string) => {
        const val = data[key];
        if (!val || (typeof val === "string" && !val.trim())) {
            errors[key] = `${label} is required`;
        }
    };

    // Section 1: Basic Info
    checkRequired("typeOfQuestion", "Type of Question");
    checkRequired("buildVersion", "Build / Version");
    checkRequired("channelTested", "Channel Tested");

    const lang = data.languageTested?.trim();
    if (!lang || lang === "Others") {
        errors.languageTested = "Language Tested is required";
    }

    checkRequired("threadId", flags.isCross ? "Web App Thread / Session ID" : "Thread ID");
    if (flags.isCross) {
        checkRequired("waThreadId", "WhatsApp Thread / Phone Number");
    }

    checkRequired("questionCategory", "Question Category");
    checkRequired("queryText", "Query Text");

    // Section 2: Timing & SLA
    checkRequired("timeQuestionAsked", flags.isCross ? "Web Time Asked" : "Time Question Asked");
    checkRequired("timeAnswerReceived", flags.isCross ? "Web Time Received" : "Time Answer Received");
    checkRequired("slaStatus", flags.isCross ? "Web SLA Status" : "SLA Status");

    if (isTimeInFuture(data.timeQuestionAsked, data.testDate)) {
        errors.timeQuestionAsked = "Time Question Asked cannot be in the future";
    }
    if (isTimeInFuture(data.timeAnswerReceived, data.testDate)) {
        errors.timeAnswerReceived = "Time Answer Received cannot be in the future";
    } else if (isTimeEarlier(data.timeAnswerReceived, data.timeQuestionAsked, data.testDate)) {
        errors.timeAnswerReceived = "Time Answer Received cannot be earlier than Time Question Asked";
    }

    if (flags.isCross) {
        checkRequired("waTimeQuestionAsked", "WhatsApp Time Asked");
        checkRequired("waTimeAnswerReceived", "WhatsApp Time Received");
        checkRequired("waSlaStatus", "WhatsApp SLA Status");

        if (isTimeInFuture(data.waTimeQuestionAsked, data.testDate)) {
            errors.waTimeQuestionAsked = "WhatsApp Time Asked cannot be in the future";
        }
        if (isTimeInFuture(data.waTimeAnswerReceived, data.testDate)) {
            errors.waTimeAnswerReceived = "WhatsApp Time Received cannot be in the future";
        } else if (isTimeEarlier(data.waTimeAnswerReceived, data.waTimeQuestionAsked, data.testDate)) {
            errors.waTimeAnswerReceived = "WhatsApp Time Received cannot be earlier than WhatsApp Time Asked";
        }
    }

    // Section 3: Question Quality
    checkRequired("questionInReviewModel", "Question in Review Model");
    checkRequired("questionCorrectlyFramed", "Question Correctly Framed");

    const origLang = data.originalLanguage?.trim();
    if (!origLang || origLang === "Others") {
        errors.originalLanguage = "Original Language is required";
    }

    const transLang = data.translatedLanguage?.trim();
    if (!transLang || transLang === "Others") {
        errors.translatedLanguage = "Translated Language is required";
    }

    checkRequired("translationQuality", "Translation Quality");
    checkRequired("translationErrorType", "Translation Error Type (enter NA if none)");

    const tagging = data.tagging?.trim();
    if (!tagging || tagging === "Other") {
        errors.tagging = "Tagging is required";
    }

    // Section 4: Reviewer Workflow
    if (!flags.excludeReviewerWorkflow) {
        checkRequired("allocatedToReviewer", "Allocated to Reviewer");
        if (data.allocatedToReviewer === "Yes") {
            checkRequired("authorsName", "Author Name");
            checkRequired("authorAssignmentTime", "Author Assignment Time");
            checkRequired("authorCompletionTime", "Author Completion Time");
            if (isTimeInFuture(data.authorAssignmentTime, data.testDate)) {
                errors.authorAssignmentTime = "Author Assignment Time cannot be in the future";
            }
            if (isTimeInFuture(data.authorCompletionTime, data.testDate)) {
                errors.authorCompletionTime = "Author Completion Time cannot be in the future";
            } else if (isTimeEarlier(data.authorCompletionTime, data.authorAssignmentTime, data.testDate)) {
                errors.authorCompletionTime = "Author Completion Time cannot be earlier than Author Assignment Time";
            }
        }
        for (let i = 1; i <= 5; i++) {
            const aKey = `reviewer${i}AssignmentTime` as keyof FormValues;
            const cKey = `reviewer${i}CompletionTime` as keyof FormValues;
            if (isTimeInFuture(data[aKey] as string, data.testDate)) {
                errors[aKey] = `Reviewer ${i} Assignment Time cannot be in the future`;
            }
            if (isTimeInFuture(data[cKey] as string, data.testDate)) {
                errors[cKey] = `Reviewer ${i} Completion Time cannot be in the future`;
            } else if (isTimeEarlier(data[cKey] as string, data[aKey] as string, data.testDate)) {
                errors[cKey] = `Reviewer ${i} Completion Time cannot be earlier than Assignment Time`;
            }
        }
        if (isTimeInFuture(data.moderatorAssignmentTime, data.testDate)) {
            errors.moderatorAssignmentTime = "Moderator Assignment Time cannot be in the future";
        }
        if (isTimeInFuture(data.moderatorCompletionTime, data.testDate)) {
            errors.moderatorCompletionTime = "Moderator Completion Time cannot be in the future";
        } else if (isTimeEarlier(data.moderatorCompletionTime, data.moderatorAssignmentTime, data.testDate)) {
            errors.moderatorCompletionTime = "Moderator Completion Time cannot be earlier than Assignment Time";
        }
    }

    // Section 5: Answer Quality
    checkRequired("followUpQInReviewModel", "Follow-up Q in Review Model");
    checkRequired("answerScientificallyCorrect", "Answer Scientifically Correct");
    checkRequired("expertNameDisplayed", "Expert Name Displayed");
    checkRequired("correctExpertNameDisplayed", "Correct Expert Name Displayed");
    checkRequired("correctSourceLinksProvided", "Correct Source Links Provided");

    // Section 6: Notifications & Voice
    checkRequired("msg120MinShownToUser", "120-min Msg Shown to User");
    checkRequired("notificationReceived", flags.isCross ? "Web Notification Received" : "Notification Received");
    checkRequired("voiceInputWorking", flags.isCross ? "Web Voice Input Working" : "Voice Input Working");
    checkRequired("voiceOutputWorking", flags.isCross ? "Web Voice Output Working" : "Voice Output Working");

    if (flags.isCross) {
        checkRequired("waNotificationReceived", "WhatsApp Notification Received");
        checkRequired("waVoiceInputWorking", "WhatsApp Voice Input Working");
        checkRequired("waVoiceOutputWorking", "WhatsApp Voice Output Working");
    }

    checkRequired("notificationOnSameThread", "Notification on Same Thread");
    checkRequired("notificationLinkedCorrectQId", "Notification Linked Correct Q-ID");
    checkRequired("voiceInputQuality", "Voice Input Quality");
    checkRequired("voiceOutputQuality", "Voice Output Quality");
    checkRequired("voiceIssueDescription", "Voice Issue Description (enter NA if none)");

    // Section 7: Domain Checks & Parity
    if (flags.isCross) {
        checkRequired("whatsappVsWebAnswerMatch", "WhatsApp vs Web Answer Match");
        checkRequired("qIdConsistentAcrossSystems", "Q-ID Consistent Across Systems");
        if (data.whatsappVsWebAnswerMatch === "No" || data.whatsappVsWebAnswerMatch === "Partial") {
            checkRequired("crossPlatformDiscrepancyNotes", "Discrepancy Notes");
        }
    } else {
        checkRequired("qIdConsistentAcrossSystems", "Q-ID Consistent Across Systems");
        checkRequired("whatsappVsWebAnswerMatch", "WhatsApp vs Web Answer Match");
    }

    checkRequired("weatherQAnsweredCorrectly", "Weather Q Answered Correctly");
    checkRequired("mandiPriceQCorrect", "Mandi Price Q Correct");
    checkRequired("schemeQCorrect", "Scheme Q Correct");
    checkRequired("questionSavedInDb", "Question Saved in DB");
    checkRequired("answerSavedInDb", "Answer Saved in DB");

    // Section 8: Defects & Remarks
    if (flags.isCross) {
        checkRequired("webOverallTestStatus", "Web App Status");
        checkRequired("waOverallTestStatus", "WhatsApp Status");
    }
    checkRequired("overallTestStatus", "Overall Test Status");
    checkRequired("defectSeverity", "Defect Severity");

    const bugRef = data.defectIdBugRef?.trim();
    if (!bugRef) {
        errors.defectIdBugRef = "Defect ID / Bug Ref is required (Select NA or enter Zoho URL)";
    } else if (bugRef === "Zoho Ticket URL") {
        errors.defectIdBugRef = "Please enter the Zoho Ticket URL";
    }

    checkRequired("reviewerRemarks", "Reviewer Remarks (enter NA if none)");
    checkRequired("testerRemarks", "Tester Remarks");
    checkRequired("status", "Status");

    return errors;
}

interface TesterLogFormProps {
    testerName: string;
    userEmail?: string;
    onSuccess?: () => void;
}

const DRAFT_STORAGE_PREFIX = "tester_log_form_draft_";

function getInitialFormValues(userEmail?: string, todayDate: string = getTodayDateString()): FormValues {
    try {
        const storageKey = `${DRAFT_STORAGE_PREFIX}${userEmail || "anonymous"}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === "object") {
                return {
                    ...parsed,
                    testDate: parsed.testDate || todayDate,
                };
            }
        }
    } catch {
        // ignore localStorage parsing errors
    }
    return { testDate: todayDate };
}

export function TesterLogForm({ testerName, userEmail, onSuccess }: TesterLogFormProps) {
    const { mutate, isPending, isSuccess } = useTesterLogSubmit();
    const { data: nextTestId, isLoading: isLoadingNextId, refetch: refetchNextId } = useNextTestId();
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const { data: zohoData } = useZohoTicketStatuses();
    const zohoStatuses = zohoData?.statuses;

    const todayDate = getTodayDateString();
    const draftKey = `${DRAFT_STORAGE_PREFIX}${userEmail || "anonymous"}`;

    const { register, handleSubmit, watch, setValue, reset, getValues } = useForm<FormValues>({
        defaultValues: getInitialFormValues(userEmail, todayDate),
    });

    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    const clearError = (field: string) => {
        setFormErrors(prev => {
            if (!prev[field]) return prev;
            const updated = { ...prev };
            delete updated[field];
            return updated;
        });
    };

    useEffect(() => {
        if (nextTestId && !getValues("testId")) {
            setValue("testId", nextTestId);
        }
    }, [nextTestId, setValue, getValues]);

    // Auto-save form draft to localStorage whenever fields change
    useEffect(() => {
        const subscription = watch((values) => {
            try {
                const hasUserInput = Object.entries(values).some(([k, v]) => {
                    if (k === "testDate" || k === "testId") return false;
                    return typeof v === "string" ? v.trim() !== "" : Boolean(v);
                });
                if (hasUserInput) {
                    localStorage.setItem(draftKey, JSON.stringify(values));
                }
            } catch {
                // ignore storage quota errors
            }
        });
        return () => subscription.unsubscribe();
    }, [watch, draftKey]);

    // Watch fields for dynamic workflow and TAT auto-computations
    const [
        testDate,
        typeOfQuestion,
        channelTested,
        timeQuestionAsked, timeAnswerReceived,
        waTimeQuestionAsked, waTimeAnswerReceived,
        authorAssignmentTime, authorCompletionTime,
        reviewer1AssignmentTime, reviewer1CompletionTime,
        reviewer2AssignmentTime, reviewer2CompletionTime,
        reviewer3AssignmentTime, reviewer3CompletionTime,
        reviewer4AssignmentTime, reviewer4CompletionTime,
        reviewer5AssignmentTime, reviewer5CompletionTime,
        moderatorAssignmentTime, moderatorCompletionTime,
        webOverallTestStatus, waOverallTestStatus,
    ] = watch([
        "testDate",
        "typeOfQuestion",
        "channelTested",
        "timeQuestionAsked", "timeAnswerReceived",
        "waTimeQuestionAsked", "waTimeAnswerReceived",
        "authorAssignmentTime", "authorCompletionTime",
        "reviewer1AssignmentTime", "reviewer1CompletionTime",
        "reviewer2AssignmentTime", "reviewer2CompletionTime",
        "reviewer3AssignmentTime", "reviewer3CompletionTime",
        "reviewer4AssignmentTime", "reviewer4CompletionTime",
        "reviewer5AssignmentTime", "reviewer5CompletionTime",
        "moderatorAssignmentTime", "moderatorCompletionTime",
        "webOverallTestStatus", "waOverallTestStatus",
    ]);

    const isCross = isCrossPlatform(channelTested);

    useEffect(() => { setValue("responseTimeMins", hmsDiff(timeQuestionAsked, timeAnswerReceived, testDate)); }, [timeQuestionAsked, timeAnswerReceived, testDate]);
    useEffect(() => {
        if (isCross) {
            setValue("waResponseTimeMins", hmsDiff(waTimeQuestionAsked, waTimeAnswerReceived, testDate));
        }
    }, [waTimeQuestionAsked, waTimeAnswerReceived, testDate, isCross]);

    useEffect(() => { setValue("authorTatMins", hmsDiff(authorAssignmentTime, authorCompletionTime, testDate)); }, [authorAssignmentTime, authorCompletionTime, testDate]);
    useEffect(() => { setValue("review1TatMins", hmsDiff(reviewer1AssignmentTime, reviewer1CompletionTime, testDate)); }, [reviewer1AssignmentTime, reviewer1CompletionTime, testDate]);
    useEffect(() => { setValue("review2TatMins", hmsDiff(reviewer2AssignmentTime, reviewer2CompletionTime, testDate)); }, [reviewer2AssignmentTime, reviewer2CompletionTime, testDate]);
    useEffect(() => { setValue("review3TatMins", hmsDiff(reviewer3AssignmentTime, reviewer3CompletionTime, testDate)); }, [reviewer3AssignmentTime, reviewer3CompletionTime, testDate]);
    useEffect(() => { setValue("review4TatMins", hmsDiff(reviewer4AssignmentTime, reviewer4CompletionTime, testDate)); }, [reviewer4AssignmentTime, reviewer4CompletionTime, testDate]);
    useEffect(() => { setValue("review5TatMins", hmsDiff(reviewer5AssignmentTime, reviewer5CompletionTime, testDate)); }, [reviewer5AssignmentTime, reviewer5CompletionTime, testDate]);
    useEffect(() => { setValue("moderatorTatMins", hmsDiff(moderatorAssignmentTime, moderatorCompletionTime, testDate)); }, [moderatorAssignmentTime, moderatorCompletionTime, testDate]);

    // Auto-synthesize Overall Test Status for Cross-Platform if both individual statuses are selected
    useEffect(() => {
        const synthesized = isCross ? synthesizeOverallTestStatus(webOverallTestStatus, waOverallTestStatus) : undefined;
        if (synthesized) setValue("overallTestStatus", synthesized);
    }, [webOverallTestStatus, waOverallTestStatus, isCross]);

    const responseTimeMins = watch("responseTimeMins");
    const waResponseTimeMins = watch("waResponseTimeMins");
    const authorTatMins = watch("authorTatMins");
    const review1TatMins = watch("review1TatMins");
    const review2TatMins = watch("review2TatMins");
    const review3TatMins = watch("review3TatMins");
    const review4TatMins = watch("review4TatMins");
    const review5TatMins = watch("review5TatMins");
    const moderatorTatMins = watch("moderatorTatMins");

    const [languageTested, originalLanguage, translatedLanguage, defectIdBugRef, tagging] = watch([
        "languageTested",
        "originalLanguage",
        "translatedLanguage",
        "defectIdBugRef",
        "tagging",
    ]);

    const isDynamic = isDynamicQuestionType(typeOfQuestion);
    const isDuplicate = tagging === "Tagged as Duplicate";
    const excludeReviewerWorkflow = isDynamic || isDuplicate;

    const handleReset = (showToast = true) => {
        try {
            localStorage.removeItem(draftKey);
        } catch {
            // ignore
        }
        reset({
            testDate: getTodayDateString(),
            testId: nextTestId || "",
            typeOfQuestion: "",
            buildVersion: "",
            channelTested: "",
            languageTested: "",
            threadId: "",
            waThreadId: "",
            questionCategory: "",
            queryText: "",
            timeQuestionAsked: "",
            timeAnswerReceived: "",
            responseTimeMins: "",
            slaStatus: "",
            waTimeQuestionAsked: "",
            waTimeAnswerReceived: "",
            waResponseTimeMins: "",
            waSlaStatus: "",
            questionInReviewModel: "",
            questionCorrectlyFramed: "",
            originalLanguage: "",
            translatedLanguage: "",
            translationQuality: "",
            translationErrorType: "",
            tagging: "",
            allocatedToReviewer: "",
            authorsName: "",
            authorAssignmentTime: "",
            authorCompletionTime: "",
            authorTatMins: "",
            reviewer1Name: "",
            reviewer1AssignmentTime: "",
            reviewer1CompletionTime: "",
            review1TatMins: "",
            reviewer2Name: "",
            reviewer2AssignmentTime: "",
            reviewer2CompletionTime: "",
            review2TatMins: "",
            reviewer3Name: "",
            reviewer3AssignmentTime: "",
            reviewer3CompletionTime: "",
            review3TatMins: "",
            reviewer4Name: "",
            reviewer4AssignmentTime: "",
            reviewer4CompletionTime: "",
            review4TatMins: "",
            reviewer5Name: "",
            reviewer5AssignmentTime: "",
            reviewer5CompletionTime: "",
            review5TatMins: "",
            moderatorName: "",
            moderatorAssignmentTime: "",
            moderatorCompletionTime: "",
            moderatorTatMins: "",
            followUpQInReviewModel: "",
            answerScientificallyCorrect: "",
            expertNameDisplayed: "",
            correctExpertNameDisplayed: "",
            correctSourceLinksProvided: "",
            msg120MinShownToUser: "",
            notificationReceived: "",
            voiceInputWorking: "",
            voiceOutputWorking: "",
            waNotificationReceived: "",
            waVoiceInputWorking: "",
            waVoiceOutputWorking: "",
            notificationOnSameThread: "",
            notificationLinkedCorrectQId: "",
            voiceInputQuality: "",
            voiceOutputQuality: "",
            voiceIssueDescription: "",
            weatherQAnsweredCorrectly: "",
            mandiPriceQCorrect: "",
            schemeQCorrect: "",
            questionSavedInDb: "",
            answerSavedInDb: "",
            qIdConsistentAcrossSystems: "",
            whatsappVsWebAnswerMatch: "",
            crossPlatformDiscrepancyNotes: "",
            webOverallTestStatus: "",
            waOverallTestStatus: "",
            overallTestStatus: "",
            defectSeverity: "",
            defectIdBugRef: "",
            reviewerRemarks: "",
            testerRemarks: "",
            status: "",
        });
        setFormErrors({});
        refetchNextId();
        if (showToast) {
            toast.info("Form has been reset");
        }
    };

    useEffect(() => {
        if (isSuccess) {
            handleReset(false);
            onSuccess?.();
        }
    }, [isSuccess]);

    const isAskedInFuture = isTimeInFuture(timeQuestionAsked, testDate);
    const isAnsweredInFuture = isTimeInFuture(timeAnswerReceived, testDate);
    const isWebTimingInvalid = isTimeEarlier(timeAnswerReceived, timeQuestionAsked, testDate);

    const isWaAskedInFuture = isCross && isTimeInFuture(waTimeQuestionAsked, testDate);
    const isWaAnsweredInFuture = isCross && isTimeInFuture(waTimeAnswerReceived, testDate);
    const isWaTimingInvalid = isCross && isTimeEarlier(waTimeAnswerReceived, waTimeQuestionAsked, testDate);

    const isAuthorAssignedInFuture = !excludeReviewerWorkflow && isTimeInFuture(authorAssignmentTime, testDate);
    const isAuthorCompletedInFuture = !excludeReviewerWorkflow && isTimeInFuture(authorCompletionTime, testDate);
    const isAuthorTimingInvalid = !excludeReviewerWorkflow && isTimeEarlier(authorCompletionTime, authorAssignmentTime, testDate);

    const onSubmit = (data: FormValues) => {
        const errors = validateTesterLogForm(data, { isCross, excludeReviewerWorkflow });
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            const firstTimingError =
                errors.timeQuestionAsked ||
                errors.timeAnswerReceived ||
                errors.waTimeQuestionAsked ||
                errors.waTimeAnswerReceived ||
                errors.authorAssignmentTime ||
                errors.authorCompletionTime;
            if (firstTimingError) {
                toast.error(firstTimingError);
            } else {
                toast.error("Please fill in all required fields before submitting.");
            }
            const firstKey = Object.keys(errors)[0];
            const el = document.querySelector(`[name="${firstKey}"]`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return;
        }

        setFormErrors({});
        const payload: FormValues = {
            ...data,
            testDate: getTodayDateString(),
        };
        // testId is automated and allocated atomically on the backend to prevent collisions across concurrent submissions
        delete (payload as any).testId;
        if (excludeReviewerWorkflow) {
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

    // Calculate error counts per section to display badges and auto-expand
    const s1Errors = ["typeOfQuestion", "buildVersion", "channelTested", "languageTested", "threadId", "waThreadId", "questionCategory", "queryText"].filter(k => formErrors[k]).length;
    const s2Errors = ["timeQuestionAsked", "timeAnswerReceived", "slaStatus", "waTimeQuestionAsked", "waTimeAnswerReceived", "waSlaStatus"].filter(k => formErrors[k]).length
        + ((isAskedInFuture || isAnsweredInFuture || isWebTimingInvalid) && !formErrors.timeAnswerReceived && !formErrors.timeQuestionAsked ? 1 : 0)
        + ((isWaAskedInFuture || isWaAnsweredInFuture || isWaTimingInvalid) && !formErrors.waTimeAnswerReceived && !formErrors.waTimeQuestionAsked ? 1 : 0);
    const s3Errors = ["questionInReviewModel", "questionCorrectlyFramed", "originalLanguage", "translatedLanguage", "translationQuality", "translationErrorType", "tagging"].filter(k => formErrors[k]).length;
    const s4Errors = ["allocatedToReviewer", "authorsName", "authorAssignmentTime", "authorCompletionTime"].filter(k => formErrors[k]).length
        + ((isAuthorAssignedInFuture || isAuthorCompletedInFuture || isAuthorTimingInvalid) && !formErrors.authorCompletionTime && !formErrors.authorAssignmentTime ? 1 : 0);
    const s5Errors = ["followUpQInReviewModel", "answerScientificallyCorrect", "expertNameDisplayed", "correctExpertNameDisplayed", "correctSourceLinksProvided"].filter(k => formErrors[k]).length;
    const s6Errors = ["msg120MinShownToUser", "notificationReceived", "voiceInputWorking", "voiceOutputWorking", "waNotificationReceived", "waVoiceInputWorking", "waVoiceOutputWorking", "notificationOnSameThread", "notificationLinkedCorrectQId", "voiceInputQuality", "voiceOutputQuality", "voiceIssueDescription"].filter(k => formErrors[k]).length;
    const s7Errors = ["weatherQAnsweredCorrectly", "mandiPriceQCorrect", "schemeQCorrect", "questionSavedInDb", "answerSavedInDb", "qIdConsistentAcrossSystems", "whatsappVsWebAnswerMatch", "crossPlatformDiscrepancyNotes"].filter(k => formErrors[k]).length;
    const s8Errors = ["webOverallTestStatus", "waOverallTestStatus", "overallTestStatus", "defectSeverity", "defectIdBugRef", "reviewerRemarks", "testerRemarks", "status"].filter(k => formErrors[k]).length;

    return (
        <>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Section 1 */}
            <FormSection title="1. Basic Info" errorCount={s1Errors}>
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
                <Field label="Test ID">
                    <div className="relative">
                        <input
                            type="text"
                            className={inputClass + " bg-muted font-mono font-medium text-foreground cursor-default pr-16"}
                            placeholder={isLoadingNextId ? "Generating..." : "Auto-generated"}
                            {...register("testId")}
                            readOnly
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold tracking-wider text-primary uppercase bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded pointer-events-none select-none">
                            Auto
                        </span>
                    </div>
                </Field>
                <SelectInput
                    label="Type of Question"
                    options={TYPE_OF_QUESTION_OPTIONS}
                    required
                    error={formErrors.typeOfQuestion}
                    {...register("typeOfQuestion", { onChange: () => clearError("typeOfQuestion") })}
                />
                <TextInput
                    label="Build / Version"
                    placeholder="e.g. 2.1.0"
                    required
                    error={formErrors.buildVersion}
                    {...register("buildVersion", { onChange: () => clearError("buildVersion") })}
                />
                <SelectInput
                    label="Channel Tested"
                    options={CHANNEL_OPTIONS}
                    required
                    error={formErrors.channelTested}
                    {...register("channelTested", { onChange: () => clearError("channelTested") })}
                />
                <LanguageSelectInput
                    label="Language Tested"
                    value={languageTested}
                    required
                    error={formErrors.languageTested}
                    onChange={val => {
                        setValue("languageTested", val);
                        clearError("languageTested");
                    }}
                />
                {isCross ? (
                    <>
                        <TextInput
                            label="Web App Thread / Session ID"
                            placeholder="Web thread or session ID"
                            required
                            error={formErrors.threadId}
                            {...register("threadId", { onChange: () => clearError("threadId") })}
                        />
                        <TextInput
                            label="WhatsApp Thread / Phone Number"
                            placeholder="WA thread ID or Phone Number"
                            required
                            error={formErrors.waThreadId}
                            {...register("waThreadId", { onChange: () => clearError("waThreadId") })}
                        />
                    </>
                ) : (
                    <TextInput
                        label="Thread ID"
                        placeholder="Thread ID"
                        required
                        error={formErrors.threadId}
                        {...register("threadId", { onChange: () => clearError("threadId") })}
                    />
                )}
                <SelectInput
                    label="Question Category"
                    options={QUESTION_CATEGORY_OPTIONS}
                    required
                    error={formErrors.questionCategory}
                    {...register("questionCategory", { onChange: () => clearError("questionCategory") })}
                />
                <TextareaInput
                    label="Query Text (Original)"
                    placeholder="Enter the original query text..."
                    required
                    error={formErrors.queryText}
                    {...register("queryText", { onChange: () => clearError("queryText") })}
                />
            </FormSection>

            {/* Section 2 */}
            {isCross ? (
                <FormSection title="2. Timing & SLA (Cross-Platform Execution)" errorCount={s2Errors}>
                    <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Web App Block */}
                        <div className="p-3.5 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                                <Laptop className="h-4 w-4" />
                                <span>Web App Timing</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <TimeInput
                                    label="Time Question Asked (Web)"
                                    required
                                    max={getLocalDatetimeMax()}
                                    error={formErrors.timeQuestionAsked || (isAskedInFuture ? "Time Question Asked cannot be in the future" : undefined)}
                                    {...register("timeQuestionAsked", {
                                        onChange: () => {
                                            clearError("timeQuestionAsked");
                                            clearError("timeAnswerReceived");
                                        },
                                    })}
                                />
                                <TimeInput
                                    label="Time Answer Received (Web)"
                                    required
                                    max={getLocalDatetimeMax()}
                                    error={formErrors.timeAnswerReceived || (isAnsweredInFuture ? "Time Answer Received cannot be in the future" : isWebTimingInvalid ? "Answer received time cannot be earlier than question asked time" : undefined)}
                                    {...register("timeAnswerReceived", { onChange: () => clearError("timeAnswerReceived") })}
                                />
                                <TimeInput
                                    label="Web Response Time [Auto]"
                                    readOnly
                                    value={isAskedInFuture || isAnsweredInFuture ? "Invalid: Time is in the future" : isWebTimingInvalid ? "Invalid: Answer time < Question time" : (responseTimeMins ?? "")}
                                    error={isAskedInFuture || isAnsweredInFuture ? "Time cannot be in the future" : isWebTimingInvalid ? "Response time cannot be negative" : undefined}
                                    className={(isAskedInFuture || isAnsweredInFuture || isWebTimingInvalid) ? "border-destructive text-destructive font-medium bg-destructive/5" : undefined}
                                    onChange={() => {}}
                                />
                                <SelectInput
                                    label="Web SLA Status"
                                    options={SLA_STATUS_OPTIONS}
                                    required
                                    error={formErrors.slaStatus}
                                    {...register("slaStatus", { onChange: () => clearError("slaStatus") })}
                                />
                            </div>
                        </div>

                        {/* WhatsApp Block */}
                        <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                                <Smartphone className="h-4 w-4" />
                                <span>WhatsApp Timing</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <TimeInput
                                    label="Time Question Asked (WA)"
                                    required
                                    max={getLocalDatetimeMax()}
                                    error={formErrors.waTimeQuestionAsked || (isWaAskedInFuture ? "WhatsApp Time Asked cannot be in the future" : undefined)}
                                    {...register("waTimeQuestionAsked", {
                                        onChange: () => {
                                            clearError("waTimeQuestionAsked");
                                            clearError("waTimeAnswerReceived");
                                        },
                                    })}
                                />
                                <TimeInput
                                    label="Time Answer Received (WA)"
                                    required
                                    max={getLocalDatetimeMax()}
                                    error={formErrors.waTimeAnswerReceived || (isWaAnsweredInFuture ? "WhatsApp Time Received cannot be in the future" : isWaTimingInvalid ? "WhatsApp answer received time cannot be earlier than question asked time" : undefined)}
                                    {...register("waTimeAnswerReceived", { onChange: () => clearError("waTimeAnswerReceived") })}
                                />
                                <TimeInput
                                    label="WhatsApp Response Time [Auto]"
                                    readOnly
                                    value={isWaAskedInFuture || isWaAnsweredInFuture ? "Invalid: Time is in the future" : isWaTimingInvalid ? "Invalid: Answer time < Question time" : (waResponseTimeMins ?? "")}
                                    error={isWaAskedInFuture || isWaAnsweredInFuture ? "Time cannot be in the future" : isWaTimingInvalid ? "Response time cannot be negative" : undefined}
                                    className={(isWaAskedInFuture || isWaAnsweredInFuture || isWaTimingInvalid) ? "border-destructive text-destructive font-medium bg-destructive/5" : undefined}
                                    onChange={() => {}}
                                />
                                <SelectInput
                                    label="WhatsApp SLA Status"
                                    options={SLA_STATUS_OPTIONS}
                                    required
                                    error={formErrors.waSlaStatus}
                                    {...register("waSlaStatus", { onChange: () => clearError("waSlaStatus") })}
                                />
                            </div>
                        </div>
                    </div>
                </FormSection>
            ) : (
                <FormSection title="2. Timing & SLA" errorCount={s2Errors}>
                    <TimeInput
                        label="Time Question Asked"
                        required
                        max={getLocalDatetimeMax()}
                        error={formErrors.timeQuestionAsked || (isAskedInFuture ? "Time Question Asked cannot be in the future" : undefined)}
                        {...register("timeQuestionAsked", {
                            onChange: () => {
                                clearError("timeQuestionAsked");
                                clearError("timeAnswerReceived");
                            },
                        })}
                    />
                    <TimeInput
                        label="Time Answer Received"
                        required
                        max={getLocalDatetimeMax()}
                        error={formErrors.timeAnswerReceived || (isAnsweredInFuture ? "Time Answer Received cannot be in the future" : isWebTimingInvalid ? "Answer received time cannot be earlier than question asked time" : undefined)}
                        {...register("timeAnswerReceived", { onChange: () => clearError("timeAnswerReceived") })}
                    />
                    <TimeInput
                        label="Response Time [Auto]"
                        readOnly
                        value={isAskedInFuture || isAnsweredInFuture ? "Invalid: Time is in the future" : isWebTimingInvalid ? "Invalid: Answer time < Question time" : (responseTimeMins ?? "")}
                        error={isAskedInFuture || isAnsweredInFuture ? "Time cannot be in the future" : isWebTimingInvalid ? "Response time cannot be negative" : undefined}
                        className={(isAskedInFuture || isAnsweredInFuture || isWebTimingInvalid) ? "border-destructive text-destructive font-medium bg-destructive/5" : undefined}
                        onChange={() => {}}
                    />
                    <SelectInput
                        label="SLA Status"
                        options={SLA_STATUS_OPTIONS}
                        required
                        error={formErrors.slaStatus}
                        {...register("slaStatus", { onChange: () => clearError("slaStatus") })}
                    />
                </FormSection>
            )}

            {/* Section 3 */}
            <FormSection title="3. Question Quality" errorCount={s3Errors}>
                <SelectInput
                    label="Question in Review Model?"
                    options={REVIEW_MODEL_OPTIONS}
                    required
                    error={formErrors.questionInReviewModel}
                    {...register("questionInReviewModel", { onChange: () => clearError("questionInReviewModel") })}
                />
                <SelectInput
                    label="Question Correctly Framed?"
                    options={QUESTION_FRAMED_OPTIONS}
                    required
                    error={formErrors.questionCorrectlyFramed}
                    {...register("questionCorrectlyFramed", { onChange: () => clearError("questionCorrectlyFramed") })}
                />
                <LanguageSelectInput
                    label="Original Language"
                    value={originalLanguage}
                    required
                    error={formErrors.originalLanguage}
                    onChange={val => {
                        setValue("originalLanguage", val);
                        clearError("originalLanguage");
                    }}
                />
                <LanguageSelectInput
                    label="Translated Language"
                    value={translatedLanguage}
                    required
                    error={formErrors.translatedLanguage}
                    onChange={val => {
                        setValue("translatedLanguage", val);
                        clearError("translatedLanguage");
                    }}
                />
                <SelectInput
                    label="Translation Quality"
                    options={TRANSLATION_QUALITY_OPTIONS}
                    required
                    error={formErrors.translationQuality}
                    {...register("translationQuality", { onChange: () => clearError("translationQuality") })}
                />
                <TextInput
                    label="Translation Error Type"
                    placeholder="Describe error type (or enter NA)"
                    required
                    error={formErrors.translationErrorType}
                    {...register("translationErrorType", { onChange: () => clearError("translationErrorType") })}
                />
                <TaggingInput
                    value={tagging}
                    required
                    error={formErrors.tagging}
                    onChange={val => {
                        setValue("tagging", val);
                        clearError("tagging");
                    }}
                />
            </FormSection>

            {/* Section 4 */}
            {!excludeReviewerWorkflow && (
                <FormSection title="4. Reviewer Workflow" defaultOpen={true} errorCount={s4Errors}>
                    <SelectInput
                        label="Allocated to Reviewer?"
                        options={ALLOCATED_TO_REVIEWER_OPTIONS}
                        required
                        error={formErrors.allocatedToReviewer}
                        {...register("allocatedToReviewer", { onChange: () => clearError("allocatedToReviewer") })}
                    />

                    <div className="sm:col-span-2 lg:col-span-3 border-t border-border pt-3 mt-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Author</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <TextInput
                                label="Author Name"
                                required={watch("allocatedToReviewer") === "Yes"}
                                error={formErrors.authorsName}
                                {...register("authorsName", { onChange: () => clearError("authorsName") })}
                            />
                            <TimeInput
                                label="Author Assignment Time"
                                required={watch("allocatedToReviewer") === "Yes"}
                                max={getLocalDatetimeMax()}
                                error={formErrors.authorAssignmentTime || (isAuthorAssignedInFuture ? "Author Assignment Time cannot be in the future" : undefined)}
                                {...register("authorAssignmentTime", {
                                    onChange: () => {
                                        clearError("authorAssignmentTime");
                                        clearError("authorCompletionTime");
                                    },
                                })}
                            />
                            <TimeInput
                                label="Author Completion Time"
                                required={watch("allocatedToReviewer") === "Yes"}
                                max={getLocalDatetimeMax()}
                                error={formErrors.authorCompletionTime || (isAuthorCompletedInFuture ? "Author Completion Time cannot be in the future" : isAuthorTimingInvalid ? "Author completion time cannot be earlier than assignment time" : undefined)}
                                {...register("authorCompletionTime", { onChange: () => clearError("authorCompletionTime") })}
                            />
                            <TimeInput
                                label="Author TAT [Auto]"
                                readOnly
                                value={isAuthorAssignedInFuture || isAuthorCompletedInFuture ? "Invalid: Time is in the future" : isAuthorTimingInvalid ? "Invalid: Completion < Assignment" : (authorTatMins ?? "")}
                                error={isAuthorAssignedInFuture || isAuthorCompletedInFuture ? "Time cannot be in the future" : isAuthorTimingInvalid ? "TAT cannot be negative" : undefined}
                                className={(isAuthorAssignedInFuture || isAuthorCompletedInFuture || isAuthorTimingInvalid) ? "border-destructive text-destructive font-medium bg-destructive/5" : undefined}
                                onChange={() => {}}
                            />
                        </div>
                    </div>

                    {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} className="sm:col-span-2 lg:col-span-3 border-t border-border pt-3 mt-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Reviewer {n}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <TextInput label={`Reviewer ${n} Name`} {...register(`reviewer${n}Name` as any)} />
                                <TimeInput label={`Reviewer ${n} Assignment Time`} max={getLocalDatetimeMax()} error={formErrors[`reviewer${n}AssignmentTime`]} {...register(`reviewer${n}AssignmentTime` as any)} />
                                <TimeInput label={`Reviewer ${n} Completion Time`} max={getLocalDatetimeMax()} error={formErrors[`reviewer${n}CompletionTime`]} {...register(`reviewer${n}CompletionTime` as any)} />
                                <TimeInput label={`Review ${n} TAT [Auto]`} readOnly value={[review1TatMins, review2TatMins, review3TatMins, review4TatMins, review5TatMins][n - 1] ?? ""} onChange={() => {}} />
                            </div>
                        </div>
                    ))}

                    <div className="sm:col-span-2 lg:col-span-3 border-t border-border pt-3 mt-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Moderator</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <TextInput label="Moderator Name" {...register("moderatorName")} />
                            <TimeInput label="Moderator Assignment Time" max={getLocalDatetimeMax()} error={formErrors.moderatorAssignmentTime} {...register("moderatorAssignmentTime")} />
                            <TimeInput label="Moderator Completion Time" max={getLocalDatetimeMax()} error={formErrors.moderatorCompletionTime} {...register("moderatorCompletionTime")} />
                            <TimeInput label="Moderator TAT [Auto]" readOnly value={moderatorTatMins ?? ""} onChange={() => {}} />
                        </div>
                    </div>
                </FormSection>
            )}

            {/* Section 5 (or 4 if dynamic/duplicate) */}
            <FormSection title={`${excludeReviewerWorkflow ? 4 : 5}. Answer Quality`} defaultOpen={true} errorCount={s5Errors}>
                <SelectInput
                    label="Follow-up Q in Review Model?"
                    options={FOLLOW_UP_MODEL_OPTIONS}
                    required
                    error={formErrors.followUpQInReviewModel}
                    {...register("followUpQInReviewModel", { onChange: () => clearError("followUpQInReviewModel") })}
                />
                <SelectInput
                    label="Answer Scientifically Correct?"
                    options={ANSWER_CORRECT_OPTIONS}
                    required
                    error={formErrors.answerScientificallyCorrect}
                    {...register("answerScientificallyCorrect", { onChange: () => clearError("answerScientificallyCorrect") })}
                />
                <SelectInput
                    label="Expert Name Displayed?"
                    options={EXPERT_DISPLAYED_OPTIONS}
                    required
                    error={formErrors.expertNameDisplayed}
                    {...register("expertNameDisplayed", { onChange: () => clearError("expertNameDisplayed") })}
                />
                <SelectInput
                    label="Correct Expert Name Displayed?"
                    options={YES_NO_NA_DUP_OPTIONS}
                    required
                    error={formErrors.correctExpertNameDisplayed}
                    {...register("correctExpertNameDisplayed", { onChange: () => clearError("correctExpertNameDisplayed") })}
                />
                <SelectInput
                    label="Correct Source Links Provided?"
                    options={YES_NO_NA_DUP_OPTIONS}
                    required
                    error={formErrors.correctSourceLinksProvided}
                    {...register("correctSourceLinksProvided", { onChange: () => clearError("correctSourceLinksProvided") })}
                />
            </FormSection>

            {/* Section 6 (or 5 if dynamic/duplicate) */}
            <FormSection title={`${excludeReviewerWorkflow ? 5 : 6}. Notifications & Voice`} defaultOpen={true} errorCount={s6Errors}>
                <SelectInput
                    label="120-min Msg Shown to User?"
                    options={MSG_120_OPTIONS}
                    required
                    error={formErrors.msg120MinShownToUser}
                    {...register("msg120MinShownToUser", { onChange: () => clearError("msg120MinShownToUser") })}
                />
                {isCross ? (
                    <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3.5 rounded-lg border border-border bg-card space-y-3">
                            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                                <Laptop className="h-3.5 w-3.5" /> Web App Channel
                            </p>
                            <SelectInput
                                label="Web Notification Received?"
                                options={NOTIFICATION_OPTIONS}
                                required
                                error={formErrors.notificationReceived}
                                {...register("notificationReceived", { onChange: () => clearError("notificationReceived") })}
                            />
                            <SelectInput
                                label="Web Voice Input Working?"
                                options={NOTIFICATION_OPTIONS}
                                required
                                error={formErrors.voiceInputWorking}
                                {...register("voiceInputWorking", { onChange: () => clearError("voiceInputWorking") })}
                            />
                            <SelectInput
                                label="Web Voice Output Working?"
                                options={NOTIFICATION_OPTIONS}
                                required
                                error={formErrors.voiceOutputWorking}
                                {...register("voiceOutputWorking", { onChange: () => clearError("voiceOutputWorking") })}
                            />
                        </div>
                        <div className="p-3.5 rounded-lg border border-border bg-card space-y-3">
                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                                <Smartphone className="h-3.5 w-3.5" /> WhatsApp Channel
                            </p>
                            <SelectInput
                                label="WhatsApp Notification Received?"
                                options={NOTIFICATION_OPTIONS}
                                required
                                error={formErrors.waNotificationReceived}
                                {...register("waNotificationReceived", { onChange: () => clearError("waNotificationReceived") })}
                            />
                            <SelectInput
                                label="WhatsApp Voice Input Working?"
                                options={NOTIFICATION_OPTIONS}
                                required
                                error={formErrors.waVoiceInputWorking}
                                {...register("waVoiceInputWorking", { onChange: () => clearError("waVoiceInputWorking") })}
                            />
                            <SelectInput
                                label="WhatsApp Voice Output Working?"
                                options={NOTIFICATION_OPTIONS}
                                required
                                error={formErrors.waVoiceOutputWorking}
                                {...register("waVoiceOutputWorking", { onChange: () => clearError("waVoiceOutputWorking") })}
                            />
                        </div>
                    </div>
                ) : (
                    <>
                        <SelectInput
                            label="Notification Received?"
                            options={NOTIFICATION_OPTIONS}
                            required
                            error={formErrors.notificationReceived}
                            {...register("notificationReceived", { onChange: () => clearError("notificationReceived") })}
                        />
                        <SelectInput
                            label="Voice Input Working?"
                            options={NOTIFICATION_OPTIONS}
                            required
                            error={formErrors.voiceInputWorking}
                            {...register("voiceInputWorking", { onChange: () => clearError("voiceInputWorking") })}
                        />
                        <SelectInput
                            label="Voice Output Working?"
                            options={NOTIFICATION_OPTIONS}
                            required
                            error={formErrors.voiceOutputWorking}
                            {...register("voiceOutputWorking", { onChange: () => clearError("voiceOutputWorking") })}
                        />
                    </>
                )}
                <SelectInput
                    label="Notification on Same Thread?"
                    options={NOTIFICATION_OPTIONS}
                    required
                    error={formErrors.notificationOnSameThread}
                    {...register("notificationOnSameThread", { onChange: () => clearError("notificationOnSameThread") })}
                />
                <SelectInput
                    label="Notification Linked Correct Q-ID?"
                    options={NOTIFICATION_OPTIONS}
                    required
                    error={formErrors.notificationLinkedCorrectQId}
                    {...register("notificationLinkedCorrectQId", { onChange: () => clearError("notificationLinkedCorrectQId") })}
                />
                <SelectInput
                    label="Voice Input Quality"
                    options={VOICE_QUALITY_OPTIONS}
                    required
                    error={formErrors.voiceInputQuality}
                    {...register("voiceInputQuality", { onChange: () => clearError("voiceInputQuality") })}
                />
                <SelectInput
                    label="Voice Output Quality"
                    options={VOICE_QUALITY_OPTIONS}
                    required
                    error={formErrors.voiceOutputQuality}
                    {...register("voiceOutputQuality", { onChange: () => clearError("voiceOutputQuality") })}
                />
                <TextInput
                    label="Voice Issue Description"
                    placeholder="Describe any voice issue (or enter NA)"
                    required
                    error={formErrors.voiceIssueDescription}
                    {...register("voiceIssueDescription", { onChange: () => clearError("voiceIssueDescription") })}
                />
            </FormSection>

            {/* Section 7 (or 6 if dynamic/duplicate) */}
            <FormSection title={`${excludeReviewerWorkflow ? 6 : 7}. Domain Checks & Parity`} defaultOpen={true} errorCount={s7Errors}>
                {isCross && (
                    <div className="sm:col-span-2 lg:col-span-3 p-3.5 rounded-lg border border-purple-500/30 bg-purple-500/5 mb-1 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                                Cross-Platform Parity & Consistency
                            </span>
                            <span className="text-[11px] text-muted-foreground">Compare Web App vs. WhatsApp</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <SelectInput
                                label="WhatsApp vs Web Answer Match?"
                                options={YES_NO_PARTIAL_NA_OPTIONS}
                                required
                                error={formErrors.whatsappVsWebAnswerMatch}
                                {...register("whatsappVsWebAnswerMatch", { onChange: () => clearError("whatsappVsWebAnswerMatch") })}
                            />
                            <SelectInput
                                label="Q-ID Consistent Across Systems?"
                                options={QID_CONSISTENT_OPTIONS}
                                required
                                error={formErrors.qIdConsistentAcrossSystems}
                                {...register("qIdConsistentAcrossSystems", { onChange: () => clearError("qIdConsistentAcrossSystems") })}
                            />
                        </div>
                        <TextInput
                            label="Discrepancy Notes (if answers differ)"
                            placeholder="e.g. WebApp provided detailed tables, WhatsApp returned summary text"
                            error={formErrors.crossPlatformDiscrepancyNotes}
                            {...register("crossPlatformDiscrepancyNotes", { onChange: () => clearError("crossPlatformDiscrepancyNotes") })}
                        />
                    </div>
                )}
                <SelectInput
                    label="Weather Q Answered Correctly?"
                    options={YES_NO_PARTIAL_NA_OPTIONS}
                    required
                    error={formErrors.weatherQAnsweredCorrectly}
                    {...register("weatherQAnsweredCorrectly", { onChange: () => clearError("weatherQAnsweredCorrectly") })}
                />
                <SelectInput
                    label="Mandi Price Q Correct?"
                    options={YES_NO_PARTIAL_NA_OPTIONS}
                    required
                    error={formErrors.mandiPriceQCorrect}
                    {...register("mandiPriceQCorrect", { onChange: () => clearError("mandiPriceQCorrect") })}
                />
                <SelectInput
                    label="Scheme Q Correct?"
                    options={YES_NO_PARTIAL_NA_OPTIONS}
                    required
                    error={formErrors.schemeQCorrect}
                    {...register("schemeQCorrect", { onChange: () => clearError("schemeQCorrect") })}
                />
                <SelectInput
                    label="Question Saved in DB?"
                    options={DB_SAVE_OPTIONS}
                    required
                    error={formErrors.questionSavedInDb}
                    {...register("questionSavedInDb", { onChange: () => clearError("questionSavedInDb") })}
                />
                <SelectInput
                    label="Answer Saved in DB?"
                    options={DB_SAVE_OPTIONS}
                    required
                    error={formErrors.answerSavedInDb}
                    {...register("answerSavedInDb", { onChange: () => clearError("answerSavedInDb") })}
                />
                {!isCross && (
                    <>
                        <SelectInput
                            label="Q-ID Consistent Across Systems?"
                            options={QID_CONSISTENT_OPTIONS}
                            required
                            error={formErrors.qIdConsistentAcrossSystems}
                            {...register("qIdConsistentAcrossSystems", { onChange: () => clearError("qIdConsistentAcrossSystems") })}
                        />
                        <SelectInput
                            label="WhatsApp vs Web Answer Match?"
                            options={YES_NO_PARTIAL_NA_OPTIONS}
                            required
                            error={formErrors.whatsappVsWebAnswerMatch}
                            {...register("whatsappVsWebAnswerMatch", { onChange: () => clearError("whatsappVsWebAnswerMatch") })}
                        />
                    </>
                )}
            </FormSection>

            {/* Section 8 (or 7 if dynamic/duplicate) */}
            <FormSection title={`${excludeReviewerWorkflow ? 7 : 8}. Defects & Remarks`} defaultOpen={true} errorCount={s8Errors}>
                {isCross ? (
                    <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                        <SelectInput
                            label="Web App Status"
                            options={OVERALL_STATUS_OPTIONS}
                            required
                            error={formErrors.webOverallTestStatus}
                            {...register("webOverallTestStatus", { onChange: () => clearError("webOverallTestStatus") })}
                        />
                        <SelectInput
                            label="WhatsApp Status"
                            options={OVERALL_STATUS_OPTIONS}
                            required
                            error={formErrors.waOverallTestStatus}
                            {...register("waOverallTestStatus", { onChange: () => clearError("waOverallTestStatus") })}
                        />
                        <SelectInput
                            label="Overall Synthesized Status"
                            options={OVERALL_STATUS_OPTIONS}
                            required
                            error={formErrors.overallTestStatus}
                            {...register("overallTestStatus", { onChange: () => clearError("overallTestStatus") })}
                        />
                    </div>
                ) : (
                    <SelectInput
                        label="Overall Test Status"
                        options={OVERALL_STATUS_OPTIONS}
                        required
                        error={formErrors.overallTestStatus}
                        {...register("overallTestStatus", { onChange: () => clearError("overallTestStatus") })}
                    />
                )}
                <SelectInput
                    label="Defect Severity"
                    options={DEFECT_SEVERITY_OPTIONS}
                    required
                    error={formErrors.defectSeverity}
                    {...register("defectSeverity", { onChange: () => clearError("defectSeverity") })}
                />
                <DefectIdBugRefInput
                    value={defectIdBugRef}
                    required
                    error={formErrors.defectIdBugRef}
                    onChange={val => {
                        setValue("defectIdBugRef", val);
                        clearError("defectIdBugRef");
                    }}
                    onOpenCreateModal={() => setIsTicketModalOpen(true)}
                    zohoStatuses={zohoStatuses}
                />
                <TextareaInput
                    label="Reviewer Remarks"
                    placeholder="Reviewer remarks (or enter NA)..."
                    required
                    error={formErrors.reviewerRemarks}
                    {...register("reviewerRemarks", { onChange: () => clearError("reviewerRemarks") })}
                />
                <TextareaInput
                    label="Tester Remarks"
                    placeholder="Your remarks..."
                    required
                    error={formErrors.testerRemarks}
                    {...register("testerRemarks", { onChange: () => clearError("testerRemarks") })}
                />
                <SelectInput
                    label="Status"
                    options={STATUS_OPTIONS}
                    required
                    error={formErrors.status}
                    {...register("status", { onChange: () => clearError("status") })}
                />
            </FormSection>

            <div className="flex items-center justify-end gap-3 pt-2">
                <button
                    type="button"
                    onClick={() => handleReset(true)}
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
                clearError("defectIdBugRef");
            }}
            initialData={{
                queryText: watch("queryText"),
                questionCategory: watch("questionCategory"),
                channelTested: watch("channelTested"),
                languageTested: watch("languageTested"),
                threadId: watch("threadId"),
                waThreadId: watch("waThreadId"),
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

