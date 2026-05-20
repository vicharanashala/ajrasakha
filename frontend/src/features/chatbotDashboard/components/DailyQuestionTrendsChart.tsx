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
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { BarChart2, AreaChart as AreaChartIcon, Eye, EyeOff } from "lucide-react";

interface DailyQuestionTrend {
  day: string;
  uniqueCount: number;
  duplicateCount: number;
}

interface DailyQuestionTrendsChartProps {
  trends?: DailyQuestionTrend[];
}

export function DailyQuestionTrendsChart({ trends = [] }: DailyQuestionTrendsChartProps) {
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const [showUnique, setShowUnique] = useState(true);
  const [showDuplicate, setShowDuplicate] = useState(true);

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

  // Custom tooltips with clear breakdown
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#18181b]/95 border border-[#27272a] p-3 rounded-lg shadow-xl backdrop-blur-sm text-xs space-y-1.5">
          <p className="font-semibold text-gray-200">{formatDateLabel(label)}</p>
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

  if (!trends || trends.length === 0) {
    return (
      <Card className="border border-border dark:bg-card/50 backdrop-blur-md rounded-xl shadow-lg p-6 flex flex-col justify-center items-center h-[440px]">
        <p className="text-muted-foreground text-sm">No daily question trend data available.</p>
      </Card>
    );
  }

  return (
    <Card className="border border-border/60 dark:bg-card/40 backdrop-blur-md rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl flex flex-col h-[440px]">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-border/40 gap-4 shrink-0">
        <div>
          <CardTitle className="text-base font-semibold tracking-wide text-foreground">
            Daily Question Trends
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Breakdown of unique vs duplicate chatbot questions asked daily
          </p>
        </div>

        {/* Chart View and Series Selectors */}
        <div className="flex items-center gap-2 flex-nowrap shrink-0">
          <div className="flex bg-[#27272a]/20 p-1 rounded-lg border border-border/40 text-xs shrink-0">
            <Button
              variant={chartType === "area" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setChartType("area")}
            >
              <AreaChartIcon className="w-3.5 h-3.5" />
              Area
            </Button>
            <Button
              variant={chartType === "bar" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setChartType("bar")}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Bar
            </Button>
          </div>

          <div className="flex items-center gap-1 text-xs shrink-0">
            <Button
              variant="outline"
              size="sm"
              className={`h-7 px-2 text-xs gap-1 border-emerald-500/20 hover:bg-emerald-500/10 ${showUnique ? "text-emerald-400 bg-emerald-500/5" : "text-muted-foreground"}`}
              onClick={() => setShowUnique(!showUnique)}
            >
              {showUnique ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Unique
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`h-7 px-2 text-xs gap-1 border-amber-500/20 hover:bg-amber-500/10 ${showDuplicate ? "text-amber-400 bg-amber-500/5" : "text-muted-foreground"}`}
              onClick={() => setShowDuplicate(!showDuplicate)}
            >
              {showDuplicate ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Duplicate
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 pb-4 pl-2 pr-4 flex-1 min-h-0">
        <div className="w-full h-full min-h-[300px] relative">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "area" ? (
              <AreaChart data={trends} margin={{ top: 10, right: 10, left: -10, bottom: 15 }}>
                <defs>
                  <linearGradient id="colorUnique" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDuplicate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
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
                {showUnique && (
                  <Area
                    type="monotone"
                    dataKey="uniqueCount"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorUnique)"
                    name="uniqueCount"
                  />
                )}
                {showDuplicate && (
                  <Area
                    type="monotone"
                    dataKey="duplicateCount"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorDuplicate)"
                    name="duplicateCount"
                  />
                )}
              </AreaChart>
            ) : (
              <BarChart data={trends} margin={{ top: 10, right: 10, left: -10, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
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
                {showUnique && (
                  <Bar
                    dataKey="uniqueCount"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    name="uniqueCount"
                    maxBarSize={30}
                  />
                )}
                {showDuplicate && (
                  <Bar
                    dataKey="duplicateCount"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                    name="duplicateCount"
                    maxBarSize={30}
                  />
                )}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
