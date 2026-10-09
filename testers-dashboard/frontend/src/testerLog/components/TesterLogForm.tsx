import { useEffect, useState, useRef } from "react";
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
import { hmsDiff, isTimeEarlier, isTimeInFuture, isMidnightRollover, getLocalDatetimeMax, getMinutesDiff } from "../utils/timingUtils";
import type { ITesterLogEntry } from "../types";
import {
    TYPE_OF_QUESTION_OPTIONS,
    isDynamicTagging,
    isDuplicateTagging,
    isCrossPlatform,
    synthesizeOverallTestStatus,
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
    OVERALL_STATUS_OPTIONS,
    TRANSLATION_QUALITY_OPTIONS,
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
    ZOHO_DESK_URL_REGEX,
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
    helper,
}: {
    label: string;
    children: React.ReactNode;
    required?: boolean;
    error?: string;
    className?: string;
    helper?: React.ReactNode;
}) {
    return (
        <div className={cn("flex flex-col gap-1", className)}>
            <div className="flex items-center justify-between">
                <label className={labelClass}>
                    {label}
                    {required && <span className="text-red-500 dark:text-red-400 font-bold ml-1 text-sm select-none" aria-hidden="true">*</span>}
                </label>
                {helper && <span className="text-[11px] text-muted-foreground">{helper}</span>}
            </div>
            {children}
            {error && <span className="text-xs text-red-500 dark:text-red-400 mt-0.5">{error}</span>}
        </div>
    );
}

function TextInput({
    label,
    required,
    error,
    helper,
    className,
    ...props
}: { label: string; required?: boolean; error?: string; helper?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <Field label={label} required={required} error={error} helper={helper}>
            <input
                type="text"
                className={cn(inputClass, error && "border-red-500 dark:border-red-400 focus-visible:ring-red-500 dark:focus-visible:ring-red-400", className)}
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
    placeholder = "-- Select --",
    ...props
}: { label: string; options: string[]; required?: boolean; error?: string; placeholder?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <Field label={label} required={required} error={error}>
            <select
                className={cn(inputClass, error && "border-red-500 dark:border-red-400 focus-visible:ring-red-500 dark:focus-visible:ring-red-400", className)}
                {...props}
            >
                <option value="">{placeholder}</option>
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
    helper,
    className,
    ...props
}: { label: string; required?: boolean; error?: string; helper?: React.ReactNode } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <Field label={label} required={required} error={error} helper={helper} className="sm:col-span-2 lg:col-span-3">
            <textarea
                rows={3}
                className={cn(inputClass, "h-auto py-2 resize-y", error && "border-red-500 dark:border-red-400 focus-visible:ring-red-500 dark:focus-visible:ring-red-400", className)}
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
                className={cn(inputClass, error && "border-red-500 dark:border-red-400 focus-visible:ring-red-500 dark:focus-visible:ring-red-400")}
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
                    maxLength={TEXT_FIELD_LIMITS.LANGUAGE_MAX}
                    className={cn(inputClass, "mt-1.5", error && "border-red-500 dark:border-red-400 focus-visible:ring-red-500 dark:focus-visible:ring-red-400")}
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
    connectedTicketInfo,
    required,
    error,
    disabled,
}: {
    value?: string;
    onChange: (val: string) => void;
    onOpenCreateModal: () => void;
    zohoStatuses?: Record<string, any>;
    connectedTicketInfo?: { ticketNumber?: string; status?: string; team?: string } | null;
    required?: boolean;
    error?: string;
    disabled?: boolean;
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
    const displayTicketNumber = cachedStatus?.ticketNumber || connectedTicketInfo?.ticketNumber;
    const displayStatus = cachedStatus?.status || connectedTicketInfo?.status;
    const displayTeam = cachedStatus?.team || connectedTicketInfo?.team;
    const badgeStyle = getStatusBadgeStyle(displayStatus);

    const handleDisconnect = () => {
        const confirmed = typeof window !== "undefined" && window.confirm
            ? window.confirm("Are you sure you want to disconnect this Zoho ticket? The ticket will remain in Zoho Desk.")
            : true;
        if (confirmed) {
            onChange("");
            toast.info("Ticket disconnected from this test case. The ticket remains in Zoho Desk.");
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
                <label className={labelClass}>
                    Defect ID / Bug Ref
                    {required && <span className="text-red-500 dark:text-red-400 font-bold ml-1 text-sm select-none" aria-hidden="true">*</span>}
                </label>
                {!isValidUrl && (
                    <button
                        type="button"
                        onClick={onOpenCreateModal}
                        disabled={disabled}
                        className={cn(
                            "inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors py-0.5 px-2 rounded-md hover:bg-primary/10 border border-primary/20",
                            disabled && "cursor-not-allowed opacity-50 pointer-events-none"
                        )}
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
                                Ticket {displayTicketNumber ? `#${displayTicketNumber}` : (ticketId ? `#${ticketId}` : "")}
                            </span>
                            {displayStatus && (
                                <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${badgeStyle.bg} ${badgeStyle.text}`}>
                                    {displayStatus}
                                </span>
                            )}
                            {displayTeam && (
                                <span className="text-muted-foreground text-[11px]">
                                    • Team: {displayTeam}
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
                                onClick={handleDisconnect}
                                disabled={disabled}
                                title="Disconnect ticket to choose NA or enter a different URL"
                                className={cn(
                                    "inline-flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 font-medium px-2 py-0.5 rounded hover:bg-destructive/10 transition-colors border border-destructive/20 cursor-pointer",
                                    disabled && "cursor-not-allowed opacity-50 pointer-events-none"
                                )}
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
                        className={cn(inputClass, error && "border-red-500 dark:border-red-400 focus-visible:ring-red-500 dark:focus-visible:ring-red-400")}
                        value={selectedOption}
                        disabled={disabled}
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
                                maxLength={TEXT_FIELD_LIMITS.DEFECT_URL_MAX}
                                className={cn(inputClass, error && "border-red-500 dark:border-red-400 focus-visible:ring-red-500 dark:focus-visible:ring-red-400")}
                                placeholder="Paste Zoho ticket URL (e.g. https://desk.zoho.in/...)"
                                value={customUrl}
                                disabled={disabled}
                                onChange={handleUrlChange}
                            />
                        </div>
                    )}
                </>
            )}
            {error && <span className="text-xs text-red-500 dark:text-red-400 mt-0.5">{error}</span>}
        </div>
    );
}

export function validateTesterLogForm(
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
    if (data.buildVersion?.trim()) {
        const bv = data.buildVersion.trim();
        if (bv.length > TEXT_FIELD_LIMITS.BUILD_VERSION_MAX) {
            errors.buildVersion = `Build / Version cannot exceed ${TEXT_FIELD_LIMITS.BUILD_VERSION_MAX} characters`;
        } else if (!BUILD_VERSION_REGEX.test(bv)) {
            errors.buildVersion = "Build / Version must contain numbers and valid version characters (e.g. 1.0, 2.1.0, v1.0.1)";
        }
    }
    checkRequired("channelTested", "Channel Tested");

    const lang = data.languageTested?.trim();
    if (!lang || lang === "Others") {
        errors.languageTested = "Language Tested is required";
    } else if (lang.length > TEXT_FIELD_LIMITS.LANGUAGE_MAX || !LANGUAGE_NAME_REGEX.test(lang)) {
        errors.languageTested = `Language name must be letters only and under ${TEXT_FIELD_LIMITS.LANGUAGE_MAX} characters`;
    }

    checkRequired("threadId", flags.isCross ? "Web App Thread / Session ID" : "Thread ID");
    if (data.threadId?.trim()) {
        const t = data.threadId.trim();
        if (t.length > TEXT_FIELD_LIMITS.THREAD_ID_MAX) {
            errors.threadId = `Thread ID cannot exceed ${TEXT_FIELD_LIMITS.THREAD_ID_MAX} characters`;
        } else if (!THREAD_ID_REGEX.test(t)) {
            errors.threadId = "Thread ID contains invalid characters";
        }
    }
    if (flags.isCross) {
        checkRequired("waThreadId", "WhatsApp Thread / Phone Number");
        if (data.waThreadId?.trim()) {
            const wt = data.waThreadId.trim();
            if (wt.length > TEXT_FIELD_LIMITS.WA_THREAD_ID_MAX) {
                errors.waThreadId = `WhatsApp Thread cannot exceed ${TEXT_FIELD_LIMITS.WA_THREAD_ID_MAX} characters`;
            } else if (!WA_THREAD_ID_REGEX.test(wt)) {
                errors.waThreadId = "WhatsApp Thread / Phone Number format is invalid";
            }
        }
    }

    checkRequired("questionCategory", "Question Category");
    checkRequired("queryText", "Query Text");
    if (data.queryText !== undefined && data.queryText !== null) {
        const q = data.queryText.trim();
        if (q.length > 0 && q.length < TEXT_FIELD_LIMITS.QUERY_TEXT_MIN) {
            errors.queryText = `Query Text must be at least ${TEXT_FIELD_LIMITS.QUERY_TEXT_MIN} characters`;
        } else if (data.queryText.length > TEXT_FIELD_LIMITS.QUERY_TEXT_MAX) {
            errors.queryText = `Query Text cannot exceed ${TEXT_FIELD_LIMITS.QUERY_TEXT_MAX} characters`;
        }
    }

    // Section 2: Timing & SLA
    checkRequired("timeQuestionAsked", flags.isCross ? "Web Time Asked" : "Time Question Asked");
    checkRequired("timeAnswerReceived", flags.isCross ? "Web Time Received" : "Time Answer Received");
    checkRequired("slaStatus", flags.isCross ? "Web SLA Status" : "SLA Status");

    const isWebRollover = isMidnightRollover(data.timeQuestionAsked, data.timeAnswerReceived);
    if (!isWebRollover && isTimeInFuture(data.timeQuestionAsked, data.testDate)) {
        errors.timeQuestionAsked = "Time Question Asked cannot be in the future";
    }
    if (isTimeInFuture(data.timeAnswerReceived, data.testDate)) {
        errors.timeAnswerReceived = "Time Answer Received cannot be in the future";
    } else if (isTimeEarlier(data.timeAnswerReceived, data.timeQuestionAsked, data.testDate)) {
        errors.timeAnswerReceived = "Time Answer Received cannot be earlier than Time Question Asked";
    }

    const webDiffMins = getMinutesDiff(data.timeQuestionAsked, data.timeAnswerReceived, data.testDate);
    if (webDiffMins !== null && !isNaN(webDiffMins)) {
        if (webDiffMins <= 120 && data.slaStatus === "SLA Breached") {
            errors.slaStatus = "Response time is within 120 minutes; SLA Status cannot be 'SLA Breached'";
        } else if (webDiffMins > 120 && data.slaStatus === "Within SLA") {
            errors.slaStatus = "Response time exceeds 120 minutes; SLA Status must be 'SLA Breached'";
        }
    }

    if (flags.isCross) {
        checkRequired("waTimeQuestionAsked", "WhatsApp Time Asked");
        checkRequired("waTimeAnswerReceived", "WhatsApp Time Received");
        checkRequired("waSlaStatus", "WhatsApp SLA Status");

        const isWaRollover = isMidnightRollover(data.waTimeQuestionAsked, data.waTimeAnswerReceived);
        if (!isWaRollover && isTimeInFuture(data.waTimeQuestionAsked, data.testDate)) {
            errors.waTimeQuestionAsked = "WhatsApp Time Asked cannot be in the future";
        }
        if (isTimeInFuture(data.waTimeAnswerReceived, data.testDate)) {
            errors.waTimeAnswerReceived = "WhatsApp Time Received cannot be in the future";
        } else if (isTimeEarlier(data.waTimeAnswerReceived, data.waTimeQuestionAsked, data.testDate)) {
            errors.waTimeAnswerReceived = "WhatsApp Time Received cannot be earlier than WhatsApp Time Asked";
        }

        const waDiffMins = getMinutesDiff(data.waTimeQuestionAsked, data.waTimeAnswerReceived, data.testDate);
        if (waDiffMins !== null && !isNaN(waDiffMins)) {
            if (waDiffMins <= 120 && data.waSlaStatus === "SLA Breached") {
                errors.waSlaStatus = "WhatsApp response time is within 120 minutes; SLA Status cannot be 'SLA Breached'";
            } else if (waDiffMins > 120 && data.waSlaStatus === "Within SLA") {
                errors.waSlaStatus = "WhatsApp response time exceeds 120 minutes; SLA Status must be 'SLA Breached'";
            }
        }
    }

    // Section 3: Question Quality
    checkRequired("questionInReviewModel", "Question Appeared in Review Model?");
    checkRequired("questionCorrectlyFramed", "Question Framed Correctly?");

    const origLang = data.originalLanguage?.trim();
    if (!origLang || origLang === "Others") {
        errors.originalLanguage = "Original Language is required";
    } else if (origLang.length > TEXT_FIELD_LIMITS.LANGUAGE_MAX || !LANGUAGE_NAME_REGEX.test(origLang)) {
        errors.originalLanguage = `Language name must be letters only and under ${TEXT_FIELD_LIMITS.LANGUAGE_MAX} characters`;
    }

    const transLang = data.translatedLanguage?.trim();
    if (!transLang || transLang === "Others") {
        errors.translatedLanguage = "Translated Language is required";
    } else if (transLang.length > TEXT_FIELD_LIMITS.LANGUAGE_MAX || !LANGUAGE_NAME_REGEX.test(transLang)) {
        errors.translatedLanguage = `Language name must be letters only and under ${TEXT_FIELD_LIMITS.LANGUAGE_MAX} characters`;
    }

    checkRequired("translationQuality", "Translation Quality");
    checkRequired("translationErrorType", "Translation Error Type");
    if (data.translationQuality && data.translationErrorType) {
        const allowed = TRANSLATION_ERROR_MAP[data.translationQuality.trim()];
        if (allowed && !allowed.includes(data.translationErrorType.trim())) {
            errors.translationErrorType = `Invalid Translation Error Type for ${data.translationQuality}. Allowed: ${allowed.join(", ")}`;
        }
    }
    checkRequired("tagging", "Tagging");

    // Section 4: Reviewer Workflow
    if (!flags.excludeReviewerWorkflow) {
        checkRequired("allocatedToReviewer", "Allocated to Author?");
        if (data.allocatedToReviewer === "Yes") {
            checkRequired("authorsName", "Author Name");
            checkRequired("authorAssignmentTime", "Author Assignment Time");
            checkRequired("authorCompletionTime", "Author Completion Time");
        }
        if (data.authorsName?.trim()) {
            const an = data.authorsName.trim();
            if (an.length < TEXT_FIELD_LIMITS.NAME_MIN || an.length > TEXT_FIELD_LIMITS.NAME_MAX || !PERSON_NAME_REGEX.test(an)) {
                errors.authorsName = "Author Name must be 2-100 characters and contain letters only";
            }
        }
        const isAuthorRollover = isMidnightRollover(data.authorAssignmentTime, data.authorCompletionTime);
        if (data.authorAssignmentTime && !isAuthorRollover && isTimeInFuture(data.authorAssignmentTime, data.testDate)) {
            errors.authorAssignmentTime = "Author Assignment Time cannot be in the future";
        }
        if (data.authorCompletionTime) {
            if (isTimeInFuture(data.authorCompletionTime, data.testDate)) {
                errors.authorCompletionTime = "Author Completion Time cannot be in the future";
            } else if (data.authorAssignmentTime && isTimeEarlier(data.authorCompletionTime, data.authorAssignmentTime, data.testDate)) {
                errors.authorCompletionTime = "Author Completion Time cannot be earlier than Author Assignment Time";
            }
        }

        // Chronological Stage Progression Check
        if (data.timeQuestionAsked && data.authorAssignmentTime && isTimeEarlier(data.authorAssignmentTime, data.timeQuestionAsked, data.testDate)) {
            errors.authorAssignmentTime = "Author Assignment Time cannot be earlier than Time Question Asked";
        }

        let lastStageCompletion = data.authorCompletionTime || (data.allocatedToReviewer === "Yes" ? undefined : data.timeQuestionAsked);
        let lastStageLabel = data.authorCompletionTime ? "Author Completion Time" : "Time Question Asked";

        for (let i = 1; i <= 5; i++) {
            const nameKey = `reviewer${i}Name` as keyof FormValues;
            const revName = (data[nameKey] as string | undefined)?.trim();
            if (revName) {
                if (revName.length < TEXT_FIELD_LIMITS.NAME_MIN || revName.length > TEXT_FIELD_LIMITS.NAME_MAX || !PERSON_NAME_REGEX.test(revName)) {
                    errors[nameKey] = `Reviewer ${i} Name must be 2-100 characters and contain letters only`;
                }
            }
            const aKey = `reviewer${i}AssignmentTime` as keyof FormValues;
            const cKey = `reviewer${i}CompletionTime` as keyof FormValues;
            const aTime = data[aKey] as string | undefined;
            const cTime = data[cKey] as string | undefined;

            if (aTime) {
                if (lastStageCompletion && isTimeEarlier(aTime, lastStageCompletion, data.testDate)) {
                    errors[aKey] = `Reviewer ${i} Assignment Time cannot be earlier than ${lastStageLabel}`;
                }
            }

            const isRevRollover = isMidnightRollover(aTime, cTime);
            if (!isRevRollover && isTimeInFuture(aTime, data.testDate)) {
                errors[aKey] = `Reviewer ${i} Assignment Time cannot be in the future`;
            }
            if (isTimeInFuture(cTime, data.testDate)) {
                errors[cKey] = `Reviewer ${i} Completion Time cannot be in the future`;
            } else if (isTimeEarlier(cTime, aTime, data.testDate)) {
                errors[cKey] = `Reviewer ${i} Completion Time cannot be earlier than Assignment Time`;
            }

            if (cTime) {
                lastStageCompletion = cTime;
                lastStageLabel = `Reviewer ${i} Completion Time`;
            }
        }

        if (data.moderatorName?.trim()) {
            const mn = data.moderatorName.trim();
            if (mn.length < TEXT_FIELD_LIMITS.NAME_MIN || mn.length > TEXT_FIELD_LIMITS.NAME_MAX || !PERSON_NAME_REGEX.test(mn)) {
                errors.moderatorName = "Moderator Name must be 2-100 characters and contain letters only";
            }
        }
        if (data.moderatorAssignmentTime && lastStageCompletion && isTimeEarlier(data.moderatorAssignmentTime, lastStageCompletion, data.testDate)) {
            errors.moderatorAssignmentTime = `Moderator Assignment Time cannot be earlier than ${lastStageLabel}`;
        }
        const isModRollover = isMidnightRollover(data.moderatorAssignmentTime, data.moderatorCompletionTime);
        if (!isModRollover && isTimeInFuture(data.moderatorAssignmentTime, data.testDate)) {
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
    checkRequired("answerScientificallyCorrect", "Scientific Accuracy");
    checkRequired("retrievalAccuracy", "Retrieval Accuracy");
    checkRequired("expertNameDisplayed", "Expert Name Displayed");
    checkRequired("correctSourceLinksProvided", "Correct Source Links Provided");

    // Section 6: Notifications & Voice
    checkRequired("msg120MinShownToUser", "120-min Disclaimer Received by the User?");
    checkRequired("notificationReceived", flags.isCross ? "Web Notification Received" : "Notification Received");
    if (flags.isCross) {
        checkRequired("waNotificationReceived", "WhatsApp Notification Received");
    }
    checkRequired("notificationOnSameThread", "Notification on Same Thread");
    checkRequired("notificationLinkedCorrectQId", "Notification Linked to Correct Q-ID");

    const noWebNotification = data.notificationReceived === "Not Received";
    const noWaNotification = flags.isCross && data.waNotificationReceived === "Not Received";
    const allNotificationsNotReceived = flags.isCross ? (noWebNotification && noWaNotification) : noWebNotification;

    if (allNotificationsNotReceived) {
        if (data.notificationOnSameThread === "Yes - on same thread" || data.notificationOnSameThread === "No - on Different Thread") {
            errors.notificationOnSameThread = "Notification was not received; thread comparison cannot be 'Yes' or 'No'";
        }
        if (data.notificationLinkedCorrectQId === "Yes") {
            errors.notificationLinkedCorrectQId = "Notification was not received; cannot be linked to Q-ID";
        }
    }

    checkRequired("voiceInputWorking", flags.isCross ? "Web Voice Input Working" : "Voice Input Working");
    checkRequired("voiceOutputWorking", flags.isCross ? "Web Voice Output Working" : "Voice Output Working");
    checkRequired("voiceInputIssueDescription", flags.isCross ? "Web Voice Input Issue Description" : "Voice Input Issue Description");
    if (flags.isCross) {
        checkRequired("waVoiceInputWorking", "WhatsApp Voice Input Working");
        checkRequired("waVoiceOutputWorking", "WhatsApp Voice Output Working");
        checkRequired("waVoiceInputIssueDescription", "WhatsApp Voice Input Issue Description");
    }
    checkRequired("voiceInputQuality", "Voice Input Quality");
    checkRequired("voiceOutputQuality", "Voice Output Quality");
    checkRequired("voiceIssueDescription", "Voice Output Issue Description");

    if (data.voiceInputWorking === "No" && data.voiceInputQuality === "Correct") {
        errors.voiceInputQuality = "Voice Input is not working; quality cannot be rated 'Correct'";
    }
    if (data.voiceOutputWorking === "No" && data.voiceOutputQuality === "Clear") {
        errors.voiceOutputQuality = "Voice Output is not working; quality cannot be rated 'Clear'";
    }
    if (flags.isCross) {
        if (data.waVoiceInputWorking === "No" && data.waVoiceInputQuality === "Correct") {
            errors.waVoiceInputQuality = "WhatsApp Voice Input is not working; quality cannot be rated 'Correct'";
        }
        if (data.waVoiceOutputWorking === "No" && data.waVoiceOutputQuality === "Clear") {
            errors.waVoiceOutputQuality = "WhatsApp Voice Output is not working; quality cannot be rated 'Clear'";
        }
    }

    // Section 7: Domain Checks & Parity
    checkRequired("whatsappVsWebAnswerMatch", "WhatsApp vs Web Application Answer Match?");
    if (flags.isCross) {
        if (
            data.whatsappVsWebAnswerMatch === "Partial Match" ||
            data.whatsappVsWebAnswerMatch === "Mismatch" ||
            data.whatsappVsWebAnswerMatch === "Partial" ||
            data.whatsappVsWebAnswerMatch === "No"
        ) {
            checkRequired("crossPlatformDiscrepancyNotes", "Discrepancy Notes");
        }
    }
    if (data.crossPlatformDiscrepancyNotes && data.crossPlatformDiscrepancyNotes.length > TEXT_FIELD_LIMITS.DISCREPANCY_NOTES_MAX) {
        errors.crossPlatformDiscrepancyNotes = `Discrepancy Notes cannot exceed ${TEXT_FIELD_LIMITS.DISCREPANCY_NOTES_MAX} characters`;
    }

    checkRequired("weatherQAnsweredCorrectly", "Weather Q Answered Correctly");
    checkRequired("mandiPriceQCorrect", "Mandi Price Q Correct");
    checkRequired("schemeQCorrect", "Scheme Q Correct");

    // Section 8: Defects & Remarks
    if (flags.isCross) {
        checkRequired("webOverallTestStatus", "Web App Status");
        checkRequired("waOverallTestStatus", "WhatsApp Status");
    }
    checkRequired("overallTestStatus", "Overall Test Status");
    const isPass = (data.overallTestStatus || "").trim().toLowerCase() === "pass";
    if (isPass) {
        if (!data.defectSeverity) data.defectSeverity = "NA";
        if (!data.defectIdBugRef) data.defectIdBugRef = "NA";
        data.testerRemarks = "No Action Required";
        data.testerRemarksNotes = "";
    } else {
        checkRequired("defectSeverity", "Defect Severity");
        if (data.defectSeverity === "NA") {
            errors.defectSeverity = "A failed test case requires a valid Defect Severity (cannot be 'NA')";
        }

        const bugRef = data.defectIdBugRef?.trim();
        if (!bugRef) {
            errors.defectIdBugRef = "Defect ID / Bug Ref is required (Select NA or enter Zoho URL)";
        } else if (bugRef === "Zoho Ticket URL") {
            errors.defectIdBugRef = "Please enter the Zoho Ticket URL";
        } else if (bugRef !== "NA") {
            if (bugRef.length > TEXT_FIELD_LIMITS.DEFECT_URL_MAX) {
                errors.defectIdBugRef = `Defect URL cannot exceed ${TEXT_FIELD_LIMITS.DEFECT_URL_MAX} characters`;
            } else if (!ZOHO_DESK_URL_REGEX.test(bugRef)) {
                errors.defectIdBugRef = "Please enter a valid Zoho Desk ticket URL (e.g. https://desk.zoho.in/...)";
            }
        }

        checkRequired("testerRemarks", "Tester Remarks");
        if (data.testerRemarks === "No Action Required") {
            errors.testerRemarks = "A failed test case requires an actionable remark (cannot be 'No Action Required')";
        }
        if (data.testerRemarks && data.testerRemarks !== "No Action Required") {
            checkRequired("testerRemarksNotes", "Remarks Details");
        }
        if (data.testerRemarksNotes?.trim()) {
            const rn = data.testerRemarksNotes.trim();
            if (rn.length < TEXT_FIELD_LIMITS.REMARKS_NOTES_MIN) {
                errors.testerRemarksNotes = `Remarks Details must be at least ${TEXT_FIELD_LIMITS.REMARKS_NOTES_MIN} characters`;
            } else if (data.testerRemarksNotes.length > TEXT_FIELD_LIMITS.REMARKS_NOTES_MAX) {
                errors.testerRemarksNotes = `Remarks Details cannot exceed ${TEXT_FIELD_LIMITS.REMARKS_NOTES_MAX} characters`;
            }
        }
    }

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
                let errorType = parsed.translationErrorType;
                const quality = (parsed.translationQuality || "").trim();
                if (quality) {
                    const allowed = TRANSLATION_ERROR_MAP[quality];
                    if (allowed) {
                        if (allowed.length === 1) {
                            errorType = allowed[0];
                        } else if (!allowed.includes(errorType || "")) {
                            errorType = "";
                        }
                    }
                }
                const isPass = (parsed.overallTestStatus || "").trim().toLowerCase() === "pass";
                return {
                    ...parsed,
                    testDate: todayDate,
                    translationErrorType: errorType,
                    defectSeverity: isPass ? "NA" : parsed.defectSeverity,
                    defectIdBugRef: isPass ? "NA" : parsed.defectIdBugRef,
                    testerRemarks: isPass ? "No Action Required" : parsed.testerRemarks,
                    testerRemarksNotes: isPass ? "" : parsed.testerRemarksNotes,
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

    // Ensure testDate always reflects today's date even if an existing draft had an older date
    useEffect(() => {
        setValue("testDate", todayDate);
    }, [todayDate, setValue]);

    // Auto-save form draft to localStorage whenever fields change
    useEffect(() => {
        const subscription = watch((values) => {
            try {
                const hasUserInput = Object.entries(values).some(([k, v]) => {
                    if (k === "testDate" || k === "testId") return false;
                    return typeof v === "string" ? v.trim() !== "" : Boolean(v);
                });
                if (hasUserInput) {
                    localStorage.setItem(draftKey, JSON.stringify({ ...values, testDate: todayDate }));
                }
            } catch {
                // ignore storage quota errors
            }
        });
        return () => subscription.unsubscribe();
    }, [watch, draftKey, todayDate]);

    // Watch fields for dynamic workflow and TAT auto-computations
    const [
        testDate,
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

    const [connectedTicketInfo, setConnectedTicketInfo] = useState<{ ticketNumber?: string; status?: string; team?: string } | null>(null);

    const isCross = isCrossPlatform(channelTested);

    useEffect(() => {
        setValue("responseTimeMins", hmsDiff(timeQuestionAsked, timeAnswerReceived, testDate));
        const mins = getMinutesDiff(timeQuestionAsked, timeAnswerReceived, testDate);
        if (mins !== null && !isNaN(mins)) {
            setValue("slaStatus", mins <= 120 ? "Within SLA" : "SLA Breached", { shouldDirty: true });
            clearError("slaStatus");
        }
    }, [timeQuestionAsked, timeAnswerReceived, testDate]);

    useEffect(() => {
        if (isCross) {
            setValue("waResponseTimeMins", hmsDiff(waTimeQuestionAsked, waTimeAnswerReceived, testDate));
            const mins = getMinutesDiff(waTimeQuestionAsked, waTimeAnswerReceived, testDate);
            if (mins !== null && !isNaN(mins)) {
                setValue("waSlaStatus", mins <= 120 ? "Within SLA" : "SLA Breached", { shouldDirty: true });
                clearError("waSlaStatus");
            }
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
        if (synthesized) setValue("overallTestStatus", synthesized, { shouldDirty: true });
    }, [webOverallTestStatus, waOverallTestStatus, isCross, setValue]);

    const responseTimeMins = watch("responseTimeMins");
    const waResponseTimeMins = watch("waResponseTimeMins");
    const authorTatMins = watch("authorTatMins");
    const review1TatMins = watch("review1TatMins");
    const review2TatMins = watch("review2TatMins");
    const review3TatMins = watch("review3TatMins");
    const review4TatMins = watch("review4TatMins");
    const review5TatMins = watch("review5TatMins");
    const moderatorTatMins = watch("moderatorTatMins");

    const [
        languageTested,
        originalLanguage,
        translatedLanguage,
        defectIdBugRef,
        tagging,
        testerRemarks,
        translationQuality,
        overallTestStatus,
        queryText,
        testerRemarksNotes,
    ] = watch([
        "languageTested",
        "originalLanguage",
        "translatedLanguage",
        "defectIdBugRef",
        "tagging",
        "testerRemarks",
        "translationQuality",
        "overallTestStatus",
        "queryText",
        "testerRemarksNotes",
    ]);

    const isPass = (overallTestStatus || "").trim().toLowerCase() === "pass";

    const prevOverallStatusRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const current = (overallTestStatus || "").trim().toLowerCase();
        const prev = (prevOverallStatusRef.current || "").trim().toLowerCase();
        prevOverallStatusRef.current = overallTestStatus;

        if (current === "pass") {
            setValue("defectSeverity", "NA", { shouldDirty: true });
            setValue("defectIdBugRef", "NA", { shouldDirty: true });
            setValue("testerRemarks", "No Action Required", { shouldDirty: true });
            setValue("testerRemarksNotes", "", { shouldDirty: true });
            clearError("defectSeverity");
            clearError("defectIdBugRef");
            clearError("testerRemarks");
            clearError("testerRemarksNotes");
        } else if (prev === "pass" && current !== "pass") {
            if (getValues("defectSeverity") === "NA") {
                setValue("defectSeverity", "", { shouldDirty: true });
            }
            if (getValues("defectIdBugRef") === "NA") {
                setValue("defectIdBugRef", "", { shouldDirty: true });
            }
            if (getValues("testerRemarks") === "No Action Required") {
                setValue("testerRemarks", "", { shouldDirty: true });
            }
        }
    }, [overallTestStatus, setValue, getValues]);

    const notificationReceived = watch("notificationReceived");
    useEffect(() => {
        if (notificationReceived === "Not Received") {
            setValue("notificationOnSameThread", "Notification not received", { shouldDirty: true });
            setValue("notificationLinkedCorrectQId", "NA", { shouldDirty: true });
            clearError("notificationOnSameThread");
            clearError("notificationLinkedCorrectQId");
        }
    }, [notificationReceived, setValue]);

    const voiceInputWorking = watch("voiceInputWorking");
    const voiceOutputWorking = watch("voiceOutputWorking");
    useEffect(() => {
        if (voiceInputWorking === "No") {
            const cur = getValues("voiceInputQuality");
            if (cur === "Correct") {
                setValue("voiceInputQuality", "Error Displayed", { shouldDirty: true });
            }
        }
    }, [voiceInputWorking, setValue, getValues]);
    useEffect(() => {
        if (voiceOutputWorking === "No") {
            const cur = getValues("voiceOutputQuality");
            if (cur === "Clear") {
                setValue("voiceOutputQuality", "Error Displayed", { shouldDirty: true });
            }
        }
    }, [voiceOutputWorking, setValue, getValues]);

    const availableErrorOptions = getTranslationErrorOptions(translationQuality);

    const handleTranslationQualityChange = (quality: string) => {
        clearError("translationQuality");
        const allowed = TRANSLATION_ERROR_MAP[quality.trim()];
        if (allowed) {
            if (allowed.length === 1) {
                setValue("translationErrorType", allowed[0]);
                clearError("translationErrorType");
            } else {
                const currentErr = getValues("translationErrorType");
                if (!currentErr || !allowed.includes(currentErr)) {
                    setValue("translationErrorType", "");
                }
            }
        } else {
            setValue("translationErrorType", "");
        }
    };

    const isDynamic = isDynamicTagging(tagging);
    const isDuplicate = isDuplicateTagging(tagging);
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
            retrievalAccuracy: "",
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
            voiceInputIssueDescription: "",
            waVoiceInputIssueDescription: "",
            voiceOutputQuality: "",
            voiceIssueDescription: "",
            weatherQAnsweredCorrectly: "",
            mandiPriceQCorrect: "",
            schemeQCorrect: "",
            whatsappVsWebAnswerMatch: "",
            crossPlatformDiscrepancyNotes: "",
            webOverallTestStatus: "",
            waOverallTestStatus: "",
            overallTestStatus: "",
            defectSeverity: "",
            defectIdBugRef: "",
            testerRemarks: "",
            testerRemarksNotes: "",
        });
        setFormErrors({});
        setConnectedTicketInfo(null);
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

    const isWebRollover = isMidnightRollover(timeQuestionAsked, timeAnswerReceived);
    const isAskedInFuture = !isWebRollover && isTimeInFuture(timeQuestionAsked, testDate);
    const isAnsweredInFuture = isTimeInFuture(timeAnswerReceived, testDate);
    const isWebTimingInvalid = isTimeEarlier(timeAnswerReceived, timeQuestionAsked, testDate);

    const isWaRollover = isCross && isMidnightRollover(waTimeQuestionAsked, waTimeAnswerReceived);
    const isWaAskedInFuture = isCross && !isWaRollover && isTimeInFuture(waTimeQuestionAsked, testDate);
    const isWaAnsweredInFuture = isCross && isTimeInFuture(waTimeAnswerReceived, testDate);
    const isWaTimingInvalid = isCross && isTimeEarlier(waTimeAnswerReceived, waTimeQuestionAsked, testDate);

    const isAuthorRollover = !excludeReviewerWorkflow && isMidnightRollover(authorAssignmentTime, authorCompletionTime);
    const isAuthorAssignedInFuture = !excludeReviewerWorkflow && !isAuthorRollover && isTimeInFuture(authorAssignmentTime, testDate);
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
            const firstKey = Object.keys(errors)[0];
            const firstError = errors[firstKey];
            if (firstTimingError) {
                toast.error(firstTimingError);
            } else if (firstError && !firstError.includes("is required")) {
                toast.error(firstError);
            } else {
                toast.error("Please fill in all required fields before submitting.");
            }
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
        const isPassStatus = (data.overallTestStatus || "").trim().toLowerCase() === "pass";
        if (isPassStatus) {
            payload.defectSeverity = "NA";
            payload.defectIdBugRef = "NA";
            payload.testerRemarks = "No Action Required";
            delete payload.testerRemarksNotes;
        }
        if (!isCross) {
            delete payload.webThreadId;
            delete payload.waThreadId;
            delete payload.waTimeQuestionAsked;
            delete payload.waTimeAnswerReceived;
            delete payload.waResponseTimeMins;
            delete payload.waSlaStatus;
            delete payload.waVoiceInputWorking;
            delete payload.waVoiceOutputWorking;
            delete payload.waVoiceInputQuality;
            delete payload.waVoiceOutputQuality;
            delete payload.waVoiceInputIssueDescription;
            delete payload.waVoiceIssueDescription;
            delete payload.waNotificationReceived;
            delete payload.webOverallTestStatus;
            delete payload.waOverallTestStatus;
            delete payload.crossPlatformDiscrepancyNotes;
        }
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
        // Clean up empty strings for unsupplied optional fields so payloads remain clean
        (Object.keys(payload) as (keyof FormValues)[]).forEach((key) => {
            const val = payload[key];
            if (typeof val === "string" && val.trim() === "") {
                delete payload[key];
            }
        });
        mutate(payload);
    };

    // Calculate error counts per section to display badges and auto-expand
    const s1Errors = ["typeOfQuestion", "buildVersion", "channelTested", "languageTested", "threadId", "waThreadId", "questionCategory", "queryText"].filter(k => formErrors[k]).length;
    const s2Errors = ["timeQuestionAsked", "timeAnswerReceived", "slaStatus", "waTimeQuestionAsked", "waTimeAnswerReceived", "waSlaStatus"].filter(k => formErrors[k]).length
        + ((isAskedInFuture || isAnsweredInFuture || isWebTimingInvalid) && !formErrors.timeAnswerReceived && !formErrors.timeQuestionAsked ? 1 : 0)
        + ((isWaAskedInFuture || isWaAnsweredInFuture || isWaTimingInvalid) && !formErrors.waTimeAnswerReceived && !formErrors.waTimeQuestionAsked ? 1 : 0);
    const s3Errors = ["questionInReviewModel", "questionCorrectlyFramed", "originalLanguage", "translatedLanguage", "translationQuality", "translationErrorType", "tagging"].filter(k => formErrors[k]).length;
    const s4Errors = [
        "allocatedToReviewer", "authorsName", "authorAssignmentTime", "authorCompletionTime",
        "reviewer1Name", "reviewer1AssignmentTime", "reviewer1CompletionTime",
        "reviewer2Name", "reviewer2AssignmentTime", "reviewer2CompletionTime",
        "reviewer3Name", "reviewer3AssignmentTime", "reviewer3CompletionTime",
        "reviewer4Name", "reviewer4AssignmentTime", "reviewer4CompletionTime",
        "reviewer5Name", "reviewer5AssignmentTime", "reviewer5CompletionTime",
        "moderatorName", "moderatorAssignmentTime", "moderatorCompletionTime",
    ].filter(k => formErrors[k]).length
        + ((isAuthorAssignedInFuture || isAuthorCompletedInFuture || isAuthorTimingInvalid) && !formErrors.authorCompletionTime && !formErrors.authorAssignmentTime ? 1 : 0);
    const s5Errors = ["followUpQInReviewModel", "answerScientificallyCorrect", "retrievalAccuracy", "expertNameDisplayed", "correctSourceLinksProvided"].filter(k => formErrors[k]).length;
    const s6Errors = ["msg120MinShownToUser", "notificationReceived", "waNotificationReceived", "notificationOnSameThread", "notificationLinkedCorrectQId", "voiceInputWorking", "voiceOutputWorking", "waVoiceInputWorking", "waVoiceOutputWorking", "voiceInputIssueDescription", "waVoiceInputIssueDescription", "voiceInputQuality", "voiceOutputQuality", "voiceIssueDescription"].filter(k => formErrors[k]).length;
    const s7Errors = ["weatherQAnsweredCorrectly", "mandiPriceQCorrect", "schemeQCorrect", "whatsappVsWebAnswerMatch", "crossPlatformDiscrepancyNotes"].filter(k => formErrors[k]).length;
    const s8Errors = ["webOverallTestStatus", "waOverallTestStatus", "overallTestStatus", "defectSeverity", "defectIdBugRef", "testerRemarks", "testerRemarksNotes"].filter(k => formErrors[k]).length;

    return (
        <>
            <form
                onSubmit={handleSubmit(onSubmit)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
                        e.preventDefault();
                    }
                }}
                className="space-y-4"
            >

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
                    maxLength={TEXT_FIELD_LIMITS.BUILD_VERSION_MAX}
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
                            maxLength={TEXT_FIELD_LIMITS.THREAD_ID_MAX}
                            required
                            error={formErrors.threadId}
                            {...register("threadId", { onChange: () => clearError("threadId") })}
                        />
                        <TextInput
                            label="WhatsApp Thread / Phone Number"
                            placeholder="WA thread ID or Phone Number"
                            maxLength={TEXT_FIELD_LIMITS.WA_THREAD_ID_MAX}
                            required
                            error={formErrors.waThreadId}
                            {...register("waThreadId", { onChange: () => clearError("waThreadId") })}
                        />
                    </>
                ) : (
                    <TextInput
                        label="Thread ID"
                        placeholder="Thread ID"
                        maxLength={TEXT_FIELD_LIMITS.THREAD_ID_MAX}
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
                    maxLength={TEXT_FIELD_LIMITS.QUERY_TEXT_MAX}
                    helper={`${(queryText || "").length} / ${TEXT_FIELD_LIMITS.QUERY_TEXT_MAX}`}
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
                    label="Question Appeared in Review Model?"
                    options={REVIEW_MODEL_OPTIONS}
                    required
                    error={formErrors.questionInReviewModel}
                    {...register("questionInReviewModel", { onChange: () => clearError("questionInReviewModel") })}
                />
                <SelectInput
                    label="Question Framed Correctly?"
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
                    {...register("translationQuality", {
                        onChange: (e) => handleTranslationQualityChange(e.target.value),
                    })}
                />
                <SelectInput
                    label="Translation Error Type"
                    options={availableErrorOptions}
                    required
                    disabled={!translationQuality}
                    placeholder={translationQuality ? "-- Select --" : "-- Select Translation Quality first --"}
                    error={formErrors.translationErrorType}
                    {...register("translationErrorType", { onChange: () => clearError("translationErrorType") })}
                />
                <SelectInput
                    label="Tagging"
                    options={TAGGING_OPTIONS}
                    required
                    error={formErrors.tagging}
                    {...register("tagging", { onChange: () => clearError("tagging") })}
                />
            </FormSection>

            {/* Section 4 */}
            {!excludeReviewerWorkflow && (
                <FormSection title="4. Reviewer Workflow" defaultOpen={true} errorCount={s4Errors}>
                    <SelectInput
                        label="Allocated to Author?"
                        options={ALLOCATED_TO_AUTHOR_OPTIONS}
                        required
                        error={formErrors.allocatedToReviewer}
                        {...register("allocatedToReviewer", { onChange: () => clearError("allocatedToReviewer") })}
                    />

                    <div className="sm:col-span-2 lg:col-span-3 border-t border-border pt-3 mt-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Author</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <TextInput
                                label="Author Name"
                                maxLength={TEXT_FIELD_LIMITS.NAME_MAX}
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
                                <TextInput label={`Reviewer ${n} Name`} maxLength={TEXT_FIELD_LIMITS.NAME_MAX} {...register(`reviewer${n}Name` as any)} />
                                <TimeInput label={`Reviewer ${n} Assignment Time`} max={getLocalDatetimeMax()} error={formErrors[`reviewer${n}AssignmentTime`]} {...register(`reviewer${n}AssignmentTime` as any)} />
                                <TimeInput label={`Reviewer ${n} Completion Time`} max={getLocalDatetimeMax()} error={formErrors[`reviewer${n}CompletionTime`]} {...register(`reviewer${n}CompletionTime` as any)} />
                                <TimeInput label={`Review ${n} TAT [Auto]`} readOnly value={[review1TatMins, review2TatMins, review3TatMins, review4TatMins, review5TatMins][n - 1] ?? ""} onChange={() => {}} />
                            </div>
                        </div>
                    ))}

                    <div className="sm:col-span-2 lg:col-span-3 border-t border-border pt-3 mt-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Moderator</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <TextInput label="Moderator Name" maxLength={TEXT_FIELD_LIMITS.NAME_MAX} {...register("moderatorName")} />
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
                    label="Scientific Accuracy"
                    options={ANSWER_CORRECT_OPTIONS}
                    required
                    error={formErrors.answerScientificallyCorrect}
                    {...register("answerScientificallyCorrect", { onChange: () => clearError("answerScientificallyCorrect") })}
                />
                <SelectInput
                    label="Retrieval Accuracy"
                    options={RETRIEVAL_ACCURACY_OPTIONS}
                    required
                    error={formErrors.retrievalAccuracy}
                    {...register("retrievalAccuracy", { onChange: () => clearError("retrievalAccuracy") })}
                />
                <SelectInput
                    label="Expert Name Displayed?"
                    options={EXPERT_DISPLAYED_OPTIONS}
                    required
                    error={formErrors.expertNameDisplayed}
                    {...register("expertNameDisplayed", { onChange: () => clearError("expertNameDisplayed") })}
                />
                <SelectInput
                    label="Correct Source Links Provided?"
                    options={SOURCE_LINKS_OPTIONS}
                    required
                    error={formErrors.correctSourceLinksProvided}
                    {...register("correctSourceLinksProvided", { onChange: () => clearError("correctSourceLinksProvided") })}
                />
            </FormSection>

            {/* Section 6 (or 5 if dynamic/duplicate) */}
            <FormSection title={`${excludeReviewerWorkflow ? 5 : 6}. Notifications & Voice`} defaultOpen={true} errorCount={s6Errors}>
                {/* Notification Inputs */}
                <SelectInput
                    label="120-min Disclaimer Received by the User?"
                    options={DISCLAIMER_120_OPTIONS}
                    required
                    error={formErrors.msg120MinShownToUser}
                    {...register("msg120MinShownToUser", { onChange: () => clearError("msg120MinShownToUser") })}
                />
                {isCross ? (
                    <div className="sm:col-span-2 lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SelectInput
                            label="Web Notification Received?"
                            options={NOTIFICATION_RECEIVED_OPTIONS}
                            required
                            error={formErrors.notificationReceived}
                            {...register("notificationReceived", { onChange: () => clearError("notificationReceived") })}
                        />
                        <SelectInput
                            label="WhatsApp Notification Received?"
                            options={NOTIFICATION_RECEIVED_OPTIONS}
                            required
                            error={formErrors.waNotificationReceived}
                            {...register("waNotificationReceived", { onChange: () => clearError("waNotificationReceived") })}
                        />
                    </div>
                ) : (
                    <SelectInput
                        label="Notification Received?"
                        options={NOTIFICATION_RECEIVED_OPTIONS}
                        required
                        error={formErrors.notificationReceived}
                        {...register("notificationReceived", { onChange: () => clearError("notificationReceived") })}
                    />
                )}
                <SelectInput
                    label="Notification on Same Thread?"
                    options={NOTIFICATION_SAME_THREAD_OPTIONS}
                    required
                    error={formErrors.notificationOnSameThread}
                    {...register("notificationOnSameThread", { onChange: () => clearError("notificationOnSameThread") })}
                />
                <SelectInput
                    label="Notification Linked to Correct Q-ID?"
                    options={NOTIFICATION_LINKED_QID_OPTIONS}
                    required
                    error={formErrors.notificationLinkedCorrectQId}
                    {...register("notificationLinkedCorrectQId", { onChange: () => clearError("notificationLinkedCorrectQId") })}
                />

                {/* Voice Inputs */}
                {isCross ? (
                    <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3.5 rounded-lg border border-border bg-card space-y-3">
                            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                                <Laptop className="h-3.5 w-3.5" /> Web App Voice
                            </p>
                            <SelectInput
                                label="Web Voice Input Working?"
                                options={YES_NO_NA_OPTIONS}
                                required
                                error={formErrors.voiceInputWorking}
                                {...register("voiceInputWorking", { onChange: () => clearError("voiceInputWorking") })}
                            />
                            <SelectInput
                                label="Web Voice Output Working?"
                                options={YES_NO_NA_OPTIONS}
                                required
                                error={formErrors.voiceOutputWorking}
                                {...register("voiceOutputWorking", { onChange: () => clearError("voiceOutputWorking") })}
                            />
                            <SelectInput
                                label="Web Voice Input Issue Description"
                                options={VOICE_ISSUE_OPTIONS}
                                required
                                error={formErrors.voiceInputIssueDescription}
                                {...register("voiceInputIssueDescription", { onChange: () => clearError("voiceInputIssueDescription") })}
                            />
                        </div>
                        <div className="p-3.5 rounded-lg border border-border bg-card space-y-3">
                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                                <Smartphone className="h-3.5 w-3.5" /> WhatsApp Voice
                            </p>
                            <SelectInput
                                label="WhatsApp Voice Input Working?"
                                options={YES_NO_NA_OPTIONS}
                                required
                                error={formErrors.waVoiceInputWorking}
                                {...register("waVoiceInputWorking", { onChange: () => clearError("waVoiceInputWorking") })}
                            />
                            <SelectInput
                                label="WhatsApp Voice Output Working?"
                                options={YES_NO_NA_OPTIONS}
                                required
                                error={formErrors.waVoiceOutputWorking}
                                {...register("waVoiceOutputWorking", { onChange: () => clearError("waVoiceOutputWorking") })}
                            />
                            <SelectInput
                                label="WhatsApp Voice Input Issue Description"
                                options={VOICE_ISSUE_OPTIONS}
                                required
                                error={formErrors.waVoiceInputIssueDescription}
                                {...register("waVoiceInputIssueDescription", { onChange: () => clearError("waVoiceInputIssueDescription") })}
                            />
                        </div>
                    </div>
                ) : (
                    <>
                        <SelectInput
                            label="Voice Input Working?"
                            options={YES_NO_NA_OPTIONS}
                            required
                            error={formErrors.voiceInputWorking}
                            {...register("voiceInputWorking", { onChange: () => clearError("voiceInputWorking") })}
                        />
                        <SelectInput
                            label="Voice Output Working?"
                            options={YES_NO_NA_OPTIONS}
                            required
                            error={formErrors.voiceOutputWorking}
                            {...register("voiceOutputWorking", { onChange: () => clearError("voiceOutputWorking") })}
                        />
                        <SelectInput
                            label="Voice Input Issue Description"
                            options={VOICE_ISSUE_OPTIONS}
                            required
                            error={formErrors.voiceInputIssueDescription}
                            {...register("voiceInputIssueDescription", { onChange: () => clearError("voiceInputIssueDescription") })}
                        />
                    </>
                )}
                <SelectInput
                    label="Voice Input Quality"
                    options={VOICE_INPUT_QUALITY_OPTIONS}
                    required
                    error={formErrors.voiceInputQuality}
                    {...register("voiceInputQuality", { onChange: () => clearError("voiceInputQuality") })}
                />
                <SelectInput
                    label="Voice Output Quality"
                    options={VOICE_OUTPUT_QUALITY_OPTIONS}
                    required
                    error={formErrors.voiceOutputQuality}
                    {...register("voiceOutputQuality", { onChange: () => clearError("voiceOutputQuality") })}
                />
                <SelectInput
                    label="Voice Output Issue Description"
                    options={VOICE_ISSUE_OPTIONS}
                    required
                    error={formErrors.voiceIssueDescription}
                    {...register("voiceIssueDescription", { onChange: () => clearError("voiceIssueDescription") })}
                />
            </FormSection>

            {/* Section 7 (or 6 if dynamic/duplicate) */}
            <FormSection title={`${excludeReviewerWorkflow ? 6 : 7}. Domain Checks & Parity`} defaultOpen={true} errorCount={s7Errors}>
                {isCross ? (
                    <div className="sm:col-span-2 lg:col-span-3 p-3.5 rounded-lg border border-purple-500/30 bg-purple-500/5 mb-1 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                                Cross-Platform Parity & Consistency
                            </span>
                            <span className="text-[11px] text-muted-foreground">Compare Web App vs. WhatsApp</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <SelectInput
                                label="WhatsApp vs Web Application Answer Match?"
                                options={WHATSAPP_VS_WEB_MATCH_OPTIONS}
                                required
                                error={formErrors.whatsappVsWebAnswerMatch}
                                {...register("whatsappVsWebAnswerMatch", { onChange: () => clearError("whatsappVsWebAnswerMatch") })}
                            />
                            <TextInput
                                label="Discrepancy Notes (if answers differ)"
                                placeholder="e.g. WebApp provided detailed tables, WhatsApp returned summary text"
                                maxLength={TEXT_FIELD_LIMITS.DISCREPANCY_NOTES_MAX}
                                error={formErrors.crossPlatformDiscrepancyNotes}
                                {...register("crossPlatformDiscrepancyNotes", { onChange: () => clearError("crossPlatformDiscrepancyNotes") })}
                            />
                        </div>
                    </div>
                ) : (
                    <SelectInput
                        label="WhatsApp vs Web Application Answer Match?"
                        options={WHATSAPP_VS_WEB_MATCH_OPTIONS}
                        required
                        error={formErrors.whatsappVsWebAnswerMatch}
                        {...register("whatsappVsWebAnswerMatch", { onChange: () => clearError("whatsappVsWebAnswerMatch") })}
                    />
                )}
                <SelectInput
                    label="Weather Q Answered Correctly?"
                    options={YES_NO_NA_OPTIONS}
                    required
                    error={formErrors.weatherQAnsweredCorrectly}
                    {...register("weatherQAnsweredCorrectly", { onChange: () => clearError("weatherQAnsweredCorrectly") })}
                />
                <SelectInput
                    label="Mandi Price Q Correct?"
                    options={YES_NO_NA_OPTIONS}
                    required
                    error={formErrors.mandiPriceQCorrect}
                    {...register("mandiPriceQCorrect", { onChange: () => clearError("mandiPriceQCorrect") })}
                />
                <SelectInput
                    label="Scheme Q Correct?"
                    options={YES_NO_NA_OPTIONS}
                    required
                    error={formErrors.schemeQCorrect}
                    {...register("schemeQCorrect", { onChange: () => clearError("schemeQCorrect") })}
                />
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
                    required={!isPass}
                    disabled={isPass}
                    error={formErrors.defectSeverity}
                    {...register("defectSeverity", { onChange: () => clearError("defectSeverity") })}
                />
                <DefectIdBugRefInput
                    value={defectIdBugRef}
                    required={!isPass}
                    disabled={isPass}
                    error={formErrors.defectIdBugRef}
                    onChange={val => {
                        setValue("defectIdBugRef", val);
                        clearError("defectIdBugRef");
                        if (!val) setConnectedTicketInfo(null);
                    }}
                    onOpenCreateModal={() => setIsTicketModalOpen(true)}
                    zohoStatuses={zohoStatuses}
                    connectedTicketInfo={connectedTicketInfo}
                />
                <SelectInput
                    label="Tester Remarks"
                    options={TESTER_REMARKS_OPTIONS}
                    required
                    disabled={isPass}
                    error={formErrors.testerRemarks}
                    {...register("testerRemarks", {
                        onChange: (e) => {
                            clearError("testerRemarks");
                            if (e.target.value === "No Action Required") {
                                setValue("testerRemarksNotes", "");
                                clearError("testerRemarksNotes");
                            }
                        },
                    })}
                />
                {testerRemarks && testerRemarks !== "No Action Required" && (
                    <TextareaInput
                        label="Remarks Details"
                        placeholder="Write down your detailed remarks..."
                        maxLength={TEXT_FIELD_LIMITS.REMARKS_NOTES_MAX}
                        helper={`${(testerRemarksNotes || "").length} / ${TEXT_FIELD_LIMITS.REMARKS_NOTES_MAX}`}
                        required
                        error={formErrors.testerRemarksNotes}
                        {...register("testerRemarksNotes", { onChange: () => clearError("testerRemarksNotes") })}
                    />
                )}
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
            onTicketCreated={(url, ticketNumber) => {
                setValue("defectIdBugRef", url, { shouldDirty: true });
                clearError("defectIdBugRef");
                setConnectedTicketInfo(ticketNumber ? { ticketNumber: ticketNumber || undefined, status: "Open" } : null);
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
                testerRemarksNotes: watch("testerRemarksNotes"),
                overallTestStatus: watch("overallTestStatus"),
                testerName,
                userEmail,
            }}
        />
    </>
    );
}

