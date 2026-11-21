import type { ReactNode } from "react";
import type { Priority } from "../types";

export function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

/** Stat tile: label · value · optional hint. Value in proportional figures. */
export function KpiTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card min-w-0">
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold leading-tight">{value}</div>
      {hint && <div className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>{hint}</div>}
    </div>
  );
}

const PRIORITY: Record<Priority, { color: string; icon: string }> = {
  CRITICAL: { color: "var(--critical)", icon: "▲" },
  HIGH: { color: "var(--serious)", icon: "▲" },
  MEDIUM: { color: "var(--warning)", icon: "●" },
  LOW: { color: "var(--good)", icon: "●" },
};

/** Status colours always ship with an icon + label, never colour alone. */
export function PriorityBadge({ level }: { level: Priority }) {
  const p = PRIORITY[level];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium">
      <span aria-hidden style={{ color: p.color }}>{p.icon}</span>
      {level.charAt(0) + level.slice(1).toLowerCase()}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm hairline" style={{ color: "var(--ink-2)" }}>
      {children}
    </div>
  );
}

export function LoadState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <Empty>Loading…</Empty>;
  if (error) return <Empty>Could not load: {error}</Empty>;
  return null;
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-xs hairline" style={{ color: "var(--ink-2)" }}>
      {children}
    </span>
  );
}

/** Single-hue sparkline (one series → no legend; the row label names it). */
export function Sparkline({ values, width = 96, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`);
  const last = values.length - 1;
  return (
    <svg width={width} height={height} aria-label={`weekly counts ${values.join(", ")}`}>
      <polyline points={pts.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      <circle cx={last * step} cy={height - 2 - (values[last] / max) * (height - 4)} r={3} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
