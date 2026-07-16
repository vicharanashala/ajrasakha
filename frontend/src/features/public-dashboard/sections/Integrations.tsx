import { SectionHead } from "../components/SectionHead";
import { integrations } from "../data/dashboardData";

/** Layer 05 — live data sources (weather, mandi prices, schemes …) and their status. */
export const Integrations = () => (
  <section className="wrap" id="layer5">
    <SectionHead title="Live Intelligence Integrations" />
    <p className="sec-desc">
      Dynamic data sources feeding real-time advisory into the ecosystem, each with a
      declared refresh cadence and operational status.
    </p>
    <div className="card-grid grid-3">
      {integrations.map((it) => (
        <div className="card" key={it.name}>
          <h4>{it.name}</h4>
          <div className="meta">Source: {it.src}</div>
          <div className="meta">Refresh: {it.freq}</div>
          <div className="meta">Coverage: {it.geo}</div>
          <span className={`pill ${it.status === "live" ? "live" : "soon"}`}>
            {it.status === "live" ? "Operational" : "Coming soon"}
          </span>
        </div>
      ))}
    </div>
  </section>
);
