import React, {
  useState,
  useCallback,
  useMemo,
  Suspense,
  useEffect,
} from "react";
import { cn } from "@/lib/utils";
import {
  useDailyQuestionTrends,
  useDashboardData,
  useResponseAdherenceTable,
  useTopFaqs,
  useUserMertices,
} from "./hooks/useDashboardData";
import { useUserDetails } from "./hooks/useUserDetails";
import type { Segment } from "./types";
import { DashboardSidebar } from "./DashboardSidebar";
import type { DashboardView } from "./DashboardSidebar";
import { DashboardFilters } from "./DashboardFilters";
import type { DashboardFilterValues } from "./DashboardFilters";
import { EightCardsComponent } from "./MetricCard ";
import DashboardQueryCategories from "./DashboardQueryCategories";
import { AlertCard } from "./AlertCard";
import { DuplicateQuestionsModal } from "./components/DuplicateQuestionsModal";
import { SegmentDetailBanner } from "./components/SegmentDetailBanner";
import { UserDetailsView } from "./UserDetailsView";
import { WhatsAppUsersView } from "./WhatsAppUsersView";

// Lazy-loaded components
const LazyUserGrowthChart = React.lazy(
  () => import("./components/UserGrowthChart"),
);
const LazyUserDemographicsSection = React.lazy(
  () => import("./components/UserDemographicsSection"),
);

import type { UserDetailsFilters } from "./components/UserDetailsPreferenceFilter";
import { TopCropsCard } from "./components/TopCropsCard";
import { useTopCrops } from "./hooks/useTopCrops";
import { DailyQuestionTrendsChart } from "./components/DailyQuestionTrendsChart";
import { TopFaqsLeaderboard } from "./components/TopFaqsLeaderboard";
import { useInView } from "@/hooks/useInView";
import PlatformDonutSegments from "./components/PlatformDonutSegment";
import { RefreshCw, Users, UserMinus, HelpCircle, InfoIcon } from "lucide-react";
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
import { WeatherConcernAnalyticsCard } from "./components/WeatherConcernAnalyticsCard";
import {
  DEFAULT_WEATHER_CONCERN_FILTERS,
  type WeatherConcernFilters,
} from "./hooks/useWeatherConcernAnalytics";
import { FarmerAnalyticsHeatMap } from "./components/FarmerAnalyticsHeatMap";
import { WhatsAppAnalyticsCard } from "./WhatsAppAnalyticsCard";
import {
  useClosedAndNotifedData,
  useInactiveWhatsappUsers,
  useQueryCategories,
  useUniqueWhatsappUsers,
} from "./hooks/useActiveUsersAnalytics";
import { InactiveUsersModal } from "./InactiveUsersModal";
import { RetentionMetricsChart } from "./retention-metrics";
import { motion } from "framer-motion";

import { WhatsAppUniqueUsersCard } from "./WhatsAppUniqueUsersCard";
import { ClosedInLastTwoHoursCard } from "./ClosedInLastTwoHoursCard";
import { ClosedQuestionsCard } from "./ClosedQuestionsCard";
import { CustomerNotificationsCard } from "./CustomerNotificationsCard";
import { Skeleton } from "@/components/atoms/skeleton";
import { ChurnRateChart } from "./ChurnRateChart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs";
import { useQueryClient } from "@tanstack/react-query";

import { DEFAULT_FILTERS, DYNAMIC_KPI_IDS } from "./utils/constants";
import { formatDateForInput, parseInputDateToLocalDate, getISOStringsForDateRange } from "./utils/dateUtils";
import { containerVariants, itemVariants } from "./utils/animationVariants";

// Import new custom hooks
import { useUserTypeFilter } from "./hooks/useFilters";
import { useDateRanges } from "./hooks/useDateRanges";
import { useDashboardRefresh, useKnowledgeAwarenessRefresh } from "./hooks/useDashboardRefresh";
import { useScrollNavigation } from "./hooks/useScrollNavigation";

// Import extracted section components
import { SourceTabsHeader, KnowledgeAwarenessCard, KnowledgeAwarenessCharts } from "./components/sections";

// Types
type SourceType = "annam" | "whatsapp";

/**
 * Skeleton component for lazy-loaded sections
 */
export function LazySectionSkeleton({
  className = "h-[300px]",
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-xl border border-border/60 bg-card/40 p-4",
        className,
      )}
    >
      <Skeleton className="h-full w-full rounded-lg" />
    </div>
  );
}

/**
 * Main Dashboard Component
 */
export function AnnamDashboard({
  className,
  source = "annam",
  onSourceChange,
}: {
  className?: string;
  source?: SourceType;
  onSourceChange?: (source: SourceType) => void;
}) {
  const queryClient = useQueryClient();

  // ── State Management using Custom Hooks ─────────────────────────────────────
  
  // Filters state
  const [filters, setFilters] = useState<DashboardFilterValues>(DEFAULT_FILTERS);
  
  // Date ranges state
  const {
    closed2hDateRange,
    questionStatusDateRange,
    customerNotificationsDateRange,
    trendsDateRange,
    faqsDateRange,
    setClosed2hDateRange,
    setQuestionStatusDateRange,
    setCustomerNotificationsDateRange,
    setTrendsDateRange,
    setFaqsDateRange,
  } = useDateRanges();

  // Active segment and view state
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [activeChartTab, setActiveChartTab] = useState<string>("dau");
  
  // Modals state
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [isInactiveWhatsappModalOpen, setIsInactiveWhatsappModalOpen] = useState(false);
  const [inactiveUsersPage, setInactiveUsersPage] = useState(1);
  
  // User details initial filters
  const [userDetailsInitialFilters, setUserDetailsInitialFilters] = useState<
    Partial<UserDetailsFilters> | undefined
  >(undefined);

  // Hover states for knowledge awareness charts
  const [hovered, setHovered] = useState<string | null>(null);
  const [agriHovered, setAgriHovered] = useState<string | null>(null);

  // Weather concern filters
  const [weatherConcernFilters, setWeatherConcernFilters] =
    useState<WeatherConcernFilters>(DEFAULT_WEATHER_CONCERN_FILTERS);

  // Response adherence date
  const [responseAdherenceDate, setResponseAdherenceDate] = useState<string>(
    formatDateForInput(new Date()),
  );

  // ── Custom Hooks ────────────────────────────────────────────────────────────
  
  // Refresh functionality
  const { invalidating, handleRefreshAll } = useDashboardRefresh();
  const { kwDataRefreshing, handleKWRefresh } = useKnowledgeAwarenessRefresh(queryClient);
  
  // Scroll navigation
  const { sectionRefs, scrollTo } = useScrollNavigation();
  
  // User type filter
  const { handleUserTypeChange, getUserTypeLabel } = useUserTypeFilter(
    filters,
    setFilters,
    source
  );

  // ── Computed Values ─────────────────────────────────────────────────────────
  
  const isAppAnalyticsSource = source === "annam" || source === "whatsapp";
  const loadImmediately = !isAppAnalyticsSource;

  // ── Data Fetching ───────────────────────────────────────────────────────────
  
  const { data, isLoading, isFetching, error } = useDashboardData(
    filters,
    source,
    isAppAnalyticsSource,
  );

  // Inactive WhatsApp users
  const { data: inactiveWhatsappUsers } = useInactiveWhatsappUsers(
    inactiveUsersPage,
    source === "whatsapp",
  );

  // Date range conversions
  const getISOStrings = useCallback((range?: DateRange) => {
    return getISOStringsForDateRange(range);
  }, []);

  const closed2hRange = useMemo(
    () => getISOStrings(closed2hDateRange),
    [closed2hDateRange, getISOStrings],
  );

  const questionStatusRange = useMemo(
    () => getISOStrings(questionStatusDateRange),
    [questionStatusDateRange, getISOStrings],
  );

  const customerNotificationsRange = useMemo(
    () => getISOStrings(customerNotificationsDateRange),
    [customerNotificationsDateRange, getISOStrings],
  );

  // Closed and notified data queries
  const { data: closed2hData, isLoading: isClosed2hLoading, isFetching: isClosed2hFetching } = useClosedAndNotifedData(
    source,
    filters.userType,
    closed2hRange.startTime,
    closed2hRange.endTime,
  );

  const { data: questionStatusData, isLoading: isQuestionStatusLoading, isFetching: isQuestionStatusFetching } = useClosedAndNotifedData(
    source,
    filters.userType,
    questionStatusRange.startTime,
    questionStatusRange.endTime,
  );

  const { data: customerNotificationsData, isLoading: isCustomerNotificationsLoading, isFetching: isCustomerNotificationsFetching } = useClosedAndNotifedData(
    source,
    filters.userType,
    customerNotificationsRange.startTime,
    customerNotificationsRange.endTime,
  );

  // Reset date ranges when source changes
  useEffect(() => {
    setClosed2hDateRange(undefined);
    setQuestionStatusDateRange(undefined);
    setCustomerNotificationsDateRange(undefined);
  }, [source]);

  // In-view tracking for lazy loading
  const { ref: growthRef, isVisible: isGrowthVisible } = useInView();
  const { ref: queryInsightsRef, isVisible: isQueryInsightsVisible } = useInView();
  const { ref: responseAdherenceRef, isVisible: isResponseAdherenceVisible } = useInView();
  const { ref: trendsRef, isVisible: isTrendsVisible } = useInView();
  const { ref: faqsRef, isVisible: isFaqsVisible } = useInView();
  const { ref: activeUsersRef, isVisible: isActiveUsersVisible } = useInView();
  const { ref: weatherConcernRef, isVisible: isWeatherConcernVisible } = useInView();
  const { ref: farmerHeatMapRef, isVisible: isFarmerHeatMapVisible } = useInView();
  const { ref: userDetailsRef, isVisible: isUserDetailsVisible } = useInView();
  const { ref: userDemographicsRef, isVisible: isUserDemographicsVisible } = useInView();

  // Should load conditions based on visibility
  const shouldLoadResponseAdherence = loadImmediately || isResponseAdherenceVisible;
  const shouldLoadQueryInsights = loadImmediately || isQueryInsightsVisible;
  const shouldLoadTrends = loadImmediately || isTrendsVisible;
  const shouldLoadFaqs = loadImmediately || isFaqsVisible;
  const shouldLoadActiveUsers = loadImmediately || isActiveUsersVisible;
  const shouldLoadWeatherConcern = loadImmediately || isWeatherConcernVisible;
  const shouldLoadFarmerHeatMap = loadImmediately || isFarmerHeatMapVisible;
  const shouldLoadUserDetails = loadImmediately || isUserDetailsVisible;
  const shouldLoadUserDemographics = loadImmediately || isUserDemographicsVisible;

  // Query categories
  const { data: queryCategories } = useQueryCategories(
    source,
    filters.userType,
    shouldLoadQueryInsights,
  );

  // Trends and FAQs filters
  const trendsFilters = useMemo(
    () => ({
      ...filters,
      startTime: trendsDateRange?.from,
      endTime: trendsDateRange?.to,
    }),
    [filters, trendsDateRange],
  );

  const faqsFilters = useMemo(
    () => ({
      ...filters,
      startTime: faqsDateRange?.from,
      endTime: faqsDateRange?.to,
    }),
    [filters, faqsDateRange],
  );

  // FAQs data
  const {
    data: faqsData,
    isLoading: faqsLoading,
    isFetching: faqsFetching,
  } = useTopFaqs(
    source,
    faqsFilters.userType,
    faqsFilters.startTime,
    faqsFilters.endTime,
    shouldLoadFaqs,
  );

  // Response adherence filters
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

    return { ...filters, startTime, endTime };
  }, [filters, responseAdherenceDate]);

  const {
    data: responseAdherenceData,
    isLoading: isResponseAdherenceLoading,
    isFetching: isResponseAdherenceFetching,
  } = useResponseAdherenceTable(
    source,
    filters.userType,
    responseAdherenceFilters.startTime,
    responseAdherenceFilters.endTime,
    shouldLoadResponseAdherence,
  );

  // Top crops data
  const {
    data: topCrops,
    isLoading: isLoadingTopCrops,
    error: errorLoadingtopCrops,
  } = useTopCrops(source, filters.userType, shouldLoadQueryInsights);

  // Daily question trends
  const {
    data: dailyQuestionTrendsData,
    isLoading: trendsLoading,
    isFetching: trendsFetching,
  } = useDailyQuestionTrends(
    source,
    trendsFilters.userType as string,
    trendsFilters.startTime,
    trendsFilters.endTime,
    shouldLoadTrends,
  );

  // User metrics
  const {
    data: userMetricesData,
    isLoading: usermetricsLoading,
    isFetching: usermetricsFetching,
  } = useUserMertices(source, filters.userType, shouldLoadUserDemographics);

  // Unique WhatsApp users
  const { data: unqueWhatsAppUsers, isFetching: isUniqueWhatsAppUsersFetching, isLoading: isUniqueWhatsAppUsersLoading } = useUniqueWhatsappUsers(source === "whatsapp");

  // Today's active farmers for DAU calculation
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { data: todayActiveFarmersData } = useUserDetails(
    todayStart,
    todayEnd,
    1,
    1,
    "",
    source as any,
    "",
    [],
    [],
    "",
    "",
    "",
    "",
    "all",
    false,
    false,
    filters.userType as any,
    [],
    "totalQuestions",
    "desc",
    true,
    "",
    "verified",
    true,
  );

  // ── KPI Data Processing ────────────────────────────────────────────────────
  
  // Patch DAU card with today's count
  const patchedKpiRow1 = useMemo(() => {
    if (!data?.kpiRow1) return data.kpiRow1;
    const todayCount = todayActiveFarmersData?.totalUsers ?? null;
    return data.kpiRow1.map((card) => {
      if (card.id === "dau" && todayCount !== null) {
        return {
          ...card,
          value: `${todayCount.toLocaleString()} / ${Number(card.value).toLocaleString()}`,
        };
      }
      return card;
    });
  }, [data.kpiRow1, todayActiveFarmersData?.totalUsers]);

  const kpiRow1WithOverlay = useMemo(
    () =>
      patchedKpiRow1
        .filter((card) => (DYNAMIC_KPI_IDS as readonly string[]).includes(card.id))
        .map((card) => ({
          ...card,
          isDummy: !(DYNAMIC_KPI_IDS as readonly string[]).includes(card.id),
        })),
    [patchedKpiRow1],
  );

  const kpiRow2WithOverlay = useMemo(
    () =>
      data.kpiRow2
        .filter((card) => card.id === "totalInstalls")
        .map((card) => ({
          ...card,
          isDummy: card.id !== "totalInstalls",
        })),
    [data.kpiRow2],
  );

  // Query analytics
  const queryCard = data?.kpiRow1?.find((card) => card.id === "queries");
  const dailyAnalytics = queryCard?.dailyAnalytics || [];
  const weeklyAnalytics = queryCard?.weeklyAnalytics || [];
  const monthlyAnalytics = queryCard?.monthlyAnalytics || [];

  // ── Event Handlers ─────────────────────────────────────────────────────────
  
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
    [activeSegment, sectionRefs],
  );

  const clearSegment = useCallback(() => setActiveSegment(null), []);

  const handleViewChange = useCallback(
    (view: DashboardView) => {
      setActiveView(view);
      scrollTo(view);
    },
    [scrollTo],
  );

  // Navigate to user details with filters pre-applied
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

  const handleInactiveUsersClick = useCallback(() => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    threeDaysAgo.setHours(0, 0, 0, 0);

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

  const handleWhatsappInactiveUsersClick = useCallback(() => {
    setInactiveUsersPage(1);
    setIsInactiveWhatsappModalOpen(true);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  
  return (
    <div className={cn("flex flex-col min-h-screen bg-background", className)}>
      {/* Keyframe animations */}
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
            {/* Sidebar */}
            <DashboardSidebar
              activeView={activeView}
              onViewChange={handleViewChange}
              healthScore={70}
              healthLabel="Moderate · needs improvement"
              source={source}
            />

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {/* Source Selection & Controls */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex items-center justify-between gap-4 border-b border-border pb-3 mb-5 pt-3"
              >
                {/* Source Tabs */}
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSourceChange?.("annam")}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                      source === "annam"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    Annam
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSourceChange?.("whatsapp")}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                      source === "whatsapp"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    WhatsApp
                  </motion.button>
                </div>

                {/* Controls */}
                <div className="flex items-center ml-auto gap-4">
                  <motion.button
                    whileHover={{ scale: 1.05, backgroundColor: "hsl(var(--accent))" }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRefreshAll}
                    className="z-50 flex items-center gap-2 rounded-lg px-3 py-1.5 shadow-sm backdrop-blur-sm border transition-colors duration-200"
                    title="Refresh"
                  >
                    <motion.div
                      animate={{ rotate: invalidating ? 360 : 0 }}
                      transition={{ duration: 0.5, repeat: invalidating ? Infinity : 0, ease: "linear" }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </motion.div>
                    <span className="text-sm font-medium">Refresh</span>
                  </motion.button>

                  {source !== "whatsapp" && (
                    <SearchableSelect
                      options={["External", "Internal"]}
                      value={getUserTypeLabel()}
                      onChange={handleUserTypeChange}
                      placeholder="All Users"
                    />
                  )}
                </div>
              </motion.div>

              {/* Filters */}
              <DashboardFilters filters={filters} onFilterChange={setFilters} />

              {/* Overview Section */}
              {(source === "annam" || source === "whatsapp") && (
                <div
                  ref={(el) => { sectionRefs.current["overview"] = el; }}
                  className="relative"
                >
                  {activeSegment && (
                    <SegmentDetailBanner
                      seg={activeSegment}
                      onClose={clearSegment}
                    />
                  )}

                  <div className={`relative transition-all duration-300`}>
                    {/* KPI Cards */}
                    {(source === "annam") && (
                      <EightCardsComponent
                        kpiRow1={kpiRow1WithOverlay}
                        kpiRow2={kpiRow2WithOverlay}
                        source={source}
                        userType={filters.userType}
                        isLoading={isFetching}
                      />
                    )}

                    {/* WhatsApp Analytics Cards */}
                    {source === "whatsapp" && (
                      <motion.div
                        className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                      >
                        <motion.div variants={itemVariants}>
                          <WhatsAppAnalyticsCard
                            title="Daily Queries"
                            analytics={dailyAnalytics}
                            granularity="daily"
                            isLoading={isFetching || isLoading}
                          />
                        </motion.div>
                        <motion.div variants={itemVariants}>
                          <WhatsAppAnalyticsCard
                            title="Weekly Queries"
                            analytics={weeklyAnalytics}
                            granularity="weekly"
                            isLoading={isFetching || isLoading}
                          />
                        </motion.div>
                        <motion.div variants={itemVariants}>
                          <WhatsAppAnalyticsCard
                            title="Monthly Queries"
                            analytics={monthlyAnalytics}
                            granularity="monthly"
                            isLoading={isFetching || isLoading}
                          />
                        </motion.div>
                      </motion.div>
                    )}

                    {/* Query Status Cards Grid */}
                    <div
                      className={cn(
                        "grid gap-4 mb-6 items-stretch",
                        source === "whatsapp"
                          ? "grid-cols-1 lg:grid-cols-[0.6fr_1fr_1.4fr_1.4fr]"
                          : "grid-cols-1 lg:grid-cols-[1fr_1.4fr_1.4fr]"
                      )}
                    >
                      {source === "whatsapp" && (
                        <WhatsAppUniqueUsersCard
                          totalUsers={unqueWhatsAppUsers}
                          onClick={() => {
                            setActiveView("user-details");
                            scrollTo("user-details");
                          }}
                          isLoading={isUniqueWhatsAppUsersLoading || isUniqueWhatsAppUsersFetching}
                        />
                      )}

                      <ClosedInLastTwoHoursCard
                        source={source}
                        userType={filters.userType}
                        count={closed2hData?.closedInLastTwoHours}
                        totalClosed={closed2hData?.closedVsTotalQuestions?.closedQuestions}
                        dateRange={closed2hDateRange}
                        onDateRangeChange={setClosed2hDateRange}
                        isLoading={isClosed2hFetching || isClosed2hLoading}
                      />

                      <ClosedQuestionsCard
                        closedQuestions={questionStatusData?.closedVsTotalQuestions?.closedQuestions}
                        totalQuestions={questionStatusData?.closedVsTotalQuestions?.totalQuestions}
                        inReview={questionStatusData?.closedVsTotalQuestions?.inReviewQuestions}
                        dateRange={questionStatusDateRange}
                        onDateRangeChange={setQuestionStatusDateRange}
                        isLoading={isQuestionStatusFetching || isQuestionStatusLoading}
                        carryForward={questionStatusData?.carryForward}
                        avgCloseTimeMinutes={questionStatusData?.closedVsTotalQuestions?.avgCloseTimeMinutes}
                        previousMonthAvgCloseTimeMinutes={questionStatusData?.closedVsTotalQuestions?.previousMonthAvgCloseTimeMinutes}
                        statusBreakup={questionStatusData?.closedVsTotalQuestions}
                        source={source}
                        userType={filters.userType}
                      />

                      <CustomerNotificationsCard
                        notified={customerNotificationsData?.notifiedVsClosed?.notified}
                        notNotified={customerNotificationsData?.notifiedVsClosed?.notNotified}
                        untrackedClosedQuestions={customerNotificationsData?.notifiedVsClosed?.untrackedClosedQuestions}
                        dateRange={customerNotificationsDateRange}
                        onDateRangeChange={setCustomerNotificationsDateRange}
                        isLoading={isCustomerNotificationsFetching || isCustomerNotificationsLoading}
                        source={source}
                        userType={filters.userType}
                      />
                    </div>

                    {/* Response Adherence Table */}
                    {source !== "whatsapp" && (
                      <div ref={(el) => {
                        sectionRefs.current["responsetable"] = el;
                        responseAdherenceRef.current = el;
                      }}>
                        {shouldLoadResponseAdherence ? (
                          <ResponseAdherenceTableCard
                            data={responseAdherenceData}
                            selectedDate={responseAdherenceDate}
                            onSelectedDateChange={setResponseAdherenceDate}
                            isLoading={isResponseAdherenceLoading || isResponseAdherenceFetching}
                          />
                        ) : (
                          <LazySectionSkeleton className="h-[400px]" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* DAU Trend + Alerts Row */}
                  <div
                    ref={(el) => {
                      sectionRefs.current["usage-patterns"] = el;
                      growthRef.current = el;
                    }}
                    className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 mb-4 items-stretch"
                  >
                    {isGrowthVisible || loadImmediately ? (
                      <Suspense fallback={<LazySectionSkeleton />}>
                        <LazyUserGrowthChart source={source} userType={filters.userType} />
                      </Suspense>
                    ) : (
                      <LazySectionSkeleton />
                    )}

                    <div ref={(el) => { sectionRefs.current["bugs-ux"] = el; }}>
                      <AlertCard
                        alerts={data.alerts}
                        inactiveUsersLast3Days={
                          source === "whatsapp"
                            ? inactiveWhatsappUsers?.pagination?.total
                            : (data as any).inactiveUsersLast3Days ?? 0
                        }
                        onInactiveClick={handleInactiveUsersClick}
                        duplicateQuestionsCount={(data as any).duplicateQuestionsCount ?? 0}
                        onDuplicateClick={() => setIsDuplicateModalOpen(true)}
                        lowFeedbackUsersCount={(data as any).lowFeedbackUsersCount ?? null}
                        onLowFeedbackClick={handleLowFeedbackUsersClick}
                        source={source}
                        onInactiveWhatsAppUsersClick={handleWhatsappInactiveUsersClick}
                        isFetching={isFetching}
                      />
                      {isDuplicateModalOpen && (
                        <DuplicateQuestionsModal
                          onClose={() => setIsDuplicateModalOpen(false)}
                          source={source}
                          userType={filters.userType}
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

                  {/* Demographics Section */}
                  {source !== "whatsapp" && (
                    <div ref={(el) => {
                      sectionRefs.current["demographics"] = el;
                      userDemographicsRef.current = el;
                    }}>
                      {isUserDemographicsVisible || loadImmediately ? (
                        <Suspense fallback={<LazySectionSkeleton className="h-[400px]" />}>
                          <LazyUserDemographicsSection
                            source={source}
                            userType={filters.userType}
                            shouldLoadUserDemographics={shouldLoadUserDemographics}
                          />
                        </Suspense>
                      ) : (
                        <LazySectionSkeleton />
                      )}
                    </div>
                  )}

                  {/* 3-Column Row: Platform Donut, Knowledge & Awareness, Feedback */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 auto-rows-fr items-stretch">
                    {source !== "whatsapp" && (
                      <div className="h-full">
                        <PlatformDonutSegments
                          source={source}
                          userType={filters.userType}
                        />
                      </div>
                    )}

                    {source !== "whatsapp" && (
                      <div
                        className="h-full group"
                        ref={(el) => { sectionRefs.current["farmer-segments"] = el; }}
                      >
                        <div className="relative h-full rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
                          <div className="flex items-center gap-2 mb-5">
                            <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
                              <span>Knowledge & Awareness</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground">
                                    <InfoIcon className="h-3.5 w-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="normal-case tracking-normal">
                                  Shows survey statistics on KCC awareness and agricultural app usage.
                                </TooltipContent>
                              </Tooltip>
                            </h3>
                            <button
                              onClick={handleKWRefresh}
                              className="rounded-lg shadow-sm backdrop-blur-sm transition-all duration-200"
                              title="Refresh"
                            >
                              <RefreshCw className={cn("h-3.5 w-3.5", kwDataRefreshing ? "animate-spin" : "")} />
                            </button>
                          </div>

                          {kwDataRefreshing ? (
                            <LazySectionSkeleton />
                          ) : (
                            <KnowledgeAwarenessCharts
                              userMetricesData={userMetricesData}
                              hovered={hovered}
                              setHovered={setHovered}
                              agriHovered={agriHovered}
                              setAgriHovered={setAgriHovered}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {source !== "whatsapp" && (
                      <FeedbackCard
                        title="Feedback Data"
                        positiveFeedbacksCount={userMetricesData?.feedbackData?.stats?.positiveCount ?? 0}
                        negativeFeedbacksCount={userMetricesData?.feedbackData?.stats?.negativeCount ?? 0}
                        positiveFeedbacks={userMetricesData?.feedbackData?.positiveFeedbacks ?? []}
                        negativeFeedbacks={userMetricesData?.feedbackData?.negativeFeedbacks ?? []}
                        averageRating={userMetricesData?.feedbackData?.stats?.averageRating ?? 0}
                      />
                    )}
                  </div>

                  {/* Query Insights Row */}
                  <div ref={(el) => { queryInsightsRef.current = el; }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      ref={(el) => { sectionRefs.current["query-analysis"] = el; }}
                      className="h-full"
                    >
                      {shouldLoadQueryInsights ? (
                        <DashboardQueryCategories
                          categories={queryCategories}
                          source={source}
                          userType={filters.userType}
                        />
                      ) : (
                        <LazySectionSkeleton className="h-[360px]" />
                      )}
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut", delay: 0.08 }}
                      ref={(el) => { sectionRefs.current["feedback-sentiment"] = el; }}
                      className="h-full"
                    >
                      {shouldLoadQueryInsights ? (
                        <TopCropsCard
                          topCrops={topCrops}
                          isLoadingTopCrops={isLoadingTopCrops}
                          errorLoadingtopCrops={errorLoadingtopCrops}
                          source={source}
                          userType={filters.userType}
                        />
                      ) : (
                        <LazySectionSkeleton className="h-[360px]" />
                      )}
                    </motion.div>
                  </div>

                  {/* Daily Trends */}
                  <div ref={(el) => { trendsRef.current = el; }} className="grid grid-cols-1 lg:grid-cols-1 gap-3 mb-4 mt-6">
                    {shouldLoadTrends ? (
                      <DailyQuestionTrendsChart
                        trends={dailyQuestionTrendsData ?? undefined}
                        dateRange={trendsDateRange}
                        onDateRangeChange={setTrendsDateRange}
                        isLoading={trendsLoading}
                      />
                    ) : (
                      <LazySectionSkeleton className="h-[320px]" />
                    )}
                  </div>

                  {/* State Analytics + FAQ Leaderboard */}
                  <div ref={(el) => { faqsRef.current = el; }} className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                    {shouldLoadFaqs ? (
                      <>
                        <DashboardStateWiseAnalytics
                          source={source}
                          userType={filters.userType}
                        />
                        <TopFaqsLeaderboard
                          faqs={(faqsData as any)?.topFaqs}
                          topQuestionsFromCollection={(faqsData as any)?.topQuestionsFromCollection}
                          repeatQueryCount={(faqsData as any)?.repeatQueryCount}
                          repeatQueryRatePct={(faqsData as any)?.repeatQueryRatePct}
                          avgQuestionsPerUserDay={(faqsData as any)?.avgQuestionsPerUserDay}
                          dateRange={faqsDateRange}
                          onDateRangeChange={setFaqsDateRange}
                          isLoading={faqsLoading}
                        />
                      </>
                    ) : (
                      <>
                        <LazySectionSkeleton className="h-[500px]" />
                        <LazySectionSkeleton className="h-[500px]" />
                      </>
                    )}
                  </div>

                  {/* Active Users Tabs */}
                  {source !== "whatsapp" && (
                    <div ref={(el) => { activeUsersRef.current = el; }} className="">
                      {shouldLoadActiveUsers ? (
                        <Tabs
                          value={activeChartTab}
                          onValueChange={setActiveChartTab}
                          className="w-full"
                        >
                          <TabsList className="grid w-full max-w-xl grid-cols-3 mb-4">
                            <TabsTrigger value="dau" className="flex items-center justify-center gap-1.5">
                              <Users className="h-3.5 w-3.5" />
                              <span>Daily Active Users</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help inline-flex items-center p-0.5 text-muted-foreground/60 hover:text-muted-foreground">
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Shows daily, weekly, or monthly active chatbot user trends based on latest activity.
                                </TooltipContent>
                              </Tooltip>
                            </TabsTrigger>
                            <TabsTrigger value="retention" className="flex items-center justify-center gap-1.5">
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>User Retention</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help inline-flex items-center p-0.5 text-muted-foreground/60 hover:text-muted-foreground">
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Tracks D1, D7, and D30 cohort-based user retention over time.
                                </TooltipContent>
                              </Tooltip>
                            </TabsTrigger>
                            <TabsTrigger value="churn" className="flex items-center justify-center gap-1.5">
                              <UserMinus className="h-3.5 w-3.5" />
                              <span>Monthly Churn</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help inline-flex items-center p-0.5 text-muted-foreground/60 hover:text-muted-foreground">
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Measures the percentage of users active in the previous month who did not return.
                                </TooltipContent>
                              </Tooltip>
                            </TabsTrigger>
                          </TabsList>
                          <TabsContent value="dau" className="mt-0">
                            <ActiveUsersChart source={source} userType={filters.userType} />
                          </TabsContent>
                          <TabsContent value="retention" className="mt-0">
                            <RetentionMetricsChart source={source} userType={filters.userType} />
                          </TabsContent>
                          <TabsContent value="churn" className="mt-0">
                            <ChurnRateChart source={source} userType={filters.userType} />
                          </TabsContent>
                        </Tabs>
                      ) : (
                        <LazySectionSkeleton className="h-[400px]" />
                      )}
                    </div>
                  )}

                  {/* Weather Concern Analytics */}
                  {source !== "whatsapp" && (
                    <div ref={(el) => { weatherConcernRef.current = el; }} className="mt-4 mb-4">
                      {shouldLoadWeatherConcern ? (
                        <WeatherConcernAnalyticsCard
                          source={source}
                          userType={filters.userType}
                          filters={weatherConcernFilters}
                          onFiltersChange={setWeatherConcernFilters}
                        />
                      ) : (
                        <LazySectionSkeleton className="h-[360px]" />
                      )}
                    </div>
                  )}

                  {/* Farmer Analytics Heat Map */}
                  {source !== "whatsapp" && (
                    <div ref={(el) => { farmerHeatMapRef.current = el; }} className="mt-4 mb-4">
                      {shouldLoadFarmerHeatMap ? (
                        <FarmerAnalyticsHeatMap
                          source={source}
                          userType={filters.userType}
                          enabled={shouldLoadFarmerHeatMap}
                        />
                      ) : (
                        <LazySectionSkeleton className="h-[520px]" />
                      )}
                    </div>
                  )}

                  {/* User Details Section */}
                  {source !== "whatsapp" && (
                    <div ref={(el) => {
                      sectionRefs.current["user-details"] = el;
                      userDetailsRef.current = el;
                    }}>
                      {shouldLoadUserDetails ? (
                        <UserDetailsView
                          source={source}
                          initialFilters={userDetailsInitialFilters}
                          userType={filters.userType}
                        />
                      ) : (
                        <LazySectionSkeleton className="h-[520px]" />
                      )}
                    </div>
                  )}

                  {/* WhatsApp Users View */}
                  {source === "whatsapp" && (
                    <div ref={(el) => { sectionRefs.current["user-details"] = el; }}>
                      <WhatsAppUsersView />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AnnamDashboard;
