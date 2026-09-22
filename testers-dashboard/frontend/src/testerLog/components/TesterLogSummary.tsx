import { useState, useMemo } from "react";
import { useTesterLogSummary } from "../hooks/useTesterLogSummary";
import { useTesterLogHistory } from "../hooks/useTesterLogHistory";
import type { ITesterLogEntry } from "../types";
import {
    Calendar,
    ChevronDown,
    ChevronUp,
    Loader2,
    RotateCcw,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Clock,
    ClipboardList,
    Search,
    ShieldCheck,
    Database,
    Mic,
    HelpCircle,
    Activity,
    Layers,
    Languages,
    Radio,
    Target,
    Smartphone,
    Laptop,
    PlusCircle,
} from "lucide-react";

type DatePreset = "all" | "today" | "7days" | "30days" | "custom";
type StatusFilter = "all" | "pass" | "fail" | "partial" | "defects";

function FractionDisplay({
    achieved,
    target,
    size = "md",
}: {
    achieved: number;
    target: number;
    size?: "sm" | "md" | "lg";
}) {
    const pct = target > 0 ? Math.round((achieved / target) * 1000) / 10 : 0;
    const isComplete = achieved >= target && target > 0;
    const isWarning = pct < 50;

    const colorClass = isComplete
        ? "text-emerald-600 dark:text-emerald-400"
        : isWarning
        ? "text-rose-600 dark:text-rose-400"
        : "text-amber-600 dark:text-amber-400";

    const barColor = isComplete
        ? "bg-emerald-500"
        : isWarning
        ? "bg-rose-500"
        : "bg-amber-500";

    return (
        <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-1.5">
                <div className="flex items-baseline gap-1">
                    <span className={`font-bold ${size === "lg" ? "text-xl" : "text-sm"} ${colorClass}`}>
                        {achieved}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                        / {target}
                    </span>
                </div>
                <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        isComplete
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : isWarning
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    }`}
                >
                    {pct}%
                </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                    className={`h-full ${barColor} rounded-full transition-all duration-300`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                />
            </div>
        </div>
    );
}

function Badge({ value }: { value?: string }) {
    if (!value) return <span className="text-muted-foreground text-xs">—</span>;
    const colorMap: Record<string, string> = {
        Pass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        Fail: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        Partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
        "Anomaly Found in Output": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        "Expected Output": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        Pending: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        Met: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
        Breached: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
    };
    const cls = colorMap[value] ?? "bg-muted text-muted-foreground";
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
            {value}
        </span>
    );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
    if (!value) return null;
    const isUrl = value.startsWith("http://") || value.startsWith("https://");
    return (
        <div className="flex gap-2 text-sm">
            <span className="font-medium text-muted-foreground min-w-[180px] shrink-0">{label}:</span>
            {isUrl ? (
                <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:text-primary/80 break-all"
                >
                    {value} ↗
                </a>
            ) : (
                <span className="text-foreground break-words">{value}</span>
            )}
        </div>
    );
}

function EntryRow({ entry }: { entry: ITesterLogEntry }) {
    const [expanded, setExpanded] = useState(false);

    const submittedAt = entry.createdAt
        ? new Date(entry.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
        : "—";

    const hasDefect = Boolean(
        (entry.defectSeverity && !["na", "nil", "no defect", "none"].includes(entry.defectSeverity.trim().toLowerCase())) ||
        (entry.defectIdBugRef && entry.defectIdBugRef.trim() && !["na", "nil", "none"].includes(entry.defectIdBugRef.trim().toLowerCase()))
    );

    return (
        <>
            <tr
                className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setExpanded(e => !e)}
            >
                <td className="px-4 py-3 text-sm whitespace-nowrap">{entry.testDate || "—"}</td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground whitespace-nowrap">{entry.threadId || "—"}</td>
                <td className="px-4 py-3 text-sm max-w-[200px] truncate" title={entry.queryText}>{entry.queryText || "—"}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap text-muted-foreground">{entry.typeOfQuestion || "—"}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap text-muted-foreground">
                    {[entry.channelTested, entry.languageTested].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap"><Badge value={entry.slaStatus} /></td>
                <td className="px-4 py-3 whitespace-nowrap"><Badge value={entry.overallTestStatus} /></td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {hasDefect ? (
                        <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {entry.defectSeverity || "Defect"}
                            {entry.defectIdBugRef ? ` (${entry.defectIdBugRef})` : ""}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    )}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{submittedAt}</td>
                <td className="px-4 py-3 text-right">
                    {expanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground inline" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground inline" />}
                </td>
            </tr>
            {expanded && (
                <tr className="border-b border-border bg-muted/20">
                    <td colSpan={10} className="px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                            <DetailRow label="Type of Question" value={entry.typeOfQuestion} />
                            <DetailRow label="Build / Version" value={entry.buildVersion} />
                            <DetailRow label="Sprint / Cycle" value={entry.sprintCycle} />
                            <DetailRow label="Channel Tested" value={entry.channelTested} />
                            <DetailRow label="Language Tested" value={entry.languageTested} />
                            <DetailRow label="Question Category" value={entry.questionCategory} />
                            <DetailRow label="Time Question Asked" value={entry.timeQuestionAsked} />
                            <DetailRow label="Time Answer Received" value={entry.timeAnswerReceived} />
                            <DetailRow label="Response Time [Auto]" value={entry.responseTimeMins} />
                            <DetailRow label="SLA Status" value={entry.slaStatus} />
                            <DetailRow label="Question in Review Model?" value={entry.questionInReviewModel} />
                            <DetailRow label="Question Correctly Framed?" value={entry.questionCorrectlyFramed} />
                            <DetailRow label="Original Language" value={entry.originalLanguage} />
                            <DetailRow label="Translated Language" value={entry.translatedLanguage} />
                            <DetailRow label="Translation Quality" value={entry.translationQuality} />
                            <DetailRow label="Translation Error Type" value={entry.translationErrorType} />
                            <DetailRow label="Tagging" value={entry.tagging} />
                            <DetailRow label="Allocated to Reviewer?" value={entry.allocatedToReviewer} />
                            <DetailRow label="Author Name" value={entry.authorsName} />
                            <DetailRow label="Author TAT" value={entry.authorTatMins} />
                            <DetailRow label="Reviewer1 Name" value={entry.reviewer1Name} />
                            <DetailRow label="Review1 TAT" value={entry.review1TatMins} />
                            <DetailRow label="Follow-up Q in Review Model?" value={entry.followUpQInReviewModel} />
                            <DetailRow label="Answer Scientifically Correct?" value={entry.answerScientificallyCorrect} />
                            <DetailRow label="Expert Name Displayed?" value={entry.expertNameDisplayed} />
                            <DetailRow label="Correct Expert Name Displayed?" value={entry.correctExpertNameDisplayed} />
                            <DetailRow label="Correct Source Links Provided?" value={entry.correctSourceLinksProvided} />
                            <DetailRow label="120-min Msg Shown?" value={entry.msg120MinShownToUser} />
                            <DetailRow label="Notification Received?" value={entry.notificationReceived} />
                            <DetailRow label="Voice Input Working?" value={entry.voiceInputWorking} />
                            <DetailRow label="Voice Output Working?" value={entry.voiceOutputWorking} />
                            <DetailRow label="Voice Issue Description" value={entry.voiceIssueDescription} />
                            <DetailRow label="Question Saved in DB?" value={entry.questionSavedInDb} />
                            <DetailRow label="Answer Saved in DB?" value={entry.answerSavedInDb} />
                            <DetailRow label="Defect Severity" value={entry.defectSeverity} />
                            <DetailRow label="Defect ID / Bug Ref" value={entry.defectIdBugRef} />
                            <DetailRow label="Reviewer Remarks" value={entry.reviewerRemarks} />
                            <DetailRow label="Tester Remarks" value={entry.testerRemarks} />
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

const DAILY_TARGET_SPECS = [
    { questionType: "Unique", targetTotal: 8, targetWebApp: 4, targetWhatsApp: 4 },
    { questionType: "GDB", targetTotal: 8, targetWebApp: 4, targetWhatsApp: 4 },
    { questionType: "Outreach", targetTotal: 11, targetWebApp: 6, targetWhatsApp: 5 },
    { questionType: "Dynamic - Weather", targetTotal: 19, targetWebApp: 9, targetWhatsApp: 10 },
    { questionType: "Dynamic - Scheme", targetTotal: 6, targetWebApp: 3, targetWhatsApp: 3 },
    { questionType: "Dynamic - Mandi", targetTotal: 2, targetWebApp: 1, targetWhatsApp: 1 },
] as const;

interface TesterLogSummaryProps {
    onLogNewTest?: () => void;
}

export function TesterLogSummary({ onLogNewTest }: TesterLogSummaryProps = {}) {
    const [preset, setPreset] = useState<DatePreset>("today");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [dateField, setDateField] = useState<"testDate" | "createdAt">("testDate");

    // Table search & status filter state
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [targetViewMode, setTargetViewMode] = useState<"period" | "daily">("period");
    const [page, setPage] = useState(1);
    const LIMIT = 15;

    const { startDate, endDate } = useMemo(() => {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        if (preset === "today") {
            return { startDate: todayStr, endDate: todayStr };
        }
        if (preset === "7days") {
            const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            return { startDate: past7, endDate: todayStr };
        }
        if (preset === "30days") {
            const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            return { startDate: past30, endDate: todayStr };
        }
        if (preset === "custom") {
            return {
                startDate: customStart || undefined,
                endDate: customEnd || undefined,
            };
        }
        return { startDate: undefined, endDate: undefined };
    }, [preset, customStart, customEnd]);

    const hasActiveFilter = preset !== "all" || Boolean(customStart || customEnd);

    // Fetch summary metrics
    const {
        data: summaryData,
        isLoading: summaryLoading,
        isError: summaryError,
    } = useTesterLogSummary(startDate, endDate, dateField);

    // Fetch individual test history records for this tester and date filter
    const {
        data: historyData,
        isLoading: historyLoading,
        isError: historyError,
    } = useTesterLogHistory(page, LIMIT, startDate, endDate, dateField);

    const clearFilter = () => {
        setPreset("all");
        setCustomStart("");
        setCustomEnd("");
        setDateField("testDate");
        setPage(1);
        setSearchQuery("");
        setStatusFilter("all");
    };

    // Filter individual entries locally by search query and status filter tab
    const filteredEntries = useMemo(() => {
        if (!historyData?.entries) return [];
        let list = historyData.entries;

        if (statusFilter === "pass") {
            list = list.filter(e => {
                const s = (e.overallTestStatus || "").toLowerCase();
                return s === "pass" || s === "expected output";
            });
        } else if (statusFilter === "fail") {
            list = list.filter(e => {
                const s = (e.overallTestStatus || "").toLowerCase();
                return s === "fail" || s.includes("anomaly");
            });
        } else if (statusFilter === "partial") {
            list = list.filter(e => (e.overallTestStatus || "").toLowerCase() === "partial");
        } else if (statusFilter === "defects") {
            list = list.filter(e => {
                const sev = (e.defectSeverity || "").trim().toLowerCase();
                return Boolean(
                    (sev && !["na", "nil", "no defect", "none"].includes(sev)) ||
                    (e.defectIdBugRef && e.defectIdBugRef.trim() && !["na", "nil", "none"].includes(e.defectIdBugRef.trim().toLowerCase()))
                );
            });
        }

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(e =>
                (e.queryText || "").toLowerCase().includes(q) ||
                (e.threadId || "").toLowerCase().includes(q) ||
                (e.typeOfQuestion || "").toLowerCase().includes(q) ||
                (e.defectIdBugRef || "").toLowerCase().includes(q)
            );
        }

        return list;
    }, [historyData?.entries, statusFilter, searchQuery]);

    const daysCount = useMemo(() => {
        if (summaryData?.targetVsAchieved?.daysCount) {
            return summaryData.targetVsAchieved.daysCount;
        }
        if (startDate && endDate) {
            const start = new Date(startDate.trim().slice(0, 10));
            const end = new Date(endDate.trim().slice(0, 10));
            const diff = end.getTime() - start.getTime();
            if (!isNaN(diff) && diff >= 0) {
                return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
            }
        }
        return 1;
    }, [summaryData?.targetVsAchieved?.daysCount, startDate, endDate]);

    const targetRows = useMemo(() => {
        const backendRows = summaryData?.targetVsAchieved?.rows;
        const multiplier = targetViewMode === "period" ? daysCount : 1;

        return DAILY_TARGET_SPECS.map(spec => {
            const bRow = backendRows?.find(r => r.questionType === spec.questionType);
            const achievedTotal = bRow ? bRow.achievedTotal : 0;
            const achievedWebApp = bRow ? bRow.achievedWebApp : 0;
            const achievedWhatsApp = bRow ? bRow.achievedWhatsApp : 0;

            const targetTotal = spec.targetTotal * multiplier;
            const targetWebApp = spec.targetWebApp * multiplier;
            const targetWhatsApp = spec.targetWhatsApp * multiplier;

            const effectiveAchievedTotal = targetViewMode === "daily" && daysCount > 1
                ? Math.round((achievedTotal / daysCount) * 10) / 10
                : achievedTotal;
            const effectiveAchievedWebApp = targetViewMode === "daily" && daysCount > 1
                ? Math.round((achievedWebApp / daysCount) * 10) / 10
                : achievedWebApp;
            const effectiveAchievedWhatsApp = targetViewMode === "daily" && daysCount > 1
                ? Math.round((achievedWhatsApp / daysCount) * 10) / 10
                : achievedWhatsApp;

            const completionRate = targetTotal > 0
                ? Math.round((effectiveAchievedTotal / targetTotal) * 1000) / 10
                : 0;

            return {
                questionType: spec.questionType,
                targetTotal,
                achievedTotal: effectiveAchievedTotal,
                targetWebApp,
                achievedWebApp: effectiveAchievedWebApp,
                targetWhatsApp,
                achievedWhatsApp: effectiveAchievedWhatsApp,
                completionRate,
            };
        });
    }, [summaryData?.targetVsAchieved, targetViewMode, daysCount]);

    const targetTotalRow = useMemo(() => {
        const multiplier = targetViewMode === "period" ? daysCount : 1;
        const targetTotal = 54 * multiplier;
        const targetWebApp = 27 * multiplier;
        const targetWhatsApp = 27 * multiplier;

        const achievedTotal = targetRows.reduce((sum, r) => sum + r.achievedTotal, 0);
        const achievedWebApp = targetRows.reduce((sum, r) => sum + r.achievedWebApp, 0);
        const achievedWhatsApp = targetRows.reduce((sum, r) => sum + r.achievedWhatsApp, 0);
        const completionRate = targetTotal > 0 ? Math.round((achievedTotal / targetTotal) * 1000) / 10 : 0;

        return {
            questionType: "Total",
            targetTotal,
            achievedTotal: Math.round(achievedTotal * 10) / 10,
            targetWebApp,
            achievedWebApp: Math.round(achievedWebApp * 10) / 10,
            targetWhatsApp,
            achievedWhatsApp: Math.round(achievedWhatsApp * 10) / 10,
            completionRate,
        };
    }, [targetRows, targetViewMode, daysCount]);

    const isLoading = summaryLoading && historyLoading;
    const isError = summaryError && historyError;
    const totalTests = summaryData?.totalTests ?? historyData?.total ?? 0;

    return (
        <div className="space-y-6">
            {/* Filter Toolbar - Exactly matching My History */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-card border border-border rounded-lg shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span>Date Filter:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {[
                            { key: "all" as const, label: "All Time" },
                            { key: "today" as const, label: "Today" },
                            { key: "7days" as const, label: "Last 7 Days" },
                            { key: "30days" as const, label: "Last 30 Days" },
                            { key: "custom" as const, label: "Custom" },
                        ].map(p => (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => {
                                    setPreset(p.key);
                                    setPage(1);
                                }}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                                    preset === p.key
                                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60"
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Target Date Field Selector */}
                    <div className="flex items-center gap-1.5 pl-2 ml-1 border-l border-border text-xs text-muted-foreground">
                        <span>Filter by:</span>
                        <select
                            value={dateField}
                            onChange={e => {
                                setDateField(e.target.value as "testDate" | "createdAt");
                                setPage(1);
                            }}
                            className="h-7 px-2 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none cursor-pointer"
                        >
                            <option value="testDate">Test Date</option>
                            <option value="createdAt">Submission Date</option>
                        </select>
                    </div>
                </div>

                {/* Custom date range inputs */}
                {preset === "custom" && (
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground font-medium">From:</span>
                            <input
                                type="date"
                                value={customStart}
                                onChange={e => {
                                    setCustomStart(e.target.value);
                                    setPage(1);
                                }}
                                className="h-7 px-2 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground font-medium">To:</span>
                            <input
                                type="date"
                                value={customEnd}
                                onChange={e => {
                                    setCustomEnd(e.target.value);
                                    setPage(1);
                                }}
                                className="h-7 px-2 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </div>
                )}

                {/* Clear button */}
                {hasActiveFilter && (
                    <button
                        type="button"
                        onClick={clearFilter}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted transition-colors ml-auto cursor-pointer"
                        title="Clear date filter"
                    >
                        <RotateCcw className="h-3 w-3" />
                        <span>Clear Filter</span>
                    </button>
                )}
            </div>

            {/* Content States */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading your summary and test history...</span>
                </div>
            ) : isError ? (
                <div className="text-center py-16 text-destructive text-sm bg-destructive/5 rounded-lg border border-destructive/20">
                    Failed to load your test summary. Please check your connection and try again.
                </div>
            ) : (
                <>
                    {/* Target vs. Achieved Analytics Section OR All-Time Test Breakdown */}
                    <div className="p-5 bg-card border border-border rounded-xl shadow-xs space-y-4">
                        {preset === "all" ? (
                            <>
                                {/* All-Time Section Header */}
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                                                <Layers className="h-4 w-4" />
                                            </div>
                                            <h3 className="text-base font-semibold text-foreground">
                                                All-Time Test Execution Breakdown
                                            </h3>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground">
                                                Achieved Counts
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Total tests conducted by you across question categories and channels over all time.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPreset("today");
                                            setPage(1);
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-border bg-background hover:bg-muted text-foreground transition-colors shadow-xs cursor-pointer ml-auto"
                                    >
                                        <Target className="h-3.5 w-3.5 text-primary" />
                                        <span>Track Today&apos;s Daily Target (54)</span>
                                    </button>
                                </div>

                                {/* Top 3 Achieved Overview Cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="p-3.5 bg-muted/20 border border-border/80 rounded-lg space-y-1">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                                            <span className="flex items-center gap-1.5">
                                                <ClipboardList className="h-3.5 w-3.5 text-primary" />
                                                Total Tests Conducted
                                            </span>
                                        </div>
                                        <div className="text-2xl font-bold text-foreground">
                                            {targetTotalRow.achievedTotal}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Cumulative tests conducted</p>
                                    </div>

                                    <div className="p-3.5 bg-muted/20 border border-border/80 rounded-lg space-y-1">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                                            <span className="flex items-center gap-1.5">
                                                <Laptop className="h-3.5 w-3.5 text-blue-500" />
                                                Web App Tests
                                            </span>
                                        </div>
                                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                            {targetTotalRow.achievedWebApp}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Tests conducted on Web App</p>
                                    </div>

                                    <div className="p-3.5 bg-muted/20 border border-border/80 rounded-lg space-y-1">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                                            <span className="flex items-center gap-1.5">
                                                <Smartphone className="h-3.5 w-3.5 text-emerald-500" />
                                                WhatsApp Tests
                                            </span>
                                        </div>
                                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                            {targetTotalRow.achievedWhatsApp}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Tests conducted on WhatsApp</p>
                                    </div>
                                </div>

                                {/* Achieved Counts Table */}
                                <div className="overflow-x-auto rounded-lg border border-border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/60 border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                                                <th className="px-4 py-3 text-left font-semibold">Question Type</th>
                                                <th className="px-4 py-3 text-left font-semibold">Total Achieved</th>
                                                <th className="px-4 py-3 text-left font-semibold">Web App</th>
                                                <th className="px-4 py-3 text-left font-semibold">WhatsApp</th>
                                                <th className="px-4 py-3 text-right font-semibold">Share of Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {targetRows.map(row => {
                                                const sharePct = targetTotalRow.achievedTotal > 0
                                                    ? Math.round((row.achievedTotal / targetTotalRow.achievedTotal) * 1000) / 10
                                                    : 0;
                                                return (
                                                    <tr
                                                        key={row.questionType}
                                                        className="border-b border-border hover:bg-muted/30 transition-colors"
                                                    >
                                                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                                                            {row.questionType}
                                                        </td>
                                                        <td className="px-4 py-3 font-bold text-foreground">
                                                            {row.achievedTotal}
                                                        </td>
                                                        <td className="px-4 py-3 font-medium text-blue-600 dark:text-blue-400">
                                                            {row.achievedWebApp}
                                                        </td>
                                                        <td className="px-4 py-3 font-medium text-emerald-600 dark:text-emerald-400">
                                                            {row.achievedWhatsApp}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">
                                                            {sharePct}%
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {/* Total Row */}
                                            <tr className="bg-muted/40 font-semibold border-t-2 border-border text-foreground">
                                                <td className="px-4 py-3 whitespace-nowrap font-bold">
                                                    Total
                                                </td>
                                                <td className="px-4 py-3 font-extrabold text-foreground text-base">
                                                    {targetTotalRow.achievedTotal}
                                                </td>
                                                <td className="px-4 py-3 font-bold text-blue-600 dark:text-blue-400 text-base">
                                                    {targetTotalRow.achievedWebApp}
                                                </td>
                                                <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400 text-base">
                                                    {targetTotalRow.achievedWhatsApp}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-xs text-muted-foreground">
                                                    100%
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                                                <Target className="h-4 w-4" />
                                            </div>
                                            <h3 className="text-base font-semibold text-foreground">
                                                Target vs. Achieved Comparison Analytics
                                            </h3>
                                            {preset === "today" && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/15 text-primary">
                                                    Today&apos;s Target Tracker
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {preset === "today"
                                                ? "Daily testing targets for today (54 total: 27 Web App, 27 WhatsApp) compared against actual test execution today."
                                                : `Daily testing targets per tester (54 total: 27 Web App, 27 WhatsApp) compared against actual test execution${
                                                      daysCount > 1
                                                          ? targetViewMode === "period"
                                                              ? ` across ${daysCount} days (scaled to ${54 * daysCount} tests total)`
                                                              : ` (daily average across ${daysCount} days)`
                                                          : " (per tester, per day)"
                                                  }.`}
                                        </p>
                                    </div>

                                    {daysCount > 1 && (
                                        <div className="flex rounded-md border border-border p-0.5 bg-muted/40 text-xs">
                                            <button
                                                type="button"
                                                onClick={() => setTargetViewMode("period")}
                                                className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-medium ${
                                                    targetViewMode === "period"
                                                        ? "bg-background text-foreground shadow-xs font-semibold"
                                                        : "text-muted-foreground hover:text-foreground"
                                                }`}
                                            >
                                                Period Total ({daysCount}d)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTargetViewMode("daily")}
                                                className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-medium ${
                                                    targetViewMode === "daily"
                                                        ? "bg-background text-foreground shadow-xs font-semibold"
                                                        : "text-muted-foreground hover:text-foreground"
                                                }`}
                                            >
                                                Daily Average
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Today banner: No tests yet today */}
                                {preset === "today" && totalTests === 0 && (
                                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-lg text-xs text-blue-900 dark:bg-blue-950/30 dark:border-blue-900/50 dark:text-blue-200">
                                        <div className="flex items-center gap-2">
                                            <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                            <span>
                                                You haven&apos;t conducted or logged any test cases today yet. Your daily target is <strong>54 tests</strong> (27 Web App, 27 WhatsApp).
                                            </span>
                                        </div>
                                        {onLogNewTest && (
                                            <button
                                                type="button"
                                                onClick={onLogNewTest}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-xs cursor-pointer ml-auto"
                                            >
                                                <PlusCircle className="h-3.5 w-3.5" />
                                                <span>+ Log Today&apos;s First Test Case</span>
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Today banner: Tests logged today */}
                                {preset === "today" && totalTests > 0 && (
                                    <div className="flex items-center justify-between gap-2 p-2.5 bg-primary/5 border border-primary/20 rounded-lg text-xs text-foreground">
                                        <span className="flex items-center gap-1.5">
                                            <Target className="h-3.5 w-3.5 text-primary" />
                                            {targetTotalRow.achievedTotal >= targetTotalRow.targetTotal ? (
                                                <strong className="text-emerald-600 dark:text-emerald-400">
                                                    🎉 Daily target achieved! Fantastic job!
                                                </strong>
                                            ) : (
                                                <span>
                                                    Today&apos;s Progress:{" "}
                                                    <strong>
                                                        {targetTotalRow.achievedTotal} of {targetTotalRow.targetTotal} test cases completed
                                                    </strong>{" "}
                                                    ({Math.max(0, targetTotalRow.targetTotal - targetTotalRow.achievedTotal)} remaining).
                                                </span>
                                            )}
                                        </span>
                                        {onLogNewTest && targetTotalRow.achievedTotal < targetTotalRow.targetTotal && (
                                            <button
                                                type="button"
                                                onClick={onLogNewTest}
                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                                            >
                                                <PlusCircle className="h-3 w-3" />
                                                Log Next Test
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Top 3 Target Progress Overview Cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted/20 border border-border/80 rounded-lg">
                                    <div className="space-y-1 p-2">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                                            <span className="flex items-center gap-1.5">
                                                <Target className="h-3.5 w-3.5 text-primary" />
                                                Total Target Progress
                                            </span>
                                        </div>
                                        <FractionDisplay
                                            achieved={targetTotalRow.achievedTotal}
                                            target={targetTotalRow.targetTotal}
                                            size="lg"
                                        />
                                    </div>

                                    <div className="space-y-1 p-2 sm:border-l border-border/60">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                                            <span className="flex items-center gap-1.5">
                                                <Laptop className="h-3.5 w-3.5 text-blue-500" />
                                                Web App Target Progress
                                            </span>
                                        </div>
                                        <FractionDisplay
                                            achieved={targetTotalRow.achievedWebApp}
                                            target={targetTotalRow.targetWebApp}
                                            size="lg"
                                        />
                                    </div>

                                    <div className="space-y-1 p-2 sm:border-l border-border/60">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                                            <span className="flex items-center gap-1.5">
                                                <Smartphone className="h-3.5 w-3.5 text-emerald-500" />
                                                WhatsApp Target Progress
                                            </span>
                                        </div>
                                        <FractionDisplay
                                            achieved={targetTotalRow.achievedWhatsApp}
                                            target={targetTotalRow.targetWhatsApp}
                                            size="lg"
                                        />
                                    </div>
                                </div>

                                {/* Target vs. Achieved Breakdown Table */}
                                <div className="overflow-x-auto rounded-lg border border-border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/60 border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                                                <th className="px-4 py-3 text-left font-semibold">Question Type</th>
                                                <th className="px-4 py-3 text-left font-semibold">
                                                    Target (Total) <span className="text-[10px] normal-case text-muted-foreground font-normal">(Achieved / Target)</span>
                                                </th>
                                                <th className="px-4 py-3 text-left font-semibold">
                                                    Web App <span className="text-[10px] normal-case text-muted-foreground font-normal">(Achieved / Target)</span>
                                                </th>
                                                <th className="px-4 py-3 text-left font-semibold">
                                                    WhatsApp <span className="text-[10px] normal-case text-muted-foreground font-normal">(Achieved / Target)</span>
                                                </th>
                                                <th className="px-4 py-3 text-right font-semibold">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {targetRows.map(row => {
                                                const isDone = row.achievedTotal >= row.targetTotal && row.targetTotal > 0;
                                                const isPartial = row.completionRate >= 50;
                                                const isPending = row.achievedTotal === 0;
                                                return (
                                                    <tr
                                                        key={row.questionType}
                                                        className="border-b border-border hover:bg-muted/30 transition-colors"
                                                    >
                                                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                                                            {row.questionType}
                                                        </td>
                                                        <td className="px-4 py-3 min-w-[170px]">
                                                            <FractionDisplay
                                                                achieved={row.achievedTotal}
                                                                target={row.targetTotal}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 min-w-[150px]">
                                                            <FractionDisplay
                                                                achieved={row.achievedWebApp}
                                                                target={row.targetWebApp}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 min-w-[150px]">
                                                            <FractionDisplay
                                                                achieved={row.achievedWhatsApp}
                                                                target={row.targetWhatsApp}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                                            <span
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                                    isDone
                                                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                                                        : isPartial
                                                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                                                        : isPending
                                                                        ? "bg-muted text-muted-foreground"
                                                                        : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                                                                }`}
                                                            >
                                                                {isDone
                                                                    ? "Target Met"
                                                                    : isPartial
                                                                    ? "In Progress"
                                                                    : isPending
                                                                    ? "Pending"
                                                                    : "Needs Attention"}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {/* Total Row */}
                                            <tr className="bg-muted/40 font-semibold border-t-2 border-border text-foreground">
                                                <td className="px-4 py-3 whitespace-nowrap font-bold">
                                                    {targetTotalRow.questionType}
                                                </td>
                                                <td className="px-4 py-3 min-w-[170px]">
                                                    <FractionDisplay
                                                        achieved={targetTotalRow.achievedTotal}
                                                        target={targetTotalRow.targetTotal}
                                                        size="md"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 min-w-[150px]">
                                                    <FractionDisplay
                                                        achieved={targetTotalRow.achievedWebApp}
                                                        target={targetTotalRow.targetWebApp}
                                                        size="md"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 min-w-[150px]">
                                                    <FractionDisplay
                                                        achieved={targetTotalRow.achievedWhatsApp}
                                                        target={targetTotalRow.targetWhatsApp}
                                                        size="md"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                            targetTotalRow.achievedTotal >= targetTotalRow.targetTotal && targetTotalRow.targetTotal > 0
                                                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                                                : targetTotalRow.completionRate >= 50
                                                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                                                : targetTotalRow.achievedTotal === 0
                                                                ? "bg-muted text-muted-foreground"
                                                                : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                                                        }`}
                                                    >
                                                        {targetTotalRow.achievedTotal >= targetTotalRow.targetTotal && targetTotalRow.targetTotal > 0
                                                            ? "100% Achieved"
                                                            : `${targetTotalRow.completionRate}% Achieved`}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>

                    {/* KPI Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                        {/* Total Tests */}
                        <div className="p-4 bg-card border border-border rounded-xl shadow-xs space-y-2">
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span className="text-xs font-medium uppercase tracking-wider">Total Tests</span>
                                <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                    <ClipboardList className="h-4 w-4" />
                                </div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-foreground">
                                    {summaryData?.totalTests ?? historyData?.total ?? 0}
                                </div>
                                <p className="text-xs text-muted-foreground">Tests conducted by you</p>
                            </div>
                        </div>

                        {/* Pass Rate */}
                        <div className="p-4 bg-card border border-border rounded-xl shadow-xs space-y-2">
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span className="text-xs font-medium uppercase tracking-wider">Pass Rate</span>
                                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    <CheckCircle2 className="h-4 w-4" />
                                </div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                    {summaryData?.passRate ?? 0}%
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {(summaryData?.passed ?? 0) + (summaryData?.expectedOutput ?? 0)} passed
                                </p>
                            </div>
                        </div>

                        {/* Fail Rate */}
                        <div className="p-4 bg-card border border-border rounded-xl shadow-xs space-y-2">
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span className="text-xs font-medium uppercase tracking-wider">Fail Rate</span>
                                <div className="p-2 rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                                    <XCircle className="h-4 w-4" />
                                </div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                    {summaryData?.failRate ?? 0}%
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {(summaryData?.failed ?? 0) + (summaryData?.anomalyFound ?? 0)} failed
                                </p>
                            </div>
                        </div>

                        {/* SLA Compliance */}
                        <div className="p-4 bg-card border border-border rounded-xl shadow-xs space-y-2">
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span className="text-xs font-medium uppercase tracking-wider">SLA Adherence</span>
                                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                                    <Clock className="h-4 w-4" />
                                </div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-foreground">
                                    {summaryData?.slaMetRate ?? 0}%
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {summaryData?.slaMet ?? 0} met / {summaryData?.slaBreached ?? 0} breached
                                </p>
                            </div>
                        </div>

                        {/* Avg Response Time */}
                        <div className="p-4 bg-card border border-border rounded-xl shadow-xs space-y-2">
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span className="text-xs font-medium uppercase tracking-wider">Avg Response</span>
                                <div className="p-2 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                                    <Activity className="h-4 w-4" />
                                </div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-foreground">
                                    {summaryData?.avgResponseMinutes != null ? `${summaryData.avgResponseMinutes}m` : "—"}
                                </div>
                                <p className="text-xs text-muted-foreground">Mean question turnaround</p>
                            </div>
                        </div>

                        {/* Defects Logged */}
                        <div className="p-4 bg-card border border-border rounded-xl shadow-xs space-y-2">
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span className="text-xs font-medium uppercase tracking-wider">Defects Logged</span>
                                <div className="p-2 rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                                    <AlertTriangle className="h-4 w-4" />
                                </div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-foreground">
                                    {summaryData?.totalDefects ?? 0}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {summaryData?.defectsBySeverity.critical ?? 0} crit / {summaryData?.defectsBySeverity.high ?? 0} high
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Breakdown Sections */}
                    {totalTests > 0 && summaryData ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Status Breakdown */}
                            <div className="p-4 bg-card border border-border rounded-xl shadow-xs space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <Layers className="h-4 w-4 text-primary" />
                                    <span>Status Distribution</span>
                                </div>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Pass / Expected Output</span>
                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                            {(summaryData.passed || 0) + (summaryData.expectedOutput || 0)} ({summaryData.passRate}%)
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 rounded-full"
                                            style={{ width: `${Math.min(100, summaryData.passRate)}%` }}
                                        />
                                    </div>

                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-muted-foreground">Fail / Anomaly</span>
                                        <span className="font-semibold text-red-600 dark:text-red-400">
                                            {(summaryData.failed || 0) + (summaryData.anomalyFound || 0)} ({summaryData.failRate}%)
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-red-500 rounded-full"
                                            style={{ width: `${Math.min(100, summaryData.failRate)}%` }}
                                        />
                                    </div>

                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-muted-foreground">Partial</span>
                                        <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                                            {summaryData.partial || 0}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-yellow-500 rounded-full"
                                            style={{
                                                width: `${Math.min(100, summaryData.totalTests > 0 ? ((summaryData.partial || 0) / summaryData.totalTests) * 100 : 0)}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Question Types & Channels */}
                            <div className="p-4 bg-card border border-border rounded-xl shadow-xs space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <HelpCircle className="h-4 w-4 text-primary" />
                                    <span>Question Types & Channels</span>
                                </div>
                                <div className="space-y-2 text-xs">
                                    <div className="font-medium text-muted-foreground">Top Question Types:</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {Object.entries(summaryData.byQuestionType || {}).length === 0 ? (
                                            <span className="text-muted-foreground">—</span>
                                        ) : (
                                            Object.entries(summaryData.byQuestionType).map(([type, count]) => (
                                                <span
                                                    key={type}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-foreground border border-border"
                                                >
                                                    <span>{type}</span>
                                                    <span className="font-semibold text-primary">({count})</span>
                                                </span>
                                            ))
                                        )}
                                    </div>

                                    <div className="font-medium text-muted-foreground pt-1">Channels Tested:</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {Object.entries(summaryData.byChannel || {}).length === 0 ? (
                                            <span className="text-muted-foreground">—</span>
                                        ) : (
                                            Object.entries(summaryData.byChannel).map(([channel, count]) => (
                                                <span
                                                    key={channel}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-foreground border border-border"
                                                >
                                                    <Radio className="h-3 w-3 text-muted-foreground" />
                                                    <span>{channel}</span>
                                                    <span className="font-semibold text-primary">({count})</span>
                                                </span>
                                            ))
                                        )}
                                    </div>

                                    <div className="font-medium text-muted-foreground pt-1">Languages Tested:</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {Object.entries(summaryData.byLanguage || {}).length === 0 ? (
                                            <span className="text-muted-foreground">—</span>
                                        ) : (
                                            Object.entries(summaryData.byLanguage).map(([lang, count]) => (
                                                <span
                                                    key={lang}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-foreground border border-border"
                                                >
                                                    <Languages className="h-3 w-3 text-muted-foreground" />
                                                    <span>{lang}</span>
                                                    <span className="font-semibold text-primary">({count})</span>
                                                </span>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Quality & Defect Severity */}
                            <div className="p-4 bg-card border border-border rounded-xl shadow-xs space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <ShieldCheck className="h-4 w-4 text-primary" />
                                    <span>Quality & Defect Severity</span>
                                </div>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                            <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                                            Scientific Accuracy:
                                        </span>
                                        <span className="font-semibold text-foreground">
                                            {summaryData.scientificAccuracy.rate}% ({summaryData.scientificAccuracy.correct} / {summaryData.scientificAccuracy.correct + summaryData.scientificAccuracy.incorrect})
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                            <Database className="h-3.5 w-3.5 text-emerald-500" />
                                            Saved in Database:
                                        </span>
                                        <span className="font-semibold text-foreground">
                                            {summaryData.dbPersistence.rate}% ({summaryData.dbPersistence.saved})
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center">
                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                            <Mic className="h-3.5 w-3.5 text-amber-500" />
                                            Voice Tests Working:
                                        </span>
                                        <span className="font-semibold text-foreground">
                                            {summaryData.voiceStats.inputWorking} in / {summaryData.voiceStats.outputWorking} out
                                        </span>
                                    </div>

                                    <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Defect Severities:</span>
                                        <div className="flex gap-1.5 font-medium">
                                            <span className="text-red-600 dark:text-red-400">
                                                {summaryData.defectsBySeverity.critical} Crit
                                            </span>
                                            <span>•</span>
                                            <span className="text-orange-600 dark:text-orange-400">
                                                {summaryData.defectsBySeverity.high} High
                                            </span>
                                            <span>•</span>
                                            <span className="text-yellow-600 dark:text-yellow-400">
                                                {summaryData.defectsBySeverity.medium} Med
                                            </span>
                                            <span>•</span>
                                            <span className="text-blue-600 dark:text-blue-400">
                                                {summaryData.defectsBySeverity.low} Low
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-6 bg-card border border-dashed border-border rounded-xl text-center text-xs text-muted-foreground space-y-1">
                            <p className="font-medium text-foreground">
                                No test cases logged for {preset === "today" ? "today" : "this date filter"}.
                            </p>
                            <p>
                                Status distributions, channel statistics, and quality metrics will appear here once test logs are submitted.
                            </p>
                        </div>
                    )}

                    {/* Individual Histories Section */}
                    <div className="space-y-3 pt-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-foreground">
                                    Individual Test Histories
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    Detailed logs of individual tests conducted by you in the selected period. Click any row to expand.
                                </p>
                            </div>

                            {/* Search & Status Filters */}
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative">
                                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search thread, query, defect..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="h-8 pl-8 pr-3 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48 sm:w-60"
                                    />
                                </div>

                                <div className="flex rounded-md border border-border p-0.5 bg-muted/40">
                                    {[
                                        { key: "all" as const, label: "All" },
                                        { key: "pass" as const, label: "Pass" },
                                        { key: "fail" as const, label: "Fail" },
                                        { key: "partial" as const, label: "Partial" },
                                        { key: "defects" as const, label: "Defects" },
                                    ].map(tab => (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => setStatusFilter(tab.key)}
                                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                                                statusFilter === tab.key
                                                    ? "bg-background text-foreground shadow-xs font-semibold"
                                                    : "text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Table or Empty State */}
                        {totalTests === 0 ? (
                            <div className="text-center py-12 space-y-3 bg-muted/20 rounded-lg border border-dashed border-border">
                                <Calendar className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                                <div className="text-sm font-medium text-foreground">
                                    {preset === "today"
                                        ? "No test cases logged for today yet."
                                        : hasActiveFilter
                                        ? "No test cases found for the selected date filter."
                                        : "You have not conducted or logged any test cases yet."}
                                </div>
                                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                    {preset === "today"
                                        ? "Begin testing today's queries across Web App and WhatsApp, then log them to track your progress and history."
                                        : hasActiveFilter
                                        ? "Try adjusting your date range or clear the filter to see all test cases conducted by you."
                                        : "Once you submit test cases through the log form, each individual run will appear here with full audit details."}
                                </p>
                                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                                    {preset === "today" && onLogNewTest && (
                                        <button
                                            type="button"
                                            onClick={onLogNewTest}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
                                        >
                                            <PlusCircle className="h-3.5 w-3.5" />
                                            <span>+ Log Test Case</span>
                                        </button>
                                    )}
                                    {hasActiveFilter && preset !== "today" && (
                                        <button
                                            type="button"
                                            onClick={clearFilter}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" />
                                            Show All Submissions
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : filteredEntries.length === 0 ? (
                            <div className="text-center py-10 bg-muted/20 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                                {searchQuery || statusFilter !== "all"
                                    ? "No individual tests match your search query or status filter."
                                    : "No individual tests found for this page."}
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border border-border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-muted/60 border-b border-border">
                                            {[
                                                "Test Date",
                                                "Thread ID",
                                                "Query Text",
                                                "Category / Type",
                                                "Channel / Lang",
                                                "SLA",
                                                "Status",
                                                "Defect",
                                                "Submitted At",
                                                "",
                                            ].map(h => (
                                                <th
                                                    key={h}
                                                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap"
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredEntries.map(entry => (
                                            <EntryRow key={entry._id} entry={entry} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {historyData && historyData.totalPages > 1 && (
                            <div className="flex items-center justify-between pt-2">
                                <p className="text-xs text-muted-foreground">
                                    Showing {filteredEntries.length} of {historyData.total} entries
                                    {hasActiveFilter ? " (filtered)" : ""}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-3 py-1.5 rounded-md border border-border text-xs disabled:opacity-40 hover:bg-accent transition-colors cursor-pointer"
                                    >
                                        ← Previous
                                    </button>
                                    <span className="text-xs text-muted-foreground">
                                        Page {page} of {historyData.totalPages}
                                    </span>
                                    <button
                                        onClick={() => setPage(p => Math.min(historyData.totalPages, p + 1))}
                                        disabled={page === historyData.totalPages}
                                        className="px-3 py-1.5 rounded-md border border-border text-xs disabled:opacity-40 hover:bg-accent transition-colors cursor-pointer"
                                    >
                                        Next →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
