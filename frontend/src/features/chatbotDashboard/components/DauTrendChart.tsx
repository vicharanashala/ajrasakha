import { Card } from "./shared/Card";

const bars   = [40,45,42,50,48,55,62,60,65,70,66,72,75,78,76,82,80,85,88,86,90,93,89,95,98,100,96,100,98,60];
const colors = ["#C0DD97","#C0DD97","#C0DD97","#C0DD97","#97C459","#97C459","#97C459","#639922","#639922","#639922","#639922","#639922","#3B6D11","#3B6D11","#3B6D11","#3B6D11","#3B6D11","#27500A","#27500A","#27500A","#27500A","#27500A","#27500A","#173404","#173404","#173404","#173404","#173404","#173404","#EF9F27"];

export function DauTrendChart() {
  return (
    <Card title="Daily active users — 30 day trend" subtitle="Farmers + KCC agents + agri experts" action="Drill down ↗">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, paddingTop: 4 }}>
        {bars.map((h, i) => (
          <div
            key={i}
            style={{ flex: 1, height: `${h}%`, background: colors[i], borderRadius: "2px 2px 0 0", outline: i === 29 ? "1.5px solid #BA7517" : "none" }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#aaa", marginTop: 4, padding: "0 1px" }}>
        <span>Day 1</span><span>Day 10</span><span>Day 20</span><span>Today</span>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 10, borderTop: "0.5px solid #f0f0f0" }}>
        <div style={{ fontSize: 11, color: "#888" }}>Peak: <span style={{ fontWeight: 500, color: "#1a1a1a" }}>Day 26 · 98,400</span></div>
        <div style={{ fontSize: 11, color: "#888" }}>Avg: <span style={{ fontWeight: 500, color: "#1a1a1a" }}>71,200 / day</span></div>
        <div style={{ fontSize: 11, color: "#888" }}>Growth: <span style={{ fontWeight: 500, color: "#1E7A3C" }}>+18% MoM</span></div>
      </div>
    </Card>
  );
}
