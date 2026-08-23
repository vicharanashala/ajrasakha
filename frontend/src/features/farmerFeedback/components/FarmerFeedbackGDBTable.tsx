import React from "react";
import type {
  IGDBFeedbackSummary,
} from "../types";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { FarmerFeedbackApiService } from "../services/farmerFeedbackService";
import { toast } from "@/shared/components/toast";

interface Props {
  summaries: IGDBFeedbackSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onFlagEntry: (questionId: string) => void;
  onQuickSimulate: (questionId: string) => void;
  onRefetch?: () => void;
}

export const FarmerFeedbackGDBTable: React.FC<Props> = ({
  summaries,
  pagination,
  isLoading,
  onPageChange,
  onFlagEntry,
  onQuickSimulate,
  onRefetch,
}) => {
  const handleResetData = () => {
    FarmerFeedbackApiService.resetLocalGDBData();
    toast.success("GDB sample dataset refreshed successfully!");
    if (onRefetch) onRefetch();
  };

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-lg backdrop-blur-xl flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">
              Golden Database (GDB) Quality Leaderboard
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-medium border border-emerald-500/30">
              Live Synchronized
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Real farmer helpfulness ratings mapped directly to expert-verified Q&A pairs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleResetData}
            title="Reset & restore standard agricultural GDB sample dataset"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 text-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Reset / Re-seed GDB</span>
          </button>
          <div className="text-xs text-slate-400">
            Showing <strong className="text-slate-200">{summaries.length}</strong> of{" "}
            <strong className="text-slate-200">{pagination.total}</strong> entries
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-3 px-4 rounded-l-xl">GDB Question & ID</th>
              <th className="py-3 px-3">Domain / Crop</th>
              <th className="py-3 px-3">Region</th>
              <th className="py-3 px-3 text-center">Feedback Count</th>
              <th className="py-3 px-4 min-w-[150px]">Helpful Ratio (%)</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-4 rounded-r-xl text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500 animate-pulse">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400 animate-spin" />
                    <span>Loading Golden Database feedback summaries...</span>
                  </div>
                </td>
              </tr>
            ) : summaries.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                    <span className="font-medium text-slate-300">No GDB records found for the active filter</span>
                    <p className="text-xs text-slate-500">
                      Try clearing filters or click below to restore default verified agricultural records.
                    </p>
                    <button
                      onClick={handleResetData}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                    >
                      Restore Default Records
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              summaries.map((item) => {
                const score = item.helpfulnessPercentage;
                const isHealthy = score >= 75;
                const isAtRisk = score < 60 && item.totalFeedbacks < 10;
                const isFlagged = item.flaggedForReview || item.status === "flagged";

                return (
                  <tr
                    key={item.questionId}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* Question text & ID */}
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="font-medium text-white line-clamp-2">
                        {item.questionText || `Question ID: ${item.questionId}`}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                          {item.questionId}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(item.lastFeedbackAt).toLocaleDateString()}
                        </span>
                      </div>
                    </td>

                    {/* Domain & Crop */}
                    <td className="py-3.5 px-3">
                      <div className="font-medium text-slate-200">{item.domain || "General"}</div>
                      <div className="text-[11px] text-slate-400">{item.crop || "All Crops"}</div>
                    </td>

                    {/* State */}
                    <td className="py-3.5 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700/60 text-[10px] text-slate-300 font-medium">
                        {item.state || "National"}
                      </span>
                    </td>

                    {/* Total responses */}
                    <td className="py-3.5 px-3 text-center">
                      <span className="font-bold text-white text-sm">
                        {item.totalFeedbacks}
                      </span>
                      <div className="flex items-center justify-center gap-2 text-[10px] mt-0.5">
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <ThumbsUp className="w-2.5 h-2.5" />
                          {item.positiveCount}
                        </span>
                        <span className="text-rose-400 flex items-center gap-0.5">
                          <ThumbsDown className="w-2.5 h-2.5" />
                          {item.negativeCount}
                        </span>
                      </div>
                    </td>

                    {/* Helpfulness Score Bar */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span
                          className={
                            isHealthy
                              ? "text-emerald-400"
                              : score >= 60
                              ? "text-amber-400"
                              : "text-rose-400"
                          }
                        >
                          {score}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isHealthy
                              ? "bg-emerald-500"
                              : score >= 60
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                        />
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-3">
                      {isFlagged ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          Flagged / Re-Review
                        </span>
                      ) : isAtRisk ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <HelpCircle className="w-3 h-3 text-amber-400" />
                          At Risk (&lt;60%)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Healthy
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onQuickSimulate(item.questionId)}
                          title="Simulate farmer rating on this GDB entry"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        >
                          <ThumbsUp className="w-3.5 h-3.5 text-blue-400" />
                        </button>

                        {!isFlagged ? (
                          <button
                            onClick={() => onFlagEntry(item.questionId)}
                            title="Flag this answer for expert re-review in Reviewer Queue"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 transition-colors"
                          >
                            <Flag className="w-3 h-3 text-rose-400" />
                            <span>Flag for Review</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic px-2">
                            In Queue
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-4 text-xs text-slate-400">
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={!pagination.hasPrevPage}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={!pagination.hasNextPage}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
