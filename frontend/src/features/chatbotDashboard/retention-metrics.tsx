"use client";

import { useState } from "react";

import {format} from "date-fns";
import type { DateRange } from "react-day-picker";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CalendarIcon, InfoIcon, RefreshCcw } from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/atoms/popover";
import { Button } from "@/components/atoms/button";
import { Calendar } from "@/components/atoms/calendar";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { useRetentionMetrics } from "@/features/chatbotDashboard/hooks/useActiveUsersAnalytics";
import { useQueryClient } from "@tanstack/react-query";

const chartConfig = {
  d1Retention: {
    label: "D1 Retention",
    color: "var(--chart-1)",
  },

  d7Retention: {
    label: "D7 Retention",
    color: "var(--chart-2)",
  },

  d30Retention: {
    label: "D30 Retention",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

type RetentionType = "daily" | "weekly" | "monthly";

const defaultDateRange: DateRange | undefined = undefined;

type RetentionMetricsChartProps = {
  source: "vicharanashala" | "annam";
  userType: string;
};

export const RetentionMetricsChart = ({
  source,
  userType,
}: RetentionMetricsChartProps) => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    defaultDateRange,
  );
  const [requestType, setRequestType] = useState<RetentionType>("weekly");
  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "";
  const { data, isFetching } = useRetentionMetrics(
    source,
    userType,
    requestType,
    startDate,
    endDate,
  );

  const formatCohortLabel = (
    value: string,
    requestType: RetentionType,
  ) => {
    if (requestType === "monthly") {
      return format(new Date(`${value}-01`), "MMM yyyy");
    }
    if (requestType === "weekly") {
      const [year, week] = value.split("-W");
      return `W${week} ${year}`;
    }
    if (requestType === "daily") {
      return format(new Date(value), "dd-MM-yy");
    }
    return value;
  };

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const resetDateRange = async () => {
    setDateRange(undefined);
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["retention_metrics"] });
    setRefreshing(false);
  };

  const renderDateRangePicker = () => (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="
                h-auto
                min-h-10
                max-w-full
                flex-1
                justify-start
                whitespace-normal
                border-gray-300
                bg-gray-100
                text-left
                font-normal
                text-gray-700
                dark:border-[#3a3a3a]
                dark:bg-[#2a2a2a]
                dark:text-gray-200
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
        title="Reset to last 90 days"
        className="
            shrink-0
            border-gray-300
            bg-gray-100
            text-gray-700
            dark:border-[#3a3a3a]
            dark:bg-[#2a2a2a]
            dark:text-gray-200
          "
      >
        <RefreshCcw className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <Card className="mt-7 mb-7 pt-0 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardHeader className="border-b py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <CardTitle>User Retention Metrics</CardTitle>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="
                        flex
                        h-4
                        w-4
                        cursor-pointer
                        items-center
                        justify-center
                        rounded-full
                        border
                        text-[10px]
                      "
                    >
                      <InfoIcon className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>

                  <TooltipContent className="max-w-[300px]">
                    <p>
                      {requestType === "daily" &&
                        "Retention measures how many users return after their first activity. This view groups users into daily cohorts based on the day they first engaged and tracks how many return on subsequent days."}

                      {requestType === "weekly" &&
                        "Retention measures how many users return after their first activity. This view groups users into weekly cohorts based on the week they first engaged and tracks how many return in the following weeks."}

                      {requestType === "monthly" &&
                        "Retention measures how many users return after their first activity. This view groups users into monthly cohorts based on the month they first engaged and tracks how many return in the following months."}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <CardDescription>
              D1, D7 and D30 retention trends based on user cohorts
            </CardDescription>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {renderDateRangePicker()}

            <Select
              value={requestType}
              onValueChange={(value) => setRequestType(value as RetentionType)}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="daily">Daily Cohorts</SelectItem>

                <SelectItem value="weekly">Weekly Cohorts</SelectItem>

                <SelectItem value="monthly">Monthly Cohorts</SelectItem>
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
        ) : !data?.length ? (
          <div
            className="
              flex
              h-[320px]
              items-center
              justify-center
              rounded-xl
              border
              border-dashed
              text-sm
              text-muted-foreground
            "
          >
            No retention data found
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <div
              className="
                min-w-[1400px]
                h-[320px]
              "
            >
              <ChartContainer config={chartConfig} className="h-full w-full">
                <LineChart data={data}>
                  <CartesianGrid vertical={false} />

                  <XAxis
                    dataKey="cohortDate"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={20}
                    padding={{ right: 30, left: 30 }}
                    interval={data.length < 15 ? 0 : "preserveStartEnd"}
                    tickFormatter={(value) =>
                      formatCohortLabel(value, requestType)
                    }
                  />

                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />

                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        labelFormatter={(value) =>
                          formatCohortLabel(value, requestType)
                        }
                        formatter={(value, name) => [
                          `${value}%`,
                          chartConfig[name as keyof typeof chartConfig]?.label,
                        ]}
                      />
                    }
                  />

                  <Line
                    dataKey="d1Retention"
                    type="linear"
                    stroke="var(--color-d1Retention)"
                    strokeWidth={3}
                    dot={{
                      r: 4,
                    }}
                    activeDot={{
                      r: 6,
                    }}
                  />

                  <Line
                    dataKey="d7Retention"
                    type="linear"
                    stroke="var(--color-d7Retention)"
                    strokeWidth={2}
                    strokeOpacity={0.9}
                    dot={{
                      r: 3,
                    }}
                    activeDot={{
                      r: 5,
                    }}
                  />

                  <Line
                    dataKey="d30Retention"
                    type="linear"
                    stroke="var(--color-d30Retention)"
                    strokeWidth={2}
                    strokeOpacity={0.8}
                    dot={{
                      r: 3,
                    }}
                    activeDot={{
                      r: 5,
                    }}
                  />

                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
