// ─── Dashboard Handlers & Visibility Hook ────────────────────────────────────
import { useState, useCallback, useMemo } from "react";
import { useInView } from "@/hooks/useInView";
import type { DashboardView } from "../DashboardSidebar";
import { getTodayStart } from "../utils/dateUtils";

type ExtendedDashboardView = DashboardView | "responsetable";

interface ScrollToFn {
  (view: ExtendedDashboardView): void;
}

interface SectionRefs {
  current: Partial<Record<ExtendedDashboardView, HTMLDivElement | null>>;
}

interface DashboardHandlersProps {
  source: "annam" | "whatsapp" | "acc";
  loadImmediately: boolean;
  onSetActiveView: (view: DashboardView) => void;
  onSetUserDetailsInitialFilters: (filters: any) => void;
  onSetInactiveUsersPage: (page: number) => void;
  onSetIsInactiveWhatsappModalOpen: (open: boolean) => void;
  onSetIsDuplicateModalOpen: (open: boolean) => void;
  queryClient: any;
}

export interface VisibilityFlags {
  shouldLoadResponseAdherence: boolean;
  shouldLoadQueryInsights: boolean;
  shouldLoadTrends: boolean;
  shouldLoadFaqs: boolean;
  shouldLoadActiveUsers: boolean;
  shouldLoadWeatherConcern: boolean;
  shouldLoadFarmerHeatMap: boolean;
  shouldLoadUserDetails: boolean;
  shouldLoadUserDemographics: boolean;
  isGrowthVisible: boolean;
  isResponseAdherenceVisible: boolean;
  isQueryInsightsVisible: boolean;
  isTrendsVisible: boolean;
  isFaqsVisible: boolean;
  isActiveUsersVisible: boolean;
  isWeatherConcernVisible: boolean;
  isFarmerHeatMapVisible: boolean;
  isUserDetailsVisible: boolean;
  isUserDemographicsVisible: boolean;
}

export interface DashboardHandlersReturn {
  // Refs for scroll management (passed in, returned for reference)
  sectionRefs: SectionRefs;
  
  // Visibility refs (from useInView)
  growthRef: ReturnType<typeof useInView>["ref"];
  queryInsightsRef: ReturnType<typeof useInView>["ref"];
  responseAdherenceRef: ReturnType<typeof useInView>["ref"];
  trendsRef: ReturnType<typeof useInView>["ref"];
  faqsRef: ReturnType<typeof useInView>["ref"];
  activeUsersRef: ReturnType<typeof useInView>["ref"];
  weatherConcernRef: ReturnType<typeof useInView>["ref"];
  farmerHeatMapRef: ReturnType<typeof useInView>["ref"];
  userDetailsRef: ReturnType<typeof useInView>["ref"];
  userDemographicsRef: ReturnType<typeof useInView>["ref"];
  
  // Visibility flags
  visibilityFlags: VisibilityFlags;
  
  // Loading states
  invalidating: boolean;
  kwDataRefreshing: boolean;
  
  // Handlers
  scrollTo: ScrollToFn;
  handleViewChange: (view: DashboardView) => void;
  handleLowFeedbackUsersClick: () => void;
  handleInactiveUsersClick: () => void;
  handleWhatsappInactiveUsersClick: () => void;
  handleRefreshAll: () => Promise<void>;
  handleKWRefresh: () => Promise<void>;
  handleDuplicateClick: () => void;
}

export function useDashboardHandlers({
  source,
  loadImmediately,
  onSetActiveView,
  onSetUserDetailsInitialFilters,
  onSetInactiveUsersPage,
  onSetIsInactiveWhatsappModalOpen,
  onSetIsDuplicateModalOpen,
  queryClient,
}: DashboardHandlersProps): DashboardHandlersReturn {
  // ─── Loading States ────────────────────────────────────────────────────────
  const [invalidating, setInvalidating] = useState(false);
  const [kwDataRefreshing, setKWDataRefreshing] = useState(false);
  const [sectionRefs] = useState<SectionRefs>(() => ({ current: {} }));

  // ─── In-View Refs ──────────────────────────────────────────────────────────
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

  // ─── Visibility Flags ──────────────────────────────────────────────────────
  const visibilityFlags = useMemo<VisibilityFlags>(() => ({
    shouldLoadResponseAdherence: loadImmediately || isResponseAdherenceVisible,
    shouldLoadQueryInsights: loadImmediately || isQueryInsightsVisible,
    shouldLoadTrends: loadImmediately || isTrendsVisible,
    shouldLoadFaqs: loadImmediately || isFaqsVisible,
    shouldLoadActiveUsers: loadImmediately || isActiveUsersVisible,
    shouldLoadWeatherConcern: loadImmediately || isWeatherConcernVisible,
    shouldLoadFarmerHeatMap: loadImmediately || isFarmerHeatMapVisible,
    shouldLoadUserDetails: loadImmediately || isUserDetailsVisible,
    shouldLoadUserDemographics: loadImmediately || isUserDemographicsVisible,
    isGrowthVisible,
    isResponseAdherenceVisible,
    isQueryInsightsVisible,
    isTrendsVisible,
    isFaqsVisible,
    isActiveUsersVisible,
    isWeatherConcernVisible,
    isFarmerHeatMapVisible,
    isUserDetailsVisible,
    isUserDemographicsVisible,
  }), [
    loadImmediately,
    isGrowthVisible,
    isResponseAdherenceVisible,
    isQueryInsightsVisible,
    isTrendsVisible,
    isFaqsVisible,
    isActiveUsersVisible,
    isWeatherConcernVisible,
    isFarmerHeatMapVisible,
    isUserDetailsVisible,
    isUserDemographicsVisible,
  ]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const scrollTo = useCallback<ScrollToFn>((view: ExtendedDashboardView) => {
    setTimeout(() => {
      sectionRefs.current[view]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [sectionRefs]);

  const handleViewChange = useCallback((view: DashboardView) => {
    onSetActiveView(view);
    scrollTo(view);
  }, [onSetActiveView, scrollTo]);

  const handleLowFeedbackUsersClick = useCallback(() => {
    onSetUserDetailsInitialFilters({
      lowFeedbackOnly: true,
      inactiveOnly: false,
      search: "",
      crop: "",
      village: "",
      profileCompleted: "all",
    });
    onSetActiveView("user-details");
    scrollTo("user-details");
  }, [onSetUserDetailsInitialFilters, onSetActiveView, scrollTo]);

  const handleInactiveUsersClick = useCallback(() => {
    const threeDaysAgo = getTodayStart();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const today = getTodayStart();
    onSetUserDetailsInitialFilters({
      inactiveOnly: true,
      startTime: threeDaysAgo,
      endTime: today,
      search: "",
      crop: "",
      village: "",
      profileCompleted: "all",
    });
    onSetActiveView("user-details");
    scrollTo("user-details");
  }, [onSetUserDetailsInitialFilters, onSetActiveView, scrollTo]);

  const handleWhatsappInactiveUsersClick = useCallback(() => {
    onSetInactiveUsersPage(1);
    onSetIsInactiveWhatsappModalOpen(true);
  }, [onSetInactiveUsersPage, onSetIsInactiveWhatsappModalOpen]);

  const handleRefreshAll = useCallback(async () => {
    setInvalidating(true);
    // Invalidate ALL query keys used across the dashboard for complete refresh
    const queryKeys = [
      // Core dashboard data
      "dashboard-data",
      // Analytics queries
      "top-faqs",
      "daily-question-trends",
      "user-metrices",
      "user_growth",
      "response-adherence-table",
      "retention_metrics",
      "query-categories",
      "active_user_trend",
      "monthly-churn-rate",
      "weather-concern-analytics",
      "farmer-heat-map",
      // State and crop analytics
      "top-crops-chatbot",
      "state-wise-analytics",
      // User-related queries
      "user-details",
      "user-questions-data",
      "total-query-analytics",
      // WhatsApp-specific queries
      "whatsapp-inactive-users",
      "whatsapp-unique-users",
      "whatsapp-all-users",
      // Closed/notification data
      "closed-notified-data",
    ];
    queryKeys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
    setTimeout(() => setInvalidating(false), 1000);
  }, [queryClient]);

  const handleKWRefresh = useCallback(async () => {
    setKWDataRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["user-metrices"] });
    setKWDataRefreshing(false);
  }, [queryClient]);

  const handleDuplicateClick = useCallback(() => {
    onSetIsDuplicateModalOpen(true);
  }, [onSetIsDuplicateModalOpen]);

  return {
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
    invalidating,
    kwDataRefreshing,
    scrollTo,
    handleViewChange,
    handleLowFeedbackUsersClick,
    handleInactiveUsersClick,
    handleWhatsappInactiveUsersClick,
    handleRefreshAll,
    handleKWRefresh,
    handleDuplicateClick,
  };
}

export default useDashboardHandlers;