import React from "react";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";

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

// ─── PREMIUM HARMONIOUS 15-COLOR PALETTE ─────────────────────────────────────

const PREMIUM_PALETTE = [
    "#3AAA5A", // Active green
    "#378ADD", // Calm ocean blue
    "#EF9F27", // Warm orange-gold
    "#E24B4A", // Soft vibrant red
    "#7C6FD4", // Sleek modern purple
    "#1D9E75", // Deep teal-green
    "#EC4899", // Magenta-pink
    "#06B6D4", // Turquoise cyan
    "#8B5CF6", // Dynamic violet
    "#F59E0B", // Bright amber
    "#10B981", // Rich emerald
    "#3B82F6", // Professional royal blue
    "#F43F5E", // Rose red
    "#6366F1", // Indigo
    "#14B8A6", // Minty teal
];

const DEFAULT_CATEGORIES: QueryCategory[] = [
    { label: "Disease Management", questionCount: 0, duplicateQuestionCount: 0 },
    { label: "Farm Tools & Mechanisation", questionCount: 0, duplicateQuestionCount: 0 },
    { label: "Fertilizer Use and Availability", questionCount: 0, duplicateQuestionCount: 0 },
    { label: "Field Preparation", questionCount: 0, duplicateQuestionCount: 0 },
    { label: "Plant Protection", questionCount: 0, duplicateQuestionCount: 0 },
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
}) => {
    const total = questionCount + duplicateQuestionCount;

    return (
        <div className="mb-4 last:mb-0 hover:bg-gray-50/50 dark:hover:bg-white/5 p-2 rounded-lg transition-all duration-300">
            <div className="flex justify-between items-center mb-1.5">
                <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">
                    {label}
                </span>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                    <span className="text-[10px] font-normal text-gray-400">Unique:</span>
                    <span className="text-gray-700 dark:text-gray-200">{questionCount}</span>
                    <span className="mx-1 text-gray-300 dark:text-gray-600">|</span>
                    <span className="text-[10px] font-normal text-gray-400">Duplicate:</span>
                    <span className="text-gray-700 dark:text-gray-200">{duplicateQuestionCount}</span>
                    <span className="ml-1.5 text-[10px] text-gray-400 font-normal">({total} total)</span>
                </div>
            </div>
            <div className="w-full h-[6px] bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, background: color }}
                />
            </div>
        </div>
    );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

 const DashboardQueryCategories: React.FC<QueryCategoriesProps> = ({
    categories = DEFAULT_CATEGORIES,
}) => {
    // Determine maximum total count among all categories to scale progress bars proportionally
    const activeCategories = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
    const totals = activeCategories.map((c) => c.questionCount + c.duplicateQuestionCount);
    const maxTotal = Math.max(...totals, 1);

    return (
      <div
        className="          bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     
 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col h-full"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
              <span>Query categories</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground">
                    <InfoIcon className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  List of top domains/categories that chatbot users are asking questions about, showing unique vs duplicate counts.
                </TooltipContent>
              </Tooltip>
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
            const color =
              q.color || PREMIUM_PALETTE[index % PREMIUM_PALETTE.length];

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

export default DashboardQueryCategories;
