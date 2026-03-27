import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";

const DailyActiveUsers = () => {
    const data = [
        30, 32, 35, 33, 40, 42, 45, 48, 50, 52, 55, 58, 60, 62, 65, 68, 70, 72,
        75, 78, 80, 82, 85, 88, 90, 98, 95, 92, 90, 80,
    ];
    const maxData = Math.max(...data);

    // Bar colors based on value ranges (increasing saturation)
    const getBarColor = (value: number, index: number): string => {
        if (index === data.length - 1) return "#EF9F27"; // Last bar - highlight

        if (value < 50) return "#86efac"; // Light green
        if (value < 75) return "#4ade80"; // Medium green
        if (value < 85) return "#22c55e"; // Dark green
        return "#16a34a"; // Very dark green (peak)
    };

    return (
        <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                    Daily active users — 30 day trend
                </CardTitle>
                <CardDescription>Farmers + KCC agents + agri experts</CardDescription>
            </CardHeader>
            <CardContent>
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
                        Peak: <span className="font-medium text-[#1a1a1a] dark:text-slate-100">Day 26 · 98,400</span>
                    </div>
                    <div className="text-[11px] text-[#888] dark:text-gray-400">
                        Avg: <span className="font-medium text-[#1a1a1a] dark:text-slate-100">71,200 / day</span>
                    </div>
                    <div className="text-[11px] text-[#888] dark:text-gray-400">
                        Growth: <span className="font-medium text-[#1E7A3C]">+18% MoM</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default DailyActiveUsers;
