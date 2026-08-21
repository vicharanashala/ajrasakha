import React from "react";
import { X, FileText, AlertTriangle, CheckCircle2, TrendingDown, Sparkles, Copy } from "lucide-react";
import type { IWeeklyDigestReport } from "../types";
import { toast } from "react-hot-toast";


interface Props {
  isOpen: boolean;
  onClose: () => void;
  digest?: IWeeklyDigestReport;
  isLoading: boolean;
}

export const WeeklyDigestModal: React.FC<Props> = ({
  isOpen,
  onClose,
  digest,
  isLoading,
}) => {
  if (!isOpen) return null;

  const handleCopy = () => {
    if (!digest) return;
    const text = `ACE Farmer Feedback Weekly Digest (${new Date(digest.periodStart).toLocaleDateString()} - ${new Date(digest.periodEnd).toLocaleDateString()})\n\n` +
      `Overall Satisfaction: ${digest.overallMetrics.helpfulnessPercentage}%\n` +
      `Total Responses: ${digest.overallMetrics.totalFeedbacks} (Yes: ${digest.overallMetrics.positiveCount}, No: ${digest.overallMetrics.negativeCount})\n\n` +
      `Recommendations:\n` +
      digest.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Digest copied to clipboard!");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-200 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Weekly Agri Team Digest</h2>
              <p className="text-xs text-slate-400">
                Ground-truth feedback insights and GDB refinement recommendations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Copy Summary"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isLoading || !digest ? (
          <div className="py-16 text-center text-slate-500 animate-pulse">
            Generating weekly agri team report...
          </div>
        ) : (
          <>
            {/* Period and Summary Metric Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400 block font-medium">Period Covered</span>
                <span className="text-sm font-semibold text-white mt-1 block">
                  {new Date(digest.periodStart).toLocaleDateString()} -{" "}
                  {new Date(digest.periodEnd).toLocaleDateString()}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400 block font-medium">Weekly Satisfaction</span>
                <span
                  className={`text-xl font-bold mt-1 block ${
                    digest.overallMetrics.helpfulnessPercentage >= 75
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {digest.overallMetrics.helpfulnessPercentage}%
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400 block font-medium">Total Responses</span>
                <span className="text-xl font-bold text-white mt-1 block">
                  {digest.overallMetrics.totalFeedbacks}
                </span>
              </div>
            </div>

            {/* Recommendations */}
            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <Sparkles className="w-4 h-4" />
                <span>Actionable Recommendations for Agri Specialists</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                {digest.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Lowest Rated GDB Entries */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <TrendingDown className="w-4 h-4 text-rose-400" />
                <span>Lowest-Rated GDB Entries This Week</span>
              </div>
              {digest.lowestRatedGDBEntries.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-800/40 text-center text-xs text-slate-500">
                  No GDB entries dropped below threshold this week.
                </div>
              ) : (
                <div className="space-y-2">
                  {digest.lowestRatedGDBEntries.map((item) => (
                    <div
                      key={item.questionId}
                      className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white line-clamp-1">
                          {item.questionText || `Question ${item.questionId}`}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{item.domain}</span>
                          <span>•</span>
                          <span>{item.crop}</span>
                          <span>•</span>
                          <span>{item.state}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-rose-400">
                          {item.helpfulnessPercentage}% Helpful
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.totalFeedbacks} reviews
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Complaint Domains */}
            {digest.topComplaintDomains.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Domains Requiring Standard PoP Review</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {digest.topComplaintDomains.map((d, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-amber-950/10 border border-amber-500/20 text-xs flex items-center justify-between"
                    >
                      <span className="font-medium text-amber-200">{d.domain}</span>
                      <span className="font-bold text-amber-400">
                        {d.helpfulnessPercentage}% ({d.negative} complaints)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
