import React from "react";
import type { DateRange } from "react-day-picker";
import { Label } from "./atoms/label";
import { AlertTriangle, CalendarIcon, ChevronDown, ChevronUp, Clock, Info, RefreshCcw } from "lucide-react";
import { Button } from "./atoms/button";
import { format } from "date-fns";
import { Calendar } from "./atoms/calendar";
import type { AdvanceFilterValues } from "./advanced-question-filter";

interface DateRangeFilterProps {
  // advanceFilter prop now includes startTime and endTime
  advanceFilter: Partial<AdvanceFilterValues>
  // The handler to update the parent state
  handleDialogChange: (key: string, value: any) => void;
  className?: string;
  customName?: string;
  type?: string;
  /** Optional helper text shown below the date button */
  helperText?: string;
  /** When true, shows a warning banner inside the calendar dropdown */
  showWarning?: boolean;
  /** Warning message to display when showWarning is true */
  warningMessage?: string;
  /** When true, hides the label above the button */
  hideLabel?: boolean;
}

export const DateRangeFilter = ({
  advanceFilter,
  handleDialogChange,
  className,
  customName,
  type,
  helperText,
  showWarning,
  warningMessage,
  hideLabel,
}: DateRangeFilterProps) => {
  const [isCalendarVisible, setIsCalendarVisible] = React.useState(false);
  // Convert the flat startTime/endTime into the DateRange object for the Calendar
  const startKey = type === "closedDateRange" ? "closedAtStart" : "startTime";
const endKey = type === "closedDateRange" ? "closedAtEnd" : "endTime";
  const dateRange: DateRange = {
    from: advanceFilter[startKey],
    to: advanceFilter[endKey],
  };
const handleDateSelect = (range: DateRange | undefined) => {
  if (!range) return;

  const { from, to } = range;
  const currentEnd = advanceFilter[endKey];

  // Only start selected
  if (from && !to) {
    handleDialogChange(startKey, from);

    if (currentEnd && from > currentEnd) {
      handleDialogChange(endKey, undefined);
    }
    return;
  }

  // Start & end selected
  if (from && to) {
    handleDialogChange(startKey, from);
    handleDialogChange(endKey, to);
    setIsCalendarVisible(false);
  }
};

  const handleClearDates = () => {
    handleDialogChange(startKey, undefined);
    handleDialogChange(endKey, undefined);
    setIsCalendarVisible(false);
  };



  const isRangeSelected = dateRange.from && dateRange.to;

  return (
    <div className={`space-y-2 min-w-0 relative ${className || ""}`}>
      {!hideLabel && (
        <Label className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-primary" />
         {customName || "Custom Date Range"}
        </Label>
      )}

      {/* This Button now acts as a toggle */}
      <Button
        id="date-toggle"
        variant={"outline"}
        className={`w-full justify-start text-left font-normal bg-background border-input pr-3 h-10 hover:bg-accent/50 transition-colors ${
          className || ""
        }`}
        onClick={() => setIsCalendarVisible(!isCalendarVisible)}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {dateRange.from ? (
          <span className="text-foreground">
          {dateRange.to ? (
            <>
              {format(dateRange.from, "LLL dd, y")} -{" "}
              {format(dateRange.to, "LLL dd, y")}
            </>
          ) : (
            format(dateRange.from, "LLL dd, y")
          )}
          </span>
        ) : (
          <span className="text-foreground/100">Select a start and end date</span>
        )}

        {/* Toggle Icon */}
        <span className="ml-auto">
          {isCalendarVisible ? (
            <ChevronUp className="h-4 w-4 opacity-50" />
          ) : (
            <ChevronDown className="h-4 w-4 opacity-50" />
          )}
        </span>
      </Button>

      {/* Helper text — only rendered when helperText prop is provided */}
      {helperText && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3 w-3 shrink-0 text-primary/60" />
          {helperText}
        </p>
      )}

      {/* Calendar dropdown */}
      {isCalendarVisible && (
        <div className="absolute right-0 z-[100] mt-2 border rounded-lg bg-popover text-popover-foreground shadow-lg w-[280px] sm:w-[320px]">

          {/* Warning banner — only rendered when showWarning is true */}
          {showWarning && warningMessage && (
            <div className="flex items-start gap-2 mx-3 mt-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-xs leading-snug">{warningMessage}</p>
            </div>
          )}

          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange.from}
            selected={dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={1}
            className="w-full p-2"
          />

          {dateRange.from && (
            <div className="flex justify-end border-t px-2 py-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearDates}
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          )}
        </div>
      )}

    </div>
  );
};