import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { BarChart2, AreaChart as AreaChartIcon, CalendarIcon, RefreshCcw, InfoIcon, RefreshCw } from "lucide-react";
import { Calendar } from "@/components/atoms/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/atoms/skeleton";
import { Tooltip as ShadcnTooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { useQueryClient } from "@tanstack/react-query";

interface DailyQuestionTrend {
  day: string;
  uniqueCount: number;
  duplicateCount: number;
}

interface DailyQuestionTrendsChartProps {
  trends?: DailyQuestionTrend[];
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  isLoading?: boolean;
}

export function DailyQuestionTrendsChart({
  trends = [],
  dateRange,
  onDateRangeChange,
  isLoading = false,
}: DailyQuestionTrendsChartProps) {
  const [chartType, setChartType] = useState<"area" | "bar">("area");

  // Format Y-axis tick values to be clean
  const formatYAxis = (value: number): string => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return `${value}`;
  };

  // Format date strings for nicer display
  const formatDateLabel = (dateStr: string): string => {
    try {
      const date = new Date(dateStr + "T00:00:00");
      return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    } catch {
      return dateStr;
    }
  };
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async ()=>{
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["daily-question-trends"] });
    setRefreshing(false);
  }

  // Custom tooltips with clear breakdown
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#18181b]/95 border border-[#27272a] p-3 rounded-lg shadow-xl backdrop-blur-sm text-xs space-y-1.5">
          <p className="font-semibold text-gray-200">
  {payload?.[0]?.payload?.day
    ? formatDateLabel(payload[0].payload.day)
    : ""}
</p>
          {payload.map((item: any) => (
            <div key={item.name} className="flex items-center justify-between gap-4">
              <span style={{ color: item.color }} className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name === "uniqueCount" ? "Unique Questions" : "Duplicate Questions"}:
              </span>
              <span className="font-bold text-gray-100">{item.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card
      className="border border-border/60  backdrop-blur-md rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl flex flex-col h-auto sm:h-[400px]          bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     
"
    >
      <CardHeader className="flex flex-col xl:flex-row justify-between items-start xl:items-center pb-4 border-b border-border/40 gap-4 shrink-0">
        <div>
          <CardTitle className="text-base font-semibold tracking-wide text-foreground flex items-center gap-1.5">
            <span>Daily Question Trends</span>
            <ShadcnTooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground">
                  <InfoIcon className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Visualizes daily volume of questions, highlighting unique vs duplicate questions.
              </TooltipContent>
            </ShadcnTooltip>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Breakdown of unique vs duplicate chatbot questions asked daily
          </p>
        </div>

        {/* Filters & Selector Row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full xl:w-auto justify-end">
          <button
            onClick={handleRefresh}
            className=" rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
            title="Refresh"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 bg-background ${
                refreshing ? "animate-spin" : ""
              }`}
            />
          </button>
          {/* Calendar Picker */}
          <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 justify-start text-left font-normal bg-[#27272a]/10 border-border/40 text-foreground hover:bg-[#27272a]/20 w-full sm:w-[180px] shrink-0"
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-[#3AAA5A]" />
                  <span className="truncate">
                    {dateRange?.from
                      ? dateRange.to
                        ? `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd")}`
                        : format(dateRange.from, "MMM dd")
                      : "All time"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 border-border bg-background text-foreground"
                align="end"
              >
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from ?? new Date()}
                  selected={dateRange}
                  onSelect={onDateRangeChange}
                  numberOfMonths={1}
                  className="bg-background text-foreground"
                />
              </PopoverContent>
            </Popover>
            {dateRange && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => onDateRangeChange?.(undefined)}
                title="Clear date filter"
                className="h-8 w-8 shrink-0 bg-[#27272a]/10 border-border/40 text-foreground hover:bg-[#27272a]/20"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Chart View Selector */}
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
            <div className="flex bg-[#27272a]/20 p-1 rounded-lg border border-border/40 text-xs shrink-0 w-full sm:w-auto justify-between sm:justify-start">
              <Button
                variant={chartType === "area" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-3 text-xs gap-1 flex-1 sm:flex-initial"
                onClick={() => setChartType("area")}
              >
                <AreaChartIcon className="w-3.5 h-3.5" />
                Area
              </Button>
              <Button
                variant={chartType === "bar" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-3 text-xs gap-1 flex-1 sm:flex-initial"
                onClick={() => setChartType("bar")}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Bar
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 pb-4 pl-2 pr-4 flex-1 min-h-0 relative">
        {(refreshing || isLoading) && (
          <div className="absolute inset-0 z-10 rounded-b-xl bg-background/70 p-4 backdrop-blur-[1px]">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        )}

        {!trends || trends.length === 0 ? (
          <div className="w-full h-[300px] sm:h-full flex flex-col justify-center items-center">
            <p className="text-muted-foreground text-sm">
              No daily question trend data available.
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              Try adjusting the date range to see results
            </p>
          </div>
        ) : (
          <div className="w-full h-[300px] sm:h-full relative">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "area" ? (
                <AreaChart
                  data={trends}
                  margin={{ top: 10, right: 10, left: -10, bottom: 15 }}
                >
                  <defs>
                    <linearGradient
                      id="colorUnique"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#10b981"
                        stopOpacity={0.25}
                      />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient
                      id="colorDuplicate"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#f59e0b"
                        stopOpacity={0.25}
                      />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgba(255,255,255,0.04)"
                  />
                  <XAxis
                    dataKey="day"
                    tickFormatter={formatDateLabel}
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10, fill: "#71717a" }}
                    dy={5}
                  />
                  <YAxis
                    tickFormatter={formatYAxis}
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10, fill: "#71717a" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="uniqueCount"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorUnique)"
                    name="uniqueCount"
                  />
                  <Area
                    type="monotone"
                    dataKey="duplicateCount"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorDuplicate)"
                    name="duplicateCount"
                  />
                </AreaChart>
              ) : (
                <BarChart
                  data={trends}
                  margin={{ top: 10, right: 10, left: -10, bottom: 15 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgba(255,255,255,0.04)"
                  />
                  <XAxis
                    dataKey="day"
                    tickFormatter={formatDateLabel}
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10, fill: "#71717a" }}
                    dy={5}
                  />
                  <YAxis
                    tickFormatter={formatYAxis}
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10, fill: "#71717a" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="uniqueCount"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    name="uniqueCount"
                    maxBarSize={30}
                  />
                  <Bar
                    dataKey="duplicateCount"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                    name="duplicateCount"
                    maxBarSize={30}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
