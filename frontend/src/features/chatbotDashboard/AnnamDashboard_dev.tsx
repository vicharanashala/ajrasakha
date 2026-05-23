import React, { useState, useRef, useCallback, useMemo, Suspense, useEffect } from "react";
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
import { DuplicateQuestionsModal } from "./components/DuplicateQuestionsModal";
import { Spinner } from "@/components/atoms/spinner";
import { GeoCard } from "./GeoCard";
import { HealthScoreCard } from "./HealthScoreCard";
import { SegmentDetailBanner } from "./components/SegmentDetailBanner";
import { StatusBar } from "./components/StatusBar";
import { UserDetailsView } from "./UserDetailsView";
import { UserDemographicsSection } from "./components/UserDemographicsSection";
// import { UserGrowthChart } from "./components/UserGrowthChart";
const LazyUserGrowthChart = React.lazy(
  () => import("./components/UserGrowthChart"),
);
import type { UserDetailsFilters } from "./components/UserDetailsPreferenceFilter";
import { TopCropsCard } from "./components/TopCropsCard";
import { useTopCrops } from "./hooks/useTopCrops";
import { DailyQuestionTrendsChart } from "./components/DailyQuestionTrendsChart";
import { TopFaqsLeaderboard } from "./components/TopFaqsLeaderboard";
import { useInView } from "@/hooks/useInView";
import { PlatformDonutSegments } from "./components/PlatformDonutSegment";
import { Maximize2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { SearchableSelect } from "@/components/atoms/SearchableSelect";
import type { DateRange } from "react-day-picker";
import { DashboardStateWiseAnalytics } from "./DashboardQueryState";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import FeedbackCard from "./FeedbackCard";
import { ResponseAdherenceTableCard } from "./components/ResponseAdherenceTableCard";
import { ActiveUsersChart } from "./active-users";
import NewFilters, { type Filters } from "./NewFilters";
import { WeatherConcernAnalyticsCard } from "./components/WeatherConcernAnalyticsCard";
import {
  DEFAULT_WEATHER_CONCERN_FILTERS,
  type WeatherConcernFilters,
} from "./hooks/useWeatherConcernAnalytics";
import { WhatsAppAnalyticsCard } from "./WhatsAppAnalyticsCard";

const DEFAULT_FILTERS: DashboardFilterValues = {
  village: "all",
  crop: "all",
  season: "all",
  startTime: undefined,
  endTime: undefined,
  userType: "all",
};

const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseInputDateToLocalDate = (value: string): Date => {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export function AnnamDashboard_dev({ className, source = 'annam', onSourceChange }: { className?: string; source?: 'vicharanashala' | 'annam' | 'whatsapp'; onSourceChange?: (source: 'vicharanashala' | 'annam' | 'whatsapp') => void }) {
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [filters, setFilters] =
    useState<DashboardFilterValues>(DEFAULT_FILTERS);
  const segmentRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const { data, isLoading, error } = useDashboardData(
    filters,
    source,
    source === "annam" || source === "vicharanashala",
  );
console.log(source,"----data-----", data,)
  const [trendsDateRange, setTrendsDateRange] = useState<DateRange | undefined>(undefined);
  const [faqsDateRange, setFaqsDateRange] = useState<DateRange | undefined>(undefined);
  const [responseAdherenceDate, setResponseAdherenceDate] = useState<string>(
    formatDateForInput(new Date()),
  );

  const trendsFilters = useMemo(() => ({
    ...filters,
    startTime: trendsDateRange?.from,
    endTime: trendsDateRange?.to,
  }), [filters, trendsDateRange]);

  const faqsFilters = useMemo(() => ({
    ...filters,
    startTime: faqsDateRange?.from,
    endTime: faqsDateRange?.to,
  }), [filters, faqsDateRange]);

  const { data: trendsData, isLoading: trendsLoading } = useDashboardData(
    trendsFilters,
    source,
    source === "annam" || source === "vicharanashala",
  );
  const { data: faqsData, isLoading: faqsLoading } = useDashboardData(
    faqsFilters,
    source,
    source === "annam" || source === "vicharanashala",
  );

  const responseAdherenceFilters = useMemo(() => {
    const selectedDate = parseInputDateToLocalDate(responseAdherenceDate);
    const startTime = new Date(selectedDate);
    startTime.setHours(0, 0, 0, 0);

    const endTime = new Date(selectedDate);
    const now = new Date();
    const isSelectedToday =
      selectedDate.getFullYear() === now.getFullYear() &&
      selectedDate.getMonth() === now.getMonth() &&
      selectedDate.getDate() === now.getDate();

    if (isSelectedToday) {
      endTime.setHours(
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        now.getMilliseconds(),
      );
    } else {
      endTime.setHours(23, 59, 59, 999);
    }

    return {
      ...filters,
      startTime,
      endTime,
    };
  }, [filters, responseAdherenceDate]);

  const {
    data: responseAdherenceData,
    isLoading: isResponseAdherenceLoading,
  } = useDashboardData(responseAdherenceFilters, source);

  // console.log("Dashboard data:", data);
  const {
    data: dauTrend,
    isLoading: dauLoading,
    error: dauError,
  } = useDailyUserTrend(
    30,
    source,
    filters.userType,
    source === "annam" || source === "vicharanashala",
  );
  const [userDetailsInitialFilters, setUserDetailsInitialFilters] = useState<
    Partial<UserDetailsFilters> | undefined
  >(undefined);
  const {
    data: topCrops,
    isLoading: isLoadingTopCrops,
    error: errorLoadingtopCrops,
  } = useTopCrops();
  const [isKnowledgeMaximized, setIsKnowledgeMaximized] = useState(false);

  const [hovered, setHovered] = useState<string | null>(null);
  const [agriHovered, setAgriHovered] = useState<string | null>(null);

  const sectionRefs = useRef<
    Partial<Record<DashboardView, HTMLDivElement | null>>
  >({});
  const { ref: growthRef, isVisible: isGrowthVisible } = useInView();
  const scrollTo = (view: DashboardView) => {
    setTimeout(
      () =>
        sectionRefs.current[view]?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      50,
    );
  };

  // remove this varaible when data is dynamci
  const dynamicIds = ["dau", "queries", "session"];

  const handleSegmentClick = useCallback(
    (seg: Segment) => {
      if (activeSegment?.id === seg.id) {
        setActiveSegment(null);
        return;
      }
      setActiveSegment(seg);
      setTimeout(
        () =>
          sectionRefs.current["farmer-segments"]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          }),
        50,
      );
    },
    [activeSegment],
  );

  const clearSegment = () => setActiveSegment(null);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Navigate to User Details with low-feedback-only filter pre-applied
  const handleLowFeedbackUsersClick = useCallback(() => {
    setUserDetailsInitialFilters({
      lowFeedbackOnly: true,
      inactiveOnly: false,
      search: "",
      crop: "",
      village: "",
      profileCompleted: "all",
    });
    setActiveView("user-details");
  }, []);

  // Navigate to User Details with inactive-only filter pre-applied
  const handleInactiveUsersClick = useCallback(() => {
    // Align to midnight to match the backend KPI calculation in getKpiSummary
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    threeDaysAgo.setHours(0, 0, 0, 0);

    // End of today (the useUserDetails hook adds +24h to endDate internally,
    // so we set this to the start of today to cover through end-of-today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    setUserDetailsInitialFilters({
      inactiveOnly: true,
      startTime: threeDaysAgo,
      endTime: today,
      search: "",
      crop: "",
      village: "",
      profileCompleted: "all",
    });
    setActiveView("user-details");
  }, []);

  // Patch the DAU card to show "today / total" instead of just total
  const patchedKpiRow1 = useMemo(() => {
    if (!data?.kpiRow1) return data.kpiRow1;
    const todayCount =
      dauTrend && dauTrend.length > 0 ? dauTrend[dauTrend.length - 1] : null;
    return data.kpiRow1.map((card) => {
      if (card.id === "dau" && todayCount !== null) {
        return {
          ...card,
          value: `${todayCount.toLocaleString()} / ${Number(card.value).toLocaleString()}`,
        };
      }
      return card;
    });
  }, [data.kpiRow1, dauTrend]);

  // Remove these two variables when data is dynamic
  const kpiRow1WithOverlay = patchedKpiRow1
    .filter((card) => dynamicIds.includes(card.id)) // Commented out dummy cards: filter only dynamic ones
    .map((card) => ({
      ...card,
      isDummy: !dynamicIds.includes(card.id),
    }));

  const kpiRow2WithOverlay = data.kpiRow2
    .filter((card) => card.id === "totalInstalls") // Commented out dummy cards: filter only totalInstalls
    .map((card) => ({
      ...card,
      // isDummy: false, // temporarily disabled for testing
      isDummy: card.id !== "totalInstalls",
    }));

  const [newFilters, setNewFilters] = useState<Filters>({
    sourceType: "application",
    application: "annam",
  });
  const [weatherConcernFilters, setWeatherConcernFilters] =
    useState<WeatherConcernFilters>(DEFAULT_WEATHER_CONCERN_FILTERS);


const queryCard =
  data?.kpiRow1?.find(
    (card) => card.id === "queries"
  );

const dailyAnalytics =
  queryCard?.dailyAnalytics || [];

const weeklyAnalytics =
  queryCard?.weeklyAnalytics || [];

const monthlyAnalytics =
  queryCard?.monthlyAnalytics || [];


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
                scrollTo(view);
                // Clear AlertCard's pre-set filters when navigating via sidebar
                // if (view === "user-details")
                //   setUserDetailsInitialFilters(undefined);
                // if (view !== "user-details") scrollTo(view);
              }}
              healthScore={70}
              healthLabel="Moderate · needs improvement"
              source={source}
            />

              <div className="flex-1 overflow-y-auto px-5 pb-5"  >
                {/* Source Selection Tabs & All Users Filter */}
                <div className="flex items-center justify-between gap-4 border-b border-border pb-3 mb-5 pt-3">

                  {/* Top Level Tabs */}
                    <div className="flex items-center gap-2" >
                      {/* Application Tab */}
                      <button
                        onClick={() =>
                          setNewFilters((prev) => ({
                            ...prev,
                            sourceType: "application",
                          }))
                        }
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          newFilters.sourceType === "application"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        Application
                      </button>

                      {/* Manual Tab (Muted/Disabled) */}
                      <button
                        disabled
                        className="px-4 py-1.5 rounded-lg text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
                      >
                        Manual
                      </button>
                    </div>

                    <div className="flex items-center ml-auto gap-1">
                      <NewFilters
                        filters={newFilters}
                        onChange={setNewFilters}
                        onSourceChange={onSourceChange}
                      />

                    <SearchableSelect
                      options={["External", "Internal"]}
                      value={
                          filters.userType === "all"
                            ? "all"
                            : filters.userType.charAt(0).toUpperCase() +
                              filters.userType.slice(1)
                        }
                        onChange={(v) =>
                          setFilters((prev) => ({
                            ...prev,
                            userType: (v === "all"
                              ? "all"
                              : v.toLowerCase()) as DashboardFilterValues["userType"],
                          }))
                        }
                      placeholder="All Users"
                      className="text-sm h-10 px-3 border border-green-500 dark:border-green-500 rounded-md bg-green-50 dark:bg-[#1a1a1a] text-green-700 dark:text-green-400 font-medium cursor-pointer outline-none w-full lg:min-w-[150px] lg:w-auto shadow-sm transition-all hover:bg-green-100 dark:hover:bg-[#2a2a2a]"
                      activeClassName="text-sm h-10 px-3 border border-green-500 dark:border-green-500 rounded-md bg-green-50 dark:bg-[#1a1a1a] text-green-700 dark:text-green-400 font-medium cursor-pointer outline-none w-full lg:min-w-[150px] lg:w-auto shadow-sm transition-all hover:bg-green-100 dark:hover:bg-[#2a2a2a]"
                    />
                  </div>
                </div>

                <DashboardFilters
                  filters={filters}
                  onFilterChange={setFilters}
                />
            {(source === "annam" || source === "vicharanashala" || source === "whatsapp") && (
              <div
                ref={(el) => {
                  sectionRefs.current["overview"] = el;
                }}
                className="relative"
              >
                {activeSegment && (
                  <SegmentDetailBanner
                    seg={activeSegment}
                    onClose={clearSegment}
                  />
                )}

                <div
                  ref={(el) => {
                    sectionRefs.current["overview"] = el;
                  }}
                  className="relative"
                >
                  {isLoading && (
                    <Spinner
                      text="Fetching metrics..."
                      fullScreen={false}
                    />
                  )}

                  {/* <EightCardsComponent kpiRow1={patchedKpiRow1} kpiRow2={data.kpiRow2} /> */}
                  {/* Uncomment the above line when data is dynamic and delete the below code */}
                  {(source === "annam" || source === "vicharanashala") &&
                   <EightCardsComponent
                    kpiRow1={kpiRow1WithOverlay}
                    kpiRow2={kpiRow2WithOverlay}
                    source={source}
                  />}
                  {source === "whatsapp" && 
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

                      <WhatsAppAnalyticsCard
                        title="Daily Queries"
                        analytics={dailyAnalytics}
                        granularity="daily"
                      />

                      <WhatsAppAnalyticsCard
                        title="Weekly Queries"
                        analytics={weeklyAnalytics}
                        granularity="weekly"
                      />

                      <WhatsAppAnalyticsCard
                        title="Monthly Queries"
                        analytics={monthlyAnalytics}
                        granularity="monthly"
                      />

                    </div>
                  }

                  <ResponseAdherenceTableCard
                    data={
                      (responseAdherenceData as any).responseAdherenceTable ??
                      (data as any).responseAdherenceTable
                    }
                    selectedDate={responseAdherenceDate}
                    onSelectedDateChange={setResponseAdherenceDate}
                    isLoading={isResponseAdherenceLoading}
                  />
                </div>

                {/* DAU trend + Alerts */}
                <div
                  ref={(el) => {
                    sectionRefs.current["usage-patterns"] = el;
                    growthRef.current = el;
                  }}
                  className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 mb-4 items-stretch"
                >
                  {/* <DailyActiveUsers
                    data={dauTrend}
                    isLoading={dauLoading}
                    error={dauError}
                  /> */}
                  {/* {isGrowthVisible ? source === "whatsapp" ?(<div className="h-full w-full blur-sm opacity-90"></div>):( */}
                  {isGrowthVisible ? (
                    <Suspense fallback={<Spinner />}>
                      <LazyUserGrowthChart source={source}/>
                    </Suspense>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-gray-400">
                      {/* <Spinner text="Loading chart..." /> */}
                      <div className="h-[300px] bg-gray-100 dark:bg-[#1a1a1a] animate-pulse rounded-xl" />
                    </div>
                  )}

                  <div
                    ref={(el) => {
                      sectionRefs.current["bugs-ux"] = el;
                    }}
                  >
                    <AlertCard
                      alerts={data.alerts}
                      inactiveUsersLast3Days={
                        (data as any).inactiveUsersLast3Days ?? 0
                      }
                      onInactiveClick={handleInactiveUsersClick}
                      duplicateQuestionsCount={
                        (data as any).duplicateQuestionsCount ?? 0
                      }
                      onDuplicateClick={() => setIsDuplicateModalOpen(true)}
                      lowFeedbackUsersCount={
                        (data as any).lowFeedbackUsersCount ?? null
                      }
                      onLowFeedbackClick={handleLowFeedbackUsersClick}
                      source = {source}
                    />
                    {isDuplicateModalOpen && (
                      <DuplicateQuestionsModal
                        onClose={() => setIsDuplicateModalOpen(false)}
                        source={source}
                      />
                    )}
                  </div>
                </div>

                {/* Demographics */}
                {source !== "whatsapp" && 
                <div
                  ref={(el) => {
                    sectionRefs.current["demographics"] = el;
                  }}
                >
                  <UserDemographicsSection
                    data={{
                      ageGroups: data.ageGroups,
                      genderSplit: data.genderSplit,
                      farmingExperience: data.farmingExperience,
                      landHolding: (data as any).landHolding ?? [],
                    }}
                  />
                </div>
                }
                {/* 2-col row */}
                
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-4 items-stretch">
                  {source !== "whatsapp" && 
                  <div className="lg:col-span-2">
                    <PlatformDonutSegments
                          rawData={data.platformInstalls}
                        />
                  </div>
                  }
                  {source !== "whatsapp" && 
                  <div  
                    className="lg:col-span-2"
                    ref={(el) => {
                      sectionRefs.current["farmer-segments"] = el;
                    }}
                  >
                    {/* Knowledge & Awareness */}
                    <>
                      <div className="rounded-xl border border-gray-200 bg-white dark:border-[#2a2a2a] dark:bg-[#1a1a1a] p-4 h-full relative">
                        {/* Maximize Button */}
                        <button
                          onClick={() => setIsKnowledgeMaximized(true)}
                          className="absolute top-3 right-3 p-1.5 rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm z-20"
                          title="Maximize chart"
                        >
                          <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                        </button>

                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
                          Knowledge & Awareness
                        </div>
                        <div className="flex flex-wrap gap-4 justify-center items-center h-[calc(100%-2rem)] overflow-hidden">
                          {/* KCC Awareness Circle */}
                          {(() => {
                            const pct =
                              data.kccAwareness?.[0]?.count +
                                data.kccAwareness?.[1]?.count || 0;
                            const r = 45,
                              cx = 60,
                              cy = 60,
                              circ = 2 * Math.PI * r;
                            // const dash = (pct / 100) * circ;
                            const yesDash =
                              (data.kccAwareness?.[0]?.count / pct) * circ;
                            const noDash =
                              (data.kccAwareness?.[1]?.count / pct) * circ;
                            return (
                              <div className="flex flex-col items-center gap-2 min-w-0">
                                {/* <svg
                                viewBox="0 0 120 120"
                                className="w-[100px] h-[100px] lg:w-[110px] lg:h-[110px] shrink-0"
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
                                  strokeDasharray={`${aware} ${circ - dash}`}
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
                                  Total {pct}
                                </text>
                              </svg> */}

                                <svg
                                  viewBox="0 0 120 120"
                                  className="w-[110px] h-[110px]"
                                >
                                  {/* Background Ring */}
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill="none"
                                    stroke="#2f3542"
                                    strokeWidth={10}
                                  />

                                  {/* YES SEGMENT */}
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill="none"
                                    stroke="#22c55e"
                                    strokeWidth={
                                      hovered === "yes" ? 14 : 10
                                    }
                                    strokeDasharray={`${yesDash} ${circ}`}
                                    strokeDashoffset={0}
                                    transform={`rotate(-90 ${cx} ${cy})`}
                                    strokeLinecap="butt"
                                    className="transition-all duration-300 cursor-pointer"
                                    onMouseEnter={() => setHovered("yes")}
                                    onMouseLeave={() => setHovered(null)}
                                  />

                                  {/* NO SEGMENT */}
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill="none"
                                    stroke="#6b7280"
                                    strokeWidth={hovered === "no" ? 14 : 10}
                                    strokeDasharray={`${noDash} ${circ}`}
                                    strokeDashoffset={-yesDash}
                                    transform={`rotate(-90 ${cx} ${cy})`}
                                    strokeLinecap="butt"
                                    className="transition-all duration-300 cursor-pointer"
                                    onMouseEnter={() => setHovered("no")}
                                    onMouseLeave={() => setHovered(null)}
                                  />

                                  {/* CENTER TEXT */}
                                  <text
                                    x={cx}
                                    y={cy - 2}
                                    textAnchor="middle"
                                    fontSize={hovered ? 16 : 18}
                                    fontWeight={700}
                                    fill="#ffffff"
                                  >
                                    {hovered === "yes"
                                      ? `${data.kccAwareness?.[0]?.count ?? 0}`
                                      : hovered === "no"
                                        ? `${data.kccAwareness?.[1]?.count ?? 0}`
                                        : pct}
                                  </text>

                                  <text
                                    x={cx}
                                    y={cy + 18}
                                    textAnchor="middle"
                                    fontSize={11}
                                    fill="#9ca3af"
                                  >
                                    {hovered === "yes"
                                      ? "Aware"
                                      : hovered === "no"
                                        ? "Unaware"
                                        : "TOTAL"}
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
                            const pct =
                              data.agriAppUsage?.[0]?.count +
                             data.agriAppUsage?.[1]?.count || 0;
                            const r = 45,
                              cx = 60,
                              cy = 60,
                              circ = 2 * Math.PI * r;
                            // const dash = (pct / 100) * circ;
                            const yesDash =
                              (data.agriAppUsage?.[0]?.count / pct) * circ;
                            const noDash =
                              (data.agriAppUsage?.[1]?.count / pct) * circ;
                            return (
                              <div className="flex flex-col items-center gap-2 min-w-0">
                                {/* <svg
                                  viewBox="0 0 120 120"
                                  className="w-[100px] h-[100px] lg:w-[110px] lg:h-[110px] shrink-0"
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
                                </svg> */}

                                <svg
                                  viewBox="0 0 120 120"
                                  className="w-[110px] h-[110px]"
                                >
                                  {/* Background Ring */}
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill="none"
                                    stroke="#2f3542"
                                    strokeWidth={10}
                                  />

                                  {/* YES SEGMENT */}
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill="none"
                                    stroke="blue"
                                    strokeWidth={
                                      agriHovered === "yes" ? 14 : 10
                                    }
                                    strokeDasharray={`${yesDash} ${circ}`}
                                    strokeDashoffset={0}
                                    transform={`rotate(-90 ${cx} ${cy})`}
                                    strokeLinecap="butt"
                                    className="transition-all duration-300 cursor-pointer"
                                    onMouseEnter={() =>
                                      setAgriHovered("yes")
                                    }
                                    onMouseLeave={() =>
                                      setAgriHovered(null)
                                    }
                                  />

                                  {/* NO SEGMENT */}
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill="none"
                                    stroke="#ffff"
                                    strokeWidth={
                                      agriHovered === "no" ? 14 : 10
                                    }
                                    strokeDasharray={`${noDash} ${circ}`}
                                    strokeDashoffset={-yesDash}
                                    transform={`rotate(-90 ${cx} ${cy})`}
                                    strokeLinecap="butt"
                                    className="transition-all duration-300 cursor-pointer"
                                    onMouseEnter={() =>
                                      setAgriHovered("no")
                                    }
                                    onMouseLeave={() =>
                                      setAgriHovered(null)
                                    }
                                  />

                                  {/* CENTER TEXT */}
                                  <text
                                    x={cx}
                                    y={cy - 2}
                                    textAnchor="middle"
                                    fontSize={agriHovered ? 16 : 18}
                                    fontWeight={700}
                                    fill="#ffffff"
                                  >
                                    {agriHovered === "yes"
                                      ? `${data.agriAppUsage?.[0]?.count ?? 0}`
                                      : agriHovered === "no"
                                        ? `${data.agriAppUsage?.[1]?.count ?? 0}`
                                        : pct}
                                  </text>

                                  <text
                                    x={cx}
                                    y={cy + 18}
                                    textAnchor="middle"
                                    fontSize={11}
                                    fill="#9ca3af"
                                  >
                                    {agriHovered === "yes"
                                      ? "Aware"
                                      : agriHovered === "no"
                                        ? "Unaware"
                                        : "TOTAL"}
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

                      {/* Maximized Modal */}
                      {isKnowledgeMaximized &&
                        createPortal(
                          <div
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
                            onClick={() => setIsKnowledgeMaximized(false)}
                          >
                            <div
                              className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-3xl w-full p-8 relative"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() =>
                                  setIsKnowledgeMaximized(false)
                                }
                                className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                title="Close"
                              >
                                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                              </button>

                              <div className="mb-8">
                                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                                  Knowledge & Awareness
                                </h3>
                              </div>

                              <div className="flex flex-wrap gap-12 justify-center items-center">
                                {(() => {
                                  const pct =
                                    data.kccAwareness?.[0]?.count +
                                      data.kccAwareness?.[1]?.count || 0;
                                  const circ = 2 * Math.PI * 90;
                                  // const dash = (pct / 100) * circ;
                                  const yesDash =
                                    (data.kccAwareness?.[0]?.count / pct) *
                                    circ;
                                  const noDash =
                                    (data.kccAwareness?.[1]?.count / pct) *
                                    circ;
                                  const cx = 120,
                                    cy = 120,
                                    r = 90;
                                  return (
                                    <div className="flex flex-col items-center gap-4">
                                      {/* <svg
                                        viewBox="0 0 240 240"
                                        className="w-[200px] h-[200px]"
                                      >
                                        <circle
                                          cx={120}
                                          cy={120}
                                          r={90}
                                          fill="none"
                                          stroke="#e5e7eb"
                                          strokeWidth={20}
                                        />
                                        <circle
                                          cx={120}
                                          cy={120}
                                          r={90}
                                          fill="none"
                                          stroke="#3AAA5A"
                                          strokeWidth={20}
                                          strokeDasharray={`${dash} ${circ - dash}`}
                                          strokeDashoffset={circ / 4}
                                          transform="rotate(-90 120 120)"
                                        />
                                        <text
                                          x={120}
                                          y={130}
                                          textAnchor="middle"
                                          fontSize={32}
                                          fontWeight={600}
                                          fill="#3AAA5A"
                                        >
                                          {pct}%
                                        </text>
                                      </svg> */}

                                      <svg
                                        viewBox="0 0 240 240"
                                        className="w-[200px] h-[200px]"
                                      >
                                        {/* Background Ring */}
                                        <circle
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill="none"
                                          stroke="#2f3542"
                                          strokeWidth={10}
                                        />

                                        {/* YES SEGMENT */}
                                        <circle
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill="none"
                                          stroke="#22c55e"
                                          strokeWidth={
                                            hovered === "yes" ? 14 : 10
                                          }
                                          strokeDasharray={`${yesDash} ${circ}`}
                                          strokeDashoffset={0}
                                          transform={`rotate(-90 ${cx} ${cy})`}
                                          strokeLinecap="butt"
                                          className="transition-all duration-300 cursor-pointer"
                                          onMouseEnter={() =>
                                            setHovered("yes")
                                          }
                                          onMouseLeave={() =>
                                            setHovered(null)
                                          }
                                        />

                                        {/* NO SEGMENT */}
                                        <circle
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill="none"
                                          stroke="#6b7280"
                                          strokeWidth={
                                            hovered === "no" ? 14 : 10
                                          }
                                          strokeDasharray={`${noDash} ${circ}`}
                                          strokeDashoffset={-yesDash}
                                          transform={`rotate(-90 ${cx} ${cy})`}
                                          strokeLinecap="butt"
                                          className="transition-all duration-300 cursor-pointer"
                                          onMouseEnter={() =>
                                            setHovered("no")
                                          }
                                          onMouseLeave={() =>
                                            setHovered(null)
                                          }
                                        />

                                        {/* CENTER TEXT */}
                                        <text
                                          x={120}
                                          y={120}
                                          textAnchor="middle"
                                          fontSize={hovered ? 32 : 32}
                                          fontWeight={700}
                                          fill="#ffffff"
                                        >
                                          {hovered === "yes"
                                            ? `${data.kccAwareness?.[0]?.count ?? 0}`
                                            : hovered === "no"
                                              ? `${data.kccAwareness?.[1]?.count ?? 0}`
                                              : pct}
                                        </text>

                                        <text
                                          x={120}
                                          y={138}
                                          textAnchor="middle"
                                          fontSize={20}
                                          fill="#9ca3af"
                                        >
                                          {hovered === "yes"
                                            ? "Aware"
                                            : hovered === "no"
                                              ? "Unaware"
                                              : "TOTAL"}
                                        </text>
                                      </svg>
                                      <span className="text-base text-gray-600 dark:text-gray-300 text-center font-medium">
                                        KCC Awareness
                                      </span>
                                    </div>
                                  );
                                })()}

                                {(() => {
                                  const pct =
                                    data.agriAppUsage?.[0]?.count +
                                      data.agriAppUsage?.[1]?.count || 0;
                                  const circ = 2 * Math.PI * 90;
                                  // const dash = (pct / 100) * circ;
                                  const yesDash =
                                    (data.kccAwareness?.[0]?.count / pct) *
                                    circ;
                                  const noDash =
                                    (data.kccAwareness?.[1]?.count / pct) *
                                    circ;
                                  const cx = 120,
                                    cy = 120,
                                    r = 90;
                                  return (
                                    <div className="flex flex-col items-center gap-4">
                                      <svg
                                        viewBox="0 0 240 240"
                                        className="w-[200px] h-[200px]"
                                      >
                                        <circle
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill="none"
                                          stroke="#2f3542"
                                          strokeWidth={10}
                                        />

                                        {/* YES SEGMENT */}
                                        <circle
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill="none"
                                          stroke="blue"
                                          strokeWidth={
                                            agriHovered === "yes" ? 14 : 10
                                          }
                                          strokeDasharray={`${yesDash} ${circ}`}
                                          strokeDashoffset={0}
                                          transform={`rotate(-90 ${cx} ${cy})`}
                                          strokeLinecap="butt"
                                          className="transition-all duration-300 cursor-pointer"
                                          onMouseEnter={() =>
                                            setAgriHovered("yes")
                                          }
                                          onMouseLeave={() =>
                                            setAgriHovered(null)
                                          }
                                        />

                                        {/* NO SEGMENT */}
                                        <circle
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill="none"
                                          stroke="#ffff"
                                          strokeWidth={
                                            agriHovered === "no" ? 14 : 10
                                          }
                                          strokeDasharray={`${noDash} ${circ}`}
                                          strokeDashoffset={-yesDash}
                                          transform={`rotate(-90 ${cx} ${cy})`}
                                          strokeLinecap="butt"
                                          className="transition-all duration-300 cursor-pointer"
                                          onMouseEnter={() =>
                                            setAgriHovered("no")
                                          }
                                          onMouseLeave={() =>
                                            setAgriHovered(null)
                                          }
                                        />

                                        {/* CENTER TEXT */}
                                        <text
                                          x={120}
                                          y={120}
                                          textAnchor="middle"
                                          fontSize={agriHovered ? 32 : 32}
                                          fontWeight={700}
                                          fill="#ffffff"
                                        >
                                          {agriHovered === "yes"
                                            ? `${data.agriAppUsage?.[0]?.count ?? 0}`
                                            : agriHovered === "no"
                                              ? `${data.agriAppUsage?.[1]?.count ?? 0}`
                                              : pct}
                                        </text>

                                        <text
                                          x={120}
                                          y={138}
                                          textAnchor="middle"
                                          fontSize={20}
                                          fill="#9ca3af"
                                        >
                                          {agriHovered === "yes"
                                            ? "Aware"
                                            : agriHovered === "no"
                                              ? "Unaware"
                                              : "TOTAL"}
                                        </text>
                                      </svg>
                                      <span className="text-base text-gray-600 dark:text-gray-300 text-center font-medium">
                                        Uses Agri Apps
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>,
                          document.body,
                        )}
                    </>
                  </div>
                  }
                  <div
                    className="lg:col-span-2"
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
                      sectionRefs.current["feedback-sentiment"] = el;
                    }}
                    className="lg:col-span-2"
                  >
                    <TopCropsCard
                      topCrops={topCrops}
                      isLoadingTopCrops={isLoadingTopCrops}
                      errorLoadingtopCrops={errorLoadingtopCrops}
                    />
                  </div>
                </div>
                
                {/* Chatbot Quality & FAQ Analytics Section Header */}
                {/* Daily Trends & FAQ Leaderboard Grid */}
                {/* Row 1: Daily Trends & Feedback Data */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4 mt-6">
                  <DailyQuestionTrendsChart
                    trends={(trendsData as any).dailyQuestionTrends}
                    dateRange={trendsDateRange}
                    onDateRangeChange={setTrendsDateRange}
                    isLoading={trendsLoading}
                  />

                  <FeedbackCard
                    title="Feedback Data"
                    positiveFeedbacksCount={
                      data?.feedbackData?.stats?.positiveCount
                    }
                    negativeFeedbacksCount={
                      data?.feedbackData?.stats?.negativeCount
                    }
                    positiveFeedbacks={
                      data?.feedbackData?.positiveFeedbacks
                    }
                    negativeFeedbacks={
                      data?.feedbackData?.negativeFeedbacks
                    }
                    averageRating={data?.feedbackData?.stats?.averageRating}
                  />
                </div>

                {/* Row 2: State Analytics & FAQ Leaderboard */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                  <DashboardStateWiseAnalytics
                    source={source}
                    userType={filters.userType}
                  />

                  <TopFaqsLeaderboard
                    faqs={(faqsData as any).topFaqs}
                    topQuestionsFromCollection={
                      (faqsData as any).topQuestionsFromCollection
                    }
                    repeatQueryCount={(faqsData as any).repeatQueryCount}
                    repeatQueryRatePct={
                      (faqsData as any).repeatQueryRatePct
                    }
                    avgQuestionsPerUserDay={
                      (faqsData as any).avgQuestionsPerUserDay
                    }
                    dateRange={faqsDateRange}
                    onDateRangeChange={setFaqsDateRange}
                    isLoading={faqsLoading}
                  />
                </div>

                {/* Geo + Health */}
                <div
                  ref={(el) => {
                    sectionRefs.current["geo-intelligence"] = el;
                  }}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4"
                >
                  {/* <ChannelSplitCard
                channelSplit={data.channelSplit}
                voiceAccuracy={data.voiceAccuracy}
              /> */}
                  {/* <DashboardStateWiseAnalytics source={source} userType={filters.userType}/> */}
                  {/* <GeoCard states={data.geoStates} />*/}
                  <div
                    ref={(el) => {
                      sectionRefs.current["app-health"] = el;
                    }}
                  >
                    {/* <FeedbackCard title="Feedback Data" positiveFeedbacksCount={data.feedbackData.stats.positiveCount} negativeFeedbacksCount={data.feedbackData.stats.negativeCount} positiveFeedbacks={data.feedbackData.positiveFeedbacks} negativeFeedbacks={data.feedbackData.negativeFeedbacks} averageRating={data.feedbackData.stats.averageRating}/> */}
                  </div>
                </div>

                <div className="">
                  <ActiveUsersChart
                    source={source}
                    userType={filters.userType}
                  />
                </div>
                <div
                  ref={(el) => {
                    sectionRefs.current["user-details"] = el;
                  }}
                >
                  <UserDetailsView
                    source={source}
                    initialFilters={userDetailsInitialFilters}
                    userType={filters.userType}
                  />
                </div>

                <div className="mt-4 mb-4">
                  <WeatherConcernAnalyticsCard
                    source={source}
                    userType={filters.userType}
                    filters={weatherConcernFilters}
                    onFiltersChange={setWeatherConcernFilters}
                  />
                </div>
              </div>
            )}
          </div>
          </div>

          {/* Commented out footer as requested:
          <StatusBar
            lastSync={data.meta.lastSync}
            datasetVersion={data.meta.datasetVersion}
            llmVersion={data.meta.llmVersion}
            p0Bugs={data.meta.p0Bugs}
          />
          */}
        </>
      )}
    </div>
  );
}
