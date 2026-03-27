import { Badge } from "./shared/Badge";
import type { Segment } from "../types";

interface Props {
  seg: Segment;
  onClose: () => void;
}

export function SegmentDetailBanner({ seg, onClose }: Props) {
  return (
    <div style={{
      background: "rgba(58,170,90,0.08)", border: "1.5px solid #3AAA5A", borderRadius: 12, padding: "14px 16px",
      marginBottom: 16, display: "flex", gap: 24, alignItems: "flex-start",
      animation: "slideIn 0.25s ease",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#1E7A3C" }}>{seg.label}</span>
          <Badge label={seg.status} variant={seg.statusVariant} />
        </div>
        <div style={{ fontSize: 11, color: "#3B6D11", marginBottom: 10 }}>{seg.description}</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { key: "Users",       val: seg.users },
            { key: "Retention",   val: `${seg.retention}%` },
            { key: "Queries/day", val: String(seg.queryRate) },
            { key: "Top crop",    val: seg.topCrop },
          ].map(({ key, val }) => (
            <div key={key}>
              <div style={{ fontSize: 10, color: "#3B6D11", textTransform: "uppercase", letterSpacing: "0.4px" }}>{key}</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: "#1E7A3C" }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#3AAA5A", fontSize: 18, lineHeight: 1, padding: "0 4px", fontWeight: 300 }}>
        ×
      </button>
    </div>
  );
}
