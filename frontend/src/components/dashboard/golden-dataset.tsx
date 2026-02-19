"use client";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Database, CheckCircle2, Users} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../atoms/select";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import CountUp from "react-countup";
import { useRestartOnView } from "@/hooks/ui/useRestartView";

const monthNames = [
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

export interface GoldenDataset {
  type: "year" | "month" | "week" | "day";
  totalEntriesByType: number;
  verifiedEntries: number;
  todayApproved?:number;
  moderatorBreakdown?: { moderatorName: string, count: number }[];
  yearData: { month: string; entries: number; verified: number }[];
  weeksData: { week: string; entries: number; verified: number }[];
  dailyData: { day: string; entries: number; verified: number }[];
  dayHourlyData: Record<
    string,
    { hour: string; entries: number; verified: number }[]
  >;
}

export interface GoldenDatasetOverviewProps {
  data: GoldenDataset;
  viewType: "year" | "month" | "week" | "day";
  setViewType: (v: "year" | "month" | "week" | "day") => void;
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  selectedYear: string;
  setSelectedYear: (m: string) => void;
  selectedWeek: string;
  setSelectedWeek: (w: string) => void;
  selectedDay: string;
  setSelectedDay: (d: string) => void;
}

export const GoldenDatasetOverview = ({
  data,
  viewType,
  selectedYear,
  setSelectedYear,
  setViewType,
  selectedMonth,
  setSelectedMonth,
  selectedWeek,
  setSelectedWeek,
  selectedDay,
  setSelectedDay,
}: GoldenDatasetOverviewProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {ref,key} = useRestartOnView()

  const getLast10Years = () => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => currentYear - i);
  };

  const getTotals = () => {
    if (viewType === "year") {
      const total = data?.yearData?.reduce((sum, d) => sum + d?.entries, 0);
      const verified = data?.yearData?.reduce((sum, d) => sum + d?.verified, 0);
      return {
        total,
        verified,
        lastEntry: data?.yearData[data?.yearData.length - 1].entries,
      };
    } else if (viewType === "month") {
      const total = data?.weeksData?.reduce((sum, d) => sum + d?.entries, 0);
      const verified = data?.weeksData?.reduce(
        (sum, d) => sum + d?.verified,
        0,
      );
      return { total, verified, lastEntry: total };
    } else if (viewType === "week") {
      const total = data?.dailyData?.reduce((sum, d) => sum + d?.entries, 0);
      const verified = data?.dailyData?.reduce(
        (sum, d) => sum + d?.verified,
        0,
      );
      return { total, verified, lastEntry: total };
    } else {
      const dayData =
        data?.dayHourlyData[selectedDay as keyof typeof data.dayHourlyData];
      const total = dayData?.reduce((sum, d) => sum + d?.entries, 0);
      const verified = dayData?.reduce((sum, d) => sum + d?.verified, 0);
      return { total, verified, lastEntry: total };
    }
  };

  // const totals = getTotals();

  const getChartData = () => {
    if (viewType === "year") return data?.yearData;
    if (viewType === "month") return data?.weeksData;
    if (viewType === "week") return data?.dailyData;
    if (!data.dayHourlyData || !selectedDay) return undefined;
    return data.dayHourlyData[selectedDay as keyof typeof data.dayHourlyData];
  };

  const getChartLabel = () => {
    if (viewType === "year") return "Monthly Overview - All 12 Months";
    if (viewType === "month") return `${selectedMonth} - Weekly Breakdown`;
    if (viewType === "week")
      return `${selectedMonth} ${selectedWeek} - Daily Breakdown`;
    return `${selectedMonth} ${selectedWeek} ${selectedDay} - Hourly Breakdown`;
  };

  const chartData = getChartData();

   const moderatorBreakdown = data?.moderatorBreakdown ?? [];
  const totalApprovals = moderatorBreakdown.reduce(
    (sum, mod) => sum + mod.count,
    0
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Total Entries
                </p>
                <p className="text-3xl font-bold text-foreground">
                  <CountUp key={`totalEntries-${key}`} end={data?.todayApproved ?? 0} duration={2} preserveValue />
                  </p>
                <p className="text-xs text-green-600 mt-2 font-medium">
                  Total Questions Added in Golden DB  Today{" "}
                </p>
              </div>
              <Database className="w-8 h-8 text-chart-1 opacity-60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Verified Entries
                </p>
                <p className="text-3xl font-bold text-foreground">
                  <CountUp key={`verifiedEntries-${key}`} end={data?.verifiedEntries ?? 0} duration={2} preserveValue /> 
                </p>
                <p className="text-xs text-green-600 mt-2 font-medium">
                  Total questions verified through review/approval process
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-chart-2 opacity-60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Current Period
                </p>
                    <p className="text-3xl font-bold text-foreground cursor-help">
                      <CountUp key={`currentPeriod-${key}`} end={data?.totalEntriesByType ?? 0} duration={2} preserveValue /> 
                    </p>
                     {moderatorBreakdown.length > 0 && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <button className="mt-3 flex items-center gap-2 text-xs text-green-600 hover:text-green-700 font-medium hover:underline transition-colors">
              <Users className="w-3.5 h-3.5" />
              <span>
                View moderator Approvals (
                {moderatorBreakdown.length})
              </span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md overflow-hidden">
            <DialogHeader>
              <DialogTitle className="text-primary">
                Moderator Approvals
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Total of {totalApprovals} approvals by{" "}
                {moderatorBreakdown.length} moderators
              </p>
            </DialogHeader>
            
            <div className="mt-4 max-h-[320px] overflow-y-auto scrollbar-hiding space-y-2">
              {moderatorBreakdown.map((mod, idx) => {
                
                const percentage = totalApprovals ? (mod.count / totalApprovals) * 100 : 0;
                return (
                  <div
                    key={idx}
                    className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary">
                            {mod.moderatorName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <p className="font-medium text-foreground text-sm">
                          {mod.moderatorName}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-primary">
                        {mod.count}
                      </p>
                    </div>

                                {/* Progress Bar */}
                   <p className="text-xs text-muted-foreground mt-2">
  {percentage.toFixed(1)}% of total approvals
</p>

                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
                <p className="text-xs text-green-600 mt-2 font-medium">
                  Latest data point
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-chart-3 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="mb-2">Golden Dataset Analytics</CardTitle>
              <CardDescription>{getChartLabel()}</CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setViewType("year")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewType === "year"
                    ? "bg-primary text-white"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
              >
                Year
              </button>
              <button
                onClick={() => setViewType("month")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewType === "month"
                    ? "bg-primary text-white"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
              >
                Month
              </button>
              <button
                onClick={() => setViewType("week")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewType === "week"
                    ? "bg-primary text-white"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
              >
                Week
              </button>
              <button
                onClick={() => setViewType("day")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewType === "day"
                    ? "bg-primary text-white"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
              >
                Day
              </button>
            </div>
          </div>

          {/* {(viewType === "month" ||
            viewType === "week" ||
            viewType === "day") && ( */}
          <div className="flex flex-wrap gap-3 mt-4">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                {getLast10Years().map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(viewType === "month" ||
              viewType === "week" ||
              viewType === "day") && (
                <>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Select Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthNames.map((month) => (
                        <SelectItem key={month} value={month}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}

            {(viewType === "week" || viewType === "day") && (
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Select Week" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Week 1">Week 1</SelectItem>
                  <SelectItem value="Week 2">Week 2</SelectItem>
                  <SelectItem value="Week 3">Week 3</SelectItem>
                  <SelectItem value="Week 4">Week 4</SelectItem>
                  <SelectItem value="Week 5">Week 5</SelectItem>
                </SelectContent>
              </Select>
            )}

            {viewType === "day" && (
              <Select value={selectedDay} onValueChange={setSelectedDay}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Select Day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mon">Mon</SelectItem>
                  <SelectItem value="Tue">Tue</SelectItem>
                  <SelectItem value="Wed">Wed</SelectItem>
                  <SelectItem value="Thu">Thu</SelectItem>
                  <SelectItem value="Fri">Fri</SelectItem>
                  <SelectItem value="Sat">Sat</SelectItem>
                  <SelectItem value="Sun">Sun</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          {/* )} */}
        </CardHeader>

        <CardContent>
          {/* Bar Chart for Year and Month views */}
          {(viewType === "year" || viewType === "month") && (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey={viewType === "year" ? "month" : "week"}
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    color: "var(--color-foreground)",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="entries"
                  fill="var(--color-chart-1)"
                  name="Total Entries"
                />
                <Bar
                  dataKey="verified"
                  fill="var(--color-chart-2)"
                  name="Verified Entries"
                />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Line Chart for Week and Day views */}
          {(viewType === "week" || viewType === "day") && (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey={viewType === "week" ? "day" : "hour"}
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    color: "var(--color-foreground)",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="entries"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  name="Total Entries"
                />
                <Line
                  type="monotone"
                  dataKey="verified"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2}
                  name="Verified Entries"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
