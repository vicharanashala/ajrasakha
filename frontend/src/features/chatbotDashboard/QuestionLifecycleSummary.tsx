import {
  AlertCircle,
  Clock,
  RefreshCw,
  Users,
  Pencil,
} from "lucide-react";

import { Card, CardContent } from "@/components/atoms/card";

interface Props {
  summary: {
    totalQuestions: number;
    avgClosureTime: number;
    avgWaitTime: number;
    avgReviewTime: number;
    avgAuthoringTime: number;
    totalReroutes: number;
    avgRerouteTime: number;
    avgReviewersPerQuestion: number;
    slaBreachedCount: number;
  };
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
  summary,
}: Props) {
  const insights = [];

  if (
    summary.avgWaitTime > summary.avgReviewTime &&
    summary.avgReviewTime > 0
  ) {
    insights.push({
      icon: AlertCircle,
      color: "text-red-500",
      title: "Queue delay is the primary bottleneck",
      description: `Questions wait ${formatDuration(
        summary.avgWaitTime,
      )} on average but require only ${formatDuration(
        summary.avgReviewTime,
      )} of review effort.`,
    });
  }

  if (summary.totalReroutes > 0) {
    insights.push({
      icon: RefreshCw,
      color: "text-orange-500",
      title: `${summary.totalReroutes} reroutes occurred`,
      description: `Average reroute overhead: ${formatDuration(
        summary.avgRerouteTime,
      )}`,
    });
  }

  if (summary.avgReviewersPerQuestion > 1) {
    insights.push({
      icon: Users,
      color: "text-blue-500",
      title: `${summary.avgReviewersPerQuestion.toFixed(
        1,
      )} reviewers per question`,
      description:
        "Multiple review stages may introduce additional waiting time.",
    });
  }

  if (summary.avgAuthoringTime > 20 * 60 * 1000) {
    insights.push({
      icon: Pencil,
      color: "text-amber-500",
      title: `Authoring averages ${formatDuration(
        summary.avgAuthoringTime,
      )}`,
      description:
        "Authoring time exceeds the 20-minute benchmark.",
    });
  }

  return (
    <div className="space-y-6 p-6">

      {/* KPI Cards */}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Questions
            </p>

            <p className="text-2xl font-bold">
              {summary.totalQuestions}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Avg Lifecycle
            </p>

            <p className="text-2xl font-bold">
              {formatDuration(summary.avgClosureTime)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Avg Wait
            </p>

            <p className="text-2xl font-bold">
              {formatDuration(summary.avgWaitTime)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              SLA Breaches
            </p>

            <p className="text-2xl font-bold text-red-500">
              {summary.slaBreachedCount}
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
                  <Icon
                    className={`h-6 w-6 mt-1 ${insight.color}`}
                  />

                  <div>
                    <p className="font-semibold">
                      {insight.title}
                    </p>

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