import { Globe } from "lucide-react";
import { useMemo } from "react";

interface PlatformData {
  count: number;
  platform: string;
}

interface PlatformIconProps {
  platform: string;
  color: string;
  className?: string;
}

interface PlatformDonutSegmentsProps {
  rawData: PlatformData[];
}

const PlatformIcon: React.FC<PlatformIconProps> = ({ platform, color, className }) => {
  const normalized = platform.toLowerCase();

  if (normalized.includes("android")) {
    return (
      <svg className={className} style={{ color }} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M17.6 9.48l1.84-3.18c.16-.28.06-.63-.22-.78-.28-.15-.63-.06-.78.22L16.5 9.04C15.1 8.4 13.5 8 12 8s-3.1.4-4.5 1.04L5.56 5.74c-.16-.28-.5-.38-.78-.22-.28.16-.38.5-.22.78l1.84 3.18C3.86 11.24 2 14.4 2 18h20c0-3.6-1.86-6.76-4.4-8.52zM7 15.25c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25zm10 0c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"
        />
      </svg>
    );
  }

  if (normalized.includes("windows")) {
    return (
      <svg className={className} style={{ color }} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M2.5 11.5V3.5L10.5 2.2V11.5H2.5ZM11.5 2L21.5 0.5V11.5H11.5V2ZM2.5 12.5H10.5V21.8L2.5 20.5V12.5ZM11.5 12.5H21.5V23.5L11.5 22V12.5Z"
        />
      </svg>
    );
  }

  if (normalized.includes("mac") || normalized.includes("ios") || normalized.includes("apple")) {
    return (
      <svg className={className} style={{ color }} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M16.98 18.04c-.53.75-1.15 1.54-2.04 1.56-.84.02-1.13-.5-2.07-.5-.95 0-1.27.48-2.05.51-.83.03-1.55-.86-2.08-1.63C7.54 16.2 6.38 12.5 7.15 9.9c.38-1.25 1.18-2.3 2.3-2.32.86-.02 1.68.58 2.2.58.53 0 1.53-.7 2.58-.6 1.08.09 2.04.54 2.65 1.43-2.28 1.34-1.88 4.67.43 5.61-.53 1.33-1.16 2.56-2.33 3.44zM12.28 6.64c-.05-1.17.47-2.3 1.25-3.05.86-.82 2.05-1.3 3.12-1.25.1 1.25-.43 2.45-1.25 3.23-.82.8-2.02 1.23-3.12 1.07z"
        />
      </svg>
    );
  }

  if (normalized.includes("linux")) {
    return (
      <svg
        className={className}
        style={{ color }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    );
  }

  return <Globe className={className} style={{ color }} />;
};

export const PlatformDonutSegments: React.FC<PlatformDonutSegmentsProps> = ({ rawData }) => {
  const PLATFORM_COLORS: Record<string, string> = {
    Android: "#22c55e",
    Windows: "#3b82f6",
    MacOS: "#64748b",
    iOS: "#0ea5e9",
    Linux: "#eab308",
    default: "#9ca3af",
  };

  const VIEW_W = 440;
  const VIEW_H = 260;
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  const r = 55;
  const circ = 2 * Math.PI * r;

  const { segmentsLayout, totalCount } = useMemo(() => {
    const total = rawData.reduce((sum, item) => sum + item.count, 0) || 1;
    const sorted = [...rawData].sort((a, b) => b.count - a.count);

    let cumulative = 0;

    const layout = sorted.map((item) => {
      const color = PLATFORM_COLORS[item.platform] || PLATFORM_COLORS.default;
      const startPct = cumulative / total;
      const midPct = startPct + (item.count / 2) / total;
      const midAngle = -Math.PI / 2 + midPct * 2 * Math.PI;

      const isRight = Math.cos(midAngle) >= -0.01;
      const elbowDist = r + 20;
      const x1 = cx + (r + 4) * Math.cos(midAngle);
      const y1 = cy + (r + 4) * Math.sin(midAngle);
      const x2 = cx + elbowDist * Math.cos(midAngle);
      const y2 = cy + elbowDist * Math.sin(midAngle);
      const x3 = isRight ? x2 + 25 : x2 - 25;
      const y3 = y2;
      const dash = (item.count / total) * circ;
      cumulative += item.count;

      return {
        label: item.platform,
        count: item.count,
        color,
        dash,
        x1,
        y1,
        x2,
        y2,
        x3,
        y3,
        isRight,
      };
    });

    return { segmentsLayout: layout, totalCount: total };
  }, [rawData]);

  let drawOffset = 0;

  return (
    <div className="w-full p-4 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Installations by Platform
        </h3>
      </div>
      <div
        className="relative w-full min-h-[280px] overflow-hidden"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="absolute inset-0 h-full w-full transform drop-shadow-sm"
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="currentColor"
            className="text-gray-100 dark:text-gray-800"
            strokeWidth={14}
            strokeLinecap="butt"
          />

          {segmentsLayout.map((seg) => {
            const el = (
              <g key={seg.label}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={14}
                  strokeLinecap="butt"
                  strokeDasharray={`${seg.dash} ${circ * 10}`}
                  strokeDashoffset={-drawOffset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  className="cursor-pointer transition-all duration-300 ease-in-out hover:stroke-[16px]"
                />
                <polyline
                  points={`${seg.x1},${seg.y1} ${seg.x2},${seg.y2} ${seg.x3},${seg.y3}`}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="1.5"
                  className="opacity-50"
                />
                <circle cx={seg.x1} cy={seg.y1} r="2.5" fill={seg.color} className="opacity-90" />
              </g>
            );
            drawOffset += seg.dash;
            return el;
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold leading-none text-gray-800 dark:text-white">{totalCount}</span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">Total</span>
        </div>

        {segmentsLayout.map((s) => (
          <div
            key={`label-${s.label}`}
            className="absolute z-10 flex items-center rounded-lg border border-gray-100 bg-white px-2 py-1.5 shadow-sm transition-transform hover:scale-105 dark:border-gray-700 dark:bg-gray-800/90 dark:backdrop-blur-sm"
            style={{
              left: s.isRight ? `${(s.x3 / VIEW_W) * 100}%` : "auto",
              right: !s.isRight ? `${((VIEW_W - s.x3) / VIEW_W) * 100}%` : "auto",
              top: `${(s.y3 / VIEW_H) * 100}%`,
              transform: "translateY(-50%)",
              marginLeft: s.isRight ? "6px" : "0",
              marginRight: !s.isRight ? "6px" : "0",
            }}
          >
            <div className="flex items-center gap-1.5">
              <PlatformIcon platform={s.label} color={s.color} className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap text-xs font-medium text-gray-600 dark:text-gray-300">
                {s.label}
              </span>
              <span className="ml-0.5 border-l border-gray-200 pl-1.5 text-xs font-bold text-gray-900 dark:border-gray-700 dark:text-white">
                {s.count}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
