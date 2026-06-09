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
import { useActiveUsersTrend } from "@/features/chatbotDashboard/hooks/useActiveUsersAnalytics";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/atoms/calendar";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/atoms/popover";

import { Button } from "@/components/atoms/button";

import { CalendarIcon, RefreshCcw } from "lucide-react";

import { format, subDays } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
const chartConfig = {
  value: {
    label: "Active Users",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;
const defaultDateRange: DateRange | undefined = undefined;

type ActiveUserType = "daily" | "weekly" | "monthly";

type ActiveUsersChartProps = {
  source: "vicharanashala" | "annam";
  userType: string;
};

export const ActiveUsersChart = ({
  source,
  userType,
}: ActiveUsersChartProps) => {
  const [type, setType] = useState<ActiveUserType>("daily");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    defaultDateRange,
  );

  const { data, isFetching } = useActiveUsersTrend(
    source,
    userType,
    type,
    dateRange?.from,
    dateRange?.to,
  );

  const chartData = useMemo(() => {
    return (
      data?.map((item) => ({
        label: item._id,
        value: item.activeUsers,
      })) ?? []
    );
  }, [data]);

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
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const resetDateRange = async () => {
    setDateRange(undefined);
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["active_user_trend"] });
    setRefreshing(false);
  };

  const formatCohortLabel = (value: string, requestType: ActiveUserType) => {
    if (!value) return "";
    if (requestType === "monthly") {
      const date = new Date(`${value}-01`);
      return isNaN(date.getTime()) ? value : format(date, "MMM yyyy");
    }
    if (requestType === "weekly") {
      const parts = value.split("-W");
      if (parts.length < 2) return value;
      const [year, week] = parts;
      return `W${week} ${year}`;
    }
    if (requestType === "daily") {
      const date = new Date(value);
      return isNaN(date.getTime()) ? value : format(date, "dd-MM-yy");
    }
    return value;
  };

  const renderDateRangePicker = () => (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="
            justify-start text-left font-normal
            bg-gray-100 dark:bg-[#2a2a2a]
            border-gray-300 dark:border-[#3a3a3a]
            text-gray-700 dark:text-gray-200
            max-w-full whitespace-normal
            h-auto min-h-10 flex-1
          "
          >
            <CalendarIcon className="mr-2 h-4 w-4" />

            {dateRange?.from
              ? dateRange.to
                ? `${format(dateRange.from, "MMM dd, yyyy")} - ${format(
                    dateRange.to,
                    "MMM dd, yyyy",
                  )}`
                : format(dateRange.from, "MMM dd, yyyy")
              : "All Time"}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="end">
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
        title="Reset date range"
        className="
        shrink-0
        bg-gray-100 dark:bg-[#2a2a2a]
        border-gray-300 dark:border-[#3a3a3a]
        text-gray-700 dark:text-gray-200
      "
      >
        <RefreshCcw className="h-4 w-4" />
      </Button>
    </div>
  );
  return (
    <Card
      className="pt-0 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     
"
    >
      <CardHeader className="border-b py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
                        "Shows unique users active each day based on their latest activity timestamp."}

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
              Interactive analytics showing chatbot user activity trends
            </CardDescription>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {renderDateRangePicker()}

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
        </div>
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {(refreshing || isFetching) ? (
          <div className="h-[320px]">
            <Skeleton className="h-full w-full rounded-xl" />
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
                    tickFormatter={(value) => formatCohortLabel(value, type)}
                  />

                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />

                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) =>
                          formatCohortLabel(value, type)
                        }
                      />
                    }
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
