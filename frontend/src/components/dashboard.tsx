import { useEffect, useState } from "react";
import { ApprovalRateCard } from "./dashboard/approval-rate";
import { ExpertsPerformance } from "./dashboard/experts-performance";
import { GoldenDatasetOverview } from "./dashboard/golden-dataset";
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

// const dashboardDummyData: DashboardAnalyticsResponse = {
//   userRoleOverview: [
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

  if (isLoading) return <Spinner />;
  if (!dashboardData) return <p>No data found</p>;
  if (error) return <p>Error loading dashboard</p>;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto p-6">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Moderator Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor content moderation and expert performance
            </p>
          </div>

          <DashboardClock />
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <ModeratorsOverview data={dashboardData.userRoleOverview} />
          <ApprovalRateCard data={dashboardData.moderatorApprovalRate} />
        </div>

        {/* Full Width Sources Chart */}
        <div className="mb-6">
          <GoldenDatasetOverview
            data={dashboardData.goldenDataset}
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
            data={dashboardData.questionContributionTrend}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
          />
        </div>

        {/* Question Status and Golden Dataset Row */}
        <div className="mb-6">
          <StatusCharts data={dashboardData.statusOverview} />
        </div>

        {/* Performance Row */}
        <div className="mb-6">
          <QuestionsAnalytics
            date={date}
            setDate={setDate}
            analyticsType={analyticsType}
            setAnalyticsType={setAnalyticsType}
            data={dashboardData.analytics}
          />
        </div>

        {/* Analytics Row */}
        <div className="flex flex-col gap-5">
          <ExpertsPerformance data={dashboardData.expertPerformance} />
          {/* <div className="space-y-6  hidden md:block">
            <Card className="border border-muted shadow-sm w-full lg:w-auto flex-1">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">
                  Heat Map Of Experts
                </CardTitle>
              </CardHeader>
            </Card>
            <HeatMap />
          </div> */}
        </div>
      </div>
    </main>
  );
};
