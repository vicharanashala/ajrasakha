import React, { useEffect, useMemo, useState } from "react";
import { ChevronUp, ChevronsRight, Eye, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { UrlPreviewDialog } from "@/components/url-preview-dialog";
import { getDashboardUniqueDocuments, getDashboardStates } from "@/features/faq-pop/api";
import ServerPagination from "@/features/faq-pop/components/DocumentManagement/ServerPagination";

type ScopeTab = "state" | "central" | "all";
// Matches getDashboardUniqueDocuments' own fixed page size — no per-panel override.
const PAGE_SIZE = 100;

interface SourceReferencePanelProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  // The current question's own state (IQuestionContextData.details.state, a plain name string
  // like "Karnataka") — fuzzy-matched below against the dashboard's own state list to resolve a
  // state_id for the "State" tab's filter.
  questionState?: string | null;
}

export const SourceReferencePanel: React.FC<SourceReferencePanelProps> = ({
  isCollapsed = false,
  onToggleCollapse,
  questionState,
}) => {
  const [scopeTab, setScopeTab] = useState<ScopeTab>("all");
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
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    getDashboardStates()
      .then((d) => setStates(d || []))
      .catch(() => {});
  }, []);

  // Fuzzy match (exact case-insensitive first, then a substring match either direction) — per
  // product decision this is "good enough for now" rather than a strict/confirmable match.
  const matchedState = useMemo(() => {
    if (!questionState || states.length === 0) return null;
    const needle = questionState.trim().toLowerCase();
    if (!needle) return null;
    const exact = states.find((s) => s.name?.toLowerCase() === needle);
    if (exact) return exact;
    return (
      states.find((s) => {
        const name = s.name?.toLowerCase() || "";
        return name.includes(needle) || needle.includes(name);
      }) || null
    );
  }, [questionState, states]);

  const stateTabDisabled = !matchedState;

  useEffect(() => {
    if (scopeTab === "state" && stateTabDisabled) {
      setRows([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const filters: Record<string, string[]> =
      scopeTab === "state"
        ? { state_id: [matchedState!.id] }
        : scopeTab === "central"
          ? { advisory_scope: ["Central"] }
          : {};
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
  }, [scopeTab, page, search, matchedState, stateTabDisabled]);

  // The review doc is what the author should see once one exists — falls back to the original.
  function openPreview(doc: any) {
    const url = doc.review_status === "done" ? doc.review_shareable_link : doc.shareable_link;
    if (!url) return;
    setPreviewUrl(url);
  }

  if (isCollapsed) {
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

  const scopeTabs: Array<{ id: ScopeTab; label: string }> = [
    { id: "state", label: "State" },
    { id: "central", label: "Central" },
    { id: "all", label: "All" },
  ];

  return (
    <Card className="flex flex-col h-full border border-border bg-card shadow-xs rounded-xl overflow-hidden relative">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <p className="text-xs font-semibold text-foreground">
          Package of Practices (PoP) / Source Reference
        </p>
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Collapse Panel"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        )}
      </div>

      <CardContent className="p-3 flex-1 flex flex-col gap-2 overflow-hidden min-h-0">
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {scopeTabs.map((tab) => {
              const disabled = tab.id === "state" && stateTabDisabled;
              return (
                <button
                  key={tab.id}
                  disabled={disabled}
                  onClick={() => {
                    setScopeTab(tab.id);
                    setPage(1);
                  }}
                  title={
                    disabled
                      ? `No matching state found for "${questionState}"`
                      : undefined
                  }
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    scopeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
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
          ) : scopeTab === "state" && stateTabDisabled ? (
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
