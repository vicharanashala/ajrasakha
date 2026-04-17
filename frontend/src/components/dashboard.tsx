import { useEffect, useState } from "react";
import { ApprovalRateCard } from "./dashboard/approval-rate";
import { ExpertsPerformance } from "./dashboard/experts-performance";
import {
  GoldenDatasetOverview,
  type GoldenDataset,
} from "./dashboard/golden-dataset";
import { ModeratorsOverview } from "./dashboard/overview";
import { StatusCharts } from "./dashboard/question-status";
import {
  QuestionsAnalytics,
  type DateRange,
} from "./dashboard/questions-analytics";
import { SourcesChart } from "./dashboard/sources-chart";
import HeatMap from "./HeatMap";
import { Card, CardHeader, CardTitle } from "./atoms/card";
import {
  useGetDashboardData,
  type DashboardAnalyticsResponse,
} from "@/hooks/api/performance/useGetDashboard";
import { DashboardClock } from "./dashboard/dashboard-clock";
import { Spinner } from "./atoms/spinner";
import { DateRangeFilter } from "./DateRangeFilter";
import { ReviewLevelComponent } from "./ReviewLevelComponent";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { PerformaneService } from "@/hooks/services/performanceService";
import { toast } from "sonner";
import { TopRightBadge } from "./NewBadge";

export type ViewType = "year" | "month" | "week" | "day";

export const Dashboard = () => {

  localStorage.removeItem("animationsEnabled");

  // ---- Golden Dataset Overview state filters ----- //
  const [viewType, setViewType] = useState<ViewType>("year");
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear().toString()
  );
  const [selectedMonth, setSelectedMonth] = useState("January");
  const [selectedWeek, setSelectedWeek] = useState("Week 1");
  const [selectedDay, setSelectedDay] = useState("Mon");

  // ---- SourcesChart state filters ----- //
  const [timeRange, setTimeRange] = useState("90d"); // questionContributionTrend

  // ---- QuestionsAnalytics state filters ----- //
  const [date, setDate] = useState<DateRange>({
    startTime: undefined,
    endTime: undefined,
  });
  const [analyticsType, setAnalyticsType] = useState<"question" | "answer">(
    "question"
  );

  // ---- Heat map state filters ----- //
  const [heatMapDate, setHeatMapDate] = useState<DateRange>({
    startTime: undefined,
    endTime: undefined,
  });

  const [initialLoading, setInitialLoading] = useState(true);
  const [dashboardState, setDashboardState] =
    useState<DashboardAnalyticsResponse | null>(null);

  const [activeFilter, setActiveFilter] = useState<"all" | "golden" | "sources" | "analytics">("all");

  const { data: user} = useGetCurrentUser();


  // Fetch dashboard data
  const {
    data: dashboardData,
    isLoading,
    isFetching,
    error,
  } = useGetDashboardData({
    goldenDataViewType: viewType,
    goldenDataSelectedYear: selectedYear,
    goldenDataSelectedMonth: selectedMonth,
    goldenDataSelectedWeek: selectedWeek,
    goldenDataSelectedDay: selectedDay,
    sourceChartTimeRange: timeRange,
    qnAnalyticsStartTime: date.startTime,
    qnAnalyticsEndTime: date.endTime,
    qnAnalyticsType: analyticsType,
  });

  useEffect(() => {
    if (dashboardData?.userRoleOverview) {
      setDashboardState(dashboardData);
      setInitialLoading(false);
    }
    if (error && !dashboardData) {
      setInitialLoading(false);
    }
  }, [dashboardData, error]);

  useEffect(() => {
    if (!isLoading && !isFetching) {
      setActiveFilter("all");
    }
  }, [isLoading, isFetching]);

  const handleHeatMapDateChange = (key: string, value?: Date) => {
    setHeatMapDate((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const emptyDashboard: DashboardAnalyticsResponse = {
    userRoleOverview: [],
    moderatorApprovalRate: { approved: 0, pending: 0, approvalRate: 0 },
    goldenDataset: {
      type: "year" as GoldenDataset["type"],
      yearData: [] as GoldenDataset["yearData"],
      weeksData: [] as GoldenDataset["weeksData"],
      dailyData: [] as GoldenDataset["dailyData"],
      dayHourlyData: {} as GoldenDataset["dayHourlyData"],
      totalEntriesByType: 0,
      verifiedEntries: 0,
      todayApproved: 0,
    },
    questionContributionTrend: [],
    statusOverview: { questions: [], answers: [] },
    expertPerformance: [],
    analytics: { cropData: [], stateData: [], domainData: [] },
  };

  const handleSendCronReport = async () => {
    try {
      const service = new PerformaneService();
      await service.sendCronSnapshotReport();
      toast.success("Cron snapshot report sent successfully");
    } catch (err) {
      toast.error("Failed to send cron snapshot report");
      console.error("Failed to fetch cron snapshot", err);
    }
  };



  const dataToShow = dashboardState ?? emptyDashboard;

  if (error && !dashboardState && !initialLoading) {
    return <p className="p-6 text-red-500">Error loading dashboard data</p>;
  }

  const isGoldenLoading = isLoading || (activeFilter === "golden" && isFetching);
  const isSourcesLoading = isLoading || (activeFilter === "sources" && isFetching);
  const isAnalyticsLoading = isLoading || (activeFilter === "analytics" && isFetching);
  const isGeneralLoading = isLoading || (activeFilter === "all" && isFetching);

  const LoadingWrapper = ({ loading, text, children }: { loading: boolean; text: string; children: React.ReactNode }) => (
    <div className="relative overflow-hidden rounded-xl min-h-[300px]">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-xl">
          <Spinner text={text} fullScreen={false} />
        </div>
      )}
      {children}
    </div>
  );

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto p-6">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {user?.role === "admin" ? "Admin Dashboard" : "Moderator Dashboard"}
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor content moderation and expert performance
            </p>
          </div>

          <div className="flex items-center gap-4">

            <DashboardClock />
          </div>
        </div>
       <div>
</div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <LoadingWrapper loading={isGeneralLoading} text="Fetching role overview...">
            <ModeratorsOverview data={dataToShow.userRoleOverview} />
          </LoadingWrapper>
          <LoadingWrapper loading={isGeneralLoading} text="Fetching approval stats...">
            <ApprovalRateCard data={dataToShow.moderatorApprovalRate} />
          </LoadingWrapper>
        </div>
        {/* Full Width Sources Chart */}
        <div className="mb-6 ">
          <GoldenDatasetOverview
            data={dataToShow.goldenDataset}
            isLoading={isGoldenLoading}
            selectedYear={selectedYear}
            setSelectedYear={(v) => { setActiveFilter("golden"); setSelectedYear(v); }}
            selectedDay={selectedDay}
            selectedMonth={selectedMonth}
            selectedWeek={selectedWeek}
            setSelectedDay={(v) => { setActiveFilter("golden"); setSelectedDay(v); }}
            setSelectedMonth={(v) => { setActiveFilter("golden"); setSelectedMonth(v); }}
            setSelectedWeek={(v) => { setActiveFilter("golden"); setSelectedWeek(v); }}
            setViewType={(v) => { setActiveFilter("golden"); setViewType(v); }}
            viewType={viewType}
          />
        </div>
        <div className="mb-6">
          <LoadingWrapper loading={isSourcesLoading} text="Fetching sources chart...">
            <SourcesChart
              data={dataToShow.questionContributionTrend}
              timeRange={timeRange}
              setTimeRange={(v) => { setActiveFilter("sources"); setTimeRange(v); }}
            />
          </LoadingWrapper>
        </div>

        {/* Question Status and Golden Dataset Row */}
        <div className="mb-6">
          <LoadingWrapper loading={isGeneralLoading} text="Fetching status overview...">
            <StatusCharts data={dataToShow.statusOverview} />
          </LoadingWrapper>
        </div>

        {/* Performance Row */}
        <div className="mb-6">
          <LoadingWrapper loading={isAnalyticsLoading} text="Fetching analytics data...">
            <QuestionsAnalytics
              date={date}
              setDate={(v) => { setActiveFilter("analytics"); setDate(v); }}
              analyticsType={analyticsType}
              setAnalyticsType={(v) => { setActiveFilter("analytics"); setAnalyticsType(v); }}
              data={dataToShow.analytics}
            />
          </LoadingWrapper>
        </div>

        {/* Analytics Row */}
        <div className="flex flex-col gap-5">
          <LoadingWrapper loading={isGeneralLoading} text="Fetching expert performance...">
            <ExpertsPerformance data={dataToShow.expertPerformance} />
          </LoadingWrapper>
          <div className="space-y-6  hidden md:block">
            <Card className="border border-muted shadow-sm w-full lg:w-auto flex-1">
              <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <CardTitle className="text-xl font-semibold">
                  Heat Map Of Experts
                </CardTitle>

                <div className="min-w-[220px]">
                  <DateRangeFilter
                    advanceFilter={heatMapDate}
                    handleDialogChange={handleHeatMapDateChange}
                  />
                </div>
              </CardHeader>
            </Card>
            <HeatMap heatMapDate={heatMapDate} />
          </div>
        </div>

        {/*Review Levell Data*/}
        <div className="mb-6">
          <ReviewLevelComponent />
        </div>
      </div>
      {user?.role === "admin" && (
        <div className="flex justify-end px-6">
          <button
            onClick={handleSendCronReport}
            className="px-4 py-2 rounded-md bg-green-500 text-white text-sm hover:bg-green-600 shadow-md transition-all relative"
          >
            Send Report
          </button>
        </div>
      )}

    </main>
  );
};

export const ChristmasCap = ({ className = "" }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Shadow for depth */}
      <ellipse
        cx="62"
        cy="92"
        rx="48"
        ry="6"
        fill="currentColor"
        opacity="0.1"
      />

      {/* Hat body - main shape with better curve */}
      <path
        d="M25 85 Q32 55 48 42 Q58 35 70 35 Q85 35 95 45 Q103 52 105 65 L105 85 Z"
        fill="#DC2626"
      />

      {/* Darker shading on hat */}
      <path
        d="M25 85 Q30 60 45 47 Q55 40 65 40 Q75 40 82 47 Q90 54 95 70"
        fill="#B91C1C"
        opacity="0.3"
      />

      {/* Drooping tail/tip with smooth curve */}
      <path d="M48 42 Q38 38 30 45 Q20 54 15 68 Q12 78 18 85" fill="#DC2626" />

      {/* Shadow on tail */}
      <path d="M48 42 Q40 40 32 47 Q24 55 20 68" fill="#B91C1C" opacity="0.4" />

      {/* White fur trim at bottom - base layer */}
      <ellipse
        cx="65"
        cy="85"
        rx="48"
        ry="11"
        fill="currentColor"
        opacity="0.08"
      />
      <ellipse cx="65" cy="85" rx="48" ry="10" fill="#F8F8F8" />

      {/* Fur texture details */}
      <ellipse cx="35" cy="84" rx="8" ry="6" fill="white" opacity="0.6" />
      <ellipse cx="50" cy="85" rx="9" ry="7" fill="white" opacity="0.5" />
      <ellipse cx="65" cy="84" rx="10" ry="7" fill="white" opacity="0.7" />
      <ellipse cx="80" cy="85" rx="8" ry="6" fill="white" opacity="0.6" />
      <ellipse cx="95" cy="84" rx="7" ry="5" fill="white" opacity="0.5" />

      {/* Pompom at the end - outer fluffy layer */}
      <circle cx="18" cy="82" r="13" fill="#F0F0F0" />
      <circle cx="18" cy="82" r="11" fill="white" />

      {/* Pompom texture */}
      <circle cx="15" cy="79" r="3" fill="#F8F8F8" opacity="0.8" />
      <circle cx="21" cy="80" r="2.5" fill="#F8F8F8" opacity="0.7" />
      <circle cx="18" cy="85" r="3" fill="#F8F8F8" opacity="0.6" />
      <circle cx="14" cy="83" r="2" fill="#FAFAFA" opacity="0.9" />

      {/* Highlight on hat for shine */}
      <path
        d="M55 48 Q68 42 82 46"
        stroke="#EF4444"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M58 52 Q68 48 76 50"
        stroke="#FCA5A5"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.3"
      />

      {/* Edge definition */}
      <path
        d="M25 85 Q32 55 48 42 Q58 35 70 35 Q85 35 95 45 Q103 52 105 65 L105 85"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.15"
        fill="none"
      />
    </svg>
  );
};

export const HolidayBanner = () => {
  return (
    <div className="w-full bg-gradient-to-r from-christmas-pine via-christmas-green to-christmas-pine py-2 px-4">
      <div className="flex items-center justify-center gap-3">
        <span className="text-christmas-gold shimmer-gold">✦</span>
        <p className="text-sm font-medium text-primary-foreground tracking-wide">
          Season's Greetings from the Moderation Team
        </p>
        <span className="text-christmas-gold shimmer-gold">✦</span>
      </div>
    </div>
  );
};

interface Snowflake {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
}
export const Snowfall = () => {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);

  useEffect(() => {
    const flakes: Snowflake[] = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 10 + Math.random() * 15,
      size: 0.6 + Math.random() * 0.8,
    }));
    setSnowflakes(flakes);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {snowflakes.map((flake) => (
        <span
          key={flake.id}
          className="snowflake"
          style={{
            left: `${flake.left}%`,
            animationDelay: `${flake.delay}s`,
            animationDuration: `${flake.duration}s`,
            fontSize: `${flake.size}rem`,
          }}
        >
          ❄
        </span>
      ))}
    </div>
  );
};
