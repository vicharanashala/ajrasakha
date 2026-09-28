import React, { useEffect, useState } from "react";
import { useBulkUploadStore } from "@/stores/bulk-upload-store";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Trash2,
  AlertTriangle,
} from "lucide-react";

export const BulkUploadProgressTracker: React.FC = () => {
  const {
    jobId,
    operationType,
    total,
    processed,
    created,
    deleted,
    duplicates,
    failed,
    status,
    latestLog,
    isMinimized,
    toggleMinimize,
    clearJob,
  } = useBulkUploadStore();

  const [dismissCountdown, setDismissCountdown] = useState<number | null>(null);

  // Auto-dismiss timer after job completes or fails
  useEffect(() => {
    if (status === "completed" || status === "failed") {
      setDismissCountdown(5);
      const interval = setInterval(() => {
        setDismissCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            clearJob();
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setDismissCountdown(null);
    }
  }, [status, clearJob]);

  if (status === "idle" || !jobId) {
    return null;
  }

  const isDelete = operationType === "delete";
  const safeTotal = total > 0 ? total : 1;
  const currentProcessed = Math.max(0, Math.min(processed, safeTotal));
  const percentage = Math.min(
    100,
    Math.max(
      0,
      status === "completed"
        ? 100
        : Math.round((currentProcessed / safeTotal) * 100)
    )
  );

  const isRunning = status === "running";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  // Minimized Pill View
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-300">
        <div
          onClick={toggleMinimize}
          className={`flex items-center gap-3 px-4 py-2.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-xl border border-zinc-200 dark:border-zinc-800 rounded-full cursor-pointer transition-all text-xs font-medium text-zinc-800 dark:text-zinc-200 group ${
            isDelete
              ? "hover:border-rose-500/50 dark:hover:border-rose-400/50"
              : "hover:border-emerald-500/50 dark:hover:border-emerald-400/50"
          }`}
        >
          {isRunning && (
            <Loader2
              className={`h-4 w-4 animate-spin ${
                isDelete
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            />
          )}
          {isCompleted && (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          )}
          {isFailed && (
            <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          )}

          <span>
            {isDelete
              ? isRunning
                ? `Deleting Questions: ${percentage}%`
                : isCompleted
                ? `Delete Complete (${deleted}/${total})`
                : "Delete Finished with Errors"
              : isRunning
              ? `Processing Questions: ${percentage}%`
              : isCompleted
              ? `Upload Complete (${created}/${total})`
              : "Upload Finished with Errors"}
          </span>

          <ChevronUp className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200 ml-1" />
        </div>
      </div>
    );
  }

  // Header icon background & text styles
  const iconContainerClass = isFailed
    ? "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
    : isCompleted
    ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400"
    : isDelete
    ? "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
    : "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400";

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="relative overflow-hidden rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-2xl border border-zinc-200/90 dark:border-zinc-800 p-4.5 text-zinc-900 dark:text-zinc-100 transition-all">
        {/* Glow Accent Bar */}
        <div
          className={`absolute top-0 left-0 right-0 h-1 ${
            isRunning
              ? isDelete
                ? "bg-gradient-to-r from-rose-500 via-red-500 to-amber-500 animate-pulse"
                : "bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 animate-pulse"
              : isCompleted
              ? "bg-emerald-500"
              : "bg-rose-500"
          }`}
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex items-center justify-center h-8 w-8 rounded-xl ${iconContainerClass}`}
            >
              {isRunning && (
                isDelete ? (
                  <Trash2 className="h-4 w-4 animate-pulse" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )
              )}
              {isCompleted && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              )}
              {isFailed && <AlertTriangle className="h-4 w-4" />}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-none">
                {isDelete
                  ? isRunning
                    ? "Bulk Deleting Questions"
                    : isCompleted
                    ? "Bulk Delete Completed"
                    : "Bulk Delete Finished"
                  : isRunning
                  ? "Bulk Uploading Questions"
                  : isCompleted
                  ? "Bulk Upload Completed"
                  : "Bulk Upload Finished"}
              </h4>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                {isRunning
                  ? isDelete
                    ? "Removing questions in background"
                    : "Processing in background workers"
                  : dismissCountdown !== null
                  ? `Dismissing in ${dismissCountdown}s...`
                  : "Completed"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={toggleMinimize}
              title="Minimize"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={clearJob}
              title="Dismiss"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar & Percentage */}
        <div className="space-y-1.5 pt-1 pb-3">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-zinc-600 dark:text-zinc-300">
              {currentProcessed} of {total} {isDelete ? "deleted" : "processed"}
            </span>
            <span
              className={`font-semibold ${
                isCompleted
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isDelete
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-zinc-700 dark:text-zinc-200"
              }`}
            >
              {percentage}%
            </span>
          </div>

          <div className="h-2.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                isRunning
                  ? isDelete
                    ? "bg-gradient-to-r from-rose-500 via-red-500 to-amber-500 shadow-sm"
                    : "bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 shadow-sm"
                  : isCompleted
                  ? "bg-emerald-500"
                  : "bg-rose-500"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Breakdown Metric Chips */}
        {isDelete ? (
          <div className="grid grid-cols-3 gap-2 pt-1 pb-2">
            {/* Deleted */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-800/30">
              <span className="text-[10px] uppercase font-bold tracking-wider text-rose-700 dark:text-rose-400">
                Deleted
              </span>
              <span className="text-sm font-bold text-rose-800 dark:text-rose-300 mt-0.5">
                {deleted}
              </span>
            </div>

            {/* Remaining */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-600 dark:text-zinc-400">
                Remaining
              </span>
              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mt-0.5">
                {Math.max(0, total - processed)}
              </span>
            </div>

            {/* Failed / Errors */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700 dark:text-amber-400">
                Errors
              </span>
              <span className="text-sm font-bold text-amber-800 dark:text-amber-300 mt-0.5">
                {failed}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 pt-1 pb-2">
            {/* Created */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400">
                Created
              </span>
              <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
                {created}
              </span>
            </div>

            {/* Duplicates */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700 dark:text-amber-400">
                Duplicate
              </span>
              <span className="text-sm font-bold text-amber-800 dark:text-amber-300 mt-0.5">
                {duplicates}
              </span>
            </div>

            {/* Failed / Errors */}
            <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-800/30">
              <span className="text-[10px] uppercase font-bold tracking-wider text-rose-700 dark:text-rose-400">
                Errors
              </span>
              <span className="text-sm font-bold text-rose-800 dark:text-rose-300 mt-0.5">
                {failed}
              </span>
            </div>
          </div>
        )}

        {/* Live log snippet */}
        {latestLog && (
          <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 truncate bg-zinc-50 dark:bg-zinc-950/60 px-2.5 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
            💬 {latestLog}
          </div>
        )}

        {/* Auto-dismiss progress bar indicator when completed */}
        {dismissCountdown !== null && (
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
            <span>Auto-dismissing...</span>
            <button
              onClick={clearJob}
              className={`text-xs font-semibold hover:underline ${
                isDelete
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              Dismiss now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
