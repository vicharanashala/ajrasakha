import { useCallback, useRef } from "react";
import { List, Search } from "lucide-react";
import { Input } from "@/components/atoms/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ClosedAnswersFilters } from "./ClosedAnswersFilters";
import { cn } from "@/lib/utils";
import type { ClosedAnswer, ClosedAnswerFilters } from "@/types";

/** Full-screen browse view of the loaded answers, for picking one quickly. */
export const ClosedAnswersListDialog = ({
  open,
  onOpenChange,
  answers,
  totalAnswers,
  selectedAnswerId,
  onSelect,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  formatClosedAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  answers: ClosedAnswer[];
  totalAnswers: number;
  selectedAnswerId?: string | null;
  onSelect: (answerId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filters: ClosedAnswerFilters;
  onFiltersChange: (next: ClosedAnswerFilters) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  formatClosedAt: (value?: string, isTimeNeeded?: boolean) => string;
}) => {
  const observer = useRef<IntersectionObserver | null>(null);

  // Loads the next page once the sentinel at the end of the dialog list is reached.
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          onLoadMore();
        }
      });

      if (node) observer.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, onLoadMore],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[88vh] w-[95vw] flex-col overflow-hidden sm:max-w-4xl">
      <DialogHeader className="shrink-0 border-b pb-3">
        <DialogTitle className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <List className="h-4 w-4" />
          </span>
          All answers
        </DialogTitle>
        <DialogDescription>
          {answers.length.toLocaleString()} of {totalAnswers.toLocaleString()} loaded
          — pick one to work on its sources.
        </DialogDescription>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search question, answer or paste an ID..."
              className="pl-8"
            />
          </div>
          <ClosedAnswersFilters filters={filters} onChange={onFiltersChange} />
        </div>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {answers.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No answers match this search.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {answers.map((answer) => {
              const sourceCount = answer.sources?.length ?? 0;
              const isActive = answer._id === selectedAnswerId;

              return (
                <button
                  key={answer._id}
                  type="button"
                  aria-current={isActive}
                  onClick={() => {
                    onSelect(answer._id);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-3 border-b border-l-2 border-b-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0",
                    isActive
                      ? "border-l-primary bg-primary/10"
                      : "border-l-transparent hover:bg-accent/60",
                  )}
                >
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                    {answer.question?.text || "Question text unavailable"}
                  </span>
                  <span
                    className={cn(
                      "w-24 shrink-0 text-right text-xs",
                      sourceCount > 0
                        ? "text-muted-foreground"
                        : "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {sourceCount > 0
                      ? `${sourceCount} source${sourceCount > 1 ? "s" : ""}`
                      : "No sources"}
                  </span>
                  <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                    {formatClosedAt(
                      answer.question?.closedAt ?? answer.updatedAt,
                      false,
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div
          ref={loadMoreRef}
          className="flex items-center justify-center py-4 text-xs text-muted-foreground"
        >
          {isFetchingNextPage
            ? "Loading more answers..."
            : hasNextPage
              ? ""
              : answers.length > 0
                ? `All ${totalAnswers.toLocaleString()} answers loaded`
                : ""}
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
};
