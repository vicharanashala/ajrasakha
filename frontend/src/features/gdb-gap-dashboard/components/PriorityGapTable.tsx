import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";
import { cn } from "@/lib/utils";
import type { CoverageState, GapClusterItem, PriorityBucket } from "../types";

/**
 * Priority ordering used by the table sort.  Anything not listed falls
 * to the end of the ordering.
 */
const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function priorityVariant(priority?: PriorityBucket) {
  switch ((priority ?? "").toLowerCase()) {
    case "critical":
      return "destructive" as const;
    case "high":
      return "default" as const;
    case "medium":
      return "secondary" as const;
    case "low":
      return "outline" as const;
    default:
      return "outline" as const;
  }
}

function priorityLabel(priority?: PriorityBucket) {
  if (!priority) return "—";
  const v = String(priority).toUpperCase();
  return v.length > 0 ? v : "—";
}

function formatPct(ratio?: number) {
  if (ratio === undefined || ratio === null || Number.isNaN(ratio)) return "—";
  const pct = ratio * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function formatGrowthIndicator(ratio?: number) {
  if (ratio === undefined || ratio === null) return null;
  if (ratio > 0.05) {
    return { color: "text-emerald-600", Icon: ArrowUp, label: "growing" };
  }
  if (ratio < -0.05) {
    return { color: "text-red-600", Icon: ArrowDown, label: "shrinking" };
  }
  return { color: "text-muted-foreground", Icon: ArrowUpDown, label: "stable" };
}

function coverageBadge(state?: CoverageState) {
  const value = (state ?? "").toUpperCase();
  if (value === "STRONG") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (value === "PARTIAL") return "bg-amber-100 text-amber-800 border-amber-200";
  if (value === "GAP") return "bg-red-100 text-red-800 border-red-200";
  return "bg-muted text-muted-foreground border-border";
}

type SortKey =
  | "priority"
  | "query_count"
  | "avg_weekly_growth_pct"
  | "theme"
  | "top_crop"
  | "top_state";
type SortDir = "asc" | "desc";

export interface PriorityGapTableProps {
  gaps: GapClusterItem[];
  /** Optional id used for tests / a11y labelling. */
  ariaLabelledBy?: string;
}

/**
 * Searchable, sortable, expandable priority-gap table.
 *
 * The rows are the clusters returned by the GDB detector, displayed in
 * priority order.  The sort headers let product owners flip the table
 * by demand volume, growth, crop, state, or theme.  Each row is
 * expandable to reveal the sample farmer questions captured by the
 * pipeline.
 */
export function PriorityGapTable({ gaps, ariaLabelledBy }: PriorityGapTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return gaps;
    return gaps.filter((g) => {
      return (
        g.theme?.toLowerCase().includes(q) ||
        g.domain?.toLowerCase().includes(q) ||
        g.crops?.some((c) => c?.toLowerCase().includes(q)) ||
        g.states?.some((s) => s?.toLowerCase().includes(q))
      );
    });
  }, [gaps, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "priority": {
          const av = PRIORITY_ORDER[(a.priority ?? "").toLowerCase()] ?? 99;
          const bv = PRIORITY_ORDER[(b.priority ?? "").toLowerCase()] ?? 99;
          return (av - bv) * dir;
        }
        case "query_count":
        case "avg_weekly_growth_pct": {
          const av = (a[sortKey] ?? 0) as number;
          const bv = (b[sortKey] ?? 0) as number;
          return (av - bv) * dir;
        }
        case "theme":
        case "top_crop":
        case "top_state": {
          const av = ((a[sortKey] ?? "") as string).toLowerCase();
          const bv = ((b[sortKey] ?? "") as string).toLowerCase();
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
          return 0;
        }
        default:
          return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderSortHeader = (key: SortKey, label: string, className?: string) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        aria-label={`Sort by ${label} (${
          sortKey === key && sortDir === "asc" ? "descending" : "ascending"
        })`}
      >
        {label}
        {sortKey === key ? (
          sortDir === "asc" ? (
            <ArrowUp aria-hidden="true" className="h-3 w-3" />
          ) : (
            <ArrowDown aria-hidden="true" className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown aria-hidden="true" className="h-3 w-3 opacity-50" />
        )}
      </button>
    </TableHead>
  );

  if (gaps.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
        role="status"
      >
        No priority gaps detected for the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by theme, crop, state, or domain"
          aria-label="Search priority gaps"
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          {sorted.length} of {gaps.length} shown
        </p>
      </div>

      <div className="rounded-md border">
        <Table aria-labelledby={ariaLabelledBy}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" aria-label="Expand" />
              {renderSortHeader("priority", "Priority")}
              {renderSortHeader("theme", "Theme")}
              {renderSortHeader("top_crop", "Crop")}
              {renderSortHeader("top_state", "State")}
              <TableHead>Domain</TableHead>
              {renderSortHeader("query_count", "Unanswered", "text-right")}
              {renderSortHeader("avg_weekly_growth_pct", "Growth", "text-right")}
              <TableHead>Coverage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((gap, idx) => {
              const rowId = gap.cluster_id ?? `${gap.theme}-${idx}`;
              const isOpen = expanded.has(rowId);
              const growth = formatGrowthIndicator(gap.avg_weekly_growth_pct);
              return (
                <Fragment key={rowId}>
                  <TableRow data-state={isOpen ? "selected" : undefined}>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-expanded={isOpen}
                        aria-controls={`samples-${rowId}`}
                        aria-label={
                          isOpen ? "Collapse sample questions" : "Expand sample questions"
                        }
                        onClick={() => toggleRow(rowId)}
                      >
                        {isOpen ? (
                          <ChevronDown aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <ChevronRight aria-hidden="true" className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityVariant(gap.priority)}>
                        {priorityLabel(gap.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{gap.theme || "—"}</TableCell>
                    <TableCell>{gap.top_crop || "—"}</TableCell>
                    <TableCell>{gap.top_state || "—"}</TableCell>
                    <TableCell>{gap.domain || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {gap.query_count ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {growth ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-sm tabular-nums",
                            growth.color,
                          )}
                          aria-label={`Growth ${formatPct(
                            gap.avg_weekly_growth_pct,
                          )} (${growth.label})`}
                        >
                          <growth.Icon aria-hidden="true" className="h-3 w-3" />
                          {formatPct(gap.avg_weekly_growth_pct)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                          coverageBadge(gap.gdb_coverage_band),
                        )}
                      >
                        {(gap.gdb_coverage_band ?? "UNKNOWN").toString()}
                      </span>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow
                      id={`samples-${rowId}`}
                      className="bg-muted/40 hover:bg-muted/40"
                    >
                      <TableCell />
                      <TableCell colSpan={8}>
                        <div className="space-y-2 py-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Sample questions
                          </p>
                          {gap.sample_queries && gap.sample_queries.length > 0 ? (
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                              {gap.sample_queries.map((q, i) => (
                                <li key={i}>{q}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No sample questions captured for this gap.
                            </p>
                          )}
                          {gap.suggested_action && (
                            <p className="text-xs text-muted-foreground">
                              Suggested action: {gap.suggested_action}
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}