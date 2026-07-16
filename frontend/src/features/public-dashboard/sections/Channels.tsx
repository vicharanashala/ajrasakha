import { SectionHead } from "../components/SectionHead";
import { channels } from "../data/dashboardData";

/** Where farmers reach ANNAM.AI, and how much each channel carries. */
export const Channels = () => (
  <section className="wrap" id="channels">
    <SectionHead title="Communication Channels" />
    <p className="sec-desc">Where farmers reach ANNAM.AI, and how much each channel carries.</p>
    <div className="card-grid grid-4">
      {channels.map((c) => (
        <div className="card" key={c.name}>
          <h4 style={{ fontSize: 14.5 }}>{c.name}</h4>
          <div className="meta">{c.note}</div>
          <div className="meta mono" style={{ marginTop: 8 }}>
            {c.usage}
          </div>
          <span className="pill live">Active</span>
        </div>
      ))}
    </div>
  </section>
);
