import React from "react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface QueryCategory {
    label: string;
    pct: number;
    color: string;
    valueColor?: string;
}

interface QueryCategoriesProps {
    categories?: QueryCategory[];
    unansweredCluster?: {
        label: string;
        count: string;
    };
}

// ─── STATIC DATA ──────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES: QueryCategory[] = [
    { label: "Pest & disease", pct: 34, color: "#E24B4A", valueColor: "#A32D2D" },
    { label: "Fertilizer dosage", pct: 28, color: "#EF9F27", valueColor: "#633806" },
    { label: "Irrigation timing", pct: 18, color: "#378ADD" },
    { label: "Crop selection", pct: 12, color: "#3AAA5A" },
    { label: "Govt. schemes", pct: 8, color: "#7C6FD4" },
    { label: "Weather forecast", pct: 7, color: "#1D9E75" },
    { label: "Seed varieties", pct: 6, color: "#E24B4A" },
    { label: "Soil testing", pct: 5, color: "#EF9F27" },
    { label: "Market prices", pct: 4, color: "#378ADD" },
];

const DEFAULT_UNANSWERED = {
    label: "Mandi pricing",
    count: "8,400 queries",
};

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
    label: string;
    pct: number;
    color: string;
    valueColor?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, pct, color, valueColor }) => (
    <div className="mb-3 last:mb-0">
        <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
            <span
                className="text-[11px]"
                style={{
                    color: valueColor || undefined,
                    fontWeight: valueColor ? 500 : 400,
                }}
            >
                {!valueColor && (
                    <span className="text-gray-500 dark:text-gray-400">{pct}%</span>
                )}
                {valueColor && (
                    <span>{pct}%</span>
                )}
            </span>
        </div>
        <div className="w-full h-[5px] bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${pct}%`, background: color }}
            />
        </div>
    </div>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const DashboardQueryCategories: React.FC<QueryCategoriesProps> = ({
    categories = DEFAULT_CATEGORIES,
    unansweredCluster = DEFAULT_UNANSWERED,
}) => {
    return (
        <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="text-[13px] font-medium text-gray-900 dark:text-gray-100">
                        Query categories
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        This week · all channels
                    </div>
                </div>
                <button className="text-[11px] text-[#3AAA5A] hover:text-[#2e8c4a] transition-colors cursor-pointer whitespace-nowrap">
                    See all ↗
                </button>
            </div>

            {/* Progress bars — scrollable */}
            <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: 260 }}>
                {categories.map((q) => (
                    <ProgressBar
                        key={q.label}
                        label={q.label}
                        pct={q.pct}
                        color={q.color}
                        valueColor={q.valueColor}
                    />
                ))}
            </div>

            {/* Footer: top unanswered cluster */}
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    Top unanswered cluster
                </div>
                <div className="text-[12px] font-medium text-[#A32D2D] dark:text-[#f87171] mt-0.5">
                    {unansweredCluster.label} · {unansweredCluster.count}
                </div>
            </div>
        </div>
    );
};
