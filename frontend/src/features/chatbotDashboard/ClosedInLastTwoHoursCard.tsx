import { Card, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { motion } from "framer-motion";
import { BadgeCheck, CalendarIcon, InfoIcon, RefreshCw, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/atoms/skeleton";
import CountUp from "react-countup";
import { useQueryClient } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/atoms/popover";
import { Button } from "@/components/atoms/button";
import { format } from "date-fns";
import { Calendar } from "@/components/atoms/calendar";
import { useState } from "react";
import { QueryCategoryQuestionsModal } from "./components/QueryCategoryQuestionsModal";

type ClosedInLastTwoHoursCardProps = {
  source?: "vicharanashala" | "annam" | "whatsapp";
  userType: string;
  count: number;
  totalClosed: number;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  /** Callback to notify parent to refresh all related cards in the row */
  onRefresh?: () => void;
};

export function ClosedInLastTwoHoursCard({
  source = "annam",
  userType,
  count,
  totalClosed,
  dateRange,
  onDateRangeChange,
  isLoading,
  isFetching,
  onRefresh,
}: ClosedInLastTwoHoursCardProps) {
  const isRefreshing = isLoading || isFetching;
  const safeCount = count ?? 0;
  const safeTotalClosed = totalClosed ?? 0;
  const closedWithinTwoHoursPct =
    safeTotalClosed > 0 ? (safeCount / safeTotalClosed) * 100 : 0;
  const [closedWithInTwohours, setClosedWithInTowhours] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const handleRefresh = async () => {
    setRefreshing(true);
    // Notify parent to refresh all related cards
    onRefresh?.();
    // Also invalidate the base query key as fallback
    await queryClient.invalidateQueries({ queryKey: ["closed-notified-data"] });
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleClick = () => {
    setClosedWithInTowhours(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <Card
        className={`
          border
          border-border
          rounded-2xl
          h-full
          ${source === "whatsapp" ? "pb-2" : "pb-5"}
          bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     
          `}
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <CardHeader className="pb-10">
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
                {/* <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-24" /> */}
              </div>
            </div>
          ) : (
          <>
            <motion.div
              className="text-sm text-muted-foreground flex items-center justify-between gap-2 mb-4"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <button
                onClick={handleRefresh}
                className="absolute top-1 right-1 z-20 rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
                title="Refresh"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 bg-background  text-black dark:text-white ${
                    isLoading || refreshing || isFetching ? "animate-spin" : ""
                  }`}
                />
              </button>
              <div className="text-sm text-muted-foreground flex gap-2 items-center">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                  Closed within 2 Hours
                </div>
                <div
                  className="flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-7 px-2 text-[11px] font-normal border-border/70 bg-background/80 backdrop-blur-sm shadow-sm hover:bg-muted/40 gap-1 flex items-center shrink-0"
                      >
                        <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                        {dateRange?.from
                          ? dateRange.to
                            ? `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd")}`
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
                      className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full shrink-0"
                      onClick={() => onDateRangeChange?.(undefined)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <motion.div
                  className={`text-3xl font-bold tracking-tight ${
                    isLoading ? "opacity-50" : ""
                  } hover:cursor-pointer`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.4,
                    delay: 0.15,
                    type: "spring",
                    stiffness: 200,
                  }}
                  key={`${count ?? 0}-${totalClosed ?? 0}`}
                  onClick={handleClick}
                >
                  <CountUp end={safeCount ?? 0} duration={1.5} preserveValue />{" "}
                  /{" "}
                  <CountUp end={safeTotalClosed ?? 0} duration={1.5} preserveValue />
                </motion.div>

                <div
                  className={`flex items-center gap-2 text-xs text-muted-foreground ${
                    isLoading ? "opacity-50" : ""
                  }`}
                >
                  <BadgeCheck className="h-4 w-4 text-primary" />
                  <span>Questions closed within 2 hours of creation</span>
                </div>
              </div>

              {/* Percentage circle */}
            <motion.div
              className={`group flex-shrink-0 h-18 w-18 pt-2 rounded-full border-2 flex flex-col items-center justify-center gap-0 cursor-pointer select-none shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg border-gray-200/80 bg-white dark:border-[#2a2a2a] dark:bg-gradient-to-br dark:from-[#1a1a1a] dark:to-[#161616] ${
                isLoading ? "opacity-50" : ""
              }`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.4, delay: 0.2, type: "spring", stiffness: 200 }}
              key={closedWithinTwoHoursPct}
            >
              <motion.span
                className="text-sm font-bold leading-none text-gray-900 dark:text-white"
                transition={{ duration: 0.4, type: "spring" }}
                key={closedWithinTwoHoursPct}
              >
                <CountUp
                  end={closedWithinTwoHoursPct}
                  decimals={1}
                  duration={0.8}
                  suffix="%"
                  preserveValue
                />
              </motion.span>
              <span className="text-[9px] mt-0.5 text-gray-500 dark:text-white/60">
                rate
              </span>
            </motion.div>

            </div>
          </>
          )}
        </CardHeader>
      </Card>
      {closedWithInTwohours && (
        <QueryCategoryQuestionsModal
          source={source}
          userType={userType}
          onClose={() => setClosedWithInTowhours(false)}
          closedWithInTwohours={closedWithInTwohours}
          startDate={dateRange?.from}
          endDate={dateRange?.to}
        />
      )}
    </motion.div>
  );
}
