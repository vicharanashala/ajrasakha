import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardBlock } from "@/hooks/services/dashboardContentService";
import type { RoleCount } from "@/hooks/services/publicStatsService";
import { SectionHead } from "../components/SectionHead";
import { HumanNetwork } from "./HumanNetwork";

const INTERVAL = 6000;

/**
 * The 60-second overview (left) beside the Human Intelligence Network (right), each taking
 * half the width.
 *
 * The overview blocks — what ACE is, why it matters, how large, coverage, technology,
 * impact, what's next — are shown one at a time in an auto-advancing carousel rather than a
 * wall of cards, so a visitor reads them in sequence. Blocks come from the parent (live
 * admin content, else the seed defaults).
 */
export const NarrativeSection = ({
  blocks,
  roles,
}: {
  blocks: DashboardBlock[];
  roles?: RoleCount[];
}) => {
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const count = blocks.length;

  const go = useCallback(
    (next: number) => setIndex((next + count) % count),
    [count],
  );

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % count);
    }, INTERVAL);
    return () => clearInterval(id);
  }, [count]);

  // Guard against an admin saving fewer blocks while a later one is showing.
  const active = blocks[Math.min(index, Math.max(count - 1, 0))];

  return (
    <section className="wrap" id="about">
      <div className="overview-split">
        {/* ── Left 50%: the 60-second overview, as a carousel ── */}
        <div className="overview-left">
          <SectionHead title="Understand ACE in 60 seconds" />
          <p className="sec-desc">
            What ACE is, why it matters, how large the mission is, and the impact so far.
          </p>

          <div
            className="ace-narrative"
            onMouseEnter={() => (paused.current = true)}
            onMouseLeave={() => (paused.current = false)}
            aria-roledescription="carousel"
          >
            {active && (
              // key on the block id so React remounts it — that restarts the CSS entrance
              // animation on every slide change.
              <div className="ace-narrative-slide" key={active.id}>
                <h3>{active.heading}</h3>
                {active.body && <p>{active.body}</p>}
                {active.figures?.length > 0 && (
                  <div className="narrative-figs">
                    {active.figures.map((f, i) => (
                      <div className="nf" key={i} style={{ animationDelay: `${i * 90}ms` }}>
                        <div className="v">{f.value}</div>
                        <div className="l">{f.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {count > 1 && (
              <div className="ace-narrative-nav">
                <button
                  className="ace-narrative-arrow"
                  onClick={() => go(index - 1)}
                  aria-label="Previous"
                >
                  ‹
                </button>

                <div className="ace-narrative-dots">
                  {blocks.map((b, i) => (
                    <button
                      key={b.id}
                      className={`dot${i === index ? " active" : ""}`}
                      onClick={() => setIndex(i)}
                      aria-label={`Go to ${b.heading}`}
                      aria-current={i === index}
                    />
                  ))}
                </div>

                <button
                  className="ace-narrative-arrow"
                  onClick={() => go(index + 1)}
                  aria-label="Next"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right 50%: the expert network ── */}
        <HumanNetwork roles={roles} />
      </div>
    </section>
  );
};
