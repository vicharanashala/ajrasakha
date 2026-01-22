"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/atoms/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../atoms/select";
import { Label } from "../atoms/label";
import { Activity } from "lucide-react";
import { ScrollArea } from "../atoms/scroll-area";
import { DateRangeFilter } from "../DateRangeFilter";

export interface DateRange {
  startTime?: Date;
  endTime?: Date;
}

interface QuestionsAnalyticsProps {
  date: DateRange;
  setDate: React.Dispatch<React.SetStateAction<DateRange>>;
  data: QuestionsAnalytics;
  setAnalyticsType: (value: "question" | "answer") => void;
  analyticsType: "question" | "answer";
}
const colors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export interface AnalyticsItem {
  name: string;
  count: number;
}

export interface QuestionsAnalytics {
  cropData: AnalyticsItem[];
  stateData: AnalyticsItem[];
  domainData: AnalyticsItem[];
}

export const QuestionsAnalytics: React.FC<QuestionsAnalyticsProps> = ({
  date,
  setDate,
  data,
  setAnalyticsType,
  analyticsType,
}) => {
  const handleDateChange = (key: string, value?: Date) => {
    setDate((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const getTopTenWithOthers = (data: { name: string; count: number }[]) => {
    const sorted = [...data].sort((a, b) => b.count - a.count);
    const topTen = sorted.slice(0, 10);

    const othersCount = sorted
      .slice(10)
      .reduce((sum, item) => sum + item.count, 0);

    return [
      ...topTen,
      ...(othersCount > 0 ? [{ name: "Others", count: othersCount }] : []),
    ];
  };
  const processedCropData = getTopTenWithOthers(data.cropData);
  const processedDomainData = getTopTenWithOthers(data.domainData);

  const processedCropWithColors = processedCropData.map((item, index) => ({
    ...item,
    color: colors[index % colors.length],
  }));

  const processedDomainWithColors = processedDomainData.map((item, index) => ({
    ...item,
    color: colors[index % colors.length],
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 mb-2">
        <div>
          <CardTitle className="mb-2">Questions & Answers Analytics</CardTitle>
          <CardDescription>
            Breakdown by crop, state, and domain
          </CardDescription>
        </div>

        <div className=" flex justify-center items-center gap-6">
          <div className="w-[120px] flex flex-col">
            <Label
              htmlFor="analyticsType"
              className="mb-2 text-sm font-medium flex items-center gap-1"
            >
              <Activity className="w-4 h-4 text-primary" />
              Analytics Type
            </Label>
            <Select
              value={analyticsType}
              onValueChange={(value) =>
                setAnalyticsType(value as "question" | "answer")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="question">Question</SelectItem>
                <SelectItem value="answer">Answer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[220px]">
            <DateRangeFilter
              advanceFilter={date}
              handleDialogChange={handleDateChange}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="crop" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="crop">By Crop</TabsTrigger>
            <TabsTrigger value="state">By State</TabsTrigger>
            <TabsTrigger value="domain">By Domain</TabsTrigger>
          </TabsList>

          <TabsContent value="crop" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Crop Distribution
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={processedCropData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      // label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      dataKey="count"
                      stroke="none"
                    >

                      {processedCropWithColors.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />

                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius)",
                        color: "var(--color-foreground)",
                      }}
                      itemStyle={{
                        color: "var(--color-foreground)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Crop Breakdown
                </h3>

                <ScrollArea className="h-72 rounded-md border p-1">
                  <div className="space-y-2 pr-2">
                    {processedCropWithColors.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-foreground">
                            {item.name.length > 18
                              ? item.name.substring(0, 18) + "..."
                              : item.name}
                          </span>
                        </div>

                        <span className="font-semibold text-foreground">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="state" className="mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Questions by State
            </h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={data.stateData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 12 }}
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
                <Bar
                  dataKey="count"
                  fill="var(--color-chart-2)"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="domain" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Domain Distribution
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={processedDomainWithColors}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      labelLine={false}
                      // label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      dataKey="count"
                      stroke="none"
                    >

                      {processedDomainWithColors.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />

                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius)",
                        color: "var(--color-foreground)",
                      }}
                      itemStyle={{
                        color: "var(--color-foreground)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Domain Breakdown
                </h3>

                <ScrollArea className="h-72 rounded-md border p-1">
                  <div className="space-y-2 pr-2">
                    {processedDomainWithColors.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-foreground">
                            {item.name}
                          </span>
                        </div>

                        <span className="font-semibold text-foreground">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
