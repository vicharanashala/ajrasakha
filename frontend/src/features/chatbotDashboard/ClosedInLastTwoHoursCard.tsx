import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { motion } from "framer-motion";
import {
  CircleCheck,
  Clock,
  Gauge,
  Info,
  ListChecks,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/atoms/skeleton";
import CountUp from "react-countup";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/atoms/popover";
import { Button } from "@/components/atoms/button";
import { format } from "date-fns";
import { Calendar } from "@/components/atoms/calendar";
import { useCallback, useState } from "react";
import { QueryCategoryQuestionsModal } from "./components/QueryCategoryQuestionsModal";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

type ClosedInLastTwoHoursCardProps = {
  source?: "both" | "annam" | "whatsapp";
  onSourceChange?: (source: "both" | "annam" | "whatsapp") => void;
  userType: string;
  closedInLastTwoHours: number;
  totalClosed: number;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  /** Callback to notify parent to refresh all related cards in the row */
  onRefresh?: () => void;
  passedInLastTwoHours: number;
  totalPassed: number;
  dynamicClosedInLastTwoHours?: number;
  totalDynamicClosed?: number;
  duplicateClosedInLastTwoHours?: number;
  totalDuplicateClosed?: number;
  userId?: string;
  isMapComponent?: boolean;
  showSourceFilter?: boolean;
};

export function ClosedInLastTwoHoursCard({
  source = "both",
  onSourceChange,
  userType,
  closedInLastTwoHours,
  totalClosed,
  dateRange,
  onDateRangeChange,
  isLoading,
  isFetching,
  onRefresh,
  passedInLastTwoHours,
  totalPassed = 0,
  dynamicClosedInLastTwoHours = 0,
  totalDynamicClosed = 0,
  duplicateClosedInLastTwoHours = 0,
  totalDuplicateClosed = 0,
  userId,
  isMapComponent = false,
  showSourceFilter = true,
}: ClosedInLastTwoHoursCardProps) {
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
  const safeCount = closedInLastTwoHours ?? 0;
  const safeTotalClosed = totalClosed ?? 0;
  const closedWithinTwoHoursPct =
    safeTotalClosed > 0 ? (safeCount / safeTotalClosed) * 100 : 0;
  
  const passedInLastTwoHoursCombined = passedInLastTwoHours + dynamicClosedInLastTwoHours + duplicateClosedInLastTwoHours;
  const totalPassedCombined = totalPassed + totalDynamicClosed + totalDuplicateClosed;
  
  const passedPct =
    totalPassedCombined > 0 ? (passedInLastTwoHoursCombined / totalPassedCombined) * 100 : 0;
  const combinedPct = (safeTotalClosed > 0 && totalPassedCombined > 0)
    ? (closedWithinTwoHoursPct + passedPct) / 2
    : (safeTotalClosed > 0 ? closedWithinTwoHoursPct : passedPct);
  const [closedWithInTwohours, setClosedWithInTowhours] = useState(false);
  const slaBreached =
    safeTotalClosed + totalPassedCombined - safeCount - passedInLastTwoHoursCombined;
  const slaBreachedPct =
    (((safeTotalClosed + totalPassedCombined - safeCount - passedInLastTwoHoursCombined) /
      (safeTotalClosed + totalPassedCombined)) *
    100) || 0;
  // const completedWithInTwoHours = (safeCount || 0) + (passedInLastTwoHoursCombined || 0)

  const [isPassed, setIsPassed] = useState(false);
  const [slaBreachedQs, setSlaBreachedQs] = useState("");

  const infoData = [
    {
      label: "Passed",
      count: passedInLastTwoHours,
      of: totalPassed,
      statusKey: "pass",
      isPassedVal: true,
    },
    {
      label: "Dynamic Closed",
      count: dynamicClosedInLastTwoHours,
      of: totalDynamicClosed,
      statusKey: "dynamic_closed",
      isPassedVal: true,
    },
    {
      label: "Duplicate Closed",
      count: duplicateClosedInLastTwoHours,
      of: totalDuplicateClosed,
      statusKey: "duplicate_closed",
      isPassedVal: true,
    },
  ];

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
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

      <div className="p-5">
        {isLoading || refreshing ? (
          <div className="space-y-5">
            <Skeleton className="h-4 w-40" />
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
                    <Clock className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold tracking-tight text-foreground">
                        Closed within 2 hours
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 cursor-help text-muted-foreground/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs max-w-[220px]">
                            Cases resolved within 2 hours of being opened.
                          </p>
                        </TooltipContent>
                      </Tooltip>
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
                      {safeCount} of {safeTotalClosed} closed cases
                    </span>
                  </div>
                </div>

                {/* Filters */}
                {!isMapComponent && (
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {showSourceFilter && (
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
                  )}

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
                )}
              </div>

              {/* Segmented progress bar */}
              <div className="space-y-1.5">
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${combinedPct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="bg-emerald-500"
                  />
                  {/* <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${passedPct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                    className="bg-sky-500"
                  /> */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${slaBreachedPct}%`,
                    }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                    className="bg-red-500"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {combinedPct.toFixed(1)}% Resolved within SLA (inc. Non-GDB)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    {slaBreachedPct.toFixed(1)}% SLA Breached 
                  </span>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2.5">
                <StatTile
                  label="GDB"
                  count={safeCount}
                  of={safeTotalClosed}
                  accent="emerald"
                  tooltip="Cases closed within 2 hours (GDB)"
                  onClick={() => {
                    setIsPassed(false);
                    setClosedWithInTowhours(true);
                    setSlaBreachedQs("")
                  }}
                  isMapComponent={isMapComponent}
                />
                <StatTile
                  label="Non-GDB"
                  count={passedInLastTwoHoursCombined}
                  of={totalPassedCombined}
                  accent="sky"
                  tooltip="Cases completed within 2 hours (Non-GDB)"
                  onClick={() => {
                    setIsPassed(true);
                    setClosedWithInTowhours(true);
                    setSlaBreachedQs("");
                  }}
                  isMapComponent={isMapComponent}
                  showInfo={true}
                  infoData={infoData}
                  setIsPassed={setIsPassed}
                  setClosedWithInTowhours={setClosedWithInTowhours}
                  setSlaBreachedQs={setSlaBreachedQs}
                />
                <StatTile
                  label="sla breached"
                  count={slaBreached || 0}
                  of={(safeTotalClosed || 0) + (totalPassed || 0)}
                  suffix=""
                  decimals={0}
                  accent="red"
                  tooltip="Questions exceeding 2 hours based on expert working hours. Questions received between 10:00 PM and 6:00 AM start counting from 6:00 AM"
                  onClick={() => {
                    setIsPassed(true);
                    setClosedWithInTowhours(true);
                    setSlaBreachedQs("slabreached")
                  }}
                  isMapComponent={isMapComponent}
                />
              </div>

              {/* Rate footer */}
              <div className="mt-auto flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    Average Combined Rate
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-xs font-semibold tabular-nums text-foreground underline-offset-2 hover:underline ">
                      {combinedPct.toFixed(1)}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="w-64 p-3 z-[9999]">
                    <div className="space-y-2 text-xs ">
                      <div className="font-semibold">
                        Resolution Rate Breakdown
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          GDB in 2h
                        </span>
                        <span className="tabular-nums font-medium text-right">
                          {closedWithinTwoHoursPct.toFixed(1)}% 
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Non-GDB in 2h
                        </span>
                        <span className="tabular-nums font-medium text-right">
                          {passedPct.toFixed(1)}% 
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2 font-medium gap-4">
                        <span>Average Combined Rate</span>
                        <span className="tabular-nums text-right font-semibold">
                          {combinedPct.toFixed(1)}% 
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
      {closedWithInTwohours && (
        <QueryCategoryQuestionsModal
          source={source}
          userType={userType}
          onClose={() => setClosedWithInTowhours(false)}
          closedWithInTwohours={true}
          startDate={dateRange?.from}
          endDate={dateRange?.to}
          isPassed={isPassed}
          tag= {slaBreachedQs ? slaBreachedQs : "sla"}
          closedInLastTwoHours ={(closedInLastTwoHours || 0)}
          passedInLastTwoHours={passedInLastTwoHours || 0}
          dynamicClosedInLastTwoHours={dynamicClosedInLastTwoHours || 0}
          duplicateClosedInLastTwoHours={duplicateClosedInLastTwoHours || 0}
          slaBreached={(slaBreached || 0)}
          userId={userId}
        />
      )}
    </div>
  );
}

const ACCENT = {
  emerald: {
    dot: "bg-emerald-500",
    ring: "group-hover/tile:ring-emerald-500/30",
    glow: "group-hover/tile:shadow-emerald-500/10",
  },
  sky: {
    dot: "bg-sky-500",
    ring: "group-hover/tile:ring-sky-500/30",
    glow: "group-hover/tile:shadow-sky-500/10",
  },
  primary: {
    dot: "bg-primary",
    ring: "group-hover/tile:ring-primary/30",
    glow: "group-hover/tile:shadow-primary/10",
  },
  muted: {
    dot: "bg-muted-foreground/50",
    ring: "group-hover/tile:ring-muted-foreground/20",
    glow: "group-hover/tile:shadow-muted-foreground/5",
  },
  red: {
    dot: "bg-red-500",
    ring: "group-hover/tile:ring-red-500/30",
    glow: "group-hover/tile:shadow-red-500/10",
  },
} as const;

function StatTile({
  label,
  count,
  of,
  suffix,
  decimals,
  accent,
  tooltip,
  onClick,
  isMapComponent,
  showInfo = false,
  infoData,
  setIsPassed,
  setClosedWithInTowhours,
  setSlaBreachedQs,
}: {
  label: string;
  count: number;
  of?: number;
  suffix?: string;
  decimals?: number;
  accent: keyof typeof ACCENT;
  tooltip: string;
  onClick?: () => void;
  isMapComponent?: boolean;
  showInfo?: boolean;
  infoData?: { label: string; count: number; of: number; statusKey: string; isPassedVal: boolean }[];
  setIsPassed?: (val: boolean) => void;
  setClosedWithInTowhours?: (val: boolean) => void;
  setSlaBreachedQs?: (val: string) => void;
}) {
  const a = ACCENT[accent];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          type="button"
          onClick={isMapComponent ? undefined : onClick}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "group/tile relative flex flex-col items-start gap-1.5 overflow-hidden rounded-xl p-3 text-left",
            "bg-background/40 ring-1 ring-border/50 transition-all duration-200",
            "hover:bg-background/80 hover:shadow-md cursor-pointer",
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
          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
            <span className="text-lg font-bold leading-none tracking-tight tabular-nums text-foreground">
              <CountUp
                end={count}
                duration={1.2}
                preserveValue
                decimals={decimals}
                suffix={suffix}
              />
            </span>
            {of !== undefined && (
              <span className="text-[10px] leading-none text-muted-foreground whitespace-nowrap">
                / {of}
              </span>
            )}
          </div>
        </motion.button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className={cn(showInfo ? "min-w-[200px] rounded-lg p-3 z-[9999]" : "z-[9999]")}
      >
        {showInfo && infoData ? (
          <div className="space-y-1.5 text-xs">
            {infoData.map((item) => (
              <div
                key={item.label}
                className="flex justify-between gap-4 cursor-pointer hover:bg-muted/80 p-1 -mx-1 px-1 rounded transition-colors"
                onClick={(e) => {
                  setIsPassed?.(item.isPassedVal);
                  setClosedWithInTowhours?.(true);
                  setSlaBreachedQs?.(item.statusKey);
                  e.stopPropagation();
                }}
              >
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium tabular-nums">
                  {item.count} / {item.of}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs">{tooltip}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
