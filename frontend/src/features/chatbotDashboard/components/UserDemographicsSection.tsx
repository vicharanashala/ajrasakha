import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import type { UserDemographics } from "../types";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";

const AGE_COLORS: Record<string, string> = {
  "18-30": "#3AAA5A",
  "30-45": "#378ADD",
  "45-60": "#EF9F27",
  "60+": "#8B5CF6",
};
const GENDER_COLORS: Record<string, string> = { Male: "#378ADD", Female: "#E879A0", Others: "#A0845C" };
const EXP_COLORS = ["#1E3A5F", "#378ADD", "#60A5FA", "#38BDF8", "#94A3B8"];
const LAND_COLORS: Record<string, string> = { Small: "#3AAA5A", Medium: "#EF9F27", Large: "#378ADD" };

const formatCount = (count?: number | null): string => {
  if (count === null || count === undefined || isNaN(count)) return "0";
  return count.toLocaleString('en-US');
};

function DonutSegments({ segments }: { segments: { label: string; count: number; pct: number; color: string }[] }) {
  const [hoveredSeg, setHoveredSeg] = useState<{ label: string; count: number } | null>(null);
  const displayTotal = segments.reduce((s, x) => s + x.count, 0);
  const totalCount = displayTotal || 1;
  const r = 32, cx = 44, cy = 44, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-row flex-wrap 2xl:flex-nowrap items-center justify-center sm:justify-start gap-4 w-full">
      <div className="relative flex-shrink-0">
      <svg width={88} height={88} viewBox="0 0 88 88" className="flex-shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={14} strokeLinecap="butt" />
        {segments.map((seg) => {
          const dash = (seg.count / totalCount) * circ;
          const el = (
            <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color}
              strokeWidth={14} strokeLinecap="butt"
              strokeDasharray={`${dash} ${circ * 10}`}
              strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`}
                className="cursor-pointer transition-opacity duration-200 hover:opacity-80"
                onMouseEnter={() => setHoveredSeg(seg)}
                onMouseLeave={() => setHoveredSeg(null)} />
          );
          offset += dash;
          return el;
        })}
      </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          {hoveredSeg ? (
            <>
              <span className="text-[10px] text-gray-800 dark:text-gray-200 max-w-[50px] truncate">{hoveredSeg.label}</span>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{formatCount(hoveredSeg.count)}</span>
            </>
          ) : (
            <>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{formatCount(displayTotal)}</span>
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">Total</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-[120px] w-full">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="font-medium text-gray-700 dark:text-gray-200 min-w-[32px] text-right flex-shrink-0">{formatCount(s.count)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnlargedDonutSegments({ segments }: { segments: { label: string; count: number; pct: number; color: string }[] }) {
  const [hoveredSeg, setHoveredSeg] = useState<{ label: string; count: number } | null>(null);
  const displayTotal = segments.reduce((s, x) => s + x.count, 0);
  const totalCount = displayTotal || 1;
  const r = 80, cx = 100, cy = 100, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full">
      <div className="relative flex-shrink-0">
      <svg width={200} height={200} viewBox="0 0 200 200" className="flex-shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={28} strokeLinecap="butt" />
        {segments.map((seg) => {
          const dash = (seg.count / totalCount) * circ;
          const el = (
            <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color}
              strokeWidth={28} strokeLinecap="butt"
              strokeDasharray={`${dash} ${circ * 10}`}
              strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`}
                className="cursor-pointer transition-opacity duration-200 hover:opacity-80"
                onMouseEnter={() => setHoveredSeg(seg)}
                onMouseLeave={() => setHoveredSeg(null)} />
          );
          offset += dash;
          return el;
        })}
      </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          {hoveredSeg ? (
            <>
              <span className="text-sm text-gray-800 dark:text-gray-200 max-w-[120px] truncate mb-1">{hoveredSeg.label}</span>
              <span className="text-3xl font-bold text-gray-800 dark:text-gray-100">{formatCount(hoveredSeg.count)}</span>
            </>
          ) : (
            <>
              <span className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-1">{formatCount(displayTotal)}</span>
              <span className="text-sm text-gray-500 uppercase tracking-wider">Total</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-md">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-3 text-base text-gray-600 dark:text-gray-300">
            <span className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="flex-1">{s.label}</span>
            <span className="font-semibold text-gray-800 dark:text-gray-100 text-lg min-w-[60px] text-right flex-shrink-0">{formatCount(s.count)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


function HorizontalBars({ segments }: { segments: { label: string; count: number; pct: number; color: string }[] }) {
  return (
    <div className="flex flex-col gap-2.5 w-full">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-20 sm:w-24 flex-shrink min-w-0 truncate">{s.label}</span>
          <div className="flex-1 min-w-[24px] h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${s.pct}%`, background: s.color }} />
          </div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 min-w-[32px] w-auto text-right flex-shrink-0">
            {formatCount(s.count)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EnlargedHorizontalBars({ segments }: { segments: { label: string; count: number; pct: number; color: string }[] }) {
  return (
    <div className="flex flex-col gap-5 w-full max-w-2xl mx-auto">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-4">
          <span className="text-base text-gray-600 dark:text-gray-300 w-32 flex-shrink-0">{s.label}</span>
          <div className="flex-1 h-6 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${s.pct}%`, background: s.color }} />
          </div>
          <span className="text-base font-semibold text-gray-800 dark:text-gray-100 min-w-[60px] w-auto text-right flex-shrink-0">
            {formatCount(s.count)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  data: UserDemographics;
}

function DemographicCard({ 
  title, 
  segments, 
  type 
}: { 
  title: string; 
  segments: { label: string; count: number; pct: number; color: string }[]; 
  type: 'donut' | 'bar';
}) {
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <>
      <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative">
        {/* Maximize Button */}
        {segments.length > 0 && (
          <button
            onClick={() => setIsMaximized(true)}
            className="absolute top-3 right-3 p-1.5 rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm z-20"
            title="Maximize chart"
          >
            <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        )}

        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {segments.length > 0 ? (
            type === 'donut' ? <DonutSegments segments={segments} /> : <HorizontalBars segments={segments} />
          ) : (
            <p className="text-xs text-gray-400 italic">No data</p>
          )}
        </CardContent>
      </Card>

      {/* Maximized Modal */}
      {isMaximized && segments.length > 0 && createPortal(
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setIsMaximized(false)}
        >
          <div 
            className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-3xl w-full p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setIsMaximized(false)}
              className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>

            {/* Header */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                {title}
              </h3>
            </div>

            {/* Enlarged Chart */}
            {type === 'donut' ? (
              <EnlargedDonutSegments segments={segments} />
            ) : (
              <EnlargedHorizontalBars segments={segments} />
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function UserDemographicsSection({ data }: Props) {
  const ageSegments = data.ageGroups.map((d) => ({ ...d, color: AGE_COLORS[d.label] ?? "#6B7280" }));
  const genderSegments = data.genderSplit.map((d) => ({ ...d, color: GENDER_COLORS[d.label] ?? "#6B7280" }));
  const expSegments = data.farmingExperience.map((d, i) => ({ ...d, color: EXP_COLORS[i % EXP_COLORS.length] }));
  const landSegments = (data.landHolding ?? []).map((d) => ({ ...d, color: LAND_COLORS[d.label] ?? "#6B7280" }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      <DemographicCard title="Age Group" segments={ageSegments} type="donut" />
      <DemographicCard title="Gender Split" segments={genderSegments} type="donut" />
      <DemographicCard title="Farming Experience" segments={expSegments} type="bar" />
      <DemographicCard title="Land Holding" segments={landSegments} type="donut" />
    </div>
  );
}
