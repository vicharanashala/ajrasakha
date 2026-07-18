import { useEffect, useState } from "react";
import { Counter } from "../components/Counter";
import { MiniCounter } from "../components/MiniMetric";
import { SectionHead } from "../components/SectionHead";
import { states } from "../data/dashboardData";
import { useInView } from "../utils";
import { Loader2 } from "lucide-react";
import type { SaturatedCropState } from "@/hooks/services/publicStatsService";

interface KnowledgeEngineProps {
  /** Per state, the crops whose question count exceeds the admin's threshold. */
  saturatedCropsByState?: SaturatedCropState[];
  /** The threshold a crop's count must exceed to count as saturated. */
  saturationThreshold?: number;
  /** True while the live stats are still loading — show a spinner instead of "no crops". */
  loading?: boolean;
}

/** Layer 03 — KCC dataset progress, state maturity and crop saturation. */
export const KnowledgeEngine = ({
  saturatedCropsByState = [],
  saturationThreshold,
  loading = false,
}: KnowledgeEngineProps) => {
  const [kccW, setKccW] = useState(0);
  const { ref: kccRef, inView: kccInView } = useInView(0.2);
  const { ref: maturityRef, inView: maturityInView } = useInView(0.2);
  const { ref: cropsRef, inView: cropsInView } = useInView(0.1);

  useEffect(() => {
    if (!kccInView) return;
    const t = setTimeout(() => setKccW((41.2 / 45) * 100), 120);
    return () => clearTimeout(t);
  }, [kccInView]);

  const maturity = [...states].sort((a, b) => b.crops - a.crops).slice(0, 5);

  return (
    <section className="wrap" id="layer3">
      <SectionHead title="Agricultural Knowledge Engine" />
      <p className="sec-desc">
        Crop-wise and state-wise saturation of the golden knowledge base, sourced from
        Kisan Call Centre (KCC) transcripts and expert-validated Q&amp;A pairs.
      </p>
      <div className="kcc-grid">
        {/* KCC progress bar animates in when scrolled into view */}
        <div ref={kccRef} className={`chart-box chart-box-anim${kccInView ? " in-view" : ""}`}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            KCC DATASET ANALYSIS
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 28, fontWeight: 700, color: "var(--navy-deep)" }}>
              <Counter value={41.2} suffix="M" />
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>of 45M record target</span>
          </div>
          <div className="bar-track" style={{ width: "100%" }}>
            <div className="bar-fill" style={{ width: `${kccW}%`, background: "var(--saffron)" }} />
          </div>
          <div className="metric-mini-grid" style={{ marginTop: 22 }}>
            <MiniCounter value={41.2} suffix="M" label="KCC records analysed" />
            <MiniCounter value={18.6} suffix="M" label="Unique questions generated" />
            <MiniCounter value={6.3} suffix="M" label="Rephrased questions" />
            <MiniCounter value={4.1} suffix="M" label="Expert-validated answers" />
          </div>
        </div>

        {/* State maturity bars grow when scrolled into view */}
        <div ref={maturityRef} className={`chart-box chart-box-anim${maturityInView ? " in-view" : ""}`}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            STATE MATURITY (TOP 5)
          </div>
          {maturity.map((st) => {
            const pct = Math.round((st.crops / 32) * 100);
            return (
              <div
                key={st.name}
                style={{ display: "grid", gridTemplateColumns: "110px 1fr 34px", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 12.5 }}
              >
                <span>{st.name}</span>
                <span className="idx-track">
                  <span
                    className="idx-fill"
                    style={{ width: maturityInView ? `${pct}%` : "0%", background: "var(--green)" }}
                  />
                </span>
                <span className="mono">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="eyebrow" style={{ marginBottom: 6 }}>
        SATURATED CROPS BY STATE
      </div>
      <p className="sec-desc" style={{ marginBottom: 14 }}>
        Crops whose validated-question count exceeds
        {typeof saturationThreshold === "number" ? ` ${saturationThreshold.toLocaleString("en-IN")}` : " the"}{" "}
        {typeof saturationThreshold === "number" ? "questions" : "saturation threshold"} in each
        state, ranked by volume.
      </p>
      {loading ? (
        <div className="sat-loading">
          <Loader2 className="sat-spinner" />
          <span>Loading saturated crops…</span>
        </div>
      ) : saturatedCropsByState.length === 0 ? (
        <p className="sec-desc">No crops have crossed the saturation threshold yet.</p>
      ) : (
        <div ref={cropsRef} className={`card-grid grid-4 sat-grid${cropsInView ? " in-view" : ""}`}>
          {saturatedCropsByState.map((st, si) => (
            <SaturatedStateCard
              key={st.state}
              state={st}
              index={si}
              animate={cropsInView}
            />
          ))}
        </div>
      )}
    </section>
  );
};

/** One state's card: shows the top crop, with a "+N" pill that expands the rest. */
const SaturatedStateCard = ({
  state,
  index,
  animate,
}: {
  state: SaturatedCropState;
  index: number;
  animate: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [lead, ...rest] = state.crops;
  const chip = (c: { crop: string; count: number }) => (
    <span className="sat-chip" key={c.crop}>
      <span className="sat-chip-name">{c.crop}</span>
      <span className="sat-chip-count mono">{animate ? <Counter value={c.count} /> : 0}</span>
    </span>
  );

  return (
    <div className="sat-card" style={{ transitionDelay: `${index * 70}ms` }}>
      <div className="sat-card-head">
        <h4>{state.state}</h4>
        <span className="sat-count-badge">
          {state.crops.length} crop{state.crops.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="sat-chips">
        {lead && chip(lead)}
        {rest.length > 0 && (
          <button
            type="button"
            className={`sat-more${expanded ? " open" : ""}`}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Show less" : `+${rest.length}`}
          </button>
        )}
      </div>
      {rest.length > 0 && (
        <div className={`sat-rest${expanded ? " open" : ""}`}>
          <div className="sat-rest-inner sat-chips">{rest.map(chip)}</div>
        </div>
      )}
    </div>
  );
};
