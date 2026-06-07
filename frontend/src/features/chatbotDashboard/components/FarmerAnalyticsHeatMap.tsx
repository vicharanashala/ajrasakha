import { useMemo, useState } from "react";
import { Activity, InfoIcon, MapPinned, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { SearchableSelect } from "@/components/atoms/SearchableSelect";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { STATES } from "@/components/MetaData";
import { cn } from "@/lib/utils";

import {
  DEFAULT_FARMER_HEAT_MAP_FILTERS,
  type FarmerHeatMapGranularity,
  type FarmerHeatMapMetric,
  useFarmerHeatMapAnalytics,
} from "../hooks/useFarmerHeatMapAnalytics";

interface FarmerAnalyticsHeatMapProps {
  source: "vicharanashala" | "annam";
  userType: "all" | "external" | "internal";
  enabled?: boolean;
}

const metricOptions: Array<{
  value: FarmerHeatMapMetric;
  label: string;
  shortLabel: string;
}> = [
  {
    value: "activeFarmers",
    label: "Active Farmers",
    shortLabel: "Farmers",
  },
  {
    value: "totalQuestions",
    label: "Total Questions",
    shortLabel: "Questions",
  },
  {
    value: "closedQuestions",
    label: "Closed Questions",
    shortLabel: "Closed",
  },
  {
    value: "notifiedQuestions",
    label: "Notified Questions",
    shortLabel: "Notified",
  },
  {
    value: "averageClosureTimeMinutes",
    label: "Average Closure Time",
    shortLabel: "Avg Closure",
  },
];

type HeatMapPeriodMode = "year" | "month" | "week" | "day";

const periodModeOptions: Array<{ value: HeatMapPeriodMode; label: string }> = [
  { value: "year", label: "Year" },
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
];

const monthOptions = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const selectClassName =
  "h-9 w-full justify-between rounded-md border border-border/70 bg-background px-3 text-sm text-muted-foreground shadow-sm";

const activeSelectClassName =
  "h-9 w-full justify-between rounded-md border border-[#3AAA5A] bg-green-50 px-3 text-sm font-medium text-green-700 shadow-sm dark:bg-green-950/20 dark:text-green-300";

const formatValue = (metric: FarmerHeatMapMetric, value: number) => {
  if (metric === "averageClosureTimeMinutes") {
    if (!value) return "0";
    if (value >= 60) return `${Math.round((value / 60) * 10) / 10}h`;
    return `${Math.round(value)}m`;
  }

  return value.toLocaleString();
};

const formatStatusDistribution = (statusDistribution: Record<string, number>) => {
  const entries = Object.entries(statusDistribution);
  if (entries.length === 0) return "No questions";

  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ");
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const getDaysInMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

const getWeekRange = (year: number, monthIndex: number, week: number) => {
  const startDay = (week - 1) * 7 + 1;
  const lastDay = getDaysInMonth(year, monthIndex);
  const endDay = Math.min(startDay + 6, lastDay);

  return {
    startDate: startOfDay(new Date(year, monthIndex, startDay)),
    endDate: endOfDay(new Date(year, monthIndex, endDay)),
  };
};

const getWeekDays = (year: number, monthIndex: number, week: number) => {
  const { startDate, endDate } = getWeekRange(year, monthIndex, week);
  const start = startDate.getDate();
  const end = endDate.getDate();
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

const getPeriodFilter = (
  mode: HeatMapPeriodMode,
  year: number,
  monthIndex: number,
  week: number,
  day: number,
) => {
  if (mode === "year") {
    return {
      granularity: "monthly" as FarmerHeatMapGranularity,
      startDate: startOfDay(new Date(year, 0, 1)),
      endDate: endOfDay(new Date(year, 11, 31)),
    };
  }

  if (mode === "month") {
    return {
      granularity: "weekly" as FarmerHeatMapGranularity,
      startDate: startOfDay(new Date(year, monthIndex, 1)),
      endDate: endOfDay(new Date(year, monthIndex, getDaysInMonth(year, monthIndex))),
    };
  }

  if (mode === "week") {
    const range = getWeekRange(year, monthIndex, week);
    return {
      granularity: "daily" as FarmerHeatMapGranularity,
      ...range,
    };
  }

  return {
    granularity: "hourly" as FarmerHeatMapGranularity,
    startDate: startOfDay(new Date(year, monthIndex, day)),
    endDate: endOfDay(new Date(year, monthIndex, day)),
  };
};

export function FarmerAnalyticsHeatMap({
  source,
  userType,
  enabled = true,
}: FarmerAnalyticsHeatMapProps) {
  const now = useMemo(() => new Date(), []);
  const [periodMode, setPeriodMode] = useState<HeatMapPeriodMode>("year");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState(now.getDate());
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FARMER_HEAT_MAP_FILTERS,
    ...getPeriodFilter("year", now.getFullYear(), now.getMonth(), 1, now.getDate()),
  }));
  const [metric, setMetric] =
    useState<FarmerHeatMapMetric>("totalQuestions");
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, index) => now.getFullYear() - index),
    [now],
  );
  const weekOptions = useMemo(
    () =>
      Array.from(
        { length: Math.ceil(getDaysInMonth(selectedYear, selectedMonth) / 7) },
        (_, index) => index + 1,
      ),
    [selectedMonth, selectedYear],
  );
  const dayOptions = useMemo(
    () => {
      if (periodMode === "day") {
        return getWeekDays(selectedYear, selectedMonth, selectedWeek);
      }

      return Array.from(
        { length: getDaysInMonth(selectedYear, selectedMonth) },
        (_, index) => index + 1,
      );
    },
    [periodMode, selectedMonth, selectedWeek, selectedYear],
  );

  const { data, isLoading, error } = useFarmerHeatMapAnalytics(
    filters,
    source,
    userType,
    enabled,
  );

  const selectedMetric = metricOptions.find((item) => item.value === metric);
  const maxValue = data?.maxValues?.[metric] ?? 0;
  const rows = data?.rows ?? [];
  const buckets = data?.buckets ?? [];
  const visibleRows = useMemo(
    () =>
      rows
        .map((row) => row)
        .sort((a, b) => Number(b.totals?.[metric] ?? 0) - Number(a.totals?.[metric] ?? 0)),
    [metric, rows],
  );
  const selectedMetricTotal = Number(data?.totals?.[metric] ?? 0);

  const updateState = (state: string) => {
    setFilters((current) => ({
      ...current,
      state,
    }));
  };

  const applyPeriodFilter = (
    mode: HeatMapPeriodMode,
    year: number,
    month: number,
    week: number,
    day: number,
  ) => {
    const maxWeek = Math.ceil(getDaysInMonth(year, month) / 7);
    const maxDay = getDaysInMonth(year, month);
    const safeWeek = Math.min(week, maxWeek);
    const weekDays = getWeekDays(year, month, safeWeek);
    let safeDay = Math.min(day, maxDay);

    if (mode === "day" && !weekDays.includes(safeDay)) {
      safeDay = weekDays[0] ?? safeDay;
    }

    setPeriodMode(mode);
    setSelectedYear(year);
    setSelectedMonth(month);
    setSelectedWeek(safeWeek);
    setSelectedDay(safeDay);
    setFilters((current) => ({
      ...current,
      ...getPeriodFilter(mode, year, month, safeWeek, safeDay),
    }));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["farmer-heat-map"] });
    setRefreshing(false);
  };

  const getCellStyle = (value: number) => {
    if (!maxValue || value <= 0) {
      return {
        backgroundColor: "hsl(var(--muted) / 0.25)",
        color: "hsl(var(--muted-foreground))",
      };
    }

    const intensity = Math.min(value / maxValue, 1);
    const alpha = 0.12 + intensity * 0.78;

    return {
      backgroundColor: `rgba(34, 197, 94, ${alpha})`,
      color: intensity > 0.58 ? "#052e16" : "hsl(var(--foreground))",
    };
  };

  return (
    <Card className="relative border border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm transition-shadow duration-300 hover:shadow-md">
      <button
        onClick={handleRefresh}
        className="absolute right-7 top-10 rounded-lg border border-gray-200/60 p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white hover:shadow-md dark:border-[#333]"
        title="Refresh"
      >
        <RefreshCw
          className={cn("h-3.5 w-3.5 bg-background", {
            "animate-spin": refreshing,
          })}
        />
      </button>

      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-wide text-foreground">
              <MapPinned className="h-5 w-5 text-primary" />
              <span>Farmer Activity Heat Map</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-help text-muted-foreground/60 hover:text-muted-foreground">
                    <InfoIcon className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Compares farmer activity and question outcomes across the selected location and time period.
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              State and district farmer activity by selected period
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="w-full xl:max-w-md">
          <SearchableSelect
            options={STATES}
            value={filters.state}
            onChange={updateState}
            placeholder="All States"
            className={selectClassName}
            activeClassName={activeSelectClassName}
          />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
              <div className="grid w-full grid-cols-4 gap-1 rounded-md bg-muted/50 p-1 shadow-sm sm:w-auto">
                {periodModeOptions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      applyPeriodFilter(
                        item.value,
                        selectedYear,
                        selectedMonth,
                        selectedWeek,
                        selectedDay,
                      )
                    }
                    className={cn(
                      "h-9 rounded px-4 text-sm font-semibold text-muted-foreground transition-colors sm:min-w-20",
                      periodMode === item.value &&
                        "bg-primary text-primary-foreground shadow-sm",
                    )}
                  >
                  {item.label}
                </button>
              ))}
            </div>

          <Select
            value={metric}
            onValueChange={(value) => setMetric(value as FarmerHeatMapMetric)}
          >
            <SelectTrigger className="h-10 w-full rounded-md border-border/70 shadow-sm sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metricOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={String(selectedYear)}
              onValueChange={(value) =>
                applyPeriodFilter(
                  periodMode,
                  Number(value),
                  selectedMonth,
                  selectedWeek,
                  selectedDay,
                )
              }
            >
              <SelectTrigger className="h-10 w-[120px] rounded-md border-border/70 shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(periodMode === "month" ||
              periodMode === "week" ||
              periodMode === "day") && (
              <Select
                value={String(selectedMonth)}
                onValueChange={(value) =>
                  applyPeriodFilter(
                    periodMode,
                    selectedYear,
                    Number(value),
                    selectedWeek,
                    selectedDay,
                  )
                }
              >
                <SelectTrigger className="h-10 w-[150px] rounded-md border-border/70 shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((month, index) => (
                    <SelectItem key={month} value={String(index)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {(periodMode === "week" || periodMode === "day") && (
              <Select
                value={String(selectedWeek)}
                onValueChange={(value) =>
                  applyPeriodFilter(
                    periodMode,
                    selectedYear,
                    selectedMonth,
                    Number(value),
                    selectedDay,
                  )
                }
              >
                <SelectTrigger className="h-10 w-[130px] rounded-md border-border/70 shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map((week) => (
                    <SelectItem key={week} value={String(week)}>
                      Week {week}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {periodMode === "day" && (
              <Select
                value={String(selectedDay)}
                onValueChange={(value) =>
                  applyPeriodFilter(
                    periodMode,
                    selectedYear,
                    selectedMonth,
                    selectedWeek,
                    Number(value),
                  )
                }
              >
                <SelectTrigger className="h-10 w-[110px] rounded-md border-border/70 shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dayOptions.map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-primary" />
            Coloring by {selectedMetric?.label ?? "Selected Metric"}
          </span>
          <span className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-1 font-semibold text-foreground">
            Total: {formatValue(metric, selectedMetricTotal)}
          </span>
          <span>
            Y-axis: {filters.state === "all" ? "States" : "Districts"}
          </span>
          <span>X-axis: {periodModeOptions.find((item) => item.value === periodMode)?.label}</span>
        </div>

        {isLoading ? (
          <Skeleton className="h-[430px] w-full rounded-lg" />
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            Failed to fetch farmer heat map data.
          </div>
        ) : rows.length === 0 || buckets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
            No farmer activity data found for the selected filters.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/70 bg-background/80">
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead className="sticky top-0 z-20 bg-card">
                  <tr>
                    <th className="sticky left-0 z-30 min-w-[180px] border-b border-r border-border/60 bg-card px-3 py-3 text-left font-semibold text-foreground">
                      {filters.state === "all" ? "States" : "Districts"}
                    </th>
                    {buckets.map((bucket) => (
                      <th
                        key={bucket.key}
                        className="min-w-[82px] border-b border-border/60 px-2 py-3 text-center font-semibold text-foreground"
                      >
                        {bucket.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 last:border-0">
                      <th className="sticky left-0 z-10 min-w-[180px] border-r border-border/60 bg-background px-3 py-2 text-left font-medium text-foreground">
                        <span className="line-clamp-2">{row.label}</span>
                      </th>
                      {row.cells.map((cell) => {
                        const value = Number(cell[metric] || 0);
                        const title = [
                          `${row.label} - ${cell.label}`,
                          `Active farmers: ${cell.activeFarmers}`,
                          `Total questions: ${cell.totalQuestions}`,
                          `Closed questions: ${cell.closedQuestions}`,
                          `Notified questions: ${cell.notifiedQuestions}`,
                          `Average closure time: ${formatValue("averageClosureTimeMinutes", cell.averageClosureTimeMinutes)}`,
                          `Status distribution: ${formatStatusDistribution(cell.statusDistribution)}`,
                        ].join("\n");

                        return (
                          <td
                            key={`${row.id}-${cell.bucket}`}
                            className="h-11 min-w-[82px] border-r border-border/30 p-1 text-center align-middle last:border-r-0"
                            title={title}
                          >
                            <div
                              className="flex h-9 min-w-[70px] items-center justify-center rounded-md px-2 text-[11px] font-semibold tabular-nums"
                              style={getCellStyle(value)}
                            >
                              {formatValue(metric, value)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
