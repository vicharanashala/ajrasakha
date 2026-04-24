import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useState } from "react";
import { useUserGrowth } from "../hooks/useUserGrowth";
import Spinner from "@/components/atoms/spinner";

const formatYAxis = (value: number): string => {
  if (value >= 1000) return `${value / 1000}k`;
  return `${value}`; 
};

const UserGrowthChart = () => {
  const [range, setRange] = useState(30);

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

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">User Growth Trend</h2>

        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
          className="border px-2 py-1 rounded text-sm"
        >
          <option value={30}>Last 30 Days</option>
          <option value={60}>Last 60 Days</option>
          <option value={90}>Last 90 Days</option>
        </select>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => value.slice(5)}
          />

          <YAxis tickFormatter={formatYAxis} />

          <Tooltip />

          <Line
            type="monotone"
            dataKey="idsCreated"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="installs"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="activeUsers"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-green-500 rounded-full"></span>
          IDs Created
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
          Installs
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
          Active Users
        </div>
      </div>
    </div>
  );
};
export default UserGrowthChart;