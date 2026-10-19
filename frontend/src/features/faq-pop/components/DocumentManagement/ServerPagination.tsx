// @ts-nocheck
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ServerPagination({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <span className="text-[11px] text-muted-foreground">
        {total === 0 ? "No results" : `${rangeStart}–${rangeEnd} of ${total}`}
        {totalPages > 1 && ` · page ${page} of ${totalPages}`}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors cursor-pointer
            ${hasPrev
              ? "border-border text-foreground hover:bg-accent"
              : "border-border/40 text-muted-foreground/30 cursor-not-allowed"}`}
          onClick={() => hasPrev && onPageChange(page - 1)}
          disabled={!hasPrev}
        >
          <ChevronLeft size={12} /> Prev
        </button>
        <button
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors cursor-pointer
            ${hasNext
              ? "border-border text-foreground hover:bg-accent"
              : "border-border/40 text-muted-foreground/30 cursor-not-allowed"}`}
          onClick={() => hasNext && onPageChange(page + 1)}
          disabled={!hasNext}
        >
          Next <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
