import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
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
import { useTesterOptions, useTesterQuestionTypeSummary } from "../hooks/useTesterLogHistory";
import type { ITesterQuestionTypeSummaryFilters } from "../types";
import { InfoPopover } from "../../components/InfoPopover";
import { formatAchievementPct, paginate } from "../utils/adminSummaryFormat";

const TESTER_PAGE_SIZE = 10;
const PAGE_BUTTON_CLASS =
    "inline-flex h-7 items-center gap-1 px-2 rounded-md border font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent";

type DatePreset = "today" | "7days" | "30days" | "all" | "custom";

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7days", label: "Last 7 Days" },
    { key: "30days", label: "Last 30 Days" },
    { key: "all", label: "All Time" },
    { key: "custom", label: "Custom" },
];

function achievementClass(pctValue: number): string {
    if (pctValue >= 100) return "text-emerald-600";
    if (pctValue >= 60) return "text-yellow-600";
    return "text-red-600";
}

export function TesterQuestionTypeSummaryView() {
    const [testerId, setTesterId] = useState<string>("all");
    // Defaults to "Last 7 Days" - targets scale by working days across the
    // filter range (see the Questions Asked card's tooltip); a single day
    // still works but is a degenerate case of the same formula.
    const [datePreset, setDatePreset] = useState<DatePreset>("7days");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [testerPage, setTesterPage] = useState(1);

    // Any filter change starts the By Tester table back on page 1.
    function resettingPage<T>(setter: (v: T) => void) {
        return (v: T) => {
            setter(v);
            setTesterPage(1);
        };
    }

    const { data: testerOptions } = useTesterOptions();

    const { startDate, endDate } = useMemo(() => {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        if (datePreset === "today") return { startDate: todayStr, endDate: todayStr };
        // N-1 days back so "Last 7 Days" spans exactly 7 calendar days, not 8 -
        // the working-days target formula (calendar days × 6÷7, rounded) is
        // exact at 7/14/30-day boundaries and an off-by-one would shift every target.
        if (datePreset === "7days") {
            return { startDate: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), endDate: todayStr };
        }
        if (datePreset === "30days") {
            return { startDate: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), endDate: todayStr };
        }
        if (datePreset === "custom") return { startDate: customStart || undefined, endDate: customEnd || undefined };
        return { startDate: undefined, endDate: undefined };
    }, [datePreset, customStart, customEnd]);

    const filters: ITesterQuestionTypeSummaryFilters = {
        testerId: testerId === "all" ? undefined : testerId,
        startDate,
        endDate,
    };

    const { data: summary, isLoading, isError } = useTesterQuestionTypeSummary(filters);

    // Key+label pulled straight from the API's byType rows (minus the trailing
    // Total) so the table header can never list a category the backend doesn't have.
    const typeColumns = (summary?.byType ?? []).filter((r) => r.key !== "total");
    const daily = summary?.dailyTargetsPerTester;
    // Show the resolved window when the backend filled in a missing end
    // (All Time, or a Custom range with only one date set).
    const showRange = datePreset === "all" || (datePreset === "custom" && !(customStart && customEnd));
    // Clamped, so a refetch that returns fewer testers never leaves an empty page.
    const testerPageSlice = paginate(summary?.byTester ?? [], testerPage, TESTER_PAGE_SIZE);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3 border rounded-lg p-4 w-full">
                <div className="flex-1 min-w-[180px] space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Tester</label>
                    <Select value={testerId} onValueChange={resettingPage(setTesterId)}>
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
                    <label className="text-xs font-medium text-muted-foreground uppercase">Date</label>
                    <Select value={datePreset} onValueChange={resettingPage((v: string) => setDatePreset(v as DatePreset))}>
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

                {datePreset === "custom" && (
                    <div className="basis-full flex gap-3">
                        <div className="space-y-1 flex-1 min-w-[150px] max-w-[240px]">
                            <label className="text-xs font-medium text-muted-foreground uppercase">Start</label>
                            <input
                                type="date"
                                className="h-8 w-full text-sm border rounded-md px-2"
                                value={customStart}
                                onChange={(e) => resettingPage(setCustomStart)(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1 flex-1 min-w-[150px] max-w-[240px]">
                            <label className="text-xs font-medium text-muted-foreground uppercase">End</label>
                            <input
                                type="date"
                                className="h-8 w-full text-sm border rounded-md px-2"
                                value={customEnd}
                                onChange={(e) => resettingPage(setCustomEnd)(e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading summary...</span>
                </div>
            ) : isError || !summary ? (
                <div className="text-center py-16 text-destructive text-sm bg-destructive/5 rounded-lg border border-destructive/20">
                    Failed to load question-type summary.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Card className="border-muted-foreground/10">
                            <CardHeader className="pb-1">
                                <div className="flex items-center gap-1.5">
                                    <CardTitle className="text-xs text-muted-foreground uppercase">Questions Asked</CardTitle>
                                    <InfoPopover title="Target" align="start">
                                        <p>
                                            Target = daily target × working days × tester count. The daily
                                            target ({daily?.total} per tester) is based on the configured Excel
                                            target model.
                                        </p>
                                        <p>
                                            Tester count is 1 for a single tester, or the number of testers
                                            listed for All Testers.
                                        </p>
                                        {datePreset === "all" && (
                                            <p>All Time covers the team&apos;s first to last test date.</p>
                                        )}
                                    </InfoPopover>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="text-2xl font-bold">
                                    {summary.overall.actual.toLocaleString()}
                                    <span className="text-sm font-normal text-muted-foreground"> / {summary.overall.target.toLocaleString()}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    Target = {daily?.total} × {summary.workingDays} working day{summary.workingDays === 1 ? "" : "s"}
                                    {summary.byTester ? ` × ${summary.headcount} tester${summary.headcount === 1 ? "" : "s"}` : ""}.
                                    {showRange && summary.rangeStart && summary.rangeEnd && (
                                        <> Range: {summary.rangeStart} to {summary.rangeEnd}.</>
                                    )}
                                </p>
                            </CardContent>
                        </Card>
                        <Card className="border-muted-foreground/10">
                            <CardHeader className="pb-1">
                                <div className="flex items-center gap-1.5">
                                    <CardTitle className="text-xs text-muted-foreground uppercase">Achievement</CardTitle>
                                    <InfoPopover title="Achievement">
                                        <p>Achievement = actual questions ÷ target questions × 100.</p>
                                        <p>Only questions in the six target question types count as actual.</p>
                                    </InfoPopover>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className={`text-2xl font-bold ${achievementClass(summary.overall.achievementPct)}`}>
                                    {formatAchievementPct(summary.overall.achievementPct)}
                                </div>
                                <p className="text-[10px] text-muted-foreground">All 6 question types combined.</p>
                            </CardContent>
                        </Card>
                        <Card className="border-muted-foreground/10">
                            <CardHeader className="pb-1">
                                <div className="flex items-center gap-1.5">
                                    <CardTitle className="text-xs text-muted-foreground uppercase">Web App vs WhatsApp</CardTitle>
                                    <InfoPopover title="Web App vs WhatsApp" align="end">
                                        <p>
                                            Actual / Target for each channel. Channel targets are based on the
                                            configured Web App and WhatsApp distribution ({daily?.webApp} and{" "}
                                            {daily?.whatsApp} per tester per day) for the selected date range.
                                        </p>
                                        <p>An entry tested on Both counts toward both channels.</p>
                                    </InfoPopover>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0 space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Web App</span>
                                    <span className="font-semibold">
                                        {summary.webApp.actual.toLocaleString()} / {summary.webApp.target.toLocaleString()}
                                        <span className={`ml-1.5 text-xs ${achievementClass(summary.webApp.achievementPct)}`}>({formatAchievementPct(summary.webApp.achievementPct)})</span>
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">WhatsApp</span>
                                    <span className="font-semibold">
                                        {summary.whatsApp.actual.toLocaleString()} / {summary.whatsApp.target.toLocaleString()}
                                        <span className={`ml-1.5 text-xs ${achievementClass(summary.whatsApp.achievementPct)}`}>({formatAchievementPct(summary.whatsApp.achievementPct)})</span>
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-muted/60 border-b border-border">
                                    <th className="px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Question Type</th>
                                    {/* Native title hints: an InfoPopover here would be
                                        clipped by the table's overflow-x-auto wrapper. */}
                                    <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground" title="Expected questions for this question type in the selected date range.">Target</th>
                                    <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground" title="Recorded questions matching this question type.">Actual</th>
                                    <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground" title="Actual ÷ Target × 100.">Achievement %</th>
                                    <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap" title="Actual / target">Web App</th>
                                    <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap" title="Actual / target">WhatsApp</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.byType.map((row) => (
                                    <tr key={row.key} className={`border-b border-border last:border-b-0 ${row.key === "total" ? "bg-muted/30 font-semibold" : ""}`}>
                                        <td className="px-3 py-2">{row.label}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{row.target.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{row.actual.toLocaleString()}</td>
                                        <td className={`px-3 py-2 text-right tabular-nums ${achievementClass(row.achievementPct)}`}>{formatAchievementPct(row.achievementPct)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                            {row.webApp.actual.toLocaleString()} / {row.webApp.target.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                            {row.whatsApp.actual.toLocaleString()} / {row.whatsApp.target.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {summary.byTester && (
                        <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">By Tester</h3>
                            {summary.byTester.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4">No active testers found.</p>
                            ) : (
                                <div className="rounded-lg border border-border">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-muted/60 border-b border-border">
                                                <th className="px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Tester</th>
                                                <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap" title="Distinct days this tester logged something - informational only, does not affect their target">Days Logged</th>
                                                {typeColumns.map((c) => (
                                                    <th key={c.key} className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">{c.label}</th>
                                                ))}
                                                <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Total / Target</th>
                                                <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Achievement %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {testerPageSlice.items.map((tester) => (
                                                <tr key={tester.testerId} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                                                    <td className="px-3 py-2 whitespace-nowrap">{tester.testerName}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{tester.daysWorked}</td>
                                                    {typeColumns.map((c) => (
                                                        <td key={c.key} className="px-3 py-2 text-right tabular-nums">{tester.counts[c.key as keyof typeof tester.counts]}</td>
                                                    ))}
                                                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                                                        {tester.actual.toLocaleString()} / {tester.target.toLocaleString()}
                                                    </td>
                                                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${achievementClass(tester.achievementPct)}`}>
                                                        {formatAchievementPct(tester.achievementPct)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {testerPageSlice.total > TESTER_PAGE_SIZE && (
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                                        <span className="tabular-nums" aria-live="polite">
                                            {testerPageSlice.rangeStart}–{testerPageSlice.rangeEnd} of {testerPageSlice.total}
                                        </span>
                                        <nav aria-label="By Tester pages" className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setTesterPage(testerPageSlice.page - 1)}
                                                disabled={testerPageSlice.page === 1}
                                                className={PAGE_BUTTON_CLASS}
                                            >
                                                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                                                Previous
                                            </button>
                                            <span className="px-2 tabular-nums">
                                                Page {testerPageSlice.page} of {testerPageSlice.totalPages}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setTesterPage(testerPageSlice.page + 1)}
                                                disabled={testerPageSlice.page >= testerPageSlice.totalPages}
                                                className={PAGE_BUTTON_CLASS}
                                            >
                                                Next
                                                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                                            </button>
                                        </nav>
                                    </div>
                                )}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
