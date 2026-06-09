import React, {
  useState,
  useRef,
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
// import { useDailyUserTrend } from "./hooks/useDailyUserTrend";
import { useUserDetails } from "./hooks/useUserDetails";
import type { Segment } from "./types";
import { DashboardSidebar } from "./DashboardSidebar";
import type { DashboardView } from "./DashboardSidebar";
import { DashboardFilters } from "./DashboardFilters";
import type { DashboardFilterValues } from "./DashboardFilters";
import { EightCardsComponent } from "./MetricCard ";
// import DailyActiveUsers from "./dailyActiveUsers";
// import { ChannelSplitCard } from "./components/ChannelSplitCard";
import DashboardQueryCategories from "./DashboardQueryCategories";
// import { DashboardFarmerSegments } from "./DashboardFarmerSegments";
import { AlertCard } from "./AlertCard";
import { DuplicateQuestionsModal } from "./components/DuplicateQuestionsModal";
// import { GeoCard } from "./GeoCard";
// import { HealthScoreCard } from "./HealthScoreCard";
import { SegmentDetailBanner } from "./components/SegmentDetailBanner";
// import { StatusBar } from "./components/StatusBar";
import { UserDetailsView } from "./UserDetailsView";
import { WhatsAppUsersView } from "./WhatsAppUsersView";
// import { UserDemographicsSection } from "./components/UserDemographicsSection";
// import { UserGrowthChart } from "./components/UserGrowthChart";
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
// import { PlatformDonutSegments } from "./components/PlatformDonutSegment";
import PlatformDonutSegments from "./components/PlatformDonutSegment";
import {
  Maximize2,
  X,
  Users,
  RefreshCw,
  UserMinus,
  HelpCircle,
  InfoIcon,
} from "lucide-react";
// import { createPortal } from "react-dom";
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
import NewFilters, { type ApplicationSource, type Filters } from "./NewFilters";
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
  useMonthlyChurnRate,
  useQueryCategories,
  useUniqueWhatsappUsers,
} from "./hooks/useActiveUsersAnalytics";
import { InactiveUsersModal } from "./InactiveUsersModal";
import { RetentionMetricsChart } from "@/features/chatbotDashboard/retention-metrics";
import { motion, AnimatePresence, useTransform, useSpring } from "framer-motion";
import type { Variants } from "framer-motion";

import { WhatsAppUniqueUsersCard } from "./WhatsAppUniqueUsersCard";

import { ClosedInLastTwoHoursCard } from "./ClosedInLastTwoHoursCard";

import { ClosedQuestionsCard } from "./ClosedQuestionsCard";

import { CustomerNotificationsCard } from "./CustomerNotificationsCard";

import { Skeleton } from "@/components/atoms/skeleton";
import { ChurnRateChart } from "./ChurnRateChart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/atoms/button";

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

export function AnnamDashboard_dev({
  className,
  source = "annam",
  onSourceChange,
}: {
  className?: string;
  source?:  "annam" | "whatsapp";
  onSourceChange?: (source: "annam" | "whatsapp") => void;
}) {
  const [invalidating, setInvalidating] = useState(false);
  const queryClient = useQueryClient();
  const handleRefreshAll = async () => {
    setInvalidating(true);
    // Invalidate all dashboard queries - this marks them as stale and triggers background refetch
    // Data stays visible during refetch (unlike refetchQueries which blocks until complete)
    queryClient.invalidateQueries({ queryKey: ["dashboard-data"] });
    queryClient.invalidateQueries({ queryKey: ["top-faqs"] });
    queryClient.invalidateQueries({ queryKey: ["daily-question-trends"] });
    queryClient.invalidateQueries({ queryKey: ["user-metrices"] });
    queryClient.invalidateQueries({ queryKey: ["response-adherence-table"] });
    queryClient.invalidateQueries({ queryKey: ["retention_metrics"] });
    queryClient.invalidateQueries({ queryKey: ["query-categories"] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-inactive-users"] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-unique-users"] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-all-users"] });
    queryClient.invalidateQueries({ queryKey: ["closed-notified-data"] });
    queryClient.invalidateQueries({ queryKey: ["monthly-churn-rate"] });
    queryClient.invalidateQueries({ queryKey: ["active_user_trend"] });
    queryClient.invalidateQueries({ queryKey: ["user-details"] });
    queryClient.invalidateQueries({ queryKey: ["user_growth"] });
    queryClient.invalidateQueries({ queryKey: ["top-crops-chatbot"] });
    queryClient.invalidateQueries({ queryKey: ["state-wise-analytics"] });
    queryClient.invalidateQueries({ queryKey: ["weather-concern-analytics"] });
    queryClient.invalidateQueries({ queryKey: ["farmer-heat-map"] });
    
    // Give a short delay to show the refreshing state
    setTimeout(() => setInvalidating(false), 500);
  };
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [activeChartTab, setActiveChartTab] = useState<string>("dau");
  const [filters, setFilters] =
    useState<DashboardFilterValues>(DEFAULT_FILTERS);
  // const segmentRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const isAppAnalyticsSource =
    source === "annam" || source === "whatsapp";
  const loadImmediately = !isAppAnalyticsSource;
  const { data, isLoading, isFetching, error } = useDashboardData(
    filters,
    source,
    isAppAnalyticsSource,
  );
  const [inactiveUsersPage, setInactiveUsersPage] = useState(1);
  const { data: inactiveWhatsappUsers } = useInactiveWhatsappUsers(
    inactiveUsersPage,
    source === "whatsapp",
  );
  const [closed2hDateRange, setClosed2hDateRange] = useState<
    DateRange | undefined
  >(undefined);
  const [questionStatusDateRange, setQuestionStatusDateRange] = useState<
    DateRange | undefined
  >(undefined);
  const [customerNotificationsDateRange, setCustomerNotificationsDateRange] =
    useState<DateRange | undefined>(undefined);

  const getISOStringsForDateRange = useCallback((range?: DateRange) => {
    if (!range || !range.from)
      return { startTime: undefined, endTime: undefined };

    const startTime = new Date(range.from);
    startTime.setHours(0, 0, 0, 0);

    const endDate = range.to ? new Date(range.to) : new Date(range.from);
    const endTime = new Date(endDate);
    const now = new Date();
    const isSelectedToday =
      endDate.getFullYear() === now.getFullYear() &&
      endDate.getMonth() === now.getMonth() &&
      endDate.getDate() === now.getDate();

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
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };
  }, []);

  const closed2hRange = useMemo(
    () => getISOStringsForDateRange(closed2hDateRange),
    [closed2hDateRange, getISOStringsForDateRange],
  );
  const questionStatusRange = useMemo(
    () => getISOStringsForDateRange(questionStatusDateRange),
    [questionStatusDateRange, getISOStringsForDateRange],
  );
  const customerNotificationsRange = useMemo(
    () => getISOStringsForDateRange(customerNotificationsDateRange),
    [customerNotificationsDateRange, getISOStringsForDateRange],
  );

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

  useEffect(() => {
    setClosed2hDateRange(undefined);
    setQuestionStatusDateRange(undefined);
    setCustomerNotificationsDateRange(undefined);
  }, [source]);
  const [isInactiveWhatsappModalOpen, setIsInactiveWhatsappModalOpen] =
    useState(false);
  const handleWhatsappInactiveUsersClick = useCallback(() => {
    setInactiveUsersPage(1);
    setIsInactiveWhatsappModalOpen(true);
  }, []);

  const { ref: growthRef, isVisible: isGrowthVisible } = useInView();
  const { ref: queryInsightsRef, isVisible: isQueryInsightsVisible } =
    useInView();
  const { ref: responseAdherenceRef, isVisible: isResponseAdherenceVisible } =
    useInView();
  const { ref: trendsRef, isVisible: isTrendsVisible } = useInView();
  const { ref: faqsRef, isVisible: isFaqsVisible } = useInView();
  const { ref: activeUsersRef, isVisible: isActiveUsersVisible } = useInView();
  const { ref: weatherConcernRef, isVisible: isWeatherConcernVisible } =
    useInView();
  const { ref: farmerHeatMapRef, isVisible: isFarmerHeatMapVisible } =
    useInView();
  const { ref: userDetailsRef, isVisible: isUserDetailsVisible } = useInView();
  // const { ref: userVerificationRef, isVisible: isUserVerificationVisible } = useInView();
  const { ref: userDemographicsRef, isVisible: isUserDemographicsVisible } =
    useInView();

  const shouldLoadResponseAdherence =
    loadImmediately || isResponseAdherenceVisible;
  const shouldLoadQueryInsights = loadImmediately || isQueryInsightsVisible;
  const shouldLoadTrends = loadImmediately || isTrendsVisible;
  const shouldLoadFaqs = loadImmediately || isFaqsVisible;
  const shouldLoadActiveUsers = loadImmediately || isActiveUsersVisible;
  const shouldLoadWeatherConcern = loadImmediately || isWeatherConcernVisible;
  const shouldLoadFarmerHeatMap = loadImmediately || isFarmerHeatMapVisible;
  const shouldLoadUserDetails = loadImmediately || isUserDetailsVisible;
  // const shouldUserVerification = loadImmediately || isUserVerificationVisible;
  const shouldLoadUserDemographics = loadImmediately || isUserDemographicsVisible;

  const { data: queryCategories } = useQueryCategories(
    source,
    filters.userType,
    shouldLoadQueryInsights,
  );
  const [trendsDateRange, setTrendsDateRange] = useState<DateRange | undefined>(
    undefined,
  );
  const [faqsDateRange, setFaqsDateRange] = useState<DateRange | undefined>(
    undefined,
  );
  const [responseAdherenceDate, setResponseAdherenceDate] = useState<string>(
    formatDateForInput(new Date()),
  );

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

  // const { data: trendsData, isLoading: trendsLoading, isFetching: trendsFetching } = useDashboardData(
  //   trendsFilters,
  //   source,
  //   shouldLoadTrends,
  // );
  // const { data: faqsDataa, isLoading: faqsLoadinga, isFetching: faqsFetchinga } = useDashboardData(
  //   faqsFilters,
  //   source,
  //   shouldLoadFaqs,
  // );
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
  // console.log(faqsDataa,"----faqs filters", faqsFilters, faqsData);
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

  // const {
  //   data: responseAdherenceData,
  //   isLoading: isResponseAdherenceLoading,
  //   isFetching: isResponseAdherenceFetching,
  // } = useDashboardData(responseAdherenceFilters, source);

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

  // const {
  //   data: dauTrend,
  //   isLoading: dauLoading,
  //   error: dauError,
  // } = useDailyUserTrend(
  //   30,
  //   source,
  //   filters.userType,
  //   isGrowthVisible && isAppAnalyticsSource,
  // );
  const [userDetailsInitialFilters, setUserDetailsInitialFilters] = useState<
    Partial<UserDetailsFilters> | undefined
  >(undefined);

  const {
    data: topCrops,
    isLoading: isLoadingTopCrops,
    error: errorLoadingtopCrops,
  } = useTopCrops(source, filters.userType, shouldLoadQueryInsights);
  // const [isKnowledgeMaximized, setIsKnowledgeMaximized] = useState(false);

  const [hovered, setHovered] = useState<string | null>(null);
  const [agriHovered, setAgriHovered] = useState<string | null>(null);

  const sectionRefs = useRef<
    Partial<Record<DashboardView, HTMLDivElement | null>>
  >({});
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

  // Fetch today's active farmers to get accurate DAU count based on profile and lastActiveAt
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
    true, // activeTodayByProfile
    "",
    "verified", // verificationStatus
    true, // enabled
  );

  // Patch the DAU card to show "today / total" instead of just total
  
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

  // const [newFilters, setNewFilters] = useState<Filters>({
  //   sourceType: "application",
  //   application: source,
  // });
  const [newFilters, setNewFilters] = useState<Filters>(() => {
    const saved = localStorage.getItem("application-filter");

    return {
      sourceType: "application",
      application: (saved as ApplicationSource) || source,
    };
  });
  const [weatherConcernFilters, setWeatherConcernFilters] =
    useState<WeatherConcernFilters>(DEFAULT_WEATHER_CONCERN_FILTERS);

  const queryCard = data?.kpiRow1?.find((card) => card.id === "queries");

  const dailyAnalytics = queryCard?.dailyAnalytics || [];

  const weeklyAnalytics = queryCard?.weeklyAnalytics || [];

  const monthlyAnalytics = queryCard?.monthlyAnalytics || [];

  useEffect(() => {
    if (source === "whatsapp") {
      setFilters((prev) => ({
        ...prev,
        userType: "all",
      }));
    }
  }, [source]);

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

  const {
    data: userMetricesData,
    isLoading: usermetricsLoading,
    isFetching: usermetricsFetching,
  } = useUserMertices(source, filters.userType, shouldLoadUserDemographics);
  const [kwDataRefreshing, setKWDataRefreshing] = useState(false);
  const handleKWRefresh = async ()=>{
    setKWDataRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["user-metrices"] });
    setKWDataRefreshing(false);
  }

const {data: unqueWhatsAppUsers, isFetching: isUniqueWhatsAppUsersFetching, isLoading: isUniqueWhatsAppUsersLoading} = useUniqueWhatsappUsers(source === "whatsapp");

  // Animation variants for staggered entrance
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: "easeOut",
      },
    },
    hover: {
      scale: 1.02,
      transition: { duration: 0.2 },
    },
  };

  const slideInVariants: Variants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut",
      },
    },
  };

  const tabContentVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: "easeInOut",
      },
    },
    exit: {
      opacity: 0,
      y: -10,
      transition: {
        duration: 0.2,
        ease: "easeIn",
      },
    },
  };

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
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex items-center justify-between gap-4 border-b border-border pb-3 mb-5 pt-3"
              >
                {/* Source Tabs (Annam / WhatsApp) */}
                <div className="flex items-center gap-2">
                  {/* Annam Tab */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSourceChange?.("annam")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      source === "annam"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    Annam
                  </motion.button>

                  {/* WhatsApp Tab */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSourceChange?.("whatsapp")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      source === "whatsapp"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    WhatsApp
                  </motion.button>
                </div>

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
              </motion.div>

              <DashboardFilters filters={filters} onFilterChange={setFilters} />
 
              {(source === "annam" ||
                // source === "vicharanashala" ||
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

  
                {/* 
                  {isFetching && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center">
                      {/* <Spinner
                        text="Preparing dashboard insights and refreshing analytics..."
                        fullScreen={false}
                      /> 
                      {loadingSkeletonRows.map((row, rowIndex) => (
                        <div
                          key={rowIndex}
                          className={`grid gap-5 ${row.cols}`}
                        >
                          {row.items.map((item, itemIndex) => (
                            <Skeleton
                              key={itemIndex}
                              className={`w-full rounded-2xl ${item.span}`}
                              style={{ height: item.height }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  )} */}
                  {/* {isLoading ? (
                    <div className="space-y-5 animate-pulse">
                      {loadingSkeletonRows.map((row, rowIndex) => (
                        <div
                          key={rowIndex}
                          className={`grid gap-5 ${row.cols}`}
                        >
                          {row.items.map((item, itemIndex) => (
                            <Skeleton
                              key={itemIndex}
                              className={`w-full rounded-2xl ${item.span}`}
                              style={{ height: item.height }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (  */}
                    <>
                      <div
                        ref={(el) => {
                          sectionRefs.current["overview"] = el;
                        }}
                        className={`relative transition-all duration-300 }`}
                      >
                        {/* {(isLoading || isFetching) && (
                      <div className="absolute inset-0 z-50 flex items-center justify-center">
                        <Spinner text="Fetching metrics asdfasdfasdfads..." fullScreen={false} />
                      </div>
                    )} */}

                        {/* <EightCardsComponent
                      kpiRow1={patchedKpiRow1}
                      kpiRow2={data.kpiRow2}
                    /> */}
                        {/* Uncomment the above line when data is dynamic and delete the below code */}
                        {(source === "annam" 
                        // ||source === "vicharanashala"
                        ) && (
                          <EightCardsComponent
                            kpiRow1={kpiRow1WithOverlay}
                            kpiRow2={kpiRow2WithOverlay}
                            source={source}
                            userType={filters.userType}
                            isLoading={isFetching}
                          />
                        )}
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
                        <div
                          className={`grid gap-4 mb-6 items-stretch ${
                            source === "whatsapp"
                              ? "grid-cols-1 lg:grid-cols-[0.6fr_1fr_1.4fr_1.4fr]"
                              : "grid-cols-1 lg:grid-cols-[1fr_1.4fr_1.4fr]"
                          }`}
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
                            totalClosed={
                              closed2hData?.closedVsTotalQuestions
                                ?.closedQuestions
                            }
                            dateRange={closed2hDateRange}
                            onDateRangeChange={setClosed2hDateRange}
                            isLoading={isClosed2hFetching || isClosed2hLoading}
                          />
                          <ClosedQuestionsCard
                            closedQuestions={
                              questionStatusData?.closedVsTotalQuestions
                                ?.closedQuestions
                            }
                            totalQuestions={
                              questionStatusData?.closedVsTotalQuestions
                                ?.totalQuestions
                            }
                            inReview={
                              questionStatusData?.closedVsTotalQuestions
                                ?.inReviewQuestions
                            }
                            dateRange={questionStatusDateRange}
                            onDateRangeChange={setQuestionStatusDateRange}
                            isLoading={isQuestionStatusFetching || isQuestionStatusLoading}
                            carryForward={
                              questionStatusData?.carryForward
                            }
                            avgCloseTimeMinutes={
                              questionStatusData?.closedVsTotalQuestions
                                ?.avgCloseTimeMinutes
                            }
                            previousMonthAvgCloseTimeMinutes={
                              questionStatusData?.closedVsTotalQuestions
                                ?.previousMonthAvgCloseTimeMinutes
                            }
                            statusBreakup={questionStatusData?.closedVsTotalQuestions}
                            source ={source}
                            userType = {filters.userType}
                          />
                          <CustomerNotificationsCard
                            notified={
                              customerNotificationsData?.notifiedVsClosed
                                ?.notified
                            }
                            notNotified={
                              customerNotificationsData?.notifiedVsClosed
                                ?.notNotified
                            }
                            untrackedClosedQuestions={
                              customerNotificationsData?.notifiedVsClosed
                                ?.untrackedClosedQuestions
                            }
                            dateRange={customerNotificationsDateRange}
                            onDateRangeChange={setCustomerNotificationsDateRange}
                            isLoading={isCustomerNotificationsFetching || isCustomerNotificationsLoading}
                            source = {source}
                            userType = {filters.userType}
                          />
                        </div>
                        {source !== "whatsapp" && (
                          <div   ref={(el) => {
                            sectionRefs.current["responsetable"] = el;
                            responseAdherenceRef.current = el;
                          }}>
                            {shouldLoadResponseAdherence ? <ResponseAdherenceTableCard
                              data={responseAdherenceData}
                              selectedDate={responseAdherenceDate}
                              onSelectedDateChange={setResponseAdherenceDate}
                              isLoading={
                                isResponseAdherenceLoading ||
                                isResponseAdherenceFetching
                              }
                            /> : <LazySectionSkeleton className="h-[400px]" />}
                          </div>
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
                        {isGrowthVisible || loadImmediately ? (
                          <Suspense fallback={<LazySectionSkeleton />}>
                            <LazyUserGrowthChart source={source} userType = {filters.userType}/>
                          </Suspense>
                        ) : (
                          <LazySectionSkeleton />
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
                            onDuplicateClick={() =>
                              setIsDuplicateModalOpen(true)
                            }
                            lowFeedbackUsersCount={
                              (data as any).lowFeedbackUsersCount ?? null
                            }
                            onLowFeedbackClick={handleLowFeedbackUsersClick}
                            source={source}
                            onInactiveWhatsAppUsersClick={
                              handleWhatsappInactiveUsersClick
                            }
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

                      {/* Demographics */}
                      {source !== "whatsapp" && (
                        <div
                          ref={(el) => {
                            sectionRefs.current["demographics"] = el;
                            userDemographicsRef.current = el;
                          }}
                        >
                          {/* <UserDemographicsSection
                            data={{
                              ageGroups: userMetricesData?.userDemographics?.ageGroups,
                              genderSplit: userMetricesData?.userDemographics?.genderSplit,
                              farmingExperience: userMetricesData?.userDemographics?.farmingExperience,
                              landHolding: userMetricesData?.userDemographics?.landHolding ?? [],
                            }}
                            source={source}
                            userType={filters.userType}
                          /> */}
                          {isUserDemographicsVisible || loadImmediately ? (
                            <Suspense
                              fallback={
                                <LazySectionSkeleton className="h-[400px]" />
                              }
                            >
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
                      {/* 2-col row */}

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
                            ref={(el) => {
                              sectionRefs.current["farmer-segments"] = el;
                            }}
                          >
                            {/* <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" /> */}

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
                                      Shows survey statistics on KCC awareness
                                      and agricultural app usage.
                                    </TooltipContent>
                                  </Tooltip>
                                </h3>
                                <button
                                  onClick={handleKWRefresh}
                                  className="rounded-lg shadow-sm backdrop-blur-sm transition-all duration-200"
                                  title="Refresh"
                                >
                                  <RefreshCw
                                    className={`h-3.5 w-3.5 ${
                                      kwDataRefreshing ? "animate-spin" : ""
                                    }`}
                                  />
                                </button>
                              </div>
                              {kwDataRefreshing ? (
                                <div>
                                  <LazySectionSkeleton/>
                                </div>
                              ):(
                                <div className="flex flex-wrap gap-6 justify-center items-center h-[calc(100%-3rem)] overflow-hidden">
                                {[
                                  {
                                    label: "KCC Awareness",
                                    data: userMetricesData?.kccAndAgriAppUsage
                                      ?.kccAwareness,
                                    hovered,
                                    setHover: setHovered,
                                    color: "hsl(142 71% 45%)",
                                    gradId: "kccGrad",
                                  },
                                  {
                                    label: "Uses Agri Apps",
                                    data: userMetricesData?.kccAndAgriAppUsage
                                      ?.agriAppUsage,
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
                                    const noDash = total
                                      ? (no / total) * circ
                                      : 0;
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
                                              strokeWidth={
                                                h === "yes" ? 13 : 10
                                              }
                                              strokeLinecap="round"
                                              strokeDasharray={`${yesDash} ${circ}`}
                                              transform={`rotate(-90 ${cx} ${cy})`}
                                              className="cursor-pointer transition-[stroke-width] duration-200"
                                              onMouseEnter={() =>
                                                setHover("yes")
                                              }
                                              onMouseLeave={() =>
                                                setHover(null)
                                              }
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
                                              onMouseEnter={() =>
                                                setHover("no")
                                              }
                                              onMouseLeave={() =>
                                                setHover(null)
                                              }
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
                              </div>)}

                            </div>
                          </div>
                        )}

                        {source !== "whatsapp" && (
                          <FeedbackCard
                            title="Feedback Data"
                            positiveFeedbacksCount={
                              userMetricesData?.feedbackData?.stats
                                ?.positiveCount
                            }
                            negativeFeedbacksCount={
                              userMetricesData?.feedbackData?.stats
                                ?.negativeCount
                            }
                            positiveFeedbacks={
                              userMetricesData?.feedbackData?.positiveFeedbacks
                            }
                            negativeFeedbacks={
                              userMetricesData?.feedbackData?.negativeFeedbacks
                            }
                            averageRating={
                              userMetricesData?.feedbackData?.stats
                                ?.averageRating
                            }
                          />
                        )}
                      </div>

                      <div
                        ref={(el) => {
                          queryInsightsRef.current = el;
                        }}
                        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                      >
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          ref={(el) => {
                            sectionRefs.current["query-analysis"] = el;
                          }}
                          className="h-full"
                        >
                          {shouldLoadQueryInsights ? (
                            <DashboardQueryCategories
                              categories={
                                queryCategories
                                // source === "whatsapp"
                                //   ? queryCategories
                                //   : data.queryCategories
                              }
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
                          {shouldLoadQueryInsights ? (
                            <TopCropsCard
                              topCrops={topCrops}
                              isLoadingTopCrops={isLoadingTopCrops}
                              errorLoadingtopCrops={errorLoadingtopCrops}
                              source={source}
                              userType= {filters.userType}
                            />
                          ) : (
                            <LazySectionSkeleton className="h-[360px]" />
                          )}
                        </motion.div>
                      </div>

                      {/* Chatbot Quality & FAQ Analytics Section Header */}
                      {/* Daily Trends & FAQ Leaderboard Grid */}
                      {/* Row 1: Daily Trends & Feedback Data */}
                      <div
                        ref={(el) => {
                          trendsRef.current = el;
                        }}
                        className="grid grid-cols-1 lg:grid-cols-1 gap-3 mb-4 mt-6"
                      >
                        {shouldLoadTrends ? (
                          <DailyQuestionTrendsChart
                            trends={dailyQuestionTrendsData}
                            dateRange={trendsDateRange}
                            onDateRangeChange={setTrendsDateRange}
                            isLoading={trendsLoading}
                          />
                        ) : (
                          <LazySectionSkeleton className="h-[320px]" />
                        )}
                      </div>

                      {/* Row 2: State Analytics & FAQ Leaderboard */}
                      <div
                        ref={(el) => {
                          faqsRef.current = el;
                        }}
                        className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4"
                      >
                        {shouldLoadFaqs ? (
                          <>
                            <DashboardStateWiseAnalytics
                              source={source}
                              userType={filters.userType}
                            />

                            <TopFaqsLeaderboard
                              faqs={(faqsData as any)?.topFaqs}
                              topQuestionsFromCollection={
                                (faqsData as any)?.topQuestionsFromCollection
                              }
                              repeatQueryCount={
                                (faqsData as any)?.repeatQueryCount
                              }
                              repeatQueryRatePct={
                                (faqsData as any)?.repeatQueryRatePct
                              }
                              avgQuestionsPerUserDay={
                                (faqsData as any)?.avgQuestionsPerUserDay
                              }
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
                        <div
                          ref={(el) => {
                            activeUsersRef.current = el;
                          }}
                          className=""
                        >
                          {shouldLoadActiveUsers ? (
                            <Tabs
                              value={activeChartTab}
                              onValueChange={setActiveChartTab}
                              className="w-full"
                            >
                              <TabsList className="grid w-full max-w-xl grid-cols-3 mb-4">
                                <TabsTrigger
                                  value="dau"
                                  className="flex items-center justify-center gap-1.5"
                                >
                                  <Users className="h-3.5 w-3.5" />
                                  <span>Daily Active Users</span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help inline-flex items-center p-0.5 text-muted-foreground/60 hover:text-muted-foreground">
                                        <HelpCircle className="h-3.5 w-3.5" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Shows daily, weekly, or monthly active
                                      chatbot user trends based on latest
                                      activity.
                                    </TooltipContent>
                                  </Tooltip>
                                </TabsTrigger>
                                <TabsTrigger
                                  value="retention"
                                  className="flex items-center justify-center gap-1.5"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  <span>User Retention</span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help inline-flex items-center p-0.5 text-muted-foreground/60 hover:text-muted-foreground">
                                        <HelpCircle className="h-3.5 w-3.5" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Tracks D1, D7, and D30 cohort-based user
                                      retention over time.
                                    </TooltipContent>
                                  </Tooltip>
                                </TabsTrigger>
                                <TabsTrigger
                                  value="churn"
                                  className="flex items-center justify-center gap-1.5"
                                >
                                  <UserMinus className="h-3.5 w-3.5" />
                                  <span>Monthly Churn</span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help inline-flex items-center p-0.5 text-muted-foreground/60 hover:text-muted-foreground">
                                        <HelpCircle className="h-3.5 w-3.5" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Measures the percentage of users active in
                                      the previous month who did not return.
                                    </TooltipContent>
                                  </Tooltip>
                                </TabsTrigger>
                              </TabsList>
                              <TabsContent value="dau" className="mt-0">
                                {activeChartTab === "dau" && (
                                  <ActiveUsersChart
                                    source={source}
                                    userType={filters.userType}
                                  />
                                )}
                              </TabsContent>
                              <TabsContent value="retention" className="mt-0">
                                {activeChartTab === "retention" && (
                                  <RetentionMetricsChart
                                    source={source}
                                    userType={filters.userType}
                                  />
                                )}
                              </TabsContent>
                              <TabsContent value="churn" className="mt-0">
                                {activeChartTab === "churn" && (
                                  <ChurnRateChart
                                    source={source}
                                    userType={filters.userType}
                                  />
                                )}
                              </TabsContent>
                            </Tabs>
                          ) : (
                            <LazySectionSkeleton className="h-[400px]" />
                          )}
                        </div>
                      )}
                      {source !== "whatsapp" && (
                        <div
                          ref={(el) => {
                            weatherConcernRef.current = el;
                          }}
                          className="mt-4 mb-4"
                        >
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
                      {source !== "whatsapp" && (
                        <div
                          ref={(el) => {
                            farmerHeatMapRef.current = el;
                          }}
                          className="mt-4 mb-4"
                        >
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
                      {source !== "whatsapp" && (
                        <>
                        <div
                          ref={(el) => {
                            sectionRefs.current["user-details"] = el;
                            userDetailsRef.current = el;
                          }}
                        >
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
                        {/* user verification */}
                            {/* {
                              isAdmin && (
                                <div
                                  ref={(el) => {
                                    sectionRefs.current["verify-users"] = el;
                                    userVerificationRef.current = el;
                                  }}
                                >
                                  {shouldUserVerification ? (
                                    <VerifyUser
                                      source={source}
                                      initialFilters={userVerificationInitialFilters}
                                      userType={filters.userType}
                                    />
                                  ) : (
                                    <LazySectionSkeleton className="h-[520px]" />
                                  )}
                                </div>
                              )
                            } */}
                        
                        </>
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
                    </>
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
