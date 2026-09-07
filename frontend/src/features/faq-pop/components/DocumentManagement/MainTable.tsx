// @ts-nocheck
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, Pencil, Trash2, RefreshCw } from "lucide-react";
import {
  getDashboardDocuments,
  updateDashboardDocument,
  deleteDashboardDocument,
  getDashboardStates,
  getDashboardCrops,
  getDashboardLanguages,
} from "../../api";
import ColumnFilter from "../FunctionsPanel/ColumnFilter";
import { StateSelector } from "../FunctionsPanel/RunTile";
import ServerPagination from "./ServerPagination";
import StatusBadge from "./StatusBadge";
import TextFilter from "./TextFilter";

const STATUS_OPTIONS = ["not_started", "in_progress", "done"];
const LANGUAGE_SOURCE_OPTIONS = ["detected", "state", "ambiguous", "manual"];
const PAGE_SIZE = 100;

// A row of the main table is a PLACEMENT (POP_xxxxx), joined with its document (ANNAM_xxxxx) —
// see docs/first_render_frontend.md. state/crop are plain strings now (no {id, name} relation
// objects like the old backend returned), so no id-lookup indirection is needed to edit them.
//
// Translation/review are document-level, not placement-level (docs/first_render_frontend.md) —
// acting on either from here would act on the WHOLE document, and the same controls would then
// show up redundantly on every one of its other placement rows too. Read-only status here;
// Translate/Upload review/Delete live only in the Documents tab and Document Detail, where each
// document has exactly one row/section.
export default function MainTable({ onOpenDetail, refreshKey }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [stateOptions, setStateOptions] = useState([]);
  const [cropOptions, setCropOptions] = useState([]);
  const [languageOptions, setLanguageOptions] = useState([]);
  useEffect(() => {
    getDashboardStates()
      .then((d) => setStateOptions((d || []).map((s) => s.name)))
      .catch(() => {});
    getDashboardCrops()
      .then((d) => setCropOptions((d || []).map((c) => c.name)))
      .catch(() => {});
    getDashboardLanguages()
      .then((d) => setLanguageOptions((d || []).map((l) => ({ value: l.code, label: l.label }))))
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await getDashboardDocuments(page, filters);
      setRows(data.items || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [page, JSON.stringify(filters), refreshKey]);

  function setFilter(key, values) {
    setFilters((f) => ({ ...f, [key]: values }));
    setPage(1);
  }

  const [editingId, setEditingId] = useState(null);
  const [editState, setEditState] = useState("");
  const [editCrop, setEditCrop] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(row) {
    setEditingId(row.id);
    setEditState(row.state || "");
    setEditCrop(row.crop || "");
  }

  async function saveEdit(row) {
    setSaving(true);
    try {
      await updateDashboardDocument(row.id, { state: editState, crop: editCrop });
      toast.success("Updated");
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(err.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  const [deletingId, setDeletingId] = useState(null);
  async function handleDelete(row) {
    if (
      !window.confirm(
        `Remove this placement from ${row.state} / ${row.crop}? This removes the placement only — the document and its other placements are not affected.`,
      )
    )
      return;
    setDeletingId(row.id);
    try {
      await deleteDashboardDocument(row.id);
      load();
    } catch (err) {
      toast.error(err.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Documents</h2>
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          onClick={load}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
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
              <th className="text-left px-3 py-2 whitespace-nowrap">
                <TextFilter
                  label="Row ID"
                  value={filters.row_id?.[0] || ""}
                  onChange={(v) => setFilter("row_id", v ? [v] : [])}
                  placeholder="POP_00042"
                />
              </th>
              <th className="text-left px-3 py-2 whitespace-nowrap">
                <TextFilter
                  label="Document ID"
                  value={filters.document_id?.[0] || ""}
                  onChange={(v) => setFilter("document_id", v ? [v] : [])}
                  placeholder="ANNAM_00042"
                />
              </th>
              <th className="text-left px-3 py-2 whitespace-nowrap">
                <TextFilter
                  label="Document"
                  value={filters.shareable_name?.[0] || ""}
                  onChange={(v) => setFilter("shareable_name", v ? [v] : [])}
                  placeholder="Search name…"
                />
              </th>
              <th className="text-left px-3 py-2 whitespace-nowrap">
                <ColumnFilter
                  label="State"
                  options={stateOptions}
                  selected={filters.state || []}
                  onChange={(v) => setFilter("state", v)}
                />
              </th>
              <th className="text-left px-3 py-2 whitespace-nowrap">
                <ColumnFilter
                  label="Crop"
                  options={cropOptions}
                  selected={filters.crop || []}
                  onChange={(v) => setFilter("crop", v)}
                />
              </th>
              <th className="text-left px-3 py-2 whitespace-nowrap">
                <ColumnFilter
                  label="Language"
                  options={languageOptions}
                  selected={filters.language || []}
                  onChange={(v) => setFilter("language", v)}
                />
              </th>
              <th className="text-left px-3 py-2 whitespace-nowrap">
                <ColumnFilter
                  label="Language Source"
                  options={LANGUAGE_SOURCE_OPTIONS}
                  selected={filters.language_source || []}
                  onChange={(v) => setFilter("language_source", v)}
                />
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
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                  No rows match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                >
                  <td className="px-3 py-2 align-middle font-mono text-[10px] text-muted-foreground">
                    {row.row_id}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <button
                      className="text-primary hover:text-primary/80 hover:underline transition-colors cursor-pointer font-mono text-[11px]"
                      onClick={() => onOpenDetail(row.unique_document_id)}
                    >
                      {row.document_id}
                    </button>
                    {row.placement_count > 1 && (
                      <span
                        className="ml-1 text-[10px] text-muted-foreground"
                        title={`Filed in ${row.placement_count} places — editing anything but state/crop changes all of them`}
                      >
                        ×{row.placement_count}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-middle max-w-[180px]">
                    <span className="block truncate text-foreground" title={row.shareable_name || ""}>
                      {row.shareable_name || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    {editingId === row.id ? (
                      <StateSelector value={editState} onChange={setEditState} stateNames={stateOptions} />
                    ) : (
                      <span className="text-foreground">{row.state}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    {editingId === row.id ? (
                      // StateSelector is a plain searchable single-select despite the name — 473
                      // crops in a native <select> has no search and doesn't match the site's
                      // input styling, same component RunTile.tsx already reuses across state/
                      // crop/domain fields.
                      <StateSelector
                        value={editCrop}
                        onChange={setEditCrop}
                        stateNames={cropOptions}
                        placeholder="Search crop…"
                      />
                    ) : (
                      <span className="text-foreground">{row.crop}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-middle text-muted-foreground">{row.language || "—"}</td>
                  <td className="px-3 py-2 align-middle">
                    {row.language_source === "state" ? (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        title="Inferred from the state — plausible but not measured"
                      >
                        guess
                      </span>
                    ) : row.language_source === "ambiguous" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                        ambiguous
                      </span>
                    ) : row.language_source === "manual" ? (
                      <span className="text-[10px] text-muted-foreground">manual</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <StatusBadge status={row.translation_status} />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <StatusBadge status={row.review_status} />
                  </td>
                  <td className="px-3 py-2 align-middle whitespace-nowrap">
                    {editingId === row.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          className="text-[10px] px-1.5 py-0.5 rounded border border-primary text-primary hover:bg-primary/10 cursor-pointer disabled:opacity-40"
                          onClick={() => saveEdit(row)}
                          disabled={saving}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent cursor-pointer"
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          className="p-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                          onClick={() => onOpenDetail(row.unique_document_id)}
                          title="View document"
                        >
                          <Eye size={11} />
                        </button>
                        <button
                          className="p-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                          onClick={() => startEdit(row)}
                          title="Edit state/crop"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          className={`p-1 rounded border transition-colors cursor-pointer
                            ${deletingId === row.id
                              ? "border-border/40 text-muted-foreground/30 cursor-not-allowed"
                              : "border-destructive/40 text-destructive/70 hover:border-destructive hover:text-destructive hover:bg-destructive/5"}`}
                          onClick={() => handleDelete(row)}
                          disabled={deletingId === row.id}
                          title="Remove placement"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ServerPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
