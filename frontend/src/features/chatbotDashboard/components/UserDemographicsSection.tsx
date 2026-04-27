import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import type { UserDemographics } from "../types";

const AGE_COLORS = ["#3AAA5A", "#378ADD", "#A0845C", "#EF9F27", "#6B7280"];
const GENDER_COLORS: Record<string, string> = { Male: "#378ADD", Female: "#E879A0", Other: "#A0845C" };
const EXP_COLORS = ["#1E3A5F", "#378ADD", "#60A5FA", "#38BDF8", "#94A3B8"];

function DonutSegments({ segments }: { segments: { label: string; count: number; pct: number; color: string }[] }) {
  const totalCount = segments.reduce((s, x) => s + x.count, 0) || 1;
  const r = 32, cx = 44, cy = 44, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
      <svg width={88} height={88} viewBox="0 0 88 88" className="flex-shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={14} strokeLinecap="butt" />
        {segments.map((seg) => {
          const dash = (seg.count / totalCount) * circ;
          const el = (
            <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color}
              strokeWidth={14} strokeLinecap="butt"
              strokeDasharray={`${dash} ${circ * 10}`}
              strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="flex flex-col gap-1.5 w-full">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="font-medium text-gray-700 dark:text-gray-200">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}


function HorizontalBars({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  return (
    <div className="flex flex-col gap-2.5 w-full">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-20 sm:w-24 flex-shrink-0 truncate">{s.label}</span>
          <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${s.pct}%`, background: s.color }} />
          </div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 w-7 text-right flex-shrink-0">
            {s.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  data: UserDemographics;
}

export function UserDemographicsSection({ data }: Props) {
  const ageSegments = data.ageGroups.map((d, i) => ({ ...d, color: AGE_COLORS[i % AGE_COLORS.length] }));
  const genderSegments = data.genderSplit.map((d) => ({ ...d, color: GENDER_COLORS[d.label] ?? "#6B7280" }));
  const expSegments = data.farmingExperience.map((d, i) => ({ ...d, color: EXP_COLORS[i % EXP_COLORS.length] }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
      <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Age Group</CardTitle>
        </CardHeader>
        <CardContent>
          {ageSegments.length > 0
            ? <DonutSegments segments={ageSegments} />
            : <p className="text-xs text-gray-400 italic">No data</p>}
        </CardContent>
      </Card>

      <Card className="dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Gender Split</CardTitle>
        </CardHeader>
        <CardContent>
          {genderSegments.length > 0
            ? <DonutSegments segments={genderSegments} />
            : <p className="text-xs text-gray-400 italic">No data</p>}
        </CardContent>
      </Card>

      <Card className="sm:col-span-2 lg:col-span-1 dark:bg-[#1a1a1a] dark:border-[#2a2a2a]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Farming Experience</CardTitle>
        </CardHeader>
        <CardContent>
          {expSegments.length > 0
            ? <HorizontalBars segments={expSegments} />
            : <p className="text-xs text-gray-400 italic">No data</p>}
        </CardContent>
      </Card>
    </div>
  );
}
