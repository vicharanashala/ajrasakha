import React, { useState, useRef, useCallback, useMemo, Suspense } from "react";
import { cn } from "@/lib/utils";
import { useDashboardData } from "./hooks/useDashboardData";
import { useDailyUserTrend } from "./hooks/useDailyUserTrend";
import type { Segment } from "./types";
import { DashboardSidebar } from "./DashboardSidebar";
import type { DashboardView } from "./DashboardSidebar";
import { DashboardFilters } from "./DashboardFilters";
import type { DashboardFilterValues } from "./DashboardFilters";
import { EightCardsComponent } from "./MetricCard ";
import DailyActiveUsers from "./dailyActiveUsers";
import { ChannelSplitCard } from "./components/ChannelSplitCard";
import { DashboardQueryCategories } from "./DashboardQueryCategories";
import { DashboardFarmerSegments } from "./DashboardFarmerSegments";
import { AlertCard } from "./AlertCard";
import { Spinner } from "@/components/atoms/spinner";
import { GeoCard } from "./GeoCard";
import { HealthScoreCard } from "./HealthScoreCard";
import { SegmentDetailBanner } from "./components/SegmentDetailBanner";
import { StatusBar } from "./components/StatusBar";
import { UserDetailsView } from "./UserDetailsView";
import { UserDemographicsSection } from "./components/UserDemographicsSection";
import { useInView } from "@/hooks/useInview";
// import { UserGrowthChart } from "./components/UserGrowthChart";
const LazyUserGrowthChart = React.lazy(() => import("./components/UserGrowthChart"));

const DEFAULT_FILTERS: DashboardFilterValues = {
  village: "all",
  crop: "all",
  season: "all",
  startTime: undefined,
  endTime: undefined,
};

export function AnnamDashboard_dev({ className, source = 'vicharanashala' }: { className?: string; source?: 'vicharanashala' | 'annam' }) {
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [filters, setFilters] = useState<DashboardFilterValues>(DEFAULT_FILTERS);
  const segmentRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const { data, isLoading, error } = useDashboardData(filters, source);
  const { data: dauTrend, isLoading: dauLoading, error: dauError } = useDailyUserTrend(30, source);
  const sectionRefs = useRef<Partial<Record<DashboardView, HTMLDivElement | null>>>({});
  const { ref: growthRef, isVisible: isGrowthVisible } = useInView();
  const scrollTo = (view: DashboardView) => {
    setTimeout(() => sectionRefs.current[view]?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  // remove this varaible when data is dynamci
  const dynamicIds = ['dau', 'queries', 'session'];

  const handleSegmentClick = useCallback((seg: Segment) => {
    if (activeSegment?.id === seg.id) { setActiveSegment(null); return; }
    setActiveSegment(seg);
    setTimeout(() => sectionRefs.current["farmer-segments"]?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }, [activeSegment]);

  const clearSegment = () => setActiveSegment(null);

  // Patch the DAU card to show "today / total" instead of just total
  const patchedKpiRow1 = useMemo(() => {
    if (!data?.kpiRow1) return data.kpiRow1;
    const todayCount = dauTrend && dauTrend.length > 0 ? dauTrend[dauTrend.length - 1] : null;
    return data.kpiRow1.map(card => {
      if (card.id === 'dau' && todayCount !== null) {
        return {
          ...card,
          value: `${todayCount.toLocaleString()} / ${Number(card.value).toLocaleString()}`,
        };
      }
      return card;
    });
  }, [data.kpiRow1, dauTrend]);

  // Remove these two variables when data is dynamic
  const kpiRow1WithOverlay = patchedKpiRow1.map(card => ({
    ...card,
    isDummy: !dynamicIds.includes(card.id),
  }));

  const kpiRow2WithOverlay = data.kpiRow2.map(card => ({
    ...card,
    isDummy: true,
  }));

  return (
    <div className={cn("flex flex-col min-h-screen bg-background", className)}>
      {/* Keyframe animations required by child components (seg-pulse, slideIn) */}
      <style>{`
        @keyframes slideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes custom-pulse { 0%,100%{box-shadow:0 0 0 2.5px #3AAA5A,0 4px 24px rgba(58,170,90,0.18)} 50%{box-shadow:0 0 0 4px #3AAA5A,0 4px 32px rgba(58,170,90,0.28)} }
        .seg-pulse { animation: custom-pulse 1.2s ease 2; }
      `}</style>

      {error && (
        <div className="flex flex-1 items-center justify-center text-destructive">
          Error fetching data: {error.message}
        </div>
      )}

      {!error && data && (
        <>
          <div className="flex flex-1 overflow-hidden">
            <DashboardSidebar
              activeView={activeView}
              onViewChange={(view) => {
                setActiveView(view);
                if (view !== "user-details") scrollTo(view);
              }}
              healthScore={70}
              healthLabel="Moderate · needs improvement"
              source={source}
            />

            {activeView === "user-details" ? (
              <UserDetailsView source={source} />
            ) : (
              <div className="flex-1 overflow-y-auto px-5 pb-5">
                <DashboardFilters
                  filters={filters}
                  onFilterChange={setFilters}
                />

                {activeSegment && (
                  <SegmentDetailBanner
                    seg={activeSegment}
                    onClose={clearSegment}
                  />
                )}

                <div ref={(el) => { sectionRefs.current["overview"] = el; }} className="relative">
                  {isLoading && <Spinner text="Fetching metrics..." fullScreen={false} />}

                  {/* <EightCardsComponent kpiRow1={patchedKpiRow1} kpiRow2={data.kpiRow2} /> */}
                  {/* Uncomment the above line when data is dynamic and delete the below code */}
                  <EightCardsComponent kpiRow1={kpiRow1WithOverlay} kpiRow2={kpiRow2WithOverlay} />
                </div>

                {/* DAU trend + Channel split */}
                <div
                  ref={(el) => {
                    sectionRefs.current["usage-patterns"] = el;
                    growthRef.current = el;
                  }}
                  className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 mb-4"
                >
                  {/* <DailyActiveUsers
                    data={dauTrend}
                    isLoading={dauLoading}
                    error={dauError}
                  /> */}
                  {isGrowthVisible ? (
                    <Suspense fallback={<Spinner/>}>
                      <LazyUserGrowthChart />
                    </Suspense>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-gray-400">
                      {/* <Spinner text="Loading chart..." /> */}
                      <div className="h-[300px] bg-gray-100 dark:bg-[#1a1a1a] animate-pulse rounded-xl" />
                    </div>
                  )}
                  <ChannelSplitCard
                    channelSplit={data.channelSplit}
                    voiceAccuracy={data.voiceAccuracy}
                  />
                </div>

                {/* Demographics */}
                <UserDemographicsSection
                  data={{
                    ageGroups: data.ageGroups,
                    genderSplit: data.genderSplit,
                    farmingExperience: data.farmingExperience,
                  }}
                />

                {/* 3-col row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                  <div
                    ref={(el) => {
                      sectionRefs.current["query-analysis"] = el;
                    }}
                  >
                    <DashboardQueryCategories
                      categories={data.queryCategories}
                    />
                  </div>
                  <div
                    ref={(el) => {
                      sectionRefs.current["farmer-segments"] = el;
                    }}
                  >
                    {/* <DashboardFarmerSegments
                      segments={data.farmerSegments}
                      activeSegment={activeSegment}
                      onSegmentClick={handleSegmentClick}
                      onClear={clearSegment}
                      segmentRowRefs={segmentRowRefs}
                    /> */}
                    {/* Knowledge & Awareness */}
                    <div className="rounded-xl border border-gray-200 bg-white dark:border-[#2a2a2a] dark:bg-[#1a1a1a] p-4 h-full">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
                        Knowledge & Awareness
                      </div>
                      <div className="flex gap-6 justify-center items-center h-[calc(100%-2rem)]">
                        {/* KCC Awareness Circle */}
                        {(() => {
                          const pct = data.kccAwareness?.[0]?.pct ?? 0;
                          const r = 45,
                            cx = 60,
                            cy = 60,
                            circ = 2 * Math.PI * r;
                          const dash = (pct / 100) * circ;
                          return (
                            <div className="flex flex-col items-center gap-2">
                              <svg
                                width={120}
                                height={120}
                                viewBox="0 0 120 120"
                              >
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={r}
                                  fill="none"
                                  stroke="#e5e7eb"
                                  strokeWidth={10}
                                />
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={r}
                                  fill="none"
                                  stroke="#3AAA5A"
                                  strokeWidth={10}
                                  strokeDasharray={`${dash} ${circ - dash}`}
                                  strokeDashoffset={circ / 4}
                                  transform={`rotate(-90 ${cx} ${cy})`}
                                />
                                <text
                                  x={cx}
                                  y={cy + 6}
                                  textAnchor="middle"
                                  fontSize={16}
                                  fontWeight={600}
                                  fill="#3AAA5A"
                                >
                                  {pct}%
                                </text>
                              </svg>
                              <span className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                KCC Awareness
                              </span>
                            </div>
                          );
                        })()}
                        {/* Uses Agri Apps Circle */}
                        {(() => {
                          const pct = data.agriAppUsage?.[0]?.pct ?? 0;
                          const r = 45,
                            cx = 60,
                            cy = 60,
                            circ = 2 * Math.PI * r;
                          const dash = (pct / 100) * circ;
                          return (
                            <div className="flex flex-col items-center gap-2">
                              <svg
                                width={120}
                                height={120}
                                viewBox="0 0 120 120"
                              >
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={r}
                                  fill="none"
                                  stroke="#e5e7eb"
                                  strokeWidth={10}
                                />
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={r}
                                  fill="none"
                                  stroke="#378ADD"
                                  strokeWidth={10}
                                  strokeDasharray={`${dash} ${circ - dash}`}
                                  strokeDashoffset={circ / 4}
                                  transform={`rotate(-90 ${cx} ${cy})`}
                                />
                                <text
                                  x={cx}
                                  y={cy + 6}
                                  textAnchor="middle"
                                  fontSize={16}
                                  fontWeight={600}
                                  fill="#378ADD"
                                >
                                  {pct}%
                                </text>
                              </svg>
                              <span className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                Uses Agri Apps
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <div
                    ref={(el) => {
                      sectionRefs.current["bugs-ux"] = el;
                    }}
                  >
                    <AlertCard alerts={data.alerts} />
                  </div>
                </div>

                {/* Geo + Health */}
                <div
                  ref={(el) => {
                    sectionRefs.current["geo-intelligence"] = el;
                  }}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4"
                >
                  <GeoCard states={data.geoStates} />
                  <div
                    ref={(el) => {
                      sectionRefs.current["app-health"] = el;
                    }}
                  >
                    <HealthScoreCard pillars={data.healthPillars} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <StatusBar
            lastSync={data.meta.lastSync}
            datasetVersion={data.meta.datasetVersion}
            llmVersion={data.meta.llmVersion}
            p0Bugs={data.meta.p0Bugs}
          />
        </>
      )}
    </div>
  );
}
