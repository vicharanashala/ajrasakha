import { Badge } from "@/components/atoms/badge";
import type { ReviewRow } from "./reviewLevel.coloumn";
import { truncate } from "../../helper";
import { renderLevelBadge } from "./RenderLevelBadge";
import { RotateCcw } from "lucide-react";

type Props = {
  row: ReviewRow;
  index: number;
  onViewMore: (id: string) => void;
  sort: string;
  onSort: (key:string)=> void;
};

export function ReviewLevelMobileCard({ row, index, onViewMore,sort,onSort }: Props) {
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

      {sort && (
        <div className="flex justify-end">
        <button
          onClick={() => onSort("clearSort")}
          className="ml-2 p-1 rounded-md text-xs bg-primary text-white hover:text-black"
        >
          <RotateCcw size={14} />
        </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex justify-between text-xs border rounded px-2 py-1"
          >
            <button
              onClick={() => onSort(`level_${i}`)}
              className="flex items-center gap-1 cursor-pointer"
            >
              <span>Level {i === 0 ? "Author" : i}</span>
              {sort === `level_${i}___asc` && (
                <span className="text-md text-green-500">↑</span>
              )}
              {sort === `level_${i}___desc` && (
                <span className="text-md text-green-500">↓</span>
              )}
            </button>

            {renderLevelBadge(row, i)}
          </div>
        ))}
      </div>
    </div>
  );
}
