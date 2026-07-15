import { Skeleton } from "../atoms/skeleton";

function CardSkeleton() {
  return (
    <div className="p-4 rounded-xl border flex flex-col gap-3 w-full">
      <div className="flex justify-between items-start">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-5 rounded-md" />
      </div>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex gap-2 mt-2">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </div>
  );
}

export { CardSkeleton };
