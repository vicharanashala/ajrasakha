import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { motion } from "framer-motion";
import CountUp from "react-countup";
import { Button } from "@/components/atoms/button";
import { Calendar } from "@/components/atoms/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/atoms/popover";
import { Clock3, X, InfoIcon, ListChecks, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/atoms/skeleton";
import { useCallback, useState } from "react";
import { QueryCategoryQuestionsModal } from "./components/QueryCategoryQuestionsModal";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

type ClosedQuestionsCardProps = {
  closedQuestions: number;
  totalQuestions: number;
  passedQuestions?: number;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  carryForward?: number;
  statusBreakup: any;
  avgCloseTimeMinutes?: number;
  previousMonthAvgCloseTimeMinutes?: number;
  source?: "both" | "annam" | "whatsapp";
  userType?: string;
  onRefresh?: () => void;
  avgPassTimeMinutes?: number;
  combinedCount?: number;
  combinedAvgTime?: number;
  onSourceChange?: (source: "both" | "annam" | "whatsapp") => void;
};

export function ClosedQuestionsCard({
  closedQuestions,
  totalQuestions,
  passedQuestions,
  dateRange,
  onDateRangeChange,
  isLoading,
  statusBreakup,
  avgCloseTimeMinutes = 0,
  avgPassTimeMinutes = 0,
  combinedAvgTime = 0,
  source = "both",
  userType,
  onRefresh,
  onSourceChange,
}: ClosedQuestionsCardProps) {
  const pendingQuestions =
    (totalQuestions || 0) - (closedQuestions || 0) - (passedQuestions || 0);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["closed-notified-data"] });
    setRefreshing(false);
  }, [queryClient]);
  const sourceOptions = [
    { label: "Both", value: "both" },
    { label: "Web Application", value: "annam" },
    { label: "WhatsApp", value: "whatsapp" },
  ] as const;
  const [sourcePopoverOpen, setSourcePopoverOpen] = useState(false);
  const [isPassed, setIsPassed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const handleClick = (statusValue: string) => {
    setStatus(statusValue);
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl",
        "bg-gradient-to-br from-card via-card to-card/40",
        "ring-1 ring-border/60 transition-all duration-300",
        "hover:ring-border hover:shadow-lg hover:shadow-primary/5",
      )}
    >
      {/* Decorative top accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="p-5">
        {isLoading || refreshing ? (
          <div className="space-y-5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
            <Skeleton className="h-4 w-48" />
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="space-y-5">
              {/* Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                    <ListChecks className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold tracking-tight text-foreground">
                        Question Status
                      </span>
                      <button
                        onClick={handleRefresh}
                        className=" rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
                        title="Refresh"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 bg-background ${
                            refreshing ? "animate-spin" : ""
                          }`}
                        />
                      </button>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {(totalQuestions ?? 0).toLocaleString()} total questions
                    </span>
                  </div>
                </div>

                {/* Filters */}
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Popover
                    open={sourcePopoverOpen}
                    onOpenChange={setSourcePopoverOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full border-border/50 bg-background/60 px-3 text-[11px] font-medium capitalize hover:bg-muted/50"
                      >
                        {sourceOptions.find((s) => s.value === source)?.label ??
                          "Both"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-1.5 z-[100]" align="end">
                      <div className="space-y-0.5">
                        {sourceOptions.map((item) => (
                          <Button
                            key={item.value}
                            variant={
                              source === item.value ? "secondary" : "ghost"
                            }
                            size="sm"
                            className="h-7 w-full justify-start text-xs"
                            onClick={() => {
                              onSourceChange?.(item.value);
                              setSourcePopoverOpen(false);
                            }}
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full border-border/50 bg-background/60 px-3 text-[11px] font-medium hover:bg-muted/50"
                      >
                        {dateRange?.from
                          ? dateRange.to
                            ? `${format(dateRange.from, "MMM dd")} – ${format(dateRange.to, "MMM dd")}`
                            : format(dateRange.from, "MMM dd")
                          : "All Time"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[100]" align="end">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from ?? new Date()}
                        selected={dateRange}
                        onSelect={onDateRangeChange}
                        disabled={{ after: new Date() }}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>

                  {dateRange && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => onDateRangeChange?.(undefined)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Segmented progress — closed vs passed vs open */}
              {(() => {
                const total = Math.max(totalQuestions ?? 0, 1);
                const closedPct = ((closedQuestions ?? 0) / total) * 100;
                const passedPct =
                  (Math.max(passedQuestions ?? 0, 0) / total) * 100;
                const openPct = Math.max(100 - closedPct - passedPct, 0);
                // const pendingPct = Math.max(100 - pens)
                return (
                  <div className="space-y-1.5">
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${closedPct}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="bg-sky-500"
                      />
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${passedPct}%` }}
                        transition={{
                          duration: 0.8,
                          ease: "easeOut",
                          delay: 0.1,
                        }}
                        className="bg-emerald-500"
                      />
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${openPct}%` }}
                        transition={{
                          duration: 0.8,
                          ease: "easeOut",
                          delay: 0.2,
                        }}
                        className="bg-muted-foreground/30"
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                        {closedPct.toFixed(1)}% closed
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {passedPct.toFixed(1)}% passed
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                        {openPct.toFixed(1)}% others
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-2.5">
                <StatTile
                  label="Total"
                  count={totalQuestions ?? 0}
                  accent="primary"
                  tooltip="All questions in range"
                  onClick={() => {
                    handleClick("all");
                  }}
                />
                <StatTile
                  label="Closed"
                  count={closedQuestions ?? 0}
                  accent="sky"
                  tooltip="Closed questions"
                  onClick={() => {
                    setIsPassed(false);
                    handleClick("closed");
                  }}
                />
                <StatTile
                  label="Passed"
                  count={Math.max(passedQuestions ?? 0, 0)}
                  accent="emerald"
                  tooltip="Questions with pass status"
                  onClick={() => {
                    setIsPassed(true);
                    handleClick("pass");
                  }}
                />
                <StatTile
                  label="Others"
                  count={Math.max(pendingQuestions ?? 0, 0)}
                  accent="muted"
                  tooltip="Questions neither closed nor passed"
                  onClick={() => {
                    setIsPassed(true);
                    handleClick("pending");
                  }}
                  showInfo={true}
                  statusBreakup={statusBreakup}
                  setIsPassed={setIsPassed}
                  handleClick={handleClick}
                />
              </div>

              {/* Avg Resolution footer */}
              <div className="mt-auto flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    Avg Resolution
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-xs font-semibold tabular-nums text-foreground underline-offset-2 hover:underline">
                      {formatDurationFromMinutes(combinedAvgTime)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="w-56 p-3">
                    <div className="space-y-2 text-xs">
                      <div className="font-semibold">
                        Resolution Time Breakdown
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Closed</span>
                        <span className="tabular-nums">
                          {formatDurationFromMinutes(avgCloseTimeMinutes)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Passed</span>
                        <span className="tabular-nums">
                          {formatDurationFromMinutes(avgPassTimeMinutes)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2 font-medium">
                        <span>Combined</span>
                        <span className="tabular-nums">
                          {formatDurationFromMinutes(combinedAvgTime)}
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
      {status && (
        <QueryCategoryQuestionsModal
          status={status}
          source={source}
          userType={userType}
          startDate={dateRange?.from}
          endDate={dateRange?.to}
          isPassed={isPassed}
          onClose={() => {
            setStatus(null);
            setIsPassed(false);
          }}
          tag="closed"
        />
      )}
    </div>
  );
}

const ACCENT = {
  primary: {
    dot: "bg-primary",
    ring: "group-hover/tile:ring-primary/30",
    glow: "group-hover/tile:shadow-primary/10",
  },
  sky: {
    dot: "bg-sky-500",
    ring: "group-hover/tile:ring-sky-500/30",
    glow: "group-hover/tile:shadow-sky-500/10",
  },
  emerald: {
    dot: "bg-emerald-500",
    ring: "group-hover/tile:ring-emerald-500/30",
    glow: "group-hover/tile:shadow-emerald-500/10",
  },
  amber: {
    dot: "bg-amber-500",
    ring: "group-hover/tile:ring-amber-500/30",
    glow: "group-hover/tile:shadow-amber-500/10",
  },
  muted: {
    dot: "bg-muted-foreground/50",
    ring: "group-hover/tile:ring-muted-foreground/20",
    glow: "group-hover/tile:shadow-muted-foreground/5",
  },
} as const;

function StatTile({
  label,
  count,
  accent,
  tooltip,
  onClick,
  showInfo = false,
  statusBreakup,
  setIsPassed,
  handleClick,
}: {
  label: string;
  count: number;
  accent: keyof typeof ACCENT;
  tooltip: string;
  onClick?: () => void;
  showInfo?: boolean;
  statusBreakup?: any;
  setIsPassed?: (value: boolean) => void;
  handleClick?: (status: string) => void;
}) {
  const a = ACCENT[accent];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          type="button"
          onClick={onClick}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
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
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-center gap-1">
              {label}

              {showInfo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-3 w-3 cursor-help text-muted-foreground/60" />
                  </TooltipTrigger>

                  <TooltipContent
                    side="top"
                    className="min-w-[200px] rounded-lg p-3"
                  >
                    <div className="space-y-1.5 text-xs">
                      {Object.entries(statusBreakup?.statuses ?? {})
                        .filter(([key, value]) => {
                          return key !== "pass" && key !== "closed"
                        })
                        .map(([key, value]) => (
                          <div
                            key={key}
                            className="flex justify-between gap-4 cursor-pointer hover:bg-muted/80 p-1 -mx-1 px-1 rounded transition-colors"
                            onClick={(e) => {
                              setIsPassed?.(key === "pass");
                              handleClick?.(key);
                              e.stopPropagation();
                            }}
                          >
                            <span className="text-muted-foreground">
                              {key
                                .replace(/[_-]/g, " ")
                                .replace(/\b\w/g, (c) => c.toUpperCase())}
                            </span>

                            <span className="font-medium">{String(value)}</span>
                          </div>
                        ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </span>
          </div>
          <span className="text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground">
            <CountUp end={count} duration={1.2} preserveValue />
          </span>
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const formatDurationFromMinutes = (mins: number): string => {
  if (!mins || mins <= 0) return "0m";
  const totalMinutes = Math.round(mins);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};
