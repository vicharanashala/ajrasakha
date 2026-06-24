import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";

import { History } from "lucide-react";
import { useQuestionLifeCycle } from "./hooks/useActiveUsersAnalytics";
import React from "react";
import {
  AlertCircle,
  RefreshCw,
  Users,
  Pencil,
  TrendingUp,
} from "lucide-react";

type Insight = {
  type: "warning" | "reroute" | "people" | "process" | "success";
  title: string;
  description: string;
};

const iconMap = {
  warning: AlertCircle,
  reroute: RefreshCw,
  people: Users,
  process: Pencil,
  success: TrendingUp,
};

const colorMap = {
  warning: "text-red-500",
  reroute: "text-orange-500",
  people: "text-blue-500",
  process: "text-amber-500",
  success: "text-emerald-500",
};

const formatDuration = (ms?: number | null) => {
  if (ms == null) return "-";

  const totalSeconds = Math.floor(ms / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${mins}m`;
  }

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }

  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }

  return `${secs}s`;
};

const getDurationColor = (duration?: number | null) => {
  if (!duration) return "bg-primary";

  const minutes = duration / (1000 * 60);

  if (minutes < 5) {
    return "bg-emerald-500"; // Green
  }

  if (minutes <= 20) {
    return "bg-orange-500"; // Orange
  }

  return "bg-red-500"; // Red
};

export function QuestionLifecycleTable({
  open,
  onClose,
  questionId,
}: {
  open: boolean;
  onClose: () => void;
  questionId: string;
}) {
  const { data: lifeCycle = [], isLoading } = useQuestionLifeCycle(
    questionId,
    open,
  );

  const maxDuration = Math.max(...lifeCycle.map((x) => x.duration || 0), 1);

  const fastestReviewer = React.useMemo(() => {
    return lifeCycle
      .filter((x) => x.eventType === "reviewer" && x.duration && x.duration > 0)
      .sort((a, b) => (a.duration || 0) - (b.duration || 0))[0];
  }, [lifeCycle]);

  const firstTimedEvent = lifeCycle.find((x) => x.timestamp);

  const lastTimedEvent = [...lifeCycle].reverse().find((x) => x.timestamp);

  const isResolved = lifeCycle.some(
    (x) =>
      x.action?.toLowerCase().includes("closed") ||
      x.action?.toLowerCase().includes("passed"),
  );

  const isDuplicateQuestion = lifeCycle.some((x) =>
    x.action?.toLowerCase().includes("duplicate"),
  );

  const totalClosureTime =
    firstTimedEvent?.timestamp && lastTimedEvent?.timestamp
      ? (isResolved || isDuplicateQuestion
          ? new Date(lastTimedEvent.timestamp).getTime()
          : Date.now()) - new Date(firstTimedEvent.timestamp).getTime()
      : 0;
  const SLA_MS = 2 * 60 * 60 * 1000;

  const isSlaBreached = totalClosureTime > SLA_MS;

  const insights = React.useMemo(() => {
    if (!lifeCycle.length) return [];

    const activeReviewTime = lifeCycle
      .filter((x) => x.eventType === "author" || x.eventType === "reviewer")
      .reduce((sum, x) => sum + (x.duration || 0), 0);

    const waitTime = lifeCycle
      .filter((x) => x.eventType === "system_wait")
      .reduce((sum, x) => sum + (x.duration || 0), 0);

    const rerouteTime = lifeCycle
      .filter((x) => x.eventType === "reroute")
      .reduce((sum, x) => sum + (x.duration || 0), 0);

    const reviewerCount = new Set(
      lifeCycle.filter((x) => x.eventType === "reviewer").map((x) => x.user),
    ).size;

    const authorCount = new Set(
      lifeCycle.filter((x) => x.eventType === "author").map((x) => x.user),
    ).size;

    const rerouteCount = lifeCycle.filter(
      (x) => x.eventType === "reroute",
    ).length;

    const authoringTime = lifeCycle
      .filter((x) => x.eventType === "author")
      .reduce((sum, x) => sum + (x.duration || 0), 0);

    const insights: Insight[] = [];

    // Queue bottleneck
    if (waitTime > activeReviewTime && activeReviewTime > 0) {
      insights.push({
        type: "warning",
        title: `Queue wait (${formatDuration(waitTime)}) exceeds review effort (${formatDuration(activeReviewTime)})`,
        description:
          "The primary bottleneck is assignment/allocation delay rather than review speed.",
      });
    }

    // Reroutes
    if (rerouteCount > 0) {
      insights.push({
        type: "reroute",
        title: `${rerouteCount} reroute(s) added ${formatDuration(rerouteTime)} overhead`,
        description:
          "Questions were redirected for additional review, increasing turnaround time.",
      });
    }

    // Review structure
    if (reviewerCount >= 4) {
      insights.push({
        type: "people",
        title: `${reviewerCount} reviewers handled this question`,
        description:
          "Multiple review stages can introduce waiting time between assignments.",
      });
    }

    if (authoringTime > 20 * 60 * 1000) {
      insights.push({
        type: "process",
        title: `Authoring took ${formatDuration(authoringTime)}`,
        description:
          "Authoring exceeded the 20-minute benchmark, indicating a delay in content preparation.",
      });
    }

    const firstTimedEvent = lifeCycle.find((x) => x.timestamp);

    const lastTimedEvent = [...lifeCycle].reverse().find((x) => x.timestamp);

    const pushedToReviewTime =
      lifeCycle.find((x) => x.action === "Pushed To Review System")?.duration ||
      0;

    const totalIdleTime = waitTime;

    const isResolved = lifeCycle.some(
      (x) =>
        x.action?.toLowerCase().includes("closed") ||
        x.action?.toLowerCase().includes("passed"),
    );
    const isDuplicateQuestion = lifeCycle.some((x) =>
      x.action?.toLowerCase().includes("duplicate"),
    );

    const totalClosureTime =
      firstTimedEvent?.timestamp && lastTimedEvent?.timestamp
        ? (isResolved || isDuplicateQuestion
            ? new Date(lastTimedEvent.timestamp).getTime()
            : Date.now()) - new Date(firstTimedEvent.timestamp).getTime()
        : 0;
    const slowestStage = lifeCycle
      .filter((x) => x.duration && x.duration > 0)
      .reduce(
        (max, curr) =>
          (curr.duration || 0) > (max.duration || 0) ? curr : max,
        lifeCycle.find((x) => x.duration && x.duration > 0),
      );

    const slaBreached = totalClosureTime > 2 * 60 * 60 * 1000; // 2 hours

    insights.unshift({
      type: slaBreached ? "warning" : "process",
      title: slaBreached
        ? `SLA Breached (${formatDuration(totalClosureTime)})`
        : `Lifecycle duration: ${formatDuration(totalClosureTime)}`,
      description:
        slaBreached && slowestStage
          ? `Entered review queue in ${formatDuration(pushedToReviewTime)}, remained idle for ${formatDuration(totalIdleTime || totalClosureTime)}, and required ${formatDuration(activeReviewTime)} of active review effort. The longest stage was "${slowestStage.action}" (${formatDuration(slowestStage.duration)}) by ${slowestStage.user}.`
          : `Entered review queue in ${formatDuration(pushedToReviewTime)}, remained idle for ${formatDuration(totalIdleTime || totalClosureTime)}, and required ${formatDuration(activeReviewTime)} of active review effort.`,
    });

    // Fast reviewers
    const reviewerEvents = lifeCycle.filter(
      (x) => x.eventType === "reviewer" && x.duration,
    );

    const avgReviewTime =
      reviewerEvents.length > 0
        ? reviewerEvents.reduce((sum, x) => sum + x.duration, 0) /
          reviewerEvents.length
        : 0;

    if (avgReviewTime > 0 && avgReviewTime < 10 * 60 * 1000) {
      insights.push({
        type: "success",
        title: `Average review time is ${formatDuration(avgReviewTime)}`,
        description:
          "Reviewer turnaround is healthy. Delays likely originate elsewhere in the workflow.",
      });
    }

    const bufferEvents = lifeCycle.filter(
      (x) => x.eventType === "system_wait" && x.duration,
    );

    const avgBufferTime =
      bufferEvents.length > 0
        ? bufferEvents.reduce((sum, x) => sum + (x.duration || 0), 0) /
          bufferEvents.length
        : 0;

    if (avgBufferTime > 0) {
      insights.push({
        type: avgBufferTime > 20 * 60 * 1000 ? "warning" : "process",
        title: `Average buffer time: ${formatDuration(avgBufferTime)}`,
        description:
          avgBufferTime > 20 * 60 * 1000
            ? "Questions spent significant time waiting between workflow stages."
            : "Transition time between workflow stages remained within acceptable limits.",
      });
    }

    if (reviewerCount > 0) {
      insights.push({
        type: "people",
        title: `${reviewerCount} reviewer${
          reviewerCount > 1 ? "s" : ""
        } handled this question`,
        description:
          authorCount > 0
            ? `The workflow involved ${authorCount} author and ${reviewerCount} reviewer stages.`
            : "Multiple review stages can introduce waiting time between assignments.",
      });
    }
    return insights;
  }, [lifeCycle]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="!max-w-[80vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Question Lifecycle
            {isSlaBreached && (
              <div className="font-medium text-red-500">
                🚨 SLA Breached ({formatDuration(totalClosureTime)} / 2h)
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-6">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {lifeCycle.map((row, index) => {
                  const percent = row.duration
                    ? (row.duration / maxDuration) * 100
                    : 0;

                  const isSystem = row.user === "System";

                  const isFastestReviewer =
                    row.eventType === "reviewer" &&
                    fastestReviewer &&
                    row.user === fastestReviewer.user &&
                    row.duration === fastestReviewer.duration;

                  return (
                    <TableRow key={index}>
                      <TableCell>
                        {row.timestamp
                          ? new Date(row.timestamp).toLocaleString("en-IN")
                          : "-"}
                      </TableCell>

                      <TableCell>
                        {row.user}
                        {isFastestReviewer && (
                          <span className="text-xs font-medium text-emerald-600 mb-6">
                            🏆 Fastest Reviewer
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        {row.duration ? (
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-40 rounded bg-muted">
                              <div
                                className={`h-2 rounded ${
                                  isSystem
                                    ? "bg-yellow-500"
                                    : getDurationColor(row.duration)
                                }`}
                                style={{
                                  width: `${percent}%`,
                                }}
                              />
                            </div>

                            {formatDuration(row.duration)}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>

                      <TableCell>{row.action}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="space-y-4 mb-6 h-150px overflow-auto">
          {insights.map((insight, index) => {
            const Icon = iconMap[insight.type];

            return (
              <div key={index} className="rounded-xl border bg-card p-5">
                <div className="flex gap-4">
                  <Icon className={`h-6 w-6 mt-1 ${colorMap[insight.type]}`} />

                  <div>
                    <p className="font-semibold">{insight.title}</p>

                    <p className="text-sm text-muted-foreground">
                      {insight.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
