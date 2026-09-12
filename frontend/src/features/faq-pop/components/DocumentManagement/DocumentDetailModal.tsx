// @ts-nocheck
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Anchor, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import {
  getDashboardUniqueDocument,
  getUniqueDocumentPlacements,
  updateDashboardUniqueDocument,
  deleteDashboardDocument,
  findDuplicatesForDocument,
  mergeUniqueDocuments,
} from "../../api";
import { DOCUMENT_METADATA_FIELDS, DISPLAY_ONLY_FIELDS } from "./fields";
import FileActionIcons from "./FileActionIcons";
import TranslateReviewCell from "./TranslateReviewCell";
import UniqueDocumentEditForm from "./UniqueDocumentEditForm";

const DETAIL_GRID_FIELDS = [...DOCUMENT_METADATA_FIELDS, ...DISPLAY_ONLY_FIELDS];

// Document Detail — replaces the old inline row-expand + separate cascade-delete flow. Opened as
// a modal from a placement row (Main Table), a document row (Documents tab), or a jump-link
// (Upload Queue "view match", Translation Queue). Fetches fresh on every open rather than trusting
// a stale cache, since this is the one place merge/re-anchor/placement-delete can change the
// document out from under a cached copy.
export default function DocumentDetailModal({
  documentId,
  open,
  onOpenChange,
  translationAvailable,
  onTranslationStarted,
  onPlacementsChanged,
}) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadDoc() {
    if (!documentId) return;
    setLoading(true);
    try {
      const data = await getDashboardUniqueDocument(documentId);
      setDoc(data);
    } catch (err) {
      toast.error(err.message || "Failed to load document");
    } finally {
      setLoading(false);
    }
  }

  const [placements, setPlacements] = useState(null);
  const [placementsLoading, setPlacementsLoading] = useState(false);
  async function loadPlacements() {
    if (!documentId) return;
    setPlacementsLoading(true);
    try {
      const data = await getUniqueDocumentPlacements(documentId);
      setPlacements(Array.isArray(data) ? data : data?.items || []);
    } catch (err) {
      toast.error(err.message || "Failed to load placements");
    } finally {
      setPlacementsLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !documentId) return;
    setDoc(null);
    setPlacements(null);
    setFindDuplicatesNote(null);
    loadDoc();
    loadPlacements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId]);

  const [editOpen, setEditOpen] = useState(false);

  const [deletingPlacementId, setDeletingPlacementId] = useState(null);
  async function handleDeletePlacement(row) {
    if (
      !window.confirm(
        `Remove this document from ${row.state} / ${row.crop}? The document itself and its other placements are not affected.`,
      )
    )
      return;
    setDeletingPlacementId(row.id);
    try {
      await deleteDashboardDocument(row.id);
      setPlacements((prev) => (prev || []).filter((p) => p.id !== row.id));
      loadDoc();
      onPlacementsChanged?.();
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setDeletingPlacementId(null);
    }
  }

  const [anchoring, setAnchoring] = useState(null);
  async function handleSetAnchor(link) {
    setAnchoring(link.zoho_file_id);
    try {
      const updated = await updateDashboardUniqueDocument(documentId, {
        representative_file_id: link.zoho_file_id,
      });
      setDoc((prev) => ({ ...prev, ...updated }));
      toast.success("Anchor updated");
    } catch (err) {
      toast.error(err.message || "Failed to re-anchor");
    } finally {
      setAnchoring(null);
    }
  }

  const [findDuplicatesNote, setFindDuplicatesNote] = useState(null);
  const [findingDuplicates, setFindingDuplicates] = useState(false);
  async function handleFindDuplicates() {
    setFindingDuplicates(true);
    try {
      const res = await findDuplicatesForDocument(documentId);
      setFindDuplicatesNote(
        res?.note || "No note returned — the duplicate-match algorithm isn't connected yet.",
      );
    } catch (err) {
      toast.error(err.message || "Failed to check for duplicates");
    } finally {
      setFindingDuplicates(false);
    }
  }

  const [mergeInput, setMergeInput] = useState("");
  const [merging, setMerging] = useState(false);
  async function handleMerge() {
    const absorb = mergeInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (absorb.length === 0) return;
    setMerging(true);
    try {
      const res = await mergeUniqueDocuments(documentId, absorb);
      toast.success(
        `Merged — ${res?.placements_repointed ?? 0} placement(s) repointed, now filed in ${res?.placement_count ?? "?"} place(s)`,
      );
      setMergeInput("");
      loadDoc();
      loadPlacements();
      onPlacementsChanged?.();
    } catch (err) {
      toast.error(err.message || "Merge failed");
    } finally {
      setMerging(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm pr-6">
              {doc?.document_id || documentId}
              {doc?.shareable_name ? ` — ${doc.shareable_name}` : ""}
            </DialogTitle>
          </DialogHeader>

          {loading || !doc ? (
            <div className="text-xs text-muted-foreground italic py-6 text-center">Loading…</div>
          ) : (
            <div className="flex flex-col gap-5 py-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  Filed in {doc.placement_count ?? "?"} place{doc.placement_count === 1 ? "" : "s"}
                </span>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil size={12} /> Edit metadata
                </button>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={loadDoc}
                >
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Original
                  </span>
                  <FileActionIcons
                    shareableLink={doc.shareable_link}
                    fileId={doc.representative_file_id}
                    filename={doc.shareable_name}
                  />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide ml-2">
                    Translation
                  </span>
                  <TranslateReviewCell
                    kind="translation"
                    doc={doc}
                    scope="document"
                    translationAvailable={translationAvailable}
                    resolvePlacementId={() => {
                      // placements load in parallel with doc, on a separate request — guard the
                      // window where doc has already rendered but placements haven't landed yet.
                      if (!placements?.[0]?.id) {
                        throw new Error("Placements are still loading — try again in a moment");
                      }
                      return placements[0].id;
                    }}
                    onChanged={(fresh) => setDoc((prev) => ({ ...prev, ...fresh }))}
                    onTranslationStarted={onTranslationStarted}
                  />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide ml-2">
                    Review
                  </span>
                  <TranslateReviewCell
                    kind="review"
                    doc={doc}
                    scope="document"
                    reviewUploadId={placements?.[0]?.id}
                    onChanged={(fresh) => setDoc((prev) => ({ ...prev, ...fresh }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                {DETAIL_GRID_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      {f.label}
                    </span>
                    <span className="text-xs text-foreground break-words">
                      {doc[f.key] || <span className="text-muted-foreground/40">—</span>}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-border/50 pt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-semibold text-foreground">
                    Placements ({placements?.length ?? "…"})
                  </h3>
                </div>
                {placementsLoading ? (
                  <div className="text-xs text-muted-foreground italic py-2">Loading…</div>
                ) : !placements || placements.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-2">No placements.</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {placements.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded border border-border/50 px-2.5 py-1.5"
                      >
                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                          {p.row_id}
                        </span>
                        <span className="text-xs text-foreground truncate">
                          {p.state} / {p.crop}
                        </span>
                        <div className="flex items-center gap-2 ml-auto shrink-0">
                          {/* Review upload lives once at the document level, above — POST
                              /documents/{row_id}/review resolves to the document regardless of
                              which placement's id is used, so one per row was just a way to
                              overwrite what the previous row's upload had stored. */}
                          <button
                            className="p-1 rounded border border-destructive/40 text-destructive/70 hover:border-destructive hover:text-destructive hover:bg-destructive/5 transition-colors cursor-pointer disabled:opacity-40"
                            onClick={() => handleDeletePlacement(p)}
                            disabled={deletingPlacementId === p.id}
                            title="Remove placement"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border/50 pt-3">
                <h3 className="text-xs font-semibold text-foreground mb-1.5">
                  Duplicate copies ({doc.duplicate_links?.length ?? 0})
                </h3>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Every distinct physical copy of this document in WorkDrive — usually one per
                  placement, but a file uploaded once and then filed in several places has fewer
                  copies than placements. The anchor is the copy translation acts on.
                </p>
                {!doc.duplicate_links || doc.duplicate_links.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-1">No copies on record.</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {(() => {
                      const hasChoice = doc.duplicate_links.length > 1;
                      return doc.duplicate_links.map((link) => {
                        const isAnchor = link.zoho_file_id === doc.representative_file_id;
                        return (
                          <div
                            key={link.zoho_file_id}
                            className="flex items-center justify-between gap-2 rounded border border-border/50 px-2.5 py-1.5"
                          >
                            <span className="text-xs font-mono text-muted-foreground shrink-0">
                              {link.row_id}
                            </span>
                            <a
                              href={link.shareable_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline truncate"
                              title={link.shareable_name}
                            >
                              {link.shareable_name}
                            </a>
                            <span
                              className="text-[10px] text-muted-foreground truncate"
                              title="The placement this copy was first filed under — not necessarily where the file lives now"
                            >
                              filed: {link.state} / {link.crop}
                            </span>
                            {isAnchor || !hasChoice ? (
                              <span className="flex items-center gap-1 text-[10px] text-primary shrink-0">
                                <Anchor size={10} /> anchor
                              </span>
                            ) : (
                              <button
                                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                                onClick={() => handleSetAnchor(link)}
                                disabled={anchoring === link.zoho_file_id}
                              >
                                <Anchor size={10} /> Set as anchor
                              </button>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              <div className="border-t border-border/50 pt-3">
                <h3 className="text-xs font-semibold text-foreground mb-1.5">Duplicate check</h3>
                <button
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40"
                  onClick={handleFindDuplicates}
                  disabled={findingDuplicates}
                >
                  <Search size={12} /> {findingDuplicates ? "Checking…" : "Find duplicates"}
                </button>
                {findDuplicatesNote && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">{findDuplicatesNote}</p>
                )}
              </div>

              <div className="border-t border-border/50 pt-3">
                <h3 className="text-xs font-semibold text-foreground mb-1">Merge</h3>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Absorb other documents into this one — their placements are repointed here, they
                  are deleted, and their copies join this document's duplicate copies above.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-input border border-border rounded-md px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                    placeholder="ANNAM_00123, ANNAM_00456…"
                    value={mergeInput}
                    onChange={(e) => setMergeInput(e.target.value)}
                  />
                  <button
                    className="px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-40"
                    onClick={handleMerge}
                    disabled={merging || !mergeInput.trim()}
                  >
                    {merging ? "Merging…" : "Merge in"}
                  </button>
                </div>
                {doc.merged_from?.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Already absorbed: {doc.merged_from.join(", ")}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {editOpen && doc && (
        <UniqueDocumentEditForm
          key={doc.id}
          doc={doc}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={(updated) => {
            setDoc((prev) => ({ ...prev, ...updated }));
            onPlacementsChanged?.();
          }}
        />
      )}
    </>
  );
}
