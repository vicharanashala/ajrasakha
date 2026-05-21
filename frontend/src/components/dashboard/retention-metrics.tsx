"use client";

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";

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

import { Loader2 } from "lucide-react";

import { useRetentionMetrics } from "@/features/chatbotDashboard/hooks/useActiveUsersAnalytics";

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

export const RetentionMetricsChart = () => {
  const { data, isFetching } = useRetentionMetrics();
  console.log("data---data", data);
  return (
    <Card className="pt-0">
      <CardHeader className="border-b py-5">
        <div className="grid gap-1">
          <CardTitle>User Retention Metrics</CardTitle>

          <CardDescription>
            D1, D7 and D30 retention trends based on user cohorts
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {isFetching ? (
          <div className="flex h-[320px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.length ? (
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
            No retention data found
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[320px] w-full"
          >
            <LineChart data={data}>
              <CartesianGrid vertical={false} />

              <XAxis
                dataKey="cohortDate"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(value) => {
                  const [year, week] = value.split("-W");

                  return `${year.slice(2)} W${week}`;
                }}
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
                    labelFormatter={(value) => {
                      const [year, week] = value.split("-W");

                      return `Week ${week}, ${year}`;
                    }}
                    formatter={(value, name, item) => [
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
        )}
      </CardContent>
    </Card>
  );
};
