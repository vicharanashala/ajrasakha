"use client";

import { useMemo, useState } from "react";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/atoms/chart";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";

import { Loader2 } from "lucide-react";

import {
  useDailyActiveUsersTrend,
  useWeeklyActiveUsersTrend,
  useMontlyActiveUsersTrend,
} from "@/features/chatbotDashboard/hooks/useActiveUsersAnalytics";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

const chartConfig = {
  value: {
    label: "Active Users",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type ActiveUserType = "daily" | "weekly" | "monthly";

export const ActiveUsersChart = () => {
  const [type, setType] = useState<ActiveUserType>("daily");

  const { data: dailyData, isFetching: dailyLoading } =
    useDailyActiveUsersTrend();

  const { data: weeklyData, isFetching: weeklyLoading } =
    useWeeklyActiveUsersTrend();

  const { data: monthlyData, isFetching: monthlyLoading } =
    useMontlyActiveUsersTrend();

  const isFetching = dailyLoading || weeklyLoading || monthlyLoading;

  const chartData = useMemo(() => {
    switch (type) {
      case "daily":
        return (
          dailyData?.map((item) => ({
            label: item._id,
            value: item.dau,
          })) ?? []
        );

      case "weekly":
        return (
          weeklyData?.map((item) => ({
            label: item._id,
            value: item.wau,
          })) ?? []
        );

      case "monthly":
        return (
          monthlyData?.map((item) => ({
            label: item._id,
            value: item.mau,
          })) ?? []
        );

      default:
        return [];
    }
  }, [type, dailyData, weeklyData, monthlyData]);

  const chartTitle = useMemo(() => {
    switch (type) {
      case "daily":
        return "Daily Active Users";

      case "weekly":
        return "Weekly Active Users";

      case "monthly":
        return "Monthly Active Users";

      default:
        return "Active Users";
    }
  }, [type]);

  return (
    <Card className="pt-0">
      <CardHeader className="border-b py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* <div className="grid gap-1">
            <CardTitle>{chartTitle} Trend</CardTitle>

            <CardDescription>
              Interactive analytics showing chatbot user activity trends
            </CardDescription>
          </div> */}

          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <CardTitle>{chartTitle} Trend</CardTitle>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="
              flex h-4 w-4 cursor-pointer
              items-center justify-center
              rounded-full border text-[10px]
            "
                    >
                      i
                    </span>
                  </TooltipTrigger>

                  <TooltipContent className="max-w-[260px]">
                    <p>
                      {type === "daily" &&
                        "Shows unique users active each day based on their latest activity timestamp.)"}

                      {type === "weekly" &&
                        "Shows unique users active each ISO week based on their latest activity timestamp."}

                      {type === "monthly" &&
                        "Shows unique users active each month based on their latest activity timestamp."}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <CardDescription>
              Interactive analytics showing chatbot user activity trends (Last
              one year)
            </CardDescription>
          </div>

          <Select
            value={type}
            onValueChange={(value) => setType(value as ActiveUserType)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="daily">Daily Active Users</SelectItem>

              <SelectItem value="weekly">Weekly Active Users</SelectItem>

              <SelectItem value="monthly">Monthly Active Users</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {isFetching ? (
          <div className="flex h-[320px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !chartData.length ? (
          <div
            className="
              flex h-[320px]
              items-center
              justify-center
              rounded-xl
              border
              border-dashed
              text-sm
              text-muted-foreground
            "
          >
            No data found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div
              style={{
                width:
                  type === "daily"
                    ? `${chartData.length * 120}px`
                    : type === "weekly"
                      ? `${chartData.length * 90}px`
                      : "100%",
                minWidth: "100%",
              }}
            >
              <ChartContainer config={chartConfig} className="h-[320px] w-full">
                <AreaChart
                  data={chartData}
                  margin={{
                    left: 0,
                    right: 16,
                    top: 8,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient id="fillUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-value)"
                        stopOpacity={0.8}
                      />

                      <stop
                        offset="95%"
                        stopColor="var(--color-value)"
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid vertical={false} />

                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={20}
                  />

                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />

                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                  />

                  <Area
                    dataKey="value"
                    type="natural"
                    fill="url(#fillUsers)"
                    stroke="var(--color-value)"
                    strokeWidth={2}
                  />

                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
