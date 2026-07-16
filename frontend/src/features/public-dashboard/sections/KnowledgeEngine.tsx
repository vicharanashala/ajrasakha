import { useEffect, useState } from "react";
import { Counter } from "../components/Counter";
import { MiniCounter } from "../components/MiniMetric";
import { SectionHead } from "../components/SectionHead";
import { crops, states } from "../data/dashboardData";
import { useInView } from "../utils";

/** Layer 03 — KCC dataset progress, state maturity and crop saturation. */
export const KnowledgeEngine = () => {
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
      <SectionHead num="LAYER 03" title="Agricultural Knowledge Engine" />
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

      <div className="eyebrow" style={{ marginBottom: 14 }}>
        SATURATED CROPS
      </div>
      {/* Crop cards stagger in when scrolled into view */}
      <div ref={cropsRef} className={`card-grid grid-4 card-grid-anim${cropsInView ? " in-view" : ""}`}>
        {crops.map((c) => (
          <div className="card" key={c.name}>
            <h4>{c.name}</h4>
            <div className="meta">
              {c.qa.toLocaleString("en-IN")} validated QAs · {c.maturity} maturity
            </div>
            <div className="crop-bar-track">
              <div
                className="crop-bar-fill"
                style={{ width: cropsInView ? `${c.pct}%` : "0%" }}
              />
            </div>
            <div className="meta mono" style={{ marginTop: 6 }}>
              {c.pct}% saturated
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
