// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, Pencil, RefreshCw, Trash2, X, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatDate } from "@/utils/formatDate";
import {
  getDashboardUniqueDocuments,
  getDashboardUniqueDocument,
  deleteDashboardUniqueDocument,
  getDashboardLanguages,
  getDashboardUploadedByOptions,
  getDashboardTranslatedByOptions,
  getDashboardReviewedByOptions,
  getUniqueDocumentPlacements,
  getDashboardTranslationJobs,
  cancelDashboardTranslationJob,
  getOriginalDownloadUrl,
  getDashboardStates,
  getDashboardFolders,
  getDashboardDistricts,
  getDashboardKvks,
} from "../../api";
import ColumnFilter from "../FunctionsPanel/ColumnFilter";
import TextFilter from "./TextFilter";
import RangeFilter from "./RangeFilter";
import DateRangeColumnFilter from "./DateRangeColumnFilter";
import ServerPagination from "./ServerPagination";
import TopScrollbar from "./TopScrollbar";
import FileActionIcons from "./FileActionIcons";
import TranslateReviewCell from "./TranslateReviewCell";
import UniqueDocumentEditForm from "./UniqueDocumentEditForm";
import {
  ADVISORY_TYPE_OPTIONS,
  ADVISORY_SCOPE_OPTIONS,
  SEASON_OPTIONS,
  DOMAIN_OPTIONS,
  FORMAT_ORIGINAL_OPTIONS,
  VERIFICATION_STATUS_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
  folderDisplayLabel,
} from "./fields";

const STATUS_OPTIONS = ["not_started", "in_progress", "done"];
const LANGUAGE_SOURCE_OPTIONS = ["detected", "state", "ambiguous", "manual"];
const PAGE_SIZE = 100;

// One row per document (not per placement) — the "Documents tab" (docs/first_render_frontend.md).
// Real server-side pagination via GET /unique-documents, same filter[] convention as the Main
// Table. Unlike the old backend, a document row here carries no aggregate states/crops list —
// that's what placement_count + the Placements section of Document Detail are for now.
//
// `filterType: "numberRange"/"dateRange"` render a min/max or from/to popover instead of a
// single-value filter (RangeFilter.tsx sends `_min`/`_max`, DateRangeColumnFilter.tsx sends
// `_from`/`_to` — both confirmed by backend as the real convention). date_of_release,
// month_of_release, date_of_collection, month_of_collection, advisory_org_address,
// edition_revision_volume and live_source_link were confirmed added to the filter whitelist —
// all filterable now.
// `state`/`crop` aren't real fields on a unique-document row (a document can have many
// placements) — derived client-side from `duplicate_links`/`representative_file_id`, the anchor
// placement's own values, same one Translation acts on (see withAnchorPlacement below).
// `district`/`kvk`, unlike state/crop, ARE real fields directly on the document now (2026-10-06
// backend change — a PoP is written for one place, so district/kvk moved off the placement onto
// the document; every placement reports the same pair). `vocab` picks which filter/dropdown-option
// state below backs the column's filter control — filtering state/crop here matches on ANY of the
// document's placements (not just the anchor), per the backend: a document with placements in two
// states can show one state here while matching a filter for the other. District/KVK filtering
// matches the one stored value directly, same as any other document field. Sorting, unlike
// state/crop filtering, does go by the anchor for those two; district/kvk sort by the document
// field itself either way since there's only one value.
const DERIVED_COLUMNS = [
  { key: "_anchor_state", label: "State", sortKey: "state", vocab: "state" },
  { key: "_anchor_crop", label: "Folder", sortKey: "crop", vocab: "folder" },
  { key: "district", label: "District", vocab: "district" },
  { key: "kvk", label: "KVK", vocab: "kvk" },
];

const FIELD_COLUMNS = [
  { key: "document_id", label: "Document ID", filterable: true, mono: true },
  { key: "shareable_name", label: "Shareable Name", filterable: true },
  ...DERIVED_COLUMNS,
  { key: "advisory_type", label: "Advisory Type", filterable: true, options: ADVISORY_TYPE_OPTIONS },
  { key: "advisory_scope", label: "Advisory Scope", filterable: true, options: ADVISORY_SCOPE_OPTIONS },
  { key: "season", label: "Season", filterable: true, options: SEASON_OPTIONS },
  { key: "edition_revision_volume", label: "Edition/Rev/Vol", filterable: true },
  { key: "date_of_release", label: "Date of Release", filterType: "dateRange" },
  { key: "month_of_release", label: "Month of Release", filterType: "numberRange", min: 1, max: 12, unit: "month" },
  { key: "year_of_release", label: "Year of Release", filterType: "numberRange" },
  { key: "date_of_collection", label: "Date of Collection", filterType: "dateRange" },
  { key: "month_of_collection", label: "Month of Collection", filterType: "numberRange", min: 1, max: 12, unit: "month" },
  { key: "year_of_collection", label: "Year of Collection", filterType: "numberRange" },
  { key: "advisory_name", label: "Advisory Name", filterable: true },
  { key: "advisory_released_org", label: "Advisory Released Org", filterable: true },
  { key: "advisory_org_address", label: "Org Address", filterable: true },
  { key: "live_source_link", label: "Live Source Link", link: true, filterable: true },
  { key: "language", label: "Language", filterType: "language" },
  { key: "language_source", label: "Language Source", filterable: true, options: LANGUAGE_SOURCE_OPTIONS },
  { key: "domain", label: "Domain", filterable: true, options: DOMAIN_OPTIONS },
  { key: "format_original", label: "Format (Original)", filterable: true, options: FORMAT_ORIGINAL_OPTIONS },
  { key: "num_pages", label: "Pages", filterType: "numberRange", min: 0 },
  { key: "verification_status", label: "Verification", filterable: true, options: VERIFICATION_STATUS_OPTIONS },
  // uploaded_by (renamed from verified_by 2026-09-18) is auto-captured from the signed-in user on
  // upload — no longer user-editable (see fields.ts/AddDocumentForm.tsx), but still filterable
  // here the same way verified_by was.
  { key: "uploaded_by", label: "Uploaded By", filterType: "users" },
  { key: "document_status", label: "Doc Status", filterable: true, options: DOCUMENT_STATUS_OPTIONS },
  // translated_by/reviewed_by are the signed-in user's display name, unverified (see
  // TranslateReviewCell.tsx) — null on every document translated/reviewed before 2026-09-16, and
  // cleared when the translation/review is deleted (docs/first_render_frontend.md, "Who
  // translated / reviewed, and when").
  { key: "translated_by", label: "Translated By", filterType: "users" },
  { key: "translated_at", label: "Translated At", filterType: "dateRange", formatDate: true },
  { key: "reviewed_by", label: "Reviewed By", filterType: "users" },
  { key: "reviewed_at", label: "Reviewed At", filterType: "dateRange", formatDate: true },
  // Not in the filter whitelist (nothing to filter a count by), and per the backend's "a column
  // you can filter, you can sort" rule, that means not sortable either.
  { key: "placement_count", label: "Placements", sortable: false },
];
const COL_COUNT = FIELD_COLUMNS.length + 4; // + Original, Translation, Review, actions (delete)

// Pulled back (2026-10-01) from "every column sorts" to numeric columns only — num_pages,
// month_of_release/collection, year_of_release/collection — per the perf pass: that many sort
// buttons plus the state behind them wasn't worth it for columns a user sorts alphabetically at
// best. `sortKeyFor` is still here for the numeric columns' own `key`. Re-added (2026-10-02) for
// the four dateRange columns too — date_of_release, date_of_collection, translated_at, reviewed_at
// — chronological sort is as meaningful as a numeric one, unlike the alphabetic columns left out.
function sortKeyFor(col) {
  return col.sortKey || col.key;
}
function isSortable(col) {
  return col.filterType === "numberRange" || col.filterType === "dateRange";
}

const MULTI_PLACEMENT_OPTIONS = [
  { key: "", label: "All" },
  { key: "true", label: "Multi-placement" },
  { key: "false", label: "Single-placement" },
];

export default function UniqueDocumentsTable({ onOpenDetail, translationAvailable, refreshKey, onDataChanged }) {
  const scrollRef = useRef(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  // "" | "<field>" | "-<field>" — "-" prefix means descending. Widened 2026-09-29 from just
  // translated_at/reviewed_at to every filterable column (see sortKeyFor/isSortable above), one
  // `sort=` value at a time (the backend only accepts a single sort column).
  const [sort, setSort] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [languageOptions, setLanguageOptions] = useState([]);
  // Distinct, non-empty names actually present on documents (see api.ts's getDashboardUploadedBy/
  // TranslatedBy/ReviewedByOptions comment) — NOT the reviewer-system user list, since uploaded_by
  // is filled from Zoho's "created by" and mostly isn't reviewer-system users at all. Falls back
  // to a free-text-only filter for a "users" column while its list stays empty (see the
  // filterType "users" render branch below). Refetched whenever refreshKey bumps (a "document" SSE
  // event) so a newly-uploaded/translated/reviewed name shows up in the dropdown without a full
  // page reload.
  const [uploadedByOptions, setUploadedByOptions] = useState([]);
  const [translatedByOptions, setTranslatedByOptions] = useState([]);
  const [reviewedByOptions, setReviewedByOptions] = useState([]);
  useEffect(() => {
    getDashboardLanguages()
      .then((d) => setLanguageOptions((d || []).map((l) => ({ value: l.code, label: l.label }))))
      .catch(() => {});
  }, []);
  useEffect(() => {
    getDashboardUploadedByOptions().then(setUploadedByOptions).catch(() => {});
    getDashboardTranslatedByOptions().then(setTranslatedByOptions).catch(() => {});
    getDashboardReviewedByOptions().then(setReviewedByOptions).catch(() => {});
  }, [refreshKey]);

  // State/Folder/District/KVK filter dropdowns — id-based, same convention as MainTable.tsx's
  // identical setup (Folder follows the Advisory Type filter's value; District/KVK fetch their full
  // lists, unnarrowed — see the fetch effect below). Filtering here now matches on any of the
  // document's placements, not just the anchor shown in the column (see DERIVED_COLUMNS comment
  // above) — same filter[] keys as the Main Table.
  const [stateOptions, setStateOptions] = useState([]);
  useEffect(() => {
    getDashboardStates()
      .then((d) => setStateOptions(d || []))
      .catch(() => {});
  }, []);
  const advisoryTypeFilterValue = filters.advisory_type?.[0] || "";
  const [folderFilterOptions, setFolderFilterOptions] = useState([]);
  useEffect(() => {
    getDashboardFolders(advisoryTypeFilterValue || "General")
      .then((d) => setFolderFilterOptions(d || []))
      .catch(() => {});
  }, [advisoryTypeFilterValue]);
  function setFolderFilter(selectedIds) {
    const cropIds = folderFilterOptions
      .filter((f) => f.kind !== "organization" && selectedIds.includes(f.id))
      .map((f) => f.id);
    const orgIds = folderFilterOptions
      .filter((f) => f.kind === "organization" && selectedIds.includes(f.id))
      .map((f) => f.id);
    setFilters((f) => ({ ...f, crop_id: cropIds, organization_id: orgIds }));
    setPage(1);
  }
  const selectedFolderIds = [...(filters.crop_id || []), ...(filters.organization_id || [])];
  const folderFilterUiOptions = folderFilterOptions.map((f) => ({
    value: f.id,
    label: folderDisplayLabel(f, folderFilterOptions),
  }));

  // Cascades the same way MainTable.tsx's identical filters do — District narrows by the State
  // filter, KVK narrows by the District filter. Each list carries exactly ONE "All" row (2026-10-05
  // backend change — one shared row per vocabulary now, not per-parent) — a real selectable value,
  // kept in the list rather than dropped.
  const stateFilterId = filters.state_id?.[0] || "";
  const districtFilterId = filters.district_id?.[0] || "";
  const [districtFilterOptions, setDistrictFilterOptions] = useState([]);
  const [kvkFilterOptions, setKvkFilterOptions] = useState([]);
  useEffect(() => {
    getDashboardDistricts(stateFilterId)
      .then((d) => setDistrictFilterOptions(d || []))
      .catch(() => {});
  }, [stateFilterId]);
  useEffect(() => {
    getDashboardKvks(districtFilterId)
      .then((d) => setKvkFilterOptions(d || []))
      .catch(() => {});
  }, [districtFilterId]);

  // The anchor placement — same one `representative_file_id`/Translation act on — found by
  // matching `duplicate_links[].zoho_file_id` against the document's own `representative_file_id`
  // (2026-10-06: `representative_row_id` is gone — it named a field that could point at a deleted
  // placement; this is the same fact, derived instead of stored). Missing on a document with no
  // placements at all, which shouldn't happen in practice. District/KVK no longer come from the
  // anchor — they're plain fields on `item` itself now (see DERIVED_COLUMNS above).
  function withAnchorPlacement(item) {
    const anchor = item.duplicate_links?.find((l) => l.zoho_file_id === item.representative_file_id);
    return {
      ...item,
      _anchor_state: anchor?.state,
      _anchor_crop: anchor?.crop,
    };
  }

  async function load() {
    setLoading(true);
    try {
      const data = await getDashboardUniqueDocuments(page, filters, sort);
      const items = (data.items || []).map(withAnchorPlacement);
      setRows(items);
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
  }, [page, JSON.stringify(filters), sort, refreshKey]);

  function setFilter(key, values) {
    setFilters((f) => ({ ...f, [key]: values }));
    setPage(1);
  }

  // Cycles a sortable column none -> ascending -> descending -> none. Only one column sorts at a
  // time (the backend only accepts a single sort= value).
  function toggleSort(key) {
    setSort((prev) => (prev === key ? `-${key}` : prev === `-${key}` ? "" : key));
    setPage(1);
  }

  const hasActiveFilters = Object.values(filters).some((v) => Array.isArray(v) && v.length > 0);
  function clearFilters() {
    setFilters({});
    setPage(1);
  }

  // Which distinct-names list backs each "users" column's dropdown (see the fetch effect above).
  const usersOptionsFor = {
    uploaded_by: uploadedByOptions,
    translated_by: translatedByOptions,
    reviewed_by: reviewedByOptions,
  };

  // Backs both numberRange (suffixes "min"/"max") and dateRange ("from"/"to") columns — two
  // filter keys per field, e.g. filters.num_pages_min / filters.num_pages_max.
  function setRange(key, suffixA, suffixB, a, b) {
    setFilters((f) => ({
      ...f,
      [`${key}_${suffixA}`]: a != null ? [String(a)] : [],
      [`${key}_${suffixB}`]: b != null ? [String(b)] : [],
    }));
    setPage(1);
  }

  function setMultiPlacement(key) {
    setFilters((f) => ({ ...f, multi_placement: key ? [key] : [] }));
    setPage(1);
  }
  const multiPlacementValue = filters.multi_placement?.[0] || "";

  // Row color is click-driven only (2026-10-01 perf pass) — no tooltip, no hover handling at all;
  // a hover-driven tooltip/highlight was re-rendering the whole 100-row table on every mousemove,
  // which is what made the page feel slow. A click just toggles the row's highlight; double-click
  // still opens the Document Detail modal.
  const [selectedRowId, setSelectedRowId] = useState(null);
  function handleRowClick(e, row) {
    if (e.target.closest("button, a, input, select, textarea")) return;
    setSelectedRowId(row.id);
  }

  // Double-click anywhere in the row that isn't an interactive control opens the same Document
  // Detail modal as the Eye button.
  function handleRowDoubleClick(e, row) {
    if (e.target.closest("button, a, input, select, textarea")) return;
    onOpenDetail(row.id);
  }

  function patchRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // Edit pencil (next to the Eye/View button) opens UniqueDocumentEditForm directly on this row,
  // skipping DocumentDetailModal entirely — the row object from the list response already carries
  // every field the edit form reads (duplicate_links, representative_file_id, district/kvk,
  // placement_count, all of DOCUMENT_METADATA_FIELDS/EDITABLE_DOCUMENT_ONLY_FIELDS/
  // DISPLAY_ONLY_FIELDS), so no extra fetch is needed before opening it.
  const [editingRow, setEditingRow] = useState(null);

  // A document row here has no placement id on hand (unlike Main Table rows, which ARE
  // placements) — review-upload and delete-translation both need one, so fetch this document's
  // placements lazily, only when one of those actions is actually taken, rather than up front for
  // every row of a 100-row page.
  async function resolvePlacementId(documentId) {
    const data = await getUniqueDocumentPlacements(documentId);
    const list = Array.isArray(data) ? data : data?.items || [];
    if (!list[0]?.id) throw new Error("This document has no placements to act through");
    return list[0].id;
  }

  // Same reasoning as MainTable's notifyTranslationChanged — translation/review status here is
  // shared with every placement row on the Main Table for this document, which this table's own
  // patchRow doesn't touch. Skip the noisy in-progress polling ticks, nudge on real transitions.
  function notifyTranslationChanged(fresh) {
    if (fresh.translation_status !== "in_progress") onDataChanged?.();
  }

  // Real cascade delete (document + every placement + every WorkDrive file it owns) — NOT the
  // placement-only delete Main Table has. Nothing in this dashboard can undo it (WorkDrive keeps
  // it recoverable from its own trash, but nothing here does), so the confirm is built from a
  // freshly-fetched document rather than the possibly-stale list row, spelling out exactly how
  // many placements and files are about to go, per the backend's explicit ask.
  function handleCopyId(id) {
    navigator.clipboard.writeText(id).then(
      () => toast.success("Copied"),
      () => toast.error("Failed to copy"),
    );
  }

  const [deletingRowId, setDeletingRowId] = useState(null);
  async function handleDeleteRow(row) {
    setDeletingRowId(row.id);
    try {
      const fresh = await getDashboardUniqueDocument(row.id);
      const fileCount = fresh.duplicate_links?.length ?? 0;
      const ok = window.confirm(
        `Delete ${fresh.document_id}${fresh.shareable_name ? ` — ${fresh.shareable_name}` : ""}?\n\n` +
          `This permanently removes the document, all ${fresh.placement_count} placement(s), and trashes ` +
          `${fileCount} file(s) in WorkDrive — every duplicate copy, plus its translation and review if any.\n\n` +
          `Nothing in this dashboard can undo this. WorkDrive keeps trashed files recoverable there, but not from here.`,
      );
      if (!ok) return;
      await deleteDashboardUniqueDocument(row.id);
      toast.success("Document deleted");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotal((t) => Math.max(0, t - 1));
      onDataChanged?.();
    } catch (err) {
      const message = err.message || "Delete failed";
      if (/already running|queued/i.test(message)) {
        // 409 — a translation job for this document is queued/running. Look up that specific job
        // (jobs carry unique_document_id) so the toast can offer a direct cancel, same pattern as
        // TranslateReviewCell's manual-upload 409.
        let job = null;
        try {
          const jobs = await getDashboardTranslationJobs();
          job = (jobs || []).find((j) => j.unique_document_id === row.id);
        } catch {
          // ignore — fall back to a plain message with no action
        }
        toast.error(
          message,
          job
            ? {
                action: {
                  label: "Cancel job",
                  onClick: async () => {
                    try {
                      await cancelDashboardTranslationJob(job.id);
                      toast.success("Cancelling — try deleting again once it stops");
                    } catch (cancelErr) {
                      toast.error(cancelErr.message || "Failed to cancel the job");
                    }
                  },
                },
              }
            : undefined,
        );
      } else {
        // 502 (WorkDrive refused a file) — the backend guarantees nothing was removed either
        // side, so this is safely retryable; say so rather than just showing the raw error.
        toast.error(`${message}${/workdrive/i.test(message) ? " — nothing was deleted, safe to retry." : ""}`);
      }
    } finally {
      setDeletingRowId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Documents</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            {MULTI_PLACEMENT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer
                  ${multiPlacementValue === opt.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setMultiPlacement(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {hasActiveFilters && (
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={clearFilters}
            >
              <X size={12} /> Clear all filters
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

      <TopScrollbar containerRef={scrollRef} />
      <div className="relative overflow-x-auto rounded-lg border border-border" ref={scrollRef}>
        {loading && (
          <div className="absolute inset-0 bg-background/40 flex items-start justify-center pt-4 pointer-events-none z-10">
            <RefreshCw size={16} className="animate-spin text-muted-foreground" />
          </div>
        )}
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {FIELD_COLUMNS.map((col) => {
                const filterControl =
                  col.vocab === "state" ? (
                    <ColumnFilter
                      label="State"
                      options={stateOptions.map((s) => ({ value: s.id, label: s.name }))}
                      selected={filters.state_id || []}
                      onChange={(v) => {
                        // Changing State invalidates whatever District/KVK was selected under the
                        // old one — clear both downstream filters, same as MainTable.tsx.
                        setFilters((f) => ({ ...f, state_id: v, district_id: [], kvk_id: [] }));
                        setPage(1);
                      }}
                    />
                  ) : col.vocab === "folder" ? (
                    <ColumnFilter
                      label="Folder"
                      options={folderFilterUiOptions}
                      selected={selectedFolderIds}
                      onChange={setFolderFilter}
                    />
                  ) : col.vocab === "district" ? (
                    <ColumnFilter
                      label="District"
                      options={districtFilterOptions.map((d) => ({ value: d.id, label: d.name }))}
                      selected={filters.district_id || []}
                      onChange={(v) => {
                        setFilters((f) => ({ ...f, district_id: v, kvk_id: [] }));
                        setPage(1);
                      }}
                    />
                  ) : col.vocab === "kvk" ? (
                    <ColumnFilter
                      label="KVK"
                      options={kvkFilterOptions.map((k) => ({ value: k.id, label: k.name }))}
                      selected={filters.kvk_id || []}
                      onChange={(v) => setFilter("kvk_id", v)}
                    />
                  ) : col.filterType === "language" ? (
                    <ColumnFilter
                      label={col.label}
                      options={languageOptions}
                      selected={filters.language || []}
                      onChange={(v) => setFilter("language", v)}
                    />
                  ) : col.filterType === "numberRange" ? (
                    <RangeFilter
                      label={col.label}
                      min={filters[`${col.key}_min`]?.[0]}
                      max={filters[`${col.key}_max`]?.[0]}
                      minBound={col.min}
                      maxBound={col.max}
                      unit={col.unit}
                      onChange={(a, b) => setRange(col.key, "min", "max", a, b)}
                    />
                  ) : col.filterType === "dateRange" ? (
                    <DateRangeColumnFilter
                      label={col.label}
                      from={filters[`${col.key}_from`]?.[0]}
                      to={filters[`${col.key}_to`]?.[0]}
                      onChange={(a, b) => setRange(col.key, "from", "to", a, b)}
                    />
                  ) : col.filterType === "users" ? (
                    (() => {
                      // filter[uploaded_by|translated_by|reviewed_by] is a case-insensitive
                      // substring match, comma-joined = OR — so the typed search box and the
                      // dropdown's checked names both just add terms to the same array. Split the
                      // current value back into "picked from the dropdown" vs "typed" by checking
                      // membership in the known-names list — a typed substring essentially never
                      // collides with a full name, and if it does, treating it as a pick is fine.
                      const options = usersOptionsFor[col.key] || [];
                      const current = filters[col.key] || [];
                      const checked = current.filter((v) => options.includes(v));
                      const typed = current.find((v) => !options.includes(v)) || "";
                      return (
                        <div className="flex flex-col gap-1">
                          <TextFilter
                            label={col.label}
                            value={typed}
                            onChange={(v) => setFilter(col.key, v ? [...checked, v] : checked)}
                            placeholder="Search…"
                          />
                          {options.length > 0 && (
                            <ColumnFilter
                              label="Pick from list"
                              options={options}
                              selected={checked}
                              onChange={(v) => setFilter(col.key, typed ? [...v, typed] : v)}
                            />
                          )}
                        </div>
                      );
                    })()
                  ) : col.options ? (
                    <ColumnFilter
                      label={col.label}
                      options={col.options}
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
                  );

                const key = sortKeyFor(col);
                return (
                  <th key={col.key} className="text-left px-3 py-2 whitespace-nowrap align-bottom">
                    <div className="flex items-center gap-1">
                      <div className="min-w-0">{filterControl}</div>
                      {isSortable(col) && (
                        <button
                          className={`shrink-0 rounded p-0.5 transition-colors cursor-pointer ${
                            sort === key || sort === `-${key}`
                              ? "text-primary"
                              : "text-muted-foreground/50 hover:text-foreground"
                          }`}
                          title={
                            sort === key
                              ? "Sorted ascending — click for descending"
                              : sort === `-${key}`
                                ? "Sorted descending — click to stop sorting"
                                : `Sort by ${col.label}`
                          }
                          onClick={() => toggleSort(key)}
                        >
                          {sort === key ? (
                            <ArrowUp size={11} />
                          ) : sort === `-${key}` ? (
                            <ArrowDown size={11} />
                          ) : (
                            <ArrowUpDown size={11} />
                          )}
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
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
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={COL_COUNT} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                  No rows match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={row.id}
                  onClick={(e) => handleRowClick(e, row)}
                  onDoubleClick={(e) => handleRowDoubleClick(e, row)}
                  className={`border-b border-border/50 transition-colors cursor-pointer ${
                    selectedRowId === row.id ? "bg-primary/10" : idx % 2 === 0 ? "" : "bg-muted/10"
                  }`}
                >
                  {FIELD_COLUMNS.map((col) => {
                    const val = row[col.key];
                    if (col.formatDate) {
                      return (
                        <td key={col.key} className="px-3 py-2 align-middle max-w-[180px]">
                          <span className="block truncate text-foreground" title={val || ""}>
                            {val ? formatDate(new Date(val)) : "—"}
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
                    if (col.key === "document_id") {
                      return (
                        <td key={col.key} className="px-3 py-2 align-middle">
                          <div className="flex items-center gap-1">
                            <button
                              className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                              onClick={() => handleCopyId(val)}
                              title="Click to copy"
                            >
                              {val ?? "—"}
                            </button>
                            <button
                              className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                              onClick={() => onOpenDetail(row.id)}
                              title="View document"
                            >
                              <Eye size={11} />
                            </button>
                            <button
                              className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                              onClick={() => setEditingRow(row)}
                              title="Edit document"
                            >
                              <Pencil size={11} />
                            </button>
                          </div>
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
                      fileId={row.representative_file_id}
                      downloadUrl={getOriginalDownloadUrl(row.id)}
                      filename={row.shareable_name}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <TranslateReviewCell
                      kind="translation"
                      doc={row}
                      scope="document"
                      translationAvailable={translationAvailable}
                      resolvePlacementId={() => resolvePlacementId(row.id)}
                      onChanged={(fresh) => {
                        patchRow(row.id, fresh);
                        notifyTranslationChanged(fresh);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <TranslateReviewCell
                      kind="review"
                      doc={row}
                      scope="document"
                      resolvePlacementId={() => resolvePlacementId(row.id)}
                      onChanged={(fresh) => {
                        patchRow(row.id, fresh);
                        onDataChanged?.();
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center gap-1">
                      <button
                        className="p-1 rounded border border-destructive/40 text-destructive/70 hover:border-destructive hover:text-destructive hover:bg-destructive/5 transition-colors cursor-pointer disabled:opacity-40"
                        onClick={() => handleDeleteRow(row)}
                        disabled={deletingRowId === row.id}
                        title="Delete this document — permanently removes it, all its placements, and every file it owns"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ServerPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      {editingRow && (
        <UniqueDocumentEditForm
          key={editingRow.id}
          doc={editingRow}
          open={!!editingRow}
          onOpenChange={(v) => !v && setEditingRow(null)}
          onSaved={(updated) => {
            patchRow(editingRow.id, updated);
            onDataChanged?.();
            setEditingRow(null);
          }}
        />
      )}
    </div>
  );
}
