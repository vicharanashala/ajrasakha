import { Card, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

type ClosedQuestionsCardProps = {
  closedQuestions: number;
  totalQuestions: number;
};

export function ClosedQuestionsCard({
  closedQuestions,
  totalQuestions,
}: ClosedQuestionsCardProps) {
  const openQuestions =
    totalQuestions - closedQuestions;

  return (
    <Card
      className="
        border
        border-border
        rounded-2xl
        bg-background/80
        backdrop-blur
        h-fit      
        "
    >
      <CardHeader className="pb-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Question Status
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="
                    flex h-4 w-4 cursor-pointer
                    items-center justify-center
                    rounded-full border text-[10px]
                  "
                >
                  i
                </span>
              </TooltipTrigger>

              <TooltipContent className="max-w-[260px]">
                <p>
                  Distribution of total, closed, and open
                  questions.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Stats */}
        <div className="mt-5 flex items-center justify-between gap-4">
          {/* Total */}
          <div className="flex flex-1 flex-col">
            <span className="text-xs text-muted-foreground">
              Total
            </span>

            <span
              className="
                text-3xl
                font-bold
                tracking-tight
              "
            >
              {totalQuestions}
            </span>
          </div>

          {/* Closed */}
          <div className="flex flex-1 flex-col">
            <span className="text-xs text-muted-foreground">
              Closed
            </span>

            <span
              className="
                text-3xl
                font-bold
                tracking-tight
              "
            >
              {closedQuestions}
            </span>
          </div>

          {/* Open */}
          <div className="flex flex-1 flex-col">
            <span className="text-xs text-muted-foreground">
              Open
            </span>

            <span
              className="
                text-3xl
                font-bold
                tracking-tight
              "
            >
              {Math.max(openQuestions, 0)}
            </span>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}