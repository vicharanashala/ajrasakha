interface ProgressBarProps {
  label: string;
  pct: number;
  color: string;
  valueColor?: string;
  value?: string;
}

export function ProgressBar({ label, pct, color, valueColor, value }: ProgressBarProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: valueColor || "var(--muted-foreground)", fontWeight: valueColor ? 500 : 400 }}>{value || `${pct}%`}</span>
      </div>
      <div style={{ height: 5, background: "var(--muted)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}
