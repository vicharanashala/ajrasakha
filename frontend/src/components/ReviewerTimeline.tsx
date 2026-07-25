import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  FileQuestion,
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

const getDayTotalQuestions = (day: DayLifecycle) =>
  day.hours.reduce((sum, hour) => sum + hour.totalQuestions, 0);

const getDayTotalDuration = (day: DayLifecycle) =>
  day.hours.reduce((sum, hour) => sum + hour.totalWorkDurationMs, 0);

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

// const getActivityType = (status: string) => {
//   switch (status) {
//     case "approved":
//       return {
//         label: "Authored",
//         className: "border-amber-500/30 bg-amber-500/10 text-amber-500",
//       };

//     case "reviewed":
//       return {
//         label: "Reviewed",
//         className: "border-green-500/30 bg-green-500/10 text-green-500",
//       };

//     case "in-review":
//       return {
//         label: "Reviewing",
//         className: "border-blue-500/30 bg-blue-500/10 text-blue-500",
//       };

//     default:
//       return {
//         label: status,
//         className: "border-border bg-muted text-muted-foreground",
//       };
//   }
// };


const getActivityType = (status: string) => {
  switch (status) {
    case "approved":
      return {
        label: "Authored",
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-500",
      };

    case "reviewed":
      return {
        label: "Reviewed",
        className:
          "border-green-500/30 bg-green-500/10 text-green-500",
      };

    case "moderated":
      return {
        label: "Moderated",
        className:
          "border-purple-500/30 bg-purple-500/10 text-purple-500",
      };

    default:
      return {
        label: status,
        className:
          "border-border bg-muted text-muted-foreground",
      };
  }
};
export const ReviewerLifecycle = ({
  data,
  isLoading,
  dateRange,
  onDateRangeChange,
}: ReviewerLifecycleProps) => {
  const [expandedHours, setExpandedHours] = useState<Record<string, boolean>>(
    {},
  );

  const toggleHour = (key: string) => {
    setExpandedHours((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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

  //   if (!data?.lifecycle?.length) {
  //     return (
  //       <Card className="mt-8">
  //         <CardContent className="py-12 text-center text-sm text-muted-foreground">
  //           No reviewer activity found for this period.
  //         </CardContent>
  //       </Card>
  //     );
  //   }

  return (
    <ScrollArea className="h-[550px] w-full my-14">
      <Card className="overflow-hidden">
        {/* <CardHeader className="border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
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
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full border-border/50 bg-background/60 px-3 text-[11px] font-medium hover:bg-muted/50"
                >
                  {dateRange?.from
                    ? dateRange.to
                      ? `${format(dateRange.from, "MMM dd")} – ${format(dateRange.to, "MMM dd")}`
                      : format(dateRange.from, "MMM dd")
                    : "All Time"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[100]" align="end">
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
        </CardHeader> */}
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

            {/* Right */}
            <div className="flex items-center gap-3">
              {/* Total time */}
              <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/30 px-4">
                <Clock className="h-4 w-4 text-primary" />

                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">
                    Total time
                  </span>

                  <span className="text-sm font-semibold text-foreground">
                    {formatDuration(totalLifecycleDuration)}
                  </span>
                </div>
              </div>

              {/* Date filter */}
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
        <CardContent className="p-0">
          {data?.lifecycle.map((day) => (
            <div
              key={day.date}
              className="border-b border-border last:border-b-0"
            >
              {/* Day header */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 px-6 py-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />

                  <span className="font-semibold text-foreground">
                    {formatDate(day.date)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {getDayTotalQuestions(day)} questions
                  </Badge>

                  <Badge variant="secondary">
                    {formatDuration(getDayTotalDuration(day))} worked
                  </Badge>
                </div>
              </div>

              {/* Hour rows */}
              <div>
                {day.hours.map((hour) => {
                  const key = `${day.date}-${hour.hourStart}`;
                  const expanded = !!expandedHours[key];

                  return (
                    <div
                      key={key}
                      className="border-t border-border first:border-t-0"
                    >
                      <button
                        type="button"
                        onClick={() => toggleHour(key)}
                        className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/40"
                      >
                        {/* Expand */}
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                          {expanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>

                        {/* Hour */}
                        <div className="min-w-[190px]">
                          <p className="text-sm font-semibold text-foreground">
                            {formatTime(hour.hourStart)}
                            {" – "}
                            {formatTime(hour.hourEnd)}
                          </p>

                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Hourly activity
                          </p>
                        </div>

                        {/* Question count */}
                        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
                          <FileQuestion className="h-4 w-4" />

                          <span>
                            {hour.totalQuestions}{" "}
                            {hour.totalQuestions === 1
                              ? "question"
                              : "questions"}
                          </span>
                        </div>

                        {/* Work duration */}
                        <div className="ml-auto flex items-center gap-2">
                          <Clock className="h-4 w-4 text-green-500" />

                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              Worked
                            </p>

                            <p className="text-sm font-semibold text-foreground">
                              {formatDuration(hour.totalWorkDurationMs)}
                            </p>
                          </div>
                        </div>
                      </button>

                      {/* Expanded activities */}
                      {expanded && (
                        <div className="border-t border-border bg-muted/20 px-6 py-4">
                          <div className="ml-4 border-l-2 border-border pl-6">
                            <div className="space-y-3">
                              {hour.activities.map((activity, index) => {
                                const activityType = getActivityType(
                                  activity.status,
                                );

                                return (
                                  <div
                                    key={`${activity.questionId}-${index}`}
                                    className="relative rounded-lg border border-border bg-card p-4 shadow-sm"
                                  >
                                    <span className="absolute -left-[31px] top-5 h-3 w-3 rounded-full border-2 border-background bg-primary" />

                                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                      {/* Time */}
                                      <div className="min-w-[190px]">
                                        <p className="text-sm font-medium text-foreground">
                                          {formatTime(activity.startAt, true)}
                                          {" – "}
                                          {formatTime(activity.endAt, true)}
                                        </p>

                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {formatDuration(activity.durationMs)}
                                        </p>
                                      </div>

                                      {/* Question */}
                                      <div className="min-w-0 flex-1">
                                        <div className="mb-1 flex items-center gap-1.5">
                                          <FileQuestion className="h-3.5 w-3.5 text-muted-foreground" />

                                          <span className="text-xs text-muted-foreground">
                                            Question
                                          </span>
                                        </div>

                                        <p
                                          title={activity.questionId}
                                          className="truncate font-mono text-sm text-foreground"
                                        >
                                          {activity.questionId}
                                        </p>
                                      </div>

                                      {/* Activity */}
                                      <Badge
                                        variant="outline"
                                        className={`w-fit ${activityType.className}`}
                                      >
                                        {activityType.label}
                                      </Badge>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
                        <ScrollBar orientation="vertical" />
    </ScrollArea>
  );
};
