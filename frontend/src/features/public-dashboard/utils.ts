import { useCallback, useEffect, useRef, useState } from "react";

/** Indian-grouped integer formatting (1,28,450) — the authentic register for a GoI page. */
export const formatIndian = (n: number): string =>
  new Intl.NumberFormat("en-IN").format(Math.round(n));

/**
 * Returns `true` once the attached `ref` element scrolls into view (one-shot).
 * Used to gate chart rendering and bar animations until visible.
 */
export function useInView(threshold = 0.2) {
  const [inView, setInView] = useState(false);
  // A callback ref (rather than a static object ref) so the observer re-attaches when the
  // node actually mounts — e.g. a grid that's swapped in only after its data finishes loading.
  const cleanup = useRef<(() => void) | null>(null);

  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      cleanup.current?.();
      cleanup.current = null;
      if (!el) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setInView(true);
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        },
        { threshold },
      );
      io.observe(el);
      cleanup.current = () => io.disconnect();
    },
    [threshold],
  );

  return { ref, inView };
}

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
 * Subtle one-shot count-up. Eases out over ~900ms and respects prefers-reduced-motion
 * (jumps straight to the value). Intentionally restrained — no looping or bouncing.
 *
 * Two triggers, deliberately different:
 *   • First reveal — waits until the element scrolls into view (a nice entrance).
 *   • Every later `target` change — animates IMMEDIATELY, without waiting to be in view.
 *
 * The second is what makes live figures work. Gating every update on the Intersection
 * observer meant a value pushed while the element was off-screen or on an inactive carousel
 * slide stayed stale until the slide was next shown — the number only "caught up" when you
 * moved the carousel. Once revealed, updates now land the moment they arrive.
 */
export function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const revealed = useRef(false); // has this cell animated in at least once?
  const valueRef = useRef(0); // latest displayed value, for animating from on a live update
  valueRef.current = value;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      revealed.current = true;
      setValue(target);
      return;
    }

    let frame = 0;

    const animateTo = () => {
      revealed.current = true;
      const from = valueRef.current;
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

    // Already revealed once → a new target is a live update: animate now, no observer.
    if (revealed.current) {
      animateTo();
      return () => cancelAnimationFrame(frame);
    }

    // First time → reveal on scroll-into-view.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && animateTo()),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
    // `value` is read via valueRef so it isn't a dependency (it would restart every frame).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return { value, ref };
}
