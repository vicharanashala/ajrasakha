import { useMemo, useState } from "react";
import { Activity, Copy, InfoIcon, MapPinned, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { cn } from "@/lib/utils";
import {
  type CoordinatorDuplicateQuestionDetail,
  useCoordinatorDuplicateQuestionHeatMap,
} from "../hooks/useCoordinatorDuplicateQuestionHeatMap";

interface CoordinatorDuplicateQuestionHeatMapProps {
  coordinatorId: string;
  enabled?: boolean;
}

type HeatMapPeriodMode = "year" | "month" | "week" | "day";

type HeatMapBucket = {
  key: string;
  label: string;
  startDate: Date;
  endDate: Date;
};

type HeatMapCell = {
  bucket: HeatMapBucket;
  count: number;
  details: CoordinatorDuplicateQuestionDetail[];
};

type HeatMapRow = {
  id: string;
  label: string;
  block: string;
  village?: string;
  total: number;
  cells: HeatMapCell[];
};

type SelectedCell = {
  location: string;
  period: string;
  count: number;
  details: CoordinatorDuplicateQuestionDetail[];
} | null;

const ALL_BLOCKS = "__all_blocks__";

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

const shortMonthOptions = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formatDate = (value?: string) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
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

const getDetailDate = (detail: CoordinatorDuplicateQuestionDetail) => {
  const date = new Date(detail.firstAskedAt || detail.lastAskedAt || "");
  return Number.isNaN(date.getTime()) ? null : date;
};

const getCellStyle = (count: number, max: number) => {
  if (!count || !max) {
    return {
      backgroundColor: "hsl(var(--muted) / 0.25)",
      color: "hsl(var(--muted-foreground))",
    };
  }

  const intensity = Math.min(count / max, 1);
  const alpha = 0.12 + intensity * 0.78;

  return {
    backgroundColor: `rgba(34, 197, 94, ${alpha})`,
    color: intensity > 0.58 ? "#052e16" : "hsl(var(--foreground))",
  };
};

export function CoordinatorDuplicateQuestionHeatMap({
  coordinatorId,
  enabled = true,
}: CoordinatorDuplicateQuestionHeatMapProps) {
  const now = useMemo(() => new Date(), []);
  const queryClient = useQueryClient();
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);
  const [periodMode, setPeriodMode] = useState<HeatMapPeriodMode>("year");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState(now.getDate());
  const [selectedBlock, setSelectedBlock] = useState(ALL_BLOCKS);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, error } = useCoordinatorDuplicateQuestionHeatMap(
    coordinatorId,
    enabled,
  );

  const blocks = data?.blocks ?? [];
  const isDistrictScope = data?.scope === "district";
  const activeBlock =
    selectedBlock === ALL_BLOCKS
      ? null
      : blocks.find((block) => block.block === selectedBlock) ?? null;
  const rowAxisLabel = isDistrictScope && !activeBlock ? "Blocks" : "Villages";
  const scopeLabel =
    data?.scope === "district"
      ? `${data?.district || "District"} blocks`
      : data?.scope === "block"
        ? `${data?.block || blocks[0]?.block || "Block"} villages`
        : `${blocks[0]?.block || "Block"} villages`;

  const allDetails = useMemo(
    () =>
      blocks.flatMap((block) =>
        block.villages.flatMap((village) => village.details),
      ),
    [blocks],
  );

  const yearOptions = useMemo(() => {
    const years = new Set(
      Array.from({ length: 6 }, (_, index) => now.getFullYear() - index),
    );
    allDetails.forEach((detail) => {
      const date = getDetailDate(detail);
      if (date) years.add(date.getFullYear());
    });

    return [...years].sort((a, b) => b - a);
  }, [allDetails, now]);

  const weekOptions = useMemo(
    () =>
      Array.from(
        { length: Math.ceil(getDaysInMonth(selectedYear, selectedMonth) / 7) },
        (_, index) => index + 1,
      ),
    [selectedMonth, selectedYear],
  );

  const dayOptions = useMemo(() => {
    if (periodMode === "day") {
      return getWeekDays(selectedYear, selectedMonth, selectedWeek);
    }

    return Array.from(
      { length: getDaysInMonth(selectedYear, selectedMonth) },
      (_, index) => index + 1,
    );
  }, [periodMode, selectedMonth, selectedWeek, selectedYear]);

  const buckets = useMemo<HeatMapBucket[]>(() => {
    if (periodMode === "year") {
      return shortMonthOptions.map((month, index) => ({
        key: `${selectedYear}-${String(index + 1).padStart(2, "0")}`,
        label: month,
        startDate: startOfDay(new Date(selectedYear, index, 1)),
        endDate: endOfDay(
          new Date(selectedYear, index, getDaysInMonth(selectedYear, index)),
        ),
      }));
    }

    if (periodMode === "month") {
      return weekOptions.map((week) => {
        const range = getWeekRange(selectedYear, selectedMonth, week);
        return {
          key: `${selectedYear}-${selectedMonth}-week-${week}`,
          label: `Week ${week}`,
          ...range,
        };
      });
    }

    if (periodMode === "week") {
      return getWeekDays(selectedYear, selectedMonth, selectedWeek).map((day) => ({
        key: `${selectedYear}-${selectedMonth}-${day}`,
        label: String(day),
        startDate: startOfDay(new Date(selectedYear, selectedMonth, day)),
        endDate: endOfDay(new Date(selectedYear, selectedMonth, day)),
      }));
    }

    return Array.from({ length: 24 }, (_, hour) => {
      const startDate = new Date(selectedYear, selectedMonth, selectedDay, hour);
      const endDate = new Date(selectedYear, selectedMonth, selectedDay, hour);
      endDate.setMinutes(59, 59, 999);

      return {
        key: `${selectedYear}-${selectedMonth}-${selectedDay}-${hour}`,
        label: `${String(hour).padStart(2, "0")}:00`,
        startDate,
        endDate,
      };
    });
  }, [
    periodMode,
    selectedDay,
    selectedMonth,
    selectedWeek,
    selectedYear,
    weekOptions,
  ]);

  const buildCells = (details: CoordinatorDuplicateQuestionDetail[]) =>
    buckets.map((bucket) => {
      const bucketDetails = details.filter((detail) => {
        const date = getDetailDate(detail);
        return (
          date &&
          date.getTime() >= bucket.startDate.getTime() &&
          date.getTime() <= bucket.endDate.getTime()
        );
      });

      return {
        bucket,
        count: bucketDetails.length,
        details: bucketDetails,
      };
    });

  const rows = useMemo<HeatMapRow[]>(() => {
    const sourceRows =
      isDistrictScope && !activeBlock
        ? blocks.map((block) => {
            const details = block.villages.flatMap((village) => village.details);
            const cells = buildCells(details);

            return {
              id: block.block,
              label: block.block,
              block: block.block,
              total: cells.reduce((sum, cell) => sum + cell.count, 0),
              cells,
            };
          })
        : (activeBlock ? [activeBlock] : blocks).flatMap((block) =>
            block.villages.map((village) => {
              const cells = buildCells(village.details);

              return {
                id: `${block.block}-${village.village}`,
                label: village.village,
                block: block.block,
                village: village.village,
                total: cells.reduce((sum, cell) => sum + cell.count, 0),
                cells,
              };
            }),
          );

    return sourceRows.sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label),
    );
  }, [activeBlock, blocks, buckets, isDistrictScope]);

  const selectedTotal = rows.reduce((sum, row) => sum + row.total, 0);
  const maxCount = Math.max(
    0,
    ...rows.flatMap((row) => row.cells.map((cell) => cell.count)),
  );

  const handleBlockChange = (block: string) => {
    setSelectedBlock(block);
    setSelectedCell(null);
  };

  const applyPeriodFilter = (
    mode: HeatMapPeriodMode,
    year: number,
    month: number,
    week: number,
    day: number,
  ) => {
    const maxWeek = Math.ceil(getDaysInMonth(year, month) / 7);
    const safeWeek = Math.min(week, maxWeek);
    const weekDays = getWeekDays(year, month, safeWeek);
    const maxDay = getDaysInMonth(year, month);
    let safeDay = Math.min(day, maxDay);

    if (mode === "day" && !weekDays.includes(safeDay)) {
      safeDay = weekDays[0] ?? safeDay;
    }

    setPeriodMode(mode);
    setSelectedYear(year);
    setSelectedMonth(month);
    setSelectedWeek(safeWeek);
    setSelectedDay(safeDay);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({
      queryKey: ["coordinator-duplicate-question-heat-map", coordinatorId],
    });
    setRefreshing(false);
  };

  const openCellDetails = (row: HeatMapRow, cell: HeatMapCell) => {
    setSelectedCell({
      location: row.village ? `${row.block} / ${row.village}` : row.block,
      period: cell.bucket.label,
      count: cell.count,
      details: cell.details,
    });
  };

  return (
    <>
      <Card className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-card via-card to-card/40 shadow-sm transition-shadow duration-300 hover:shadow-lg">
        <CardHeader className="gap-3 border-b border-border/50 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex items-center gap-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <MapPinned className="h-4 w-4 text-primary" />
              </div>
              <div className="leading-tight">
                <CardTitle className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
                  <span>Duplicate Question Heat Map</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help text-muted-foreground/60 hover:text-muted-foreground">
                        <InfoIcon className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Counts repeated question groups once per farmer. For
                      example, one farmer asking the same question 5 times is
                      counted as 1 duplicate group.
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  {scopeLabel} by selected period
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

          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
            className="flex flex-wrap items-center gap-2"
          >
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
                        layoutId="coordinatorDuplicatePeriodModeActive"
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

            {isDistrictScope && blocks.length > 0 && (
              <Select value={selectedBlock} onValueChange={handleBlockChange}>
                <SelectTrigger className="h-8 w-[180px] rounded-md border-border/70 px-2 text-xs shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BLOCKS}>All blocks</SelectItem>
                  {blocks.map((block) => (
                    <SelectItem key={block.block} value={block.block}>
                      {block.block}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

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
          </motion.div>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="flex flex-wrap items-center gap-1.5 text-[11px]"
          >
            <span className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/5 px-2 py-0.5 font-medium text-primary">
              <Copy className="h-3 w-3" />
              Duplicate Questions
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/40 px-2 py-0.5 font-semibold text-foreground">
              <span className="text-muted-foreground">Total:</span>
              <motion.span
                key={String(selectedTotal)}
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                className="tabular-nums"
              >
                {selectedTotal}
              </motion.span>
            </span>
            <span className="rounded border border-border/60 bg-background px-2 py-0.5 text-muted-foreground">
              Y: {rowAxisLabel}
            </span>
            <span className="rounded border border-border/60 bg-background px-2 py-0.5 text-muted-foreground">
              X:{" "}
              {periodModeOptions.find((item) => item.value === periodMode)?.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-0.5 text-muted-foreground">
              <Activity className="h-3 w-3" />
              Click a count for details
            </span>
          </motion.div>

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
                Failed to load duplicate question heat map.
              </motion.div>
            ) : blocks.length === 0 || buckets.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground"
              >
                No duplicate question data found for this coordinator hierarchy.
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
                        <th className="sticky left-0 z-30 min-w-[220px] border-b border-r border-border/60 bg-card px-3 py-2.5 text-left font-semibold text-foreground">
                          {rowAxisLabel}
                        </th>
                        {buckets.map((bucket) => (
                          <th
                            key={bucket.key}
                            className="min-w-[92px] border-b border-border/60 px-2 py-2.5 text-center font-semibold text-foreground"
                          >
                            {bucket.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rowIdx) => (
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
                          <th className="sticky left-0 z-10 min-w-[220px] border-r border-border/60 bg-background px-3 py-2 text-left font-medium text-foreground">
                            <span className="line-clamp-2">{row.label}</span>
                          </th>
                          {row.cells.map((cell) => (
                            <td
                              key={`${row.id}-${cell.bucket.key}`}
                              className="h-11 min-w-[92px] border-r border-border/30 p-1 text-center align-middle last:border-r-0"
                              title={`${row.label} - ${cell.bucket.label}: ${cell.count} duplicate questions`}
                            >
                              <motion.button
                                type="button"
                                whileHover={{ scale: cell.count ? 1.08 : 1 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 400,
                                  damping: 20,
                                }}
                                className="flex h-9 min-w-[78px] items-center justify-center rounded-md px-2 text-[11px] font-bold tabular-nums shadow-sm disabled:cursor-default"
                                style={getCellStyle(cell.count, maxCount)}
                                onClick={() => openCellDetails(row, cell)}
                                disabled={cell.count === 0}
                              >
                                {cell.count}
                              </motion.button>
                            </td>
                          ))}
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

      <Dialog
        open={Boolean(selectedCell)}
        onOpenChange={(open) => !open && setSelectedCell(null)}
      >
        <DialogContent className="flex max-h-[88vh] flex-col p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Duplicate Question Details</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {selectedCell?.location} / {selectedCell?.period} /{" "}
              {selectedCell?.count ?? 0} duplicate questions
            </p>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="space-y-3 p-6">
              {selectedCell?.details.length ? (
                selectedCell.details.map((detail) => (
                  <div
                    key={`${detail.userId}-${detail.question}-${detail.questionIds.join("-")}`}
                    className="rounded-md border bg-background p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                        Asked {detail.repeatCount} times
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(detail.firstAskedAt)} -{" "}
                        {formatDate(detail.lastAskedAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm font-medium">
                      {detail.question || "Question text not available"}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <span>
                        Village:{" "}
                        <span className="font-medium text-foreground">
                          {detail.village || "N/A"}
                        </span>
                      </span>
                      <span>
                        Farmer:{" "}
                        <span className="font-medium text-foreground">
                          {detail.userName || detail.email || detail.userId}
                        </span>
                      </span>
                      <span>
                        Question records:{" "}
                        <span className="font-medium text-foreground">
                          {detail.questionIds.length}
                        </span>
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No duplicate details for this selection.
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
