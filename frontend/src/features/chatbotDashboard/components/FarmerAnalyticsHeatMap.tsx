import { useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  type ILocationBlock,
  type ILocationDistrict,
  type ILocationState,
  type ILocationVillage,
  LocationService,
} from "@/hooks/services/locationService";

import {
  DEFAULT_FARMER_HEAT_MAP_FILTERS,
  type FarmerHeatMapGranularity,
  type FarmerHeatMapMetric,
  type FarmerHeatMapQuestionDetail,
  useFarmerHeatMapAnalytics,
} from "../hooks/useFarmerHeatMapAnalytics";
import CountUp from "react-countup";
import { QuestionActivityModal } from "./QuestionActivityModal";

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
    value: "duplicateQuestions",
    label: "Duplicate Questions",
    shortLabel: "Duplicates",
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

type SelectedHeatMapCell = {
  location: string;
  period: string;
  metric: FarmerHeatMapMetric;
  value: number;
  details: FarmerHeatMapQuestionDetail[];
};

const periodModeOptions: Array<{ value: HeatMapPeriodMode; label: string }> = [
  { value: "year", label: "Months" },
  { value: "month", label: "Weeks" },
  { value: "week", label: "Days" },
  { value: "day", label: "Hours" },
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

const locationService = new LocationService();

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

const getDuplicateGroupKey = (question: FarmerHeatMapQuestionDetail) => {
  if (question.referenceQuestionId) return `reference-id:${question.referenceQuestionId}`;
  if (question.referenceQuestion?.trim()) {
    return `reference-text:${question.referenceQuestion.trim().toLowerCase().replace(/\s+/g, " ")}`;
  }
  return `question-id:${question.questionId}`;
};

const normalizeStatus = (status?: string) =>
  String(status || "unknown").trim().toLowerCase().replace(/_/g, "-");

const isQuestionListingMetric = (metric: FarmerHeatMapMetric) =>
  metric !== "activeFarmers";

const getMetricQuestionDetails = (
  metric: FarmerHeatMapMetric,
  details: FarmerHeatMapQuestionDetail[],
) => {
  if (!isQuestionListingMetric(metric)) {
    return [];
  }

  if (metric === "duplicateQuestions") {
    return details.filter((item) => normalizeStatus(item.status) === "duplicate");
  }
  if (metric === "closedQuestions" || metric === "averageClosureTimeMinutes") {
    return details.filter((item) => normalizeStatus(item.status) === "closed");
  }
  if (metric === "notifiedQuestions") {
    return details.filter((item) => normalizeStatus(item.status) === "closed" && item.isCustomerNotified === true);
  }
  return details;
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
  const [selectedCell, setSelectedCell] = useState<SelectedHeatMapCell | null>(null);
  const [states, setStates] = useState<ILocationState[]>([]);
  const [districts, setDistricts] = useState<ILocationDistrict[]>([]);
  const [blocks, setBlocks] = useState<ILocationBlock[]>([]);
  const [villages, setVillages] = useState<ILocationVillage[]>([]);
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
  const selectedCellMetric = selectedCell
    ? metricOptions.find((item) => item.value === selectedCell.metric)
    : undefined;
  const selectedCellDetails = useMemo(
    () =>
      selectedCell
        ? getMetricQuestionDetails(selectedCell.metric, selectedCell.details)
        : [],
    [selectedCell],
  );
  const selectedCellModalMode =
    selectedCell?.metric === "duplicateQuestions" ? "duplicateGroups" : "details";
  const selectedDuplicateGroups = useMemo(() => {
    if (!selectedCell || selectedCell.metric !== "duplicateQuestions") return [];

    const groups = new Map<string, FarmerHeatMapQuestionDetail[]>();
    selectedCellDetails.forEach((detail) => {
      const key = getDuplicateGroupKey(detail);
      groups.set(key, [...(groups.get(key) ?? []), detail]);
    });

    return [...groups.entries()].map(([key, questions]) => ({
      key,
      referenceQuestion:
        questions[0]?.referenceQuestion || questions[0]?.question || "Question text not available",
      questions,
    }));
  }, [selectedCell, selectedCellDetails]);
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
  const rowAxisLabel =
    data?.rows?.[0]?.scope === "village"
      ? "Villages"
      : data?.rows?.[0]?.scope === "block"
        ? "Blocks"
        : data?.rows?.[0]?.scope === "district"
          ? "Districts"
          : "States";
  const stateOptions = useMemo(
    () =>
      states
        .map((state) => state.stateNameEnglish)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [states],
  );
  const districtOptions = useMemo(
    () =>
      districts
        .map((district) => district.districtNameEnglish)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [districts],
  );
  const blockOptions = useMemo(
    () =>
      blocks
        .map((block) => block.blockNameEnglish)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [blocks],
  );
  const villageOptions = useMemo(
    () =>
      villages
        .map((village) => village.villageNameEnglish)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [villages],
  );

  useEffect(() => {
    let cancelled = false;

    locationService.getStates().then((items) => {
      if (!cancelled) setStates(items ?? []);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selected = states.find(
      (state) => state.stateNameEnglish === filters.state,
    );

    if (!selected) {
      setDistricts([]);
      return;
    }

    let cancelled = false;
    locationService.getDistricts(selected.stateCode).then((items) => {
      if (!cancelled) setDistricts(items ?? []);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [filters.state, states]);

  useEffect(() => {
    const selected = districts.find(
      (district) => district.districtNameEnglish === filters.district,
    );

    if (!selected) {
      setBlocks([]);
      return;
    }

    let cancelled = false;
    locationService.getBlocks(selected.districtCode).then((items) => {
      if (!cancelled) setBlocks(items ?? []);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [districts, filters.district]);

  useEffect(() => {
    const selected = blocks.find(
      (block) => block.blockNameEnglish === filters.block,
    );

    if (!selected) {
      setVillages([]);
      return;
    }

    let cancelled = false;
    locationService.getVillages(selected.blockCode).then((items) => {
      if (!cancelled) setVillages(items ?? []);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [blocks, filters.block]);

  const updateState = (state: string) => {
    setFilters((current) => ({
      ...current,
      state,
      district: "all",
      block: "all",
      village: "all",
    }));
  };

  const updateDistrict = (district: string) => {
    setFilters((current) => ({
      ...current,
      district,
      block: "all",
      village: "all",
    }));
  };

  const updateBlock = (block: string) => {
    setFilters((current) => ({
      ...current,
      block,
      village: "all",
    }));
  };

  const updateVillage = (village: string) => {
    setFilters((current) => ({
      ...current,
      village,
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
    <>
    <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card via-card to-card/40 shadow-sm transition-shadow duration-300 hover:shadow-lg">
      {/* Compact header: title + filters in one band */}
      <CardHeader className="gap-3 border-b border-border/50 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex items-center gap-2.5 "
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <MapPinned className="h-4 w-4 text-primary" />
            </div>
            <div className="leading-tight">
              <CardTitle className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
                <span>Farmer Activity Heat Map</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help text-muted-foreground/60 hover:text-muted-foreground">
                      <InfoIcon className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Compares farmer activity and question outcomes across the
                    selected location and time period.
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Farmer activity by selected location and period
              </p>
            </div>
          </motion.div>

          <motion.button
            whileHover={{ scale: 1.08, rotate: 15 }}
            whileTap={{ scale: 0.92, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            onClick={handleRefresh}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 shadow-sm transition-colors hover:bg-accent"
            title="Refresh"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5 text-foreground", {
                "animate-spin": refreshing,
              })}
            />
          </motion.button>
        </div>

        {/* Inline filter row — single line on desktop */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="min-w-[180px] flex-1 sm:max-w-[220px]">
            <SearchableSelect
              options={stateOptions}
              value={filters.state}
              onChange={updateState}
              placeholder="All States"
              className={cn(selectClassName, "h-8")}
              activeClassName={activeSelectClassName}
            />
          </div>
          {filters.state !== "all" && (
            <div className="min-w-[180px] flex-1 sm:max-w-[220px]">
              <SearchableSelect
                options={districtOptions}
                value={filters.district}
                onChange={updateDistrict}
                placeholder="All Districts"
                className={cn(selectClassName, "h-8")}
                activeClassName={activeSelectClassName}
              />
            </div>
          )}
          {filters.district !== "all" && (
            <div className="min-w-[180px] flex-1 sm:max-w-[220px]">
              <SearchableSelect
                options={blockOptions}
                value={filters.block}
                onChange={updateBlock}
                placeholder="All Blocks"
                className={cn(selectClassName, "h-8")}
                activeClassName={activeSelectClassName}
              />
            </div>
          )}
          {filters.block !== "all" && (
            <div className="min-w-[180px] flex-1 sm:max-w-[220px]">
              <SearchableSelect
                options={villageOptions}
                value={filters.village}
                onChange={updateVillage}
                placeholder="All Villages"
                className={cn(selectClassName, "h-8")}
                activeClassName={activeSelectClassName}
              />
            </div>
          )}

          <div className="flex h-8 items-center gap-0.5 rounded-md bg-muted/60 p-0.5 ring-1 ring-border/60">
            {periodModeOptions.map((item) => {
              const isActive = periodMode === item.value;
              return (
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
                    "relative h-7 rounded px-2.5 text-xs font-medium transition-colors",
                    isActive
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="periodModeActive"
                      className="absolute inset-0 rounded bg-primary shadow-sm"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </div>

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
            <SelectTrigger className="h-8 w-[92px] rounded-md border-border/70 px-2 text-xs shadow-sm">
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

          <AnimatePresence mode="popLayout" initial={false}>
            {(periodMode === "month" ||
              periodMode === "week" ||
              periodMode === "day") && (
              <motion.div
                key="month"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
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
                  <SelectTrigger className="h-8 w-[120px] rounded-md border-border/70 px-2 text-xs shadow-sm">
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
              </motion.div>
            )}

            {(periodMode === "week" || periodMode === "day") && (
              <motion.div
                key="week"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
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
                  <SelectTrigger className="h-8 w-[104px] rounded-md border-border/70 px-2 text-xs shadow-sm">
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
              </motion.div>
            )}

            {periodMode === "day" && (
              <motion.div
                key="day"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
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
                  <SelectTrigger className="h-8 w-[84px] rounded-md border-border/70 px-2 text-xs shadow-sm">
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
              </motion.div>
            )}
          </AnimatePresence>

          <Select
            value={metric}
            onValueChange={(value) => setMetric(value as FarmerHeatMapMetric)}
          >
            <SelectTrigger className="ml-auto h-8 w-[180px] rounded-md border-border/70 px-2 text-xs shadow-sm">
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
        </motion.div>
      </CardHeader>

      <CardContent className="space-y-3 pt-4">
        {/* Meta strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex flex-wrap items-center gap-1.5 text-[11px]"
        >
          <span className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/5 px-2 py-0.5 font-medium text-primary">
            <Activity className="h-3 w-3" />
            {selectedMetric?.label ?? "Selected Metric"}
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/40 px-2 py-0.5 font-semibold text-foreground">
            <span className="text-muted-foreground">Total:</span>
            <motion.span
              key={String(selectedMetricTotal)}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              className="tabular-nums"
            >
              <CountUp
                end={selectedMetricTotal ?? 0}
                duration={1.5}
                preserveValue
              />
              {/* {formatValue(metric, selectedMetricTotal)} */}
            </motion.span>
          </span>
          <span className="rounded border border-border/60 bg-background px-2 py-0.5 text-muted-foreground">
            Y: {rowAxisLabel}
          </span>
          <span className="rounded border border-border/60 bg-background px-2 py-0.5 text-muted-foreground">
            X:{" "}
            {periodModeOptions.find((item) => item.value === periodMode)?.label}
          </span>
        </motion.div>

        {/* Heat map / states (unchanged from previous version) */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Skeleton className="h-[430px] w-full rounded-lg" />
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
            >
              Failed to fetch farmer heat map data.
            </motion.div>
          ) : rows.length === 0 || buckets.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-lg border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground"
            >
              No farmer activity data found for the selected filters.
            </motion.div>
          ) : (
            <motion.div
              key="table"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="overflow-hidden rounded-lg border border-border/70 bg-background/80 shadow-sm"
            >
              <div className="max-h-[560px] overflow-auto">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20 bg-card">
                    <tr>
                      <th className="sticky left-0 z-30 min-w-[180px] border-b border-r border-border/60 bg-card px-3 py-2.5 text-left font-semibold text-foreground">
                        {rowAxisLabel}
                      </th>
                      {buckets.map((bucket) => (
                        <th
                          key={bucket.key}
                          className="min-w-[82px] border-b border-border/60 px-2 py-2.5 text-center font-semibold text-foreground"
                        >
                          {bucket.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, rowIdx) => (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: 0.25,
                          delay: Math.min(rowIdx * 0.015, 0.3),
                        }}
                        className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                      >
                        <th className="sticky left-0 z-10 min-w-[180px] border-r border-border/60 bg-background px-3 py-2 text-left font-medium text-foreground">
                          <span className="line-clamp-2">{row.label}</span>
                        </th>
                        {row.cells.map((cell) => {
                          const value = Number(cell[metric] || 0);
                          const cellDetails = getMetricQuestionDetails(
                            metric,
                            cell.questionDetails ?? [],
                          );
                          const canOpenDetails =
                            isQuestionListingMetric(metric) &&
                            value > 0 &&
                            cellDetails.length > 0;
                          const title = [
                            `${row.label} - ${cell.label}`,
                            `Active farmers: ${cell.activeFarmers}`,
                            `Total questions: ${cell.totalQuestions}`,
                            `Duplicate questions: ${cell.duplicateQuestions}`,
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
                              <motion.button
                                type="button"
                                whileHover={{ scale: canOpenDetails ? 1.08 : 1 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 400,
                                  damping: 20,
                                }}
                                className="flex h-9 min-w-[70px] cursor-pointer items-center justify-center rounded-md px-2 text-[11px] font-semibold tabular-nums shadow-sm disabled:cursor-default"
                                style={getCellStyle(value)}
                                disabled={!canOpenDetails}
                                onClick={() =>
                                  setSelectedCell({
                                    location: row.label,
                                    period: cell.label,
                                    metric,
                                    value,
                                    details: cell.questionDetails ?? [],
                                  })
                                }
                              >
                                {formatValue(metric, value)}
                              </motion.button>
                            </td>
                          );
                        })}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
    <QuestionActivityModal
      open={Boolean(selectedCell)}
      onOpenChange={(open) => !open && setSelectedCell(null)}
      title={selectedCellMetric?.label ?? "Question Details"}
      subtitle={
        selectedCell
          ? `${selectedCell.location} / ${selectedCell.period} / ${formatValue(
              selectedCell.metric,
              selectedCell.value,
            )}`
          : undefined
      }
      mode={selectedCellModalMode}
      detailItems={selectedCellDetails}
      duplicateGroups={selectedDuplicateGroups}
      showCloseButton
      emptyMessage="No question details for this selection."
      duplicateEmptyMessage="No duplicate question details for this selection."
    />
    </>
  );
}
