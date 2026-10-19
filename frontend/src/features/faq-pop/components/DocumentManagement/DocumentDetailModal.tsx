// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Anchor, Pencil, Plus, RefreshCw, Scissors, Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import {
  getDashboardUniqueDocument,
  getUniqueDocumentPlacements,
  deleteDashboardDocument,
  findDuplicatesForDocument,
  mergeUniqueDocuments,
  deleteDuplicateLink,
  unlinkMergedGroup,
  getOriginalDownloadUrl,
  getDashboardStates,
  getDashboardFolders,
  addDocumentPlacement,
} from "../../api";
import { formatDate } from "@/utils/formatDate";
import {
  DOCUMENT_METADATA_FIELDS,
  DISPLAY_ONLY_FIELDS,
  folderDisplayLabel,
  filterFoldersByAdvisoryScope,
} from "./fields";
import FileActionIcons from "./FileActionIcons";
import TranslateReviewCell from "./TranslateReviewCell";
import UniqueDocumentEditForm from "./UniqueDocumentEditForm";
import { StateSelector } from "../FunctionsPanel/RunTile";

// Language/District/KVK are document-level fields the unique-document response always carries
// (language, district, kvk — names; district_id/kvk_id alongside) but aren't in
// DOCUMENT_METADATA_FIELDS/DISPLAY_ONLY_FIELDS (those live in EDITABLE_DOCUMENT_ONLY_FIELDS, which
// this grid doesn't spread since it's keyed for the edit form, not display) — added here, read-only,
// so the grid doesn't show Language Source with no Language next to it.
const DETAIL_GRID_FIELDS = [
  ...DOCUMENT_METADATA_FIELDS,
  { key: "language", label: "Language", type: "text", group: "Language" },
  { key: "district", label: "District", type: "text", group: "Location" },
  { key: "kvk", label: "KVK", type: "text", group: "Location" },
  ...DISPLAY_ONLY_FIELDS,
];

function formatMergedAtIst(iso) {
  if (!iso) return "unknown date";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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
  canTranslate = false,
  onTranslationStarted,
  onPlacementsChanged,
  canEdit = true,
  currentUserName,
  translationJobs = [],
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

  // Add Placement — files this EXISTING document under another state/folder (2026-10-05 backend
  // endpoint). Purely document-level: no restriction on which table/placement launched this modal.
  // State/folder options are fetched UNSCOPED (no state_id on the folders call) rather than reused
  // from anywhere scoped — a state_id-scoped crops/organizations/folders list only contains
  // folders ALREADY USED under that state, which is too narrow for a new filing (the whole point
  // is often to use a folder nobody's used there yet).
  const [addPlacementOpen, setAddPlacementOpen] = useState(false);
  const [placementStates, setPlacementStates] = useState([]);
  const [placementFolders, setPlacementFolders] = useState([]);
  // StateSelector (reused here for both State and Folder — it's really a generic searchable
  // single-select over a string list, same combobox used by Add Document's own State/Folder
  // pickers) works in NAMES, so the picked name is resolved back to an id just before submit —
  // same pattern AddDocumentForm.tsx and MainTable's inline editor already use.
  const [newPlacementState, setNewPlacementState] = useState("");
  const [newPlacementFolder, setNewPlacementFolder] = useState("");
  const [addingPlacement, setAddingPlacement] = useState(false);

  useEffect(() => {
    if (!addPlacementOpen) return;
    getDashboardStates()
      .then((d) => setPlacementStates(d || []))
      .catch(() => {});
    getDashboardFolders(doc?.advisory_type)
      .then((d) => setPlacementFolders(d || []))
      .catch(() => {});
    // This document's own Advisory Scope is Central → auto-select the real "Central" state
    // (backend-confirmed real state, not a pseudo one) rather than making the user pick it.
    if (doc?.advisory_scope === "Central") setNewPlacementState("Central");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addPlacementOpen]);

  // "Central" is a real backend state (getDashboardStates, api.ts) but never worth offering as a
  // pick here — auto-filled instead whenever this document's own Advisory Scope is Central (see
  // the effect above and the static "Central" display below), same rule as the Add/Edit forms.
  const placementStateNames = placementStates.map((s) => s.name).filter((n) => n !== "Central");
  // Organisations offered here are narrowed to THIS document's own Advisory Scope (type == scope,
  // same rule as the Add/Edit forms) — crops are unaffected. Labels are still disambiguated
  // against the full placementFolders list (not the narrowed one) so a label picked from the
  // narrowed list matches exactly what handleAddPlacement's own full-list lookup below expects.
  const visiblePlacementFolders = filterFoldersByAdvisoryScope(placementFolders, doc?.advisory_scope);
  const placementFolderLabels = visiblePlacementFolders.map((f) => folderDisplayLabel(f, placementFolders));

  async function handleAddPlacement() {
    const stateOpt = placementStates.find((s) => s.name === newPlacementState);
    const folder = placementFolders.find(
      (f) => folderDisplayLabel(f, placementFolders) === newPlacementFolder,
    );
    if (!stateOpt || !folder) {
      toast.error("Pick a state and a folder");
      return;
    }
    const body = { state_id: stateOpt.id };
    if (folder.kind === "organization") body.organization_id = folder.id;
    else body.crop_id = folder.id;
    setAddingPlacement(true);
    try {
      const row = await addDocumentPlacement(documentId, body);
      setPlacements((prev) => [...(prev || []), row]);
      loadDoc();
      onPlacementsChanged?.();
      toast.success(`Filed as ${row.row_id}`);
      setNewPlacementState("");
      setNewPlacementFolder("");
      setAddPlacementOpen(false);
    } catch (err) {
      // 409 names the existing row the document is already filed under there — the message is
      // written to be shown as-is, same as every other error surfaced via toast in this modal.
      toast.error(err.message || "Failed to add placement");
    } finally {
      setAddingPlacement(false);
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

  // Merge is disabled while THIS document is being translated — the backend 409s on the survivor
  // (and names the busy id if it's one of the absorbed ones instead, surfaced via the error toast
  // below, not pre-checked here).
  const isTranslating =
    doc?.translation_status === "in_progress" ||
    translationJobs.some((j) => (j.document_id || j.unique_document_id) === documentId);

  async function handleMerge() {
    const absorb = mergeInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (absorb.length === 0) return;
    setMerging(true);
    try {
      const res = await mergeUniqueDocuments(documentId, absorb, currentUserName);
      toast.success(
        `Merged — ${res?.placements_moved ?? 0} placement(s) added, ${res?.placements_dropped ?? 0} already filed, now filed in ${res?.placement_count ?? "?"} place(s)`,
      );
      if (res?.not_trashed?.length > 0) {
        toast.warning("Some old translation files could not be trashed from WorkDrive.");
      }
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

  const [deletingLinkId, setDeletingLinkId] = useState(null);
  async function handleDeleteDuplicateLink(link) {
    if (
      !window.confirm(
        `This copy (${link.shareable_name}) will be deleted from WorkDrive. Continue?`,
      )
    )
      return;
    setDeletingLinkId(link.zoho_file_id);
    try {
      const updated = await deleteDuplicateLink(documentId, link.zoho_file_id);
      setDoc((prev) => ({ ...prev, ...updated }));
    } catch (err) {
      toast.error(err.message || "Failed to delete copy");
    } finally {
      setDeletingLinkId(null);
    }
  }

  const [unlinkingGroupKey, setUnlinkingGroupKey] = useState(null);
  async function handleUnlinkGroup(group) {
    if (!window.confirm(`Split '${group.key}' out as a separate document?`)) return;
    setUnlinkingGroupKey(group.key);
    try {
      const newDoc = await unlinkMergedGroup(documentId, group.key);
      toast.success(
        `Unlinked into ${newDoc?.document_id} — it has no placements yet; file it with Add placement`,
      );
      loadDoc();
      onPlacementsChanged?.();
    } catch (err) {
      toast.error(err.message || "Failed to unlink");
    } finally {
      setUnlinkingGroupKey(null);
    }
  }

  // Groups duplicate_links by merged_document — null is this document's own copies ("This
  // document"), everything else is one group per document merge, header'd with who merged it and
  // when. A merged-in document that had itself absorbed another earlier keeps that earlier
  // document's own merged_document/merged_by, so it shows as its own group here, not folded into
  // this one's.
  const duplicateGroups = useMemo(() => {
    const links = doc?.duplicate_links || [];
    const own = links.filter((l) => !l.merged_document);
    const mergedKeys = [...new Set(links.filter((l) => l.merged_document).map((l) => l.merged_document))];
    const groups = [];
    if (own.length > 0) groups.push({ key: "own", header: "This document", links: own });
    for (const key of mergedKeys) {
      const groupLinks = links.filter((l) => l.merged_document === key);
      const mergedBy = groupLinks[0]?.merged_by || "unknown";
      const mergedAt = formatMergedAtIst(groupLinks[0]?.merged_at);
      groups.push({ key, header: `${key} — merged by ${mergedBy}, ${mergedAt}`, links: groupLinks });
    }
    return groups;
  }, [doc?.duplicate_links]);

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
                {canEdit && (
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil size={12} /> Edit metadata
                  </button>
                )}
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
                    downloadUrl={getOriginalDownloadUrl(doc.id)}
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
                    canTranslate={canTranslate}
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
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                      {f.label}
                    </span>
                    <span className="text-xs text-foreground break-words rounded border border-border/50 bg-muted/20 px-2 py-1">
                      {doc[f.key] ? (
                        f.formatDate ? (
                          formatDate(new Date(doc[f.key]))
                        ) : (
                          doc[f.key]
                        )
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-border/50 pt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-semibold text-foreground">
                    Placements ({placements?.length ?? "…"})
                  </h3>
                  {canEdit && (
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      onClick={() => setAddPlacementOpen((v) => !v)}
                    >
                      <Plus size={12} /> Add placement
                    </button>
                  )}
                </div>
                {canEdit && addPlacementOpen && (
                  <div className="flex flex-wrap items-end gap-2 rounded-md border border-border/50 bg-muted/10 p-2 mb-2">
                    <div className="flex flex-col gap-1 min-w-[180px]">
                      {doc?.advisory_scope !== "Central" && (
                        <span className="text-[10px] text-muted-foreground">State</span>
                      )}
                      {doc?.advisory_scope === "Central" ? (
                        <div className="bg-input border border-border rounded-md px-2 py-1.5 text-sm text-muted-foreground">
                          Central
                        </div>
                      ) : (
                        <StateSelector
                          value={newPlacementState}
                          onChange={setNewPlacementState}
                          stateNames={placementStateNames}
                          placeholder="Search state…"
                        />
                      )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-[220px]">
                      <span className="text-[10px] text-muted-foreground">Folder — crop or organisation</span>
                      <StateSelector
                        value={newPlacementFolder}
                        onChange={setNewPlacementFolder}
                        stateNames={placementFolderLabels}
                        placeholder="Search folder…"
                      />
                    </div>
                    <button
                      className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-40"
                      onClick={handleAddPlacement}
                      disabled={addingPlacement || !newPlacementState || !newPlacementFolder}
                    >
                      {addingPlacement ? "Adding…" : "Add"}
                    </button>
                    <button
                      className="px-2.5 py-1 rounded-md border border-border text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
                      onClick={() => {
                        setAddPlacementOpen(false);
                        setNewPlacementState("");
                        setNewPlacementFolder("");
                      }}
                      disabled={addingPlacement}
                    >
                      Cancel
                    </button>
                  </div>
                )}
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
                          {canEdit && (
                            <button
                              className="p-1 rounded border border-destructive/40 text-destructive/70 hover:border-destructive hover:text-destructive hover:bg-destructive/5 transition-colors cursor-pointer disabled:opacity-40"
                              onClick={() => handleDeletePlacement(p)}
                              disabled={deletingPlacementId === p.id}
                              title="Remove placement"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
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
                  Every distinct physical copy of this document in WorkDrive, grouped by where it
                  came from — this document's own copies, plus one group per document merged into
                  it. The anchor is the copy translation acts on.
                </p>
                {duplicateGroups.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-1">No copies on record.</div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {duplicateGroups.map((group) => (
                      <div key={group.key}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-[10px] font-semibold text-muted-foreground">
                            {group.header}
                          </div>
                          {canEdit && group.key !== "own" && (
                            <button
                              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                              onClick={() => handleUnlinkGroup(group)}
                              disabled={unlinkingGroupKey === group.key}
                              title="Split this group out as its own document"
                            >
                              <Scissors size={10} />
                              {unlinkingGroupKey === group.key ? "Unlinking…" : "Unlink"}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {group.links.map((link) => {
                            const isAnchor = link.zoho_file_id === doc.representative_file_id;
                            return (
                              <div
                                key={link.zoho_file_id}
                                className="flex items-center gap-2 rounded border border-border/50 px-2.5 py-1.5"
                              >
                                <a
                                  href={link.shareable_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline truncate"
                                  title={link.shareable_name}
                                >
                                  {link.shareable_name}
                                </a>
                                {isAnchor && (
                                  <span className="flex items-center gap-1 text-[10px] text-primary shrink-0 ml-auto">
                                    <Anchor size={10} /> anchor
                                  </span>
                                )}
                                {canEdit && !isAnchor && (
                                  <button
                                    className="p-1 rounded border border-destructive/40 text-destructive/70 hover:border-destructive hover:text-destructive hover:bg-destructive/5 transition-colors cursor-pointer disabled:opacity-40 shrink-0 ml-auto"
                                    onClick={() => handleDeleteDuplicateLink(link)}
                                    disabled={deletingLinkId === link.zoho_file_id}
                                    title="Delete this copy from WorkDrive"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {canEdit && (
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
              )}

              {canEdit && (
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
                      disabled={isTranslating}
                    />
                    <button
                      className="px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-40"
                      onClick={handleMerge}
                      disabled={merging || !mergeInput.trim() || isTranslating}
                      title={isTranslating ? "This document is being translated — wait for it to finish before merging" : undefined}
                    >
                      {merging ? "Merging…" : "Merge in"}
                    </button>
                  </div>
                  {isTranslating && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      This document is being translated — merge is disabled until that finishes.
                    </p>
                  )}
                </div>
              )}
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
