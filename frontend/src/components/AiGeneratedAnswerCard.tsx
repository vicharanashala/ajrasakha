import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./atoms/tooltip";
import type { SourceItem } from "@/types";
import { cn } from "@/lib/utils";
import { ChevronDown, Info, Sparkles } from "lucide-react";
import { ScrollArea } from "./atoms/scroll-area";



type Props = {
  aiApprovedAnswer?: string;
  aiInitialAnswer?: string;
  aiApprovedSources?: SourceItem[];
};

export const AiGeneratedAnswerCard = ({
  aiApprovedAnswer,
  aiInitialAnswer,
  aiApprovedSources,
}: Props) => {
  const [expanded, setExpanded] = useState(false);

  const content = aiApprovedAnswer || aiInitialAnswer;

  const hasSources =
    Array.isArray(aiApprovedSources) && aiApprovedSources.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-all duration-300">
      <div
        className={cn(
          "flex items-center justify-between px-5 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-all group",
          expanded && "border-b border-border"
        )}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              AI Generated Answer
            </span>
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[280px] text-xs p-3 shadow-xl">
                  This is an LLM-generated answer and provided as a reference for the author to create the initial answer. This helps speed up the review process.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 transition-opacity group-hover:opacity-100 opacity-0 hidden sm:inline">
            {expanded ? "Hide Details" : "View Details"}
          </span>
          <div className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background transition-all duration-300 shadow-sm",
            expanded && "rotate-180 bg-muted/50"
          )}>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <ScrollArea className="h-full max-h-[500px]">
            <div className="px-6 py-5 text-sm leading-7 text-foreground/80 space-y-4">
              {content?.split("\n").map((line, i) =>
                line.trim() === "" ? (
                  <div key={i} className="h-2" />
                ) : (
                  <p key={i}>{line}</p>
                )
              )}
            </div>

            {hasSources && (
              <div className="px-6 py-6 bg-muted/20 border-t border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                  Verified Sources
                </h4>
                <div className="grid gap-3">
                  {aiApprovedSources?.map((src, index) => (
                    <div
                      key={index}
                      className="group/source rounded-lg border border-border bg-background p-4 transition-all hover:border-primary/30 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground text-sm leading-tight">
                            {index + 1}. {src.sourceName}
                          </p>
                          {src.source && (
                            <div className="text-xs">
                              <a
                                href={src.source}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary/80 hover:text-primary hover:underline break-all transition-colors"
                              >
                                {src.source}
                              </a>
                            </div>
                          )}
                        </div>
                        {src.sourceType && (
                          <span className="shrink-0 inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground uppercase tracking-wide">
                            {src.sourceType}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};