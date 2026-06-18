import { useEffect, useState } from "react";
import CompactTranslateDropdown from "@/components/CompactTranslateDropdown";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { cn } from "@/lib/utils";

const NON_ENGLISH_SCRIPT_PATTERN =
  /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF]/;
const NON_LATIN_LETTER_PATTERN = /[^\W\d_A-Za-z]/u;

interface TranslatableTextProps {
  text: string;
  textClassName?: string;
  containerClassName?: string;
  translateButtonClassName?: string;
  translateDropdownClassName?: string;
  sourceLang?: string;
  showTooltip?: boolean;
  tooltipClassName?: string;
}

function isEnglishText(text: string, sourceLang?: string) {
  const normalizedSourceLang = sourceLang?.trim().toLowerCase();

  if (normalizedSourceLang) {
    return normalizedSourceLang.startsWith("en");
  }

  const trimmedText = text.trim();
  if (!trimmedText) return true;
  if (NON_ENGLISH_SCRIPT_PATTERN.test(trimmedText)) return false;
  if (NON_LATIN_LETTER_PATTERN.test(trimmedText)) return false;

  return true;
}

export function TranslatableText({
  text,
  textClassName,
  containerClassName,
  translateButtonClassName,
  translateDropdownClassName,
  sourceLang,
  showTooltip = false,
  tooltipClassName,
}: TranslatableTextProps) {
  const [translatedText, setTranslatedText] = useState("");
  const [showOriginalText, setShowOriginalText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayText = translatedText && !showOriginalText ? translatedText : text;
  const canTranslateToEnglish = !isEnglishText(text, sourceLang);
  const isShowingTranslation = Boolean(translatedText && !showOriginalText);

  useEffect(() => {
    setTranslatedText("");
    setShowOriginalText(false);
    setError(null);
  }, [text]);

  const handleTranslate = (result: string) => {
    setTranslatedText(result);
    setShowOriginalText(false);
  };

  const elementText = (
    <p
      className={cn(
        "font-medium leading-relaxed break-words text-slate-700 dark:text-gray-200",
        textClassName,
      )}
    >
      {displayText}
    </p>
  );

  return (
    <div className={cn("flex flex-col min-w-0 flex-1 w-full gap-1.5", containerClassName)}>
      <div className="flex min-w-0 items-start gap-2 w-full">
        <div className="min-w-0 flex-1">
          {showTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full cursor-help text-left">{elementText}</div>
              </TooltipTrigger>

              <TooltipContent
                side="top"
                align="start"
                className={cn(
                  "max-w-xs sm:max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-700 shadow-2xl break-words z-50 dark:border-white/[0.08] dark:bg-[#18181b] dark:text-gray-200",
                  tooltipClassName,
                )}
              >
                {displayText}
              </TooltipContent>
            </Tooltip>
          ) : (
            elementText
          )}
          {translatedText && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {isShowingTranslation && (
                <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  English Translation
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowOriginalText((prev) => !prev)}
                className="inline-flex rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {showOriginalText ? "Show English translation" : "Show original"}
              </button>
            </div>
          )}
        </div>

        {canTranslateToEnglish && !isShowingTranslation && (
          <CompactTranslateDropdown
            query={text}
            sourceLang={sourceLang}
            onTranslate={handleTranslate}
            onError={setError}
            buttonClassName={cn(
              "shrink-0 gap-1 rounded-md text-[11px]",
            translateButtonClassName,
          )}
          dropdownClassName={translateDropdownClassName}
        />
        )}
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
