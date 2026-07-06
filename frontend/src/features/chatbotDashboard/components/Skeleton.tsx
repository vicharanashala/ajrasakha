// ─── Shared UI Components ────────────────────────────────────────────────────
import { cn } from "@/lib/utils";
import { Skeleton as BaseSkeleton } from "@/components/atoms/skeleton";

export function LazySectionSkeleton({
  className = "h-[300px]",
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-xl border border-border/60 bg-card/40 p-4",
        className,
      )}
    >
      <BaseSkeleton className="h-full w-full rounded-lg" />
    </div>
  );
}

export default LazySectionSkeleton;