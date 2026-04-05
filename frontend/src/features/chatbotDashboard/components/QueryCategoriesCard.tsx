import { Card } from "./shared/Card";
import { ProgressBar } from "./shared/ProgressBar";

interface QueryCategory { label: string; pct: number; color: string; valueColor?: string; }

export function QueryCategoriesCard({ categories }: { categories: QueryCategory[] }) {
  return (
    <Card title="Query categories" subtitle="This week · all channels" action="See all ↗">
      {categories.map(q => <ProgressBar key={q.label} label={q.label} pct={q.pct} color={q.color} valueColor={q.valueColor} />)}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--border)" }}>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Top unanswered cluster</div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#A32D2D", marginTop: 2 }}>Mandi pricing · 8,400 queries</div>
      </div>
    </Card>
  );
}
