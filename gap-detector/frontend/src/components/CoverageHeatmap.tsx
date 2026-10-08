import { Fragment, useMemo, useState } from "react";
import type { HeatmapCell } from "../types";

/**
 * Domain × state coverage grid. Encoding is *gap intensity* on a single-hue
 * sequential ramp (darker = weaker GDB coverage) so the cells that need attention
 * are the ones that stand out. Status is also carried by a glyph in the cell
 * ("!" for gap) and by the tooltip, so meaning is never colour-alone. A table
 * view is one click away.
 */

// 7-step sequential blue ramp (light → dark), reference palette steps 100..700
const RAMP = ["--seq-100", "--seq-200", "--seq-300", "--seq-400", "--seq-500", "--seq-600", "--seq-700"];

function rampVar(coverage: number): string {
  const gap = 100 - coverage; // 0 (fully covered) .. 100 (no coverage)
  const idx = Math.min(RAMP.length - 1, Math.floor((gap / 100) * RAMP.length));
  return `var(${RAMP[idx]})`;
}

function inkFor(coverage: number): string {
  return 100 - coverage >= 50 ? "#ffffff" : "var(--ink)";
}

export function CoverageHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [hover, setHover] = useState<HeatmapCell | null>(null);

  // Aggregate crop-level cells (if any) up to domain × state and order axes by gap volume.
  const { domains, states, lookup } = useMemo(() => {
    const agg = new Map<string, HeatmapCell>();
    for (const c of cells) {
      const key = `${c.domain}|${c.state}`;
      const prev = agg.get(key);
      if (!prev) agg.set(key, { ...c, crop: null });
      else {
        const gdb = prev.gdb_count + c.gdb_count;
        const disc = prev.disclaimer_count + c.disclaimer_count;
        const score = gdb + disc ? Math.round((1000 * gdb) / (gdb + disc)) / 10 : 0;
        agg.set(key, { ...prev, gdb_count: gdb, disclaimer_count: disc, coverage_score: score });
      }
    }
    const byDomain = new Map<string, number>();
    const byState = new Map<string, number>();
    for (const c of agg.values()) {
      byDomain.set(c.domain, (byDomain.get(c.domain) ?? 0) + c.disclaimer_count);
      byState.set(c.state, (byState.get(c.state) ?? 0) + c.disclaimer_count);
    }
    const order = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    const states = order(byState).filter((s) => s !== "Unknown");
    if (byState.has("Unknown")) states.push("Unknown");
    return { domains: order(byDomain), states, lookup: agg };
  }, [cells]);

  if (!cells.length) return null;

  const rows = domains.map((d) => ({ domain: d, cells: states.map((s) => lookup.get(`${d}|${s}`) ?? null) }));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--ink-2)" }}>
        <div className="flex items-center gap-2">
          <span>GDB coverage:</span>
          <span className="inline-flex overflow-hidden rounded" aria-hidden>
            {RAMP.map((v) => (
              <span key={v} className="h-3 w-4" style={{ background: `var(${v})` }} />
            ))}
          </span>
          <span>strong → weak · “!” marks a gap cell</span>
        </div>
        <div className="inline-flex overflow-hidden rounded border hairline">
          {(["grid", "table"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-2 py-1"
              style={{ background: view === v ? "var(--accent-soft)" : "transparent", color: "var(--ink)" }}
            >
              {v === "grid" ? "Heatmap" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {view === "grid" ? (
        <div className="overflow-x-auto">
          <div
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: `minmax(140px, max-content) repeat(${states.length}, minmax(64px, 1fr))` }}
          >
            <div />
            {states.map((s) => (
              <div key={s} className="truncate px-1 pb-1 text-center text-[11px]" style={{ color: "var(--muted)" }} title={s}>
                {s.replace(" (National Capital Territory)", "")}
              </div>
            ))}
            {rows.map((r) => (
              <Fragment key={r.domain}>
                <div className="truncate pr-2 text-xs leading-8" style={{ color: "var(--ink-2)" }} title={r.domain}>
                  {r.domain}
                </div>
                {r.cells.map((c, i) =>
                  c ? (
                    <button
                      key={`${r.domain}-${states[i]}`}
                      onMouseEnter={() => setHover(c)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(c)}
                      onBlur={() => setHover(null)}
                      className="tabular h-8 rounded-[4px] text-[11px] font-medium"
                      style={{ background: rampVar(c.coverage_score), color: inkFor(c.coverage_score) }}
                      aria-label={`${r.domain} in ${states[i]}: ${c.coverage_score}% covered, ${c.disclaimer_count} unanswered`}
                    >
                      {c.status === "gap" ? "! " : ""}
                      {Math.round(c.coverage_score)}
                    </button>
                  ) : (
                    <div key={`${r.domain}-${states[i]}`} className="h-8 rounded-[4px]" style={{ background: "var(--grid)", opacity: 0.4 }} />
                  ),
                )}
              </Fragment>
            ))}
          </div>
          <div className="mt-2 h-5 text-xs" style={{ color: "var(--ink-2)" }} aria-live="polite">
            {hover
              ? `${hover.domain} · ${hover.state}: ${hover.coverage_score}% covered — ${hover.gdb_count} GDB entries vs ${hover.disclaimer_count} unanswered queries (${hover.status})`
              : "Hover a cell for details."}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data w-full text-sm">
            <thead>
              <tr>
                <th>Domain</th>
                <th>State</th>
                <th className="text-right">GDB entries</th>
                <th className="text-right">Unanswered</th>
                <th className="text-right">Coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...lookup.values()]
                .sort((a, b) => a.coverage_score - b.coverage_score || b.disclaimer_count - a.disclaimer_count)
                .map((c) => (
                  <tr key={`${c.domain}|${c.state}`}>
                    <td>{c.domain}</td>
                    <td>{c.state}</td>
                    <td className="tabular text-right">{c.gdb_count}</td>
                    <td className="tabular text-right">{c.disclaimer_count}</td>
                    <td className="tabular text-right">{c.coverage_score}%</td>
                    <td>{c.status === "gap" ? "! gap" : c.status}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
