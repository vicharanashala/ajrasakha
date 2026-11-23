import { useDiwaliTheme } from "@/hooks/ui/useDiwaliTheme";
import { useFestiveSeason } from "@/hooks/ui/useFestiveSeason";
import { cn } from "@/lib/utils";
import { DiyaIcon } from "./DiyaIcon";

// Small lit diya resting on the top edge of its positioned parent, such as a
// floating badge. Shown only in the Diwali theme, and it ignores the pointer
// so the parent's clicks and dragging behave exactly as before.
export function DiwaliPerchedDiya({ className }: { className?: string }) {
  const { decorationsEnabled } = useFestiveSeason();
  const { isDiwaliTheme } = useDiwaliTheme();

  if (!isDiwaliTheme || !decorationsEnabled) return null;

  return (
    <DiyaIcon
      className={cn(
        "pointer-events-none absolute -top-[18px] left-1/2 h-7 w-7 -translate-x-1/2 drop-shadow-md",
        className,
      )}
    />
  );
}
