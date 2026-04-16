import { Badge } from "./shared/Badge";
import type { Segment } from "../types";

export function SegmentDetailBanner({ seg, onClose }: { seg: Segment; onClose: () => void }) {
  return (
    <div className="bg-[rgba(58,170,90,0.08)] border-[1.5px] border-[#3AAA5A] rounded-xl px-4 py-[14px] mb-4 flex gap-6 items-start animate-[slideIn_0.25s_ease]">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[13px] font-medium text-[#1E7A3C]">{seg.label}</span>
          <Badge label={seg.status} variant={seg.statusVariant} />
        </div>
        <div className="text-[11px] text-[#3B6D11] mb-2.5">{seg.description}</div>
        <div className="flex gap-5 flex-wrap">
          {[{ key: "Users", val: seg.users }, { key: "Retention", val: `${seg.retention}%` }, { key: "Queries/day", val: String(seg.queryRate) }, { key: "Top crop", val: seg.topCrop }].map(({ key, val }) => (
            <div key={key}>
              <div className="text-[10px] text-[#3B6D11] uppercase tracking-[0.4px]">{key}</div>
              <div className="text-base font-medium text-[#1E7A3C]">{val}</div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-[#3AAA5A] text-[18px] leading-none px-1">×</button>
    </div>
  );
}
