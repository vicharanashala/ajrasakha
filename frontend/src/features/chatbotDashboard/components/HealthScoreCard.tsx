import { Card } from "./shared/Card";

interface HealthPillar { label: string; score: number; color: string; }

export function HealthScoreCard({ pillars }: { pillars: HealthPillar[] }) {
  return (
    <Card title="Platform health score" subtitle="Six-pillar composite · weekly">
      <div className="flex justify-end mb-3">
        <div className="text-right">
          <div className="text-[26px] font-medium text-[#1E7A3C] leading-none">70</div>
          <div className="text-[10px] text-[#BA7517] font-medium">MODERATE</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {pillars.map(p => (
          <div key={p.label} className="border border-[var(--border)] rounded-lg p-3 text-center bg-[var(--muted)]">
            <div className={`text-xl font-medium ${p.score >= 75 ? "text-[#1E7A3C]" : "text-[#854F0B]"}`}>{p.score}</div>
            <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{p.label}</div>
            <div className="h-1 rounded-sm bg-[var(--border)] mt-1.5 overflow-hidden">
              <div
                className="h-full rounded-sm transition-[width] duration-[600ms] ease-in-out"
                style={{ width: `${p.score}%`, background: p.color }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="p-[10px] bg-[rgba(239,159,39,0.12)] rounded-lg text-[11px] text-[#854F0B]">
        <span className="font-medium">Action needed:</span> Geo reach + Retention below 65 — assign sprint owners this week
      </div>
    </Card>
  );
}
