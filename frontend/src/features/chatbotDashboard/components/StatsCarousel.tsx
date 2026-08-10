// ─── Reusable stats-row carousel ─────────────────────────────────────────────
// Lays out a row of KPI/stat cards where only the first 3 are shown at their
// normal (unshrunk) width — same sizing as the `grid grid-cols-1
// lg:grid-cols-3` row this replaces. Any cards beyond the first 3 are reached
// by horizontal swipe/drag (native scroll + snap) or via the prev/next arrow
// buttons; nothing is resized to force extra cards into the same row.
import { Children, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type StatsCarouselProps = {
  children: ReactNode;
  className?: string;
};

export function StatsCarousel({ children, className }: StatsCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScrollPrev(track.scrollLeft > 4);
    setCanScrollNext(
      track.scrollLeft + track.clientWidth < track.scrollWidth - 4,
    );
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState, items.length]);

  const scrollByCard = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[0] as HTMLElement | undefined;
    const step = (card?.offsetWidth ?? track.clientWidth / 3) + 24; // card width + gap-6
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  }, []);

  if (items.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      {items.length > 3 && (
        <div className="mb-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            aria-label="Show previous card"
            onClick={() => scrollByCard(-1)}
            disabled={!canScrollPrev}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Show next card"
            onClick={() => scrollByCard(1)}
            disabled={!canScrollNext}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        ref={trackRef}
        onScroll={updateScrollState}
        className="flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((child, index) => (
          <div
            key={index}
            className="flex w-full shrink-0 snap-start lg:w-[calc(33.333%-1rem)]"
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
