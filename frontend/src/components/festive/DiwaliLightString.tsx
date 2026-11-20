import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useFestiveSeason } from "@/hooks/ui/useFestiveSeason";
import { playGarlandWave } from "./garlandWave";
import { prefersReducedMotion } from "./motion";

const BULB_SPACING_PX = 52;
const BULB_TONES = ["gold", "marigold", "ruby"] as const;

type BulbStyle = CSSProperties & { "--i": number };

// Fits as many evenly spaced bulbs as the available width allows.
function bulbCountFor(width: number): number {
  return Math.max(4, Math.round(width / BULB_SPACING_PX));
}

// Hanging garland of glass bulbs that sway in 3D below the nearest positioned parent.
// Hovering a bulb sends a ripple through its neighbours. Only the bulbs react to the
// pointer; the rest of the strip lets clicks through.
export function DiwaliLightString() {
  const { decorationsEnabled } = useFestiveSeason();
  const containerRef = useRef<HTMLDivElement>(null);
  const [bulbCount, setBulbCount] = useState(() => bulbCountFor(window.innerWidth));
  const lastWaveStartedAt = useRef<number[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setBulbCount(bulbCountFor(entry.contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [decorationsEnabled]);

  // Delegated from the garland so one handler serves every bulb. The wave starts at
  // the bulb under the cursor's x position, which stays correct while bulbs swing.
  const handlePointerOver = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    const isBulb = event.target instanceof Element && event.target.closest(".diwali-bulb");
    if (!container || !isBulb || prefersReducedMotion()) return;

    const bulbs = container.querySelectorAll<HTMLElement>(".diwali-bulb");
    const rect = container.getBoundingClientRect();
    const segmentWidth = rect.width / bulbs.length;
    const origin = Math.min(
      bulbs.length - 1,
      Math.max(0, Math.floor((event.clientX - rect.left) / segmentWidth)),
    );
    playGarlandWave(bulbs, origin, lastWaveStartedAt.current);
  }, []);

  if (!decorationsEnabled) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="diwali-garland"
      onPointerOver={handlePointerOver}
    >
      {Array.from({ length: bulbCount }, (_, index) => {
        const style: BulbStyle = { "--i": index };
        return (
          <span key={index} className="diwali-garland-segment">
            <svg className="diwali-garland-wire" viewBox="0 0 100 10" preserveAspectRatio="none">
              <path d="M0 0.5Q50 9.5 100 0.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="diwali-bulb" style={style}>
              <span className="diwali-bulb-body">
                <span className="diwali-bulb-cap" />
                <span className="diwali-bulb-glass" data-tone={BULB_TONES[index % BULB_TONES.length]} />
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
