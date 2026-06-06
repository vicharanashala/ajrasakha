import { Card, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { motion } from "framer-motion";
import { BadgeCheck, InfoIcon, RefreshCw } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/atoms/skeleton";
import CountUp from "react-countup";
import { useQueryClient } from "@tanstack/react-query";


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

  const queryClient = useQueryClient();
  const handleRefresh = async ()=>{
    await queryClient.refetchQueries({ queryKey: ["closed-notified-data"] });
  }

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
                className="absolute top-6 right-7 z-20 rounded-lg border border-gray-200/60 p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white hover:shadow-md dark:border-[#333]"
                title="Refresh"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-gray-600 dark:text-gray-300 ${
                    isLoading ? "animate-spin" : ""
                  }`}
                />
              </button>
                <div className="text-sm text-muted-foreground flex gap-2 items-center">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                    Closed within 2 Hours
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help ml-1" />
                      </TooltipTrigger>

                      <TooltipContent className="max-w-[240px]">
                        <p>Questions closed within 2 hours of creation.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </motion.div>

              <div
                className="
              flex
              items-center
              justify-between
              gap-2
              "
              >
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
                  key={`${count ?? 0}-${totalClosed ?? 0}`}
                >
                  <CountUp
                    end={safeCount ?? 0}
                    duration={1.5}
                    preserveValue
                  />{" "}
                  /{" "}
                  <CountUp
                    end={safeTotalClosed ?? 0}
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
                    {closedWithinTwoHoursPct.toFixed(2)}%
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