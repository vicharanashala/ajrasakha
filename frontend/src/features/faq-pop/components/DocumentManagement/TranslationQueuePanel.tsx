// @ts-nocheck
import { Square, Trash2, RotateCcw } from "lucide-react";

const FINISHED_TABS = [
  { status: "done", label: "Succeeded" },
  { status: "failed", label: "Failed" },
  { status: "cancelled", label: "Cancelled" },
];

// Translation Queue panel (spec §8) — bottom half of the right-side split in Add Document mode.
// Present by default with an empty state; backed by GET /dashboard/translation-jobs (no status
// param = active queued/running jobs only). Stop is real cancellation — the row keeps showing
// "Stopping…" until a later poll confirms the job actually left the active list (stoppingIds is
// owned by the parent so it survives across polls until then).
//
// Translation now runs page by page (page_links on the job, one entry per page — "" = not done).
// A "failed" job keeps whatever pages it finished and can be retried in place (same job id, only
// the empty-link pages get redone) rather than restarted from scratch.
//
// A finished job (done/failed/cancelled) stays a queue row forever unless explicitly removed —
// removing it only clears the queue-view row, translation_status/translation_file_id on the
// document are untouched. Hidden behind a Succeeded/Failed/Cancelled tab control by default (the
// parent doesn't fetch a tab's history until it's selected, and only one tab's worth is ever held
// at a time).
export default function TranslationQueuePanel({
  jobs,
  onCancel,
  onOpenDetail,
  stoppingIds,
  finishedJobs,
  finishedFilter,
  onSetFinishedFilter,
  onRemove,
  removingIds,
  onRedo,
  redoingIds,
}) {
  function renderJob(job, { removable } = {}) {
    const stopping = stoppingIds.has(job.id);
    const removing = removingIds?.has(job.id);
    const redoing = redoingIds?.has(job.id);
    const isFailed = job.status === "failed";
    const hasProgress = job.pages_done != null && job.total_pages != null;
    const canCancel = job.status === "queued" || job.status === "running" || isFailed;
    return (
      <div key={job.id} className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/10 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <button
            className="text-xs font-medium text-primary hover:underline truncate text-left cursor-pointer"
            title={job.shareable_name}
            // unique_document_id is the backend's newer, explicit name for this — document_id is
            // already the same hex value (confirmed by the backend), so this works whether or not
            // the backend has deployed the unique_document_id field yet.
            onClick={() => onOpenDetail(job.unique_document_id || job.document_id)}
          >
            {job.document_code || job.document_id}
            {job.shareable_name ? ` — ${job.shareable_name}` : ""}
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {isFailed && (
              <button
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer disabled:opacity-40"
                onClick={() => onRedo(job)}
                disabled={redoing}
              >
                <RotateCcw size={9} /> {redoing ? "Retrying…" : "Translate again"}
              </button>
            )}
            {canCancel && (
              <button
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer disabled:opacity-40"
                onClick={() => onCancel(job)}
                disabled={stopping}
              >
                <Square size={9} /> {isFailed ? "Cancel" : "Stop"}
              </button>
            )}
            {removable && (
              <button
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer disabled:opacity-40"
                onClick={() => onRemove(job)}
                disabled={removing}
                title="Remove from queue view — the document's translation is not affected"
              >
                <Trash2 size={9} /> {removing ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {stopping
            ? "Stopping…"
            : job.status === "queued"
              ? "Queued"
              : job.status === "done"
                ? "Done"
                : job.status === "cancelled"
                  ? "Cancelled"
                  : job.status === "running" && hasProgress
                    ? `${job.pages_done} / ${job.total_pages} pages (${job.progress_pct}%)`
                    : job.status === "running"
                      ? "Starting…"
                      : isFailed && hasProgress
                        ? `${job.pages_done} / ${job.total_pages} pages done`
                        : job.status}
        </span>
        {isFailed && (
          <span className="text-[11px] text-destructive">{job.error_message || "Translation failed"}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <h3 className="text-xs font-semibold text-foreground">Translation Queue</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {FINISHED_TABS.map((tab) => (
              <button
                key={tab.status}
                className={`px-1.5 py-0.5 text-[10px] transition-colors cursor-pointer ${
                  finishedFilter === tab.status
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
                onClick={() => onSetFinishedFilter(tab.status)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">{jobs.length}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {jobs.length === 0 && (!finishedFilter || finishedJobs.length === 0) ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground italic py-6">
            No translations in progress.
          </div>
        ) : (
          <>
            {jobs.map((job) => renderJob(job))}
            {finishedFilter && finishedJobs.length > 0 && (
              <>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pt-1">
                  {FINISHED_TABS.find((t) => t.status === finishedFilter)?.label}
                </div>
                {finishedJobs.map((job) => renderJob(job, { removable: true }))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
