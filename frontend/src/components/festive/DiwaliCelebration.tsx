import { useEffect, useState, type CSSProperties } from "react";
import { toLocalDateKey } from "@/config/festive-season";
import { useFestiveSeason } from "@/hooks/ui/useFestiveSeason";
import { useFestiveThemeStore } from "@/stores/festive-theme-store";
import { prefersReducedMotion } from "./motion";

const LIGHT_COUNT = 18;
// Longest base delay + random delay + longest rise, with a little headroom.
const CELEBRATION_DURATION_MS = 7000;

interface RisingLight {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  drift: number;
}

type RisingLightStyle = CSSProperties & { "--diwali-drift": string };

// Spreads the lights evenly across the screen with a little randomness.
function createRisingLights(): RisingLight[] {
  return Array.from({ length: LIGHT_COUNT }, (_, index) => ({
    id: index,
    left: ((index + 0.5) / LIGHT_COUNT) * 100 + (Math.random() - 0.5) * 4,
    delay: 0.6 + Math.random() * 1.5,
    duration: 3 + Math.random() * 1.5,
    size: 6 + Math.random() * 8,
    drift: (Math.random() - 0.5) * 40,
  }));
}

// Plays a brief rise of diya lights once per day during the festive season.
// It sits below dialogs, ignores all pointer input and removes itself when done.
export function DiwaliCelebration() {
  const { season, decorationsEnabled } = useFestiveSeason();
  const [lights, setLights] = useState<RisingLight[] | null>(null);

  useEffect(() => {
    if (!season || !decorationsEnabled || prefersReducedMotion()) return;

    // Read the store directly so marking today does not re-run this effect.
    const { lastCelebratedOn, markCelebrated } = useFestiveThemeStore.getState();
    const today = toLocalDateKey(new Date());
    if (lastCelebratedOn === today) return;

    markCelebrated(today);
    setLights(createRisingLights());
  }, [season, decorationsEnabled]);

  useEffect(() => {
    if (!lights) return;
    const timer = window.setTimeout(() => setLights(null), CELEBRATION_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [lights]);

  if (!lights || !decorationsEnabled) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {lights.map((light) => {
        const style: RisingLightStyle = {
          left: `${light.left}%`,
          width: light.size,
          height: light.size,
          animationDelay: `${light.delay}s`,
          animationDuration: `${light.duration}s`,
          "--diwali-drift": `${light.drift}px`,
        };
        return <span key={light.id} className="diwali-rising-light" style={style} />;
      })}
    </div>
  );
}
