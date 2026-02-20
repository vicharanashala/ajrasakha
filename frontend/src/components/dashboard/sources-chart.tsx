"use client";
import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { useRestartOnView } from "@/hooks/ui/useRestartView";
export const description = "An interactive area chart";
// const chartData = [
//   { date: "2024-04-01", Ajrasakha: 222, Moderator: 150 },
//   { date: "2024-04-02", Ajrasakha: 97, Moderator: 180 },
//   { date: "2024-04-03", Ajrasakha: 167, Moderator: 120 },
//   { date: "2024-04-04", Ajrasakha: 242, Moderator: 260 },
//   { date: "2024-04-05", Ajrasakha: 373, Moderator: 290 },
//   { date: "2024-04-06", Ajrasakha: 301, Moderator: 340 },
//   { date: "2024-04-07", Ajrasakha: 245, Moderator: 180 },
//   { date: "2024-04-08", Ajrasakha: 409, Moderator: 320 },
//   { date: "2024-04-09", Ajrasakha: 59, Moderator: 110 },
//   { date: "2024-04-10", Ajrasakha: 261, Moderator: 190 },
//   { date: "2024-04-11", Ajrasakha: 327, Moderator: 350 },
//   { date: "2024-04-12", Ajrasakha: 292, Moderator: 210 },
//   { date: "2024-04-13", Ajrasakha: 342, Moderator: 380 },
//   { date: "2024-04-14", Ajrasakha: 137, Moderator: 220 },
// ];
const chartConfig = {
  visitors: {
    label: "Visitors",
  },
  Ajrasakha: {
    label: "Ajrasakha",
    color: "var(--chart-1)",
  },
  Moderator: {
    label: "Moderator",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export interface QuestionContributionTrend {
  date: string;
  Ajrasakha: number;
  Moderator: number;
}

export interface SourcesChartProps {
  data: QuestionContributionTrend[];

  timeRange: string;
  setTimeRange: React.Dispatch<React.SetStateAction<string>>;
}

export const SourcesChart: React.FC<SourcesChartProps> = ({
  data,
  timeRange,
  setTimeRange,
}) => {
  const {ref,key} = useRestartOnView()

  // const filteredData = data.filter((item) => {
  //   const date = new Date(item.date);
  //   const referenceDate = new Date("2024-06-30");
  //   let daysToSubtract = 90;
  //   if (timeRange === "30d") {
  //     daysToSubtract = 30;
  //   } else if (timeRange === "7d") {
  //     daysToSubtract = 7;
  //   }
  //   const startDate = new Date(referenceDate);
  //   startDate.setDate(startDate.getDate() - daysToSubtract);
  //   return date >= startDate;
  // });
  // console.log("filteredData: ", filteredData)

  return (
    <Card ref={ref} className="pt-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Question Contribution Analysis</CardTitle>
          <CardDescription>
            Interactive chart showing questions added by Arjasakha and
            Moderators over time
          </CardDescription>
        </div>

        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger
            className="hidden w-[160px] rounded-lg sm:ml-auto sm:flex"
            aria-label="Select a value"
          >
            <SelectValue placeholder="Last 3 months" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg">
              Last 3 months
            </SelectItem>
            <SelectItem value="30d" className="rounded-lg">
              Last 30 days
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg">
              Last 7 days
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={data} key={key}>
            <defs>
              <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-Ajrasakha)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-Ajrasakha)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-Moderator)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-Moderator)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="Moderator"
              type="natural"
              fill="url(#fillMobile)"
              stroke="var(--color-Moderator)"
              stackId="a"
            />
            <Area
              dataKey="Ajrasakha"
              type="natural"
              fill="url(#fillDesktop)"
              stroke="var(--color-Ajrasakha)"
              stackId="a"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};



