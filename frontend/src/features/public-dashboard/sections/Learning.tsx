import { Counter } from "../components/Counter";
import { SectionHead } from "../components/SectionHead";

/** The Agri AI course and the institutions building on it. */
export const Learning = () => (
  <section className="wrap" id="learning">
    <SectionHead num="CAPACITY" title="Learning Ecosystem" />
    <p className="sec-desc">The Agri AI Course and the institutions building on it.</p>
    <div className="stat-grid">
      <div className="stat-cell">
        <div className="val">
          <Counter value={1} />
        </div>
        <div className="lab">Agri AI Course live</div>
      </div>
      <div className="stat-cell">
        <div className="val">
          <Counter value={24600} />
        </div>
        <div className="lab">Learners enrolled</div>
      </div>
      <div className="stat-cell">
        <div className="val">
          <Counter value={6800} />
        </div>
        <div className="lab">Certificates issued</div>
      </div>
      <div className="stat-cell">
        <div className="val">
          <Counter value={118} />
        </div>
        <div className="lab">Institutions onboarded</div>
      </div>
    </div>
  </section>
);
