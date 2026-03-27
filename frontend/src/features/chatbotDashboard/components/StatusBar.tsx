interface Props { lastSync: string; datasetVersion: string; llmVersion: string; p0Bugs: number; }

function Sep() { return <span style={{ width: 1, height: 12, background: "var(--border)", display: "inline-block" }} />; }

export function StatusBar({ lastSync, datasetVersion, llmVersion, p0Bugs }: Props) {
  return (
    <div style={{ background: "var(--card)", borderTop: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 16, padding: "8px 20px", fontSize: 11, color: "var(--muted-foreground)", flexShrink: 0, flexWrap: "wrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3AAA5A", display: "inline-block" }} />
      <span>All systems operational</span>
      <Sep /><span>Last sync: {lastSync}</span>
      <Sep /><span>Dataset: {datasetVersion}</span>
      <Sep /><span>Agri-LLM: {llmVersion}</span>
      <Sep /><span style={{ color: "#A32D2D", fontWeight: 500 }}>{p0Bugs} P0 bugs open · action required</span>
    </div>
  );
}
