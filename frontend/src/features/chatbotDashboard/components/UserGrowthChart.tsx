import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { DateRange } from "react-day-picker";
import { useUserGrowth } from "../hooks/useUserGrowth";
import Spinner from "@/components/atoms/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Maximize2, X, CalendarIcon, RefreshCcw } from "lucide-react";
import { Calendar } from "@/components/atoms/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { Button } from "@/components/atoms/button";
import { format, subDays } from "date-fns";

const formatYAxis = (value: number): string => {
  if (value >= 1000) return `${value / 1000}k`;
  return `${value}`;
};

const getTickInterval = (points: number): number => {
  if (points > 75) return 6;
  if (points > 45) return 4;
  if (points > 30) return 2;
  return 0;
};

const metricsConfig = [
  {
    key: "idsCreated",
    label: "IDs Created",
    color: "#22c55e",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  {
    key: "installs",
    label: "Installs",
    color: "#3b82f6",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    key: "activeUsers",
    label: "Active Users",
    color: "#a855f7",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
];

const defaultDateRange: DateRange = {
  from: subDays(new Date(), 29),
  to: new Date(),
};

const UserGrowthChart = ({source}) => {

  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultDateRange);
  const [activeMetrics, setActiveMetrics] = useState(
    metricsConfig.map((m) => m.key)
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const { data, isLoading, isError } = useUserGrowth(source, dateRange?.from, dateRange?.to);

  if (isLoading) {
    return (
      <Card className="h-full min-h-[300px] flex items-center justify-center dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
        <Spinner text="Loading chart..." />
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card className="h-full min-h-[300px] flex items-center justify-center text-destructive dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
        Error loading chart.
      </Card>
    );
  }

  const chartData = data.labels.map((date, index) => ({
    date,
    idsCreated: data.series.idsCreated[index],
    installs: data.series.installs[index],
    activeUsers: data.series.activeUsers[index],
  }));
  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) =>
      prev.includes(key)
        ? prev.filter((m) => m !== key)
        : [...prev, key]
    );
  };
  const resetDateRange = () => {
    setDateRange({
      from: subDays(new Date(), 29),
      to: new Date(),
    });
  };
  const tickInterval = getTickInterval(chartData.length);
  const visibleMetricCount = activeMetrics.length;
  const isAllMetricsActive = visibleMetricCount === metricsConfig.length;
  const maxBarSize =
    visibleMetricCount >= 3
      ? chartData.length > 75
        ? 24
        : chartData.length > 45
        ? 32
        : 50
      : chartData.length > 75
      ? 8
      : chartData.length > 45
      ? 12
      : 18;
  const minPointSize = 4;
  const minChartWidth = isAllMetricsActive
    ? Math.max(chartData.length * 36, 1100)
    : 0;

  const renderChart = (height: number, tickFontSize: number) => (
    <div
      className={isAllMetricsActive ? "w-full overflow-x-auto" : "w-full"}
      style={{ height }}
    >
      <div
        className="h-full"
        style={{ minWidth: minChartWidth ? `${minChartWidth}px` : "100%" }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            barGap={visibleMetricCount >= 3 ? 0 : chartData.length > 45 ? 2 : 6}
            barCategoryGap={
              visibleMetricCount >= 3
                ? chartData.length > 45
                  ? "4%"
                  : "8%"
                : chartData.length > 45
                ? "20%"
                : "12%"
            }
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--color-border, #e2e8f0)"
            />

            <XAxis
              dataKey="date"
              stroke="var(--color-muted-foreground, #64748b)"
              tick={{ fontSize: tickFontSize }}
              tickLine={false}
              axisLine={false}
              interval={tickInterval}
              minTickGap={20}
              tickFormatter={(value) => value.slice(5)}
            />

            <YAxis
              tickFormatter={formatYAxis}
              stroke="var(--color-muted-foreground, #64748b)"
              tick={{ fontSize: tickFontSize }}
              tickLine={false}
              axisLine={false}
              width={34}
            />

            <Tooltip
              cursor={{ fill: "var(--color-muted, #f1f5f9)", opacity: 0.4 }}
              contentStyle={{
                background: "#1f1f1f",
                border: "1px solid #333",
                borderRadius: "8px",
                color: "#fff",
              }}
            />

            {metricsConfig.map((m) => {
              if (!activeMetrics.includes(m.key)) return null;
              const dim = hovered && hovered !== m.key;
              return (
                <Bar
                  key={m.key}
                  dataKey={m.key}
                  fill={m.color}
                  radius={[4, 4, 0, 0]}
                  opacity={dim ? 0.25 : 0.92}
                  maxBarSize={maxBarSize}
                  minPointSize={minPointSize}
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth={hovered === m.key ? 1.5 : 1}
                  background={{ fill: "rgba(148,163,184,0.08)" }}
                  onMouseEnter={() => setHovered(m.key)}
                  onMouseLeave={() => setHovered(null)}
                  className="dark:[filter:drop-shadow(0px_2px_6px_rgba(0,0,0,0.35))]"
                />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderDateRangePicker = (
    className = "",
    popoverClassName = ""
  ) => (
    <div className={`flex items-center gap-2 ${className}`}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="justify-start text-left font-normal bg-gray-100 dark:bg-[#2a2a2a] border-gray-300 dark:border-[#3a3a3a] text-gray-700 dark:text-gray-200 max-w-full whitespace-normal h-auto min-h-10 flex-1"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`
              ) : (
                format(dateRange.from, "MMM dd, yyyy")
              )
            ) : (
              "Select date range"
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className={`w-auto p-0 ${popoverClassName}`} align="end">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={setDateRange}
            numberOfMonths={1}
          />
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon"
        onClick={resetDateRange}
        title="Reset to last 30 days"
        className="shrink-0 bg-gray-100 dark:bg-[#2a2a2a] border-gray-300 dark:border-[#3a3a3a] text-gray-700 dark:text-gray-200"
      >
        <RefreshCcw className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <>
      <Card className={"flex flex-col h-full  shadow-sm overflow-hidden relative dark:border-[#2a2a2a]  bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300"}>
        <button
          onClick={() => setIsMaximized(true)}
          className="absolute top-4 right-4 p-1.5 rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm z-20"
          title="Maximize chart"
        >
          <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>

        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 pr-10 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm font-medium">User Growth Trend</CardTitle>
            </div>

            {renderDateRangePicker("w-full sm:w-auto sm:max-w-[420px]")}
          </div>
        </CardHeader>

        <CardContent className="flex-1 pb-4">
          <div className="flex gap-2 mb-4 flex-wrap">
            {metricsConfig.map((m) => {
              const active = activeMetrics.includes(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => toggleMetric(m.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${m.bg} ${m.border} ${
                    active ? "opacity-100" : "opacity-40 grayscale"
                  }`}
                  style={{ color: m.color }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {renderChart(300, 11)}
        </CardContent>
      </Card>

      {isMaximized &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={() => setIsMaximized(false)}
          >
            <div
              className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-6xl w-full max-h-[calc(100vh-4rem)] overflow-y-auto p-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsMaximized(false)}
                className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>

              <div className="mb-6 pr-12">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                      User Growth Trend
                    </h3>
                  </div>

                  {renderDateRangePicker(
                    "w-full md:w-auto md:min-w-[320px] md:max-w-[480px]",
                    "z-[10001]"
                  )}
                </div>
              </div>

              {/* Metric toggles */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {metricsConfig.map((m) => {
                  const active = activeMetrics.includes(m.key);
                  return (
                    <button
                      key={m.key}
                      onClick={() => toggleMetric(m.key)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${m.bg} ${m.border} ${
                        active ? "opacity-100" : "opacity-40 grayscale"
                      }`}
                      style={{ color: m.color }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {/* Chart (left) + Table (right) */}
              <div className="flex gap-4 items-start">
                {/* Chart — 65% */}
                <div className="flex-[65] min-w-0 relative">
                  <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-700 z-10" />
                  <div className="absolute left-0 right-0 bottom-0 h-px bg-gray-300 dark:bg-gray-700 z-10" />
                  {renderChart(460, 13)}
                </div>

                {/* Table — 35% */}
                <div className="flex-[35] min-w-0 max-h-[460px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">Date</th>
                        {metricsConfig.filter((m) => activeMetrics.includes(m.key)).map((m) => (
                          <th key={m.key} className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: m.color }}>
                            {m.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row, idx) => (
                        <tr key={idx} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">{row.date}</td>
                          {metricsConfig.filter((m) => activeMetrics.includes(m.key)).map((m) => (
                            <td key={m.key} className="px-3 py-1.5 text-right font-medium text-gray-900 dark:text-gray-100">
                              {(row[m.key as keyof typeof row] as number).toLocaleString()}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
export default UserGrowthChart;
