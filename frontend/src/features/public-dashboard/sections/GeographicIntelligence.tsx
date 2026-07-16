import { useEffect, useState } from "react";
import { MiniMetric } from "../components/MiniMetric";
import { SectionHead } from "../components/SectionHead";
import { states } from "../data/dashboardData";
import { useInView } from "../utils";

const IDX_LABELS = ["Knowledge Density", "Expert Density", "Outreach Density", "Data Availability"];
const IDX_COLORS = ["var(--navy)", "var(--saffron)", "var(--green)", "var(--red-flag)"];

export const GeographicIntelligence = () => {
  const [active, setActive] = useState(0);
  const [changing, setChanging] = useState(false);
  const { ref: barsRef, inView: barsInView } = useInView(0.15);
  const s = states[active];

  // Brief fade-out/in when switching states
  const handleSelect = (i: number) => {
    if (i === active) return;
    setChanging(true);
    setTimeout(() => { setActive(i); setChanging(false); }, 180);
  };

  return (
    <section className="wrap" id="layer2">
      <SectionHead num="LAYER 02" title="Geographic Intelligence" />
      <p className="sec-desc">
        Select a state to inspect its agro-climatic coverage — validated Q&amp;A volume,
        expert density, outreach reach and market integration. Density indices summarise
        where the knowledge base is strongest and where it is still thin.
      </p>
      <div className="geo-layout">
        <div className="state-list">
          {states.map((st, i) => (
            <div
              key={st.name}
              className={`state-item${i === active ? " active" : ""}`}
              onClick={() => handleSelect(i)}
            >
              <span>
                <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                {st.name}
              </span>
              <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>
                {st.crops} crops
              </span>
            </div>
          ))}
        </div>
        {/* state-detail fades when changing */}
        <div className={`state-detail${changing ? " changing" : ""}`}>
          <h3>{s.name}</h3>
          <div className="zone">
            {s.zone} · Dominant crops: {s.dominant} · Languages: {s.langs}
          </div>
          <div className="metric-mini-grid">
            <MiniMetric value={s.crops} label="Crops saturated" />
            <MiniMetric value={`${(s.qas / 1000).toFixed(0)}K`} label="Validated QAs" />
            <MiniMetric value={s.experts} label="Experts" />
            <MiniMetric value={s.districts} label="Districts covered" />
            <MiniMetric value={s.kvks} label="KVKs" />
            <MiniMetric value={s.saus} label="SAUs" />
            <MiniMetric value={s.villages.toLocaleString("en-IN")} label="Outreach villages" />
            <MiniMetric value={`${(s.queries / 1000).toFixed(0)}K`} label="Queries collected" />
            <MiniMetric value={s.markets} label="Market integrations" />
            <MiniMetric value={`${(s.farmers / 1000).toFixed(0)}K`} label="Farmers reached" />
          </div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            DENSITY INDICES
          </div>
          {/* bars-hidden keeps widths at 0 until in-view, then CSS transition takes over */}
          <div ref={barsRef} className={`index-row${barsInView ? "" : " bars-hidden"}`}>
            {s.idx.map((v, ix) => (
              <div className="index-item" key={ix}>
                <span>{IDX_LABELS[ix]}</span>
                <span className="idx-track">
                  <span
                    className="idx-fill"
                    style={{ width: barsInView ? `${v}%` : "0%", background: IDX_COLORS[ix] }}
                  />
                </span>
                <span className="mono">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
