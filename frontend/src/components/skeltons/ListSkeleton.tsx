import { Skeleton } from "../atoms/skeleton";

type ListSkeletonProps = {
  items?: number;
};

function ListSkeleton({ items = 4 }: ListSkeletonProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-8 w-16 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
}

export { ListSkeleton };
