/** Closing footer with the tricolour rule. */
export const Footer = () => (
  <footer>
    <div className="wrap">
      <div className="col">
        <h5>ANNAM.AI · ACE</h5>
        <p>Agricultural Cognitive Ecosystem</p>
        <p>IIT Ropar</p>
      </div>
      <div className="col">
        <h5>About this dashboard</h5>
        <p style={{ maxWidth: 340 }}>
          This public transparency portal provides open access to real-time operational
          data without requiring user authentication. All dashboards, statistics, and
          metrics are synchronized with the live system and updated automatically to
          ensure accurate, current, and transparent reporting.
        </p>
      </div>
      <div className="col">
        <h5>Mission</h5>
        <p>Digital Public Infrastructure for Indian Agriculture</p>
      </div>
    </div>
    <div className="wrap">
      <div className="flag-bar" style={{ marginTop: 34 }}>
        <div style={{ background: "var(--saffron)" }} />
        <div style={{ background: "#edede6" }} />
        <div style={{ background: "var(--green)" }} />
      </div>
    </div>
  </footer>
);
