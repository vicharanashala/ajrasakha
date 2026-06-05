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
import { Skeleton } from "@/components/atoms/skeleton";

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
{/* Stats */}
<motion.div
  className={`mt-5 flex items-center justify-between gap-4 ${
    isLoading ? "opacity-50" : ""
  }`}
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
      <CountUp
        end={totalQuestions ?? 0}
        duration={1.5}
        preserveValue
      />
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
      <CountUp
        end={closedQuestions ?? 0}
        duration={1.5}
        preserveValue
      />
    </motion.span>
  </motion.div>

  {/* In Review / Carry Forward */}
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
            <p>
              The count of questions that are currently in review by the
              moderators.
            </p>
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
        end={
          isTodaySelected
            ? Math.max(carryForward ?? 0, 0)
            : Math.max(inReview ?? 0, 0)
        }
        duration={1.5}
        preserveValue
      />
    </motion.span>
  </motion.div>
</motion.div>

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
