import { useMemo } from "react";
import type { ComponentType, CSSProperties } from "react";
import { CalendarIcon, CloudRain, Droplets, RefreshCcw, Thermometer, Wind, Cloud, Zap, X, CloudSun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { SearchableSelect } from "@/components/atoms/SearchableSelect";
import {
  DISTRICTS,
  SEASONS,
  STATES,
  WEATHER_CONCERN_LABELS,
} from "@/components/MetaData";
import { Spinner } from "@/components/atoms/spinner";
import { Calendar } from "@/components/atoms/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  type WeatherConcernFilters,
  useWeatherConcernAnalytics,
} from "../hooks/useWeatherConcernAnalytics";

interface WeatherConcernAnalyticsCardProps {
  source: "vicharanashala" | "annam";
  userType: "all" | "external" | "internal";
  filters: WeatherConcernFilters;
  onFiltersChange: (filters: WeatherConcernFilters) => void;
}

type WeatherConcernSelectFilter = "season" | "state" | "district";

const CONCERN_STYLES: Record<
  string,
  {
    color: string;
    bg: string;
    icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  }
> = {
  Rain: {
    color: "#378ADD",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: CloudRain,
  },
  "Heavy Rain": {
    color: "#0369A1",
    bg: "bg-sky-50 dark:bg-sky-950/30",
    icon: CloudRain,
  },
  Flood: {
    color: "#0EA5E9",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
    icon: CloudRain,
  },
  Waterlogging: {
    color: "#06B6D4",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
    icon: Droplets,
  },
  Monsoon: {
    color: "#14B8A6",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    icon: CloudRain,
  },
  Heat: {
    color: "#DC2626",
    bg: "bg-red-50 dark:bg-red-950/30",
    icon: Thermometer,
  },
  Temperature: {
    color: "#F97316",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    icon: Thermometer,
  },
  Cold: {
    color: "#3B82F6",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: Cloud,
  },
  Frost: {
    color: "#60A5FA",
    bg: "bg-blue-100 dark:bg-blue-950/40",
    icon: Cloud,
  },
  "Hot Weather": {
    color: "#EF4444",
    bg: "bg-red-50 dark:bg-red-950/30",
    icon: Thermometer,
  },
  Humidity: {
    color: "#14B8A6",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    icon: Droplets,
  },
  Moisture: {
    color: "#2DD4BF",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
    icon: Droplets,
  },
  
  Wind: {
    color: "#8B5CF6",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    icon: Wind,
  },
  Storm: {
    color: "#7C3AED",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    icon: Zap,
  },
  Cyclone: {
    color: "#6D28D9",
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    icon: Wind,
  },
  Others: {
    color: "#64748B",
    bg: "bg-slate-50 dark:bg-slate-900/40",
    icon: Cloud,
  },
};

const selectClassName =
  "h-9 w-full justify-between rounded-md border border-border/70 bg-background px-3 text-sm text-muted-foreground shadow-sm";

const activeSelectClassName =
  "h-9 w-full justify-between rounded-md border border-[#3AAA5A] bg-green-50 px-3 text-sm font-medium text-green-700 shadow-sm dark:bg-green-950/20 dark:text-green-300";

export function WeatherConcernAnalyticsCard({
  source,
  userType,
  filters,
  onFiltersChange,
}: WeatherConcernAnalyticsCardProps) {
  const { data, isLoading, error, refetch, isFetching } =
    useWeatherConcernAnalytics(filters, source, userType);

  const districtOptions = useMemo(() => {
    if (filters.state === "all") return [];
    return DISTRICTS[filters.state] ?? [];
  }, [filters.state]);

  const updateFilter = (
    key: WeatherConcernSelectFilter,
    value: string,
  ) => {
    if (key === "state") {
      onFiltersChange({
        ...filters,
        state: value,
        district: "all",
        // block: "",
        // village: "all",
      });
      return;
    }

    if (key === "district") {
      onFiltersChange({
        ...filters,
        district: value,
        // block: "",
        // village: "all",
      });
      return;
    }

    onFiltersChange({...filters, [key]: value});
  };

  const selectedDateRange: DateRange | undefined =
    filters.startDate || filters.endDate
      ? {from: filters.startDate, to: filters.endDate}
      : undefined;

  const handleDateRangeChange = (range: DateRange | undefined) => {
    const startDate = range?.from ? new Date(range.from) : undefined;
    const endDate = range?.to ? new Date(range.to) : undefined;
    startDate?.setHours(0, 0, 0, 0);
    endDate?.setHours(23, 59, 59, 999);

    onFiltersChange({
      ...filters,
      startDate,
      endDate,
    });
  };

  const total = data?.summary.totalWeatherQueries ?? 0;
  const topConcern = data?.summary.topConcern ?? "None";
  const concernDistribution = useMemo(() => {
    const backendRows = data?.concernDistribution ?? [];
    const rowMap = new Map(backendRows.map((row) => [row.concern, row]));

    return [...Object.values(WEATHER_CONCERN_LABELS), "Others"].map((concern) => ({
      concern,
      count: rowMap.get(concern)?.count ?? 0,
      percentage: rowMap.get(concern)?.percentage ?? 0,
    }));
  }, [data?.concernDistribution]);

  return (
    <Card className="border border-border/60 bg-white shadow-sm dark:bg-[#1a1a1a]">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-wide text-foreground">
              <CloudSun className="h-5 w-5 text-primary" />
              <span>Weather Concern Analytics</span>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Concern distribution from weather-related chatbot queries
            </p>
          </div>

          {/* <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 w-full gap-2 lg:w-auto"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </Button> */}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SearchableSelect
            options={SEASONS}
            value={filters.season}
            onChange={(value) => updateFilter("season", value)}
            placeholder="All Seasons"
            className={selectClassName}
            activeClassName={activeSelectClassName}
          />

          <SearchableSelect
            options={STATES}
            value={filters.state}
            onChange={(value) => updateFilter("state", value)}
            placeholder="All States"
            className={selectClassName}
            activeClassName={activeSelectClassName}
          />

          <SearchableSelect
            options={districtOptions}
            value={filters.district}
            onChange={(value) => updateFilter("district", value)}
            placeholder={
              filters.state === "all" ? "Select State First" : "All Districts"
            }
            className={selectClassName}
            activeClassName={activeSelectClassName}
          />

          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 flex-1 justify-start gap-2 rounded-md border-border/70 px-3 text-left text-sm font-normal shadow-sm"
                >
                  <CalendarIcon className="h-4 w-4 text-[#3AAA5A]" />
                  <span className="truncate">
                    {filters.startDate
                      ? filters.endDate
                        ? `${format(filters.startDate, "MMM dd, yyyy")} - ${format(filters.endDate, "MMM dd, yyyy")}`
                        : format(filters.startDate, "MMM dd, yyyy")
                      : "All Dates"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  selected={selectedDateRange}
                  defaultMonth={filters.startDate ?? new Date()}
                  onSelect={handleDateRangeChange}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>

            {(filters.startDate || filters.endDate) && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => handleDateRangeChange(undefined)}
                title="Clear date range"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* <Input
            value={filters.block}
            onChange={(event) => updateFilter("block", event.target.value)}
            placeholder="All Blocks"
            className="h-9 rounded-md border-border/70 text-sm shadow-sm"
          /> */}

          {/* <SearchableSelect
            options={VILLAGES}
            value={filters.village}
            onChange={(value) => updateFilter("village", value)}
            placeholder="All Villages"
            className={selectClassName}
            activeClassName={activeSelectClassName}
          /> */}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border/60 bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Weather Queries
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {total.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Top Concern
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {topConcern}
            </p>
          </div>
          {/* <div className="rounded-md border border-border/60 bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Timeline Months
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {(data?.timeline.length ?? 0).toLocaleString()}
            </p>
          </div> */}
        </div>

        <div className="relative min-h-[220px]">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/70 backdrop-blur-sm">
              <Spinner text="Loading weather concerns..." />
            </div>
          )}

          {error ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-md border border-destructive/30 text-sm text-destructive">
              Failed to load weather concern analytics.
            </div>
          ) : total === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-md border border-border/60 text-sm text-muted-foreground">
              No weather concern data found for the selected filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {concernDistribution.map((item) => {
                const style =
                  CONCERN_STYLES[item.concern] ?? CONCERN_STYLES.Rain;
                const Icon = style.icon;

                return (
                  <div
                    key={item.concern}
                    className="rounded-md border border-border/60 bg-background p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${style.bg}`}
                        >
                          <Icon
                            className="h-4 w-4"
                            style={{ color: style.color }}
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {item.concern}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.count.toLocaleString()} queries
                          </p>
                        </div>
                      </div>
                      <span className="text-xl font-semibold text-foreground">
                        {item.percentage}%
                      </span>
                    </div>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(item.percentage, 100)}%`,
                          backgroundColor: style.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
