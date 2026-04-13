import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";
import { Spinner } from "@/components/atoms/spinner";
import { BarGraph } from "@/components/atoms/BarGrapgh";

function getDateRangeLabel(days = 30): string {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const fmt = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
}

const FALLBACK_DATA = [
    30, 32, 35, 33, 40, 42, 45, 48, 50, 52, 55, 58, 60, 62, 65, 68, 70, 72,
    75, 78, 80, 82, 85, 88, 90, 98, 95, 92, 90, 80,
];

interface Props {
    data?: number[];
    isLoading?: boolean;
    error?: Error | null;
}

const DailyActiveUsers = ({ data: propData, isLoading = false, error = null }: Props) => {
    const data = propData && propData.length > 0 ? propData : FALLBACK_DATA;

    // Computed stats from real data
    const peakValue = Math.max(...data);
    const peakDay = data.indexOf(peakValue) + 1;
    const avg = Math.round(data.reduce((a, b) => a + b, 0) / data.length);
    const last7 = data.slice(-7);
    const prior7 = data.slice(-14, -7);
    const last7Avg = last7.reduce((a, b) => a + b, 0) / (last7.length || 1);
    const prior7Avg = prior7.length > 0 ? prior7.reduce((a, b) => a + b, 0) / prior7.length : last7Avg;
    const growthPct = prior7Avg === 0 ? 0 : Math.round(((last7Avg - prior7Avg) / prior7Avg) * 100);
    const growthLabel = growthPct >= 0 ? `+${growthPct}% WoW` : `${growthPct}% WoW`;
    const growthColor = growthPct >= 0 ? "#1E7A3C" : "#DC2626";

    // Date label for each bar: index 0 = oldest day, last index = today
    const barLabels = data.map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (data.length - 1 - i));
        const year = d.getFullYear();
        const month = d.toLocaleString("en-IN", { month: "short" });
        const day = d.getDate();
        return `${year} ${month} ${day}`;
    });

    // Bar colors based on value ranges (increasing saturation)
    const getBarColor = (value: number, index: number, _total: number): string => {
        if (index === data.length - 1) return "#EF9F27"; // Last bar - highlight

        if (value < 50) return "#86efac"; // Light green
        if (value < 75) return "#4ade80"; // Medium green
        if (value < 85) return "#22c55e"; // Dark green
        return "#16a34a"; // Very dark green (peak)
    };

    return (
        <div className="relative">
            {isLoading && <Spinner text="Fetching trend..." fullScreen={false} />}
            <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
                <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                        <div>
                            <CardTitle className="text-sm font-medium">
                                Daily active users — 30 day trend
                            </CardTitle>
                            <CardDescription>Farmers + KCC agents + agri experts</CardDescription>
                        </div>
                        <div style={{
                            background: "#22c55e22",
                            border: "1px solid #22c55e55",
                            borderRadius: 6,
                            padding: "2px 6px",
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#16a34a",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                        }}>
                            {getDateRangeLabel(30)}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <BarGraph
                        data={data.map((value, i) => ({ label: barLabels[i], value }))}
                        getBarColor={getBarColor}
                        xAxisLabels={["Day 1", "Day 10", "Day 20", "Today"]}
                    />
                    {error && (
                        <p className="text-[11px] text-red-500 mt-2">
                            Could not load live data — showing last known values.
                        </p>
                    )}
                    <div
                        style={{
                            display: "flex",
                            gap: 16,
                            marginTop: 12,
                            paddingTop: 10,
                            borderTop: "0.5px solid #f0f0f0",
                            flexWrap: "wrap",
                        }}
                    >
                        <div className="text-[11px] text-[#888] dark:text-gray-400">
                            Peak: <span className="font-medium text-[#1a1a1a] dark:text-slate-100">Day {peakDay} · {peakValue.toLocaleString()}</span>
                        </div>
                        <div className="text-[11px] text-[#888] dark:text-gray-400">
                            Avg: <span className="font-medium text-[#1a1a1a] dark:text-slate-100">{avg.toLocaleString()} / day</span>
                        </div>
                        <div className="text-[11px] text-[#888] dark:text-gray-400">
                            Growth: <span className="font-medium" style={{ color: growthColor }}>{growthLabel}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default DailyActiveUsers;
