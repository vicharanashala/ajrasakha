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

const parseInputDateToLocalDate = (value?: string): Date => {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const todayAsInputDate = (now: Date = new Date()) => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type ClosedInLastTwoHoursCardProps = {
  count: number;
  totalClosed: number;
  selectedDate?: string;
  onSelectedDateChange?: (date?: string) => void;
  isLoading?: boolean;
};

export function ClosedInLastTwoHoursCard({
  count,
  totalClosed,
  selectedDate,
  onSelectedDateChange,
  isLoading,
}: ClosedInLastTwoHoursCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <Card
        className="
          border
          border-border
          rounded-2xl
          h-fit 
          pb-7
          bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     
          "
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <CardHeader className="pb-10">
          <motion.div
            className="text-sm text-muted-foreground flex items-center justify-between gap-2 mb-4"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
              Closed within 2 Hours
            </div>

            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-7 px-2 text-[11px] font-normal border-border/70 bg-background/80 backdrop-blur-sm shadow-sm hover:bg-muted/40 gap-1 flex items-center shrink-0"
                  >
                    <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                    {selectedDate ? (
                      format(parseInputDateToLocalDate(selectedDate), "MMM dd")
                    ) : (
                      "All Time"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[100]" align="end">
                  <Calendar
                    initialFocus
                    mode="single"
                    selected={selectedDate ? parseInputDateToLocalDate(selectedDate) : undefined}
                    onSelect={(date) => {
                      if (!date) return;
                      onSelectedDateChange?.(todayAsInputDate(date));
                    }}
                    disabled={{ after: new Date() }}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {selectedDate && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full shrink-0"
                  onClick={() => onSelectedDateChange?.(undefined)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
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
