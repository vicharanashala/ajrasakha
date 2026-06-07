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

const granularityOptions: Array<{
  value: FarmerHeatMapGranularity;
  label: string;
}> = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
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

export function FarmerAnalyticsHeatMap({
  source,
  userType,
  enabled = true,
}: FarmerAnalyticsHeatMapProps) {
  const [filters, setFilters] = useState(DEFAULT_FARMER_HEAT_MAP_FILTERS);
  const [metric, setMetric] =
    useState<FarmerHeatMapMetric>("totalQuestions");
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

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
        .map((row) => ({
          ...row,
          totalForMetric: row.cells.reduce(
            (sum, cell) => sum + (cell[metric] || 0),
            0,
          ),
        }))
        .sort((a, b) => b.totalForMetric - a.totalForMetric),
    [metric, rows],
  );

  const updateState = (state: string) => {
    setFilters((current) => ({
      ...current,
      state,
    }));
  };

  const updateGranularity = (granularity: FarmerHeatMapGranularity) => {
    setFilters((current) => ({
      ...current,
      granularity,
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SearchableSelect
            options={STATES}
            value={filters.state}
            onChange={updateState}
            placeholder="All States"
            className={selectClassName}
            activeClassName={activeSelectClassName}
          />

          <Select
            value={filters.granularity}
            onValueChange={(value) =>
              updateGranularity(value as FarmerHeatMapGranularity)
            }
          >
            <SelectTrigger className="h-9 rounded-md border-border/70 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {granularityOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={metric}
            onValueChange={(value) => setMetric(value as FarmerHeatMapMetric)}
          >
            <SelectTrigger className="h-9 rounded-md border-border/70 shadow-sm">
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

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-primary" />
            Coloring by {selectedMetric?.label ?? "Selected Metric"}
          </span>
          <span>
            Y-axis: {filters.state === "all" ? "States" : "Districts"}
          </span>
          <span>X-axis: {granularityOptions.find((item) => item.value === filters.granularity)?.label}</span>
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
