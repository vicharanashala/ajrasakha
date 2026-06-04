import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  Ban,
  CheckCircle,
  CircleAlert,
  ImageOff,
  Lightbulb,
  Maximize2,
  Pen,
  Search,
  ThumbsDown,
  X,
  InfoIcon,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";

function FeedbackCard({
  title,
  positiveFeedbacks,
  negativeFeedbacks,
  averageRating,
  positiveFeedbacksCount,
  negativeFeedbacksCount,
  totalFeedbacks = positiveFeedbacksCount + negativeFeedbacksCount,
}: {
  title: string;
  positiveFeedbacks: {
    rating: string;
    tag: string;
  }[];
  negativeFeedbacks: {
    rating: string;
    tag: string;
  }[];
  averageRating: number;
  positiveFeedbacksCount: number;
  negativeFeedbacksCount: number;
  totalFeedbacks?: number;
}) {
  const [isMaximized, setIsMaximized] = useState(false);

  const positiveColor = "#22c55e"; // green
  const negativeColor = "#f97316"; // orange

  const total =
    totalFeedbacks ?? positiveFeedbacks.length + negativeFeedbacks.length;

  const positivePercentage =
    total > 0 ? ((positiveFeedbacks.length / total) * 100).toFixed(2) : "0.00";

  const feedbackLabelMap: Record<
    string,
    {
      label: string;
      icon: React.ReactNode;
    }
  > = {
    accurate_reliable: {
      label: "Accurate and Reliable",
      icon: <Search className="w-4 h-4" />,
    },

    clear_well_written: {
      label: "Clear and Well-Written",
      icon: <Lightbulb className="w-4 h-4" />,
    },

    attention_to_detail: {
      label: "Attention to Detail",
      icon: <CheckCircle className="w-4 h-4" />,
    },

    creative_solution: {
      label: "Creative Solution",
      icon: <Pen className="w-4 h-4" />,
    },

    inaccurate: {
      label: "Inaccurate or incorrect",
      icon: <CircleAlert className="w-4 h-4" />,
    },

    not_matched: {
      label: "Didn't match question",
      icon: <CircleAlert className="w-4 h-4" />,
    },

    bad_style: {
      label: "Poor style or tone",
      icon: <Pen className="w-4 h-4" />,
    },

    missing_image: {
      label: "Expected an image",
      icon: <ImageOff className="w-4 h-4" />,
    },

    unjustified_refusal: {
      label: "Refused with reason",
      icon: <Ban className="w-4 h-4" />,
    },

    not_helpful: {
      label: "Lacked useful information",
      icon: <ThumbsDown className="w-4 h-4" />,
    },
  };

  const negativePercentage = (100 - Number(positivePercentage)).toFixed(2);

  const summarizeTags = (
    items: { tag: string }[],
    type: "positive" | "negative",
  ) => {
    const defaultCategories =
      type === "positive"
        ? {
            accurate_reliable: 0,
            clear_well_written: 0,
            attention_to_detail: 0,
            creative_solution: 0,
          }
        : {
            inaccurate: 0,
            not_matched: 0,
            bad_style: 0,
            missing_image: 0,
            unjustified_refusal: 0,
            not_helpful: 0,
          };

    items.forEach((item) => {
      if (defaultCategories[item.tag] !== undefined) {
        defaultCategories[item.tag]++;
      }
    });

    return Object.entries(defaultCategories).map(([tag, count]) => ({
      tag,
      count,
      label: feedbackLabelMap[tag]?.label || tag,
      icon: feedbackLabelMap[tag]?.icon || null,
    }));
  };

  const positiveSummary = summarizeTags(positiveFeedbacks, "positive");

  const negativeSummary = summarizeTags(negativeFeedbacks, "negative");

  return (
    <>
      <Card className="group relative overflow-hidden h-full flex flex-col border-border/60 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300">
        {/* Maximize Button */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        {total > 0 && (
          <button
            onClick={() => setIsMaximized(true)}
            className="absolute top-3 right-3 p-1.5 rounded-md bg-background/60 hover:bg-background border border-border/50 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 hover:scale-105 z-20"
            title="Maximize chart"
          >
            <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}

        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
            <CardTitle className="text-sm font-medium tracking-tight text-foreground/90 uppercase flex items-center gap-1.5">
              <span>{title}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground normal-case tracking-normal">
                    <InfoIcon className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="normal-case tracking-normal">
                  Shows customer rating breakdown and categorization of positive/negative feedback.
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col justify-center">
          {total > 0 ? (
            <div className="space-y-6">
              {/* Donut */}
              <div className="flex items-center justify-center">
                <div className="relative w-44 h-44">
                  {/* Soft glow */}
                  <div className="absolute inset-2 rounded-full blur-2xl opacity-20" />

                  <svg
                    className="relative w-44 h-44 -rotate-90"
                    viewBox="0 0 120 120"
                  >
                    <defs>
                      <linearGradient
                        id="posGrad"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stopColor={positiveColor}
                          stopOpacity="1"
                        />
                        <stop
                          offset="100%"
                          stopColor={positiveColor}
                          stopOpacity="0.75"
                        />
                      </linearGradient>
                      <linearGradient
                        id="negGrad"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop
                          offset="0%"
                          stopColor={negativeColor}
                          stopOpacity="1"
                        />
                        <stop
                          offset="100%"
                          stopColor={negativeColor}
                          stopOpacity="0.75"
                        />
                      </linearGradient>
                    </defs>

                    {/* Track */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      className="stroke-muted"
                      strokeWidth="10"
                      fill="none"
                    />

                    {/* Negative full ring */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      stroke="url(#negGrad)"
                      strokeWidth="10"
                      fill="none"
                      strokeLinecap="round"
                    />

                    {/* Positive arc on top */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      stroke="url(#posGrad)"
                      strokeWidth="10"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 48}
                      strokeDashoffset={
                        2 *
                        Math.PI *
                        48 *
                        (1 - Number(positivePercentage) / 100)
                      }
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>

                  {/* Center */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
                      {total}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                      Feedbacks
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full ring-4 ring-offset-0"
                    style={{
                      backgroundColor: positiveColor,
                      boxShadow: `0 0 0 4px ${positiveColor}20`,
                    }}
                  />
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {positiveFeedbacks.length}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Positive
                    </span>
                  </div>
                  <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">
                    {positivePercentage}%
                  </span>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: negativeColor,
                      boxShadow: `0 0 0 4px ${negativeColor}20`,
                    }}
                  />
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {negativeFeedbacks.length}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Negative
                    </span>
                  </div>
                  <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">
                    {(100 - Number(positivePercentage)).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <Maximize2 className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">No feedback yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maximized Modal */}
      {isMaximized &&
        total > 0 &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={() => setIsMaximized(false)}
          >
            <div
              className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-4xl w-full p-8 relative max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setIsMaximized(false)}
                className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>

              {/* Header */}
              <div className="mb-10">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">
                  {title}
                </h3>
              </div>

              {/* Large Donut */}
              <div className="flex flex-col items-center">
                <div className="relative w-72 h-72">
                  <svg className="w-72 h-72 -rotate-90" viewBox="0 0 120 120">
                    {/* Background */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      stroke="#2a2a2a"
                      strokeWidth="10"
                      fill="none"
                    />

                    {/* Negative */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      stroke={negativeColor}
                      strokeWidth="10"
                      fill="none"
                      strokeDasharray={2 * Math.PI * 48}
                      strokeDashoffset={0}
                    />

                    {/* Positive */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      stroke={positiveColor}
                      strokeWidth="10"
                      fill="none"
                      strokeDasharray={2 * Math.PI * 48}
                      strokeDashoffset={
                        2 *
                        Math.PI *
                        48 *
                        (1 - Number(positivePercentage) / 100)
                      }
                      className="transition-all duration-700"
                    />
                  </svg>

                  {/* Center */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-5xl font-bold text-gray-800 dark:text-gray-100">
                      {total}
                    </p>

                    <p className="text-sm text-gray-500 mt-2">
                      Total Feedbacks
                    </p>
                  </div>
                </div>

                {/* Percentages */}
                <div className="w-full flex items-center justify-between mt-8">
                  <div>
                    <p className="text-3xl font-bold text-green-500">
                      {positivePercentage}%
                    </p>

                    <p className="text-sm text-gray-500">Positive</p>
                  </div>

                  <div className="text-right">
                    <p className="text-3xl font-bold text-orange-500">
                      {negativePercentage}%
                    </p>

                    <p className="text-sm text-gray-500">Negative</p>
                  </div>
                </div>
              </div>

              {/* Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
                {/* Positive Table */}
                <div className="rounded-xl border border-green-900/40 overflow-hidden">
                  <div className="bg-green-500/10 px-5 py-4 border-b border-green-900/30">
                    <h4 className="text-lg font-semibold text-green-400">
                      Positive Feedback Summary
                    </h4>
                  </div>

                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left p-4 text-sm text-gray-400">
                          Category
                        </th>

                        <th className="text-right p-4 text-sm text-gray-400">
                          Count
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {positiveSummary.map((item, index) => (
                        <tr key={index} className="border-b border-gray-900">
                          <td className="p-4 text-sm text-gray-200">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400">{item.icon}</span>

                              <span>{item.label}</span>
                            </div>
                          </td>

                          <td className="p-4 text-right font-medium text-green-400">
                            {item.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Negative Table */}
                <div className="rounded-xl border border-orange-900/40 overflow-hidden">
                  <div className="bg-orange-500/10 px-5 py-4 border-b border-orange-900/30">
                    <h4 className="text-lg font-semibold text-orange-400">
                      Negative Feedback Summary
                    </h4>
                  </div>

                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left p-4 text-sm text-gray-400">
                          Category
                        </th>

                        <th className="text-right p-4 text-sm text-gray-400">
                          Count
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {negativeSummary.map((item, index) => (
                        <tr key={index} className="border-b border-gray-900">
                          <td className="p-4 text-sm text-gray-200">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400">{item.icon}</span>

                              <span>{item.label}</span>
                            </div>
                          </td>

                          <td className="p-4 text-right font-medium text-orange-400">
                            {item.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default FeedbackCard;
