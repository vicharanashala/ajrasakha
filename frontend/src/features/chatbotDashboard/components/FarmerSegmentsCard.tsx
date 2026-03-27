import type { Segment } from "../types";
import { Badge } from "./shared/Badge";

interface Props {
  segments: Segment[];
  activeSegment: Segment | null;
  onSegmentClick: (seg: Segment) => void;
  onClear: () => void;
  segmentsRef: React.RefObject<HTMLDivElement | null>;
  segmentRowRefs: React.MutableRefObject<Record<string, HTMLTableRowElement | null>>;
}

export function FarmerSegmentsCard({ segments, activeSegment, onSegmentClick, onClear, segmentsRef, segmentRowRefs }: Props) {
  return (
    <div
      ref={segmentsRef}
      style={{ background: "var(--card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: 16, transition: "box-shadow 0.3s" }}
      className={activeSegment ? "seg-pulse" : ""}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--card-foreground)" }}>Farmer segments</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
            {activeSegment
              ? <span style={{ color: "#1E7A3C" }}>Viewing: {activeSegment.label}</span>
              : "Click a row to inspect segment"}
          </div>
        </div>
        {activeSegment && (
          <button onClick={onClear} style={{ fontSize: 11, color: "var(--muted-foreground)", background: "none", border: "0.5px solid var(--border)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "var(--muted)" }}>
            {["Segment", "Users", "Status"].map(h => (
              <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 500, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.4px", padding: "6px 10px", borderBottom: "0.5px solid var(--border)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segments.map(seg => {
            const isActive = activeSegment?.id === seg.id;
            return (
              <tr
                key={seg.id}
                ref={el => { segmentRowRefs.current[seg.id] = el; }}
                onClick={() => onSegmentClick(seg)}
                style={{ cursor: "pointer", background: isActive ? "rgba(58,170,90,0.1)" : "transparent", transition: "background 0.2s" }}
              >
                <td style={{ padding: "9px 10px", color: "var(--card-foreground)", borderBottom: "0.5px solid var(--border)", fontWeight: isActive ? 500 : 400 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isActive && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3AAA5A", flexShrink: 0, display: "inline-block" }} />}
                    {seg.label}
                  </span>
                </td>
                <td style={{ padding: "9px 10px", color: "var(--card-foreground)", borderBottom: "0.5px solid var(--border)" }}>{seg.users}</td>
                <td style={{ padding: "9px 10px", borderBottom: "0.5px solid var(--border)" }}>
                  <Badge label={seg.status} variant={seg.statusVariant} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
