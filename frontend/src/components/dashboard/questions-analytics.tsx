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
import { Activity, Filter } from "lucide-react";
import { ScrollArea } from "../atoms/scroll-area";
import { DateRangeFilter } from "../DateRangeFilter";
import { useRestartOnView } from "@/hooks/ui/useRestartView";
import CountUp from "react-countup";
import React from "react";
import { differenceInCalendarDays } from "date-fns";

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
  analyticsStatus: string;
  setAnalyticsStatus: (value: string) => void;
}
const colors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

// Custom tooltip for the domain pie chart — shows breakdown when hovering "Others"
const DomainPieTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload as AnalyticsItem & { color: string };

  if (entry.name === "Others" && entry.otherItems?.length) {
    const sorted = [...entry.otherItems].sort((a, b) => b.count - a.count);
    return (
      <div
        style={{
          backgroundColor: "var(--color-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius)",
          color: "var(--color-foreground)",
          padding: "10px 14px",
          minWidth: 180,
          maxHeight: 260,
          overflowY: "auto",
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: 6 }}>Others</p>
        {sorted.map((item) => (
          <div
            key={item.name}
            style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13, marginBottom: 3 }}
          >
            <span>{item.name}</span>
            <span style={{ fontWeight: 600 }}>{item.count}</span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            fontSize: 13,
            fontWeight: 700,
            borderTop: "1px solid var(--color-border)",
            marginTop: 6,
            paddingTop: 6,
          }}
        >
          <span>Total</span>
          <span>{entry.count}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        color: "var(--color-foreground)",
        padding: "8px 12px",
        fontSize: 13,
      }}
    >
      <p style={{ fontWeight: 600 }}>{entry.name}</p>
      <p>{entry.count}</p>
    </div>
  );
};

export interface AnalyticsItem {
  name: string;
  count: number;
  otherItems?: { name: string; count: number }[];
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
  analyticsStatus,
  setAnalyticsStatus,
}) => {

  const { ref, key,} = useRestartOnView()

  // ── Analytics-specific date range logic (max 30 days) ──────────────────────
  const MAX_RANGE_DAYS = 30;
  const [rangeWarning, setRangeWarning] = React.useState(false);
  // pendingRange tracks what the calendar shows; only committed to parent when valid
  const [pendingRange, setPendingRange] = React.useState<{ startTime?: Date; endTime?: Date }>({
    startTime: date.startTime,
    endTime: date.endTime,
  });

  const handleDateChange = (key: string, value?: Date) => {
    const next = { ...pendingRange, [key]: value };
    setPendingRange(next);

    const { startTime, endTime } = next;

    if (startTime && endTime) {
      const diff = differenceInCalendarDays(endTime, startTime);
      if (diff > MAX_RANGE_DAYS) {
        setRangeWarning(true);
        // Do NOT commit to parent — invalid range
        return;
      }
    }

    // Valid — commit to parent and clear warning
    setRangeWarning(false);
    setDate((prev) => ({ ...prev, [key]: value }));
  };
  // ───────────────────────────────────────────────────────────────────────────

  const processedCropWithColors = data.cropData.map((item, index) => ({
    ...item,
    color: colors[index % colors.length],
  }));

  const processedDomainWithColors = data.domainData.map((item, index) => ({
    ...item,
    color: colors[index % colors.length],
  }));

  return (
    <Card ref={ref}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 mb-2">
        <div>
          <CardTitle className="mb-2">Questions & Answers Analytics</CardTitle>
          <CardDescription>
            Breakdown by crop, state, and domain
          </CardDescription>
        </div>

        <div className=" flex justify-center items-center gap-6">
          <div className="w-[140px] flex flex-col">
            <Label
              htmlFor="analyticsStatus"
              className="mb-2 text-sm font-medium flex items-center gap-1"
            >
              <Filter className="w-4 h-4 text-primary" />
              Status
            </Label>
            <Select
              value={analyticsStatus}
              onValueChange={(value) => setAnalyticsStatus(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-review">In Review</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="delayed">Delayed</SelectItem>
                <SelectItem value="re-routed">Re-routed</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="pae_submitted">PAE Submitted</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="duplicate">Duplicate</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
              advanceFilter={pendingRange}
              handleDialogChange={handleDateChange}
              helperText="You can select up to 1 month of data at a time"
              showWarning={rangeWarning}
              warningMessage={`Range exceeds ${MAX_RANGE_DAYS} days. Please pick an end date within ${MAX_RANGE_DAYS} days of the start.`}
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
                  <PieChart key={`crop-${key}`}>
                    <Pie
                      data={data.cropData}
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
                          <CountUp key={`crop-${key}`} end={item.count} duration={2} preserveValue />
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
              <BarChart key={`bar-${key}`} data={data.stateData}>
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
                  <PieChart key={`domainDistribution-${key}`}>
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
                      content={<DomainPieTooltip />}
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
                          <CountUp key={`domainBreakdown-${key}`} end={item.count} duration={2} preserveValue />
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
