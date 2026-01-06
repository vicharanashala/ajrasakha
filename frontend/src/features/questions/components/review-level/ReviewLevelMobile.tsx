import { Badge } from "@/components/atoms/badge";
import type { ReviewRow } from "./reviewLevel.coloumn";
import { truncate } from "../../helper";
import { renderLevelBadge } from "./RenderLevelBadge";

type Props = {
  row: ReviewRow;
  index: number;
  onViewMore: (id: string) => void;
};

export function ReviewLevelMobileCard({ row, index, onViewMore }: Props) {
  return (
    <div className="rounded-xl border border-foreground/20 bg-card shadow-sm p-4">
      <div className="flex justify-between mb-1">
        <span className="text-muted-foreground font-medium">#{index + 1}</span>

        <Badge variant="outline">Review Levels</Badge>
      </div>

      <p
        className="font-medium break-words hover:underline cursor-pointer"
        onClick={() => onViewMore(row._id)}
      >
        {truncate(row.question, 80)}
      </p>

      <div className="grid grid-cols-2 gap-2 mt-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex justify-between text-xs border rounded px-2 py-1"
          >
            <span>Level {i === 0 ? "Author" : i}</span>

            {renderLevelBadge(row, i)}
          </div>
        ))}
      </div>
    </div>
  );
}
