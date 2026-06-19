import { Card, CardHeader } from "@/components/atoms/card";
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
import { Bell, CheckCircle2, InfoIcon, Percent, X } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/atoms/skeleton";
import { useState } from "react";
import { QueryCategoryQuestionsModal } from "./components/QueryCategoryQuestionsModal";
import { getISOStringsForDateRange } from "./utils/dateUtils";
import { cn } from "@/lib/utils";

type CustomerNotificationsCardProps = {
  notified: number;
  notNotified: number;
  untrackedClosedQuestions: number;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  source?: "vicharanashala" | "annam" | "whatsapp";
  userType: string;
  /** Callback to notify parent to refresh all related cards in the row */
  onRefresh?: () => void;
};

export function CustomerNotificationsCard({
  notified,
  notNotified,
  untrackedClosedQuestions,
  dateRange,
  onDateRangeChange,
  isLoading,
  isFetching,
  source = "annam",
  userType,
  onRefresh,
}: CustomerNotificationsCardProps) {
  const normalizedRange = getISOStringsForDateRange(dateRange);
  const safeNotified = notified ?? 0;
  const safeNotNotified = notNotified ?? 0;
  const safeUntracked = untrackedClosedQuestions ?? 0;
  const totalClosedQuestions = safeNotified + safeNotNotified + safeUntracked;
  const notifiedPct = totalClosedQuestions > 0 ? (safeNotified / totalClosedQuestions) * 100 : 0;

  const [notificationType, setNotificationType] = useState<string | null>(null);

  const handleClick = (notification: string) => {
    setNotificationType(notification);
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
        {isLoading ? (
          <div className="space-y-5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="space-y-5">
              {/* Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                    <Bell className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold tracking-tight text-foreground">
                        Customer Notifications
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="h-3 w-3 cursor-help text-muted-foreground/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="text-xs leading-relaxed">
                            Notification delivery breakdown for closed
                            questions.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {totalClosedQuestions.toLocaleString()} closed questions
                    </span>
                  </div>
                </div>

                {/* Filters */}
                <div
                  className="flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full border-border/50 bg-background/60 px-3 text-[11px] font-medium capitalize hover:bg-muted/50"
                      >
                        {source || "All Sources"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-1.5" align="end">
                      <div className="space-y-0.5">
                        {["All Sources", "Annam", "WhatsApp"].map((item) => (
                          <Button
                            key={item}
                            variant="ghost"
                            size="sm"
                            className="h-7 w-full justify-start text-xs"
                          >
                            {item}
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
                    <PopoverContent className="w-auto p-0" align="end">
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

              {/* Segmented progress bar — proportions at a glance */}
              <div className="space-y-1.5">
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${notifiedPct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="bg-emerald-500"
                  />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${totalClosedQuestions > 0 ? (safeNotNotified / totalClosedQuestions) * 100 : 0}%`,
                    }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                    className="bg-amber-500"
                  />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${totalClosedQuestions > 0 ? (safeUntracked / totalClosedQuestions) * 100 : 0}%`,
                    }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                    className="bg-muted-foreground/40"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {notifiedPct.toFixed(1)}% notified
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {totalClosedQuestions > 0 ? ((safeNotNotified / totalClosedQuestions) * 100).toFixed(1) : 0}% not notified
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                    {totalClosedQuestions > 0 ? ((safeUntracked / totalClosedQuestions) * 100).toFixed(1) : 0}% untracked
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2.5">
                <StatTile
                  label="Notified"
                  count={safeNotified}
                  accent="emerald"
                  tooltip="Customers successfully notified"
                  onClick={() => handleClick("notified")}
                />
                <StatTile
                  label="Not Notified"
                  count={safeNotNotified}
                  accent="amber"
                  tooltip="Customers not notified"
                  onClick={() => handleClick("not-notified")}
                />
                <StatTile
                  label="Untracked"
                  count={safeUntracked}
                  accent="muted"
                  tooltip="Questions without notification tracking"
                  onClick={() => handleClick("untracked")}
                />
              </div>

              {/* Notification Success Rate footer */}
              <div className="mt-auto flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    Notification Success Rate
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-xs font-semibold tabular-nums text-foreground underline-offset-2 hover:underline">
                      {notifiedPct.toFixed(1)}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="w-56 p-3">
                    <div className="space-y-2 text-xs">
                      <div className="font-semibold">
                        Notification Rate Breakdown
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Notified</span>
                        <span className="tabular-nums text-emerald-500">
                          {notifiedPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Not Notified</span>
                        <span className="tabular-nums text-amber-500">
                          {totalClosedQuestions > 0 ? ((safeNotNotified / totalClosedQuestions) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Untracked</span>
                        <span className="tabular-nums text-muted-foreground">
                          {totalClosedQuestions > 0 ? ((safeUntracked / totalClosedQuestions) * 100).toFixed(1) : 0}%
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
  muted: {
    dot: "bg-muted-foreground/50",
    glow: "group-hover/tile:shadow-muted-foreground/5",
    ring: "group-hover/tile:ring-muted-foreground/20",
  },
} as const;

function StatTile({
  label,
  count,
  accent,
  tooltip,
  onClick,
}: {
  label: string;
  count: number;
  accent: keyof typeof ACCENT;
  tooltip: string;
  onClick: () => void;
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
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
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

