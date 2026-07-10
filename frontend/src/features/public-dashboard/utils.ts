import { useEffect, useRef, useState } from "react";

/** Indian-grouped integer formatting (1,28,450) — the authentic register for a GoI page. */
export const formatIndian = (n: number): string =>
  new Intl.NumberFormat("en-IN").format(Math.round(n));

/**
 * Subtle one-shot count-up. Runs once when the element scrolls into view, eases out
 * over ~900ms, and respects prefers-reduced-motion (jumps straight to the value).
 * Intentionally restrained — no looping or bouncing.
 */
export function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setValue(target);
      return;
    }

    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        setValue(target * eased);
        if (t < 1) requestAnimationFrame(tick);
        else setValue(target);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && run()),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, durationMs]);

  return { value, ref };
}
