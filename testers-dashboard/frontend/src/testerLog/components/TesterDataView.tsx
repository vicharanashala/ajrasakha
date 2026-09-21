import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/atoms/select";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/atoms/card";
import { useTesterOptions, useTesterLogSummary, useAllTesterLogEntries } from "../hooks/useTesterLogHistory";
import { testerLogService } from "../services/testerLogService";
import { TesterEntryDetailDialog } from "./TesterEntryDetailDialog";
import type { ITesterLogAdminFilters, ITesterLogEntry } from "../types";
import {
    TYPE_OF_QUESTION_OPTIONS,
    CHANNEL_OPTIONS,
    OVERALL_STATUS_OPTIONS,
    DEFECT_SEVERITY_OPTIONS,
} from "../types";

const PAGE_SIZE = 20;

type DatePreset = "today" | "7days" | "30days" | "all" | "custom";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7days", label: "Last 7 Days" },
    { key: "30days", label: "Last 30 Days" },
    { key: "all", label: "All Time" },
    { key: "custom", label: "Custom" },
];

function statusBadgeClass(value?: string): string {
    switch ((value || "").trim().toLowerCase()) {
        case "pass":
            return "bg-emerald-100 text-emerald-700";
        case "fail":
            return "bg-red-100 text-red-700";
        case "partial":
            return "bg-yellow-100 text-yellow-700";
        default:
            return "bg-muted text-muted-foreground";
    }
}

function severityBadgeClass(value?: string): string {
    switch ((value || "").trim().toLowerCase()) {
        case "critical":
            return "bg-red-100 text-red-700";
        case "high":
            return "bg-orange-100 text-orange-700";
        case "medium":
            return "bg-yellow-100 text-yellow-700";
        case "low":
            return "bg-blue-100 text-blue-700";
        default:
            return "bg-muted text-muted-foreground";
    }
}

// The 10 columns reviewers actually need at a glance - real fields on
// TesterLogEntry (see ITesterLogService.ts), not a mirror of the Google
// Sheet's much wider column set.
const TABLE_COLUMNS: { key: keyof ITesterLogEntry; label: string }[] = [
    { key: "_id", label: "Test ID" },
    { key: "testDate", label: "Test Date" },
    { key: "testerName", label: "Tester Name" },
    { key: "typeOfQuestion", label: "Type of Question" },
    { key: "questionCategory", label: "Question Category" },
    { key: "channelTested", label: "Channel Tested" },
    { key: "languageTested", label: "Language Tested" },
    { key: "overallTestStatus", label: "Overall Test Status" },
    { key: "defectSeverity", label: "Defect Severity" },
    { key: "responseTimeMins", label: "Response Time" },
];

export function TesterDataView() {
    const [testerId, setTesterId] = useState<string>("all");
    const [datePreset, setDatePreset] = useState<DatePreset>("30days");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [typeOfQuestion, setTypeOfQuestion] = useState("all");
    const [channelTested, setChannelTested] = useState("all");
    const [overallTestStatus, setOverallTestStatus] = useState("all");
    const [defectSeverity, setDefectSeverity] = useState("all");
    const [page, setPage] = useState(1);
    const [downloading, setDownloading] = useState(false);

    const { data: testerOptions } = useTesterOptions();

    const { startDate, endDate } = useMemo(() => {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        if (datePreset === "today") return { startDate: todayStr, endDate: todayStr };
        if (datePreset === "7days") {
            return { startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), endDate: todayStr };
        }
        if (datePreset === "30days") {
            return { startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), endDate: todayStr };
        }
        if (datePreset === "custom") return { startDate: customStart || undefined, endDate: customEnd || undefined };
        return { startDate: undefined, endDate: undefined };
    }, [datePreset, customStart, customEnd]);

    const filters: ITesterLogAdminFilters = {
        testerId: testerId === "all" ? undefined : testerId,
        startDate,
        endDate,
        typeOfQuestion: typeOfQuestion === "all" ? undefined : typeOfQuestion,
        channelTested: channelTested === "all" ? undefined : channelTested,
        overallTestStatus: overallTestStatus === "all" ? undefined : overallTestStatus,
        defectSeverity: defectSeverity === "all" ? undefined : defectSeverity,
    };

    const { data: summary } = useTesterLogSummary(filters);
    const { data: entriesData, isLoading, isError } = useAllTesterLogEntries(page, PAGE_SIZE, filters);

    function resetToFirstPage<T>(setter: (v: T) => void) {
        return (v: T) => {
            setter(v);
            setPage(1);
        };
    }

    async function handleDownload() {
        setDownloading(true);
        try {
            // Ignores the on-screen filters by design - this always
            // downloads every row in the database, see downloadEntries.
            const blob = await testerLogService.downloadEntries();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "tester-entries.xlsx";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success("Downloaded Excel");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Download failed");
        } finally {
            setDownloading(false);
        }
    }

    const totalPages = entriesData?.totalPages ?? 1;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3 border rounded-lg p-4 w-full">
                <div className="flex-1 min-w-[180px] space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Tester</label>
                    <Select value={testerId} onValueChange={resetToFirstPage(setTesterId)}>
                        <SelectTrigger className="h-8 w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Testers</SelectItem>
                            {(testerOptions ?? []).map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex-1 min-w-[180px] space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Date Range</label>
                    <Select value={datePreset} onValueChange={resetToFirstPage((v: string) => setDatePreset(v as DatePreset))}>
                        <SelectTrigger className="h-8 w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DATE_PRESETS.map((p) => (
                                <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex-1 min-w-[150px] space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Type of Question</label>
                    <Select value={typeOfQuestion} onValueChange={resetToFirstPage(setTypeOfQuestion)}>
                        <SelectTrigger className="h-8 w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {TYPE_OF_QUESTION_OPTIONS.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex-1 min-w-[150px] space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Channel Tested</label>
                    <Select value={channelTested} onValueChange={resetToFirstPage(setChannelTested)}>
                        <SelectTrigger className="h-8 w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {CHANNEL_OPTIONS.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex-1 min-w-[150px] space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Overall Test Status</label>
                    <Select value={overallTestStatus} onValueChange={resetToFirstPage(setOverallTestStatus)}>
                        <SelectTrigger className="h-8 w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {OVERALL_STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex-1 min-w-[150px] space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Defect Severity</label>
                    <Select value={defectSeverity} onValueChange={resetToFirstPage(setDefectSeverity)}>
                        <SelectTrigger className="h-8 w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {DEFECT_SEVERITY_OPTIONS.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {datePreset === "custom" && (
                    <div className="basis-full flex gap-3">
                        <div className="space-y-1 flex-1 min-w-[150px] max-w-[240px]">
                            <label className="text-xs font-medium text-muted-foreground uppercase">Start</label>
                            <input
                                type="date"
                                className="h-8 w-full text-sm border rounded-md px-2"
                                value={customStart}
                                onChange={(e) => { setCustomStart(e.target.value); setPage(1); }}
                            />
                        </div>
                        <div className="space-y-1 flex-1 min-w-[150px] max-w-[240px]">
                            <label className="text-xs font-medium text-muted-foreground uppercase">End</label>
                            <input
                                type="date"
                                className="h-8 w-full text-sm border rounded-md px-2"
                                value={customEnd}
                                onChange={(e) => { setCustomEnd(e.target.value); setPage(1); }}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="border-muted-foreground/10">
                    <CardHeader className="pb-1">
                        <CardTitle className="text-xs text-muted-foreground uppercase">Total Entries</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="text-2xl font-bold">{(summary?.totalEntries ?? 0).toLocaleString()}</div>
                        <p className="text-[10px] text-muted-foreground">All time, this tester.</p>
                    </CardContent>
                </Card>
                <Card className="border-muted-foreground/10">
                    <CardHeader className="pb-1">
                        <CardTitle className="text-xs text-muted-foreground uppercase">Entries in Range</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="text-2xl font-bold">{(summary?.entriesInRange ?? 0).toLocaleString()}</div>
                        <p className="text-[10px] text-muted-foreground">Matches the filters above.</p>
                    </CardContent>
                </Card>
                <Card className="border-muted-foreground/10">
                    <CardHeader className="pb-1">
                        <CardTitle className="text-xs text-muted-foreground uppercase">Pass Rate</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="text-2xl font-bold">{summary?.passRate !== null && summary?.passRate !== undefined ? `${summary.passRate}%` : "No data"}</div>
                        <p className="text-[10px] text-muted-foreground">
                            Pass ÷ status recorded ({summary?.passCount ?? 0} of {summary?.statusRecordedCount ?? 0}).
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {entriesData ? `Showing ${entriesData.entries.length} of ${entriesData.total} entries.` : ""}
                </p>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => handleDownload()}
                        disabled={downloading}
                        title="Downloads every entry in the database, ignoring the filters above"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Download All Entries
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading entries...</span>
                </div>
            ) : isError || !entriesData ? (
                <div className="text-center py-16 text-destructive text-sm bg-destructive/5 rounded-lg border border-destructive/20">
                    Failed to load tester entries.
                </div>
            ) : entriesData.entries.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                    No entries match the current filters.
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/60 border-b border-border">
                                    {TABLE_COLUMNS.map((c) => (
                                        <th key={c.key} className="px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                            {c.label}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                                        Details
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {entriesData.entries.map((entry) => (
                                    <tr key={entry._id} className="border-b border-border hover:bg-muted/30">
                                        {TABLE_COLUMNS.map((c) => {
                                            const value = entry[c.key] as string | undefined;
                                            if (c.key === "overallTestStatus") {
                                                return (
                                                    <td key={c.key} className="px-3 py-2">
                                                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusBadgeClass(value)}`}>
                                                            {value || "—"}
                                                        </span>
                                                    </td>
                                                );
                                            }
                                            if (c.key === "defectSeverity") {
                                                return (
                                                    <td key={c.key} className="px-3 py-2">
                                                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${severityBadgeClass(value)}`}>
                                                            {value || "—"}
                                                        </span>
                                                    </td>
                                                );
                                            }
                                            return (
                                                <td key={c.key} className="px-3 py-2 text-sm whitespace-nowrap">
                                                    {value || "—"}
                                                </td>
                                            );
                                        })}
                                        <td className="px-3 py-2">
                                            <TesterEntryDetailDialog entry={entry} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-between text-xs pt-1">
                            <button
                                type="button"
                                disabled={page === 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                className="px-2 py-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
                            >
                                Previous
                            </button>
                            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
                            <button
                                type="button"
                                disabled={page === totalPages}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                className="px-2 py-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
