import { useEffect, useRef, useState } from "react";

/** Indian-grouped integer formatting (1,28,450) — the authentic register for a GoI page. */
export const formatIndian = (n: number): string =>
  new Intl.NumberFormat("en-IN").format(Math.round(n));

/**
 * Highlights the nav link for whichever section currently dominates the viewport.
 * Returns the id of that section.
 */
export function useScrollSpy(ids: string[], initial = ids[0] ?? "") {
  const [active, setActive] = useState(initial);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  return active;
}

/**
 * Subtle one-shot count-up. Runs when the element scrolls into view, eases out over
 * ~900ms, and respects prefers-reduced-motion (jumps straight to the value).
 * Intentionally restrained — no looping or bouncing.
 *
 * A new `target` re-arms the animation. This matters for live figures: a cell mounts with
 * 0 (the query is still in flight) and only later receives the real number — without the
 * re-arm it would animate 0 → 0 and stay stuck there.
 */
export function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    started.current = false;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setValue(target);
      return;
    }

    let frame = 0;

    const run = () => {
      if (started.current) return;
      started.current = true;
      const from = value;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        setValue(from + (target - from) * eased);
        if (t < 1) frame = requestAnimationFrame(tick);
        else setValue(target);
      };
      frame = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && run()),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
    // `value` is the animation's starting point, read once when the target changes —
    // depending on it would restart the count-up on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return { value, ref };
}
