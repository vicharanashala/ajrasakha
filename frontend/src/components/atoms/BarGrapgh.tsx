import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";

interface BarData {
    label: string;
    value: number;
}

interface BarGraphProps {
    data: BarData[];
    height?: number;
    getBarColor?: (value: number, index: number, total: number) => string;
    xAxisLabels?: string[];
}

function defaultBarColor(value: number, index: number, total: number): string {
    if (index === total - 1) return "#EF9F27";
    if (value < 50) return "#86efac";
    if (value < 75) return "#4ade80";
    if (value < 85) return "#22c55e";
    return "#16a34a";
}

export function BarGraph({ data, height = 120, getBarColor = defaultBarColor, xAxisLabels }: BarGraphProps) {
    const maxValue = Math.max(...data.map(d => d.value));

    return (
        <div className="overflow-x-auto">
            <div className="min-w-[360px]">
                <div className="flex items-end gap-[3px]" style={{ height }}>
                    <TooltipProvider>
                        {data.map((item, index) => {
                            const heightPercent = (item.value / maxValue) * 100;
                            const isLast = index === data.length - 1;
                            return (
                                <Tooltip key={index}>
                                    <TooltipTrigger asChild>
                                        <div
                                            className="flex-1 rounded-t-sm min-h-[2px] cursor-pointer"
                                            style={{
                                                height: `${heightPercent}%`,
                                                background: getBarColor(item.value, index, data.length),
                                                outline: isLast ? "1.5px solid #BA7517" : "none",
                                            }}
                                        />
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                        <div className="text-center">
                                            <div className="font-bold text-sm">{item.value.toLocaleString()}</div>
                                            <div className="h-px bg-white/40 my-1.5" />
                                            <div className="text-xs opacity-90">{item.label}</div>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </TooltipProvider>
                </div>

                {xAxisLabels && (
                    <div className="flex justify-between text-[10px] text-[#aaa] mt-1">
                        {xAxisLabels.map((t, i) => <span key={i}>{t}</span>)}
                    </div>
                )}
            </div>
        </div>
    );
}
