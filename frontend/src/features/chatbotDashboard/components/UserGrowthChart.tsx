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
import { useUserGrowth } from "../hooks/useUserGrowth";
import Spinner from "@/components/atoms/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Maximize2, X } from "lucide-react";

const formatYAxis = (value: number): string => {
  if (value >= 1000) return `${value / 1000}k`;
  return `${value}`;
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

const UserGrowthChart = () => {
  const [range, setRange] = useState(30);
  const [activeMetrics, setActiveMetrics] = useState(
    metricsConfig.map((m) => m.key)
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const { data, isLoading, isError } = useUserGrowth(range);

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

  const renderChart = (height: number, tickFontSize: number) => (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} barGap={6} barCategoryGap="20%">
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
            tickFormatter={(value) => value.slice(5)}
          />

          <YAxis
            tickFormatter={formatYAxis}
            stroke="var(--color-muted-foreground, #64748b)"
            tick={{ fontSize: tickFontSize }}
            tickLine={false}
            axisLine={false}
            width={40}
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
                radius={[6, 6, 0, 0]}
                opacity={dim ? 0.25 : 1}
                onMouseEnter={() => setHovered(m.key)}
                onMouseLeave={() => setHovered(null)}
                className="dark:[filter:drop-shadow(0px_2px_6px_rgba(0,0,0,0.35))]"
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <>
      <Card className="flex flex-col h-full bg-white dark:bg-[#1a1a1a] shadow-sm overflow-hidden relative dark:border-[#2a2a2a]">
        <button
          onClick={() => setIsMaximized(true)}
          className="absolute top-4 right-4 p-1.5 rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm z-20"
          title="Maximize chart"
        >
          <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 pr-10">
            <div>
              <CardTitle className="text-sm font-medium">User Growth Trend</CardTitle>
            </div>

            <select
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
              className="bg-gray-100 dark:bg-[#2a2a2a] border border-gray-300 dark:border-[#3a3a3a] text-sm px-3 py-1.5 rounded-md text-gray-700 dark:text-gray-200"
            >
              <option value={30}>Last 30 Days</option>
              <option value={60}>Last 60 Days</option>
              <option value={90}>Last 90 Days</option>
            </select>
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
              className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-6xl w-full p-6 relative"
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
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                      User Growth Trend
                    </h3>
                  </div>

                  <select
                    value={range}
                    onChange={(e) => setRange(Number(e.target.value))}
                    className="bg-gray-100 dark:bg-[#2a2a2a] border border-gray-300 dark:border-[#3a3a3a] text-sm px-3 py-1.5 rounded-md text-gray-700 dark:text-gray-200"
                  >
                    <option value={30}>Last 30 Days</option>
                    <option value={60}>Last 60 Days</option>
                    <option value={90}>Last 90 Days</option>
                  </select>
                </div>
              </div>

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

              <div className="w-full relative">
                <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-700 z-10" />
                <div className="absolute left-0 right-0 bottom-0 h-px bg-gray-300 dark:bg-gray-700 z-10" />
                {renderChart(500, 13)}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
export default UserGrowthChart;
