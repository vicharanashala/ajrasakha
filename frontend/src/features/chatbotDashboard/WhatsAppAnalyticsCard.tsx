import { Card, CardContent, CardHeader } from "@/components/atoms/card";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/atoms/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

type AnalyticsItem = {
  queryCount: number;
  totalQuestions: number;
  closedQuestions: number;
  period: string;
  averageCloseTimeMinutes?: number;
  averagePassTimeMinutes?: number;
  averageDynamicCloseTimeMinutes?: number;
  combinedAverageTimeMinutes?: number;
  closedInPeriod?: number;
  delayed?: number;
  draft?: number;
  duplicate?: number;
  hold?: number;
  inReview?: number;
  open?: number;
  paeSubmitted?: number;
  pass?: number;
  rerouted?: number;
  carryForward?: number;
  nonAgri?: number;
  statuses?: Record<string, number>;
};

type WhatsAppAnalyticsCardProps = {
  title: string;
  analytics: AnalyticsItem[];
  granularity: "daily" | "weekly" | "monthly";
  isLoading?: boolean;
};

export function WhatsAppAnalyticsCard({
  title,
  analytics,
  granularity,
  isLoading,
}: WhatsAppAnalyticsCardProps) {
  
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["dashboard-data"] });
    setRefreshing(false);
  };
  const latest = analytics.at(-1);
  const totalQueries = latest?.totalQuestions || 0;
  const maxPoint = Math.max(...analytics.map((item) => item.totalQuestions), 1);

  const formatLabel = (period: string) => {
    if (granularity === "daily") {
      const date = new Date(period);

      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      });
    }

    if (granularity === "weekly") {
      return period.replace("2026-", "");
    }

    if (granularity === "monthly") {
      const [year, month] = period.split("-");

      return new Date(Number(year), Number(month) - 1).toLocaleDateString(
        "en-IN",
        {
          month: "short",
        },
      );
    }

    return period;
  };

  const currentLabelMap = {
    daily: "Current Day Questions",
    weekly: "Current Week Questions",
    monthly: "Current Month Questions",
  };

  const formatCloseTime = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${remainingMinutes.toFixed(0)}m`;
  };

  return (
    <>
      <Card
        className="
        border
        border-border
        rounded-2xl
        bg-background/80
        backdrop-blur
        overflow-x-auto
         h-fit
      "
      >
        <CardHeader className="pb-2">
          <div
            className="
            text-sm
            text-muted-foreground
          "
          >
            {currentLabelMap[granularity]}
          </div>
          <div
            className="
    flex
    items-center
    gap-2
    text-sm
    text-muted-foreground
    justify-between
  "
          >
            <div
              className="
            text-5xl
            font-bold
            tracking-tight
          "
            >
              {refreshing || isLoading ? <Skeleton /> : totalQueries}
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="
            flex h-4 w-4 cursor-pointer
            items-center justify-center
            rounded-full border text-[10px]
          "
                  >
                    i
                  </span>
                </TooltipTrigger>

                <TooltipContent className="max-w-[260px]">
                  <p>
                    Displays questions metrics for {granularity} granularity
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {granularity === "daily" && (
            <button
              onClick={handleRefresh}
              className="absolute top-15 right-12 z-50 rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
              title="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 bg-background ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
            </button>
          )}
        </CardHeader>

        <CardContent>
          {refreshing || isLoading ? (
            <div className="space-y-4">
              {/* Header Number */}
              <Skeleton className="h-6 w-15" />

              {/* Chart */}
              <div className="flex items-end gap-2 h-40">
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    className="flex-1 rounded-t-xl"
                    style={{
                      height: `${40 + (index % 4) * 25}%`,
                    }}
                  />
                ))}
              </div>

              {/* Labels */}
              <div className="flex gap-2">
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton key={index} className="h-3 flex-1" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Chart */}
              <div
                className="
            flex
            items-end
            gap-2
            h-52
            mb-5
          "
              >
                {analytics.map((item, index) => {
                  const height = (item.totalQuestions / maxPoint) * 100;

                  return (
                    <div
                      key={index}
                      className="
                    flex
                    flex-col
                    items-center
                    flex-1
                    h-full
                    justify-end
                  "
                    >
                      {/* Tooltip */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="
                          w-full
                          bg-primary
                          hover:opacity-90
                          rounded-t-xl
                          transition-all
                          duration-200
                          cursor-pointer
                        "
                            style={{
                              height: `${Math.max(height, 8)}%`,
                            }}
                          />
                        </TooltipTrigger>

                        <TooltipContent
                          side="top"
                          className="
                        min-w-[240px]
                        rounded-xl
                        p-4
                        max-h-[35vh]
                        overflow-y-auto
                        scrollbar-thin
                        scrollbar-track-transparent
                        scrollbar-thumb-emerald-700
                        hover:scrollbar-thumb-emerald-600
                      "
                        >
                          <div className="space-y-2">
                            <div className="flex justify-between gap-6">
                              <span className="text-muted-foreground">
                                Total Questions Opened
                              </span>
                              <span className="font-medium">
                                {item.totalQuestions}
                              </span>
                            </div>

                            {Object.entries(item.statuses ?? {})
                              .sort(([, a], [, b]) => b - a)
                              .map(([status, count]) => (
                                <div
                                  key={status}
                                  className="flex justify-between gap-6"
                                >
                                  <span className="text-muted-foreground">
                                    {status
                                      .replace(/[_-]/g, " ")
                                      .replace(/\b\w/g, (char) =>
                                        char.toUpperCase(),
                                      )}
                                  </span>

                                  <span className="font-medium">{count}</span>
                                </div>
                              ))}

                            <div className="border-t border-border/40 pt-2 space-y-1.5">
                              <div className="text-[11px] font-semibold text-foreground">
                                Resolution Time Breakdown
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-muted-foreground text-xs">
                                  Closed
                                </span>
                                <span className="font-medium text-xs">
                                  {formatCloseTime(
                                    item.averageCloseTimeMinutes ?? 0,
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-muted-foreground text-xs">
                                  Dynamic Closed
                                </span>
                                <span className="font-medium text-xs">
                                  {formatCloseTime(
                                    item.averageDynamicCloseTimeMinutes ?? 0,
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-muted-foreground text-xs">
                                  Passed
                                </span>
                                <span className="font-medium text-xs">
                                  {formatCloseTime(
                                    item.averagePassTimeMinutes ?? 0,
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between gap-6 border-t border-border/20 pt-1.5 font-medium">
                                <span className="text-xs">Combined</span>
                                <span className="font-medium text-xs">
                                  {formatCloseTime(
                                    item.combinedAverageTimeMinutes ?? 0,
                                  )}
                                </span>
                              </div>
                            </div>

                            <div className="flex justify-between gap-6">
                              <span className="text-muted-foreground">
                                Total Questions Closed (For selected time)
                              </span>

                              <span className="font-medium">
                                {item.closedInPeriod ?? 0}
                              </span>
                            </div>

                            {granularity === "daily" &&
                              index === analytics.length - 1 && (
                                <div className="flex justify-between gap-6">
                                  <span className="text-muted-foreground">
                                    Questions Carry Forward
                                  </span>

                                  <span className="font-medium">
                                    {item.carryForward ?? 0}
                                  </span>
                                </div>
                              )}
                          </div>
                        </TooltipContent>
                      </Tooltip>

                      {/* X-axis label */}
                      <div
                        className="
                      mt-2
                      text-[11px]
                      text-muted-foreground
                    "
                      >
                        {formatLabel(item.period)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
