import { Counter } from "../components/Counter";
import { SectionHead } from "../components/SectionHead";

/** Language and dialect coverage across text and audio. */
export const Multilingual = () => (
  <section className="wrap" id="lang">
    <SectionHead title="Multilingual Capability" />
    <p className="sec-desc">Coverage across text, audio and regional dialect.</p>
    <div className="stat-grid">
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
  </section>
);
