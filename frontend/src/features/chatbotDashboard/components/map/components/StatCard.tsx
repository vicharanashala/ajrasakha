/* ============================================================
   STAT CARD - Reusable statistics display card
============================================================ */

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

export function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent/40">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="mt-1 text-xl font-semibold text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}