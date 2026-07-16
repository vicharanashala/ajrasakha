import { useEffect, useState } from "react";
import { Counter } from "../components/Counter";
import { SectionHead } from "../components/SectionHead";
import { useCountUp, useInView } from "../utils";

/** A headline figure. `value` is free text — numeric strings animate, others render as-is. */
export interface StatCell {
  label: string;
  value: string;
}

/**
 * Layer 01 — the national snapshot: headline claim, coverage score, and the headline
 * figure grid. Every number in the grid comes from the parent (live DB figures first,
 * then admin-edited stats), so this component holds no data of its own.
 */
export const HeroSnapshot = ({ stats }: { stats: StatCell[] }) => {
  const { value: cov, ref } = useCountUp(72.4);
  const [barW, setBarW] = useState(0);
  const { ref: gridRef, inView: gridInView } = useInView(0.15);

  useEffect(() => {
    const t = setTimeout(() => setBarW(72.4), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="hero wrap" id="layer1">
      <SectionHead num="LAYER 01" title="National Mission Snapshot" />
      <div className="hero-top">
        <div>
          <h1>
            India's Agricultural
            <br />
            Intelligence Infrastructure.
          </h1>
          <p className="lede">
            A real-time, public record of how ANNAM.AI is building validated agricultural
            knowledge, a distributed expert network, and AI-powered advisory reach across
            every state, district and village in India.
          </p>
        </div>
        <div className="coverage-score">
          <div className="num">
            <span ref={ref}>{cov.toFixed(1)}</span>%
          </div>
          <div className="label">National Knowledge Coverage</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${barW}%` }} />
          </div>
        </div>
      </div>
      {/* anim-ready triggers staggered scaleIn on each stat-cell */}
      <div ref={gridRef} className={gridInView ? "anim-ready" : ""}>
        <StatGrid stats={stats} />
      </div>
    </section>
  );
};

const StatGrid = ({ stats }: { stats: StatCell[] }) => (
  <div className="stat-grid">
    {stats.map((s) => {
      const n = Number(String(s.value).replace(/,/g, ""));
      const isNumeric = String(s.value).trim() !== "" && Number.isFinite(n);
      return (
        <div className="stat-cell" key={s.label}>
          <div className="val">
            {isNumeric ? <Counter value={n} /> : <span className="mono">{s.value}</span>}
          </div>
          <div className="lab">{s.label}</div>
        </div>
      );
    })}
  </div>
);
