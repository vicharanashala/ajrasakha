import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3 border rounded-lg p-4 w-full">
                <div className="flex-1 min-w-[180px] space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Tester</label>
                    <Select value={testerId} onValueChange={setTesterId}>
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
                    <Select value={datePreset} onValueChange={(v: string) => setDatePreset(v as DatePreset)}>
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
                                onChange={(e) => setCustomStart(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1 flex-1 min-w-[150px] max-w-[240px]">
                            <label className="text-xs font-medium text-muted-foreground uppercase">End</label>
                            <input
                                type="date"
                                className="h-8 w-full text-sm border rounded-md px-2"
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
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
                                            Testers work 6 days a week, each with their own weekly day off (some
                                            Saturday, some Sunday). Target = 54 × working days, where working days =
                                            calendar days in range × 6 ÷ 7, rounded to the nearest whole day.
                                        </p>
                                        <p>
                                            Every tester is scored against the same target for the range, whether
                                            they logged anything or not - a tester with nothing logged shows
                                            0 against a real target instead of disappearing.
                                        </p>
                                        {datePreset === "today" && (
                                            <p>
                                                Today uses a target of 54 per tester. A tester on their weekly day
                                                off will correctly show 0 / 54 for today.
                                            </p>
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
                                    Target = 54 × {summary.workingDays} working day{summary.workingDays === 1 ? "" : "s"}
                                    {summary.byTester ? ` × ${summary.byTester.length} active tester${summary.byTester.length === 1 ? "" : "s"}` : ""}.
                                </p>
                            </CardContent>
                        </Card>
                        <Card className="border-muted-foreground/10">
                            <CardHeader className="pb-1">
                                <CardTitle className="text-xs text-muted-foreground uppercase">Achievement</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className={`text-2xl font-bold ${achievementClass(summary.overall.achievementPct)}`}>
                                    {summary.overall.achievementPct}%
                                </div>
                                <p className="text-[10px] text-muted-foreground">Actual ÷ target, all 6 question types combined.</p>
                            </CardContent>
                        </Card>
                        <Card className="border-muted-foreground/10">
                            <CardHeader className="pb-1">
                                <CardTitle className="text-xs text-muted-foreground uppercase">Web App vs WhatsApp</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Web App</span>
                                    <span className="font-semibold">
                                        {summary.webApp.actual.toLocaleString()} / {summary.webApp.target.toLocaleString()}
                                        <span className={`ml-1.5 text-xs ${achievementClass(summary.webApp.achievementPct)}`}>({summary.webApp.achievementPct}%)</span>
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">WhatsApp</span>
                                    <span className="font-semibold">
                                        {summary.whatsApp.actual.toLocaleString()} / {summary.whatsApp.target.toLocaleString()}
                                        <span className={`ml-1.5 text-xs ${achievementClass(summary.whatsApp.achievementPct)}`}>({summary.whatsApp.achievementPct}%)</span>
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
                                    <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground">Target</th>
                                    <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground">Actual</th>
                                    <th className="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground">Achievement %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.byType.map((row) => (
                                    <tr key={row.key} className={`border-b border-border last:border-b-0 ${row.key === "total" ? "bg-muted/30 font-semibold" : ""}`}>
                                        <td className="px-3 py-2">{row.label}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{row.target.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{row.actual.toLocaleString()}</td>
                                        <td className={`px-3 py-2 text-right tabular-nums ${achievementClass(row.achievementPct)}`}>{row.achievementPct}%</td>
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
                                <div className="overflow-x-auto rounded-lg border border-border">
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
                                            {summary.byTester.map((tester) => (
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
                                                        {tester.achievementPct}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
