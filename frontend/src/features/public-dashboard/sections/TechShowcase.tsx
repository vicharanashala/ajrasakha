import { SectionHead } from "../components/SectionHead";
import { techs } from "../data/dashboardData";

/** The AI stack currently deployed in production. */
export const TechShowcase = () => (
  <section className="wrap" id="tech">
    <SectionHead num="SYSTEM" title="Technology Showcase" />
    <p className="sec-desc">
      The AI stack underneath the advisory layer — every capability currently deployed in
      production.
    </p>
    <div className="card-grid grid-4">
      {techs.map((t) => (
        <div className="card" key={t.name}>
          <h4 style={{ fontSize: 14.5 }}>{t.name}</h4>
          <div className="meta">{t.note}</div>
        </div>
      ))}
    </div>
  </section>
);
