// ─── Dashboard State Hooks ────────────────────────────────────────────────────
import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DashboardFilterValues } from "../DashboardFilters";
import type { Segment } from "../types";
import type { DashboardView } from "../DashboardSidebar";
import type { DateRange } from "react-day-picker";
import type { UserDetailsFilters } from "../components/UserDetailsPreferenceFilter";
import type { ApplicationSource, Filters } from "../NewFilters";
import type { WeatherConcernFilters } from "./useWeatherConcernAnalytics";
import { DEFAULT_WEATHER_CONCERN_FILTERS } from "./useWeatherConcernAnalytics";
import { DEFAULT_FILTERS, DASHBOARD_QUERY_KEYS } from "../utils/constants";
import { getISOStringsForDateRange, formatDateForInput, parseInputDateToLocalDate } from "../utils/dateUtils";
import type { ReactNode, RefObject } from "react";

// ─── Hook: Dashboard Core State ───────────────────────────────────────────────

export interface UseDashboardStateProps {
  initialSource?: "annam" | "whatsapp";
}

export function useDashboardState({ initialSource = "annam" }: UseDashboardStateProps = {}) {
  // Filter state
  const [filters, setFilters] = useState<DashboardFilterValues>(DEFAULT_FILTERS);
  
  // View state
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [activeChartTab, setActiveChartTab] = useState<string>("dau");
  
  // Segment state
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  
  // Source state
  const [source, setSource] = useState<"annam" | "whatsapp">(initialSource);
  
  // New filters state
  const [newFilters, setNewFilters] = useState<Filters>(() => {
    const saved = localStorage.getItem("application-filter");
    return {
      sourceType: "application",
      application: (saved as ApplicationSource) || initialSource,
    };
  });
  
  // Weather concern filters
  const [weatherConcernFilters, setWeatherConcernFilters] = useState<WeatherConcernFilters>(
    DEFAULT_WEATHER_CONCERN_FILTERS
  );

  // User details initial filters
  const [userDetailsInitialFilters, setUserDetailsInitialFilters] = useState<
    Partial<UserDetailsFilters> | undefined
  >(undefined);

  // Modal states
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [isInactiveWhatsappModalOpen, setIsInactiveWhatsappModalOpen] = useState(false);
  const [inactiveUsersPage, setInactiveUsersPage] = useState(1);

  // Date range states
  const [trendsDateRange, setTrendsDateRange] = useState<DateRange | undefined>(undefined);
  const [faqsDateRange, setFaqsDateRange] = useState<DateRange | undefined>(undefined);
  const [responseAdherenceDate, setResponseAdherenceDate] = useState<string>(
    formatDateForInput(new Date())
  );
  const [closed2hDateRange, setClosed2hDateRange] = useState<DateRange | undefined>(undefined);
  const [questionStatusDateRange, setQuestionStatusDateRange] = useState<DateRange | undefined>(undefined);
  const [customerNotificationsDateRange, setCustomerNotificationsDateRange] = useState<DateRange | undefined>(undefined);

  // Scroll management
  const [sectionRefs] = useState<Record<string, HTMLDivElement | null>>({});

  // Knowledge & awareness hover states
  const [hovered, setHovered] = useState<string | null>(null);
  const [agriHovered, setAgriHovered] = useState<string | null>(null);

  // Refresh state
  const [kwDataRefreshing, setKWDataRefreshing] = useState(false);
  const [invalidating, setInvalidating] = useState(false);

  // Helper to scroll to a section
  const scrollTo = useCallback((view: DashboardView) => {
    setTimeout(
      () =>
        sectionRefs[view]?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      50
    );
  }, [sectionRefs]);

  // Handle source change
  const handleSourceChange = useCallback((newSource: "annam" | "whatsapp") => {
    setSource(newSource);
    if (newSource === "whatsapp") {
      setFilters((prev) => ({ ...prev, userType: "all" }));
    }
    // Clear date ranges
    setClosed2hDateRange(undefined);
    setQuestionStatusDateRange(undefined);
    setCustomerNotificationsDateRange(undefined);
  }, []);

  // Handle view change with scroll
  const handleViewChange = useCallback((view: DashboardView) => {
    setActiveView(view);
    scrollTo(view);
  }, [scrollTo]);

  // Handle segment click
  const handleSegmentClick = useCallback((seg: Segment) => {
    if (activeSegment?.id === seg.id) {
      setActiveSegment(null);
      return;
    }
    setActiveSegment(seg);
    setTimeout(
      () =>
        sectionRefs["farmer-segments"]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      50
    );
  }, [activeSegment, sectionRefs]);

  // Clear active segment
  const clearSegment = useCallback(() => setActiveSegment(null), []);

  // Handle user type filter change
  const handleUserTypeChange = useCallback((userType: DashboardFilterValues["userType"]) => {
    setFilters((prev) => ({ ...prev, userType }));
  }, []);

  // Navigate to user details with low feedback filter
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

  // Navigate to user details with inactive users filter
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

  // Handle whatsapp inactive users modal
  const handleWhatsappInactiveUsersClick = useCallback(() => {
    setInactiveUsersPage(1);
    setIsInactiveWhatsappModalOpen(true);
  }, []);

  // Refresh all dashboard data
  const queryClient = useQueryClient();
  const handleRefreshAll = useCallback(async () => {
    setInvalidating(true);
    DASHBOARD_QUERY_KEYS.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
    setTimeout(() => setInvalidating(false), 500);
  }, [queryClient]);

  // Refresh knowledge & awareness data
  const handleKWRefresh = useCallback(async () => {
    setKWDataRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["user-metrices"] });
    setKWDataRefreshing(false);
  }, [queryClient]);

  // Computed values
  const trendsFilters = useMemo(
    () => ({
      ...filters,
      startTime: trendsDateRange?.from,
      endTime: trendsDateRange?.to,
    }),
    [filters, trendsDateRange]
  );

  const faqsFilters = useMemo(
    () => ({
      ...filters,
      startTime: faqsDateRange?.from,
      endTime: faqsDateRange?.to,
    }),
    [filters, faqsDateRange]
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
        now.getMilliseconds()
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

  // Date range ISO strings
  const closed2hRange = useMemo(
    () => getISOStringsForDateRange(closed2hDateRange),
    [closed2hDateRange]
  );

  const questionStatusRange = useMemo(
    () => getISOStringsForDateRange(questionStatusDateRange),
    [questionStatusDateRange]
  );

  const customerNotificationsRange = useMemo(
    () => getISOStringsForDateRange(customerNotificationsDateRange),
    [customerNotificationsDateRange]
  );

  return {
    // State
    filters,
    setFilters,
    activeView,
    setActiveView,
    activeChartTab,
    setActiveChartTab,
    activeSegment,
    setActiveSegment,
    source,
    setSource: handleSourceChange,
    newFilters,
    setNewFilters,
    weatherConcernFilters,
    setWeatherConcernFilters,
    userDetailsInitialFilters,
    setUserDetailsInitialFilters,
    
    // Modal states
    isDuplicateModalOpen,
    setIsDuplicateModalOpen,
    isInactiveWhatsappModalOpen,
    setIsInactiveWhatsappModalOpen,
    inactiveUsersPage,
    setInactiveUsersPage,
    
    // Date ranges
    trendsDateRange,
    setTrendsDateRange,
    faqsDateRange,
    setFaqsDateRange,
    responseAdherenceDate,
    setResponseAdherenceDate,
    closed2hDateRange,
    setClosed2hDateRange,
    questionStatusDateRange,
    setQuestionStatusDateRange,
    customerNotificationsDateRange,
    setCustomerNotificationsDateRange,
    
    // Hover states
    hovered,
    setHovered,
    agriHovered,
    setAgriHovered,
    
    // Loading states
    kwDataRefreshing,
    invalidating,
    
    // Refs
    sectionRefs,
    
    // Computed
    trendsFilters,
    faqsFilters,
    responseAdherenceFilters,
    closed2hRange,
    questionStatusRange,
    customerNotificationsRange,
    
    // Handlers
    scrollTo,
    handleViewChange,
    handleSegmentClick,
    clearSegment,
    handleUserTypeChange,
    handleLowFeedbackUsersClick,
    handleInactiveUsersClick,
    handleWhatsappInactiveUsersClick,
    handleRefreshAll,
    handleKWRefresh,
  };
}

// ─── Hook: In-View Visibility Refs ────────────────────────────────────────────

export interface InViewState {
  ref: RefObject<HTMLDivElement | null>;
  isVisible: boolean;
}

export function useInViewRefs() {
  const { useInView } = require("@/hooks/useInView");
  
  const growthRef = useInView();
  const queryInsightsRef = useInView();
  const responseAdherenceRef = useInView();
  const trendsRef = useInView();
  const faqsRef = useInView();
  const activeUsersRef = useInView();
  const weatherConcernRef = useInView();
  const farmerHeatMapRef = useInView();
  const userDetailsRef = useInView();
  const userDemographicsRef = useInView();

  const shouldLoadResponseAdherence = true; // Will be overridden by loadImmediately
  const shouldLoadQueryInsights = true;
  const shouldLoadTrends = true;
  const shouldLoadFaqs = true;
  const shouldLoadActiveUsers = true;
  const shouldLoadWeatherConcern = true;
  const shouldLoadFarmerHeatMap = true;
  const shouldLoadUserDetails = true;
  const shouldLoadUserDemographics = true;

  return {
    refs: {
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
    },
    visibility: {
      isGrowthVisible: growthRef.isVisible,
      isQueryInsightsVisible: queryInsightsRef.isVisible,
      isResponseAdherenceVisible: responseAdherenceRef.isVisible,
      isTrendsVisible: trendsRef.isVisible,
      isFaqsVisible: faqsRef.isVisible,
      isActiveUsersVisible: activeUsersRef.isVisible,
      isWeatherConcernVisible: weatherConcernRef.isVisible,
      isFarmerHeatMapVisible: farmerHeatMapRef.isVisible,
      isUserDetailsVisible: userDetailsRef.isVisible,
      isUserDemographicsVisible: userDemographicsRef.isVisible,
    },
    shouldLoad: {
      responseAdherence: shouldLoadResponseAdherence,
      queryInsights: shouldLoadQueryInsights,
      trends: shouldLoadTrends,
      faqs: shouldLoadFaqs,
      activeUsers: shouldLoadActiveUsers,
      weatherConcern: shouldLoadWeatherConcern,
      farmerHeatMap: shouldLoadFarmerHeatMap,
      userDetails: shouldLoadUserDetails,
      userDemographics: shouldLoadUserDemographics,
    },
  };
}