import { cn } from "@/lib/utils";

/** Small "New" pill used to highlight recently added features. */
export const NewBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex h-4 items-center rounded-full bg-red-500 px-1.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-white shadow-sm",
      className,
    )}
  >
    New
  </span>
);
