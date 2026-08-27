// @ts-nocheck
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Trash2, RefreshCw } from "lucide-react";
import {
  getDashboardDocuments,
  updateDashboardDocument,
  deleteDashboardDocument,
  getDashboardStates,
  getDashboardCrops,
} from "../../api";
import ColumnFilter from "../FunctionsPanel/ColumnFilter";
import { StateSelector } from "../FunctionsPanel/RunTile";
import ServerPagination from "./ServerPagination";
import StatusBadge from "./StatusBadge";
import TextFilter from "./TextFilter";
import UniqueDocumentDetails from "./UniqueDocumentDetails";

const STATUS_OPTIONS = ["not_started", "in_progress", "done"];
const PAGE_SIZE = 100;

// State/crop come back from the backend as embedded { id, name } objects (foreign-key
// relations), not plain strings — normalize to the display name wherever one is rendered.
function nameOf(v) {
  return (v && typeof v === "object" ? v.name : v) || "";
}

// Main Table mode (spec §2) — one row per document x state x crop placement, server-paginated
// and server-filtered (unlike PopStateTable.tsx's load-once-then-filter-client-side approach,
// this feature's data volume — ~8.5k rows — requires real server pagination).
export default function MainTable({ fetchUniqueDocCached, onJumpToUniqueDoc, translationAvailable, onTranslationStarted }) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // getDashboardStates()/getDashboardCrops() resolve to a plain array of {id, name} (matching
  // StateOut/CropOut) — keep the full list for id lookups (needed by saveEdit's state_id/crop_id
  // PATCH payload) alongside the flattened name list the selectors/filters render.
  const [stateList, setStateList] = useState([]);
  const [cropList, setCropList] = useState([]);
  const stateOptions = stateList.map((s) => s.name);
  const cropOptions = cropList.map((c) => c.name);
  useEffect(() => {
    getDashboardStates()
      .then((d) => setStateList(d || []))
      .catch(() => {});
    getDashboardCrops()
      .then((d) => setCropList(d || []))
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
  }, [page, JSON.stringify(filters)]);

  function setFilter(key, values) {
    setFilters((f) => ({ ...f, [key]: values }));
    setPage(1);
  }

  const [expandedId, setExpandedId] = useState(null);
  const [expandedDoc, setExpandedDoc] = useState(null);
  async function toggleExpand(row) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    setExpandedDoc(null);
    try {
      const doc = await fetchUniqueDocCached(row.unique_document_id);
      setExpandedDoc(doc);
    } catch (err) {
      toast.error(err.message || "Failed to load document details");
    }
  }

  const [editingId, setEditingId] = useState(null);
  const [editState, setEditState] = useState("");
  const [editCrop, setEditCrop] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(row) {
    setEditingId(row.id);
    setEditState(nameOf(row.state));
    setEditCrop(nameOf(row.crop));
  }

  async function saveEdit(row) {
    const state_id = stateList.find((s) => s.name === editState)?.id;
    const crop_id = cropList.find((c) => c.name === editCrop)?.id;
    setSaving(true);
    try {
      await updateDashboardDocument(row.id, { state_id, crop_id });
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
        `Remove this document from ${nameOf(row.state)} / ${nameOf(row.crop)}? The document itself and its other placements are not affected.`,
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
                  label="Document ID"
                  value={filters.document_id?.[0] || ""}
                  onChange={(v) => setFilter("document_id", v ? [v] : [])}
                  placeholder="ANNAM_00042"
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
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide">
                Language
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
              <th className="px-3 py-2 w-20"></th>
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                  No rows match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <Fragment key={row.id}>
                  <tr
                    className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <td className="px-3 py-2 align-middle">
                      <button
                        className="text-primary hover:text-primary/80 hover:underline transition-colors cursor-pointer font-mono text-[11px]"
                        onClick={() => onJumpToUniqueDoc(row.unique_document_id)}
                      >
                        {row.document_id}
                      </button>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      {editingId === row.id ? (
                        <StateSelector value={editState} onChange={setEditState} stateNames={stateOptions} />
                      ) : (
                        <span className="text-foreground">{nameOf(row.state)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      {editingId === row.id ? (
                        <select
                          className="bg-input border border-border rounded px-2 py-1 text-xs text-foreground"
                          value={editCrop}
                          onChange={(e) => setEditCrop(e.target.value)}
                        >
                          <option value="">— select crop —</option>
                          {cropOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-foreground">{nameOf(row.crop)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle text-muted-foreground">{row.language || "—"}</td>
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
                    <td className="px-3 py-2 align-middle">
                      <button
                        className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => toggleExpand(row)}
                      >
                        {expandedId === row.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr className="border-b border-border/50 bg-muted/5">
                      <td colSpan={8} className="px-4 py-2">
                        <UniqueDocumentDetails
                          doc={expandedDoc}
                          translationAvailable={translationAvailable}
                          onChanged={(fresh) => setExpandedDoc(fresh)}
                          onTranslationStarted={onTranslationStarted}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ServerPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
