import { Card, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
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
import { BadgeCheck, CalendarIcon, X, InfoIcon } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/atoms/skeleton";

type ClosedInLastTwoHoursCardProps = {
  source: string;
  count: number;
  totalClosed: number;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoading?: boolean;
};

export function ClosedInLastTwoHoursCard({
  source,
  count,
  totalClosed,
  dateRange,
  onDateRangeChange,
  isLoading,
}: ClosedInLastTwoHoursCardProps) {
  const safeCount = count ?? 0;
  const safeTotalClosed = totalClosed ?? 0;

  const closedWithinTwoHoursPct =
    safeTotalClosed > 0 ? (safeCount / safeTotalClosed) * 100 : 0;

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
          bg-gradient-to-br
          from-card
          to-card/50
          backdrop-blur-sm
          shadow-sm
          hover:shadow-md
          transition-shadow
          duration-300
        `}
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <CardHeader className="pb-10">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-5 w-40" />

              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>

              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <>
              <motion.div
                className="text-sm text-muted-foreground flex items-center justify-between gap-2 mb-4"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <div className="text-sm text-muted-foreground flex gap-2 items-center">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />

                    <span>Closed within 2 Hours</span>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>

                      <TooltipContent className="max-w-[240px]">
                        <p>
                          Questions closed within 2 hours of creation.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </motion.div>

              <div className="flex items-center justify-between gap-2">
                <motion.div
                  className={`
                    text-3xl
                    font-bold
                    tracking-tight
                    ${isLoading ? "opacity-50" : ""}
                  `}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.4,
                    delay: 0.15,
                    type: "spring",
                    stiffness: 200,
                  }}
                  key={`${safeCount}-${safeTotalClosed}`}
                >
                  <CountUp
                    end={safeCount}
                    duration={1.5}
                    preserveValue
                  />{" "}
                  /{" "}
                  <CountUp
                    end={safeTotalClosed}
                    duration={1.5}
                    preserveValue
                  />
                </motion.div>
              </div>

              <div
                className={`flex items-center gap-2 text-xs text-muted-foreground ${
                  isLoading ? "opacity-50" : ""
                }`}
              >
                <BadgeCheck className="h-4 w-4 text-primary" />

                <span>
                  <span className="font-bold">
                    <CountUp
                      end={closedWithinTwoHoursPct}
                      duration={1.5}
                      decimals={2}
                      preserveValue
                    />
                    %
                  </span>{" "}
                  of questions were resolved within 2 hours
                </span>
              </div>
            </>
          )}
        </CardHeader>
      </Card>
    </motion.div>
  );
}