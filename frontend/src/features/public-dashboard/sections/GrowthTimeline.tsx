import { GrowthLine } from "../components/charts";
import { SectionHead } from "../components/SectionHead";

/** Cumulative growth of questions, experts, states and integrations since inception. */
export const GrowthTimeline = () => (
  <section className="wrap" id="timeline">
    <SectionHead num="TRAJECTORY" title="Knowledge Growth Timeline" />
    <p className="sec-desc">
      Cumulative growth of questions, experts, states and integrations since programme
      inception.
    </p>
    <div className="chart-box">
      <GrowthLine />
    </div>
  </section>
);
