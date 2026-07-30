import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight } from "lucide-react";
import type { GapCluster } from "../types";
import { DIAGNOSIS_CONFIG } from "../hooks/useGapData";

interface PriorityQueueProps {
  clusters: GapCluster[];
  isLoading: boolean;
  onSelectCluster: (id: string) => void;
  selectedClusterId: string | null;
}

type SortField = "cluster_name" | "diagnosis" | "unique_farmers" | "coverage_debt_score" | "yoy_growth_pct";
type SortDir = "asc" | "desc";

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

export default function PriorityQueue({ clusters, isLoading, onSelectCluster, selectedClusterId }: PriorityQueueProps) {
  const [sortField, setSortField] = useState<SortField>("coverage_debt_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const arr = [...clusters];
    arr.sort((a, b) => {
      let va: number | string = a[sortField];
      let vb: number | string = b[sortField];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [clusters, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const columns: { key: SortField; label: string; align: "left" | "right" }[] = [
    { key: "cluster_name", label: "Cluster", align: "left" },
    { key: "diagnosis", label: "Diagnosis", align: "left" },
    { key: "unique_farmers", label: "Farmers", align: "right" },
    { key: "coverage_debt_score", label: "Debt Score", align: "right" },
    { key: "yoy_growth_pct", label: "YoY Δ", align: "right" },
  ];

  if (isLoading) {
    return (
      <div className="rounded-xl p-5" style={{ background: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
        <div className="skeleton h-5 w-32 mb-4" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-12 w-full mb-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <h2 className="text-sm font-semibold font-[family-name:var(--font-heading)] uppercase tracking-wide" style={{ color: "oklch(0.62 0.02 260)" }}>
          Priority Queue · {clusters.length} clusters
        </h2>
        <span className="text-[10px]" style={{ color: "oklch(0.5 0.01 260)" }}>
          Showing {Math.min(clusters.length, 25)} of {clusters.length} results
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]" role="table" aria-label="Coverage debt priority queue">
          <caption className="sr-only">Ranked list of gap clusters by coverage debt score with diagnosis, farmer count, and year-over-year growth</caption>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              <th scope="col" className="w-10 py-3 px-2 text-center text-[10px] uppercase tracking-wider font-medium" style={{ color: "oklch(0.5 0.01 260)" }}>
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={sortField === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  className={`py-3 px-3 text-[10px] uppercase tracking-wider font-medium cursor-pointer select-none transition-colors duration-150 hover:text-white ${col.align === "right" ? "text-right" : "text-left"}`}
                  style={{ color: "oklch(0.5 0.01 260)" }}
                  onClick={() => handleSort(col.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSort(col.key);
                    }
                  }}
                  tabIndex={0}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon field={col.key} sortField={sortField} sortDir={sortDir} />
                  </span>
                </th>
              ))}
              <th scope="col" className="w-8 py-3 px-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((cluster, idx) => {
              const dx = DIAGNOSIS_CONFIG[cluster.diagnosis];
              const isSelected = cluster.id === selectedClusterId;
              return (
                <tr
                  key={cluster.id}
                  role="row"
                  tabIndex={0}
                  className="table-row-hover cursor-pointer transition-colors duration-150"
                  style={{
                    background: isSelected ? "oklch(0.25 0.018 260)" : "transparent",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                  onClick={() => onSelectCluster(cluster.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectCluster(cluster.id);
                    }
                  }}
                  aria-selected={isSelected}
                >
                  <td className="py-3 px-2 text-center text-xs font-medium" style={{ color: "oklch(0.5 0.01 260)" }}>
                    {idx + 1}
                  </td>
                  <td className="py-3 px-3">
                    <div className="text-sm font-medium truncate max-w-52" style={{ color: "var(--color-foreground)" }}>
                      {cluster.cluster_name}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "oklch(0.48 0.02 260)" }}>
                      {cluster.crop} · {cluster.state} · {cluster.domain}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ background: dx.bg, color: dx.color, border: `1px solid ${dx.border}` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: dx.color }} />
                      {dx.label}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-sm font-mono font-medium" style={{ color: "var(--color-foreground)" }}>
                    {cluster.unique_farmers.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="text-sm font-bold font-[family-name:var(--font-heading)]" style={{ color: "var(--color-foreground)" }}>
                      {cluster.coverage_debt_score.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span
                      className={`text-sm font-medium ${cluster.yoy_growth_pct >= 0 ? "" : ""}`}
                      style={{
                        color: cluster.yoy_growth_pct >= 0 ? "var(--color-destructive)" : "var(--color-dx-language-alias)",
                      }}
                    >
                      {cluster.yoy_growth_pct >= 0 ? "+" : ""}{cluster.yoy_growth_pct}%
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <ChevronRight className="w-4 h-4 inline-block" style={{ color: "oklch(0.45 0.02 260)" }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
