import { useState, useCallback, useEffect, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { getISOStringsForDateRange } from "../utils/dateUtils";

/**
 * Hook for managing multiple date ranges
 */
export function useDateRanges() {
  const [closed2hDateRange, setClosed2hDateRange] = useState<DateRange | undefined>(undefined);
  const [questionStatusDateRange, setQuestionStatusDateRange] = useState<DateRange | undefined>(undefined);
  const [customerNotificationsDateRange, setCustomerNotificationsDateRange] = useState<DateRange | undefined>(undefined);
  const [trendsDateRange, setTrendsDateRange] = useState<DateRange | undefined>(undefined);
  const [faqsDateRange, setFaqsDateRange] = useState<DateRange | undefined>(undefined);

  const resetAllDateRanges = useCallback(() => {
    setClosed2hDateRange(undefined);
    setQuestionStatusDateRange(undefined);
    setCustomerNotificationsDateRange(undefined);
  }, []);

  const resetTrendsDateRange = useCallback(() => {
    setTrendsDateRange(undefined);
  }, []);

  const resetFaqsDateRange = useCallback(() => {
    setFaqsDateRange(undefined);
  }, []);

  return {
    // State
    closed2hDateRange,
    questionStatusDateRange,
    customerNotificationsDateRange,
    trendsDateRange,
    faqsDateRange,
    // Setters
    setClosed2hDateRange,
    setQuestionStatusDateRange,
    setCustomerNotificationsDateRange,
    setTrendsDateRange,
    setFaqsDateRange,
    // Reset functions
    resetAllDateRanges,
    resetTrendsDateRange,
    resetFaqsDateRange,
  };
}

/**
 * Hook for managing a single date range with ISO string conversion
 */
export function useDateRangeWithISO(defaultRange?: DateRange) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);

  const isoRange = useMemo(
    () => getISOStringsForDateRange(dateRange),
    [dateRange, getISOStringsForDateRange]
  );

  return {
    dateRange,
    setDateRange,
    ...isoRange,
  };
}

/**
 * Hook for date range reset on source change
 */
export function useDateRangeReset(
  source: string,
  resetFunctions: Array<(value: DateRange | undefined) => void>
) {
  useEffect(() => {
    resetFunctions.forEach((resetFn) => resetFn(undefined));
  }, [source]);
}

/**
 * Hook for converting date range to filters
 */
export function useDateRangeFilters(
  baseFilters: {
    userType: string;
  },
  trendsDateRange?: DateRange,
  faqsDateRange?: DateRange
) {
  const trendsFilters = useMemo(
    () => ({
      ...baseFilters,
      startTime: trendsDateRange?.from,
      endTime: trendsDateRange?.to,
    }),
    [baseFilters, trendsDateRange]
  );

  const faqsFilters = useMemo(
    () => ({
      ...baseFilters,
      startTime: faqsDateRange?.from,
      endTime: faqsDateRange?.to,
    }),
    [baseFilters, faqsDateRange]
  );

  return { trendsFilters, faqsFilters };
}