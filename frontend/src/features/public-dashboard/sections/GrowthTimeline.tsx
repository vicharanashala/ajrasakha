import { GrowthLine } from "../components/charts";
import { SectionHead } from "../components/SectionHead";
import { useInView } from "../utils";

/** Cumulative growth of questions, experts, states and integrations since inception. */
export const GrowthTimeline = () => {
  const { ref, inView } = useInView(0.15);

  return (
    <section className="wrap" id="timeline">
      <SectionHead title="Knowledge Growth Timeline" />
      <p className="sec-desc">
        Cumulative growth of questions, experts, states and integrations since programme
        inception.
      </p>
      {/* chart-box-anim fades the container in; rendering GrowthLine only when inView
          ensures Recharts' built-in line draw animation fires on first scroll */}
      <div ref={ref} className={`chart-box chart-box-anim${inView ? " in-view" : ""}`}>
        {inView && <GrowthLine />}
      </div>
    </section>
  );
};
