import React, { useEffect, useMemo, useState } from "react";
import { ChevronsRight, Eye, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { UrlPreviewDialog } from "@/components/url-preview-dialog";
import {
  getDashboardUniqueDocuments,
  getDashboardStates,
  getDashboardCrops,
  getDashboardDistricts,
} from "@/features/faq-pop/api";
import ServerPagination from "@/features/faq-pop/components/DocumentManagement/ServerPagination";

import { PanelControls } from "./PanelControls";

type FilterKey = "state" | "central" | "crop" | "district";
// Matches getDashboardUniqueDocuments' own fixed page size — no per-panel override.
const PAGE_SIZE = 100;

interface SourceReferencePanelProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isEnlarged?: boolean;
  onToggleEnlarge?: () => void;
  // The current question's own state/crop/district (IQuestionContextData.details.*, plain name
  // strings like "Karnataka") — each fuzzy-matched below against its own dashboard list to resolve
  // an id for its own toggle button's filter.
  questionState?: string | null;
  questionCrop?: string | null;
  questionDistrict?: string | null;
}

export const SourceReferencePanel: React.FC<SourceReferencePanelProps> = ({
  isCollapsed = false,
  onToggleCollapse,
  isEnlarged = false,
  onToggleEnlarge,
  questionState,
  questionCrop,
  questionDistrict,
}) => {
  // Each of State/Central/Crop/District is its own on/off toggle — additive, so e.g. State +
  // Crop can both be active at once. "All" is not a toggle: it's an action that clears every
  // entry here, which is what makes the query unfiltered again.
  const [activeFilters, setActiveFilters] = useState<Record<FilterKey, boolean>>({
    state: false,
    central: false,
    crop: false,
    district: false,
  });
  const [page, setPage] = useState(1);
  // Search box: a draft value the user is typing, debounced into `search` (the value actually
  // sent to the backend as filter[shareable_name], a substring match) so every keystroke doesn't
  // fire its own request.
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 400);
    return () => clearTimeout(t);
  }, [searchDraft]);
  useEffect(() => {
    setPage(1);
  }, [search]);
  const [states, setStates] = useState<Array<{ id: string; name: string }>>([]);
  const [crops, setCrops] = useState<Array<{ id: string; name: string }>>([]);
  const [districts, setDistricts] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    getDashboardStates()
      .then((d) => setStates(d || []))
      .catch(() => {});
    // Unscoped (no state_id) — full crop/district lists, so matching doesn't depend on the
    // scope tab or on a state match existing.
    getDashboardCrops()
      .then((d) => setCrops(d || []))
      .catch(() => {});
    getDashboardDistricts()
      .then((d) => setDistricts(d || []))
      .catch(() => {});
  }, []);

  // Fuzzy match (exact case-insensitive first, then a substring match either direction) — per
  // product decision this is "good enough for now" rather than a strict/confirmable match.
  function fuzzyMatch(needleRaw: string | null | undefined, list: Array<{ id: string; name: string }>) {
    if (!needleRaw || list.length === 0) return null;
    const needle = needleRaw.trim().toLowerCase();
    if (!needle) return null;
    const exact = list.find((s) => s.name?.toLowerCase() === needle);
    if (exact) return exact;
    return (
      list.find((s) => {
        const name = s.name?.toLowerCase() || "";
        return name.includes(needle) || needle.includes(name);
      }) || null
    );
  }

  const matchedState = useMemo(() => fuzzyMatch(questionState, states), [questionState, states]);
  const matchedCrop = useMemo(() => fuzzyMatch(questionCrop, crops), [questionCrop, crops]);
  const matchedDistrict = useMemo(
    () => fuzzyMatch(questionDistrict, districts),
    [questionDistrict, districts],
  );

  const stateTabDisabled = !matchedState;
  const cropTabDisabled = !matchedCrop;
  const districtTabDisabled = !matchedDistrict;

  useEffect(() => {
    if (activeFilters.state && stateTabDisabled) {
      setRows([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const filters: Record<string, string[]> = {};
    if (activeFilters.state && matchedState) filters.state_id = [matchedState.id];
    if (activeFilters.central) filters.advisory_scope = ["Central"];
    if (activeFilters.crop && matchedCrop) filters.crop_id = [matchedCrop.id];
    if (activeFilters.district && matchedDistrict) filters.district_id = [matchedDistrict.id];
    if (search) filters.shareable_name = [search];
    getDashboardUniqueDocuments(page, filters, "")
      .then((data) => {
        if (cancelled) return;
        setRows(data.items || []);
        setTotal(data.total || 0);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFilters, page, search, matchedState, stateTabDisabled, matchedCrop, matchedDistrict]);

  function toggleFilter(key: FilterKey) {
    setActiveFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    setPage(1);
  }

  function clearAllFilters() {
    setActiveFilters({ state: false, central: false, crop: false, district: false });
    setPage(1);
  }

  const anyFilterActive = activeFilters.state || activeFilters.central || activeFilters.crop || activeFilters.district;

  // The review doc is what the author should see once one exists — falls back to the original.
  function openPreview(doc: any) {
    const url = doc.review_status === "done" ? doc.review_shareable_link : doc.shareable_link;
    if (!url) return;
    setPreviewUrl(url);
  }

  if (isCollapsed && !isEnlarged) {
    return (
      <div className="h-full flex flex-col items-center justify-between py-4 px-2 bg-card border border-border rounded-xl shadow-xs transition-all duration-300 w-12 min-h-[300px]">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8 rounded-lg hover:bg-muted"
          title="Expand Package of Practices / Source Reference"
        >
          <ChevronsRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </Button>

        <div className="flex items-center gap-2 [writing-mode:vertical-rl] rotate-180 select-none py-4">
          <span className="text-xs font-semibold tracking-wide text-foreground">
            PoP / Source Reference
          </span>
        </div>

        <div className="w-2 h-2 rounded-full bg-purple-500" />
      </div>
    );
  }

  const filterButtons: Array<{ id: FilterKey; label: string; disabled: boolean; disabledReason?: string }> = [
    { id: "state", label: "State", disabled: stateTabDisabled, disabledReason: `No matching state found for "${questionState}"` },
    { id: "central", label: "Central", disabled: false },
    { id: "crop", label: "Crop", disabled: cropTabDisabled, disabledReason: `No matching crop found for "${questionCrop}"` },
    { id: "district", label: "District", disabled: districtTabDisabled, disabledReason: `No matching district found for "${questionDistrict}"` },
  ];

  return (
    <Card className="flex flex-col h-full border border-border bg-card shadow-xs rounded-xl overflow-hidden relative">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border shrink-0">
        <p className="text-xs font-semibold text-foreground">
          Package of Practices (PoP) / Source Reference
        </p>
        <PanelControls
          isEnlarged={isEnlarged}
          onToggleEnlarge={onToggleEnlarge}
          onToggleCollapse={onToggleCollapse}
        />
      </div>

      <CardContent className="p-3 flex-1 flex flex-col gap-2 overflow-hidden min-h-0">
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {filterButtons.map((btn) => (
              <button
                key={btn.id}
                disabled={btn.disabled}
                onClick={() => toggleFilter(btn.id)}
                title={btn.disabled ? btn.disabledReason : undefined}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  activeFilters[btn.id]
                    ? "bg-green-600 text-white"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {btn.label}
              </button>
            ))}
            <button
              onClick={clearAllFilters}
              title="Clear all filters"
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border-l border-border ${
                !anyFilterActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              All
            </button>
          </div>

          <div className="relative flex-1 min-w-[140px]">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search by document name…"
              className="w-full bg-input border border-border rounded-md pl-6 pr-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border border-border rounded-md min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full py-8 text-xs text-destructive text-center px-3">
              {error}
            </div>
          ) : activeFilters.state && stateTabDisabled ? (
            <div className="flex items-center justify-center h-full py-8 text-xs text-muted-foreground italic text-center px-3">
              No matching state found for "{questionState}".
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-full py-8 text-xs text-muted-foreground italic text-center px-3">
              {search ? `No documents matching "${search}".` : "No documents found."}
            </div>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {rows.map((doc) => (
                  <tr
                    key={doc.id}
                    onDoubleClick={() => openPreview(doc)}
                    className="border-b border-border/50 last:border-0 hover:bg-accent/40 transition-colors cursor-default"
                  >
                    <td className="px-2.5 py-2 align-top whitespace-normal break-words text-foreground">
                      {doc.shareable_name || doc.document_id || "—"}
                    </td>
                    <td className="px-2 py-2 align-top w-8 text-right">
                      <button
                        className="p-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                        onClick={() => openPreview(doc)}
                        title="View document"
                      >
                        <Eye size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="shrink-0">
          <ServerPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </CardContent>

      <UrlPreviewDialog
        open={Boolean(previewUrl)}
        onOpenChange={(o) => {
          if (!o) setPreviewUrl(null);
        }}
        selectedUrl={previewUrl}
      />
    </Card>
  );
};
