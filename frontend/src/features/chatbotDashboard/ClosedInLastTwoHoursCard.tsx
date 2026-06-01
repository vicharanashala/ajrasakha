import { Card, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { motion } from "framer-motion";
import { Button } from "@/components/atoms/button";
import { Calendar } from "@/components/atoms/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

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
          <motion.div
            className="text-sm text-muted-foreground flex items-center justify-between gap-2 mb-4"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <div className="text-sm text-muted-foreground flex gap-2 items-center">
              <div className="flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                Closed within 2 Hours
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
              {count ?? 0} / {totalClosed ?? 0}
            </motion.div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.span
                    className="
                      flex h-4 w-4 cursor-pointer
                      items-center justify-center
                      rounded-full border text-[10px]
                      "
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  >
                    i
                  </motion.span>
                </TooltipTrigger>

                <TooltipContent className="max-w-[240px]">
                  <p>Questions closed within 2hours</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardHeader>
      </Card>
    </motion.div>
  );
}
