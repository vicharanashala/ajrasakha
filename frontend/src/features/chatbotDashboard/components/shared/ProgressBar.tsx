interface ProgressBarProps {
  label: string;
  pct: number;
  color: string;
  valueColor?: string;
  value?: string;
}

export function ProgressBar({ label, pct, color, valueColor, value }: ProgressBarProps) {
  return (
    <div className="mb-[10px]">
      <div className="flex justify-between text-[11px] text-[var(--muted-foreground)] mb-1">
        <span>{label}</span>
        <span style={{ color: valueColor || "var(--muted-foreground)", fontWeight: valueColor ? 500 : 400 }}>{value || `${pct}%`}</span>
      </div>
      <div className="h-[5px] bg-[var(--muted)] rounded-[4px] overflow-hidden">
        <div className="h-full rounded-[4px] transition-[width] duration-[600ms] ease-in-out" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
