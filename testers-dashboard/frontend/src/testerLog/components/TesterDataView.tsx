import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
    BarChart3,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    CircleCheckBig,
    Download,
    FileText,
    Loader2,
    MessageCircleQuestion,
    MonitorSmartphone,
    PieChart,
    RotateCcw,
    TriangleAlert,
    User,
    type LucideIcon,
} from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/atoms/select";
import { Card, CardContent } from "@/components/atoms/card";
import { useTesterOptions, useTesterLogSummary, useAllTesterLogEntries } from "../hooks/useTesterLogHistory";
import { testerLogService } from "../services/testerLogService";
import { TesterEntryDetailDialog } from "./TesterEntryDetailDialog";
import { TesterEntryRowActions } from "./TesterEntryRowActions";
import { statusBadgeClass, severityBadgeClass } from "../utils/badgeClasses";
import { getPageItems } from "../../utils";
import type { ITesterLogAdminFilters, ITesterLogEntry } from "../types";
import {
    isCrossPlatform,
    TYPE_OF_QUESTION_OPTIONS,
    CHANNEL_OPTIONS,
    OVERALL_STATUS_OPTIONS,
    DEFECT_SEVERITY_OPTIONS,
} from "../types";

// Page size is sent to the entries API (which caps it at 100), so every
// option here is a real server-side page, not a client-side slice.
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 25;

type DatePreset = "today" | "7days" | "30days" | "all" | "custom";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7days", label: "Last 7 Days" },
    { key: "30days", label: "Last 30 Days" },
    { key: "all", label: "All Time" },
    { key: "custom", label: "Custom" },
];

// What Reset restores - also the initial state of every filter.
const DEFAULT_DATE_PRESET: DatePreset = "30days";
const ALL = "all";

// Columns reviewers need at a glance - real fields on TesterLogEntry
// (see ITesterLogService.ts), not a mirror of the Google Sheet's wider column set.
const TABLE_COLUMNS: { key: keyof ITesterLogEntry; label: string }[] = [
    { key: "testId", label: "Test ID" },
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

const TH_CLASS = "px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap";
const BADGE_CLASS = "text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded";
const EMPTY_VALUE = <span className="text-muted-foreground/50">—</span>;

function FilterField({ icon: Icon, label, className = "", children }: {
    icon: LucideIcon;
    label: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={`flex-1 min-w-[150px] space-y-1 ${className}`}>
            <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
            </label>
            {children}
        </div>
    );
}

function SummaryCard({ icon: Icon, iconClassName, label, value, description }: {
    icon: LucideIcon;
    iconClassName: string;
    label: string;
    value: ReactNode;
    description: ReactNode;
}) {
    return (
        <Card className="border-muted-foreground/10 py-4">
            <CardContent className="flex items-center gap-4 px-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <div className="text-xs font-medium text-muted-foreground uppercase">{label}</div>
                    <div className="text-2xl font-bold leading-tight tabular-nums">{value}</div>
                    <p className="text-[11px] text-muted-foreground">{description}</p>
                </div>
            </CardContent>
        </Card>
    );
}

function renderCell(entry: ITesterLogEntry, key: keyof ITesterLogEntry): ReactNode {
    const value = entry[key] as string | undefined;
    // A cross-platform entry has a response time per channel: the Web App's
    // in responseTimeMins, WhatsApp's in waResponseTimeMins. Both are shown
    // here rather than as extra columns; View has the full comparison.
    if (key === "responseTimeMins" && isCrossPlatform(entry.channelTested)) {
        return (
            <div className="flex flex-col gap-0.5 text-xs tabular-nums leading-tight">
                <span><span className="font-semibold text-blue-700 dark:text-blue-300">Web</span> {value || EMPTY_VALUE}</span>
                <span><span className="font-semibold text-emerald-700 dark:text-emerald-300">WA</span> {entry.waResponseTimeMins || EMPTY_VALUE}</span>
            </div>
        );
    }
    if (!value) return EMPTY_VALUE;
    if (key === "overallTestStatus") return <span className={`${BADGE_CLASS} ${statusBadgeClass(value)}`}>{value}</span>;
    if (key === "defectSeverity") return <span className={`${BADGE_CLASS} ${severityBadgeClass(value)}`}>{value}</span>;
    // Long values are cut with an ellipsis so they can't stretch the column;
    // hovering shows the full value, and View shows the whole record.
    if (key === "testId") {
        return <span className="block max-w-[110px] truncate font-mono text-xs" title={value}>{value}</span>;
    }
    return <span className="block max-w-[200px] truncate" title={value}>{value}</span>;
}

export function TesterDataView() {
    const [testerId, setTesterId] = useState<string>(ALL);
    const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_DATE_PRESET);
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [typeOfQuestion, setTypeOfQuestion] = useState(ALL);
    const [channelTested, setChannelTested] = useState(ALL);
    const [overallTestStatus, setOverallTestStatus] = useState(ALL);
    const [defectSeverity, setDefectSeverity] = useState(ALL);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
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
        testerId: testerId === ALL ? undefined : testerId,
        startDate,
        endDate,
        typeOfQuestion: typeOfQuestion === ALL ? undefined : typeOfQuestion,
        channelTested: channelTested === ALL ? undefined : channelTested,
        overallTestStatus: overallTestStatus === ALL ? undefined : overallTestStatus,
        defectSeverity: defectSeverity === ALL ? undefined : defectSeverity,
    };

    const { data: summary } = useTesterLogSummary(filters);
    const { data: entriesData, isLoading, isError } = useAllTesterLogEntries(page, pageSize, filters);

    // Deleting the last row of the last page leaves the current page past
    // the end - step back to the new last page instead of showing it empty.
    useEffect(() => {
        if (entriesData && page > Math.max(1, entriesData.totalPages)) {
            setPage(Math.max(1, entriesData.totalPages));
        }
    }, [entriesData, page]);

    function resetToFirstPage<T>(setter: (v: T) => void) {
        return (v: T) => {
            setter(v);
            setPage(1);
        };
    }

    const filtersAreDefault =
        testerId === ALL &&
        datePreset === DEFAULT_DATE_PRESET &&
        !customStart &&
        !customEnd &&
        typeOfQuestion === ALL &&
        channelTested === ALL &&
        overallTestStatus === ALL &&
        defectSeverity === ALL;

    function resetFilters() {
        setTesterId(ALL);
        setDatePreset(DEFAULT_DATE_PRESET);
        setCustomStart("");
        setCustomEnd("");
        setTypeOfQuestion(ALL);
        setChannelTested(ALL);
        setOverallTestStatus(ALL);
        setDefectSeverity(ALL);
        setPage(1);
    }

    async function handleDownload() {
        setDownloading(true);
        try {
            // Ignores the on-screen filters by design - always downloads every row in the database.
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

    const totalPages = Math.max(1, entriesData?.totalPages ?? 1);
    const rangeStart = entriesData && entriesData.entries.length > 0 ? (page - 1) * pageSize + 1 : 0;
    const rangeEnd = entriesData ? rangeStart + entriesData.entries.length - 1 : 0;
    const navButtonClass =
        "inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent";

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3 border rounded-lg p-3 w-full">
                <FilterField icon={User} label="Tester" className="min-w-[170px]">
                    <Select value={testerId} onValueChange={resetToFirstPage(setTesterId)}>
                        <SelectTrigger size="sm" className="w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All Testers</SelectItem>
                            {(testerOptions ?? []).map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FilterField>

                <FilterField icon={CalendarDays} label="Date Range">
                    <Select value={datePreset} onValueChange={resetToFirstPage((v: string) => setDatePreset(v as DatePreset))}>
                        <SelectTrigger size="sm" className="w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DATE_PRESETS.map((p) => (
                                <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FilterField>

                <FilterField icon={MessageCircleQuestion} label="Type of Question">
                    <Select value={typeOfQuestion} onValueChange={resetToFirstPage(setTypeOfQuestion)}>
                        <SelectTrigger size="sm" className="w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All</SelectItem>
                            {TYPE_OF_QUESTION_OPTIONS.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FilterField>

                <FilterField icon={MonitorSmartphone} label="Channel Tested">
                    <Select value={channelTested} onValueChange={resetToFirstPage(setChannelTested)}>
                        <SelectTrigger size="sm" className="w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All</SelectItem>
                            {CHANNEL_OPTIONS.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FilterField>

                <FilterField icon={CircleCheckBig} label="Overall Test Status">
                    <Select value={overallTestStatus} onValueChange={resetToFirstPage(setOverallTestStatus)}>
                        <SelectTrigger size="sm" className="w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All</SelectItem>
                            {OVERALL_STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FilterField>

                <FilterField icon={TriangleAlert} label="Defect Severity">
                    <Select value={defectSeverity} onValueChange={resetToFirstPage(setDefectSeverity)}>
                        <SelectTrigger size="sm" className="w-full text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All</SelectItem>
                            {DEFECT_SEVERITY_OPTIONS.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FilterField>

                <button
                    type="button"
                    onClick={resetFilters}
                    disabled={filtersAreDefault}
                    title="Restore every filter to its default (All, Last 30 Days)"
                    className="ml-auto flex h-8 shrink-0 items-center gap-1.5 px-3 text-xs font-medium rounded-md border hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                </button>

                {datePreset === "custom" && (
                    <div className="basis-full flex flex-wrap gap-3">
                        <FilterField icon={CalendarDays} label="Start" className="max-w-[240px]">
                            <input
                                type="date"
                                className="h-8 w-full text-sm border rounded-md px-2 bg-transparent"
                                value={customStart}
                                onChange={(e) => { setCustomStart(e.target.value); setPage(1); }}
                            />
                        </FilterField>
                        <FilterField icon={CalendarDays} label="End" className="max-w-[240px]">
                            <input
                                type="date"
                                className="h-8 w-full text-sm border rounded-md px-2 bg-transparent"
                                value={customEnd}
                                onChange={(e) => { setCustomEnd(e.target.value); setPage(1); }}
                            />
                        </FilterField>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SummaryCard
                    icon={FileText}
                    iconClassName="bg-primary/10 text-primary"
                    label="Total Entries"
                    value={(summary?.totalEntries ?? 0).toLocaleString()}
                    description="All time, this tester."
                />
                <SummaryCard
                    icon={BarChart3}
                    iconClassName="bg-blue-100 text-blue-700"
                    label="Entries in Range"
                    value={(summary?.entriesInRange ?? 0).toLocaleString()}
                    description="Matches the filters above."
                />
                <SummaryCard
                    icon={PieChart}
                    iconClassName="bg-emerald-100 text-emerald-700"
                    label="Pass Rate"
                    value={summary?.passRate !== null && summary?.passRate !== undefined ? `${summary.passRate}%` : "No data"}
                    description={`Pass ÷ status recorded (${summary?.passCount ?? 0} of ${summary?.statusRecordedCount ?? 0}).`}
                />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    {entriesData ? `Showing ${entriesData.entries.length} of ${entriesData.total} entries, newest submissions first.` : ""}
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
                <div className="rounded-lg border border-border">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/60 border-b border-border">
                                    <th className={`${TH_CLASS} w-12`}>#</th>
                                    {TABLE_COLUMNS.map((c) => (
                                        <th key={c.key} className={TH_CLASS}>
                                            {c.label}
                                        </th>
                                    ))}
                                    <th className={TH_CLASS}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entriesData.entries.map((entry, i) => (
                                    <tr
                                        key={entry._id}
                                        className="border-b border-border last:border-b-0 even:bg-muted/20 hover:bg-muted/50 transition-colors"
                                    >
                                        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                                            {(page - 1) * pageSize + i + 1}
                                        </td>
                                        {TABLE_COLUMNS.map((c) => (
                                            <td key={c.key} className="px-3 py-2 whitespace-nowrap">
                                                {renderCell(entry, c.key)}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-1">
                                                <TesterEntryDetailDialog entry={entry} />
                                                <TesterEntryRowActions entry={entry} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs">
                        <nav aria-label="Table pages" className="flex items-center gap-1">
                            <button type="button" aria-label="First page" title="First page" disabled={page === 1} onClick={() => setPage(1)} className={navButtonClass}>
                                <ChevronsLeft className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" aria-label="Previous page" title="Previous page" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className={navButtonClass}>
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            {getPageItems(page - 1, totalPages).map((item) =>
                                typeof item === "number" ? (
                                    <button
                                        key={item}
                                        type="button"
                                        aria-label={`Page ${item + 1}`}
                                        aria-current={item + 1 === page ? "page" : undefined}
                                        onClick={() => setPage(item + 1)}
                                        className={`h-7 min-w-7 px-1.5 rounded-md font-medium tabular-nums transition-colors ${
                                            item + 1 === page
                                                ? "bg-primary text-primary-foreground"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        }`}
                                    >
                                        {item + 1}
                                    </button>
                                ) : (
                                    <span key={item} className="w-5 text-center text-muted-foreground select-none" aria-hidden>
                                        …
                                    </span>
                                ),
                            )}
                            <button type="button" aria-label="Next page" title="Next page" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className={navButtonClass}>
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" aria-label="Last page" title="Last page" disabled={page >= totalPages} onClick={() => setPage(totalPages)} className={navButtonClass}>
                                <ChevronsRight className="h-3.5 w-3.5" />
                            </button>
                        </nav>

                        <div className="flex items-center gap-3 text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <span className="whitespace-nowrap">Rows per page</span>
                                <Select
                                    value={String(pageSize)}
                                    onValueChange={(v) => {
                                        setPageSize(Number(v));
                                        setPage(1);
                                    }}
                                >
                                    <SelectTrigger size="sm" className="data-[size=sm]:h-7 w-[68px] text-xs" aria-label="Rows per page">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PAGE_SIZE_OPTIONS.map((n) => (
                                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <span className="whitespace-nowrap tabular-nums">
                                {rangeStart}–{rangeEnd} of {entriesData.total}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
