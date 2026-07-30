import { X, Users, MessageSquare, Lightbulb, Calendar, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { GapCluster } from "../types";
import { DIAGNOSIS_CONFIG } from "../hooks/useGapData";

interface ClusterDrawerProps {
  cluster: GapCluster | null;
  onClose: () => void;
}

export default function ClusterDrawer({ cluster, onClose }: ClusterDrawerProps) {
  if (!cluster) return null;

  const dx = DIAGNOSIS_CONFIG[cluster.diagnosis];

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="presentation"
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full z-50 overflow-y-auto drawer-enter"
        style={{
          width: "min(520px, 100vw)",
          background: "var(--color-background)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.4)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`Detail view for ${cluster.cluster_name}`}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-6 py-4 flex items-start justify-between"
          style={{
            background: "var(--color-background)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div className="flex-1 min-w-0 pr-4">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium mb-2"
              style={{ background: dx.bg, color: dx.color, border: `1px solid ${dx.border}` }}
            >
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: dx.color }} />
              {dx.label}
            </span>
            <h3 className="text-base font-semibold font-[family-name:var(--font-heading)]" style={{ color: "var(--color-foreground)" }}>
              {cluster.cluster_name}
            </h3>
            <p className="text-xs mt-1" style={{ color: "oklch(0.55 0.02 260)" }}>
              {cluster.crop} · {cluster.state} · {cluster.domain}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors duration-150 cursor-pointer hover:bg-[var(--color-muted)]"
            aria-label="Close drawer"
            style={{ color: "oklch(0.5 0.02 260)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-3" style={{ background: "var(--color-muted)" }}>
              <div className="flex items-center gap-2 text-xs mb-1" style={{ color: "oklch(0.55 0.02 260)" }}>
                <Users className="w-3.5 h-3.5" />
                Unique Farmers
              </div>
              <div className="text-xl font-bold font-[family-name:var(--font-heading)]" style={{ color: "var(--color-foreground)" }}>
                {cluster.unique_farmers.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--color-muted)" }}>
              <div className="flex items-center gap-2 text-xs mb-1" style={{ color: "oklch(0.55 0.02 260)" }}>
                <MessageSquare className="w-3.5 h-3.5" />
                Total Queries
              </div>
              <div className="text-xl font-bold font-[family-name:var(--font-heading)]" style={{ color: "var(--color-foreground)" }}>
                {cluster.total_queries.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--color-muted)" }}>
              <div className="flex items-center gap-2 text-xs mb-1" style={{ color: "oklch(0.55 0.02 260)" }}>
                <TrendingUp className="w-3.5 h-3.5" />
                Coverage Debt Score
              </div>
              <div className="text-xl font-bold font-[family-name:var(--font-heading)]" style={{ color: "var(--color-foreground)" }}>
                {cluster.coverage_debt_score.toFixed(1)}
              </div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--color-muted)" }}>
              <div className="flex items-center gap-2 text-xs mb-1" style={{ color: "oklch(0.55 0.02 260)" }}>
                <Calendar className="w-3.5 h-3.5" />
                YoY Growth
              </div>
              <div
                className="text-xl font-bold font-[family-name:var(--font-heading)]"
                style={{
                  color: cluster.yoy_growth_pct >= 0 ? "var(--color-destructive)" : "var(--color-dx-language-alias)",
                }}
              >
                {cluster.yoy_growth_pct >= 0 ? "+" : ""}{cluster.yoy_growth_pct}%
              </div>
            </div>
          </div>

          {/* Trend sparkline */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "oklch(0.55 0.02 260)" }}>
              4-Week Trend
            </h4>
            <div className="rounded-lg p-3" style={{ background: "var(--color-muted)", height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cluster.trend_4wk}>
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10, fill: "oklch(0.5 0.01 260)" }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={["dataMin - 5", "dataMax + 5"]}
                    tick={{ fontSize: 10, fill: "oklch(0.5 0.01 260)" }}
                    axisLine={false}
                    tickLine={false}
                    width={35}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.21 0.012 260)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--color-foreground)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="debt_score"
                    stroke={dx.color}
                    strokeWidth={2}
                    dot={{ fill: dx.color, r: 3 }}
                    activeDot={{ fill: dx.color, r: 5, stroke: "var(--color-background)", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Diagnosis reasoning */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "oklch(0.55 0.02 260)" }}>
              Diagnosis
            </h4>
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-foreground)", lineHeight: 1.7 }}>
              {cluster.diagnosis_reasoning}
            </p>
          </div>

          {/* Sample queries */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "oklch(0.55 0.02 260)" }}>
              Sample Farmer Queries
            </h4>
            <div className="space-y-2">
              {cluster.sample_queries.map((sq, i) => (
                <div
                  key={i}
                  className="rounded-lg p-3 text-sm leading-relaxed italic"
                  style={{
                    background: "var(--color-muted)",
                    color: "oklch(0.7 0.01 260)",
                    borderLeft: `3px solid ${dx.color}`,
                  }}
                >
                  "{sq.query}"
                  <div className="text-[10px] mt-1 not-italic" style={{ color: "oklch(0.48 0.02 260)" }}>
                    {new Date(sq.timestamp).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended action */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "oklch(0.55 0.02 260)" }}>
              <Lightbulb className="w-3.5 h-3.5" style={{ color: "var(--color-accent)" }} />
              Recommended Action
            </h4>
            <div
              className="rounded-lg p-4 text-sm leading-relaxed"
              style={{
                background: "oklch(0.6658 0.1574 58.32 / 0.08)",
                border: "1px solid oklch(0.6658 0.1574 58.32 / 0.2)",
                color: "var(--color-foreground)",
              }}
            >
              {cluster.recommended_action}
            </div>
          </div>

          {/* Footer */}
          <div className="text-[10px] pt-2" style={{ color: "oklch(0.42 0.02 260)" }}>
            Cluster created {new Date(cluster.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
      </div>
    </>
  );
}
