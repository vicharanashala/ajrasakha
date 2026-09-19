// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, RefreshCw, Trash2, X, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
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
} from "../../api";
import ColumnFilter from "../FunctionsPanel/ColumnFilter";
import TextFilter from "./TextFilter";
import RangeFilter from "./RangeFilter";
import DateRangeColumnFilter from "./DateRangeColumnFilter";
import ServerPagination from "./ServerPagination";
import TopScrollbar from "./TopScrollbar";
import FileActionIcons from "./FileActionIcons";
import TranslateReviewCell from "./TranslateReviewCell";
import {
  ADVISORY_TYPE_OPTIONS,
  ADVISORY_SCOPE_OPTIONS,
  SEASON_OPTIONS,
  DOMAIN_OPTIONS,
  FORMAT_ORIGINAL_OPTIONS,
  VERIFICATION_STATUS_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
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
const FIELD_COLUMNS = [
  { key: "document_id", label: "Document ID", filterable: true, mono: true },
  { key: "shareable_name", label: "Shareable Name", filterable: true },
  { key: "advisory_type", label: "Advisory Type", filterable: true, options: ADVISORY_TYPE_OPTIONS },
  { key: "advisory_scope", label: "Advisory Scope", filterable: true, options: ADVISORY_SCOPE_OPTIONS },
  { key: "season", label: "Season", filterable: true, options: SEASON_OPTIONS },
  { key: "edition_revision_volume", label: "Edition/Rev/Vol", filterable: true },
  { key: "date_of_release", label: "Date of Release", filterType: "dateRange" },
  { key: "month_of_release", label: "Month of Release", filterType: "numberRange", min: 1, max: 12 },
  { key: "year_of_release", label: "Year of Release", filterType: "numberRange" },
  { key: "date_of_collection", label: "Date of Collection", filterType: "dateRange" },
  { key: "month_of_collection", label: "Month of Collection", filterType: "numberRange", min: 1, max: 12 },
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
  // translated / reviewed, and when"). *_at is sortable — the only sortable columns.
  { key: "translated_by", label: "Translated By", filterType: "users" },
  { key: "translated_at", label: "Translated At", filterType: "dateRange", sortable: true, formatDate: true },
  { key: "reviewed_by", label: "Reviewed By", filterType: "users" },
  { key: "reviewed_at", label: "Reviewed At", filterType: "dateRange", sortable: true, formatDate: true },
  { key: "placement_count", label: "Placements" },
];
const COL_COUNT = FIELD_COLUMNS.length + 4; // + Original, Translation, Review, actions (delete)

const MULTI_PLACEMENT_OPTIONS = [
  { key: "", label: "All" },
  { key: "true", label: "Multi-placement" },
  { key: "false", label: "Single-placement" },
];

export default function UniqueDocumentsTable({ onOpenDetail, translationAvailable, refreshKey, onDataChanged }) {
  const scrollRef = useRef(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  // "" | "translated_at" | "-translated_at" | "reviewed_at" | "-reviewed_at" — "-" is newest
  // first, the only two sortable fields (docs/first_render_frontend.md).
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

  async function load() {
    setLoading(true);
    try {
      const data = await getDashboardUniqueDocuments(page, filters, sort);
      const items = data.items || [];
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

  function patchRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

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
              {FIELD_COLUMNS.map((col) => (
                <th key={col.key} className="text-left px-3 py-2 whitespace-nowrap align-bottom">
                  {col.filterType === "language" ? (
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
                      onChange={(a, b) => setRange(col.key, "min", "max", a, b)}
                    />
                  ) : col.filterType === "dateRange" ? (
                    <div className="flex items-center gap-1">
                      <DateRangeColumnFilter
                        label={col.label}
                        from={filters[`${col.key}_from`]?.[0]}
                        to={filters[`${col.key}_to`]?.[0]}
                        onChange={(a, b) => setRange(col.key, "from", "to", a, b)}
                      />
                      {col.sortable && (
                        <button
                          className={`shrink-0 rounded p-0.5 transition-colors cursor-pointer ${
                            sort === col.key || sort === `-${col.key}`
                              ? "text-primary"
                              : "text-muted-foreground/50 hover:text-foreground"
                          }`}
                          title={
                            sort === col.key
                              ? "Sorted oldest first — click for newest first"
                              : sort === `-${col.key}`
                                ? "Sorted newest first — click to stop sorting"
                                : `Sort by ${col.label}`
                          }
                          onClick={() => toggleSort(col.key)}
                        >
                          {sort === col.key ? (
                            <ArrowUp size={11} />
                          ) : sort === `-${col.key}` ? (
                            <ArrowDown size={11} />
                          ) : (
                            <ArrowUpDown size={11} />
                          )}
                        </button>
                      )}
                    </div>
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
                  className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
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
    </div>
  );
}
