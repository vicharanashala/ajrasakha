import { Skeleton } from "../atoms/skeleton";

export const DashboardSkelton = () => {
  return (
    <div className="flex flex-col gap-6 p-6 w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 rounded-xl border flex flex-col justify-between gap-3">
          <div className="flex justify-between items-start">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-5 rounded-md" />
          </div>
          <div className="flex flex-col gap-1">
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>

        <div className="p-4 rounded-xl border flex flex-col justify-between gap-3">
          <div className="flex justify-between items-start">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-5 rounded-md" />
          </div>
          <div className="flex flex-col gap-1">
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border flex flex-col gap-4">
        <Skeleton className="h-5 w-64" />
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="p-6 rounded-xl border flex flex-col items-center"
          >
            <Skeleton className="h-5 w-40 mb-6" />
            <div className="w-40 h-40 relative">
              <Skeleton className="w-full h-full rounded-full" />
            </div>
            <div className="flex flex-col gap-2 mt-4 w-full">
              <Skeleton className="h-4 w-2/3 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
