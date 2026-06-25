// ─── Annam Dashboard Main Component ─────────────────────────────────────────
import React, {
  useState,
  // useRef,
  useCallback,
  useMemo,
  useEffect,
  Suspense,
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
// import DashboardQueryCategories from "./DashboardQueryCategories";
import { AlertCard } from "./AlertCard";
import { DuplicateQuestionsModal } from "./components/DuplicateQuestionsModal";
import { SegmentDetailBanner } from "./components/SegmentDetailBanner";
import { UserDetailsView } from "./UserDetailsView";
import { WhatsAppUsersView } from "./WhatsAppUsersView";
import type { UserDetailsFilters } from "./components/UserDetailsPreferenceFilter";
// import { TopCropsCard } from "./components/TopCropsCard";
import { useTopCrops } from "./hooks/useTopCrops";
import { DailyQuestionTrendsChart } from "./components/DailyQuestionTrendsChart";
import { TopFaqsLeaderboard } from "./components/TopFaqsLeaderboard";
// import { useInView } from "@/hooks/useInView";
import PlatformDonutSegments from "./components/PlatformDonutSegment";
import { DashboardStateWiseAnalytics } from "./DashboardQueryState";
import FeedbackCard from "./FeedbackCard";
import { ResponseAdherenceTableCard } from "./components/ResponseAdherenceTableCard";
import { WeatherConcernAnalyticsCard } from "./components/WeatherConcernAnalyticsCard";
import { DEFAULT_WEATHER_CONCERN_FILTERS, type WeatherConcernFilters } from "./hooks/useWeatherConcernAnalytics";
import { FarmerAnalyticsHeatMap } from "./components/FarmerAnalyticsHeatMap";
import { WhatsAppAnalyticsCard } from "./WhatsAppAnalyticsCard";
import { useClosedAndNotifedData, useInactiveWhatsappUsers, useQueryCategories, useUniqueWhatsappUsers } from "./hooks/useActiveUsersAnalytics";
import { InactiveUsersModal } from "./InactiveUsersModal";
import { motion } from "framer-motion";
import { containerVariants, itemVariants, DYNAMIC_KPI_IDS, CSS_KEYFRAMES } from "./utils/constants";
import { formatDateForInput, getISOStringsForDateRange, getTodayStart, getTodayEnd } from "./utils/dateUtils";
import { useQueryClient } from "@tanstack/react-query";
// import { RefreshCw } from "lucide-react";
import { KnowledgeAwarenessCard } from "./components/KnowledgeAwarenessCard";
import { ActiveUsersSection } from "./components/ActiveUsersSection";
import { WhatsAppUniqueUsersCard } from "./WhatsAppUniqueUsersCard";
import { ClosedInLastTwoHoursCard } from "./ClosedInLastTwoHoursCard";
import { ClosedQuestionsCard } from "./ClosedQuestionsCard";
import { CustomerNotificationsCard } from "./CustomerNotificationsCard";
import { SourceTabsHeader } from "./components/SourceTabs";
import { QueryInsightsSection } from "./components/QueryInsightsSection";
import { useDashboardHandlers } from "./hooks/useDashboardHandlers";
import { ACCAnalyticsDashboard } from "@/components/ACCAnalyticsDashboard";

// ─── Lazy Loaded Components ──────────────────────────────────────────────────
const LazyUserGrowthChart = React.lazy(() => import("./components/UserGrowthChart"));
const LazyUserDemographicsSection = React.lazy(() => import("./components/UserDemographicsSection"));

// ─── Exported Skeleton Component ─────────────────────────────────────────────
export function LazySectionSkeleton({ className = "h-[300px]" }: { className?: string }) {
  return (
    <div className={cn("w-full rounded-xl border border-border/60 bg-card/40 p-4", className)}>
      <div className="h-full w-full rounded-lg animate-pulse bg-muted" />
    </div>
  );
}

// ─── Extended DashboardView type ─────────────────────────────────────────────
// type ExtendedDashboardView = DashboardView | "responsetable";

// ─── Main Dashboard Component ─────────────────────────────────────────────────
export function AnnamDashboard_dev({
  className,
  source: initialSource = "annam",
  // onSourceChange,
}: {
  className?: string;
  source?: "annam" | "whatsapp" | "acc";
  onSourceChange?: (source: "annam" | "whatsapp" | "acc") => void;
}) {
  const queryClient = useQueryClient();
  
  // ─── Core State ────────────────────────────────────────────────────────────
  const [source, setSource] = useState<"annam" | "whatsapp" | "acc">(initialSource);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [activeChartTab, setActiveChartTab] = useState<string>("dau");
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const [filters, setFilters] = useState<DashboardFilterValues>({
    village: "all",
    crop: "all",
    season: "all",
    startTime: undefined,
    endTime: undefined,
    userType: "all",
  });
  const [weatherConcernFilters, setWeatherConcernFilters] = useState<WeatherConcernFilters>(DEFAULT_WEATHER_CONCERN_FILTERS);
  
  // Modal states
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [isInactiveWhatsappModalOpen, setIsInactiveWhatsappModalOpen] = useState(false);
  const [inactiveUsersPage, setInactiveUsersPage] = useState(1);
  
  // Date range states
  const [trendsDateRange, setTrendsDateRange] = useState<import("react-day-picker").DateRange | undefined>(undefined);
  const [faqsDateRange, setFaqsDateRange] = useState<import("react-day-picker").DateRange | undefined>(undefined);
  const [responseAdherenceDate, setResponseAdherenceDate] = useState<string>(formatDateForInput(new Date()));
  const [closed2hDateRange, setClosed2hDateRange] = useState<import("react-day-picker").DateRange | undefined>(undefined);
  const [questionStatusDateRange, setQuestionStatusDateRange] = useState<import("react-day-picker").DateRange | undefined>(undefined);
  const [customerNotificationsDateRange, setCustomerNotificationsDateRange] = useState<import("react-day-picker").DateRange | undefined>(undefined);
  
  // Hover states for Knowledge Awareness Donuts
  const [hovered, setHovered] = useState<string | null>(null);
  const [agriHovered, setAgriHovered] = useState<string | null>(null);
  
  // User details initial filters
  const [userDetailsInitialFilters, setUserDetailsInitialFilters] = useState<Partial<UserDetailsFilters> | undefined>(undefined);
  
  // ─── Computed Values ───────────────────────────────────────────────────────
  const isAppAnalyticsSource = source === "annam" || source === "whatsapp";
  const loadImmediately = !isAppAnalyticsSource;
  
  // ─── Data Queries ──────────────────────────────────────────────────────────
  const { data, isLoading, isFetching, error } = useDashboardData(filters, source, isAppAnalyticsSource);
  const { data: inactiveWhatsappUsers } = useInactiveWhatsappUsers(inactiveUsersPage, source === "whatsapp");
  
  // Date range ISO strings
  const closed2hRange = useMemo(() => getISOStringsForDateRange(closed2hDateRange), [closed2hDateRange]);
  const questionStatusRange = useMemo(() => getISOStringsForDateRange(questionStatusDateRange), [questionStatusDateRange]);
  const customerNotificationsRange = useMemo(() => getISOStringsForDateRange(customerNotificationsDateRange), [customerNotificationsDateRange]);
  
  // Data queries with date ranges
  const { data: closed2hData, isFetching: isClosed2hFetching } = useClosedAndNotifedData(source, filters.userType, closed2hRange.startTime, closed2hRange.endTime);
  const { data: questionStatusData } = useClosedAndNotifedData(source, filters.userType, questionStatusRange.startTime, questionStatusRange.endTime);
  const { data: customerNotificationsData } = useClosedAndNotifedData(source, filters.userType, customerNotificationsRange.startTime, customerNotificationsRange.endTime);
  
  // Filter date range data
  const trendsFilters = useMemo(() => ({ ...filters, startTime: trendsDateRange?.from, endTime: trendsDateRange?.to }), [filters, trendsDateRange]);
  const faqsFilters = useMemo(() => ({ ...filters, startTime: faqsDateRange?.from, endTime: faqsDateRange?.to }), [filters, faqsDateRange]);
  const responseAdherenceFilters = useMemo(() => {
    const selectedDate = new Date(responseAdherenceDate);
    selectedDate.setHours(0, 0, 0, 0);
    const endTime = new Date(selectedDate);
    const now = new Date();
    if (selectedDate.getFullYear() === now.getFullYear() && selectedDate.getMonth() === now.getMonth() && selectedDate.getDate() === now.getDate()) {
      endTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    } else {
      endTime.setHours(23, 59, 59, 999);
    }
    return { ...filters, startTime: selectedDate, endTime };
  }, [filters, responseAdherenceDate]);
  
  // ─── Handlers & Visibility Hook ────────────────────────────────────────────
  const {
    sectionRefs,
    growthRef,
    queryInsightsRef,
    responseAdherenceRef,
    trendsRef,
    faqsRef,
    activeUsersRef,
    weatherConcernRef,
    farmerHeatMapRef,
    userDetailsRef,
    userDemographicsRef,
    visibilityFlags,
    scrollTo,
    handleViewChange,
    handleLowFeedbackUsersClick,
    handleInactiveUsersClick,
    handleWhatsappInactiveUsersClick,
    handleRefreshAll,
    handleKWRefresh,
    invalidating,
    kwDataRefreshing,
  } = useDashboardHandlers({
    source,
    loadImmediately,
    onSetActiveView: setActiveView,
    onSetUserDetailsInitialFilters: setUserDetailsInitialFilters,
    onSetInactiveUsersPage: setInactiveUsersPage,
    onSetIsInactiveWhatsappModalOpen: setIsInactiveWhatsappModalOpen,
    onSetIsDuplicateModalOpen: setIsDuplicateModalOpen,
    queryClient,
  });

  // Destructure visibility flags
  const {
    shouldLoadResponseAdherence,
    shouldLoadQueryInsights,
    shouldLoadTrends,
    shouldLoadFaqs,
    shouldLoadActiveUsers,
    shouldLoadWeatherConcern,
    shouldLoadFarmerHeatMap,
    shouldLoadUserDetails,
    shouldLoadUserDemographics,
    isGrowthVisible,
    // isResponseAdherenceVisible,
    // isQueryInsightsVisible,
    // isTrendsVisible,
    // isFaqsVisible,
    // isActiveUsersVisible,
    // isWeatherConcernVisible,
    // isFarmerHeatMapVisible,
    // isUserDetailsVisible,
    isUserDemographicsVisible,
  } = visibilityFlags;
  
  // ─── Additional Data Queries ───────────────────────────────────────────────
  const { data: queryCategories, isLoading: isLoadingQueryCategories } = useQueryCategories(source, filters.userType, shouldLoadQueryInsights);
  const { data: faqsData, isLoading: faqsLoading } = useTopFaqs(source, faqsFilters.userType, faqsFilters.startTime, faqsFilters.endTime, shouldLoadFaqs);
  const { data: responseAdherenceData, isLoading: isResponseAdherenceLoading, isFetching: isResponseAdherenceFetching } = useResponseAdherenceTable(
    source, filters.userType, responseAdherenceFilters.startTime, responseAdherenceFilters.endTime, shouldLoadResponseAdherence
  );
  const { data: topCrops, isLoading: isLoadingTopCrops, error: errorLoadingtopCrops } = useTopCrops(source, filters.userType, shouldLoadQueryInsights);
  const { data: dailyQuestionTrendsData, isLoading: trendsLoading } = useDailyQuestionTrends(
    source, trendsFilters.userType as string, trendsFilters.startTime, trendsFilters.endTime, shouldLoadTrends
  );
  const { data: userMetricesData } = useUserMertices(source, filters.userType, shouldLoadUserDemographics);
  const { data: unqueWhatsAppUsers } = useUniqueWhatsappUsers(source === "whatsapp");
  
  // Today's active farmers for DAU patching
  const { data: todayActiveFarmersData } = useUserDetails(
    getTodayStart(), getTodayEnd(), 1, 1, "", source as any, "", [], [], "", "", "", "", "all",
    false, false, filters.userType as any, [], "totalQuestions", "desc", true, "", "verified", true
  );
  
  // ─── Stats Cards Refresh Handler ────────────────────────────────────────────
  // Refresh all related stats cards in the row (Closed in 2h, Question Status, Notifications)
  const handleRefreshStatsCards = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["closed-notified-data"] });
  }, [queryClient]);

  // ─── Source Change Handler ─────────────────────────────────────────────────
  const handleSourceChange = useCallback((newSource: "annam" | "whatsapp" | "acc") => {
    setSource(newSource);
    if (newSource === "whatsapp") {
      setFilters(prev => ({ ...prev, userType: "all" }));
    }
    setClosed2hDateRange(undefined);
    setQuestionStatusDateRange(undefined);
    setCustomerNotificationsDateRange(undefined);
  }, []);
  
  // ─── Computed KPI Data ─────────────────────────────────────────────────────
  const patchedKpiRow1 = useMemo(() => {
    if (!data?.kpiRow1) return data?.kpiRow1;
    const todayCount = todayActiveFarmersData?.totalUsers ?? null;
    return data.kpiRow1.map(card => {
      if (card.id === "dau" && todayCount !== null) {
        return { ...card, value: `${todayCount.toLocaleString()} / ${Number(card.value).toLocaleString()}` };
      }
      return card;
    });
  }, [data?.kpiRow1, todayActiveFarmersData?.totalUsers]);
  
  const kpiRow1WithOverlay = patchedKpiRow1?.filter(card => (DYNAMIC_KPI_IDS as readonly string[]).includes(card.id)).map(card => ({ ...card, isDummy: false })) ?? [];
  const kpiRow2WithOverlay = data?.kpiRow2?.filter(card => card.id === "totalInstalls").map(card => ({ ...card, isDummy: card.id !== "totalInstalls" })) ?? [];
  
  const queryCard = data?.kpiRow1?.find(card => card.id === "queries");
  const dailyAnalytics = queryCard?.dailyAnalytics || [];
  const weeklyAnalytics = queryCard?.weeklyAnalytics || [];
  const monthlyAnalytics = queryCard?.monthlyAnalytics || [];
  
  // ─── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (source === "whatsapp") {
      setFilters(prev => ({ ...prev, userType: "all" }));
    }
  }, [source]);
  
  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={cn("flex flex-col min-h-screen bg-background text-foreground", className)}>
      <style>{CSS_KEYFRAMES}</style>
      
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
              onViewChange={handleViewChange}
              healthScore={70}
              healthLabel="Moderate · needs improvement"
              source={source}
            />
            
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {/* Source Selection Tabs & Refresh */}
              <SourceTabsHeader
                source={source}
                onSourceChange={handleSourceChange}
                filters={filters}
                onFilterChange={setFilters}
                invalidating={invalidating}
                onRefresh={handleRefreshAll}
              />
              
              {source !== "acc" && <DashboardFilters filters={filters} onFilterChange={setFilters} />}
              
              {source === "acc" && (
                <div ref={(el) => { sectionRefs.current["overview"] = el; }}>
                  <ACCAnalyticsDashboard />
                </div>
              )}
              
              {(source === "annam" || source === "whatsapp") && (
                  <div ref={(el) => { sectionRefs.current["overview"] = el; }} className="relative">
                    {activeSegment && <SegmentDetailBanner seg={activeSegment} onClose={() => setActiveSegment(null)} />}
                    
                    {/* KPI Cards */}
                    {source === "annam" && (
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
                      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6"
                        variants={containerVariants} initial="hidden" animate="visible">
                        <motion.div variants={itemVariants}>
                          <WhatsAppAnalyticsCard title="Daily Queries" analytics={dailyAnalytics} granularity="daily" isLoading={isFetching || isLoading} />
                        </motion.div>
                        <motion.div variants={itemVariants}>
                          <WhatsAppAnalyticsCard title="Weekly Queries" analytics={weeklyAnalytics} granularity="weekly" isLoading={isFetching || isLoading} />
                        </motion.div>
                        <motion.div variants={itemVariants}>
                          <WhatsAppAnalyticsCard title="Monthly Queries" analytics={monthlyAnalytics} granularity="monthly" isLoading={isFetching || isLoading} />
                        </motion.div>
                      </motion.div>
                    )}
                    
                    {/* Quick Stats Cards */}
                    <div className={cn("grid gap-4 mb-6 items-stretch",
                      source === "whatsapp" ? "grid-cols-1 lg:grid-cols-[0.6fr_1fr_1.4fr_1.4fr]" : "grid-cols-1 lg:grid-cols-[1fr_1.4fr_1.4fr]")}>
                      {source === "whatsapp" && (
                        <WhatsAppUniqueUsersCard
                          totalUsers={unqueWhatsAppUsers}
                          onClick={() => {
                            setActiveView("user-details");
                            scrollTo("user-details");
                          }}
                          isLoading={false}
                        />
                      )}

                      <ClosedInLastTwoHoursCard
                        source={source}
                        userType={filters.userType}
                        count={closed2hData?.closedInLastTwoHours}
                        totalClosed={closed2hData?.closedVsTotalQuestions?.closedQuestions}
                        dateRange={closed2hDateRange}
                        onDateRangeChange={setClosed2hDateRange}
                        isLoading={false}
                        isFetching={isClosed2hFetching}
                        onRefresh={handleRefreshStatsCards}
                      />
                      <ClosedQuestionsCard
                        closedQuestions={questionStatusData?.closedVsTotalQuestions?.closedQuestions}
                        totalQuestions={questionStatusData?.closedVsTotalQuestions?.totalQuestions}
                        inReview={questionStatusData?.closedVsTotalQuestions?.inReviewQuestions}
                        dateRange={questionStatusDateRange}
                        onDateRangeChange={setQuestionStatusDateRange}
                        isLoading={false}
                        isFetching={false}
                        carryForward={questionStatusData?.carryForward}
                        avgCloseTimeMinutes={questionStatusData?.closedVsTotalQuestions?.avgCloseTimeMinutes}
                        previousMonthAvgCloseTimeMinutes={questionStatusData?.closedVsTotalQuestions?.previousMonthAvgCloseTimeMinutes}
                        statusBreakup={questionStatusData?.closedVsTotalQuestions}
                        source={source}
                        userType={filters.userType}
                        onRefresh={handleRefreshStatsCards}
                      />
                      <CustomerNotificationsCard
                        notified={customerNotificationsData?.notifiedVsClosed?.notified}
                        notNotified={customerNotificationsData?.notifiedVsClosed?.notNotified}
                        untrackedClosedQuestions={customerNotificationsData?.notifiedVsClosed?.untrackedClosedQuestions}
                        dateRange={customerNotificationsDateRange}
                        onDateRangeChange={setCustomerNotificationsDateRange}
                        isLoading={false}
                        isFetching={false}
                        source={source}
                        userType={filters.userType}
                        onRefresh={handleRefreshStatsCards}
                      />
                    </div>
                    
                    {/* Response Adherence Table */}
                    {source !== "whatsapp" && (
                      <div ref={(el) => { sectionRefs.current["responsetable"] = el; responseAdherenceRef.current = el; }}>
                        {shouldLoadResponseAdherence ? (
                          <ResponseAdherenceTableCard
                            data={responseAdherenceData}
                            selectedDate={responseAdherenceDate}
                            onSelectedDateChange={setResponseAdherenceDate}
                            isLoading={isResponseAdherenceLoading || isResponseAdherenceFetching}
                          />
                        ) : <LazySectionSkeleton className="h-[400px]" />}
                      </div>
                    )}
                  </div>
              )}
                  {source !== "acc" && (
                    <>
                      {/* DAU Trend + Alerts */}
                      <div ref={(el) => { sectionRefs.current["usage-patterns"] = el; growthRef.current = el; }}
                        className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 mb-4 items-stretch">
                        {isGrowthVisible || loadImmediately ? (
                          <Suspense fallback={<LazySectionSkeleton />}>
                            <LazyUserGrowthChart source={source} userType={filters.userType} />
                          </Suspense>
                        ) : <LazySectionSkeleton />}
                        
                        <div ref={(el) => { sectionRefs.current["bugs-ux"] = el; }}>
                          <AlertCard
                            alerts={data.alerts}
                            inactiveUsersLast3Days={source === "whatsapp" ? inactiveWhatsappUsers?.pagination?.total : (data as any).inactiveUsersLast3Days ?? 0}
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
                            <DuplicateQuestionsModal onClose={() => setIsDuplicateModalOpen(false)} source={source} userType={filters.userType} />
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
                        <div ref={(el) => { sectionRefs.current["demographics"] = el; userDemographicsRef.current = el; }}>
                          {isUserDemographicsVisible || loadImmediately ? (
                            <Suspense fallback={<LazySectionSkeleton className="h-[400px]" />}>
                              <LazyUserDemographicsSection source={source} userType={filters.userType} shouldLoadUserDemographics={shouldLoadUserDemographics} />
                            </Suspense>
                          ) : <LazySectionSkeleton />}
                        </div>
                      )}
                      
                      {/* 3-column row */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 auto-rows-fr items-stretch">
                        {source !== "whatsapp" && (
                          <div className="h-full">
                            <PlatformDonutSegments source={source} userType={filters.userType} />
                          </div>
                        )}
                        
                        {/* Knowledge & Awareness Card */}
                        {source !== "whatsapp" && (
                          <div className="h-full relative" ref={(el) => { sectionRefs.current["farmer-segments"] = el; }}>
                            <KnowledgeAwarenessCard
                              userMetricesData={userMetricesData?.kccAndAgriAppUsage}
                              hovered={hovered}
                              setHovered={setHovered}
                              agriHovered={agriHovered}
                              setAgriHovered={setAgriHovered}
                              isRefreshing={kwDataRefreshing}
                              onRefresh={handleKWRefresh}
                            />
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
                      
                      {/* Query Insights */}
                      <div ref={(el) => { queryInsightsRef.current = el; }}>
                        <QueryInsightsSection
                          queryCategories={queryCategories}
                          topCrops={topCrops}
                          isLoadingQueryCategories={isLoadingQueryCategories}
                          isLoadingTopCrops={isLoadingTopCrops}
                          errorLoadingtopCrops={errorLoadingtopCrops}
                          shouldLoadQueryInsights={shouldLoadQueryInsights}
                          source={source}
                          userType={filters.userType}
                        />
                      </div>
                      
                      {/* Daily Trends */}
                      <div ref={(el) => { trendsRef.current = el; }} className="grid grid-cols-1 lg:grid-cols-1 gap-3 mb-4 mt-6">
                        {shouldLoadTrends ? (
                          <DailyQuestionTrendsChart trends={(dailyQuestionTrendsData as any) ?? []} dateRange={trendsDateRange} onDateRangeChange={setTrendsDateRange} isLoading={trendsLoading} />
                        ) : <LazySectionSkeleton className="h-[320px]" />}
                      </div>
                      
                      {/* State Analytics & FAQ Leaderboard */}
                      <div ref={(el) => { faqsRef.current = el; }} className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                        {shouldLoadFaqs ? (
                          <>
                            <DashboardStateWiseAnalytics source={source} userType={filters.userType} />
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
                      
                      {/* Active Users Section */}
                      {source !== "whatsapp" && (
                    <div ref={(el) => { activeUsersRef.current = el; }} className="mt-4 mb-4">
                      {shouldLoadActiveUsers ? (
                        <ActiveUsersSection
                          activeChartTab={activeChartTab}
                          onChartTabChange={setActiveChartTab}
                          source={source}
                          userType={filters.userType}
                        />
                      ) : <LazySectionSkeleton className="h-[400px]" />}
                      </div>
                    )}
                  
                  {/* Weather Concern Analytics */}
                  {source !== "whatsapp" && (
                    <div ref={(el) => { weatherConcernRef.current = el; }} className="mt-4 mb-4">
                      {shouldLoadWeatherConcern ? (
                        <WeatherConcernAnalyticsCard source={source} userType={filters.userType} filters={weatherConcernFilters} onFiltersChange={setWeatherConcernFilters} />
                      ) : <LazySectionSkeleton className="h-[360px]" />}
                    </div>
                  )}
                  
                  {/* Farmer Heat Map */}
                  {source !== "whatsapp" && (
                    <div ref={(el) => { farmerHeatMapRef.current = el; }} className="mt-4 mb-4">
                      {shouldLoadFarmerHeatMap ? (
                        <FarmerAnalyticsHeatMap source={source} userType={filters.userType} enabled={shouldLoadFarmerHeatMap} />
                      ) : <LazySectionSkeleton className="h-[520px]" />}
                    </div>
                  )}
                  
                  {/* User Details View */}
                  {source !== "whatsapp" && (
                    <div ref={(el) => { sectionRefs.current["user-details"] = el; userDetailsRef.current = el; }}>
                      {shouldLoadUserDetails ? (
                        <UserDetailsView source={source} initialFilters={userDetailsInitialFilters} userType={filters.userType} />
                      ) : <LazySectionSkeleton className="h-[520px]" />}
                    </div>
                  )}
                  
                  {/* WhatsApp Users View */}
                  {source === "whatsapp" && (
                    <div ref={(el) => { sectionRefs.current["user-details"] = el; }}>
                      <WhatsAppUsersView />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}