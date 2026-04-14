import { Card } from "./shared/Card";
import { ProgressBar } from "./shared/ProgressBar";

interface QueryCategory { label: string; pct: number; color: string; valueColor?: string; }

export function QueryCategoriesCard({ categories }: { categories: QueryCategory[] }) {
  return (
    <Card title="Query categories" subtitle="This week · all channels" action="See all ↗">
      {categories.map(q => <ProgressBar key={q.label} label={q.label} pct={q.pct} color={q.color} valueColor={q.valueColor} />)}
      <div className="mt-[10px] pt-[10px] border-t border-[var(--border)]">
        <div className="text-[11px] text-[var(--muted-foreground)]">Top unanswered cluster</div>
        <div className="text-[12px] font-medium text-[#A32D2D] mt-0.5">Mandi pricing · 8,400 queries</div>
      </div>
    </Card>
  );
}
