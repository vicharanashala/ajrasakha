import type { DateRange } from "react-day-picker";

/**
 * Format a Date object to YYYY-MM-DD string for input fields
 */
export const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Parse YYYY-MM-DD string to Date object
 */
export const parseInputDateToLocalDate = (value: string): Date => {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export interface ISODateRange {
  startTime: string | undefined;
  endTime: string | undefined;
}

/**
 * Convert a DateRange (from react-day-picker) to ISO strings for API calls
 */
export const getISOStringsForDateRange = (range?: DateRange): ISODateRange => {
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
      now.getMilliseconds()
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
 * Create a callback for converting DateRange to ISO strings
 * Memoizable for use with useMemo
 */
export const createDateRangeConverter = () => {
  return getISOStringsForDateRange;
};

/**
 * Get today's date range (start of day to end of day)
 */
export const getTodayDateRange = (): DateRange => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  
  return { from: today, to: endOfToday };
};

/**
 * Get date range for last N days
 */
export const getLastNDaysRange = (days: number): DateRange => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  
  return { from: start, to: end };
};

/**
 * Reset date ranges to undefined
 */
export const resetDateRanges = (
  setters: Array<(value: DateRange | undefined) => void>
) => {
  setters.forEach(setter => setter(undefined));
};