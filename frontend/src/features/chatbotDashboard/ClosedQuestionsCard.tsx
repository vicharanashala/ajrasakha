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
import { CalendarIcon, Clock3, X, InfoIcon } from "lucide-react";
import { format, isSameDay } from "date-fns";
import type { DateRange } from "react-day-picker";

type ClosedQuestionsCardProps = {
  closedQuestions: number;
  totalQuestions: number;
  inReview: number;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoading?: boolean;
  carryForward: number;
  statusBreakup: any;
  avgCloseTimeMinutes?: number;
  previousMonthAvgCloseTimeMinutes?: number;
};

export function ClosedQuestionsCard({
  closedQuestions,
  totalQuestions,
  inReview,
  dateRange,
  onDateRangeChange,
  isLoading,
  carryForward,
  statusBreakup,
  avgCloseTimeMinutes = 0,
  previousMonthAvgCloseTimeMinutes = 0,
}: ClosedQuestionsCardProps) {
  const today = new Date();

  const isTodaySelected = Boolean(
    dateRange?.from &&
    dateRange?.to &&
    isSameDay(dateRange.from, today) &&
    isSameDay(dateRange.to, today),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <Card
        className="
          border
          border-border
          rounded-2xl
          bg-background/80
          h-fit
          bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     

        "
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <CardHeader className="pb-4">
          {/* Header */}
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
                    className="
                        min-w-[240px]
                        rounded-xl
                        p-4
                        max-h-[35vh]
                        overflow-y-auto
                        scrollbar-thin
                        scrollbar-track-transparent
                        scrollbar-thumb-emerald-700
                        hover:scrollbar-thumb-emerald-600
                      "
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Total Questions opened
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.totalQuestions}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions closed
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.closedQuestions}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions Delayed
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.delayed}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions in draft
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.draft}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Duplicate Questions
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.duplicate}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions in hold
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.hold}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions in Review
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.inReview}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions open
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.open}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions paeSubmitted
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.paeSubmitted}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions pass
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.pass}
                        </span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Questions rerouted
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.rerouted}
                        </span>
                      </div>

                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">
                          Non agri Questions
                        </span>

                        <span className="font-medium">
                          {statusBreakup?.nonAgri}
                        </span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
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

          {/* Stats */}
          <motion.div
            className={`mt-5 flex items-center justify-between gap-4 ${isLoading ? "opacity-50" : ""}`}
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.1,
                },
              },
            }}
          >
            {/* Total */}
            <motion.div
              className="flex flex-1 flex-col"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <span className="text-xs text-muted-foreground">Total</span>

              <motion.span
                key={totalQuestions ?? 0}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="
                  text-3xl
                  font-bold
                  tracking-tight
                "
              >
                <CountUp end={totalQuestions ?? 0} duration={1.5} preserveValue />
              </motion.span>
            </motion.div>

            {/* Closed */}
            <motion.div
              className="flex flex-1 flex-col"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <span className="text-xs text-muted-foreground">Closed</span>

              <motion.span
                key={closedQuestions ?? 0}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="
                  text-3xl
                  font-bold
                  tracking-tight
                "
              >
                <CountUp end={closedQuestions ?? 0} duration={1.5} preserveValue />
              </motion.span>
            </motion.div>

            <motion.div
              className="flex flex-1 flex-col"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.span
                      whileHover={{ scale: 1.05 }}
                      className="text-xs text-muted-foreground cursor-help w-full whitespace-nowrap"
                    >
                      {isTodaySelected ? "Carry Forward" : "In review"}
                    </motion.span>
                  </TooltipTrigger>

                  <TooltipContent>
                    {isTodaySelected ? (
                      <p>
                        The questions that were carry forwarded from last day
                        (10:30 PM to 12:00 AM)
                      </p>
                    ) : (
                      <p>The count of questions that are currently in review by the moderators.</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <motion.span
                key={
                  isTodaySelected
                    ? `cf-${carryForward ?? 0}`
                    : `ir-${inReview ?? 0}`
                }
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="
                  text-3xl
                  font-bold
                  tracking-tight
                "
              >
                <CountUp
                  end={isTodaySelected
                    ? Math.max(carryForward ?? 0, 0)
                    : Math.max(inReview ?? 0, 0)}
                  duration={1.5}
                  preserveValue
                />
              </motion.span>
            </motion.div>
          </motion.div>

          {/* <div className={`mt-3 text-xs text-muted-foreground ${isLoading ? "opacity-50" : ""}`}>
            Average time to close a question: {formatDurationFromMinutes(avgCloseTimeMinutes)}
            <span className="ml-4">
              Previous month: {formatDurationFromMinutes(previousMonthAvgCloseTimeMinutes)}
            </span>
          </div> */}
          <div
            className={`mt-3 flex flex-wrap items-center gap-3 ${
              isLoading ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="h-4 w-4 text-primary" />
              <span className="font-medium">Average Resolution Time:</span>
              <span className="font-semibold">
                {formatDurationFromMinutes(avgCloseTimeMinutes)}
              </span>
            </div>
          </div>

          {/* <div className="flex items-center gap-1 text-sm text-foreground">
            <span className="font-medium">Previous Month:</span>
            <span className="font-semibold">
              {formatDurationFromMinutes(previousMonthAvgCloseTimeMinutes)}
            </span>
          </div> */}
        </CardHeader>
      </Card>
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
