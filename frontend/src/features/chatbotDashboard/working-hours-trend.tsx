"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";
import { Loader2, RefreshCw, InfoIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/atoms/chart";

import { useGetWorkingHoursTrends } from "@/hooks/api/user/useGetWorkingHours";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";

type WorkingHoursTrendChartProps = {
  userId: string;
};

const chartConfig = {
  workingHours: {
    label: "Working Hours",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function WorkingHoursTrendChart({
  userId,
}: WorkingHoursTrendChartProps) {
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);

  type ViewType = "year" | "month" | "week" | "day";

  const [viewType, setViewType] = useState<ViewType>("year");

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [selectedMonth, setSelectedMonth] = useState<number>(
    new Date().getMonth(),
  );

type WeekOption = {
  label: string;
  start: Date;
  end: Date;
};

const [selectedWeek, setSelectedWeek] =
  useState<WeekOption | null>(null);

  const [selectedDay, setSelectedDay] = useState(new Date());

  const weekOptions = useMemo(() => {
  const options: WeekOption[] = [];

  const firstDay = new Date(selectedYear, selectedMonth, 1);
  const lastDay = new Date(selectedYear, selectedMonth + 1, 0);

  let current = new Date(firstDay);

  while (current <= lastDay) {
    const weekStart = new Date(current);

    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (weekEnd > lastDay) {
      weekEnd.setTime(lastDay.getTime());
    }

    options.push({
      label: `${weekStart.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      })} - ${weekEnd.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      })}`,
      start: weekStart,
      end: weekEnd,
    });

    current.setDate(current.getDate() + 7);
  }

  return options;
}, [selectedYear, selectedMonth]);




useEffect(() => {
  if (weekOptions.length) {
    setSelectedWeek(weekOptions[0]);
  }
}, [weekOptions]);

const dayOptions = useMemo(() => {
  if (!selectedWeek) return [];

  const days: Date[] = [];

  const current = new Date(selectedWeek.start);

  while (current <= selectedWeek.end) {
    days.push(new Date(current));

    current.setDate(current.getDate() + 1);
  }

  return days;
}, [selectedWeek]);

useEffect(() => {
  if (dayOptions.length > 0) {
    setSelectedDay(dayOptions[0]);
  }
}, [dayOptions]);

  const request = useMemo(() => {
    switch (viewType) {
      case "year": {
        const start = new Date(selectedYear, 0, 1, 0, 0, 0, 0);
        const end = new Date(selectedYear, 11, 31, 23, 59, 59, 999);

        return {
          granularity: "month",
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
        };
      }

      case "month": {
        const start = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);

        const end = new Date(
          selectedYear,
          selectedMonth + 1,
          0,
          23,
          59,
          59,
          999,
        );

        return {
          granularity: "week",
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
        };
      }

      case "week": {
  if (!selectedWeek) return null;

  return {
    granularity: "day",
    startDateTime: selectedWeek.start.toISOString(),
    endDateTime: new Date(
      selectedWeek.end.setHours(
        23,
        59,
        59,
        999,
      ),
    ).toISOString(),
  };
}

      case "day": {
        if (!selectedDay) {
          return null;
        }

        const start = new Date(selectedDay);
        start.setHours(0, 0, 0, 0);

        const end = new Date(selectedDay);
        end.setHours(23, 59, 59, 999);

        return {
          granularity: "hour",
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
        };
      }
    }
  }, [viewType, selectedYear, selectedMonth, selectedWeek, selectedDay]);

  // const { data, isFetching } = useGetWorkingHoursTrends(
  //   userId,
  //   startDateTime,
  //   endDateTime,
  //   granularity,
  // );

  const { data, isFetching } = useGetWorkingHoursTrends(
    userId,
    request?.startDateTime,
    request?.endDateTime,
    request?.granularity,
  );

  const chartData = useMemo(() => {
    return (
      data?.map((item) => ({
        label: item.label,
        workingHours: item.workingHours,
      })) ?? []
    );
  }, [data]);

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Working Hours Trend</CardTitle>
              <CardDescription>
                Track user working hours over time
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={viewType === "year" ? "default" : "outline"}
                onClick={() => setViewType("year")}
              >
                Year
              </Button>

              <Button
                size="sm"
                variant={viewType === "month" ? "default" : "outline"}
                onClick={() => setViewType("month")}
              >
                Month
              </Button>

              <Button
                size="sm"
                variant={viewType === "week" ? "default" : "outline"}
                onClick={() => setViewType("week")}
              >
                Week
              </Button>

              <Button
                size="sm"
                variant={viewType === "day" ? "default" : "outline"}
                onClick={() => setViewType("day")}
              >
                Day
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={async () => {
                  setRefreshing(true);

                  await queryClient.invalidateQueries({
                    queryKey: [
                      "working-hours",
                      userId,
                      request?.startDateTime,
                      request?.endDateTime,
                      request?.granularity,
                    ],
                  });

                  setRefreshing(false);
                }}
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Year */}
            <Select
              value={selectedYear.toString()}
              onValueChange={(value) => setSelectedYear(Number(value))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>

              <SelectContent>
                {Array.from({ length: 10 }).map((_, index) => {
                  const year = new Date().getFullYear() - index;

                  return (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {/* Month */}

            {viewType !== "year" && (
              <Select
                value={selectedMonth.toString()}
                onValueChange={(value) => setSelectedMonth(Number(value))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>

                <SelectContent>
                  {[
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
                  ].map((month, index) => (
                    <SelectItem key={month} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Week */}

            {(viewType === "week" || viewType === "day") && (
  <Select
    value={selectedWeek?.label}
    onValueChange={(value) => {
      const week = weekOptions.find(
        (w) => w.label === value,
      );

      if (week) {
        setSelectedWeek(week);
      }
    }}
  >
    <SelectTrigger className="w-[180px]">
      <SelectValue placeholder="Week" />
    </SelectTrigger>

    <SelectContent>
      {weekOptions.map((week) => (
        <SelectItem
          key={week.label}
          value={week.label}
        >
          {week.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)}

{viewType === "day" && (
  <Select
    value={selectedDay.toISOString()}
    onValueChange={(value) =>
      setSelectedDay(new Date(value))
    }
  >
    <SelectTrigger className="w-[180px]">
      <SelectValue />
    </SelectTrigger>

    <SelectContent>
      {dayOptions.map((day) => (
        <SelectItem
          key={day.toISOString()}
          value={day.toISOString()}
        >
          {day.toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
          })}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)}
          </div>
        </CardHeader>

        <CardContent>
          {refreshing || isFetching ? (
            <div className="flex h-[400px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !chartData.length ? (
            <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              No working hours found
            </div>
          ) : (
            <div className="h-[400px]">
              <ChartContainer config={chartConfig} className="h-full w-full">
                {viewType === "year" || viewType === "month" ? (
                  <BarChart
                    data={chartData}
                    margin={{
                      left: 12,
                      right: 16,
                      top: 12,
                      bottom: 12,
                    }}
                  >
                    {/* We'll add the bar chart contents next */}

                    <CartesianGrid vertical={false} />

                    <XAxis dataKey="label" tickLine={false} axisLine={false} />

                    <YAxis tickFormatter={(value) => `${value}h`} />

                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => [
                            `${value} hrs`,
                            "Working Hours",
                          ]}
                        />
                      }
                    />

                    <Bar
                      dataKey="workingHours"
                      radius={[6, 6, 0, 0]}
                      fill="var(--color-workingHours)"
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                  </BarChart>
                ) : (
                  <AreaChart
                    data={chartData}
                    margin={{
                      left: 12,
                      right: 16,
                      top: 12,
                      bottom: 12,
                    }}
                  >
                    {/* Your existing AreaChart code */}

                    <defs>
                      <linearGradient
                        id="fillWorkingHours"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-workingHours)"
                          stopOpacity={0.8}
                        />

                        <stop
                          offset="95%"
                          stopColor="var(--color-workingHours)"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid vertical={false} strokeDasharray="3 3" />

                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      minTickGap={20}
                    />

                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      tickFormatter={(value) => `${value} h`}
                    />

                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(value) => [
                            `${Number(value).toFixed(1)} hrs`,
                            "Working Hours",
                          ]}
                        />
                      }
                    />

                    <Area
                      dataKey="workingHours"
                      type="monotone"
                      stroke="var(--color-workingHours)"
                      fill="url(#fillWorkingHours)"
                      strokeWidth={2}
                    />
                <ChartLegend content={<ChartLegendContent />} />
                  </AreaChart>
                )}

              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
