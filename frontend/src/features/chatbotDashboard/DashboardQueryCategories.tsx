import React from "react";
import { ScrollArea } from "@/components/atoms/scroll-area";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface QueryCategory {
    label: string;
    questionCount: number;
    duplicateQuestionCount: number;
    color?: string;
    valueColor?: string;
}

interface QueryCategoriesProps {
    categories?: QueryCategory[];
}

// ─── STATIC FALLBACK DATA ──────────────────────────────────────────────────────

const DEFAULT_CATEGORIES: QueryCategory[] = [
    { label: "Pest & disease", questionCount: 154, duplicateQuestionCount: 32 },
    { label: "Fertilizer dosage", questionCount: 120, duplicateQuestionCount: 28 },
    { label: "Irrigation timing", questionCount: 88, duplicateQuestionCount: 14 },
    { label: "Crop selection", questionCount: 52, duplicateQuestionCount: 8 },
    { label: "Govt. schemes", questionCount: 34, duplicateQuestionCount: 4 },
];

const PREMIUM_PALETTE = [
    "#3AAA5A", // Green
    "#378ADD", // Blue
    "#EF9F27", // Amber
    "#E24B4A", // Red
    "#7C6FD4", // Purple
    "#1D9E75", // Teal
    "#EC4899", // Pink
    "#F59E0B", // Yellow
    "#10B981", // Emerald
    "#6366F1", // Indigo
    "#8B5CF6", // Violet
    "#06B6D4", // Cyan
    "#14B8A6", // Teal-Cyan
    "#F97316", // Orange
    "#84CC16", // Lime
];

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
    label: string;
    pct: number;
    color: string;
    questionCount: number;
    duplicateQuestionCount: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
    label,
    pct,
    color,
    questionCount,
    duplicateQuestionCount,
}) => (
    <div className="mb-4 last:mb-0">
        <div className="flex justify-between items-start mb-1.5">
            <div className="flex flex-col">
                <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">
                    {label}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                    Question Count:{" "}
                    <span className="font-semibold text-gray-800 dark:text-gray-300">
                        {questionCount}
                    </span>{" "}
                    · Duplicate Question Count:{" "}
                    <span className="font-semibold text-gray-800 dark:text-gray-300">
                        {duplicateQuestionCount}
                    </span>
                </span>
            </div>
            <span className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                {questionCount + duplicateQuestionCount}
            </span>
        </div>
        <div className="w-full h-[6px] bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
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
}) => {
    // Determine maximum total count among all categories to scale progress bars proportionally
    const activeCategories = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
    const totals = activeCategories.map((c) => c.questionCount + c.duplicateQuestionCount);
    const maxTotal = Math.max(...totals, 1);

    return (
        <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                        Query categories
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Dynamic Agriculture Domains (Top 15)
                    </div>
                </div>

            </div>

            {/* Progress bars — scrollable */}
            <ScrollArea className="flex-1 max-h-[300px] pr-1">
                {activeCategories.map((q, index) => {
                    const total = q.questionCount + q.duplicateQuestionCount;
                    const pct = (total / maxTotal) * 100;
                    const color = q.color || PREMIUM_PALETTE[index % PREMIUM_PALETTE.length];

                    return (
                        <ProgressBar
                            key={q.label}
                            label={q.label}
                            pct={pct}
                            color={color}
                            questionCount={q.questionCount}
                            duplicateQuestionCount={q.duplicateQuestionCount}
                        />
                    );
                })}
            </ScrollArea>
        </div>
    );
};
