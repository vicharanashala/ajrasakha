import { useCallback, useEffect, useRef, useState } from "react";
import { toLocalDateKey } from "@/config/festive-season";
import { useDiwaliTheme } from "@/hooks/ui/useDiwaliTheme";
import { useFestiveSeason } from "@/hooks/ui/useFestiveSeason";
import { useFestiveThemeStore } from "@/stores/festive-theme-store";
import { createFireworksEngine } from "./fireworks";
import { prefersReducedMotion } from "./motion";

/** Five regular bursts before the finale. */
const BURST_DELAYS_MS = [400, 1200, 2000, 3200, 4300];
/** The bigger finale rocket launches here. */
const FINALE_DELAY_MS = 5600;
/** Finale rise plus time for its sparks to fade out. */
const SHOW_DURATION_MS = 9500;
const FINALE_HEIGHT_RATIO = 0.32;

// Picks a burst position in the upper part of the screen, away from the edges.
function launchAtRandomSpot(launch: (x: number, y: number) => void) {
  const x = window.innerWidth * (0.08 + Math.random() * 0.84);
  const y = window.innerHeight * (0.14 + Math.random() * 0.3);
  launch(x, y);
}

// One short fireworks show on a click-through canvas, ending with a bigger
// finale burst. Calls onFinished when done.
function FireworksShow({ onFinished }: { onFinished: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createFireworksEngine(canvas);
    if (!engine) return;

    const timers = BURST_DELAYS_MS.map((delay) =>
      window.setTimeout(() => launchAtRandomSpot(engine.launch), delay),
    );
    timers.push(
      window.setTimeout(() => {
        engine.launchFinale(window.innerWidth / 2, window.innerHeight * FINALE_HEIGHT_RATIO);
      }, FINALE_DELAY_MS),
    );
    timers.push(window.setTimeout(onFinished, SHOW_DURATION_MS));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      engine.destroy();
    };
  }, [onFinished]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
}

// Extra decoration for the Diwali theme: warm corner glows, plus a fireworks show
// ending in a bigger finale when the theme is applied, and at most once a day after that. Everything ignores
// pointer input and sits below menus and dialogs.
export function DiwaliThemeDecorations() {
  const { decorationsEnabled } = useFestiveSeason();
  const { isDiwaliTheme } = useDiwaliTheme();
  const [isShowPlaying, setIsShowPlaying] = useState(false);
  // Stable so re-renders never restart a show that is already playing.
  const endShow = useCallback(() => setIsShowPlaying(false), []);

  useEffect(() => {
    if (!isDiwaliTheme || !decorationsEnabled || prefersReducedMotion()) return;

    // Read the store directly so marking today does not re-run this effect.
    const { lastFireworksOn, setLastFireworksOn } = useFestiveThemeStore.getState();
    const today = toLocalDateKey(new Date());
    if (lastFireworksOn === today) return;

    setLastFireworksOn(today);
    setIsShowPlaying(true);
  }, [isDiwaliTheme, decorationsEnabled]);

  if (!isDiwaliTheme || !decorationsEnabled) return null;

  return (
    <>
      <div aria-hidden="true" className="diwali-ambience" />
      {isShowPlaying && <FireworksShow onFinished={endShow} />}
    </>
  );
}
