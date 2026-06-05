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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { CalendarIcon, CheckCircle2, CircleHelp, CircleOff, X, InfoIcon } from "lucide-react";
import { format } from "date-fns";

import type { DateRange } from "react-day-picker";

type CustomerNotificationsCardProps = {
  notified: number;
  notNotified: number;
  untrackedClosedQuestions: number;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoading?: boolean;
};

export function CustomerNotificationsCard({
  notified,
  notNotified,
  untrackedClosedQuestions,
  dateRange,
  onDateRangeChange,
  isLoading,
}: CustomerNotificationsCardProps) {
  const safeNotified = notified ?? 0;
  const safeNotNotified = notNotified ?? 0;
  const safeUntracked = untrackedClosedQuestions ?? 0;
  const totalClosedQuestions = safeNotified + safeNotNotified + safeUntracked;
  const notifiedPct =
    totalClosedQuestions > 0 ? (safeNotified / totalClosedQuestions) * 100 : 0;
  const notNotifiedPct =
    totalClosedQuestions > 0 ? (safeNotNotified / totalClosedQuestions) * 100 : 0;
  const untrackedPct =
    totalClosedQuestions > 0 ? (safeUntracked / totalClosedQuestions) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card
        className="
      border
      border-border
      rounded-2xl
      bg-background/80
      backdrop-blur
      h-fit      
      bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     

    "
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <CardHeader className="pb-4">
          {/* Header */}
          <motion.div
            className="flex items-center justify-between gap-2"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
            <div className="text-sm text-muted-foreground flex-1">
              <div className="flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                Customer Notifications
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help ml-1" />
                  </TooltipTrigger>

                  <TooltipContent className="max-w-[260px]">
                    <p>Notification delivery breakdown for closed questions.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
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
          </motion.div>
          {/* Stats */}
          <motion.div
            className={`mt-5 flex items-center justify-between gap-4 ${isLoading ? "opacity-50" : ""}`}
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.1, delayChildren: 0.2 },
              },
            }}
            initial="hidden"
            animate="visible"
          >
            {/* Notified */}
            <motion.div
              className="flex flex-1 flex-col"
              variants={{
                hidden: { opacity: 0, y: 12, scale: 0.9 },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { type: "spring", stiffness: 300, damping: 24 },
                },
              }}
            >
              <span className="text-xs text-muted-foreground">Notified</span>

              <motion.span
                key={safeNotified}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="
              text-3xl
              font-bold
              tracking-tight
            "
              >
                <CountUp end={safeNotified} duration={1.5} preserveValue />
              </motion.span>
            </motion.div>

            {/* Not Notified */}
            <motion.div
              className="flex flex-1 flex-col"
              variants={{
                hidden: { opacity: 0, y: 12, scale: 0.9 },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { type: "spring", stiffness: 300, damping: 24 },
                },
              }}
            >
              <span className="text-xs text-muted-foreground">
                Not Notified
              </span>

              <motion.span
                key={safeNotNotified}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="
              text-3xl
              font-bold
              tracking-tight
            "
              >
                <CountUp end={safeNotNotified} duration={1.5} preserveValue />
              </motion.span>
            </motion.div>

            {/* Untracked */}
            <motion.div
              className="flex flex-1 flex-col"
              variants={{
                hidden: { opacity: 0, y: 12, scale: 0.9 },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { type: "spring", stiffness: 300, damping: 24 },
                },
              }}
            >
              <span className="text-xs text-muted-foreground">Untracked</span>

              <motion.span
                key={safeUntracked}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="
              text-3xl
              font-bold
              tracking-tight
            "
              >
                <CountUp end={safeUntracked} duration={1.5} preserveValue />
              </motion.span>
            </motion.div>
          </motion.div>
          <div
            className={`mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground ${
              isLoading ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-primary" />
              <span><CountUp end={notifiedPct} duration={1.5} decimals={2} preserveValue />% Notified</span>
            </div>

            <div className="flex items-center gap-1">
              <CircleOff className="h-3 w-3 text-primary" />
              <span><CountUp end={notNotifiedPct} duration={1.5} decimals={2} preserveValue />% Not Notified</span>
            </div>

            <div className="flex items-center gap-1">
              <CircleHelp className="h-3 w-3 text-primary" />
              <span><CountUp end={untrackedPct} duration={1.5} decimals={2} preserveValue />% Untracked</span>
            </div>
          </div>
        </CardHeader>
      </Card>
    </motion.div>
  );
}