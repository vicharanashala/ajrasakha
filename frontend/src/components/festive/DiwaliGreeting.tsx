import { useId } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { Switch } from "@/components/atoms/switch";
import { Label } from "@/components/atoms/label";
import { useFestiveSeason } from "@/hooks/ui/useFestiveSeason";
import { cn } from "@/lib/utils";
import { DiyaIcon } from "./DiyaIcon";
import { DiwaliGreetingCard } from "./DiwaliGreetingCard";

// Header greeting for the festive season, with a switch to turn decorations off.
export function DiwaliGreeting({ className }: { className?: string }) {
  const switchId = useId();
  const { season, decorationsEnabled, setDecorationsEnabled } = useFestiveSeason();

  if (!season) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${season.name} greetings`}
          className={cn(
            "group inline-flex h-10 items-center gap-2 rounded-lg pl-1 pr-2 transition-colors",
            "hover:bg-diwali-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <span
            aria-hidden="true"
            className="h-7 w-px bg-gradient-to-b from-transparent via-diwali-gold/70 to-transparent"
          />
          <DiyaIcon
            className="h-6 w-6 transition-transform duration-300 group-hover:-translate-y-0.5"
            animated={decorationsEnabled}
          />
          <span className="hidden xl:flex flex-col items-start leading-none">
            <span
              className={cn(
                "font-['Newsreader',serif] text-[15px] font-medium italic text-diwali-ink",
                decorationsEnabled && "diwali-shimmer-text",
              )}
            >
              Happy {season.name}
            </span>
            <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Festival of Lights
            </span>
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-80 overflow-hidden rounded-xl border-diwali-gold/30 p-0 font-['Manrope',sans-serif] shadow-xl"
      >
        <DiwaliGreetingCard seasonName={season.name} animated={decorationsEnabled} />

        <div className="flex items-center justify-between gap-3 border-t border-diwali-gold/20 bg-diwali-gold/5 px-5 py-3">
          <Label htmlFor={switchId} className="text-xs font-medium text-foreground/80">
            Show festive lights
          </Label>
          <Switch
            id={switchId}
            checked={decorationsEnabled}
            onCheckedChange={setDecorationsEnabled}
            className="data-[state=checked]:bg-diwali-marigold data-[state=checked]:border-diwali-marigold"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
