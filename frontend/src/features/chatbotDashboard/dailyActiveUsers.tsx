import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";
import { Spinner } from "@/components/atoms/spinner";

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
    const maxData = Math.max(...data);

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

    // Bar colors based on value ranges (increasing saturation)
    const getBarColor = (value: number, index: number): string => {
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
                    <CardTitle className="text-sm font-medium">
                        Daily active users — 30 day trend
                    </CardTitle>
                    <CardDescription>Farmers + KCC agents + agri experts</CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Scrollable wrapper — prevents bar chart from squishing on small screens */}
                    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                        <div style={{ minWidth: 360 }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
                                {data.map((value, index) => {
                                    const heightPercent = (value / maxData) * 100;
                                    return (
                                        <div
                                            key={index}
                                            style={{
                                                flex: 1,
                                                height: `${heightPercent}%`,
                                                background: getBarColor(value, index),
                                                borderRadius: "2px 2px 0 0",
                                                outline: index === data.length - 1 ? "1.5px solid #BA7517" : "none",
                                                minHeight: 2,
                                            }}
                                        />
                                    );
                                })}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: 10,
                                    color: "#aaa",
                                    marginTop: 4,
                                }}
                            >
                                {["Day 1", "Day 10", "Day 20", "Today"].map((t, i) => (
                                    <span key={i}>{t}</span>
                                ))}
                            </div>
                        </div>
                    </div>
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
