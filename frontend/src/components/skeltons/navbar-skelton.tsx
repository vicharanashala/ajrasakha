import { Skeleton } from "../atoms/skeleton";

export const NavbarSkeleton = () => {
  return (
    <div className="w-full border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-6 w-24" />
      </div>

      <div className="hidden md:flex items-center gap-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-md" />
        ))}
      </div>

      <div className="flex items-center gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-8 rounded-full" />
        ))}
      </div>
    </div>
  );
};
