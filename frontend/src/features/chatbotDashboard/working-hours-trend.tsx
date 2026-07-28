"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Loader2, RefreshCw, InfoIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/atoms/chart";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

import { useGetWorkingHoursTrends } from "@/hooks/api/user/useGetWorkingHours";

type WorkingHoursTrendChartProps = {
  userId: string;
  startDateTime: string;
  endDateTime: string;
};

const chartConfig = {
  workingHours: {
    label: "Working Hours",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function WorkingHoursTrendChart({
  userId,
  startDateTime,
  endDateTime,
}: WorkingHoursTrendChartProps) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);

    await queryClient.refetchQueries({
      queryKey: [
        "working-hours-trend",
        userId,
        startDateTime,
        endDateTime,
      ],
    });

    setRefreshing(false);
  };

  const { data, isFetching } = useGetWorkingHoursTrends(
    userId,
    startDateTime,
    endDateTime,
  );

  const chartData = useMemo(() => {
    return (
      data?.map((item) => ({
        label: new Date(item.date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
        workingHours: item.workingHours,
      })) ?? []
    );
  }, [data]);

  return (
<>



        {refreshing || isFetching ? (
          <div className="flex h-[320px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !chartData.length ? (
          <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
            No data found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="h-[500px]">
              <ChartContainer
                config={chartConfig}
                className="h-[500px] w-full"
              >
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

                  <CartesianGrid vertical={false} />

                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={20}
                  />

                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => `${value}h`}
                  />

                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        formatter={(value) => [
                          `${value} hrs`,
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
              </ChartContainer>
            </div>
          </div>
        )}
      </>
  );
}