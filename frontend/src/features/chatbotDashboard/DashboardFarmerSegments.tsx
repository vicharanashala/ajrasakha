import type { Segment } from "./types";

interface Props {
  segments: Segment[];
  activeSegment: Segment | null;
  onSegmentClick: (seg: Segment) => void;
  onClear: () => void;
  segmentsRef?: React.RefObject<HTMLDivElement | null>;
  segmentRowRefs?: React.MutableRefObject<Record<string, HTMLTableRowElement | null>>;
}

const badgeTailwindStyles: Record<string, string> = {
  green: "bg-[#EAF3DE] text-[#3B6D11] dark:bg-green-900/40 dark:text-green-400",
  red:   "bg-[#FCEBEB] text-[#A32D2D] dark:bg-red-900/40 dark:text-red-400",
  amber: "bg-[#FAEEDA] text-[#633806] dark:bg-amber-900/40 dark:text-amber-400",
  blue:  "bg-[#E6F1FB] text-[#0C447C] dark:bg-blue-900/40 dark:text-blue-400",
};

export function DashboardFarmerSegments({ segments, activeSegment, onSegmentClick, onClear, segmentsRef, segmentRowRefs }: Props) {
  return (
    <div
      ref={segmentsRef}
      className={`bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4 transition-shadow duration-300 h-full flex flex-col ${
        activeSegment ? "seg-pulse" : ""
      }`}
    >
      <div className="flex items-start justify-between mb-3 md:mb-3.5">
        <div>
          <div className="text-[12px] sm:text-[13px] font-medium text-gray-900 dark:text-gray-100">Farmer segments</div>
          <div className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {activeSegment ? (
              <span className="text-[#1E7A3C] dark:text-[#4adc64]">Viewing: {activeSegment.label}</span>
            ) : (
              "Click a row to inspect segment"
            )}
          </div>
        </div>
        {activeSegment && (
          <button
            onClick={onClear}
            className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 bg-transparent border border-gray-200 dark:border-gray-800 rounded-md px-1.5 py-0.5 sm:px-2 sm:py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto w-full -mx-1 sm:mx-0 px-1 sm:px-0 pr-1 max-h-[260px]">
        <table className="w-full border-collapse text-[11px] sm:text-[12px] min-w-[280px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-black/20">
              {["Segment", "Users", "Status"].map((h) => (
                <th
                  key={h}
                  className="text-left text-[9px] sm:text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-[0.4px] py-1.5 px-2 sm:px-2.5 border-b border-gray-200 dark:border-gray-800"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {segments.map((seg) => {
              const isActive = activeSegment?.id === seg.id;
              const badgeVariant = seg.statusVariant || "green";
              return (
                <tr
                  key={seg.id}
                  ref={(el) => {
                    if (segmentRowRefs?.current) {
                      segmentRowRefs.current[seg.id] = el;
                    }
                  }}
                  onClick={() => onSegmentClick(seg)}
                  className={`cursor-pointer transition-colors border-b border-gray-200 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] ${
                    isActive ? "bg-green-500/10 dark:bg-[#3AAA5A]/10" : "bg-transparent"
                  }`}
                >
                  <td
                    className={`py-1.5 sm:py-2 px-2 sm:px-2.5 text-gray-900 dark:text-gray-200 ${
                      isActive ? "font-medium" : "font-normal"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {isActive && (
                        <span className="w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full bg-[#3AAA5A] flex-shrink-0 inline-block" />
                      )}
                      {seg.label}
                    </span>
                  </td>
                  <td className="py-1.5 sm:py-2 px-2 sm:px-2.5 text-gray-900 dark:text-gray-200">{seg.users}</td>
                  <td className="py-1.5 sm:py-2 px-2 sm:px-2.5">
                    <span className={`inline-flex items-center px-[5px] sm:px-[7px] py-[1px] sm:py-[2px] rounded-[20px] text-[9px] sm:text-[10px] font-medium ${badgeTailwindStyles[badgeVariant] || badgeTailwindStyles.green}`}>
                      {seg.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
