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
import { useTheme } from "next-themes";
import { Switch } from "./atoms/switch";
import { Label } from "./atoms/label";
import { ReviewLevelComponent } from "./ReviewLevelComponent";

export type ViewType = "year" | "month" | "week" | "day";

export const Dashboard = () => {
  /////////////////////////////////////////////////////////////////////////
  // const { theme } = useTheme();

  // const ANIMATIONS_KEY = "animationsEnabled";

  // const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => {
  //   if (typeof window === "undefined") return true; // SSR safety
  //   const stored = localStorage.getItem(ANIMATIONS_KEY);
  //   return stored ? JSON.parse(stored) : true; // default ON
  // });

  // useEffect(() => {
  //   localStorage.setItem(ANIMATIONS_KEY, JSON.stringify(animationsEnabled));
  // }, [animationsEnabled]);
  ///////////////////////////////////////////////////////////////////////////

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

  // Fetch dashboard data
  const {
    data: dashboardData,
    isLoading,
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
    if (dashboardData) {
      setDashboardState(dashboardData);
      setInitialLoading(false);
    }
    if (error && !dashboardData) {
      setInitialLoading(false);
    }
  }, [dashboardData, error]);

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
    },
    questionContributionTrend: [],
    statusOverview: { questions: [], answers: [] },
    expertPerformance: [],
    analytics: { cropData: [], stateData: [], domainData: [] },
  };

  const dataToShow = dashboardState ?? emptyDashboard;

  if (initialLoading) return <Spinner text="Fetching dashboard data" />;
  if (error && !dashboardState) return <p>Error loading dashboard</p>;
  if (!dashboardState) return <p>No data found</p>;

  return (
    <main
      className={`min-h-screen bg-background ${isLoading ? "opacity-40" : ""}`}
    >
      {/* {theme == "dark" && animationsEnabled && <Snowfall />} */}
      {/* <HolidayBanner /> */}
      <div className="mx-auto p-6">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Moderator Dashboard
            </h1>
            {/* <div className="relative inline-block">
              <ChristmasCap className="absolute -top-13 -left-4 w-20 h-18 -rotate-6 z-10" />
              <h1 className="text-3xl font-bold text-foreground pt-2 pl-6">
                Moderator Dashboard
              </h1>
            </div> */}
            <p className="text-muted-foreground mt-1">
              Monitor content moderation and expert performance
            </p>
          </div>

          {/* <DashboardClock /> */}
          <div className="flex items-center gap-4">
            {/* ANIMATION SWITCH */}
            {/* {theme == "dark" && (
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="animations-toggle"
                  className="text-sm text-muted-foreground cursor-pointer select-none"
                >
                  {animationsEnabled ? "Animations On" : "Animations Off"}
                </Label>

                <Switch
                  id="animations-toggle"
                  checked={animationsEnabled}
                  onCheckedChange={setAnimationsEnabled}
                  className="scale-100 data-[state=checked]:bg-primary"
                />
              </div>
            )} */}

            {/* CLOCK */}
            <DashboardClock />
          </div>
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <ModeratorsOverview data={dataToShow.userRoleOverview} />
          <ApprovalRateCard data={dataToShow.moderatorApprovalRate} />
        </div>
        {/* Full Width Sources Chart */}
        <div className="mb-6 ">
          <GoldenDatasetOverview
            data={dataToShow.goldenDataset}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            selectedDay={selectedDay}
            selectedMonth={selectedMonth}
            selectedWeek={selectedWeek}
            setSelectedDay={setSelectedDay}
            setSelectedMonth={setSelectedMonth}
            setSelectedWeek={setSelectedWeek}
            setViewType={setViewType}
            viewType={viewType}
          />
        </div>
        <div className="mb-6">
          <SourcesChart
            data={dataToShow.questionContributionTrend}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
          />
        </div>

        {/* Question Status and Golden Dataset Row */}
        <div className="mb-6">
          <StatusCharts data={dataToShow.statusOverview} />
        </div>

        {/* Performance Row */}
        <div className="mb-6">
          <QuestionsAnalytics
            date={date}
            setDate={setDate}
            analyticsType={analyticsType}
            setAnalyticsType={setAnalyticsType}
            data={dataToShow.analytics}
          />
        </div>

        {/* Analytics Row */}
        <div className="flex flex-col gap-5">
          <ExpertsPerformance data={dataToShow.expertPerformance} />
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
// export const ChristmasCap = ({ className = "" }: { className?: string }) => {
//   return (
//     <svg
//       viewBox="0 0 120 100"
//       className={className}
//       fill="none"
//       xmlns="http://www.w3.org/2000/svg"
//     >
//       {/* Hat body - main triangular shape */}
//       <path
//         d="M20 85 Q30 50 50 40 Q70 30 90 35 Q105 40 105 55 L105 85 Z"
//         fill="#DC2626"
//         stroke="#B91C1C"
//         strokeWidth="2"
//       />
//       {/* Drooping tail/tip */}
//       <path
//         d="M50 40 Q35 35 25 45 Q15 55 10 70 Q8 80 15 85"
//         fill="#DC2626"
//         stroke="#B91C1C"
//         strokeWidth="2"
//       />
//       {/* White fur trim at bottom */}
//       <ellipse cx="62" cy="85" rx="50" ry="12" fill="#F5F5F4" />
//       <ellipse cx="62" cy="85" rx="47" ry="9" fill="#FAFAF9" />
//       {/* Pompom at the end of tail */}
//       <circle cx="15" cy="82" r="14" fill="#FAFAF9" />
//       <circle cx="13" cy="80" r="11" fill="white" />
//       {/* Highlight on hat */}
//       <path
//         d="M55 50 Q70 42 85 48"
//         stroke="#EF4444"
//         strokeWidth="4"
//         strokeLinecap="round"
//         opacity="0.5"
//       />
//     </svg>
//   );
// };

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
