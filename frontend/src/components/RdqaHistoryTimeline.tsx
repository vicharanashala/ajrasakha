import React, { useState } from "react";
import { useRdqaCheckHistory } from "@/hooks/api/question/useRdqaCheckHistory";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import Spinner from "@/components/atoms/spinner";
import { humanize } from "@/features/gdb-cleaning/utils";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  History,
  ChevronDown,
  ChevronUp,
  RotateCw,
  FileText,
  User,
} from "lucide-react";
import { format } from "date-fns";

interface RdqaHistoryTimelineProps {
  questionId: string;
}

export const RdqaHistoryTimeline: React.FC<RdqaHistoryTimelineProps> = ({ questionId }) => {
  const { data: history = [], isLoading, error, refetch, isFetching } = useRdqaCheckHistory(questionId);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0); // Expand latest by default

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3 text-muted-foreground">
        <Spinner />
        <span className="text-xs">Loading quality check history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-2">
        <p className="text-sm font-medium text-destructive">Failed to load check history</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
          <RotateCw className="w-3.5 h-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 p-8 text-center space-y-2">
        <History className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <h4 className="text-sm font-semibold text-foreground">No Historical Checks Recorded</h4>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Past checks will appear here whenever automated quality audits or manual rechecks are performed on this question.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Evaluation Timeline ({history.length} {history.length === 1 ? "Run" : "Runs"})
          </h4>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
        >
          <RotateCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
        {history.map((record: any, index: number) => {
          const isLatest = index === 0;
          const isExpanded = expandedIndex === index;
          const flags: string[] = record.flags || [];
          const checksCount = record.checks?.length || 0;
          const passed = record.passed ?? flags.length === 0;
          const checkedDate = record.checkedAt ? new Date(record.checkedAt) : new Date();

          return (
            <div key={record._id || index} className="relative group">
              {/* Timeline marker */}
              <div
                className={`absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full border-2 bg-background flex items-center justify-center transition-all ${
                  passed
                    ? "border-emerald-500 text-emerald-500 ring-2 ring-emerald-500/20"
                    : "border-rose-500 text-rose-500 ring-2 ring-rose-500/20"
                }`}
              >
                <div
                  className={`h-1.5 w-1.5 rounded-full ${
                    passed ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
              </div>

              {/* Check Card */}
              <div
                className={`rounded-xl border transition-all text-xs bg-card ${
                  isExpanded
                    ? "border-indigo-200 dark:border-indigo-900 shadow-xs"
                    : "border-border/60 hover:border-border hover:bg-muted/30"
                }`}
              >
                <div
                  className="flex flex-wrap items-center justify-between gap-2 p-3.5 cursor-pointer select-none"
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status Badge */}
                    {passed ? (
                      <Badge className="bg-emerald-600 text-white font-medium text-[11px] py-0 px-2 gap-1 shadow-2xs">
                        <CheckCircle2 className="w-3 h-3" />
                        Passed (0 Flags)
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-600 text-white font-bold text-[11px] py-0 px-2 gap-1 shadow-2xs">
                        <AlertTriangle className="w-3 h-3" />
                        {flags.length} {flags.length === 1 ? "Flag" : "Flags"}
                      </Badge>
                    )}

                    {isLatest && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        Current
                      </span>
                    )}

                    {record.trigger && (
                      <span className="capitalize text-[11px] text-muted-foreground/80 px-1.5 py-0.5 rounded bg-muted">
                        {record.trigger.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                      <Clock className="w-3 h-3" />
                      {format(checkedDate, "MMM d, yyyy h:mm a")}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Collapsible Details */}
                {isExpanded && (
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-border/40 space-y-3 bg-muted/10 rounded-b-xl">
                    {/* Flags Triggered */}
                    {flags.length > 0 ? (
                      <div>
                        <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider block mb-1.5">
                          Flags Detected:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {flags.map((flag: string) => (
                            <span
                              key={flag}
                              className="inline-flex items-center rounded-md bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 px-2 py-0.5 font-medium border border-rose-200 dark:border-rose-900"
                            >
                              {humanize(flag)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-emerald-700 dark:text-emerald-400 font-medium text-[11px]">
                        ✓ All evaluated rules passed verification successfully.
                      </p>
                    )}

                    {/* Snapshot of Answer at Check Time */}
                    {record.answerSnapshot && (
                      <div className="space-y-1">
                        <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Answer Snapshot at Evaluation:
                        </span>
                        <div className="p-2.5 rounded-lg bg-background border border-border/60 text-muted-foreground text-[11px] leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap">
                          {record.answerSnapshot}
                        </div>
                      </div>
                    )}

                    {/* Meta Info */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground/70">
                      <span>Evaluated {checksCount} rules</span>
                      {record.checkedBy && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> Checked by {record.checkedBy}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

