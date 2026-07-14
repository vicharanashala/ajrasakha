import { Skeleton } from "../atoms/skeleton";

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
};

function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="w-full border rounded-xl overflow-hidden">
      <div className="grid gap-4 p-4 border-b bg-muted/30" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} className="h-4 w-3/4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={`row-${rowIdx}`}
          className="grid gap-4 p-4 border-b last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton key={`cell-${rowIdx}-${colIdx}`} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export { TableSkeleton };
