import { CardHeader, CardTitle } from "@/components/atoms/card";
import { Globe, Maximize2, X, InfoIcon, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useUserMertices } from "../hooks/useDashboardData";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { LazySectionSkeleton } from "../AnnamDashboard_dev";
import { UsersListModal } from "./UsersListModal";

// interface PlatformData {
//   // count: number;
//   // platform: string;
// }

interface PlatformIconProps {
  platform: string;
  color: string;
  className?: string;
}

interface PlatformDonutSegmentsProps {
  // rawData: PlatformData[];
  source: string,
  userType: string,
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

 const PlatformDonutSegments: React.FC<PlatformDonutSegmentsProps> = ({
  source, userType
}) => {
      const { data: userMetricesData, isLoading: usermetricsLoading, isFetching: usermetricsFetching } = useUserMertices(source, userType);
  const [active, setActive] = useState<null | { label: string; count: number }>(
    null,
  );
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<null | { label: string; count: number }>(null);

  const PLATFORM_COLORS: Record<string, string> = {
    Android: "#22c55e",
    Windows: "#3b82f6",
    MacOS: "#64748b",
    iOS: "#0ea5e9",
    Linux: "#eab308",
    default: "#9ca3af",
  };

  const { segmentsLayout, totalCount } = useMemo(() => {
    const total = userMetricesData?.platformInstalls?.reduce((sum, item) => sum + item.count, 0);
    const layout = userMetricesData?.platformInstalls?.map((item) => ({
      label: item.platform,
      count: item.count,
      color: PLATFORM_COLORS[item.platform] || PLATFORM_COLORS.default,
    }));
    return { segmentsLayout: layout, totalCount: total };
  }, [userMetricesData]);

  const isEmpty = userMetricesData?.platformInstalls?.length === 0 || totalCount === 0;

  const VIEW = 130;
  const r = 48;
  const cx = VIEW / 2;
  const cy = VIEW / 2;
  const circ = 2 * Math.PI * r;
  const queryClient = useQueryClient();
  const [dataRefreshing, setDataRefreshing] = useState(false);
  const handleRefresh = async ()=>{
    setDataRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["user-metrices"] });
    setDataRefreshing(false);
  }

  const renderDonut = (size: number, radius: number, stroke: number) => {
    const c = size / 2;
    const fullCirc = 2 * Math.PI * radius;
    let off = 0;
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="flex-shrink-0 -rotate-90"
      >
        <defs>
          {segmentsLayout?.map((s) => (
            <linearGradient
              key={s.label}
              id={`grad-${s.label}-${size}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity={1} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.7} />
            </linearGradient>
          ))}
        </defs>
        <circle
          cx={c}
          cy={c}
          r={radius}
          fill="none"
          className="stroke-muted/40"
          strokeWidth={stroke}
        />
        {segmentsLayout?.map((seg) => {
          const dash = (seg.count / totalCount) * fullCirc;
          const el = (
            <circle
              key={seg.label}
              cx={c}
              cy={c}
              r={radius}
              fill="none"
              stroke={`url(#grad-${seg.label}-${size})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${fullCirc * 10}`}
              strokeDashoffset={-off}
              onMouseEnter={() =>
                setActive({ label: seg.label, count: seg.count })
              }
              onMouseLeave={() => setActive(null)}
              className="cursor-pointer transition-all duration-300 hover:opacity-80"
              style={{
                filter:
                  active?.label === seg.label
                    ? `drop-shadow(0 0 6px ${seg.color})`
                    : undefined,
              }}
            />
          );
          off += dash;
          return el;
        })}
      </svg>
    );
  };

  return (
    <>
      <div className="group relative w-full h-full p-5 rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <div className="flex items-center gap-2 mb-4">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
          <h3 className="text-xs font-semibold tracking-wider uppercase text-foreground/60 flex items-center gap-1.5">
            <span>Installations by Platform</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground">
                  <InfoIcon className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="normal-case tracking-normal">
                Shows user distribution split across different operating systems (Android, iOS, Windows, macOS, Linux).
              </TooltipContent>
            </Tooltip>
          </h3>
            <button
              onClick={handleRefresh}
              className="rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
              title="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  dataRefreshing ? "animate-spin" : ""
                }`}
              />
            </button>
        </div>
        {dataRefreshing ? (
            <div>
              <LazySectionSkeleton/>
            </div>
          ):(
            <>
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 py-6 flex-1">
            <svg width={120} height={120}>
              <circle
                cx="60"
                cy="60"
                r="45"
                fill="none"
                className="stroke-muted/40"
                strokeWidth="12"
              />
            </svg>
            <p className="text-xs text-muted-foreground italic">
              No platform data available
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full flex-1">
            <div className="relative flex items-center justify-center">
              {renderDonut(VIEW, r, 14)}
              <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                {active ? (
                  <>
                    <span className="text-[11px] font-medium text-foreground/70 uppercase tracking-wide">
                      {active.label}
                    </span>
                    <span className="text-xl font-bold text-foreground tabular-nums">
                      {active.count}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xl font-bold text-foreground tabular-nums">
                      {totalCount}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Total
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 w-full">
              {segmentsLayout?.map((s) => {
                const pct = ((s.count / totalCount) * 100).toFixed(1);
                const isActive = active?.label === s.label;
                return (
                  <div
                    key={s.label}
                    onMouseEnter={() =>
                      setActive({ label: s.label, count: s.count })
                    }
                    onMouseLeave={() => setActive(null)}
                    onClick={() => setSelectedPlatform({ label: s.label, count: s.count })}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                      isActive ? "bg-muted/60" : "hover:bg-muted/40"
                    }`}
                  >
                    <span className="relative flex items-center justify-center">
                      <span
                        className="absolute w-4 h-4 rounded-full opacity-25"
                        style={{ background: s.color }}
                      />
                      <PlatformIcon
                        platform={s.label}
                        color={s.color}
                        className="h-3.5 w-3.5 relative"
                      />
                    </span>
                    <span className="flex-1 truncate text-foreground/80 font-medium">
                      {s.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {pct}%
                    </span>
                    <span className="font-semibold text-foreground tabular-nums min-w-[2ch] text-right">
                      {s.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </>)}
      </div>

      {selectedPlatform && (
        <UsersListModal
          isOpen={Boolean(selectedPlatform)}
          onClose={() => setSelectedPlatform(null)}
          title={`Users on ${selectedPlatform.label}`}
          source={source as "vicharanashala" | "annam" | "whatsapp"}
          userType={userType as "all" | "external" | "internal"}
          dynamicFieldLabel="Platform"
          dynamicFieldKey="platform"
          initialFilterValue={selectedPlatform.label}
          category="platform"
          value={selectedPlatform.label}
        />
      )}

      {/* Maximized Modal */}
      {isMaximized &&
        !isEmpty &&
        createPortal(
          <div
            className="fixed inset-0 bg-background/70 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setIsMaximized(false)}
          >
            <div
              className="relative w-full max-w-4xl rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/80 backdrop-blur-xl shadow-2xl p-8 animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent rounded-t-2xl" />

              <button
                onClick={() => setIsMaximized(false)}
                className="absolute top-4 right-4 p-2 rounded-md hover:bg-muted transition-colors"
                title="Close"
              >
                <X className="w-5 h-5 text-foreground/70" />
              </button>

              <div className="mb-8">
                <h3 className="text-xl font-semibold text-foreground">
                  Installations by Platform
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalCount.toLocaleString()} total installations across{" "}
                  {segmentsLayout.length} platforms
                </p>
              </div>

              <div className="flex flex-col lg:flex-row items-center justify-center gap-12 w-full">
                <div className="relative flex items-center justify-center">
                  {renderDonut(260, 95, 30)}
                  <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                    {active ? (
                      <>
                        <span className="text-sm font-medium text-foreground/70 uppercase tracking-wide">
                          {active.label}
                        </span>
                        <span className="text-4xl font-bold text-foreground tabular-nums">
                          {active.count}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums mt-1">
                          {((active.count / totalCount) * 100).toFixed(1)}%
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl font-bold text-foreground tabular-nums">
                          {totalCount}
                        </span>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                          Total
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 w-full max-w-md">
                  {segmentsLayout.map((s) => {
                    const pct = ((s.count / totalCount) * 100).toFixed(1);
                    const isActive = active?.label === s.label;
                    return (
                      <div
                        key={s.label}
                        onMouseEnter={() =>
                          setActive({ label: s.label, count: s.count })
                        }
                        onMouseLeave={() => setActive(null)}
                        onClick={() => setSelectedPlatform({ label: s.label, count: s.count })}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                          isActive
                            ? "bg-muted/70 ring-1 ring-border"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <span className="relative flex items-center justify-center">
                          <span
                            className="absolute w-7 h-7 rounded-full opacity-25"
                            style={{ background: s.color }}
                          />
                          <PlatformIcon
                            platform={s.label}
                            color={s.color}
                            className="h-5 w-5 relative"
                          />
                        </span>
                        <span className="flex-1 text-base font-medium text-foreground/90">
                          {s.label}
                        </span>
                        <div className="flex flex-col items-end">
                          <span className="text-lg font-bold text-foreground tabular-nums">
                            {s.count}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {pct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default PlatformDonutSegments;