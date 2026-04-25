import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
} from "recharts";
import { useState } from "react";
import { useUserGrowth } from "../hooks/useUserGrowth";
import Spinner from "@/components/atoms/spinner";

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
  const { data, isLoading, isError } = useUserGrowth(range);

  if (isLoading) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <Spinner text="Loading chart..." />
      </div>
    );
  }
  if (isError || !data) return <div>Error loading chart</div>;

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
  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] p-5 rounded-xl">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">User Growth Trend</h2>

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

      <div className="flex gap-2 mb-4 flex-wrap">
        {metricsConfig.map((m) => {
          const active = activeMetrics.includes(m.key);
          return (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all
                ${m.bg} ${m.border}
                ${active
                  ? "opacity-100"
                  : "opacity-40 grayscale"
                }`}
              style={{ color: m.color }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <defs>
            {metricsConfig.map((m) => (
              <linearGradient
                key={m.key}
                id={`grad-${m.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={m.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={m.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />

          <XAxis
            dataKey="date"
            stroke="#6b7280"
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => value.slice(5)}
          />

          <YAxis tickFormatter={formatYAxis} stroke="#6b7280" width={40} />

          <Tooltip
            contentStyle={{
              background: "#1f1f1f",
              border: "1px solid #333",
              borderRadius: "8px",
              color: "#fff",
            }}
          />

          {metricsConfig.flatMap((m) => {
            if (!activeMetrics.includes(m.key)) return [];
            const dim = hovered && hovered !== m.key;
            return [
              <Area
                key={`${m.key}-area`}
                type="monotone"
                dataKey={m.key}
                fill={`url(#grad-${m.key})`}
                stroke="none"
              />,
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={hovered === m.key ? 3.5 : 3}
                dot={false}
                opacity={dim ? 0.25 : 1}
                onMouseEnter={() => setHovered(m.key)}
                onMouseLeave={() => setHovered(null)}
                // className="[filter:drop-shadow(0px_1px_2px_rgba(0,0,0,0.08))] dark:[filter:drop-shadow(0px_2px_6px_rgba(0,0,0,0.5))]"
                className="dark:[filter:drop-shadow(0px_2px_6px_rgba(0,0,0,0.5))]"
              />,
            ];
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
export default UserGrowthChart;
