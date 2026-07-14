import { DomainDoughnut } from "../components/charts";
import { MiniCounter } from "../components/MiniMetric";
import { SectionHead } from "../components/SectionHead";

/**
 * Layer 06 — ground impact. The domain doughnut is fed from the parent (the live domain
 * breakdown out of the questions collection); the outreach counters are still demo data.
 */
export const ImpactOutreach = ({
  domainData,
}: {
  domainData: { label: string; value: number }[];
}) => (
  <section className="wrap" id="layer6">
    <SectionHead num="LAYER 06" title="Impact & Outreach" />
    <p className="sec-desc">
      Ground activity from the Punjab outreach programme, weekly Farmer Friday artefacts,
      and the domain distribution of every question collected.
    </p>
    <div className="two-col" style={{ marginBottom: 28 }}>
      <div className="chart-box">
        <h4 style={{ fontSize: 16, marginBottom: 6 }}>Punjab Outreach</h4>
        <div className="metric-mini-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
          <MiniCounter value={214} label="Villages visited" />
          <MiniCounter value={58600} label="Farmers reached" />
          <MiniCounter value={112000} label="Queries collected" />
          <MiniCounter value={340} label="Demonstrations conducted" />
        </div>
      </div>
      <div className="chart-box">
        <h4 style={{ fontSize: 16, marginBottom: 14 }}>Farmer Friday</h4>
        <div className="metric-mini-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <MiniCounter value={46} label="Weekly artefacts published" />
          <MiniCounter value={128} label="Success stories" />
          <MiniCounter value={89} label="Field videos" />
          <MiniCounter value={312} label="Farmer interactions" />
        </div>
      </div>
    </div>
    <div className="chart-box">
      <h4 style={{ fontSize: 16, marginBottom: 10 }}>Domains of Questions</h4>
      <DomainDoughnut data={domainData} />
    </div>
  </section>
);
