import { Card } from "./shared/Card";

interface GeoState { abbr: string; val: string; opacity: number; }

export function GeoCard({ states }: { states: GeoState[] }) {
  return (
    <Card title="Geographic concentration" subtitle="Active users by state · darker = higher" action="Full geo view ↗">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 4 }}>
        {states.map(s => (
          <div key={s.abbr} style={{ borderRadius: 5, padding: "8px 6px", textAlign: "center", background: `rgba(30,122,60,${s.opacity})` }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: s.opacity > 0.5 ? "#fff" : "#0e4a22" }}>{s.abbr}</div>
            <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2, color: s.opacity > 0.5 ? "rgba(255,255,255,0.85)" : "#1e7a3c" }}>{s.val}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 12, paddingTop: 10, borderTop: "0.5px solid var(--border)", fontSize: 11, color: "var(--muted-foreground)", flexWrap: "wrap" }}>
        <span>Top district: <strong style={{ color: "var(--card-foreground)" }}>Vidisha, MP</strong></span>
        <span>Fastest growing: <strong style={{ color: "#1E7A3C" }}>MP +62% MoM</strong></span>
        <span>Gap states: <strong style={{ color: "#A32D2D" }}>NE States &lt;200</strong></span>
      </div>
    </Card>
  );
}
