// @ts-nocheck
import { useEffect, useState } from "react";
import { X, Link2, FilePlus, Ban, Eye, ChevronDown, ChevronRight, Check, Undo2, Pencil, Send } from "lucide-react";
import { getDashboardUploadFileBlob } from "../../api";
import { DOCUMENT_METADATA_FIELDS } from "./fields";
import UploadEditForm from "./UploadEditForm";

const STATUS_LABELS = {
  queued: "Queued",
  hashing: "Hashing…",
  checking_duplicate: "Checking for duplicates…",
  uploading: "Uploading…",
};

const STAGE_LABELS = {
  approver: "Awaiting approver review",
  admin: "Awaiting admin decision",
  expert: "Returned to you",
};

// GET /dashboard/uploads/{id}/file is identity-checked like everything else, so it has to go
// through popFetch and come back as a blob rather than a plain <a href> — fetched on click, opened
// in a new tab, not embedded inline (expanding a row shows the edit box, not a document viewer).
async function viewUploadFile(uploadId) {
  const blob = await getDashboardUploadFileBlob(uploadId);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Upload Queue panel — top half of the right-side split in Add Document mode. Present by default
// with an empty state, not gated behind any action; polling/state lives in
// DocumentManagementPanel.tsx. GET /dashboard/uploads is now per-caller (own uploads at any stage,
// approver-stage items if an upload approver, admin-stage items if admin) rather than one shared
// list — see the SSE comment in the parent for why "upload" events now trigger a refetch instead
// of a merge.
//
// Each item now carries `stage` ("approver"|"admin"|"expert") and `actions` — computed server-side
// for THIS caller — {can_edit, can_approve, can_decline, can_decide, can_discard, can_remove}.
// Render buttons from `actions`, not from stage/role guesses: an upload approver viewing their OWN
// upload at "admin" stage (because it skipped approval) still only gets can_remove once it's
// returned to them, for example.
//
// Every upload still lands with up to 3 ranked `candidates` (best score first), each carrying its
// own can_add/can_create_new/new_placements — the person picks one (or none, if candidates is
// empty), then Add/New are offered only if BOTH the candidate allows it AND actions.can_decide is
// true (only admins decide Add vs. New now):
//   can_add          — this upload names a place the document isn't in yet
//   can_add: false    — already filed everywhere selected, hide Add
//   can_create_new    — a separate document is a legitimate answer
//   can_create_new: false — exact byte match (sha256 unique), hide New
//   candidates: []    — nothing matched: offer New + Discard only
// `processingIds` covers a New in flight (real Zoho upload happening server-side) — disable the
// row's actions and show a status line until it resolves.
export default function UploadQueuePanel({
  items,
  onCancelQueued,
  onAdd,
  onNew,
  onApprove,
  onDecline,
  onEdit,
  onResubmit,
  onDiscard,
  onRemove,
  onOpenDetail,
  busyId,
  processingIds,
}) {
  const [selected, setSelected] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [declining, setDeclining] = useState({}); // itemId -> note draft, while the note box is open
  const [confirmingDiscard, setConfirmingDiscard] = useState(() => new Set()); // itemIds pending a Discard confirmation
  const [editingIds, setEditingIds] = useState(() => new Set());
  const [savingEditId, setSavingEditId] = useState(null);

  function toggleExpanded(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setEditingFor(id, on) {
    setEditingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function saveEdit(item, fields) {
    setSavingEditId(item.id);
    try {
      await onEdit(item, fields);
      setEditingFor(item.id, false);
    } finally {
      setSavingEditId(null);
    }
  }

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
            const actions = item.actions || {};
            const canAdd = actions.can_decide && Boolean(selectedCandidate?.can_add);
            const canNew = actions.can_decide && (candidates.length === 0 || Boolean(selectedCandidate?.can_create_new));
            const placementsSummary = (item.placements || [])
              .map((p) => `${p.state}/${p.crop}`)
              .join(", ");
            const isExpanded = expanded.has(item.id);
            const declineNote = declining[item.id];
            const isConfirmingDiscard = confirmingDiscard.has(item.id);
            const isEditing = editingIds.has(item.id);
            const ready = Boolean(item.stage); // has reached a stage, not still queued/hashing/etc.
            const metadata = item.metadata || {};
            const itemLanguage = metadata.language || item.language;

            return (
              <div key={item.id} className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/10 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 min-w-0 cursor-pointer text-left"
                    onClick={() => toggleExpanded(item.id)}
                    title={isExpanded ? "Collapse" : "Expand — matches, metadata"}
                  >
                    {isExpanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
                    <span className="text-xs font-medium text-foreground truncate" title={item.filename}>
                      {item.filename}
                    </span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                      onClick={() => viewUploadFile(item.id)}
                      title="View the uploaded file"
                    >
                      <Eye size={12} />
                    </button>
                    {item.uploaded_by && (
                      <span className="text-[10px] text-muted-foreground/80 truncate" title="Uploader">
                        {item.uploaded_by}
                      </span>
                    )}
                    {item.status === "queued" && (
                      <button
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        onClick={() => onCancelQueued(item)}
                        disabled={disabled}
                      >
                        <X size={10} /> Cancel
                      </button>
                    )}
                  </div>
                </div>

                {(item.num_pages != null || itemLanguage) && (
                  <span className="text-[10px] text-muted-foreground">
                    {[itemLanguage, item.num_pages != null ? `${item.num_pages} pages` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
                {placementsSummary && (
                  <span className="text-[10px] text-muted-foreground/80 truncate">{placementsSummary}</span>
                )}

                {ready && (
                  <span className="text-[10px] font-medium text-primary">
                    {STAGE_LABELS[item.stage] || item.stage}
                  </span>
                )}
                {item.approved_by_approver && (
                  <span className="text-[10px] text-muted-foreground/80">
                    Approved by: {item.approved_by_approver}
                  </span>
                )}
                {item.approver_note && (
                  <span className="text-[11px] text-amber-600">Approver note: {item.approver_note}</span>
                )}
                {item.admin_note && (
                  <span className="text-[11px] text-amber-600">Admin note: {item.admin_note}</span>
                )}

                {isExpanded && (
                  <div className="flex flex-col gap-2 mt-1.5 rounded border border-border/40 bg-background/40 p-2">

                    {candidates.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          Matched document(s)
                        </span>
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

                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          Submitted metadata
                        </span>
                        {actions.can_edit && !isEditing && (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                            onClick={() => setEditingFor(item.id, true)}
                          >
                            <Pencil size={10} /> Edit
                          </button>
                        )}
                      </div>
                      {isEditing ? (
                        <UploadEditForm
                          item={item}
                          saving={savingEditId === item.id}
                          onSave={(fields) => saveEdit(item, fields)}
                          onCancel={() => setEditingFor(item.id, false)}
                        />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>Language: {itemLanguage || "—"}</span>
                          {metadata.district_id && <span>District: {metadata.district_id}</span>}
                          {metadata.kvk_id && <span>KVK: {metadata.kvk_id}</span>}
                          {placementsSummary && <span className="col-span-full">Placements: {placementsSummary}</span>}
                          {DOCUMENT_METADATA_FIELDS.filter((f) => metadata[f.key]).map((f) => (
                            <span key={f.key}>
                              {f.label}: {metadata[f.key]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {item.status === "failed" ? (
                  <span className="text-[11px] text-destructive">{item.error_message || "Upload failed"}</span>
                ) : !ready ? (
                  <span className="text-[11px] text-muted-foreground">
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                ) : processing ? (
                  <span className="text-[11px] text-muted-foreground italic">Processing as a new document…</span>
                ) : declineNote != null ? (
                  <div className="flex flex-col gap-1 mt-0.5">
                    <input
                      autoFocus
                      className="bg-input border border-border rounded px-2 py-1 text-xs"
                      placeholder="Reason for declining (required)"
                      value={declineNote}
                      onChange={(e) => setDeclining((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        className="px-2.5 py-1 rounded bg-destructive text-destructive-foreground text-[11px] font-medium hover:bg-destructive/90 cursor-pointer disabled:opacity-40"
                        disabled={disabled || !declineNote.trim()}
                        onClick={async () => {
                          await onDecline(item, declineNote.trim());
                          setDeclining((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          });
                        }}
                      >
                        Confirm decline
                      </button>
                      <button
                        className="px-2 py-0.5 rounded border border-border text-[10px] text-muted-foreground hover:bg-accent cursor-pointer"
                        onClick={() =>
                          setDeclining((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          })
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : isConfirmingDiscard ? (
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[11px] text-destructive">
                      Discard this upload? This cannot be undone.
                    </span>
                    <button
                      className="px-2.5 py-1 rounded bg-destructive text-destructive-foreground text-[11px] font-medium hover:bg-destructive/90 cursor-pointer disabled:opacity-40"
                      disabled={disabled}
                      onClick={async () => {
                        await onDiscard(item);
                        setConfirmingDiscard((prev) => {
                          const next = new Set(prev);
                          next.delete(item.id);
                          return next;
                        });
                      }}
                    >
                      Confirm discard
                    </button>
                    <button
                      className="px-2 py-0.5 rounded border border-border text-[10px] text-muted-foreground hover:bg-accent cursor-pointer"
                      onClick={() =>
                        setConfirmingDiscard((prev) => {
                          const next = new Set(prev);
                          next.delete(item.id);
                          return next;
                        })
                      }
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {actions.can_approve && (
                      <button
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-primary text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-40"
                        onClick={() => onApprove(item)}
                        disabled={disabled}
                      >
                        <Check size={10} /> Approve
                      </button>
                    )}
                    {actions.can_decline && (
                      <button
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40"
                        onClick={() => setDeclining((prev) => ({ ...prev, [item.id]: "" }))}
                        disabled={disabled}
                      >
                        <Undo2 size={10} /> Decline
                      </button>
                    )}
                    {actions.can_resubmit && (
                      <button
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-primary text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-40"
                        onClick={() => onResubmit(item)}
                        disabled={disabled}
                        title="Send this back to the upload approvers"
                      >
                        <Send size={10} /> Resubmit
                      </button>
                    )}
                    {canAdd && (
                      <button
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-primary text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-40"
                        onClick={() => onAdd(item, selectedCandidate.document_id, selectedCandidate)}
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
                    {actions.can_discard && (
                      <button
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40"
                        onClick={() =>
                          setConfirmingDiscard((prev) => {
                            const next = new Set(prev);
                            next.add(item.id);
                            return next;
                          })
                        }
                        disabled={disabled}
                        title="Discard — leave any matched document untouched"
                      >
                        <Ban size={10} /> Discard
                      </button>
                    )}
                    {actions.can_remove && !actions.can_discard && (
                      <button
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40"
                        onClick={() => onRemove(item)}
                        disabled={disabled}
                        title="Remove — then re-upload"
                      >
                        <X size={10} /> Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
