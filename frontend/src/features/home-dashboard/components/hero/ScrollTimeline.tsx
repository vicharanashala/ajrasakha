import React, {
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { ScrollProgressContext } from './ScrollContext';

gsap.registerPlugin(ScrollTrigger);

/**
 * Extra scroll distance beyond 1 viewport.
 * 4 chapters × ~75vh each = 300vh extra, so total = 400vh travel.
 */
const PIN_EXTRA = '300vh';

/** Map 0-1 progress to a chapter 1-4 */
const BREAKPOINTS = [0, 0.25, 0.55, 0.80];

function getChapter(p: number): number {
  let ch = 1;
  for (let i = 0; i < BREAKPOINTS.length; i++) {
    if (p >= BREAKPOINTS[i]) ch = i + 1;
  }
  return ch;
}

interface ScrollTimelineProps {
  children: ReactNode;
}

const ScrollTimeline: React.FC<ScrollTimelineProps> = ({ children }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [contextValue, setContextValue] = useState({ progress: 0, chapter: 1 });

  useEffect(() => {
    // ── Lenis smooth scroll ──────────────────────────────────────────────
    const lenis = new Lenis({
      lerp: 0.08,
    });

    const onRaf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(onRaf);
    gsap.ticker.lagSmoothing(0);

    // ── GSAP ScrollTrigger pin ───────────────────────────────────────────
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return () => { lenis.destroy(); gsap.ticker.remove(onRaf); };
    }

    const st = ScrollTrigger.create({
      trigger: wrapper,
      start: 'top top',
      end: `+=${PIN_EXTRA}`,
      pin: true,
      pinSpacing: true,
      scrub: 0.6,
      onUpdate(self) {
        const p = self.progress;
        const ch = getChapter(p);
        setContextValue((prev) => {
          if (prev.chapter === ch && Math.abs(prev.progress - p) < 0.002) return prev;
          return { progress: p, chapter: ch };
        });
      },
    });

    // Allow layout to settle before computing scroll positions
    const t = setTimeout(() => ScrollTrigger.refresh(), 400);

    return () => {
      clearTimeout(t);
      st.kill();
      lenis.destroy();
      gsap.ticker.remove(onRaf);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="hc-scroll-wrapper">
      <div className="hc-sticky-inner">
        <ScrollProgressContext.Provider value={contextValue}>
          {children}
        </ScrollProgressContext.Provider>
      </div>
    </div>
  );
};

export default ScrollTimeline;
