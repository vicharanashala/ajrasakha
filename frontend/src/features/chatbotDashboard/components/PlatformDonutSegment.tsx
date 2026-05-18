import { Globe, Maximize2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

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
  const [active, setActive] = useState<null | { label: string; count: number }>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const PLATFORM_COLORS: Record<string, string> = {
    Android: "#22c55e",
    Windows: "#3b82f6",
    MacOS: "#64748b",
    iOS: "#0ea5e9",
    Linux: "#eab308",
    default: "#9ca3af",
  };

  const { segmentsLayout, totalCount } = useMemo(() => {
    const total = rawData.reduce((sum, item) => sum + item.count, 0);
    const layout = rawData.map((item) => {
      const color = PLATFORM_COLORS[item.platform] || PLATFORM_COLORS.default;
      return {
        label: item.platform,
        count: item.count,
        color
      };
    });

    return { segmentsLayout: layout, totalCount: total };
  }, [rawData]);

  const isEmpty = rawData.length === 0 || totalCount === 0;

  const VIEW = 120;
  const r = 45;
  const cx = VIEW / 2;
  const cy = VIEW / 2;
  const circ = 2 * Math.PI * r;

  let offset = 0;

  return (
    <>
      <div className="w-full p-4 bg-white rounded-xl border border-gray-200 
        dark:bg-[#1a1a1a] dark:border-[#2a2a2a] relative">
        {/* Maximize Button */}
        {!isEmpty && (
          <button
            onClick={() => setIsMaximized(true)}
            className="absolute top-3 right-3 p-1.5 rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm z-20"
            title="Maximize chart"
          >
            <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        )}

        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
          Installations by Platform
        </h3>
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <svg width={120} height={120}>
            <circle
              cx="60"
              cy="60"
              r="45"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="12"
            />
          </svg>

          <p className="text-xs text-gray-400 italic">
            No platform data available
          </p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6 w-full">
          <div className="relative flex items-center justify-center">
            <svg
              width={VIEW}
              height={VIEW}
              viewBox={`0 0 ${VIEW} ${VIEW}`}
              className="flex-shrink-0"
            >
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth={14}
              />

              {segmentsLayout.map((seg) => {
                const dash = (seg.count / totalCount) * circ;

                const el = (
                  <circle
                    key={seg.label}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={14}
                    strokeDasharray={`${dash} ${circ * 10}`}
                    strokeDashoffset={-offset}
                    transform={`rotate(-90 ${cx} ${cy})`}
                    onMouseEnter={() => setActive({ label: seg.label, count: seg.count })}
                    onMouseLeave={() => setActive(null)}
                    className="cursor-pointer transition-all duration-300 hover:stroke-[16px]"
                  />
                );

                offset += dash;
                return el;
              })}
            </svg>
            <div className="absolute flex flex-col items-center justify-center pointer-events-none">
              {active ? (
                <>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {active.label}
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {active.count}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {totalCount}
                  </span>
                  <span className="text-[10px] text-gray-400 uppercase">
                    Total
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full">
            {segmentsLayout.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
              >
                <span
                  className="w-2 h-2 rounded-sm"
                  style={{ background: s.color }}
                />

                <PlatformIcon
                  platform={s.label}
                  color={s.color}
                  className="h-3.5 w-3.5"
                />

                <span className="flex-1 truncate">{s.label}</span>

                <span className="font-semibold text-gray-800 dark:text-white">
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* Maximized Modal */}
    {isMaximized && !isEmpty && createPortal(
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
              Installations by Platform
            </h3>
          </div>

          {/* Enlarged Chart */}
          <div className="flex flex-col lg:flex-row items-center justify-center gap-12 w-full">
            <div className="relative flex items-center justify-center">
              <svg
                width={240}
                height={240}
                viewBox="0 0 240 240"
                className="flex-shrink-0"
              >
                <circle
                  cx={120}
                  cy={120}
                  r={90}
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth={28}
                />

                {(() => {
                  let enlargedOffset = 0;
                  const enlargedCirc = 2 * Math.PI * 90;
                  return segmentsLayout.map((seg) => {
                    const dash = (seg.count / totalCount) * enlargedCirc;
                    const el = (
                      <circle
                        key={seg.label}
                        cx={120}
                        cy={120}
                        r={90}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={28}
                        strokeDasharray={`${dash} ${enlargedCirc * 10}`}
                        strokeDashoffset={-enlargedOffset}
                        transform="rotate(-90 120 120)"
                        onMouseEnter={() => setActive({ label: seg.label, count: seg.count })}
                        onMouseLeave={() => setActive(null)}
                        className="cursor-pointer transition-all duration-300 hover:stroke-[32px]"
                      />
                    );
                    enlargedOffset += dash;
                    return el;
                  });
                })()}
              </svg>
              <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                {active ? (
                  <>
                    <span className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                      {active.label}
                    </span>
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {active.count}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {totalCount}
                    </span>
                    <span className="text-sm text-gray-400 uppercase">
                      Total
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 w-full max-w-md">
              {segmentsLayout.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center gap-3 text-base text-gray-600 dark:text-gray-300"
                >
                  <span
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                    style={{ background: s.color }}
                  />

                  <PlatformIcon
                    platform={s.label}
                    color={s.color}
                    className="h-5 w-5 flex-shrink-0"
                  />

                  <span className="flex-1">{s.label}</span>

                  <span className="font-semibold text-gray-800 dark:text-white text-lg">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
  );
};
