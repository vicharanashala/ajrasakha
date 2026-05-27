"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

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

type MonthlyChurnRateItem = {
  month: string;
  previousActiveUsers: number;
  currentActiveUsers: number;
  churnedUsers: number;
  churnRate: number;
};

type ChurnRateChartProps = {
  monthlyChurnRateData?: MonthlyChurnRateItem[];
  isFetching?: boolean;
};

const chartConfig = {
  churnRate: {
    label: "Churn Rate",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export const ChurnRateChart = ({
  monthlyChurnRateData = [],
  isFetching = false,
}: ChurnRateChartProps) => {
  const chartData = useMemo(() => {
    return monthlyChurnRateData.map((item) => ({
      label: item.month,
      churnRate: item.churnRate,
      previousActiveUsers: item.previousActiveUsers,
      currentActiveUsers: item.currentActiveUsers,
      churnedUsers: item.churnedUsers,
    }));
  }, [monthlyChurnRateData]);

  const latestData =
    chartData.length > 0
      ? chartData[chartData.length - 1]
      : null;

  return (
    <Card className="pt-0 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardHeader className="border-b py-5">
        <div className="flex flex-col gap-2">
          <CardTitle>Monthly Churn Rate</CardTitle>

          <CardDescription>
            Percentage of previously active users who did not
            return in the current month.
          </CardDescription>
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
          <>
            {latestData && (
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">
                    Current Churn Rate
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">
                    {latestData.churnRate}%
                  </h2>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">
                    Previous Active
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">
                    {latestData.previousActiveUsers}
                  </h2>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">
                    Current Active
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">
                    {latestData.currentActiveUsers}
                  </h2>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">
                    Churned Users
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">
                    {latestData.churnedUsers}
                  </h2>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <div
                style={{
                  width: `${chartData.length * 90}px`,
                  minWidth: "100%",
                }}
              >
                <ChartContainer
                  config={chartConfig}
                  className="h-[320px] w-full"
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
                        id="fillChurn"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-churnRate)"
                          stopOpacity={0.8}
                        />

                        <stop
                          offset="95%"
                          stopColor="var(--color-churnRate)"
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
                    />

                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(value, name, item) => [
                            `${value}%`,
                            "Churn Rate",
                          ]}
                        />
                      }
                    />

                    <Area
                      dataKey="churnRate"
                      type="natural"
                      fill="url(#fillChurn)"
                      stroke="var(--color-churnRate)"
                      strokeWidth={2}
                    />

                    <ChartLegend
                      content={<ChartLegendContent />}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};