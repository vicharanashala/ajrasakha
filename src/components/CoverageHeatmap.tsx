import { Fragment, useMemo } from "react";
import type { GapCluster } from "../types";

interface CoverageHeatmapProps {
  clusters: GapCluster[];
  isLoading: boolean;
}

function getHeatColor(score: number): string {
  if (score >= 80) return "var(--color-heat-4)";
  if (score >= 65) return "var(--color-heat-3)";
  if (score >= 50) return "var(--color-heat-2)";
  if (score >= 35) return "var(--color-heat-1)";
  return "var(--color-heat-0)";
}

function getHeatTextColor(bgScore: number): string {
  return bgScore >= 65 ? "oklch(1 0 0)" : "oklch(0.8 0.01 260)";
}

export default function CoverageHeatmap({ clusters, isLoading }: CoverageHeatmapProps) {
  const { crops, states, matrix } = useMemo(() => {
    const cropSet = new Set<string>();
    const stateSet = new Set<string>();
    clusters.forEach((c) => {
      cropSet.add(c.crop);
      stateSet.add(c.state);
    });
    const cropsArr = ["Paddy", "Wheat", "Cotton"]; // fixed display order
    const statesArr = ["Punjab", "Maharashtra", "Tamil Nadu"];

    const mat = new Map<string, GapCluster>();
    clusters.forEach((c) => mat.set(`${c.crop}::${c.state}`, c));

    return { crops: cropsArr, states: statesArr, matrix: mat };
  }, [clusters]);

  if (isLoading) {
    return (
      <div className="rounded-xl p-5" style={{ background: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
        <div className="skeleton h-5 w-32 mb-4" />
        <div className="grid gap-2" style={{ gridTemplateColumns: `120px repeat(${states.length}, 1fr)` }}>
          {Array.from({ length: crops.length + 1 }).map((_, ri) =>
            Array.from({ length: states.length + 1 }).map((_, ci) => (
              <div key={`${ri}-${ci}`} className="skeleton h-14 rounded-md" />
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5" style={{ background: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
      <h2 className="text-sm font-semibold font-[family-name:var(--font-heading)] uppercase tracking-wide mb-4" style={{ color: "oklch(0.62 0.02 260)" }}>
        Coverage Debt Heatmap
      </h2>
      <div className="overflow-x-auto">
        <div
          className="grid gap-2 min-w-[500px]"
          style={{ gridTemplateColumns: `120px repeat(${states.length}, 1fr)` }}
        >
          {/* Header row */}
          <div />
          {states.map((s) => (
            <div
              key={s}
              className="text-xs font-semibold uppercase tracking-wider text-center py-2"
              style={{ color: "oklch(0.55 0.02 260)" }}
            >
              {s}
            </div>
          ))}
          {/* Data rows */}
          {crops.map((crop) => (
            <Fragment key={`row-${crop}`}>
              <div
                className="text-xs font-medium py-3 pr-3 flex items-center justify-end"
                style={{ color: "oklch(0.7 0.01 260)" }}
              >
                {crop}
              </div>
              {states.map((state) => {
                const cluster = matrix.get(`${crop}::${state}`);
                const score = cluster?.coverage_debt_score ?? 0;
                return (
                  <div
                    key={`${crop}-${state}`}
                    className="rounded-md flex items-center justify-center text-center p-3 transition-all duration-200 cursor-pointer relative"
                    style={{
                      background: getHeatColor(score),
                      color: getHeatTextColor(score),
                      minHeight: "3.5rem",
                    }}
                    title={cluster ? `${cluster.cluster_name}\nScore: ${score}` : "No data"}
                  >
                    {score > 0 ? (
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-bold font-[family-name:var(--font-heading)]">
                          {score.toFixed(1)}
                        </span>
                        {cluster && (
                          <span className="text-[10px] mt-0.5 opacity-80">
                            {cluster.unique_farmers} farmers
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: "oklch(0.4 0.01 260)" }}>
                        —
                      </span>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-2 mt-4 text-[10px]" style={{ color: "oklch(0.5 0.01 260)" }}>
        <span>Low</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className="w-6 h-3 rounded-sm"
            style={{ background: getHeatColor(level * 20 + 10) }}
          />
        ))}
        <span>High</span>
      </div>
    </div>
  );
}
