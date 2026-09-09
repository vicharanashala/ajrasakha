import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/atoms/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import type { CoverageState, GapClusterItem } from "../types";

function coverageClasses(state?: CoverageState) {
  const value = (state ?? "").toUpperCase();
  if (value === "STRONG") return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (value === "PARTIAL") return "bg-amber-100 text-amber-900 border-amber-300";
  if (value === "GAP") return "bg-red-100 text-red-900 border-red-300";
  return "bg-muted text-muted-foreground border-border";
}

/**
 * Compute coverage-band counts from either:
 *   - the backend's pre-aggregated `coverage_bands` summary map, or
 *   - a fresh roll-up across the cluster list when the map is missing.
 */
function bandCounts(
  bands: Partial<Record<CoverageState, number | GapClusterItem[]>> | null | undefined,
  clusters: GapClusterItem[],
) {
  const out = { STRONG: 0, PARTIAL: 0, GAP: 0, OTHER: 0 };
  if (bands && typeof bands === "object") {
    for (const [k, v] of Object.entries(bands)) {
      const key = k.toUpperCase();
      if (key === "STRONG" || key === "PARTIAL" || key === "GAP") {
        out[key as "STRONG" | "PARTIAL" | "GAP"] = Array.isArray(v) ? v.length : (v ?? 0);
      } else if (typeof v === "number" || Array.isArray(v)) {
        out.OTHER += Array.isArray(v) ? v.length : (v ?? 0);
      }
    }
    return out;
  }
  for (const c of clusters) {
    const k = (c.gdb_coverage_band ?? "").toUpperCase();
    if (k === "STRONG" || k === "PARTIAL" || k === "GAP") {
      out[k as "STRONG" | "PARTIAL" | "GAP"] += 1;
    } else {
      out.OTHER += 1;
    }
  }
  return out;
}

export interface CoverageExplorerProps {
  clusters: GapClusterItem[];
  bands?: Partial<Record<CoverageState, number | GapClusterItem[]>> | null;
  crop?: string;
  state?: string;
  domain?: string;
  onCropChange: (v: string | undefined) => void;
  onStateChange: (v: string | undefined) => void;
  onDomainChange: (v: string | undefined) => void;
}

/**
 * Drill-down explorer for the (crop × state × domain) coverage space.
 *
 * The backend does not currently accept these filters in the request
 * body, so the explorer applies them on the client over the full
 * cluster list.  Every cell is colour-coded by its coverage band:
 *
 *   - STRONG  → solid coverage, no action needed
 *   - PARTIAL → partial coverage, optional follow-up
 *   - GAP     → no coverage, candidate for outreach
 */
export function CoverageExplorer({
  clusters,
  bands,
  crop,
  state,
  domain,
  onCropChange,
  onStateChange,
  onDomainChange,
}: CoverageExplorerProps) {
  const crops = useMemo(
    () =>
      Array.from(
        new Set(clusters.flatMap((c) => c.crops ?? [])),
      ).filter(Boolean).sort() as string[],
    [clusters],
  );
  const states = useMemo(
    () =>
      Array.from(
        new Set(clusters.flatMap((c) => c.states ?? [])),
      ).filter(Boolean).sort() as string[],
    [clusters],
  );
  const domains = useMemo(
    () =>
      Array.from(
        new Set(clusters.map((c) => c.domain).filter(Boolean)),
      ).sort() as string[],
    [clusters],
  );

  const filtered = useMemo(() => {
    return clusters.filter((c) => {
      if (crop && !(c.crops ?? []).includes(crop)) return false;
      if (state && !(c.states ?? []).includes(state)) return false;
      if (domain && c.domain !== domain) return false;
      return true;
    });
  }, [clusters, crop, state, domain]);

  const counts = useMemo(() => bandCounts(bands, filtered), [bands, filtered]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coverage explorer</CardTitle>
        <CardDescription>
          Drill into (crop × state × domain) coverage cells. Use the filters to
          narrow down to a specific audience.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FacetSelect
            label="Crop"
            value={crop}
            options={crops}
            onChange={onCropChange}
          />
          <FacetSelect
            label="State"
            value={state}
            options={states}
            onChange={onStateChange}
          />
          <FacetSelect
            label="Domain"
            value={domain}
            options={domains}
            onChange={onDomainChange}
          />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300">
            STRONG: {counts.STRONG}
          </Badge>
          <Badge className="bg-amber-100 text-amber-900 border-amber-300">
            PARTIAL: {counts.PARTIAL}
          </Badge>
          <Badge className="bg-red-100 text-red-900 border-red-300">
            GAP: {counts.GAP}
          </Badge>
          {counts.OTHER > 0 && (
            <Badge variant="outline">Other: {counts.OTHER}</Badge>
          )}
        </div>

        {filtered.length === 0 ? (
          <p
            className="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
            role="status"
          >
            No coverage cells match the current filters.
          </p>
        ) : (
          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
            role="list"
            aria-label="Coverage cells"
          >
            {filtered.map((c, idx) => (
              <div
                role="listitem"
                key={`${c.cluster_id ?? c.theme}-${idx}`}
                className={cn(
                  "rounded-md border p-3 text-sm",
                  coverageClasses(c.gdb_coverage_band),
                )}
              >
                <p className="font-medium">
                  {c.top_crop || "—"} · {c.top_state || "—"}
                </p>
                <p className="text-xs opacity-80">{c.domain || "—"}</p>
                <p className="mt-1 text-xs">
                  Theme: <span className="font-medium">{c.theme || "—"}</span>
                </p>
                <p className="mt-1 text-xs tabular-nums">
                  Queries: {c.query_count ?? "—"}
                  {c.gdb_coverage_score !== undefined
                    ? ` · coverage score ${c.gdb_coverage_score.toFixed(2)}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {clusters.length} cells.
        </p>
      </CardContent>
    </Card>
  );
}

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={`facet-${label}`}>
        {label}
      </label>
      <Select
        value={value ?? "__all__"}
        onValueChange={(v) => onChange(v === "__all__" ? undefined : v)}
      >
        <SelectTrigger id={`facet-${label}`} className="w-full">
          <SelectValue placeholder={`All ${label.toLowerCase()}s`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All {label.toLowerCase()}s</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}