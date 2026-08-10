import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { motion } from "framer-motion";
import CountUp from "react-countup";
import { Database, InfoIcon, Percent, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/atoms/skeleton";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

type DatasetQuestionsFeedbackCardProps = {
  totalQuestions?: number;
  totalFeedbacks?: number;
  totalUsers?: number;
  isLoading?: boolean;
};

export function DatasetQuestionsFeedbackCard({
  totalQuestions,
  totalFeedbacks,
  totalUsers,
  isLoading,
}: DatasetQuestionsFeedbackCardProps) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["dataset-totals"] });
    setRefreshing(false);
  }, [queryClient]);

  const safeQuestions = totalQuestions ?? 0;
  const safeFeedbacks = totalFeedbacks ?? 0;
  const safeUsers = totalUsers ?? 0;
  const feedbackPct =
    safeQuestions > 0 ? (safeFeedbacks / safeQuestions) * 100 : 0;

  return (
    <div
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-2xl",
        "bg-gradient-to-br from-card via-card to-card/40",
        "ring-1 ring-border/60 transition-all duration-300",
        "hover:ring-border hover:shadow-lg hover:shadow-primary/5",
      )}
    >
      {/* Decorative top accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="flex flex-1 flex-col p-5">
        {isLoading || refreshing ? (
          <div className="space-y-5">
            <Skeleton className="h-4 w-44" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="flex flex-1 flex-col justify-between space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                    <Database className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold tracking-tight text-foreground">
                        Dataset Questions and Feedback Metrics
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="h-3 w-3 cursor-help text-muted-foreground/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="text-xs leading-relaxed">
                            All-time dataset totals across questions asked,
                            feedback received, and registered users.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      All-time totals
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleRefresh}
                  className="rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
                  title="Refresh"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 bg-background ${
                      refreshing ? "animate-spin" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2.5">
                <StatTile
                  label="Total Questions"
                  count={safeQuestions}
                  accent="emerald"
                  tooltip="Total number of questions asked"
                />
                <StatTile
                  label="Total Feedbacks"
                  count={safeFeedbacks}
                  accent="amber"
                  tooltip="Total number of feedbacks received"
                />
                <StatTile
                  label="Total Users"
                  count={safeUsers}
                  accent="blue"
                  tooltip="Total number of users"
                />
              </div>

              {/* Feedback Rate footer */}
              <div className="mt-auto flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    Feedback Rate (of Questions)
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-xs font-semibold tabular-nums text-foreground underline-offset-2 hover:underline">
                      {feedbackPct.toFixed(1)}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="w-64 p-3">
                    <div className="space-y-1 text-xs">
                      <div className="font-semibold">
                        Feedback Rate Breakdown
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Feedbacks / Questions
                        </span>
                        <span className="tabular-nums text-foreground font-medium">
                          {safeFeedbacks.toLocaleString()}/
                          {safeQuestions.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

const ACCENT = {
  emerald: {
    dot: "bg-emerald-500",
    glow: "group-hover/tile:shadow-emerald-500/10",
    ring: "group-hover/tile:ring-emerald-500/30",
  },
  amber: {
    dot: "bg-amber-500",
    glow: "group-hover/tile:shadow-amber-500/10",
    ring: "group-hover/tile:ring-amber-500/30",
  },
  blue: {
    dot: "bg-blue-500",
    glow: "group-hover/tile:shadow-blue-500/10",
    ring: "group-hover/tile:ring-blue-500/30",
  },
} as const;

function StatTile({
  label,
  count,
  accent,
  tooltip,
}: {
  label: string;
  count: number;
  accent: keyof typeof ACCENT;
  tooltip: string;
}) {
  const a = ACCENT[accent];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "group/tile relative flex flex-col items-start gap-1.5 overflow-hidden rounded-xl p-3 text-left",
            "bg-background/40 ring-1 ring-border/50 transition-all duration-200",
            "hover:bg-background/80 hover:shadow-md",
            a.ring,
            a.glow,
          )}
        >
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", a.dot)} />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          </div>
          <span className="text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground">
            <CountUp end={count} duration={1.2} preserveValue />
          </span>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
