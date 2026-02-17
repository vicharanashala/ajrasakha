import { Badge } from "@/components/atoms/badge";
import type { ReviewRow } from "./reviewLevel.coloumn";
import { truncate } from "../../helper";
import { renderLevelBadge } from "./RenderLevelBadge";

type Props = {
  row: ReviewRow;
  index: number;
  onViewMore: (id: string) => void;
  sort: string;
  onSort: (key: string) => void;
};

const ReviewLevelsCard = ({ row, index, onViewMore, sort, onSort }: Props) => {
  return (
    <div className="group relative rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm transition-all duration-300 hover:shadow-xl hover:border-border hover:-translate-y-0.5">
      <div className="absolute inset-x-0 top-0 h-px" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs font-semibold font-mono tabular-nums">
          {index + 1}
        </span>
        <Badge
          variant="outline"
          className="text-[10px] tracking-widest uppercase font-semibold px-2.5 py-0.5 border-blue-600/30 text-blue-500/70 bg-blue-400/5"
        >
          Review Levels
        </Badge>
      </div>

      {/* Question */}
      <div className="px-5 pb-4">
        <button
          onClick={() => onViewMore(row._id)}
          className="text-left w-full group/title"
        >
          <h3 className="text-base font-semibold leading-snug text-foreground line-clamp-2 group-hover:text-blue-700  transition-colors duration-200">
            {truncate(row.question, 80)}
          </h3>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-border/50" />

      {/* Level Grid */}
      <div className="p-4 grid grid-cols-2 gap-1.5">
        {Array.from({ length: 10 }).map((_, i) => {
          const key = `level_${i}`;
          const isAsc = sort === `${key}___asc`;
          const isDesc = sort === `${key}___desc`;
          const isActive = isAsc || isDesc;

          return (
            <div
              key={i}
              className={`
                flex items-center justify-between rounded-lg px-3 py-2 text-xs
                border transition-all duration-150
                ${
                  isActive
                    ? "border-blue-600/40 bg-blue-500/8 text-foreground"
                    : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:border-border"
                }
              `}
            >
              <button
                onClick={() => onSort(key)}
                className="flex items-center gap-1.5 font-medium cursor-pointer select-none"
              >
                <span className={isActive ? "text-foreground" : ""}>
                  {i === 0 ? "Author" : `Level ${i}`}
                </span>
                <span
                  className={`text-sm leading-none transition-all duration-150 ${
                    isActive ? "text-green-600 opacity-100" : "opacity-0 w-0"
                  }`}
                >
                  {isAsc ? "↑" : isDesc ? "↓" : ""}
                </span>
              </button>

              <span className="shrink-0">{renderLevelBadge(row, i)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReviewLevelsCard;
