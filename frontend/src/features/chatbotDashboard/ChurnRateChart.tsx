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
import { InfoIcon, Loader2, RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { useMonthlyChurnRate } from "./hooks/useActiveUsersAnalytics";
import { useQueryClient } from "@tanstack/react-query";

type MonthlyChurnRateItem = {
  month: string;
  previousActiveUsers: number;
  currentActiveUsers: number;
  churnedUsers: number;
  churnRate: number;
};

type ChurnRateChartProps = {
  source: "vicharanashala" | "annam";
  userType: string;
};

const chartConfig = {
  churnRate: {
    label: "Churn Rate",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;


export const ChurnRateChart = ({ source, userType }: ChurnRateChartProps) => {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["monthly-churn-rate"] });
    setRefreshing(false);
  };
  const { data: monthlyChurnRateData, isFetching } = useMonthlyChurnRate(source, userType);
  const chartData = useMemo(() => {
    return monthlyChurnRateData?.map((item: any) => ({
      label: item.month,
      churnRate: item.churnRate,
      previousActiveUsers: item.previousActiveUsers,
      currentActiveUsers: item.currentActiveUsers,
      churnedUsers: item.churnedUsers,
    }));
  }, [monthlyChurnRateData]);

  return (
    <Card className="pt-0 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300 mb-7">
      <button
        onClick={handleRefresh}
        className="absolute top-10 right-13 rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
        title="Refresh"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 bg-background ${
            refreshing ? "animate-spin" : ""
          }`}
        />
      </button>
      <CardHeader className="border-b py-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CardTitle>Monthly Churn Rate</CardTitle>

            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>

              <TooltipContent className="max-w-[320px]">
                <p>
                  Churn Rate measures the percentage of users who were active in
                  the previous month but did not return in the current month. A
                  higher churn rate indicates more users are discontinuing their
                  engagement.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Formula: (Previously Active Users Who Did Not Return ÷
                  Previously Active Users) × 100
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex justify-between items-center">
            <CardDescription>
              Percentage of previously active users who did not return in the
              current month.
            </CardDescription>

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
                    i
                  </span>
                </TooltipTrigger>

                <TooltipContent className="max-w-[260px]">
                  <p>
                    Percentage of users active in the previous month who were
                    inactive in the current month.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {(refreshing || isFetching) ? (
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

                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />

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
                      type="linear"
                      fill="url(#fillChurn)"
                      stroke="var(--color-churnRate)"
                      strokeWidth={2}
                    />

                    <ChartLegend content={<ChartLegendContent />} />
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
