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
          A public, no-login transparency portal. Figures shown here are illustrative
          placeholders for design review and are not live production data.
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
