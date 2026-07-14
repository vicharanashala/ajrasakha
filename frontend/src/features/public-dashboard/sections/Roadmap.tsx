import { SectionHead } from "../components/SectionHead";
import { roadmap } from "../data/dashboardData";

/** Modules in development, scheduled for phased rollout. */
export const Roadmap = () => (
  <section className="wrap" id="roadmap">
    <SectionHead num="ROADMAP" title="Coming Soon" />
    <p className="sec-desc">
      Modules currently in development, scheduled for phased public rollout.
    </p>
    <div className="card-grid grid-4">
      {roadmap.map((r) => (
        <div className="card" key={r.name}>
          <h4 style={{ fontSize: 14.5 }}>{r.name}</h4>
          <div className="meta">{r.note}</div>
          <span className="pill soon">Coming soon</span>
        </div>
      ))}
    </div>
  </section>
);
