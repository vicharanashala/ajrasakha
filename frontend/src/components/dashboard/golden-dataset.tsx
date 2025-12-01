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
import { TrendingUp, Database, CheckCircle2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../atoms/select";

// const yearData = [
//   { month: "Jan", entries: 1240, verified: 1100 },
//   { month: "Feb", entries: 1890, verified: 1650 },
//   { month: "Mar", entries: 2400, verified: 2100 },
//   { month: "Apr", entries: 2780, verified: 2450 },
//   { month: "May", entries: 3390, verified: 3000 },
//   { month: "Jun", entries: 3800, verified: 3400 },
//   { month: "Jul", entries: 4200, verified: 3800 },
//   { month: "Aug", entries: 4600, verified: 4150 },
//   { month: "Sep", entries: 4900, verified: 4400 },
//   { month: "Oct", entries: 5200, verified: 4700 },
//   { month: "Nov", entries: 5500, verified: 5000 },
//   { month: "Dec", entries: 5900, verified: 5350 },
// ];

// const weeksData = [
//   { week: "Week 1", entries: 280, verified: 250 },
//   { week: "Week 2", entries: 310, verified: 280 },
//   { week: "Week 3", entries: 340, verified: 300 },
//   { week: "Week 4", entries: 310, verified: 270 },
// ];

// const dailyData = [
//   { day: "Mon", entries: 45, verified: 40 },
//   { day: "Tue", entries: 52, verified: 47 },
//   { day: "Wed", entries: 48, verified: 43 },
//   { day: "Thu", entries: 55, verified: 50 },
//   { day: "Fri", entries: 62, verified: 56 },
//   { day: "Sat", entries: 38, verified: 34 },
//   { day: "Sun", entries: 28, verified: 25 },
// ];

// const dayHourlyData = {
//   Mon: [
//     { hour: "00:00", entries: 2, verified: 2 },
//     { hour: "04:00", entries: 2, verified: 2 },
//     { hour: "08:00", entries: 6, verified: 5 },
//     { hour: "12:00", entries: 9, verified: 8 },
//     { hour: "16:00", entries: 11, verified: 10 },
//     { hour: "20:00", entries: 12, verified: 11 },
//     { hour: "23:59", entries: 3, verified: 2 },
//   ],
//   Tue: [
//     { hour: "00:00", entries: 2, verified: 2 },
//     { hour: "04:00", entries: 3, verified: 3 },
//     { hour: "08:00", entries: 7, verified: 6 },
//     { hour: "12:00", entries: 11, verified: 10 },
//     { hour: "16:00", entries: 13, verified: 12 },
//     { hour: "20:00", entries: 14, verified: 12 },
//     { hour: "23:59", entries: 2, verified: 2 },
//   ],
//   Wed: [
//     { hour: "00:00", entries: 1, verified: 1 },
//     { hour: "04:00", entries: 2, verified: 2 },
//     { hour: "08:00", entries: 6, verified: 5 },
//     { hour: "12:00", entries: 10, verified: 9 },
//     { hour: "16:00", entries: 12, verified: 11 },
//     { hour: "20:00", entries: 15, verified: 13 },
//     { hour: "23:59", entries: 2, verified: 2 },
//   ],
//   Thu: [
//     { hour: "00:00", entries: 2, verified: 2 },
//     { hour: "04:00", entries: 4, verified: 4 },
//     { hour: "08:00", entries: 8, verified: 7 },
//     { hour: "12:00", entries: 12, verified: 11 },
//     { hour: "16:00", entries: 14, verified: 13 },
//     { hour: "20:00", entries: 13, verified: 12 },
//     { hour: "23:59", entries: 2, verified: 1 },
//   ],
//   Fri: [
//     { hour: "00:00", entries: 2, verified: 2 },
//     { hour: "04:00", entries: 3, verified: 3 },
//     { hour: "08:00", entries: 8, verified: 7 },
//     { hour: "12:00", entries: 12, verified: 11 },
//     { hour: "16:00", entries: 15, verified: 14 },
//     { hour: "20:00", entries: 18, verified: 16 },
//     { hour: "23:59", entries: 4, verified: 4 },
//   ],
//   Sat: [
//     { hour: "00:00", entries: 1, verified: 1 },
//     { hour: "04:00", entries: 1, verified: 1 },
//     { hour: "08:00", entries: 5, verified: 4 },
//     { hour: "12:00", entries: 8, verified: 7 },
//     { hour: "16:00", entries: 10, verified: 9 },
//     { hour: "20:00", entries: 11, verified: 10 },
//     { hour: "23:59", entries: 2, verified: 2 },
//   ],
//   Sun: [
//     { hour: "00:00", entries: 1, verified: 1 },
//     { hour: "04:00", entries: 1, verified: 1 },
//     { hour: "08:00", entries: 3, verified: 3 },
//     { hour: "12:00", entries: 6, verified: 5 },
//     { hour: "16:00", entries: 8, verified: 7 },
//     { hour: "20:00", entries: 8, verified: 7 },
//     { hour: "23:59", entries: 1, verified: 1 },
//   ],
// };

export interface GoldenDataset {
  type: "year" | "month" | "week" | "day";
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
  selectedWeek: string;
  setSelectedWeek: (w: string) => void;
  selectedDay: string;
  setSelectedDay: (d: string) => void;
}

export const GoldenDatasetOverview = ({
  data,
  viewType,
  setViewType,
  selectedMonth,
  setSelectedMonth,
  selectedWeek,
  setSelectedWeek,
  selectedDay,
  setSelectedDay,
}: GoldenDatasetOverviewProps) => {
  const getTotals = () => {
    if (viewType === "year") {
      const total = data.yearData.reduce((sum, d) => sum + d.entries, 0);
      const verified = data.yearData.reduce((sum, d) => sum + d.verified, 0);
      return {
        total,
        verified,
        lastEntry: data.yearData[data.yearData.length - 1].entries,
      };
    } else if (viewType === "month") {
      const total = data.weeksData.reduce((sum, d) => sum + d.entries, 0);
      const verified = data.weeksData.reduce((sum, d) => sum + d.verified, 0);
      return { total, verified, lastEntry: total };
    } else if (viewType === "week") {
      const total = data.dailyData.reduce((sum, d) => sum + d.entries, 0);
      const verified = data.dailyData.reduce((sum, d) => sum + d.verified, 0);
      return { total, verified, lastEntry: total };
    } else {
      const dayData =
        data.dayHourlyData[selectedDay as keyof typeof data.dayHourlyData];
      const total = dayData.reduce((sum, d) => sum + d.entries, 0);
      const verified = dayData.reduce((sum, d) => sum + d.verified, 0);
      return { total, verified, lastEntry: total };
    }
  };

  const totals = getTotals();

  const getChartData = () => {
    if (viewType === "year") return data.yearData;
    if (viewType === "month") return data.weeksData;
    if (viewType === "week") return data.dailyData;
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Total Entries
                </p>
                <p className="text-3xl font-bold text-foreground">
                  {totals.total.toLocaleString()}
                </p>
                <p className="text-xs text-green-600 mt-2 font-medium">
                  ↑ 12.4% from previous period
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
                  {totals.verified.toLocaleString()}
                </p>
                <p className="text-xs text-green-600 mt-2 font-medium">
                  ↑ {Math.round((totals.verified / totals.total) * 100)}%
                  verification rate
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
                <p className="text-3xl font-bold text-foreground">
                  {totals.lastEntry}
                </p>
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
                    ? "bg-chart-1 text-white"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                Year
              </button>
              <button
                onClick={() => setViewType("month")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewType === "month"
                    ? "bg-chart-1 text-white"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setViewType("week")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewType === "week"
                    ? "bg-chart-1 text-white"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setViewType("day")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewType === "day"
                    ? "bg-chart-1 text-white"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                Day
              </button>
            </div>
          </div>

          {(viewType === "month" ||
            viewType === "week" ||
            viewType === "day") && (
            <div className="flex flex-wrap gap-3 mt-4">
              {(viewType === "month" ||
                viewType === "week" ||
                viewType === "day") && (
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Select Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="January">January</SelectItem>
                    <SelectItem value="February">February</SelectItem>
                    <SelectItem value="March">March</SelectItem>
                    <SelectItem value="April">April</SelectItem>
                    <SelectItem value="May">May</SelectItem>
                    <SelectItem value="June">June</SelectItem>
                  </SelectContent>
                </Select>
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
          )}
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
