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

type ClosedQuestionsCardProps = {
  closedQuestions: number;
  totalQuestions: number;
  inReview: number;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoading?: boolean;
};

export function ClosedQuestionsCard({
  closedQuestions,
  totalQuestions,
  inReview,
  dateRange,
  onDateRangeChange,
  isLoading,
}: ClosedQuestionsCardProps) {
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
          backdrop-blur
          h-fit
          bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     

        "
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <CardHeader className="pb-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                Question Status
              </div>
            </div>

            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-7 px-2 text-[11px] font-normal border-border/70 bg-background/80 backdrop-blur-sm shadow-sm hover:bg-muted/40 gap-1 flex items-center shrink-0"
                  >
                    <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd")}`
                      ) : (
                        format(dateRange.from, "MMM dd")
                      )
                    ) : (
                      "All Time"
                    )}
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

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.span
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.92 }}
                      className="
                        flex h-4 w-4 cursor-pointer
                        items-center justify-center
                        rounded-full border text-[10px]
                      "
                    >
                      i
                    </motion.span>
                  </TooltipTrigger>

                  <TooltipContent className="max-w-[260px]">
                    <p>Distribution of total, closed, and in-review questions.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
                {totalQuestions ?? 0}
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
                {closedQuestions ?? 0}
              </motion.span>
            </motion.div>

            {/* in-review */}
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
                      className="text-xs text-muted-foreground cursor-help w-fit"
                    >
                      In review
                    </motion.span>
                  </TooltipTrigger>

                  <TooltipContent>
                    <p>The count of questions that are not yet closed.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <motion.span
                key={Math.max(inReview ?? 0, 0)}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="
                  text-3xl
                  font-bold
                  tracking-tight
                "
              >
                {Math.max(inReview ?? 0, 0)}
              </motion.span>
            </motion.div>
          </motion.div>
        </CardHeader>
      </Card>
    </motion.div>
  );
}