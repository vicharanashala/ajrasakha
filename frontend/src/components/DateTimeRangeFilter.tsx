import React, { useState, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format, isValid, parseISO } from "date-fns";
import {
  CalendarIcon,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RotateCcw,
  Check,
} from "lucide-react";
import { Button } from "./atoms/button";
import { Input } from "./atoms/input";
import { Calendar } from "./atoms/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./atoms/popover";

export interface DateTimeRangeValue {
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endDate: string; // YYYY-MM-DD
  endTime: string; // HH:mm
}

interface DateTimeRangeFilterProps {
  value: DateTimeRangeValue;
  onChange: (value: DateTimeRangeValue) => void;
  className?: string;
  disabled?: boolean;
}

export const getISTNow = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000);

export const getTodayISTDateString = () => {
  const ist = getISTNow();
  return ist.toISOString().slice(0, 10);
};

export const getYesterdayISTDateString = () => {
  const ist = getISTNow();
  ist.setUTCDate(ist.getUTCDate() - 1);
  return ist.toISOString().slice(0, 10);
};

export const getDaysAgoISTDateString = (days: number) => {
  const ist = getISTNow();
  ist.setUTCDate(ist.getUTCDate() - days);
  return ist.toISOString().slice(0, 10);
};

export const getStartOfMonthISTDateString = () => {
  const ist = getISTNow();
  return `${ist.toISOString().slice(0, 7)}-01`;
};

export const getDefaultDateTimeRange = (): DateTimeRangeValue => {
  const today = getTodayISTDateString();
  return {
    startDate: today,
    startTime: "00:00",
    endDate: today,
    endTime: "23:59",
  };
};

const formatDisplayDate = (dateStr?: string, timeStr?: string) => {
  if (!dateStr) return "";
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return dateStr;
    const dateFormatted = format(d, "dd MMM yyyy");
    return timeStr ? `${dateFormatted}, ${timeStr}` : dateFormatted;
  } catch {
    return `${dateStr} ${timeStr || ""}`.trim();
  }
};

export const DateTimeRangeFilter = ({
  value,
  onChange,
  className,
  disabled = false,
}: DateTimeRangeFilterProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<DateTimeRangeValue>(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const calendarDateRange: DateRange = {
    from: draft.startDate ? parseISO(draft.startDate) : undefined,
    to: draft.endDate ? parseISO(draft.endDate) : undefined,
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    if (!range) return;
    const { from, to } = range;

    if (from && !to) {
      const fromStr = format(from, "yyyy-MM-dd");
      setDraft((prev) => ({
        ...prev,
        startDate: fromStr,
        endDate: fromStr,
      }));
      return;
    }

    if (from && to) {
      setDraft((prev) => ({
        ...prev,
        startDate: format(from, "yyyy-MM-dd"),
        endDate: format(to, "yyyy-MM-dd"),
      }));
    }
  };

  const setPreset = (preset: "today" | "yesterday" | "last7" | "thisMonth") => {
    const today = getTodayISTDateString();
    if (preset === "today") {
      setDraft({
        startDate: today,
        startTime: "00:00",
        endDate: today,
        endTime: "23:59",
      });
    } else if (preset === "yesterday") {
      const yesterday = getYesterdayISTDateString();
      setDraft({
        startDate: yesterday,
        startTime: "00:00",
        endDate: yesterday,
        endTime: "23:59",
      });
    } else if (preset === "last7") {
      setDraft({
        startDate: getDaysAgoISTDateString(6),
        startTime: "00:00",
        endDate: today,
        endTime: "23:59",
      });
    } else if (preset === "thisMonth") {
      setDraft({
        startDate: getStartOfMonthISTDateString(),
        startTime: "00:00",
        endDate: today,
        endTime: "23:59",
      });
    }
  };

  const isInvalidRange = Boolean(
    draft.startDate &&
      draft.endDate &&
      `${draft.startDate}T${draft.startTime || "00:00"}` >
        `${draft.endDate}T${draft.endTime || "23:59"}`
  );

  const handleApply = () => {
    if (isInvalidRange) return;
    onChange(draft);
    setIsOpen(false);
  };

  const handleReset = () => {
    const defaults = getDefaultDateTimeRange();
    setDraft(defaults);
    onChange(defaults);
    setIsOpen(false);
  };

  // Check which preset is active
  const today = getTodayISTDateString();
  const yesterday = getYesterdayISTDateString();
  const last7Start = getDaysAgoISTDateString(6);
  const thisMonthStart = getStartOfMonthISTDateString();

  const isTodayActive =
    draft.startDate === today &&
    draft.endDate === today &&
    draft.startTime === "00:00" &&
    draft.endTime === "23:59";

  const isYesterdayActive =
    draft.startDate === yesterday &&
    draft.endDate === yesterday &&
    draft.startTime === "00:00" &&
    draft.endTime === "23:59";

  const isLast7Active =
    draft.startDate === last7Start &&
    draft.endDate === today &&
    draft.startTime === "00:00" &&
    draft.endTime === "23:59";

  const isThisMonthActive =
    draft.startDate === thisMonthStart &&
    draft.endDate === today &&
    draft.startTime === "00:00" &&
    draft.endTime === "23:59";

  const displayText =
    value.startDate && value.endDate
      ? `From: ${formatDisplayDate(value.startDate, value.startTime)} - To: ${formatDisplayDate(value.endDate, value.endTime)}`
      : "From: Date and Time - To: Date and Time";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={`h-9 px-3 justify-between text-xs font-normal bg-background hover:bg-accent/40 border-input shadow-xs transition-colors gap-2 min-w-[240px] sm:min-w-[340px] max-w-full ${className || ""}`}
          title={displayText}
        >
          <div className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate text-foreground font-medium">
              {displayText}
            </span>
          </div>
          <span className="shrink-0 text-muted-foreground/70 ml-1">
            {isOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[340px] sm:w-[400px] p-3.5 space-y-3.5 bg-popover text-popover-foreground border shadow-xl rounded-xl z-50"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span>Custom Date and Time Filter</span>
          </div>
          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            IST (UTC+5:30)
          </span>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-1 bg-muted/40 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setPreset("today")}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-all ${
              isTodayActive
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-background/80"
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setPreset("yesterday")}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-all ${
              isYesterdayActive
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-background/80"
            }`}
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => setPreset("last7")}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-all ${
              isLast7Active
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-background/80"
            }`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => setPreset("thisMonth")}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-all ${
              isThisMonthActive
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-background/80"
            }`}
          >
            This Month
          </button>
        </div>

        {/* Visual Calendar */}
        <div className="border rounded-lg bg-card/60 p-1 flex justify-center">
          <Calendar
            mode="range"
            selected={calendarDateRange}
            onSelect={handleDateSelect}
            defaultMonth={calendarDateRange.from || new Date()}
            numberOfMonths={1}
            className="p-1 scale-95 origin-top"
          />
        </div>

        {/* Explicit Inputs for From and To */}
        <div className="space-y-2.5 pt-1">
          {/* From: Date and Time */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1 text-primary">
                <CalendarIcon className="w-3.5 h-3.5" />
                From: Date and Time
              </span>
              <span className="text-[10px] text-muted-foreground">Start</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <Input
                type="date"
                value={draft.startDate}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, startDate: e.target.value }))
                }
                className="col-span-3 h-8 text-xs bg-background"
              />
              <Input
                type="time"
                value={draft.startTime}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, startTime: e.target.value }))
                }
                className="col-span-2 h-8 text-xs bg-background"
              />
            </div>
          </div>

          {/* To: Date and Time */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1 text-primary">
                <CalendarIcon className="w-3.5 h-3.5" />
                To: Date and Time
              </span>
              <span className="text-[10px] text-muted-foreground">End</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <Input
                type="date"
                value={draft.endDate}
                min={draft.startDate || undefined}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className="col-span-3 h-8 text-xs bg-background"
              />
              <Input
                type="time"
                value={draft.endTime}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, endTime: e.target.value }))
                }
                className="col-span-2 h-8 text-xs bg-background"
              />
            </div>
          </div>
        </div>

        {/* Validation Warning */}
        {isInvalidRange && (
          <div className="flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-medium">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>"From" date and time cannot be later than "To" date and time</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isInvalidRange}
            onClick={handleApply}
            className="h-7 px-3 text-xs gap-1 font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Check className="w-3 h-3" />
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
