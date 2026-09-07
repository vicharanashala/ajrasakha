// @ts-nocheck
import { useState } from "react";
import { X, Link2, FilePlus, Ban, Eye } from "lucide-react";

const STATUS_LABELS = {
  queued: "Queued",
  hashing: "Hashing…",
  checking_duplicate: "Checking for duplicates…",
  uploading: "Uploading…",
};

// Upload Queue panel — top half of the right-side split in Add Document mode. Present by default
// with an empty state, not gated behind any action; polling/state lives in
// DocumentManagementPanel.tsx.
//
// Every upload lands at awaiting_review with up to 3 ranked `candidates` (best score first), each
// carrying its own can_add/can_create_new/new_placements — this is NOT the old single
// match_type/similarity_score shape. The person picks one candidate (or none, if candidates is
// empty), then only the actions that candidate allows are offered:
//   can_add          — this upload names a place the document isn't in yet
//   can_add: false    — already filed everywhere selected, hide Add
//   can_create_new    — a separate document is a legitimate answer
//   can_create_new: false — exact byte match (sha256 unique), hide New
//   candidates: []    — nothing matched (not proof of no duplicate — sha256-only check today):
//                        offer New + Discard only
// `processingIds` covers a New in flight (real Zoho upload happening server-side) — disable the
// row's actions and show a status line until it resolves.
export default function UploadQueuePanel({
  items,
  onCancelQueued,
  onAdd,
  onNew,
  onCancelDuplicate,
  onOpenDetail,
  busyId,
  processingIds,
}) {
  const [selected, setSelected] = useState({});

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
            const candidates = item.candidates || [];
            const selectedId = selected[item.id] ?? candidates[0]?.document_id ?? null;
            const selectedCandidate = candidates.find((c) => c.document_id === selectedId) || null;
            const processing = processingIds.has(item.id);
            const disabled = busyId === item.id || processing;
            const canAdd = Boolean(selectedCandidate?.can_add);
            const canNew = candidates.length === 0 || Boolean(selectedCandidate?.can_create_new);
            const placementsSummary = (item.placements || [])
              .map((p) => `${p.state}/${p.crop}`)
              .join(", ");

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
                {placementsSummary && (
                  <span className="text-[10px] text-muted-foreground/80 truncate">{placementsSummary}</span>
                )}

                {item.status === "awaiting_review" ? (
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    {candidates.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">
                        No matching document by exact file hash — this only rules out this exact
                        file, not a re-scan or re-export of something already catalogued.
                      </span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {candidates.map((c) => (
                          <label
                            key={c.document_id}
                            className={`flex items-start gap-1.5 text-[11px] rounded border px-1.5 py-1 cursor-pointer
                              ${selectedId === c.document_id ? "border-primary bg-primary/5" : "border-border/50"}`}
                          >
                            <input
                              type="radio"
                              className="mt-0.5"
                              name={`candidate-${item.id}`}
                              checked={selectedId === c.document_id}
                              onChange={() => setSelected((prev) => ({ ...prev, [item.id]: c.document_id }))}
                            />
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-1 flex-wrap">
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {c.document_code}
                                </span>
                                <span className="truncate">{c.shareable_name}</span>
                                <span className={c.match_type === "sha" ? "text-amber-500" : "text-muted-foreground"}>
                                  {c.match_type === "sha" ? "exact match" : `${Math.round((c.score || 0) * 100)}% similar`}
                                </span>
                                <button
                                  type="button"
                                  className="flex items-center gap-0.5 text-primary hover:underline cursor-pointer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    onOpenDetail(c.document_id);
                                  }}
                                >
                                  <Eye size={9} /> view
                                </button>
                              </span>
                              <span className="block text-[10px] text-muted-foreground/80">
                                filed in {c.placement_count} place(s)
                                {c.new_placements?.length
                                  ? ` — adding would file it under ${c.new_placements.length} new place(s)`
                                  : " — nothing new to file"}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
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
                            onClick={() => onAdd(item, selectedCandidate.document_id)}
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
                          title="Discard — leave any matched document untouched"
                        >
                          <Ban size={10} /> Discard
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
