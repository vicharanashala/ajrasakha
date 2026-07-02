// ─── Date Utilities ───────────────────────────────────────────────────────────
import type { DateRange } from "react-day-picker";

/**
 * Formats a Date object to YYYY-MM-DD string for input fields
 */
export const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Parses a YYYY-MM-DD input string to a local Date object
 */
export const parseInputDateToLocalDate = (value: string): Date => {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Converts a DateRange from react-day-picker to ISO start/end strings.
 * - If range is missing or has no "from", returns undefined for both
 * - For "today", uses the current exact time
 * - For past dates, uses 23:59:59.999 of that day
 */
export const getISOStringsForDateRange = (range?: DateRange): {
  startTime: string | undefined;
  endTime: string | undefined;
} => {
  if (!range || !range.from) {
    return { startTime: undefined, endTime: undefined };
  }

  const startTime = new Date(range.from);
  startTime.setHours(0, 0, 0, 0);

  const endDate = range.to ? new Date(range.to) : new Date(range.from);
  const endTime = new Date(endDate);
  const now = new Date();

  const isSelectedToday =
    endDate.getFullYear() === now.getFullYear() &&
    endDate.getMonth() === now.getMonth() &&
    endDate.getDate() === now.getDate();

  if (isSelectedToday) {
    endTime.setHours(
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );
  } else {
    endTime.setHours(23, 59, 59, 999);
  }

  return {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  };
};

/**
 * Creates a DateRange filters object for query hooks
 */
export const createDateRangeFilters = (
  filters: Record<string, unknown>,
  dateRange?: DateRange,
): Record<string, unknown> => ({
  ...filters,
  startTime: dateRange?.from,
  endTime: dateRange?.to,
});

/**
 * Returns the start of today (midnight)
 */
export const getTodayStart = (): Date => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Returns the end of today (23:59:59.999)
 */
export const getTodayEnd = (): Date => {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
};

/**
 * Returns a date N days ago at midnight
 */
export const getDaysAgoStart = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Parses a date string to Date object, handling both YYYY-MM and YYYY-MM-DD formats
 */
export const parseFlexibleDate = (dateStr: string): Date => {
  const formatted = dateStr.length === 7 ? `${dateStr}-01` : dateStr;
  return new Date(`${formatted}T00:00:00`);
};

/**
 * Gets current date range for "today" based filtering
 */
export const getCurrentDayRange = (): { from: Date; to: Date } => ({
  from: getTodayStart(),
  to: new Date(),
});