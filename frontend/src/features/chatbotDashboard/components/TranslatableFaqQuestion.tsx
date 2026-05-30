import { useEffect, useState } from "react";
import CompactTranslateDropdown from "@/components/CompactTranslateDropdown";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { cn } from "@/lib/utils";

interface TranslatableFaqQuestionProps {
  question: string;
  textClassName?: string;
  containerClassName?: string;
  translateButtonClassName?: string;
  translateDropdownClassName?: string;
  sourceLang?: string;
  showTooltip?: boolean;
  tooltipClassName?: string;
}

export function TranslatableFaqQuestion({
  question,
  textClassName,
  containerClassName,
  translateButtonClassName,
  translateDropdownClassName,
  sourceLang,
  showTooltip = false,
  tooltipClassName,
}: TranslatableFaqQuestionProps) {
  const [translatedText, setTranslatedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const displayQuestion = translatedText || question;

  useEffect(() => {
    setTranslatedText("");
    setError(null);
  }, [question]);

  const questionText = (
    <p
      className={cn(
        "font-medium leading-relaxed break-words text-slate-700 dark:text-gray-200",
        textClassName,
      )}
    >
      {displayQuestion}
    </p>
  );

  return (
    <div className={cn("flex flex-col min-w-0 flex-1 w-full gap-1.5", containerClassName)}>
      <div className="flex min-w-0 items-start gap-2 w-full">
        <div className="min-w-0 flex-1">
          {showTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full cursor-help text-left">{questionText}</div>
              </TooltipTrigger>

              <TooltipContent
                side="top"
                align="start"
                className={cn(
                  "max-w-xs sm:max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-700 shadow-2xl break-words z-50 dark:border-white/[0.08] dark:bg-[#18181b] dark:text-gray-200",
                  tooltipClassName,
                )}
              >
                {displayQuestion}
              </TooltipContent>
            </Tooltip>
          ) : (
            questionText
          )}
        </div>

        <CompactTranslateDropdown
          query={question}
          sourceLang={sourceLang}
          onTranslate={setTranslatedText}
          onError={setError}
          buttonClassName={cn(
            "shrink-0 gap-1 rounded-md text-[11px]",
            translateButtonClassName,
          )}
          dropdownClassName={translateDropdownClassName}
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50/80 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 px-3 py-2 mt-0.5 w-full animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-[11px] font-medium text-red-600 dark:text-red-400 break-words leading-relaxed">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
