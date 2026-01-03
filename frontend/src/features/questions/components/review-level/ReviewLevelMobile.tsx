import { Badge } from "@/components/atoms/badge";
import type { ReviewRow } from "./reviewLevel.coloumn";

type Props = {
  row: ReviewRow;
  index: number;
};

export function ReviewLevelMobileCard({ row, index }: Props) {
  return (
    <div className="rounded-lg border p-4 bg-card shadow-sm text-sm leading-snug">
      <div className="flex justify-between mb-1">
        <span className="text-muted-foreground font-medium">
          #{index + 1}
        </span>

        <Badge variant="outline">Review Levels</Badge>
      </div>

      <p className="font-medium break-words">
        {row.question}
      </p>

      <div className="grid grid-cols-2 gap-2 mt-3">
        {row.levels.map((lvl, i) => (
          <div key={i} className="flex justify-between text-xs border rounded px-2 py-1">
            <span>Level {i + 1}</span>
            <Badge variant="outline">{lvl ?? "-"}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
