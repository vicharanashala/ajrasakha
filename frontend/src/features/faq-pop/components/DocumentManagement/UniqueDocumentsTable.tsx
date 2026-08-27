// @ts-nocheck
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, X, RefreshCw } from "lucide-react";
import {
  getDashboardDocuments,
  getDashboardUniqueDocuments,
  deleteDashboardUniqueDocument,
  deleteDashboardOriginal,
} from "../../api";
import { ConfirmationModal } from "@/components/confirmation-modal";
import ColumnFilter from "../FunctionsPanel/ColumnFilter";
import TextFilter from "./TextFilter";
import ServerPagination from "./ServerPagination";
import FileActionIcons from "./FileActionIcons";
import TranslateReviewCell from "./TranslateReviewCell";
import UniqueDocumentEditForm from "./UniqueDocumentEditForm";

const STATUS_OPTIONS = ["not_started", "in_progress", "done"];
const PAGE_SIZE = 100;

// Backend API changes (2026-08-24): GET /dashboard/unique-documents now returns the full row
// (document_id, states, crops included) with nothing left to fetch lazily, so this table shows
// every field as its own column instead of hiding most of it behind a row-expand (spec §3
// "Updated (2026-08-24)"). `document_id` (ANNAM_##### ) is now the human-readable identifier
// shown to users; `id` (UUID) is kept only for PATCH/DELETE calls.
const FIELD_COLUMNS = [
  { key: "document_id", label: "Document ID", filterable: true, mono: true },
  { key: "advisory_type", label: "Advisory Type", filterable: true },
  { key: "advisory_scope", label: "Advisory Scope", filterable: true },
  { key: "crops", label: "Crop(s)", array: true },
  { key: "states", label: "State(s)", array: true },
  { key: "season", label: "Season", filterable: true },
  { key: "edition_revision_volume", label: "Edition/Rev/Vol", filterable: true },
  { key: "date_of_release", label: "Date of Release", filterable: true },
  { key: "month_of_release", label: "Month of Release", filterable: true },
  { key: "year_of_release", label: "Year of Release", filterable: true },
  { key: "date_of_collection", label: "Date of Collection", filterable: true },
  { key: "month_of_collection", label: "Month of Collection", filterable: true },
  { key: "year_of_collection", label: "Year of Collection", filterable: true },
  { key: "advisory_name", label: "Advisory Name", filterable: true },
  { key: "advisory_released_org", label: "Advisory Released Org", filterable: true },
  { key: "advisory_org_address", label: "Org Address", filterable: true },
  { key: "live_source_link", label: "Live Source Link", filterable: true, link: true },
  { key: "shareable_name", label: "Shareable Name", filterable: true },
  { key: "language", label: "Language", filterable: true },
  { key: "domain", label: "Domain", filterable: true },
  { key: "format_original", label: "Format (Original)", filterable: true },
  { key: "num_pages", label: "Pages", filterable: true },
  { key: "verification_status", label: "Verification", enum: true },
  { key: "verified_by", label: "Verified By", filterable: true },
  { key: "document_status", label: "Doc Status", enum: true },
];
const COL_COUNT = FIELD_COLUMNS.length + 4; // + Original, Translation, Review, Actions

// Unique Documents mode (spec §3) — one row per distinct document, server-paginated/filtered.
// Original/Translation/Review render as dedicated columns here (§3.1) — unlike MainTable, which
// only surfaces them inside its row-expand panel — and this table is the only one that gets
// the full metadata edit form (§3.2) and per-file delete (§3.1, §6), including the new
// delete-original-file action.
export default function UniqueDocumentsTable({
  fetchUniqueDocCached,
  cacheUniqueDoc,
  focusId,
  clearFocus,
  translationAvailable,
  onTranslationStarted,
}) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await getDashboardUniqueDocuments(page, filters);
      const items = data.items || [];
      setRows(items);
      setTotal(data.total || 0);
      setError(null);
      for (const doc of items) cacheUniqueDoc?.(doc.id, doc);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [page, JSON.stringify(filters)]);

  function setFilter(key, values) {
    setFilters((f) => ({ ...f, [key]: values }));
    setPage(1);
  }

  // Jump-to-unique-doc (spec §2.3): the list endpoint has no id filter, so a jumped-to document
  // that isn't on the current page/filter is fetched directly and pinned above the normal rows
  // instead of trying to force it onto the paginated result.
  const [pinnedDoc, setPinnedDoc] = useState(null);
  useEffect(() => {
    if (!focusId) {
      setPinnedDoc(null);
      return;
    }
    if (rows.some((r) => r.id === focusId)) {
      setPinnedDoc(null);
      return;
    }
    fetchUniqueDocCached(focusId)
      .then(setPinnedDoc)
      .catch((err) => {
        toast.error(err.message || "Failed to load the jumped-to document");
        setPinnedDoc(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, rows]);

  const displayRows = pinnedDoc ? [pinnedDoc, ...rows.filter((r) => r.id !== pinnedDoc.id)] : rows;

  // Derived from currently-loaded rows — no dedicated distinct-values endpoint exists for these.
  const docStatusOptions = [...new Set(rows.map((r) => r.document_status).filter(Boolean))].sort();
  const verificationOptions = [...new Set(rows.map((r) => r.verification_status).filter(Boolean))].sort();
  function enumOptions(key) {
    return key === "document_status" ? docStatusOptions : verificationOptions;
  }

  function patchRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (pinnedDoc?.id === id) setPinnedDoc((prev) => ({ ...prev, ...patch }));
    cacheUniqueDoc?.(id, patch);
  }

  const [editingDoc, setEditingDoc] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [placementCount, setPlacementCount] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // The main-table's association list has a real `unique_document_id` filter (added in the
  // 2026-08-24 backend update), so the cascade-delete dialog can now show an accurate "used in N
  // placements" count instead of a generic warning.
  async function openDeleteConfirm(row) {
    setDeleteTarget(row);
    setPlacementCount(null);
    try {
      const data = await getDashboardDocuments(1, { unique_document_id: [row.id] });
      setPlacementCount(typeof data.total === "number" ? data.total : null);
    } catch {
      setPlacementCount(null);
    }
  }

  async function handleCascadeDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDashboardUniqueDocument(deleteTarget.id);
      toast.success("Document deleted");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const [deletingOriginalId, setDeletingOriginalId] = useState(null);
  async function handleDeleteOriginal(row) {
    if (!window.confirm("Delete the original file? Metadata, translation, review, and placements are kept."))
      return;
    setDeletingOriginalId(row.id);
    try {
      await deleteDashboardOriginal(row.id);
      patchRow(row.id, { shareable_link: null });
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setDeletingOriginalId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Unique Documents</h2>
        <div className="flex items-center gap-3">
          {pinnedDoc && (
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={() => clearFocus?.()}
            >
              <X size={10} /> Clear jump
            </button>
          )}
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={load}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <span className="text-sm text-destructive">{error}</span>
          <button className="text-xs text-muted-foreground hover:text-foreground cursor-pointer" onClick={load}>
            retry
          </button>
        </div>
      )}

      <div className="relative overflow-x-auto rounded-lg border border-border">
        {loading && (
          <div className="absolute inset-0 bg-background/40 flex items-start justify-center pt-4 pointer-events-none z-10">
            <RefreshCw size={16} className="animate-spin text-muted-foreground" />
          </div>
        )}
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {FIELD_COLUMNS.map((col) => (
                <th key={col.key} className="text-left px-3 py-2 whitespace-nowrap align-bottom">
                  {col.enum ? (
                    <ColumnFilter
                      label={col.label}
                      options={enumOptions(col.key)}
                      selected={filters[col.key] || []}
                      onChange={(v) => setFilter(col.key, v)}
                    />
                  ) : col.filterable ? (
                    <TextFilter
                      label={col.label}
                      value={filters[col.key]?.[0] || ""}
                      onChange={(v) => setFilter(col.key, v ? [v] : [])}
                    />
                  ) : (
                    <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">
                      {col.label}
                    </span>
                  )}
                </th>
              ))}
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">
                Original
              </th>
              <th className="text-left px-3 py-2 whitespace-nowrap">
                <ColumnFilter
                  label="Translation"
                  options={STATUS_OPTIONS}
                  selected={filters.translation_status || []}
                  onChange={(v) => setFilter("translation_status", v)}
                />
              </th>
              <th className="text-left px-3 py-2 whitespace-nowrap">
                <ColumnFilter
                  label="Review"
                  options={STATUS_OPTIONS}
                  selected={filters.review_status || []}
                  onChange={(v) => setFilter("review_status", v)}
                />
              </th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 && !loading ? (
              <tr>
                <td colSpan={COL_COUNT} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                  No rows match the current filters.
                </td>
              </tr>
            ) : (
              displayRows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`border-b border-border/50 hover:bg-muted/20 transition-colors
                    ${row.id === focusId ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : idx % 2 === 0 ? "" : "bg-muted/10"}`}
                >
                  {FIELD_COLUMNS.map((col) => {
                    const val = row[col.key];
                    if (col.array) {
                      const text = (val || []).join(", ");
                      return (
                        <td key={col.key} className="px-3 py-2 align-middle max-w-[180px]">
                          <span className="block truncate text-foreground" title={text}>
                            {text || "—"}
                          </span>
                        </td>
                      );
                    }
                    if (col.link && val) {
                      return (
                        <td key={col.key} className="px-3 py-2 align-middle max-w-[180px]">
                          <a
                            href={val}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-primary hover:underline"
                            title={val}
                          >
                            {val}
                          </a>
                        </td>
                      );
                    }
                    return (
                      <td key={col.key} className="px-3 py-2 align-middle max-w-[180px]">
                        <span
                          className={`block truncate ${col.mono ? "font-mono text-[10px] text-muted-foreground" : "text-foreground"}`}
                          title={val != null ? String(val) : ""}
                        >
                          {val ?? "—"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 align-middle">
                    <FileActionIcons
                      shareableLink={row.shareable_link}
                      onDelete={row.shareable_link ? () => handleDeleteOriginal(row) : undefined}
                      deleting={deletingOriginalId === row.id}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <TranslateReviewCell
                      kind="translation"
                      doc={row}
                      translationAvailable={translationAvailable}
                      onChanged={(fresh) => patchRow(row.id, fresh)}
                      onTranslationStarted={onTranslationStarted}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <TranslateReviewCell
                      kind="review"
                      doc={row}
                      translationAvailable={translationAvailable}
                      onChanged={(fresh) => patchRow(row.id, fresh)}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        className="p-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                        onClick={() => setEditingDoc(row)}
                        title="Edit"
                      >
                        <Pencil size={11} />
                      </button>
                      <ConfirmationModal
                        type="delete"
                        title="Delete document"
                        description={
                          deleteTarget?.id === row.id
                            ? `This will remove ${placementCount != null ? `all ${placementCount} state/crop placement${placementCount === 1 ? "" : "s"}` : "every state/crop placement"} of this document, and delete its original file${row.translation_status === "done" ? " + translation" : ""}${row.review_status === "done" ? " + review" : ""} from storage. This cannot be undone.`
                            : ""
                        }
                        confirmText="Delete"
                        onConfirm={handleCascadeDelete}
                        isLoading={deleting && deleteTarget?.id === row.id}
                        open={deleteTarget?.id === row.id}
                        onOpenChange={(o) => {
                          if (!o) setDeleteTarget(null);
                        }}
                        trigger={
                          <button
                            className="p-1 rounded border border-destructive/40 text-destructive/70 hover:border-destructive hover:text-destructive hover:bg-destructive/5 transition-colors cursor-pointer"
                            onClick={() => openDeleteConfirm(row)}
                            title="Delete document"
                          >
                            <X size={11} />
                          </button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ServerPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      {editingDoc && (
        <UniqueDocumentEditForm
          key={editingDoc.id}
          doc={editingDoc}
          open={Boolean(editingDoc)}
          onOpenChange={(o) => {
            if (!o) setEditingDoc(null);
          }}
          onSaved={(updated) => {
            patchRow(editingDoc.id, updated);
            setEditingDoc(null);
          }}
        />
      )}
    </div>
  );
}
