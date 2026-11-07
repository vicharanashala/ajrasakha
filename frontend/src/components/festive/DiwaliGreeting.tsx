import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { Switch } from "@/components/atoms/switch";
import { Label } from "@/components/atoms/label";
import { useFestiveSeason } from "@/hooks/ui/useFestiveSeason";
import { useFestiveThemeStore } from "@/stores/festive-theme-store";
import { cn } from "@/lib/utils";
import { DiyaIcon } from "./DiyaIcon";
import { DiwaliGreetingCard } from "./DiwaliGreetingCard";

// Header greeting chip for the festive season. Opens a card with a switch to turn
// decorations off, and shows an unread dot until the card is first opened.
export function DiwaliGreeting({ className }: { className?: string }) {
  const switchId = useId();
  const { season, decorationsEnabled, setDecorationsEnabled } = useFestiveSeason();
  const greetingSeenSeasonId = useFestiveThemeStore((state) => state.greetingSeenSeasonId);
  const markGreetingSeen = useFestiveThemeStore((state) => state.markGreetingSeen);

  if (!season) return null;
  const hasSeenGreeting = greetingSeenSeasonId === season.id;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="h-7 w-px bg-gradient-to-b from-transparent via-diwali-gold/70 to-transparent"
      />
      <Popover onOpenChange={(open) => open && markGreetingSeen(season.id)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Open ${season.name} greeting`}
            title={`Open ${season.name} greeting`}
            className={cn(
              "group relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border pl-2 pr-2.5",
              "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              // Prominent chip until first opened, then it settles into a quiet header element.
              hasSeenGreeting
                ? "border-transparent hover:bg-diwali-gold/10 data-[state=open]:bg-diwali-gold/10"
                : [
                    "border-diwali-gold/35 bg-diwali-gold/5 shadow-sm",
                    "hover:-translate-y-px hover:border-diwali-gold/70 hover:bg-diwali-gold/15 hover:shadow-md",
                    "active:translate-y-0 data-[state=open]:border-diwali-gold/70 data-[state=open]:bg-diwali-gold/15",
                  ],
            )}
          >
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
            {/* Chevron and unread dot invite the first click, then step aside. */}
            {!hasSeenGreeting && (
              <ChevronDown
                aria-hidden="true"
                className="h-3.5 w-3.5 text-diwali-ink/70 transition-transform duration-200 group-hover:text-diwali-ink group-data-[state=open]:rotate-180"
              />
            )}
            {!hasSeenGreeting && (
              <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-diwali-marigold opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-background bg-diwali-marigold" />
              </span>
            )}
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
    </span>
  );
}
