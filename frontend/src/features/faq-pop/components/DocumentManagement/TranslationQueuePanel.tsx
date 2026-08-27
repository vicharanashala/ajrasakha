// @ts-nocheck
import { Square } from "lucide-react";

// Translation Queue panel (spec §8) — bottom half of the right-side split in Add Document mode.
// Present by default with an empty state; backed by GET /dashboard/translation-jobs (no status
// param = active queued/running jobs only). Stop is real cancellation — the row keeps showing
// "Stopping…" until a later poll confirms the job actually left the active list (stoppingIds is
// owned by the parent so it survives across polls until then).
export default function TranslationQueuePanel({ jobs, onCancel, onJumpToUniqueDoc, stoppingIds }) {
  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <h3 className="text-xs font-semibold text-foreground">Translation Queue</h3>
        <span className="text-[10px] text-muted-foreground">{jobs.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {jobs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground italic py-6">
            No translations in progress.
          </div>
        ) : (
          jobs.map((job) => {
            const stopping = stoppingIds.has(job.id);
            const hasProgress = job.pages_done != null && job.total_pages != null;
            return (
              <div key={job.id} className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/10 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="text-xs font-medium text-primary hover:underline truncate text-left cursor-pointer"
                    title={job.shareable_name}
                    onClick={() => onJumpToUniqueDoc(job.unique_document_id)}
                  >
                    {job.document_id}
                    {job.shareable_name ? ` — ${job.shareable_name}` : ""}
                  </button>
                  {(job.status === "queued" || job.status === "running") && (
                    <button
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                      onClick={() => onCancel(job)}
                      disabled={stopping}
                    >
                      <Square size={9} /> Stop
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {stopping
                    ? "Stopping…"
                    : job.status === "queued"
                      ? "Queued"
                      : hasProgress
                        ? `${job.pages_done} / ${job.total_pages} pages (${job.progress_pct}%)`
                        : "Starting…"}
                </span>
                {job.status === "failed" && (
                  <span className="text-[11px] text-destructive">{job.error_message || "Translation failed"}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
