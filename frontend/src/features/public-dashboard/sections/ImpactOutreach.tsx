import { DistributionDoughnut } from "../components/charts";
import { MiniCounter } from "../components/MiniMetric";
import { SectionHead } from "../components/SectionHead";
import { cropColors } from "../data/dashboardData";
import { useInView } from "../utils";

/**
 * Layer 06 — ground impact. The domain and crop doughnuts are fed from the parent (the live
 * breakdowns out of the questions collection); the outreach counters are still demo data.
 */
export const ImpactOutreach = ({
  domainData,
  cropData,
}: {
  domainData: { label: string; value: number }[];
  cropData: { label: string; value: number }[];
}) => {
  const { ref: outreachRef, inView: outreachInView } = useInView(0.15);
  const { ref: donutRef, inView: donutInView } = useInView(0.15);
  const { ref: cropRef, inView: cropInView } = useInView(0.15);

  return (
    <section className="wrap" id="layer6">
      <SectionHead title="Impact & Outreach" />
      <p className="sec-desc">
        Ground activity from the Punjab outreach programme, weekly Farmer Friday artefacts,
        and the domain distribution of every question collected.
      </p>
      <div ref={outreachRef} className="two-col" style={{ marginBottom: 28 }}>
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
      {/* Donuts only render (and Recharts animates them) once in view */}
      <div ref={donutRef} className={`chart-box chart-box-anim${donutInView ? " in-view" : ""}`}>
        <h4 style={{ fontSize: 16, marginBottom: 10 }}>Domains of Questions</h4>
        {donutInView && <DistributionDoughnut data={domainData} />}
      </div>

      <div
        ref={cropRef}
        className={`chart-box chart-box-anim${cropInView ? " in-view" : ""}`}
        style={{ marginTop: 20 }}
      >
        <h4 style={{ fontSize: 16, marginBottom: 10 }}>Crops of Questions</h4>
        {cropInView && <DistributionDoughnut data={cropData} colors={cropColors} />}
      </div>
    </section>
  );
};
