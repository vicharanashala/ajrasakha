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
      className={`bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 transition-shadow duration-300 ${activeSegment ? "seg-pulse" : ""}`}
    >
      <div className="flex items-start justify-between mb-[14px]">
        <div>
          <div className="text-[13px] font-medium text-[var(--card-foreground)]">Farmer segments</div>
          <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
            {activeSegment ? <span className="text-[#1E7A3C]">Viewing: {activeSegment.label}</span> : "Click a row to inspect segment"}
          </div>
        </div>
        {activeSegment && (
          <button
            onClick={onClear}
            className="text-[11px] text-[var(--muted-foreground)] bg-transparent border border-[var(--border)] rounded-md px-2 py-[3px] cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[var(--muted)]">
            {["Segment", "Users", "Status"].map(h => (
              <th
                key={h}
                className="text-left text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-[0.4px] px-[10px] py-[6px] border-b border-[var(--border)]"
              >
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
                className={`cursor-pointer transition-colors duration-200 ${isActive ? "bg-[rgba(58,170,90,0.1)]" : "bg-transparent"}`}
              >
                <td className={`px-[10px] py-[9px] text-[var(--card-foreground)] border-b border-[var(--border)] ${isActive ? "font-medium" : "font-normal"}`}>
                  <span className="flex items-center gap-1.5">
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#3AAA5A] shrink-0 inline-block" />}
                    {seg.label}
                  </span>
                </td>
                <td className="px-[10px] py-[9px] text-[var(--card-foreground)] border-b border-[var(--border)]">{seg.users}</td>
                <td className="px-[10px] py-[9px] border-b border-[var(--border)]"><Badge label={seg.status} variant={seg.statusVariant} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
