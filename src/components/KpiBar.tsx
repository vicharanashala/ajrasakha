import { TrendingUp, TrendingDown, AlertTriangle, Layers, Zap } from "lucide-react";
import type { GapKpis } from "../types";

interface KpiBarProps {
  kpis: GapKpis | null;
  isLoading: boolean;
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  isLoading,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-xl p-5" style={{ background: "var(--color-muted)" }}>
        <div className="skeleton h-4 w-24 mb-3" />
        <div className="skeleton h-8 w-28 mb-2" />
        <div className="skeleton h-3 w-20" />
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-5 transition-all duration-200 cursor-pointer"
      style={{
        background: "var(--color-muted)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "oklch(0.62 0.02 260)" }}>
          {label}
        </span>
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="text-2xl font-bold font-[family-name:var(--font-heading)] tracking-tight" style={{ color: "var(--color-foreground)" }}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: "oklch(0.55 0.02 260)" }}>
        {sub}
      </div>
    </div>
  );
}

export default function KpiBar({ kpis, isLoading }: KpiBarProps) {
  const formatNum = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label="Total Disclaimers"
        value={kpis ? formatNum(kpis.total_disclaimers) : "—"}
        sub="Farmer queries where no direct answer found"
        icon={AlertTriangle}
        accent="var(--color-accent)"
        isLoading={isLoading}
      />
      <KpiCard
        label="Unique Clusters"
        value={kpis ? kpis.unique_clusters.toString() : "—"}
        sub="Diagnosed gap clusters across crops & states"
        icon={Layers}
        accent="var(--color-primary)"
        isLoading={isLoading}
      />
      <KpiCard
        label="YoY Growth"
        value={kpis ? `${kpis.yoy_growth_pct > 0 ? "+" : ""}${kpis.yoy_growth_pct}%` : "—"}
        sub={
          kpis
            ? kpis.yoy_growth_pct > 0
              ? "Coverage gaps growing — action needed"
              : "Coverage gaps trending down"
            : ""
        }
        icon={kpis && kpis.yoy_growth_pct > 0 ? TrendingUp : TrendingDown}
        accent={kpis && kpis.yoy_growth_pct > 0 ? "var(--color-destructive)" : "var(--color-dx-language-alias)"}
        isLoading={isLoading}
      />
      <KpiCard
        label="Deflection Impact"
        value={kpis ? `${kpis.deflection_impact_pct}%` : "—"}
        sub="Projected query reduction if top-5 clusters resolved"
        icon={Zap}
        accent="var(--color-accent)"
        isLoading={isLoading}
      />
    </div>
  );
}
