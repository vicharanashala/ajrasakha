export function TopNav({ season }: { season: string }) {
  return (
    <div style={{ background: "#0F4A24", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 52, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ background: "#3AAA5A", color: "#fff", fontSize: 13, fontWeight: 500, padding: "4px 10px", borderRadius: 6 }}>ACE</span>
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 500 }}>ANNAM.AI · Agri Intelligence Platform</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(74,220,100,0.15)", color: "#4adc64", fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 20 }}>
          <span style={{ width: 5, height: 5, background: "#4adc64", borderRadius: "50%" }} />Live
        </span>
        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{season} · Q3</span>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1E7A3C", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 500 }}>PK</div>
      </div>
    </div>
  );
}
