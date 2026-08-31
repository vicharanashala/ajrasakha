// @ts-nocheck
import { X, Link2, FilePlus, Ban } from "lucide-react";

const STATUS_LABELS = {
  queued: "Queued",
  hashing: "Hashing…",
  embedding: "Embedding…",
  checking_duplicate: "Checking for duplicates…",
  uploading: "Uploading…",
};

// Upload Queue panel (spec §4.3/§4.4) — top half of the right-side split in Add Document mode.
// Present by default with an empty state, not gated behind any action; polling/state lives in
// DocumentManagementPanel.tsx.
//
// Backend API changes (2026-08-26 round 6): `duplicate_found` is gone — renamed to
// `awaiting_review`, and EVERY upload lands there now, not just confident duplicates. There is no
// more silent auto-success path — a human always has to call Add/New/Cancel. `match_type`
// ("sha" | "embedding" | null) drives what's shown and which buttons are available:
//   - "sha"       — exact byte-for-byte match. Add always OK; New is disabled (409 otherwise).
//   - "embedding" — closest document by similarity, shown regardless of confidence (even <50%,
//                   which is normal for a genuinely novel document). Add and New both OK.
//   - null        — nothing to compare against at all (empty catalogue). Add is disabled (409
//                   otherwise, nothing to link to); New is the only way forward besides Cancel.
// `processingIds` covers a New in flight (real Zoho upload happening server-side) — disable the
// row's actions and show a status line until it resolves.
export default function UploadQueuePanel({
  items,
  onCancelQueued,
  onAdd,
  onNew,
  onCancelDuplicate,
  onJumpToUniqueDoc,
  busyId,
  processingIds,
}) {
  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <h3 className="text-xs font-semibold text-foreground">Upload Queue</h3>
        <span className="text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground italic py-6">
            No uploads in the queue.
          </div>
        ) : (
          items.map((item) => {
            const meta = item.metadata_payload || {};
            const summary = [meta.state_names?.join(", "), meta.crop_names?.join(", ")]
              .filter(Boolean)
              .join(" · ");
            const processing = processingIds.has(item.id);
            const disabled = busyId === item.id || processing;
            const canAdd = item.match_type != null; // duplicate_of_id set — 409 otherwise
            const canNew = item.match_type !== "sha"; // exact match can't be "a different document"

            return (
              <div key={item.id} className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/10 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground truncate" title={item.filename}>
                    {item.filename}
                  </span>
                  {item.status === "queued" && (
                    <button
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0"
                      onClick={() => onCancelQueued(item)}
                      disabled={disabled}
                    >
                      <X size={10} /> Cancel
                    </button>
                  )}
                </div>

                {(item.num_pages != null || item.language) && (
                  <span className="text-[10px] text-muted-foreground">
                    {[item.language, item.num_pages != null ? `${item.num_pages} pages` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
                {summary && <span className="text-[10px] text-muted-foreground/80 truncate">{summary}</span>}

                {item.status === "awaiting_review" ? (
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    <div className="text-[11px] flex items-center gap-1.5 flex-wrap">
                      {item.match_type === "sha" ? (
                        <span className="text-amber-500">Identical to an existing document (exact match)</span>
                      ) : item.match_type === "embedding" ? (
                        <span className="text-amber-500">
                          {Math.round((item.similarity_score || 0) * 100)}% similar (embedding match)
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No existing documents to compare against</span>
                      )}
                      {item.duplicate_of_id && (
                        <button
                          className="text-primary hover:underline cursor-pointer"
                          onClick={() => onJumpToUniqueDoc(item.duplicate_of_id)}
                        >
                          view match
                        </button>
                      )}
                    </div>
                    {item.note && <span className="text-[10px] text-muted-foreground">{item.note}</span>}
                    {processing ? (
                      <span className="text-[11px] text-muted-foreground italic">
                        Processing as a new document…
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {canAdd && (
                          <button
                            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-primary text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-40"
                            onClick={() => onAdd(item)}
                            disabled={disabled}
                            title="This is the same document — link the new placement(s) onto it"
                          >
                            <Link2 size={10} /> Add
                          </button>
                        )}
                        {canNew && (
                          <button
                            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40"
                            onClick={() => onNew(item)}
                            disabled={disabled}
                            title="This is actually a different document"
                          >
                            <FilePlus size={10} /> New
                          </button>
                        )}
                        <button
                          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40"
                          onClick={() => onCancelDuplicate(item)}
                          disabled={disabled}
                          title="Don't append — leave any matched document untouched"
                        >
                          <Ban size={10} /> Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ) : item.status === "failed" ? (
                  <span className="text-[11px] text-destructive">{item.error_message || "Upload failed"}</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
