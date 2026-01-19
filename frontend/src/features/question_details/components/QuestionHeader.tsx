import type { IQuestionFullData } from "@/types";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { TimerDisplay } from "@/components/timer-display";
import { formatDate } from "@/utils/formatDate";
import { useCountdown } from "@/hooks/ui/useCountdown";

interface QuestionHeaderProps {
  question: IQuestionFullData;
  goBack: () => void;
}

export const QuestionHeader = ({ question, goBack }: QuestionHeaderProps) => {
  const timer = useCountdown(question.createdAt!, 4, () => {});

  return (
    <header className="grid gap-3 w-full">
      {/* Title + Timer + Exit */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-semibold text-pretty break-words flex-1">
          {question.question}
        </h1>

        <div className="flex sm:flex-row flex-col sm:items-center items-end gap-3 sm:gap-6">
          <TimerDisplay timer={timer} status={question.status} size="lg" />

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="inline-flex items-center justify-center gap-1 whitespace-nowrap p-2"
              onClick={goBack}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
              <span className="leading-none">Exit</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Status + Priority + Total answers */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={
            question.status === "in-review"
              ? "bg-green-500/10 text-green-600 border-green-500/30"
              : question.status === "open"
                ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                : question.status === "closed"
                  ? "bg-gray-500/10 text-gray-600 border-gray-500/30"
                  : "bg-muted text-foreground"
          }
        >
          {question.status.replace("_", " ")}
        </Badge>

        <Badge
          className={
            question.priority === "high"
              ? "bg-red-500/10 text-red-600 border-red-500/30"
              : question.priority === "medium"
                ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                : question.priority === "low"
                  ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                  : "bg-muted text-foreground"
          }
        >
          {question.priority ? question.priority.toUpperCase() : "NIL"}
        </Badge>

        <span className="text-sm text-muted-foreground whitespace-nowrap">
          Total answers: {question.totalAnswersCount}
        </span>
      </div>

      {/* Created / Updated */}
      <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
        <span>Created: {formatDate(new Date(question.createdAt))}</span>
        <span>•</span>
        <span>Updated: {formatDate(new Date(question.updatedAt))}</span>
      </div>
    </header>
  );
};
