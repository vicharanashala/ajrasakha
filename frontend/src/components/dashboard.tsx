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
import {ReviewLevelComponent} from './ReviewLevelComponent'

//     { name: "Experts", value: 32 },
//     { name: "Moderators", value: 8 },
//   ],
//   moderatorApprovalRate: {
//     approved: 125,
//     pending: 75,
//     approvalRate: 62.5,
//   },
//   goldenDataset: {
//     type: "year",

//     yearData: [
//       { month: "Jan", entries: 450, verified: 300 },
//       { month: "Feb", entries: 420, verified: 310 },
//       { month: "Mar", entries: 510, verified: 350 },
//       { month: "Apr", entries: 480, verified: 390 },
//       { month: "May", entries: 600, verified: 450 },
//       { month: "Jun", entries: 550, verified: 400 },
//       { month: "Jul", entries: 620, verified: 500 },
//       { month: "Aug", entries: 590, verified: 450 },
//       { month: "Sep", entries: 630, verified: 510 },
//       { month: "Oct", entries: 700, verified: 560 },
//       { month: "Nov", entries: 680, verified: 530 },
//       { month: "Dec", entries: 720, verified: 600 },
//     ],

//     weeksData: [
//       { week: "Week 1", entries: 120, verified: 90 },
//       { week: "Week 2", entries: 100, verified: 80 },
//       { week: "Week 3", entries: 130, verified: 100 },
//       { week: "Week 4", entries: 100, verified: 70 },
//     ],

//     dailyData: [
//       { day: "Mon", entries: 30, verified: 25 },
//       { day: "Tue", entries: 27, verified: 20 },
//       { day: "Wed", entries: 25, verified: 18 },
//       { day: "Thu", entries: 35, verified: 28 },
//       { day: "Fri", entries: 29, verified: 24 },
//       { day: "Sat", entries: 22, verified: 18 },
//       { day: "Sun", entries: 18, verified: 15 },
//     ],

//     dayHourlyData: {
//       Mon: [
//         { hour: "00:00", entries: 2, verified: 1 },
//         { hour: "01:00", entries: 1, verified: 1 },
//         { hour: "02:00", entries: 1, verified: 1 },
//         { hour: "03:00", entries: 2, verified: 1 },
//         { hour: "04:00", entries: 3, verified: 2 },
//         { hour: "05:00", entries: 2, verified: 2 },
//         { hour: "06:00", entries: 3, verified: 2 },
//         { hour: "07:00", entries: 4, verified: 3 },
//         { hour: "08:00", entries: 4, verified: 3 },
//         { hour: "09:00", entries: 5, verified: 4 }, // your original
//         { hour: "10:00", entries: 5, verified: 4 }, // original
//         { hour: "11:00", entries: 4, verified: 3 },
//         { hour: "12:00", entries: 6, verified: 5 },
//         { hour: "13:00", entries: 8, verified: 6 }, // original
//         { hour: "14:00", entries: 5, verified: 4 },
//         { hour: "15:00", entries: 7, verified: 5 }, // original
//         { hour: "16:00", entries: 6, verified: 4 },
//         { hour: "17:00", entries: 5, verified: 4 },
//         { hour: "18:00", entries: 4, verified: 3 },
//         { hour: "19:00", entries: 3, verified: 2 },
//         { hour: "20:00", entries: 4, verified: 3 },
//         { hour: "21:00", entries: 3, verified: 2 },
//         { hour: "22:00", entries: 2, verified: 1 },
//         { hour: "23:00", entries: 2, verified: 1 },
//       ],
//       Tue: [
//         { hour: "00:00", entries: 0, verified: 0 },
//         { hour: "01:00", entries: 0, verified: 0 },
//         { hour: "02:00", entries: 0, verified: 0 },
//         { hour: "03:00", entries: 0, verified: 0 },
//         { hour: "04:00", entries: 0, verified: 0 },
//         { hour: "05:00", entries: 0, verified: 0 },
//         { hour: "06:00", entries: 0, verified: 0 },
//         { hour: "07:00", entries: 0, verified: 0 },
//         { hour: "08:00", entries: 0, verified: 0 },
//         { hour: "09:00", entries: 5, verified: 4 },
//         { hour: "10:00", entries: 5, verified: 4 },
//         { hour: "11:00", entries: 0, verified: 0 },
//         { hour: "12:00", entries: 0, verified: 0 },
//         { hour: "13:00", entries: 8, verified: 6 },
//         { hour: "14:00", entries: 0, verified: 0 },
//         { hour: "15:00", entries: 7, verified: 5 },
//         { hour: "16:00", entries: 0, verified: 0 },
//         { hour: "17:00", entries: 0, verified: 0 },
//         { hour: "18:00", entries: 0, verified: 0 },
//         { hour: "19:00", entries: 0, verified: 0 },
//         { hour: "20:00", entries: 0, verified: 0 },
//         { hour: "21:00", entries: 0, verified: 0 },
//         { hour: "22:00", entries: 0, verified: 0 },
//         { hour: "23:00", entries: 0, verified: 0 },
//       ],
//       Wed: [
//         { hour: "00:00", entries: 0, verified: 0 },
//         { hour: "01:00", entries: 0, verified: 0 },
//         { hour: "02:00", entries: 0, verified: 0 },
//         { hour: "03:00", entries: 0, verified: 0 },
//         { hour: "04:00", entries: 0, verified: 0 },
//         { hour: "05:00", entries: 0, verified: 0 },
//         { hour: "06:00", entries: 0, verified: 0 },
//         { hour: "07:00", entries: 0, verified: 0 },
//         { hour: "08:00", entries: 0, verified: 0 },
//         { hour: "09:00", entries: 5, verified: 4 },
//         { hour: "10:00", entries: 5, verified: 4 },
//         { hour: "11:00", entries: 0, verified: 0 },
//         { hour: "12:00", entries: 0, verified: 0 },
//         { hour: "13:00", entries: 8, verified: 6 },
//         { hour: "14:00", entries: 0, verified: 0 },
//         { hour: "15:00", entries: 7, verified: 5 },
//         { hour: "16:00", entries: 0, verified: 0 },
//         { hour: "17:00", entries: 0, verified: 0 },
//         { hour: "18:00", entries: 0, verified: 0 },
//         { hour: "19:00", entries: 0, verified: 0 },
//         { hour: "20:00", entries: 0, verified: 0 },
//         { hour: "21:00", entries: 0, verified: 0 },
//         { hour: "22:00", entries: 0, verified: 0 },
//         { hour: "23:00", entries: 0, verified: 0 },
//       ],
//     },
//   },

//   questionContributionTrend: [
//     { date: "2025-12-01", Ajraskha: 8, Moderator: 5 },
//     { date: "2025-12-02", Ajraskha: 10, Moderator: 6 },
//     { date: "2025-12-03", Ajraskha: 13, Moderator: 7 },
//     { date: "2025-12-04", Ajraskha: 15, Moderator: 9 },
//     { date: "2025-12-05", Ajraskha: 12, Moderator: 10 },
//     { date: "2025-12-06", Ajraskha: 14, Moderator: 11 },
//     { date: "2025-12-07", Ajraskha: 16, Moderator: 12 },
//   ],

//   statusOverview: {
//     questions: [
//       { status: "delayed", value: 520 },
//       { status: "in-review", value: 110 },
//       { status: "open", value: 90 },
//     ],
//     answers: [
//       { status: "open", value: 450 },
//       { status: "rejected", value: 180 },
//       { status: "in-review", value: 70 },
//     ],
//   },

//   expertPerformance: [
//     { expert: "Ravi", reputation: 88, incentive: 2500, penalty: 150 },
//     { expert: "Deepak", reputation: 92, incentive: 3000, penalty: 100 },
//     { expert: "Swetha", reputation: 75, incentive: 1800, penalty: 200 },
//     { expert: "Ajay", reputation: 81, incentive: 2200, penalty: 130 },
//     { expert: "Priya", reputation: 95, incentive: 3500, penalty: 80 },
//   ],

//   analytics: {
//     cropData: [
//       { name: "Rice", count: 245 },
//       { name: "Wheat", count: 189 },
//       { name: "Corn", count: 167 },
//       { name: "Cotton", count: 142 },
//       { name: "Others", count: 257 },
//       { name: "Rice", count: 245 },
//     ],
//     stateData: [
//       { name: "Maharashtra", count: 234 },
//       { name: "Punjab", count: 198 },
//       { name: "Uttar Pradesh", count: 187 },
//       { name: "Karnataka", count: 156 },
//       { name: "Rajasthan", count: 145 },
//       { name: "Maharashtra", count: 234 },
//       { name: "Punjab", count: 198 },
//       { name: "Uttar Pradesh", count: 187 },
//       { name: "Karnataka", count: 156 },
//       { name: "Rajasthan", count: 145 },
//       { name: "Maharashtra", count: 234 },
//       { name: "Punjab", count: 198 },
//       { name: "Uttar Pradesh", count: 187 },
//       { name: "Karnataka", count: 156 },
//       { name: "Rajasthan", count: 145 },
//     ],

//     domainData: [
//       { name: "Pest Management", count: 312 },
//       { name: "Soil Health", count: 287 },
//       { name: "Irrigation", count: 256 },
//       { name: "Fertilizers", count: 201 },
//     ],
//   },
// };
export type ViewType = "year" | "month" | "week" | "day";

export const Dashboard = () => {
  /////////////////////////////////////////////////////////////////////////
  const { theme } = useTheme();

  const ANIMATIONS_KEY = "animationsEnabled";

  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true; // SSR safety
    const stored = localStorage.getItem(ANIMATIONS_KEY);
    return stored ? JSON.parse(stored) : true; // default ON
  });

  useEffect(() => {
    localStorage.setItem(ANIMATIONS_KEY, JSON.stringify(animationsEnabled));
  }, [animationsEnabled]);
  ///////////////////////////////////////////////////////////////////////////

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
      {theme == "dark" && animationsEnabled && <Snowfall />}
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
            {theme == "dark" && (
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
            )}

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
          <ReviewLevelComponent/>
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
