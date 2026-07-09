import { useEffect, useState } from "react";
import { AlertCircle, Clock, RefreshCw, Pencil, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/atoms/card";
import { useLifeCycleSummary } from "./hooks/useActiveUsersAnalytics";
import { Skeleton } from "@/components/atoms/skeleton";
import { Info } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/atoms/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

interface Props {
  startDate?: string;
  endDate?: string;
  source?: string;
  status?: string;
  userType?: string;
  isPassed?: boolean;
  tag?: string;
  notificationType?: string;
  totalClosedAndPassed?: number;
  userId?: string;
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
  totalClosedAndPassed,
  userId,
}: Props) {
  const {
    data: summary,
    isLoading,
    isRefetching,
  } = useLifeCycleSummary(
    startDate,
    endDate,
    source,
    status,
    userType,
    isPassed,
    tag,
    notificationType,
    userId,
  );
  // console.log("tag", summary);
  const primaryMetrics = [
    {
      title: "Authoring (R0)",
      value: summary?.avgAuthoringTime,
      tooltip:
        "Average time spent by authors writing answers.\n\nNumerator: Total authoring time across questions that reached R0.\nDenominator: Questions having an authoring stage (authoringCount).",
    },
    {
      title: "R1 Review",
      value: summary?.avgR1Time,
      tooltip:
        "Average duration of the first reviewer.\n\nNumerator: Sum of all first-review durations.\nDenominator: Questions that reached R1 (r1Count).",
    },
    {
      title: "Moderator",
      value: summary?.avgModeratorTime,
      tooltip:
        "Average time moderators spend approving questions.\n\nNumerator: Total moderator review duration.\nDenominator: Questions assigned to moderators (moderatorCount).",
    },
    {
      title: "Awaiting Moderator",
      value: summary?.avgAwaitingModeratorTime,
      tooltip:
        "Average waiting time between final reviewer completion and moderator assignment.\n\nNumerator: Total waiting time.\nDenominator: All questions in the selected dataset.",
    },
  ];

  const secondaryMetrics = [
    {
      title: "SLA Breached %",
      value:
        summary?.totalQuestions > 0
          ? (summary?.slaBreachedCount / summary?.totalQuestions) * 100
          : 0,
      formatter: (v: number) => `${v.toFixed(1)}%`,
      tooltip:
        "Percentage of resolved questions taking more than 2 hours.\n\nFormula:\n(SLA Breached Questions ÷ Total Questions) × 100",
    },
    {
      title: "Initial Allocation",
      value: summary?.avgInitialAllocationTime,
      tooltip:
        "Average time from question creation until first allocation.\n\nNumerator: Total initial allocation waiting time.\nDenominator: All questions.",
    },
    {
      title: "Pending Assignment",
      value: summary?.avgPendingAssignmentTime,
      tooltip:
        "Average buffer time between consecutive lifecycle stages.\n\nNumerator: Total 'Pending Next Assignment' duration.\nDenominator: All questions.",
    },
    {
      title: "Awaiting Closure",
      value: summary?.avgAwaitingClosureTime,
      tooltip:
        "Average delay between final processing and actual closure/pass.\n\nNumerator: Total waiting time before closed/passed.\nDenominator: All questions.",
    },
    {
      title: "R2 Review",
      value: summary?.avgR2Time,
      tooltip:
        "Average duration of the second reviewer.\n\nNumerator: Total R2 review duration.\nDenominator: Questions that reached R2 (r2Count).",
    },
    {
      title: "R3 Review",
      value: summary?.avgR3Time,
      tooltip:
        "Average duration of the third reviewer.\n\nNumerator: Total R3 review duration.\nDenominator: Questions that reached R3 (r3Count).",
    },
    {
      title: "Avg Reroutes",
      value: summary?.avgReroutesPerQuestion,
      formatter: (v: number) => v?.toFixed(2),
      tooltip:
        "Average reroutes per question.\n\nFormula:\nTotal Reroutes ÷ Total Questions.",
    },
    {
      title: "Resolution Rate",
      value: summary?.resolutionRate,
      formatter: (v: number) => `${v.toFixed(1)}%`,
      tooltip:
        "Percentage of questions that are closed or passed.\n\nFormula:\nResolved Questions ÷ Total Questions × 100.",
    },
  ];

  const topMetrics = [
    {
      title: "Questions",
      tooltip: "Total questions included after applying all filters.",
    },

    {
      title: "Avg Lifecycle",
      tooltip:
        "Average end-to-end lifecycle duration.\n\nNumerator: Total lifecycle time of resolved questions.\nDenominator: Closed/Passed questions only (resolvedQuestions).",
    },

    {
      title: "Avg Buffer",
      tooltip:
        "Sum of all average waiting periods:\n• Initial Allocation\n• Pending Assignment\n• Awaiting Moderator\n• Awaiting Closure\n\nRepresents non-working time in the lifecycle.",
    },

    {
      title: "Within SLA",
      tooltip:
        "Questions resolved within 2 hours.\n\nFormula:\nTotal Questions − SLA Breached Questions.",
    },
  ];

  // const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
  const totalBufferTime =
    (summary?.avgPushToReviewTime || 0) +
    (summary?.avgInitialAllocationTime || 0) +
    (summary?.avgPendingAssignmentTime || 0) +
    (summary?.avgAwaitingModeratorTime || 0) +
    (summary?.avgAwaitingClosureTime || 0);

  const topMetricValues = [
    {
      ...topMetrics[0],
      value: summary?.totalQuestions || 0,
    },
    {
      ...topMetrics[1],
      value: formatDuration(summary?.avgLifecycleTime),
    },
    {
      ...topMetrics[2],
      value: formatDuration(totalBufferTime),
    },
    {
      ...topMetrics[3],
      value: Math.max((totalClosedAndPassed || 0) - summary?.slaBreachedCount, 0),
      valueClass: "text-green-500",
    },
  ];

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

  // Animated loading messages
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const loadingMessages = [
    "Calculating lifecycle metrics...",
    "Analyzing question data...",
    "Processing resolution times...",
    "Computing insights...",
    "Almost there...",
  ];

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const updateMessage = () => {
      // Random delay between 5s and 15s
      const randomDelay = Math.floor(Math.random() * (15000 - 5000 + 1)) + 5000;

      timeoutId = setTimeout(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
        updateMessage(); 
      }, randomDelay);
    };

    updateMessage();

    return () => clearTimeout(timeoutId);
  }, []);

  if (isLoading || isRefetching) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        {/* Animated Spinner */}
        <div className="relative">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-primary/30 animate-ping opacity-20"></div>
        </div>
        
        {/* Rotating Loading Message */}
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 animate-pulse">
            {loadingMessages[loadingMessageIndex]}
          </p>
          {summary?.totalQuestions !== undefined && summary.totalQuestions > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Analyzing {summary.totalQuestions.toLocaleString()} question{summary.totalQuestions !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 overflow-auto">
      {/* Top KPIs */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {topMetricValues.map((item) => (
          <Card key={item.title}>
            <CardContent className="p-4">
              <MetricTitle title={item.title} tooltip={item.tooltip} />

              <p className={`text-2xl font-bold ${item.valueClass ?? ""}`}>
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Primary Metrics */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {primaryMetrics.map((item) => (
          <Card key={item.title}>
            <CardContent className="p-4">
              <div className="flex items-center gap-1 mb-2">
                <p className="text-sm text-muted-foreground">{item.title}</p>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button">
                      <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </TooltipTrigger>

                  <TooltipContent
                    side="top"
                    className="max-w-sm whitespace-pre-line z-9999"
                  >
                    {item.tooltip}
                  </TooltipContent>
                </Tooltip>
              </div>

              <p className="text-lg font-semibold">
                {item.formatter
                  ? item.formatter(item.value)
                  : formatDuration(item.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="advanced-metrics">
          <AccordionTrigger>Detailed Metrics</AccordionTrigger>

          <AccordionContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              {secondaryMetrics.map((item) => (
                <Card key={item.title}>
                  <CardContent className="p-4">
                    <MetricTitle
                      title={item.title}
                      tooltip={item.tooltip}
                      textClassName="text-xs"
                    />

                    <p className="text-lg font-semibold">
                      {item.formatter
                        ? item.formatter(item.value)
                        : formatDuration(item.value)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

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

const MetricTitle = ({
  title,
  tooltip,
  textClassName = "text-sm",
}: {
  title: string;
  tooltip: string;
  textClassName?: string;
}) => (
  <div className="flex items-center gap-1 mb-2">
    <p className={`${textClassName} text-muted-foreground`}>{title}</p>

    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="flex items-center">
          <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      </TooltipTrigger>

      <TooltipContent side="top" className="max-w-sm whitespace-pre-line z-9999">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  </div>
);
