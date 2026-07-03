"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/atoms/card";
import { Badge } from "@/components/atoms/badge";
import { ScrollArea } from "@/components/atoms/scroll-area";
import CountUp from "react-countup";
import { useRestartOnView } from "@/hooks/ui/useRestartView";

export interface UserRoleOverview {
  role: string;
  count: number;
}

export interface OverviewResponse {
  userRoleOverview: UserRoleOverview[];
  stfExpertCount: number;
  stfModeratorCount: number;
}

const roleStyles: Record<
  string,
  {
    fill: string;
    chipClass: string;
    cardClass: string;
  }
> = {
  Experts: {
    fill: "var(--color-chart-1)",
    chipClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
    cardClass:
      "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/80 dark:bg-emerald-950/25",
  },
  Moderators: {
    fill: "var(--color-chart-2)",
    chipClass:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300",
    cardClass:
      "border-sky-200/80 bg-sky-50/70 dark:border-sky-900/80 dark:bg-sky-950/25",
  },
  Admins: {
    fill: "var(--color-chart-3)",
    chipClass:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300",
    cardClass:
      "border-violet-200/80 bg-violet-50/70 dark:border-violet-900/80 dark:bg-violet-950/25",
  },
  "PAE Experts": {
    fill: "var(--color-chart-4)",
    chipClass:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
    cardClass:
      "border-amber-200/80 bg-amber-50/70 dark:border-amber-900/80 dark:bg-amber-950/25",
  },
  "District Coordinators": {
    fill: "var(--color-chart-5)",
    chipClass:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300",
    cardClass:
      "border-rose-200/80 bg-rose-50/70 dark:border-rose-900/80 dark:bg-rose-950/25",
  },
};

const fallbackRoleStyle = {
  fill: "hsl(220 14% 65%)",
  chipClass:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300",
  cardClass:
    "border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/30",
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length > 0) {
    const entry = payload[0];

    return (
      <div className="z-50 rounded-md border bg-card p-2 text-sm text-gray-900 shadow-lg dark:border-gray-700 dark:text-gray-100">
        <strong>{entry.name}</strong>: {entry.value} users
      </div>
    );
  }
  return null;
};

interface ModeratorsOverviewProps {
  data: UserRoleOverview[];
  stfExpertCount: number;
  stfModeratorCount: number;
  selectedDate: string;
  startTime: string;
  endTime: string;
  onSelectedDateChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
}

export const ModeratorsOverview: React.FC<ModeratorsOverviewProps> = ({
  data,
  stfExpertCount,
  stfModeratorCount,
  selectedDate,
  startTime,
  endTime,
  onSelectedDateChange,
  onStartTimeChange,
  onEndTimeChange,
}) => {
  const total = data.reduce((acc, item) => acc + item.count, 0);
  const { ref, key } = useRestartOnView();
  const roleRows = data.map((item) => {
    const style = roleStyles[item.role] ?? fallbackRoleStyle;
    const stfCount =
      item.role === "Experts"
        ? stfExpertCount
        : item.role === "Moderators"
          ? stfModeratorCount
          : 0;

    return {
      ...item,
      ...style,
      stfCount,
    };
  });

  return (
    <Card ref={ref} className="flex flex-col">
      <CardHeader className="flex flex-col gap-4 pb-0 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle>Role Overview</CardTitle>
          <CardDescription>
            Active users by role for the selected time window
          </CardDescription>
        </div>

        <div className="grid w-full gap-3 lg:grid-cols-[minmax(160px,220px)_minmax(0,1fr)] 2xl:max-w-[520px]">
          <div className="flex min-w-0 flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Select Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onSelectedDateChange(e.target.value)}
              className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Active Time Window
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
              <input
                type="time"
                value={startTime}
                onChange={(e) => onStartTimeChange(e.target.value)}
                className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
              />
              <span className="text-sm text-muted-foreground sm:text-center">to</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => onEndTimeChange(e.target.value)}
                className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-0">
        <div className="grid gap-6 md:grid-cols-2 md:items-start">
          <div className="relative mx-auto w-full max-w-[300px] md:max-w-none">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart key={key}>
                <Pie
                  data={roleRows}
                  dataKey="count"
                  nameKey="role"
                  innerRadius={76}
                  outerRadius={110}
                  paddingAngle={4}
                  cursor="pointer"
                  stroke="none"
                  activeIndex={undefined}
                >
                  {roleRows.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} stroke="none" />
                  ))}
                </Pie>

                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "rgba(0,0,0,0.1)" }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-bold">
                <CountUp key={key} end={total} duration={2} preserveValue />
              </span>
              <span className="text-sm text-muted-foreground">Total Users</span>
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Role Breakdown
              </h3>
              <Badge variant="outline" className="shrink-0 text-xs">
                {roleRows.length} roles
              </Badge>
            </div>

            <ScrollArea className="h-[240px] rounded-md border p-1">
              <div className="space-y-2 pr-2">
                {roleRows.map((item) => (
                  <div
                    key={item.role}
                    className={`rounded-xl border p-3 transition-colors ${item.cardClass}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span className="truncate text-sm font-medium text-foreground">
                            {item.role}
                          </span>
                        </div>

                        {(item.role === "Experts" ||
                          item.role === "Moderators") && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge
                              variant="outline"
                              className="border-dashed border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
                            >
                              {item.role === "Experts"
                                ? "STF Experts"
                                : "STF Moderators"}
                              : {item.stfCount}
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-xs text-muted-foreground">
                          Active
                        </div>
                        <div className="text-lg font-semibold text-foreground">
                          <CountUp
                            key={`${item.role}-${key}`}
                            end={item.count}
                            duration={0.6}
                            preserveValue
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex-col gap-2 text-sm">
        <div className="leading-none text-muted-foreground">
          Showing active users by role, with STF badges for expert and moderator teams
        </div>
      </CardFooter>
    </Card>
  );
};
