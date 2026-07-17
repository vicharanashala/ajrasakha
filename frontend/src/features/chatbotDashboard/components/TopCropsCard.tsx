import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/atoms/card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    ResponsiveContainer,
} from "recharts";
import { Maximize2, X, InfoIcon, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/atoms/skeleton";
import { Tooltip as ShadcnTooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { QueryCategoryQuestionsModal } from "./QueryCategoryQuestionsModal";

const colors = [
    "var(--color-chart-1, #3AAA5A)",
    "var(--color-chart-2, #378ADD)",
    "var(--color-chart-3, #A56EFF)",
    "var(--color-chart-4, #FFB020)",
    "var(--color-chart-5, #F94144)",
];

interface TopCropItem {
    id?: string | number;
    name?: string;
    value?: number;
    count?: number;
    [key: string]: any;
}

interface TopCropsData {
    totalQuestions: number;
    topCrops: TopCropItem[];
}

interface TopCropsCardProps {
    topCrops: TopCropsData | undefined;
    isLoadingTopCrops: boolean;
    errorLoadingtopCrops: string | null | Error;
    source?: "vicharanashala" | "annam" | "whatsapp";
    userType?: string;
}

export const TopCropsCard = ({
    topCrops,
    isLoadingTopCrops,
    errorLoadingtopCrops,
    source = "annam",
    userType,
}: TopCropsCardProps) => {
    const [isMaximized, setIsMaximized] = useState(false);
    const [topCrop, setTopCrop] = useState<string | null>(null);
    const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    const processedData = React.useMemo(() => {
        if (!topCrops?.topCrops) return [];

        const sortedCrops = [...topCrops.topCrops].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
        const top5 = sortedCrops.slice(0, 5);
        const rest = sortedCrops.slice(5);

        const finalData: any = top5.map((item, index) => ({ ...item, subItems: null }));

        if (rest.length > 0) {
            const othersCount = rest.reduce((sum, item) => sum + (item.count ?? 0), 0);
            finalData.push({ name: "Others", count: othersCount, subItems: rest });
        }

        return finalData.map((item: any, index: number) => ({
            ...item,
            color: colors[index % colors.length],
        }));
    }, [topCrops?.topCrops]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await queryClient.refetchQueries({ queryKey: ["top-crops-chatbot"] });
        setRefreshing(false);
    };

    const handleClick = (cropName: string, subItems?: any[]) => {
        setTopCrop(cropName);

        if (cropName === "Others" && subItems?.length) {
            setSelectedCrops(subItems.map((item) => item.name));
        } else {
            setSelectedCrops([]);
        }
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const pointInfo = payload[0].payload;
            return (
                <div className="bg-primary text-primary-foreground border border-primary/20 rounded-lg shadow-lg p-3 text-sm flex flex-col gap-1 min-w-[140px]">
                    <p className="font-semibold pb-1 border-b border-gray-100 dark:border-gray-800">{label}</p>

                    {!pointInfo.subItems ? (
                        <div className="flex justify-between gap-4 mt-1">
                            <span className="text-gray-500 dark:text-gray-400">Total</span>
                            <span className="font-bold">{pointInfo.count}</span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1 mt-1 max-h-[160px] overflow-y-auto pr-1">
                            {pointInfo.subItems.map((item: any) => (
                                <div key={item.name} className="flex justify-between gap-4 text-xs">
                                    <span className="text-gray-500 dark:text-gray-400 truncate max-w-[100px]">{item.name}</span>
                                    <span className="font-medium align-right">{item.count}</span>
                                </div>
                            ))}
                            <div className="flex justify-between gap-4 mt-2 pt-1 border-t border-gray-100 dark:border-gray-800 text-xs font-semibold">
                                <span>Total</span>
                                <span>{pointInfo.count}</span>
                            </div>
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };


    if (isLoadingTopCrops) {
        return (
            <Card className="h-full min-h-[300px] p-5">
                <Skeleton className="h-5 w-44 rounded-md" />
                <Skeleton className="mt-3 h-4 w-64 max-w-full rounded-md" />
                <Skeleton className="mt-6 h-[260px] w-full rounded-lg" />
            </Card>
        );
    }

    if (errorLoadingtopCrops || !topCrops) {
        return (
            <Card className="h-full min-h-[300px] flex items-center justify-center text-destructive">
                Error loading top crops.
            </Card>
        );
    }

    return (
        <>
            <Card className="bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col h-full shadow-sm overflow-hidden relative">
                {/* Buttons */}
                <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        className="rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    </button>
                    <button
                        onClick={() => setIsMaximized(true)}
                        className="p-1.5 rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm"
                        title="Maximize chart"
                    >
                        <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                    </button>
                </div>

                <CardHeader>
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <span>Top Crops by Questions</span>
                        <ShadcnTooltip>
                            <TooltipTrigger asChild>
                                <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground normal-case tracking-normal">
                                    <InfoIcon className="h-3.5 w-3.5" />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent className="normal-case tracking-normal">
                                Highlights the top 5 crops mentioned in queries, with others grouped.
                            </TooltipContent>
                        </ShadcnTooltip>
                    </CardTitle>
                    <CardDescription>
                        Most frequently asked crops. Total Matching Questions:{" "}
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {topCrops.totalQuestions.toLocaleString()}
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 pb-4">
                    <div className="w-full h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={processedData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #e2e8f0)" />
                                <XAxis
                                    dataKey="name"
                                    stroke="var(--color-muted-foreground, #64748b)"
                                    tick={{ fontSize: 11, textAnchor: "end", dy: 8 }}
                                    tickLine={false}
                                    axisLine={false}
                                    interval={0}
                                    height={50}
                                    angle={-35}
                                />
                                <YAxis
                                    stroke="var(--color-muted-foreground)"
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value)}
                                />
                                <Tooltip cursor={{ fill: "var(--color-muted, #f1f5f9)", opacity: 0.4 }} content={<CustomTooltip />} />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]} cursor="pointer">
                                    {processedData.map((entry: any, index: null) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.color}
                                            onClick={() => handleClick(entry.name, entry.subItems)}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Maximized Modal */}
            {isMaximized &&
                createPortal(
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setIsMaximized(false)}>
                        <div className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-6xl w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => setIsMaximized(false)}
                                className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                title="Close"
                            >
                                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                            </button>

                            <div className="mb-6">
                                <h3 className="text-lg font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Top Crops by Questions</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                    Most frequently asked crops. Total Matching Questions:{" "}
                                    <span className="font-semibold text-gray-900 dark:text-gray-100">{topCrops.totalQuestions.toLocaleString()}</span>
                                </p>
                            </div>

                            <div className="flex gap-4 items-start">
                                <div className="flex-[65] min-w-0 h-[460px] relative">
                                    <div className="absolute left-0 top-0 bottom-12 w-px bg-gray-300 dark:bg-gray-700 z-10" />
                                    <div className="absolute left-0 right-0 bottom-12 h-px bg-gray-300 dark:bg-gray-700 z-10" />
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={processedData} margin={{ top: 25, right: 20, left: 10, bottom: 60 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #e2e8f0)" />
                                            <XAxis
                                                dataKey="name"
                                                stroke="var(--color-muted-foreground, #64748b)"
                                                tick={{ fontSize: 13, textAnchor: "end", dy: 8 }}
                                                tickLine={false}
                                                axisLine={false}
                                                interval={0}
                                                height={80}
                                                angle={-35}
                                            />
                                            <YAxis
                                                stroke="var(--color-muted-foreground)"
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fontSize: 13 }}
                                                tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value)}
                                            />
                                            <Tooltip cursor={{ fill: "var(--color-muted, #f1f5f9)", opacity: 0.4 }} content={<CustomTooltip />} />
                                            <Bar dataKey="count" radius={[6, 6, 0, 0]} cursor="pointer">
                                                {processedData.map((entry: any, index: any) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} onClick={() => handleClick(entry.name, entry.subItems)} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="flex-[35] min-w-0 max-h-[460px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Crop</th>
                                                <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Questions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {processedData.map((row: any, idx: number) => (
                                                <tr
                                                    key={idx}
                                                    className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                                >
                                                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: row.color }} />
                                                            {row.name}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                                                        {row.count.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
            {topCrop && (
                <QueryCategoryQuestionsModal
                    crop={topCrop}
                    crops={selectedCrops}
                    // @ts-ignore
                    source={source}
                    userType={userType}
                    isQueryCategory={false}
                    onClose={() => {
                        setTopCrop(null);
                        setSelectedCrops([]);
                    }}
                />
            )}
        </>
    );
};