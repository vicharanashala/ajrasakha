import { AlertCircle, Clock, RefreshCw, Users, Pencil } from "lucide-react";

import { Card, CardContent } from "@/components/atoms/card";
import { useLifeCycleSummary } from "./hooks/useActiveUsersAnalytics";
import { Skeleton } from "@/components/atoms/skeleton";
import { useState } from "react";
import { Button } from "@/components/atoms/button";

interface Props {
  startDate?: string;
  endDate?: string;
  source?: string;
  status?: string;
  userType?: string;
  isPassed?: boolean;
  tag?: string;
  notificationType?: string;
}

const formatDuration = (ms?: number) => {
  if (!ms) return "-";

  const totalSeconds = Math.floor(ms / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }

  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }

  return `${secs}s`;
};

export function QuestionLifecycleSummary({
  startDate,
  endDate,
  source,
  status,
  userType,
  isPassed,
  tag,
  notificationType,
}: Props) {
  const { data: summary, isLoading } = useLifeCycleSummary(
    startDate,
    endDate,
    source,
    status,
    userType,
    isPassed,
    tag,
    notificationType,
  );
  const primaryMetrics = [
    {
      title: "Authoring (R0)",
      value: summary?.avgAuthoringTime,
    },
    {
      title: "R1 Review",
      value: summary?.avgR1Time,
    },
    {
      title: "Moderator",
      value: summary?.avgModeratorTime,
    },
    {
      title: "Awaiting Moderator",
      value: summary?.avgAwaitingModeratorTime,
    },
  ];

  const secondaryMetrics = [
    {
      title: "Push To Review",
      value: summary?.avgPushToReviewTime,
    },
    {
      title: "Initial Allocation",
      value: summary?.avgInitialAllocationTime,
    },
    {
      title: "Pending Assignment",
      value: summary?.avgPendingAssignmentTime,
    },
    {
      title: "Awaiting Closure",
      value: summary?.avgAwaitingClosureTime,
    },
    {
      title: "R2 Review",
      value: summary?.avgR2Time,
    },
    {
      title: "R3 Review",
      value: summary?.avgR3Time,
    },
    {
      title: "Avg Reroutes",
      value: summary?.avgReroutesPerQuestion,
      formatter: (v: number) => v?.toFixed(2),
    },
    {
      title: "Resolution Rate",
      value: summary?.resolutionRate,
      formatter: (v: number) => `${v.toFixed(1)}%`,
    },
  ];

  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
  const totalBufferTime =
    (summary?.avgPushToReviewTime || 0) +
    (summary?.avgInitialAllocationTime || 0) +
    (summary?.avgPendingAssignmentTime || 0) +
    (summary?.avgAwaitingModeratorTime || 0) +
    (summary?.avgAwaitingClosureTime || 0);

  const biggestBottleneck = [
    {
      label: "Authoring",
      value: summary?.avgAuthoringTime || 0,
    },
    {
      label: "R1",
      value: summary?.avgR1Time || 0,
    },
    {
      label: "Moderator",
      value: summary?.avgModeratorTime || 0,
    },
    {
      label: "Awaiting Moderator",
      value: summary?.avgAwaitingModeratorTime || 0,
    },
  ].sort((a, b) => b.value - a.value)[0];

  const insights: {
    icon: any;
    color: string;
    title: string;
    description: string;
  }[] = [];

  if (biggestBottleneck.value > 0) {
    insights.push({
      icon: Clock,
      color: "text-red-500",
      title: `${biggestBottleneck.label} is the largest bottleneck`,
      description: `Average time: ${formatDuration(biggestBottleneck.value)}`,
    });
  }

  if ((summary?.avgAwaitingModeratorTime || 0) > 20 * 60 * 1000) {
    insights.push({
      icon: Clock,
      color: "text-purple-500",
      title: "Moderator assignment is the largest bottleneck",
      description: `Questions wait ${formatDuration(
        summary?.avgAwaitingModeratorTime,
      )} on average before moderator approval.`,
    });
  }

  if ((summary?.totalReroutes || 0) > 0) {
    insights.push({
      icon: RefreshCw,
      color: "text-orange-500",
      title: `${summary?.totalReroutes} reroutes occurred`,
      description: `Average reroute overhead: ${formatDuration(
        summary?.avgRerouteTime,
      )}`,
    });
  }

  // if ((summary?.avgReviewersPerQuestion || 0) > 1) {
  //   insights.push({
  //     icon: Users,
  //     color: "text-blue-500",
  //     title: `${summary?.avgReviewersPerQuestion.toFixed(
  //       1,
  //     )} reviewers per question`,
  //     description:
  //       "Multiple review stages introduce additional coordination overhead.",
  //   });
  // }

  if ((summary?.avgAuthoringTime || 0) > 20 * 60 * 1000) {
    insights.push({
      icon: Pencil,
      color: "text-amber-500",
      title: `Authoring averages ${formatDuration(summary?.avgAuthoringTime)}`,
      description: "Authoring time exceeds the expected 20-minute benchmark.",
    });
  }

  if ((summary?.slaBreachedCount || 0) > 0) {
    insights.push({
      icon: AlertCircle,
      color: "text-red-500",
      title: `${summary?.slaBreachedCount} SLA breaches`,
      description: `${(
        (summary?.slaBreachedCount / summary?.totalQuestions) *
        100
      ).toFixed(1)}% of questions breached the SLA.`,
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Insights */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-5">
                <div className="flex gap-4">
                  <Skeleton className="h-6 w-6 rounded-full mt-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 overflow-auto">
      {/* Top KPIs */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Questions</p>

            <p className="text-2xl font-bold">{summary?.totalQuestions || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Avg Lifecycle</p>

            <p className="text-2xl font-bold">
              {formatDuration(summary?.avgLifecycleTime)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Avg Buffer</p>

            <p className="text-2xl font-bold">
              {formatDuration(totalBufferTime)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">SLA Breaches</p>

            <p className="text-2xl font-bold text-red-500">
              {summary?.slaBreachedCount || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Primary Metrics */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {primaryMetrics.map((item) => (
          <Card key={item.title}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{item.title}</p>

              <p className="text-lg font-semibold">
                {item.formatter
                  ? item.formatter(item.value)
                  : formatDuration(item.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Advanced Metrics Toggle */}

      <div className="flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdvancedMetrics((prev) => !prev)}
        >
          {showAdvancedMetrics
            ? "Hide Detailed Metrics"
            : "Show Detailed Metrics"}
        </Button>
      </div>

      {/* Advanced Metrics */}

      {showAdvancedMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {secondaryMetrics.map((item) => (
            <Card key={item.title}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{item.title}</p>

                <p className="text-lg font-semibold">
                  {item.formatter
                    ? item.formatter(item.value)
                    : formatDuration(item.value)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Insights */}

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Lifecycle Insights</h3>

            <span className="text-sm text-muted-foreground">
              {insights.length} insights
            </span>
          </div>

          <div className="max-h-[250px] overflow-y-auto space-y-4 pr-2">
            {insights.map((insight, index) => {
              const Icon = insight.icon;

              return (
                <div
                  key={index}
                  className="flex gap-4 border-b pb-4 last:border-0"
                >
                  <Icon className={`h-6 w-6 mt-1 ${insight.color}`} />

                  <div>
                    <p className="font-semibold">{insight.title}</p>

                    <p className="text-sm text-muted-foreground">
                      {insight.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
