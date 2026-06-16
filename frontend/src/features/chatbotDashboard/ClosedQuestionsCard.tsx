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
import { CalendarIcon, Clock3, X, InfoIcon, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/atoms/skeleton";
import { useState } from "react";
import { QueryCategoryQuestionsModal } from "./components/QueryCategoryQuestionsModal";

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
  source?: "vicharanashala" | "annam" | "whatsapp"
  userType?: string;
  onRefresh?: () => void;
};

export function ClosedQuestionsCard({
  closedQuestions,
  totalQuestions,
  passedQuestions,
  dateRange,
  onDateRangeChange,
  isLoading,
  isFetching,
  statusBreakup,
  avgCloseTimeMinutes = 0,
  previousMonthAvgCloseTimeMinutes = 0,
  source = "annam",
  userType,
  onRefresh,
}: ClosedQuestionsCardProps) {
  const [status, setStatus] = useState<string | null>(null);

  const handleClick = (status: string) => {
    setStatus(status);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <Card className="border border-border rounded-2xl bg-background/80 h-fit bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <CardHeader className="pb-4">
          {isLoading ? (
            <div className="space-y-4 mt-4">
              <Skeleton className="h-5 w-44" />
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
              <div className="flex gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground flex gap-2 items-center">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                    Question Status
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help ml-1" />
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="min-w-[240px] rounded-xl p-4 max-h-[35vh] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-emerald-700 hover:scrollbar-thumb-emerald-600"
                    >
                      <div className="space-y-2">
                        {Object.entries(statusBreakup?.statuses ?? {}).map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-6">
                            <span className="text-muted-foreground">
                              {key
                                .replace(/[_-]/g, " ")
                                .replace(/\b\w/g, (char) => char.toUpperCase())}
                            </span>
                            <span className="font-medium">{value}</span>
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-7 px-2 text-[11px] font-normal border-border/70 bg-background/80 backdrop-blur-sm shadow-sm hover:bg-muted/40 gap-1 flex items-center shrink-0">
                        <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                        {dateRange?.from ? dateRange.to ? `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd")}` : format(dateRange.from, "MMM dd") : "All Time"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[100]" align="end">
                      <Calendar initialFocus mode="range" defaultMonth={dateRange?.from ?? new Date()} selected={dateRange} onSelect={onDateRangeChange} disabled={{ after: new Date() }} className="pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  {dateRange && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full shrink-0" onClick={() => onDateRangeChange?.(undefined)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className={`mt-5 flex items-center justify-between gap-4 ${isLoading ? "opacity-50" : ""}`}>
                <motion.div className="flex flex-1 flex-col hover:cursor-pointer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} onClick={() => handleClick("all")}>
                  <span className="text-xs text-muted-foreground">Total</span>
                  <motion.span key={totalQuestions ?? 0} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} className="text-3xl font-bold tracking-tight">
                    <CountUp end={totalQuestions ?? 0} duration={1.5} preserveValue />
                  </motion.span>
                </motion.div>
                <motion.div className="flex flex-1 flex-col hover:cursor-pointer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} onClick={() => handleClick("closed")}>
                  <span className="text-xs text-muted-foreground">Closed</span>
                  <motion.span key={closedQuestions ?? 0} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} className="text-3xl font-bold tracking-tight">
                    <CountUp end={closedQuestions ?? 0} duration={1.5} preserveValue />
                  </motion.span>
                </motion.div>
                <motion.div className="flex flex-1 flex-col hover:cursor-pointer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} onClick={() => handleClick("pass")}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.span whileHover={{ scale: 1.05 }} className="text-xs text-muted-foreground cursor-help w-full whitespace-nowrap">
                          Passed
                        </motion.span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>The count of questions with pass status.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <motion.span key={`pass-${passedQuestions ?? 0}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} className="text-3xl font-bold tracking-tight">
                    <CountUp end={Math.max(passedQuestions ?? 0, 0)} duration={1.5} preserveValue />
                  </motion.span>
                </motion.div>
              </div>
              <div className={`mt-3 flex flex-wrap items-center gap-3 ${isLoading ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="h-4 w-4 text-primary" />
                  <span className="font-medium">Average Resolution Time:</span>
                  <span className="font-semibold">{formatDurationFromMinutes(avgCloseTimeMinutes)}</span>
                </div>
              </div>
            </>
          )}
        </CardHeader>
      </Card>
      {status && (
        <QueryCategoryQuestionsModal status={status} source={"both"} userType={userType} onClose={() => setStatus(null)} isQueryCategory={false} startDate={dateRange?.from} endDate={dateRange?.to} />
      )}
    </motion.div>
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