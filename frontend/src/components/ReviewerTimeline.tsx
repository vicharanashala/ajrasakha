import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  Loader2,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Badge } from "@/components/atoms/badge";
import { ScrollArea, ScrollBar } from "./atoms/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "./atoms/popover";
import { Button } from "./atoms/button";
import { Calendar } from "./atoms/calendar";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/atoms/chart";

interface ReviewerActivity {
  questionId: string;
  startAt: string;
  endAt: string;
  durationMs: number;
  status: string;
  isSplit: boolean;
  originalStartAt: string;
  originalEndAt: string;
}

const chartConfig = {
  workedMinutes: {
    label: "Worked Time",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

interface HourLifecycle {
  hourStart: string;
  hourEnd: string;
  activities: ReviewerActivity[];
  totalQuestions: number;
  totalWorkDurationMs: number;
}

interface DayLifecycle {
  date: string;
  hours: HourLifecycle[];
}

interface ReviewerLifecycleData {
  reviewerId: string;
  startDate: string;
  endDate: string;
  lifecycle: DayLifecycle[];
}

interface ReviewerLifecycleProps {
  data?: ReviewerLifecycleData;
  isLoading?: boolean;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
}

interface UserRoleHistory {
  role: string;
  from: string;
  to: string | null;
}

interface ReviewerLifecycleData {
  reviewerId: string;
  startDate: string;
  endDate: string;

  roleHistory: UserRoleHistory[];

  lifecycle: DayLifecycle[];
}

const formatTime = (date: string, withSeconds = false) => {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: true,
  }).format(new Date(date));
};

const formatDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
};

const formatDuration = (ms: number) => {
  if (!ms) return "0s";

  const totalSeconds = Math.floor(ms / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
};

interface ReviewerActivity {
  questionId: string;
  startAt: string;
  endAt: string;
  durationMs: number;
  status: string;
  isSplit: boolean;
  originalStartAt: string;
  originalEndAt: string;
  activityType?: string;
}

export const ReviewerLifecycle = ({
  data,
  isLoading,
  dateRange,
  onDateRangeChange,
}: ReviewerLifecycleProps) => {
  const [granularity, setGranularity] = useState<"day" | "hour">("day");

  const formatChartDate = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);

    return format(new Date(year, month - 1, day), "dd MMM");
  };

  const chartData = useMemo(() => {
    if (!data?.lifecycle) return [];

    if (granularity === "day") {
      return data.lifecycle.map((day) => {
        const activities = day.hours.flatMap((hour) => hour.activities);

        const questionIds = new Set(
          activities.map((activity) => activity.questionId),
        );

        return {
          key: day.date,
          label: formatChartDate(day.date),
          fullLabel: formatDate(day.date),

          durationMs: day.hours.reduce(
            (sum, hour) => sum + (hour.totalWorkDurationMs ?? 0),
            0,
          ),

          questions: questionIds.size,

          authored: activities.filter(
            (activity) => activity.activityType === "authored",
          ).length,

          reviewed: activities.filter(
            (activity) => activity.activityType === "reviewed",
          ).length,

          moderated: activities.filter(
            (activity) => activity.activityType === "moderated",
          ).length,

          activities,
        };
      });
    }

    const hourlyData = data.lifecycle.flatMap((day) =>
      day.hours.map((hour) => ({
        key: `${day.date}-${hour.hourStart}`,

        label: `${formatChartDate(day.date)} ${formatTime(hour.hourStart)}`,

        fullLabel: `${formatDate(day.date)} • ${formatTime(
          hour.hourStart,
        )} - ${formatTime(hour.hourEnd)}`,

        timestamp: new Date(hour.hourStart).getTime(),

        durationMs: hour.totalWorkDurationMs ?? 0,

        questions: hour.totalQuestions,

        authored: hour.activities.filter(
          (activity) => activity.activityType === "authored",
        ).length,

        reviewed: hour.activities.filter(
          (activity) => activity.activityType === "reviewed",
        ).length,

        moderated: hour.activities.filter(
          (activity) => activity.activityType === "moderated",
        ).length,

        activities: hour.activities,
      })),
    );

    return hourlyData.sort((a, b) => a.timestamp - b.timestamp);
  }, [data, granularity]);

  const graphData = useMemo(
    () =>
      chartData.map((item) => ({
        ...item,

        workedMinutes: Math.round((item.durationMs / 60_000) * 10) / 10,
      })),
    [chartData],
  );

  const totalLifecycleDuration = useMemo(() => {
    if (!data?.lifecycle) return 0;

    return data.lifecycle.reduce(
      (total, day) =>
        total +
        day.hours.reduce(
          (dayTotal, hour) => dayTotal + (hour.totalWorkDurationMs ?? 0),
          0,
        ),
      0,
    );
  }, [data]);

  if (isLoading) {
    return (
      <Card className="mt-8">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="my-14 w-full min-w-0">
      <Card className="w-full overflow-hidden">
        <CardHeader className="border-b border-border px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left - Title */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>

              <div>
                <CardTitle className="text-xl text-foreground">
                  Reviewer Lifecycle
                </CardTitle>

                <p className="mt-1 text-sm text-muted-foreground">
                  Hour-wise reviewer activity and questions handled
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 items-center rounded-lg border border-border bg-background p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={granularity === "day" ? "secondary" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setGranularity("day")}
                >
                  Day
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant={granularity === "hour" ? "secondary" : "ghost"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setGranularity("hour")}
                >
                  Hour
                </Button>
              </div>

              <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/30 px-4">
                <Clock className="h-4 w-4 text-primary" />

                <span className="text-xs text-muted-foreground">
                  Total time
                </span>

                <span className="text-sm font-semibold text-foreground">
                  {formatDuration(totalLifecycleDuration)}
                </span>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 min-w-[160px] justify-start gap-2"
                  >
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />

                    {dateRange?.from
                      ? dateRange.to
                        ? `${format(dateRange.from, "MMM dd")} – ${format(
                            dateRange.to,
                            "MMM dd",
                          )}`
                        : format(dateRange.from, "MMM dd")
                      : "All Time"}
                  </Button>
                </PopoverTrigger>

                <PopoverContent className="z-[100] w-auto p-0" align="end">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from ?? new Date()}
                    selected={dateRange}
                    onSelect={onDateRangeChange}
                    disabled={{ after: new Date() }}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          {isLoading ? (
            <div className="flex h-[320px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !graphData.length ? (
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
              No reviewer activity found
            </div>
          ) : (
            <ScrollArea>
              <div className="w-full min-w-0">
                <div className="w-full overflow-x-auto overflow-y-hidden pb-3">
                  <div
                    style={{
                      width:
                        granularity === "hour"
                          ? `${Math.max(graphData.length * 90, 1200)}px`
                          : `${Math.max(graphData.length * 90, 1200)}px`,
                    }}
                  >
                    <ChartContainer
                      config={chartConfig}
                      className="h-[320px] w-full"
                    >
                      <BarChart
                        data={graphData}
                        margin={{
                          left: 0,
                          right: 20,
                          top: 8,
                          bottom: 0,
                        }}
                        barCategoryGap="25%"
                      >
                        <CartesianGrid vertical={false} />

                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={10}
                          interval={0}
                        />

                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          width={45}
                          tickFormatter={(value) => `${value}m`}
                        />

                        <ChartTooltip
                          cursor={false}
                          content={
                            <LifecycleTooltip
                              roleHistory={data?.roleHistory ?? []}
                            />
                          }
                        />

                        <Bar
                          dataKey="workedMinutes"
                          fill="var(--color-workedMinutes)"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={50}
                        />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </div>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const LifecycleTooltip = ({ active, payload, roleHistory }: any) => {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0].payload;

  const activityStartTimes = item.activities.map((activity: ReviewerActivity) =>
    new Date(activity.startAt).getTime(),
  );

  const activityEndTimes = item.activities.map((activity: ReviewerActivity) =>
    new Date(activity.endAt).getTime(),
  );

  const bucketStart = Math.min(...activityStartTimes);
  const bucketEnd = Math.max(...activityEndTimes);

  const roles = roleHistory.filter((history: UserRoleHistory) => {
    const roleStart = new Date(history.from).getTime();

    const roleEnd = history.to ? new Date(history.to).getTime() : Infinity;

    return roleStart <= bucketEnd && roleEnd >= bucketStart;
  });

  return (
    <div className="min-w-[240px] rounded-lg border border-border bg-popover p-3 shadow-md">
      <p className="mb-3 text-sm font-semibold text-foreground">
        {item.fullLabel}
      </p>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Worked time</span>

          <span className="font-semibold text-foreground">
            {formatDuration(item.durationMs)}
          </span>
        </div>

        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Questions</span>

          <span className="font-semibold">{item.questions}</span>
        </div>
      </div>

      <div className="my-3 border-t border-border" />

      <p className="mb-2 text-xs font-medium">Activity</p>

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Authored</span>
          <span>{item.authored}</span>
        </div>

        <div className="flex justify-between">
          <span>Reviewed</span>
          <span>{item.reviewed}</span>
        </div>

        <div className="flex justify-between">
          <span>Moderated</span>
          <span>{item.moderated}</span>
        </div>
      </div>

      {!!roles.length && (
        <>
          <div className="my-3 border-t border-border" />

          <p className="mb-2 text-xs font-medium">Role history</p>

          <div className="flex flex-wrap gap-1">
            {roles.map((role: UserRoleHistory, index: number) => (
              <Badge
                key={`${role.role}-${index}`}
                variant="secondary"
                className="capitalize"
              >
                {role.role}
              </Badge>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
