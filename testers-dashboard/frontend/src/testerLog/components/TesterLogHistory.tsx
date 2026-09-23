import { useState, useMemo } from "react";
import { useTesterLogHistory } from "../hooks/useTesterLogHistory";
import type { ITesterLogEntry } from "../types";
import { isCrossPlatform } from "../types";
import { Calendar, ChevronDown, ChevronUp, Loader2, RotateCcw } from "lucide-react";

function Badge({ value }: { value?: string }) {
    if (!value) return <span className="text-muted-foreground text-xs">—</span>;
    const colorMap: Record<string, string> = {
        Pass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        Fail: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        Partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
        "Anomaly Found in Output": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        "Expected Output": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        Pending: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
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
    const isCross = isCrossPlatform(entry.channelTested);

    const submittedAt = entry.createdAt
        ? new Date(entry.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
        : "—";

    return (
        <>
            <tr
                className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setExpanded(e => !e)}
            >
                <td className="px-4 py-3 text-sm">
                    <div>{entry.testDate || "—"}</div>
                    {isCross && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
                            Cross-Platform
                        </span>
                    )}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                    <div>{entry.threadId || entry.webThreadId || "—"}</div>
                    {entry.waThreadId && (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-sans">WA: {entry.waThreadId}</div>
                    )}
                </td>
                <td className="px-4 py-3 text-sm max-w-[200px] truncate" title={entry.queryText}>{entry.queryText || "—"}</td>
                <td className="px-4 py-3"><Badge value={entry.overallTestStatus} /></td>
                <td className="px-4 py-3"><Badge value={entry.status} /></td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{submittedAt}</td>
                <td className="px-4 py-3 text-right">
                    {expanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground inline" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground inline" />}
                </td>
            </tr>
            {expanded && (
                <tr className="border-b border-border bg-muted/20">
                    <td colSpan={7} className="px-6 py-4">
                        {isCross && (
                            <div className="mb-4 p-3.5 rounded-lg border border-purple-500/30 bg-purple-500/5 space-y-2">
                                <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                                    Cross-Platform Comparison (Web App vs. WhatsApp)
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                                    <DetailRow label="Web App Thread ID" value={entry.threadId || entry.webThreadId} />
                                    <DetailRow label="WhatsApp Thread ID" value={entry.waThreadId} />
                                    <DetailRow label="Web Response Time" value={entry.responseTimeMins} />
                                    <DetailRow label="WhatsApp Response Time" value={entry.waResponseTimeMins} />
                                    <DetailRow label="Web SLA Status" value={entry.slaStatus} />
                                    <DetailRow label="WhatsApp SLA Status" value={entry.waSlaStatus} />
                                    <DetailRow label="Web App Test Status" value={entry.webOverallTestStatus} />
                                    <DetailRow label="WhatsApp Test Status" value={entry.waOverallTestStatus} />
                                    <DetailRow label="WhatsApp vs Web Answer Match?" value={entry.whatsappVsWebAnswerMatch} />
                                    <DetailRow label="Discrepancy Notes" value={entry.crossPlatformDiscrepancyNotes} />
                                </div>
                            </div>
                        )}
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
                            <DetailRow label="Reviewer2 Name" value={entry.reviewer2Name} />
                            <DetailRow label="Review2 TAT" value={entry.review2TatMins} />
                            <DetailRow label="Reviewer3 Name" value={entry.reviewer3Name} />
                            <DetailRow label="Review3 TAT" value={entry.review3TatMins} />
                            <DetailRow label="Reviewer4 Name" value={entry.reviewer4Name} />
                            <DetailRow label="Review4 TAT" value={entry.review4TatMins} />
                            <DetailRow label="Reviewer5 Name" value={entry.reviewer5Name} />
                            <DetailRow label="Review5 TAT" value={entry.review5TatMins} />
                            <DetailRow label="Moderator Name" value={entry.moderatorName} />
                            <DetailRow label="Moderator TAT" value={entry.moderatorTatMins} />
                            <DetailRow label="Follow-up Q in Review Model?" value={entry.followUpQInReviewModel} />
                            <DetailRow label="Answer Scientifically Correct?" value={entry.answerScientificallyCorrect} />
                            <DetailRow label="Expert Name Displayed?" value={entry.expertNameDisplayed} />
                            <DetailRow label="Correct Expert Name Displayed?" value={entry.correctExpertNameDisplayed} />
                            <DetailRow label="Correct Source Links Provided?" value={entry.correctSourceLinksProvided} />
                            <DetailRow label="120-min Msg Shown?" value={entry.msg120MinShownToUser} />
                            <DetailRow label="Notification Received?" value={entry.notificationReceived} />
                            <DetailRow label="Notification on Same Thread?" value={entry.notificationOnSameThread} />
                            <DetailRow label="Notification Linked Correct Q-ID?" value={entry.notificationLinkedCorrectQId} />
                            <DetailRow label="Voice Input Working?" value={entry.voiceInputWorking} />
                            <DetailRow label="Voice Output Working?" value={entry.voiceOutputWorking} />
                            <DetailRow label="Voice Input Quality" value={entry.voiceInputQuality} />
                            <DetailRow label="Voice Output Quality" value={entry.voiceOutputQuality} />
                            <DetailRow label="Voice Issue Description" value={entry.voiceIssueDescription} />
                            <DetailRow label="Weather Q Answered Correctly?" value={entry.weatherQAnsweredCorrectly} />
                            <DetailRow label="Mandi Price Q Correct?" value={entry.mandiPriceQCorrect} />
                            <DetailRow label="Scheme Q Correct?" value={entry.schemeQCorrect} />
                            <DetailRow label="Question Saved in DB?" value={entry.questionSavedInDb} />
                            <DetailRow label="Answer Saved in DB?" value={entry.answerSavedInDb} />
                            <DetailRow label="Q-ID Consistent Across Systems?" value={entry.qIdConsistentAcrossSystems} />
                            <DetailRow label="WhatsApp vs Web Answer Match?" value={entry.whatsappVsWebAnswerMatch} />
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

type DatePreset = "all" | "today" | "7days" | "30days" | "custom";

export function TesterLogHistory() {
    const [page, setPage] = useState(1);
    const [preset, setPreset] = useState<DatePreset>("all");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [dateField, setDateField] = useState<"testDate" | "createdAt">("testDate");

    const LIMIT = 20;

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

    const { data, isLoading, isError } = useTesterLogHistory(
        page,
        LIMIT,
        startDate,
        endDate,
        dateField,
    );

    const clearFilter = () => {
        setPreset("all");
        setCustomStart("");
        setCustomEnd("");
        setDateField("testDate");
        setPage(1);
    };

    return (
        <div className="space-y-4">
            {/* Filter Toolbar */}
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
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted transition-colors ml-auto"
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
                    <span>Loading your submissions...</span>
                </div>
            ) : isError || !data ? (
                <div className="text-center py-16 text-destructive text-sm bg-destructive/5 rounded-lg border border-destructive/20">
                    Failed to load history. Please try again.
                </div>
            ) : data.entries.length === 0 ? (
                hasActiveFilter ? (
                    <div className="text-center py-14 space-y-3 bg-muted/20 rounded-lg border border-dashed border-border">
                        <Calendar className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                        <div className="text-sm font-medium text-foreground">
                            No submissions found for the selected date filter.
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Try adjusting your date range or clear the filter to see all test cases.
                        </p>
                        <button
                            type="button"
                            onClick={clearFilter}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Show All Submissions
                        </button>
                    </div>
                ) : (
                    <div className="text-center py-16 text-muted-foreground text-sm">
                        You have not submitted any test cases yet.
                    </div>
                )
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        Showing {data.entries.length} of {data.total} entries
                        {hasActiveFilter ? " (filtered)" : ""}. Click a row to expand details.
                    </p>

                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/60 border-b border-border">
                                    {["Test Date", "Thread ID", "Query Text", "Overall Status", "Status", "Submitted At", ""].map(h => (
                                        <th key={h} className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.entries.map(entry => (
                                    <EntryRow key={entry._id} entry={entry} />
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {data.totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-40 hover:bg-accent transition-colors cursor-pointer"
                            >
                                ← Previous
                            </button>
                            <span className="text-sm text-muted-foreground">
                                Page {page} of {data.totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                                disabled={page === data.totalPages}
                                className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-40 hover:bg-accent transition-colors cursor-pointer"
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

