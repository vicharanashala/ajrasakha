import { Card } from "./shared/Card";

interface HealthPillar { label: string; score: number; color: string; }

export function HealthScoreCard({ pillars }: { pillars: HealthPillar[] }) {
  return (
    <Card title="Platform health score" subtitle="Six-pillar composite · weekly">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 500, color: "#1E7A3C", lineHeight: 1 }}>70</div>
          <div style={{ fontSize: 10, color: "#BA7517", fontWeight: 500 }}>MODERATE</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        {pillars.map(p => (
          <div key={p.label} style={{ border: "0.5px solid var(--border)", borderRadius: 8, padding: 12, textAlign: "center", background: "var(--muted)" }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: p.score >= 75 ? "#1E7A3C" : "#854F0B" }}>{p.score}</div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{p.label}</div>
            <div style={{ height: 4, borderRadius: 2, background: "var(--border)", marginTop: 6, overflow: "hidden" }}>
              <div style={{ width: `${p.score}%`, height: "100%", background: p.color, borderRadius: 2, transition: "width 0.6s ease" }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 10, background: "rgba(239,159,39,0.12)", borderRadius: 8, fontSize: 11, color: "#854F0B" }}>
        <span style={{ fontWeight: 500 }}>Action needed:</span> Geo reach + Retention below 65 — assign sprint owners this week
      </div>
    </Card>
  );
}
