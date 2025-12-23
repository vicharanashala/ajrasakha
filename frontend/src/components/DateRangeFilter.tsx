import React from "react";
import type { DateRange } from "react-day-picker";
import { Label } from "./atoms/label";
import { CalendarIcon, ChevronDown, ChevronUp, Clock } from "lucide-react";
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
}


export const DateRangeFilter = ({
  advanceFilter,
  handleDialogChange,
  className,
}: DateRangeFilterProps) => {
  const [isCalendarVisible, setIsCalendarVisible] = React.useState(false);
  // Convert the flat startTime/endTime into the DateRange object for the Calendar
  const dateRange: DateRange = {
    from: advanceFilter.startTime,
    to: advanceFilter.endTime,
  };

//   const handleDateSelect = (range: DateRange | undefined) => {
//     console.log("Date range: ", range);
//     handleDialogChange("startTime", range?.from);
//     handleDialogChange("endTime", range?.to);

//     // Close the calendar once both dates are selected
//     if (range?.from && range?.to) {
//       setIsCalendarVisible(false);
//     }
//   };

const handleDateSelect = (range: DateRange | undefined) => {
  if (!range) return;

  const { from, to } = range;
  const currentStart = advanceFilter.startTime;
  const currentEnd = advanceFilter.endTime;

  // ONLY START DATE SELECTED
  if (from && !to) {
    // If start < end -> keep end date
    if (currentEnd && from < currentEnd) {
      handleDialogChange("startTime", from);
      return;
    }

    // If start > end -> reset end
    handleDialogChange("startTime", from);
    handleDialogChange("endTime", undefined);
    return;
  }

  // START & END SELECTED
  if (from && to) {
    handleDialogChange("startTime", from);
    handleDialogChange("endTime", to);

    setIsCalendarVisible(false);
  }
};


  const isRangeSelected = dateRange.from && dateRange.to;

  return (
    <div className={`space-y-2 min-w-0 relative${className}`}>
      <Label className="flex items-center gap-2 text-sm font-semibold">
        <Clock className="h-4 w-4 text-primary" />
        Custom Date Range
      </Label>

      {/* This Button now acts as a toggle */}
      <Button
        id="date-toggle"
        variant={"outline"}
        className={`w-full justify-start text-left font-normal bg-background pr-3 w-68 ${
          !dateRange.from && "text-muted-foreground"
        }`}
        onClick={() => setIsCalendarVisible(!isCalendarVisible)}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {dateRange.from ? (
          dateRange.to ? (
            <>
              {format(dateRange.from, "LLL dd, y")} -{" "}
              {format(dateRange.to, "LLL dd, y")}
            </>
          ) : (
            format(dateRange.from, "LLL dd, y")
          )
        ) : (
          <span>Select a start and end date</span>
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

      {/* Conditional Rendering of the Calendar */}
      {isCalendarVisible && (
        <div className="absolute z-50 mt-2 border rounded-lg p-2 bg-popover text-popover-foreground shadow-lg min-w-full sm:min-w-[300px]">
          {" "}
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange.from}
            selected={dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={1} // Use 1 month since space might be limited now
            className="w-full"
          />
        </div>
      )}
    </div>
  );
};