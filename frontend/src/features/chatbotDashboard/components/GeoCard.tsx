import { Card } from "./shared/Card";

interface GeoState { abbr: string; val: string; opacity: number; }

export function GeoCard({ states }: { states: GeoState[] }) {
  return (
    <Card title="Geographic concentration" subtitle="Active users by state · darker = higher" action="Full geo view ↗">
      <div className="grid grid-cols-6 gap-1">
        {states.map(s => (
          <div
            key={s.abbr}
            className="rounded-[5px] px-1.5 py-2 text-center"
            style={{ background: `rgba(30,122,60,${s.opacity})` }}
          >
            <div className={`text-[11px] font-medium ${s.opacity > 0.5 ? "text-white" : "text-[#0e4a22]"}`}>{s.abbr}</div>
            <div className={`text-[10px] opacity-75 mt-0.5 ${s.opacity > 0.5 ? "text-white/85" : "text-[#1e7a3c]"}`}>{s.val}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-3 pt-[10px] border-t border-[var(--border)] text-[11px] text-[var(--muted-foreground)] flex-wrap">
        <span>Top district: <strong className="text-[var(--card-foreground)]">Vidisha, MP</strong></span>
        <span>Fastest growing: <strong className="text-[#1E7A3C]">MP +62% MoM</strong></span>
        <span>Gap states: <strong className="text-[#A32D2D]">NE States &lt;200</strong></span>
      </div>
    </Card>
  );
}
