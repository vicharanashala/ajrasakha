import { Counter } from "../components/Counter";
import { SectionHead } from "../components/SectionHead";
import { langCoverage } from "../data/dashboardData";

/** Language and dialect coverage across text and audio, mapped by state. */
export const Multilingual = () => (
  <section className="wrap" id="lang">
    <SectionHead title="Multilingual Capability" />
    <p className="sec-desc">Coverage across text, audio and regional dialect, mapped by state.</p>
    <div className="stat-grid" style={{ marginBottom: 24 }}>
      <div className="stat-cell">
        <div className="val">
          <Counter value={22} />
        </div>
        <div className="lab">Text languages supported</div>
      </div>
      <div className="stat-cell">
        <div className="val">
          <Counter value={16} />
        </div>
        <div className="lab">Audio languages supported</div>
      </div>
      <div className="stat-cell">
        <div className="val">
          <Counter value={47} />
        </div>
        <div className="lab">Dialects supported</div>
      </div>
    </div>
    <div className="chart-box">
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        STATE-WISE LANGUAGE COVERAGE
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))",
          gap: 10,
        }}
      >
        {langCoverage.map((l) => (
          <div
            key={l.name}
            style={{
              border: "1px solid var(--line)",
              padding: "10px 12px",
              background: "var(--paper)",
              borderRadius: 10,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{l.name}</div>
            <div className="meta mono" style={{ marginTop: 4 }}>
              Text {l.text} · Audio {l.audio}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);
