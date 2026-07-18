import { MiniCounter } from "../components/MiniMetric";
import { SectionHead } from "../components/SectionHead";
import { useInView } from "../utils";

/**
 * Layer 06 — ground impact. The crop/domain distribution doughnuts moved up to
 * CoverageOverview; this section is now the outreach programme figures.
 */
export const ImpactOutreach = () => {
  const { ref: outreachRef, inView: outreachInView } = useInView(0.15);

  return (
    <section className="wrap" id="layer6">
      <SectionHead title="Impact & Outreach" />
      <p className="sec-desc">
        Ground activity from the Punjab outreach programme and weekly Farmer Friday artefacts.
      </p>
      <div ref={outreachRef} className="two-col">
        <div className={`chart-box chart-box-anim${outreachInView ? " in-view" : ""}`}>
          <h4 style={{ fontSize: 16, marginBottom: 6 }}>Punjab Outreach</h4>
          <div className="metric-mini-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
            <MiniCounter value={214} label="Villages visited" />
            <MiniCounter value={58600} label="Farmers reached" />
            <MiniCounter value={112000} label="Queries collected" />
            <MiniCounter value={340} label="Demonstrations conducted" />
          </div>
        </div>
        <div className={`chart-box chart-box-anim${outreachInView ? " in-view" : ""}`} style={{ transitionDelay: "0.12s" }}>
          <h4 style={{ fontSize: 16, marginBottom: 14 }}>Farmer Friday</h4>
          <div className="metric-mini-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <MiniCounter value={46} label="Weekly artefacts published" />
            <MiniCounter value={128} label="Success stories" />
            <MiniCounter value={89} label="Field videos" />
            <MiniCounter value={312} label="Farmer interactions" />
          </div>
        </div>
      </div>
    </section>
  );
};
