import { AlertCircle, Clock, RefreshCw, Users, Pencil } from "lucide-react";

import { Card, CardContent } from "@/components/atoms/card";
import { useLifeCycleSummary } from "./hooks/useActiveUsersAnalytics";
import { Skeleton } from "@/components/atoms/skeleton";

interface Props {
  startDate?: string;
  endDate?: string;
  source?: string;
  status?: string;
  userType?: string;
  isPassed?: boolean;
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
}: Props) {
  const { data: summary, isLoading } = useLifeCycleSummary(
    startDate,
    endDate,
    source,
    status,
    userType,
    isPassed,
  );
  const insights = [];

  if (
    (summary?.avgWaitTime || 0) > (summary?.avgReviewTime || 0) &&
    (summary?.avgReviewTime || 0) > 0
  ) {
    insights.push({
      icon: AlertCircle,
      color: "text-red-500",
      title: "Queue delay is the primary bottleneck",
      description: `Questions wait ${formatDuration(
        summary?.avgWaitTime || 0,
      )} on average but require only ${formatDuration(
        summary?.avgReviewTime || 0,
      )} of review effort.`,
    });
  }

  if ((summary?.totalReroutes || 0) > 0) {
    insights.push({
      icon: RefreshCw,
      color: "text-orange-500",
      title: `${summary?.totalReroutes || 0} reroutes occurred`,
      description: `Average reroute overhead: ${formatDuration(
        summary?.avgRerouteTime || 0,
      )}`,
    });
  }

  if ((summary?.avgReviewersPerQuestion || 0) > 1) {
    insights.push({
      icon: Users,
      color: "text-blue-500",
      title: `${(summary?.avgReviewersPerQuestion || 0).toFixed(
        1,
      )} reviewers per question`,
      description:
        "Multiple review stages may introduce additional waiting time.",
    });
  }

  if ((summary?.avgAuthoringTime || 0) > 20 * 60 * 1000) {
    insights.push({
      icon: Pencil,
      color: "text-amber-500",
      title: `Authoring averages ${formatDuration(
        summary?.avgAuthoringTime || 0,
      )}`,
      description: "Authoring time exceeds the 20-minute benchmark.",
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
                <Skeleton className="h-8 w-20" />
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

                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* KPI Cards */}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
              {formatDuration(summary?.avgClosureTime || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Avg Wait</p>

            <p className="text-2xl font-bold">
              {formatDuration(summary?.avgWaitTime || 0)}
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

      {/* Insights */}

      <div className="space-y-4">
        {insights.map((insight, index) => {
          const Icon = insight.icon;

          return (
            <Card key={index}>
              <CardContent className="p-5">
                <div className="flex gap-4">
                  <Icon className={`h-6 w-6 mt-1 ${insight.color}`} />

                  <div>
                    <p className="font-semibold">{insight.title}</p>

                    <p className="text-sm text-muted-foreground">
                      {insight.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
