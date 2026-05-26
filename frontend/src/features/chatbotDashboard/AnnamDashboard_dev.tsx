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
import { WhatsAppUsersView } from "./WhatsAppUsersView";
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
import { useClosedAndNotifedData, useInactiveWhatsappUsers, useQueryCategories, useUniqueWhatsappUsers } from "./hooks/useActiveUsersAnalytics";
import { InactiveUsersModal } from "./InactiveUsersModal";
import { RetentionMetricsChart } from "@/features/chatbotDashboard/retention-metrics";
import { motion, AnimatePresence } from "framer-motion";
import { WhatsAppUniqueUsersCard } from "./WhatsAppUniqueUsersCard";
import { ClosedInLastTwoHoursCard } from "./ClosedInLastTwoHoursCard";
import { ClosedQuestionsCard } from "./ClosedQuestionsCard";
import { CustomerNotificationsCard } from "./CustomerNotificationsCard";

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
  const [
    inactiveUsersPage,
    setInactiveUsersPage,
  ] = useState(1);
  const {data: inactiveWhatsappUsers }= useInactiveWhatsappUsers(inactiveUsersPage);
  const {data: closedAndNotifedData} = useClosedAndNotifedData(source);
  const [
    isInactiveWhatsappModalOpen,
    setIsInactiveWhatsappModalOpen,
  ] = useState(false);
  const handleWhatsappInactiveUsersClick =
    useCallback(() => {
      setInactiveUsersPage(1);
      setIsInactiveWhatsappModalOpen(true);
    }, []);

  const {data: queryCategories} = useQueryCategories(source);
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
    true,
  );
  const { data: faqsData, isLoading: faqsLoading } = useDashboardData(
    faqsFilters,
    source,
    true,
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
  } = useTopCrops(source);
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

useEffect(() => {
  if (source === "whatsapp") {
    setFilters((prev) => ({
      ...prev,
      userType: "all",
    }));
  }
}, [source]);

const {data: unqueWhatsAppUsers} = useUniqueWhatsappUsers();
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

            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {/* Source Selection Tabs & All Users Filter */}
              <div className="flex items-center justify-between gap-4 border-b border-border pb-3 mb-5 pt-3">
                {/* Top Level Tabs */}
                <div className="flex items-center gap-2">
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
                    options={
                      source === "whatsapp" ? [] : ["External", "Internal"]
                    }
                    value={
                      filters.userType === "all"
                        ? "All Users"
                        : filters.userType.charAt(0).toUpperCase() +
                          filters.userType.slice(1)
                    }
                    onChange={(v) =>
                      setFilters((prev) => ({
                        ...prev,
                        userType:
                          v.toLowerCase() as DashboardFilterValues["userType"],
                      }))
                    }
                    placeholder="All Users"
                  />
                </div>
              </div>

              <DashboardFilters filters={filters} onFilterChange={setFilters} />
              {(source === "annam" ||
                source === "vicharanashala" ||
                source === "whatsapp") && (
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
                      <Spinner text="Fetching metrics..." fullScreen={false} />
                    )}

                    {/* <EightCardsComponent kpiRow1={patchedKpiRow1} kpiRow2={data.kpiRow2} /> */}
                    {/* Uncomment the above line when data is dynamic and delete the below code */}
                    {(source === "annam" || source === "vicharanashala") && (
                      <EightCardsComponent
                        kpiRow1={kpiRow1WithOverlay}
                        kpiRow2={kpiRow2WithOverlay}
                        source={source}
                      />
                    )}
                    {source === "whatsapp" && (
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
                    )}
                    <div
                        className={`grid gap-4 mb-6 ${
                          source === "whatsapp"
                            ? "grid-cols-1 lg:grid-cols-[1fr_1fr_1.4fr_1.4fr]"
                            : "grid-cols-1 lg:grid-cols-[1fr_1.4fr_1.4fr]"
                        }`}
                      >
                      {source === "whatsapp" && 
                        <WhatsAppUniqueUsersCard 
                          totalUsers={unqueWhatsAppUsers}
                      />}

                      <ClosedInLastTwoHoursCard
                        count = {closedAndNotifedData?.closedInLastTwoHours}
                        totalClosed={closedAndNotifedData?.closedVsTotalQuestions?.closedQuestions}
                      />
                      <ClosedQuestionsCard
                        closedQuestions = {closedAndNotifedData?.closedVsTotalQuestions?.closedQuestions}
                        totalQuestions={closedAndNotifedData?.closedVsTotalQuestions?.totalQuestions}
                      />
                      <CustomerNotificationsCard
                        notified={closedAndNotifedData?.notifiedVsClosed?.notified}
                        notNotified={closedAndNotifedData?.notifiedVsClosed?.notNotified}
                        untrackedClosedQuestions={closedAndNotifedData?.notifiedVsClosed?.untrackedClosedQuestions}
                      />
                    </div>
                    {source !== "whatsapp" && (
                      <ResponseAdherenceTableCard
                        data={
                          (responseAdherenceData as any)
                            .responseAdherenceTable ??
                          (data as any).responseAdherenceTable
                        }
                        selectedDate={responseAdherenceDate}
                        onSelectedDateChange={setResponseAdherenceDate}
                        isLoading={isResponseAdherenceLoading}
                      />
                    )}
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
                        <LazyUserGrowthChart source={source} />
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
                          source === "whatsapp"
                            ? inactiveWhatsappUsers?.pagination?.total
                            : ((data as any).inactiveUsersLast3Days ?? 0)
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
                        source={source}
                        onInactiveWhatsAppUsersClick={
                          handleWhatsappInactiveUsersClick
                        }
                      />
                      {isDuplicateModalOpen && (
                        <DuplicateQuestionsModal
                          onClose={() => setIsDuplicateModalOpen(false)}
                          source={source}
                        />
                      )}
                      <InactiveUsersModal
                        open={isInactiveWhatsappModalOpen}
                        onOpenChange={setIsInactiveWhatsappModalOpen}
                        users={inactiveWhatsappUsers?.users ?? []}
                        pagination={inactiveWhatsappUsers?.pagination}
                        onPageChange={setInactiveUsersPage}
                      />
                    </div>
                  </div>

                  {/* Demographics */}
                  {source !== "whatsapp" && (
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
                  )}
                  {/* 2-col row */}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 auto-rows-fr items-stretch">
                    {source !== "whatsapp" && (
                      <div className="h-full">
                        <PlatformDonutSegments
                          rawData={data.platformInstalls}
                        />
                      </div>
                    )}

                    {source !== "whatsapp" && (
                      <div
                        className="h-full group"
                        ref={(el) => {
                          sectionRefs.current["farmer-segments"] = el;
                        }}
                      >
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />

                        <div className="relative h-full rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

                          <div className="flex items-center gap-2 mb-5">
                            <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Knowledge & Awareness
                            </h3>
                          </div>

                          <div className="flex flex-wrap gap-6 justify-center items-center h-[calc(100%-3rem)] overflow-hidden">
                            {[
                              {
                                label: "KCC Awareness",
                                data: data.kccAwareness,
                                hovered,
                                setHover: setHovered,
                                color: "hsl(142 71% 45%)",
                                gradId: "kccGrad",
                              },
                              {
                                label: "Uses Agri Apps",
                                data: data.agriAppUsage,
                                hovered: agriHovered,
                                setHover: setAgriHovered,
                                color: "hsl(217 91% 60%)",
                                gradId: "agriGrad",
                              },
                            ].map(
                              ({
                                label,
                                data: d,
                                hovered: h,
                                setHover,
                                color,
                                gradId,
                              }) => {
                                const yes = d?.[0]?.count || 0;
                                const no = d?.[1]?.count || 0;
                                const total = yes + no;
                                const r = 45,
                                  cx = 60,
                                  cy = 60;
                                const circ = 2 * Math.PI * r;
                                const yesDash = total
                                  ? (yes / total) * circ
                                  : 0;
                                const noDash = total ? (no / total) * circ : 0;
                                const yesPct = total
                                  ? Math.round((yes / total) * 100)
                                  : 0;

                                return (
                                  <div
                                    key={label}
                                    className="flex flex-col items-center gap-3 min-w-0 group/chart"
                                  >
                                    <div className="relative">
                                      {/* Soft glow */}

                                      <svg
                                        viewBox="0 0 120 120"
                                        className="relative w-[120px] h-[120px]"
                                      >
                                        <defs>
                                          <linearGradient
                                            id={gradId}
                                            x1="0%"
                                            y1="0%"
                                            x2="100%"
                                            y2="100%"
                                          >
                                            <stop
                                              offset="0%"
                                              stopColor={color}
                                              stopOpacity="1"
                                            />
                                            <stop
                                              offset="100%"
                                              stopColor={color}
                                              stopOpacity="0.7"
                                            />
                                          </linearGradient>
                                        </defs>

                                        {/* Track */}
                                        <circle
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill="none"
                                          className="stroke-muted"
                                          strokeWidth={10}
                                        />

                                        {/* Yes arc */}
                                        <circle
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill="none"
                                          stroke={`url(#${gradId})`}
                                          strokeWidth={h === "yes" ? 13 : 10}
                                          strokeLinecap="round"
                                          strokeDasharray={`${yesDash} ${circ}`}
                                          transform={`rotate(-90 ${cx} ${cy})`}
                                          className="cursor-pointer transition-[stroke-width] duration-200"
                                          onMouseEnter={() => setHover("yes")}
                                          onMouseLeave={() => setHover(null)}
                                        />

                                        {/* No arc */}
                                        <circle
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill="none"
                                          className="stroke-muted-foreground/40 cursor-pointer transition-[stroke-width] duration-200"
                                          strokeWidth={h === "no" ? 13 : 10}
                                          strokeLinecap="round"
                                          strokeDasharray={`${noDash} ${circ}`}
                                          strokeDashoffset={-yesDash}
                                          transform={`rotate(-90 ${cx} ${cy})`}
                                          onMouseEnter={() => setHover("no")}
                                          onMouseLeave={() => setHover(null)}
                                        />

                                        {/* Center text */}
                                        <text
                                          x={cx}
                                          y={cy - 2}
                                          textAnchor="middle"
                                          className="fill-foreground font-bold tabular-nums"
                                          fontSize={h ? 16 : 20}
                                        >
                                          {h === "yes"
                                            ? yes
                                            : h === "no"
                                              ? no
                                              : total}
                                        </text>
                                        <text
                                          x={cx}
                                          y={cy + 12}
                                          textAnchor="middle"
                                          className="fill-muted-foreground"
                                          fontSize={8}
                                          style={{
                                            letterSpacing: "0.1em",
                                            textTransform: "uppercase",
                                          }}
                                        >
                                          {h === "yes"
                                            ? "Yes"
                                            : h === "no"
                                              ? "No"
                                              : "Total"}
                                        </text>
                                      </svg>
                                    </div>

                                    <div className="flex flex-col items-center gap-1">
                                      <span className="text-xs font-medium text-foreground">
                                        {label}
                                      </span>
                                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                                        <span
                                          className="w-1.5 h-1.5 rounded-full"
                                          style={{ backgroundColor: color }}
                                        />
                                        {yesPct}% Yes
                                      </span>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {source !== "whatsapp" && (
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
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      ref={(el) => {
                        sectionRefs.current["query-analysis"] = el;
                      }}
                      className="h-full"
                    >
                      <DashboardQueryCategories
                        categories={
                          source === "whatsapp"
                            ? queryCategories
                            : data.queryCategories
                        }
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.4,
                        ease: "easeOut",
                        delay: 0.08,
                      }}
                      ref={(el) => {
                        sectionRefs.current["feedback-sentiment"] = el;
                      }}
                      className="h-full"
                    >
                      <TopCropsCard
                        topCrops={topCrops}
                        isLoadingTopCrops={isLoadingTopCrops}
                        errorLoadingtopCrops={errorLoadingtopCrops}
                      />
                    </motion.div>
                  </div>

                  {/* Chatbot Quality & FAQ Analytics Section Header */}
                  {/* Daily Trends & FAQ Leaderboard Grid */}
                  {/* Row 1: Daily Trends & Feedback Data */}
                  <div className="grid grid-cols-1 lg:grid-cols-1 gap-3 mb-4 mt-6">
                    <DailyQuestionTrendsChart
                      trends={(trendsData as any).dailyQuestionTrends}
                      dateRange={trendsDateRange}
                      onDateRangeChange={setTrendsDateRange}
                      isLoading={trendsLoading}
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
                      repeatQueryRatePct={(faqsData as any).repeatQueryRatePct}
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
                  {source !== "whatsapp" && (
                    <div className="">
                      <ActiveUsersChart
                        source={source}
                        userType={filters.userType}
                      />
                      {/* <RetentionMetricsChart
                    source={source}
                    userType={filters.userType}
                    /> */}
                    </div>
                  )}
                  {source !== "whatsapp" && (
                    <div className="mt-4 mb-4">
                      <WeatherConcernAnalyticsCard
                        source={source}
                        userType={filters.userType}
                        filters={weatherConcernFilters}
                        onFiltersChange={setWeatherConcernFilters}
                      />
                    </div>
                  )}
                  {source !== "whatsapp" && (
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
                  )}
                  {source === "whatsapp" && (
                    <div
                      ref={(el) => {
                        sectionRefs.current["user-details"] = el;
                      }}
                    >
                      <WhatsAppUsersView />
                    </div>
                  )}
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
