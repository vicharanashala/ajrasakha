/** Shown for tabs that don't have their view built yet (Question Collection + future ones). */
export const TabPlaceholder = ({ label }: { label: string }) => (
  <section className="wrap" style={{ padding: "80px 28px", textAlign: "center" }}>
    <div
      style={{
        maxWidth: 520,
        margin: "0 auto",
        background: "var(--paper-raised)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        padding: "44px 32px",
      }}
    >
      <div
        style={{
          display: "inline-block",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--green-deep)",
          background: "var(--green-soft)",
          padding: "4px 12px",
          borderRadius: 999,
        }}
      >
        Coming soon
      </div>
      <h2 style={{ fontSize: 24, marginTop: 16, color: "var(--navy-deep)" }}>{label}</h2>
      <p style={{ fontSize: 14.5, color: "var(--ink-soft)", marginTop: 10, lineHeight: 1.6 }}>
        This section is under development and will be available here soon.
      </p>
    </div>
  </section>
);
