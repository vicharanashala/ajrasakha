import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { QueryCategoryQuestionsModal } from "@/features/chatbotDashboard/components/QueryCategoryQuestionsModal";
import { useState } from "react";

type ManualSource = "MANUAL" | "AGRI_EXPERT" | "OUTREACH";

type Item = {
  label: string;
  count: number;
  key: ManualSource;
};

type Props = {
  items: Item[];
  effectiveDate?: string;
  userType?: 'all' | 'external' | 'internal';
};

export function BreakdownTooltip({ items, effectiveDate, userType }: Props) {
  const [selectedSource, setSelectedSource] =
    useState<ManualSource | null>(null);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Info className="h-3.5 w-3.5 cursor-pointer text-muted-foreground" />
            </button>
          </TooltipTrigger>

          <TooltipContent className="w-56 p-2">
            <div className="space-y-1">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSource(item.key);
                  }}
                >
                  <span>{item.label}</span>

                  <span className="font-medium tabular-nums">
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {selectedSource && (
        <QueryCategoryQuestionsModal
          manualSource={selectedSource}
          onClose={() => setSelectedSource(null)}
          effectiveDate={effectiveDate}
          userType={userType}
        />
      )}
    </>
  );
}