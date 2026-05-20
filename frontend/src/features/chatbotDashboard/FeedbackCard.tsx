import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Maximize2, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

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

  const feedbackLabelMap: Record<string, string> = {
    accurate_reliable: "Accuracy",
    clear_well_written: "Clarity",
    helpful_response: "Helpful Response",
    detailed_explanation: "Detailed Explanation",
    creative_solution: "Creative Solution",

    inaccurate: "Inaccuracy",
    not_matched: "Not Relevant",
    confusing_response: "Confusing Response",
    incomplete_answer: "Incomplete Answer",
  };

  const negativePercentage = (100 - Number(positivePercentage)).toFixed(2);

  const summarizeTags = (items: { tag: string }[]) => {
    const counts: Record<string, number> = {};

    items.forEach((item) => {
      const label = feedbackLabelMap[item.tag] || item.tag;

      counts[label] = (counts[label] || 0) + 1;
    });

    return Object.entries(counts).map(([label, count]) => ({
      label,
      count,
    }));
  };

  const positiveSummary = summarizeTags(positiveFeedbacks);

  const negativeSummary = summarizeTags(negativeFeedbacks);

  return (
    <>
      <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative overflow-hidden">
        {/* Maximize Button */}
        {total > 0 && (
          <button
            onClick={() => setIsMaximized(true)}
            className="absolute top-3 right-3 p-1.5 rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm z-20"
            title="Maximize chart"
          >
            <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        )}

        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>

        <CardContent>
          {total > 0 ? (
            <div className="space-y-5">
              {/* Summary */}
              <div className="flex items-center gap-6">
                {/* Positive */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: positiveColor }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {positiveFeedbacks.length}
                    </p>
                    <p className="text-xs text-gray-500">Positive</p>
                  </div>
                </div>

                {/* Negative */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: negativeColor }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {negativeFeedbacks.length}
                    </p>
                    <p className="text-xs text-gray-500">Negative</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <div className="relative w-40 h-40">
                  <svg className="w-40 h-40 -rotate-90" viewBox="0 0 120 120">
                    {/* Background */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      stroke="#2a2a2a"
                      strokeWidth="12"
                      fill="none"
                    />

                    {/* Negative Arc */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      stroke={negativeColor}
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={2 * Math.PI * 48}
                      strokeDashoffset={0}
                      strokeLinecap="butt"
                    />

                    {/* Positive Arc */}
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      stroke={positiveColor}
                      strokeWidth="12"
                      fill="none"
                      strokeLinecap="butt"
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

                  {/* Center Content */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">
                      {total}
                    </p>

                    <p className="text-xs text-gray-500 mt-1">Feedbacks</p>
                  </div>
                </div>
              </div>

              {/* Legends */}
              <div className="flex items-center justify-center gap-6 mt-6">
                {/* Positive */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: positiveColor,
                    }}
                  />

                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    Positive ({positiveFeedbacks.length})
                  </span>
                </div>

                {/* Negative */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: negativeColor,
                    }}
                  />

                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    Negative ({negativeFeedbacks.length})
                  </span>
                </div>
              </div>

              {/* Percentage */}
              <div className="flex justify-between text-xs text-gray-500">
                <span>{positivePercentage}% Positive</span>
                <span>
                  {(100 - Number(positivePercentage)).toFixed(2)}% Negative
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No feedback data</p>
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
                            {item.label}
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
                            {item.label}
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
