import { useEffect, useState } from "react";
import { subDays } from "date-fns";
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
import { QuestionSourceCharts } from "./dashboard/question-source-charts";
import { QuestionsAnswered120Min } from "./dashboard/questions-answered-120min";
import { ResponseAdherence } from "./dashboard/response-adherence";
import { AverageResponseTime } from "./dashboard/average-response-time";
import { PAEMetrics } from "./dashboard/pae-metrics";
import HeatMap from "./HeatMap";
import { Card, CardHeader, CardTitle } from "./atoms/card";
import {
  useGetOverview,
  useGetGoldenDataset,
  useGetContributionTrend,
  useGetStatusOverview,
  useGetExpertPerformance,
  useGetQuestionsAnalytics,
} from "@/hooks/api/performance/useGetDashboard";
import { DashboardClock } from "./dashboard/dashboard-clock";
import { Spinner } from "./atoms/spinner";
import { DateRangeFilter } from "./DateRangeFilter";
import { ReviewLevelComponent } from "./ReviewLevelComponent";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { PerformaneService } from "@/hooks/services/performanceService";
import { TopRightBadge } from "./NewBadge";
import { QuestionsAnsweredAfter120MinProps } from "./dashboard/questions-answered-after-120min";
import { toast } from "@/shared/components/toast";
import { Clock, CheckCircle } from "lucide-react";
import { useCheckIn } from "@/hooks/api/performance/useCheckIn";
import { useBlockUser } from "@/hooks/api/user/useBlockUser";
import type { IUser } from "@/types";

export type ViewType = "year" | "month" | "week" | "day";

/** Moderator check-in / check-out control. Kept as its own component so its
 *  per-second timer re-render stays isolated here and does NOT re-render the
 *  whole Dashboard (which would restart all the card count-up animations).
 *  Reuses the existing check-in + block/unblock endpoints; for a moderator,
 *  isBlocked is the availability flag (checked-in = not blocked). */
const ModeratorCheckInControl = ({ user }: { user?: IUser | null }) => {
  const { checkIn, isPending: isCheckingIn } = useCheckIn();
  const blockUser = useBlockUser();

  const isModerator = user?.role === "moderator";

  // Local, optimistic state seeded from the server. Check-in/checkout updates
  // ONLY this state (no global ["user"] invalidation), so just this control
  // re-renders — the dashboard and its cards are never re-rendered/re-animated.
  const [checkedIn, setCheckedIn] = useState(
    () => isModerator && user?.isBlocked === false,
  );
  const [checkedInAt, setCheckedInAt] = useState<number | null>(() =>
    user?.lastCheckInAt ? new Date(user.lastCheckInAt).getTime() : null,
  );
  const [timer, setTimer] = useState("00:00:00");
  const busy = isCheckingIn || blockUser.isPending;

  // Re-sync with the server only when /me genuinely changes (initial load,
  // window-focus refetch, etc.) — not on our own optimistic toggles.
  useEffect(() => {
    setCheckedIn(isModerator && user?.isBlocked === false);
    setCheckedInAt(
      user?.lastCheckInAt ? new Date(user.lastCheckInAt).getTime() : null,
    );
  }, [isModerator, user?.isBlocked, user?.lastCheckInAt]);

  useEffect(() => {
    if (!checkedIn || !checkedInAt) {
      setTimer("00:00:00");
      return;
    }
    const tick = () => {
      const diff = Date.now() - checkedInAt;
      const f = (n: number) => Math.max(0, n).toString().padStart(2, "0");
      setTimer(
        `${f(Math.floor(diff / 3600000))}:${f(Math.floor((diff / 60000) % 60))}:${f(
          Math.floor((diff / 1000) % 60),
        )}`,
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [checkedIn, checkedInAt]);

  if (!isModerator) return null;

  const handleCheckIn = async () => {
    if (!user?._id || busy) return;
    try {
      await blockUser.mutateAsync({ userId: user._id, action: "unblock" });
      await checkIn();
      setCheckedInAt(Date.now());
      setCheckedIn(true);
    } catch {
      /* errors surfaced via the hooks' toasts */
    }
  };

  const handleCheckOut = async () => {
    if (!user?._id || busy) return;
    try {
      await blockUser.mutateAsync({ userId: user._id, action: "block" });
      setCheckedIn(false);
    } catch {
      /* errors surfaced via the hooks' toasts */
    }
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      {checkedIn && (
        <span className="text-lg px-1 font-semibold tracking-widest w-full text-center">
          {timer}
        </span>
      )}
      <button
        disabled={busy}
        onClick={() => (checkedIn ? handleCheckOut() : handleCheckIn())}
        className={`flex items-center gap-2 px-2 py-2 rounded-xl border transition-all duration-200 cursor-pointer ${
          checkedIn
            ? "bg-card border-red-300 text-red-600 hover:bg-red-50"
            : "bg-card border-green-300 text-green-600 hover:bg-green-50"
        } ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        {checkedIn ? (
          <CheckCircle className="w-4 h-4 text-red-500" />
        ) : (
          <Clock className="w-5 h-5 text-green-500" />
        )}
        <span className="text-sm font-medium">
          {checkedIn ? "Check Out" : "Check In"}
        </span>
      </button>
    </div>
  );
};

export const Dashboard = () => {

  localStorage.removeItem("animationsEnabled");

  // ---- Golden Dataset Overview state filters ----- //
  const [viewType, setViewType] = useState<ViewType>("year");
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear().toString()
  );

  // Helper: derive today's month, week-of-month, and day-of-week
  const getTodayDefaults = () => {
    const today = new Date();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const month = monthNames[today.getMonth()];
    const weekNumber = Math.ceil(today.getDate() / 7);
    const week = `Week ${Math.min(weekNumber, 5)}`;
    const day = dayNames[today.getDay()];
    return { month, week, day };
  };

  const todayDefaults = getTodayDefaults();
  const [selectedMonth, setSelectedMonth] = useState(todayDefaults.month);
  const [selectedWeek, setSelectedWeek] = useState(todayDefaults.week);
  const [selectedDay, setSelectedDay] = useState(todayDefaults.day);

  // When switching tabs, reset selections back to today's defaults
  const handleSetViewType = (v: ViewType) => {
    const defaults = getTodayDefaults();
    setSelectedMonth(defaults.month);
    setSelectedWeek(defaults.week);
    setSelectedDay(defaults.day);
    setViewType(v);
  };
  const [customStartDateTime, setCustomStartDateTime] = useState<string>("");
  const [customEndDateTime, setCustomEndDateTime] = useState<string>("");

  // ---- SourcesChart state filters ----- //
  const [timeRange, setTimeRange] = useState("90d");

  // ---- QuestionsAnalytics state filters ----- //
  const [date, setDate] = useState<DateRange>({
    startTime: subDays(new Date(), 30),
    endTime: new Date(),
  });
  const [analyticsType, setAnalyticsType] = useState<"question" | "answer">(
    "question"
  );
  const [analyticsStatus, setAnalyticsStatus] = useState<string[]>([]);
  const [analyticsState, setAnalyticsState] = useState<string[]>([]);
  const [analyticsSource, setAnalyticsSource] = useState<string[]>([]);
  const [analyticsCrop, setAnalyticsCrop] = useState<string[]>([]);

  // ---- Heat map state filters ----- //
  const [heatMapDate, setHeatMapDate] = useState<DateRange>({
    startTime: undefined,
    endTime: undefined,
  });

  const { data: user } = useGetCurrentUser();

  // Granular Hooks
  const { data: overviewData, isLoading: isOverviewLoading } = useGetOverview();
  const { data: goldenData, isLoading: isGoldenLoading } = useGetGoldenDataset({
    viewType,
    selectedYear,
    selectedMonth,
    selectedWeek,
    selectedDay,
    customStartDateTime,
    customEndDateTime,
  });
  const { data: contributionData, isLoading: isContributionLoading } = useGetContributionTrend(timeRange);
  const { data: statusData, isLoading: isStatusLoading } = useGetStatusOverview();
  const { data: expertData, isLoading: isExpertLoading } = useGetExpertPerformance();
  const { data: analyticsData, isLoading: isAnalyticsLoading, isFetching: isAnalyticsFetching } = useGetQuestionsAnalytics({
    type: analyticsType,
    startTime: date.startTime,
    endTime: date.endTime,
    status: analyticsStatus,
    state: analyticsState,
    source: analyticsSource,
    crop: analyticsCrop,
  });


  const handleHeatMapDateChange = (key: string, value?: Date) => {
    setHeatMapDate((prev) => ({
      ...prev,
      [key]: value,
    }));
  };
  const[sendingReport, setSendingReport] = useState(false);
  const handleSendCronReport = async () => {
    setSendingReport(true);
    try {
      const service = new PerformaneService();
      await toast.promise(service.sendCronSnapshotReport(),{
        loading: "senting cron snapshot report...",
        success: "Cron snapshot report sent successfully",
        error: "Failed to send cron snapshot report"
      }) ;
      
      setSendingReport(false);
    } catch (err) {
      console.error("Failed to fetch cron snapshot", err);
      setSendingReport(false);
    }
  };

  const LoadingWrapper = ({
    loading,
    text,
    children,
  }: {
    loading: boolean;
    text: string;
    children: React.ReactNode;
  }) => (
    <div className={`relative overflow-hidden rounded-xl min-h-[300px] transition-all duration-300 ${loading ? "opacity-50 blur-sm pointer-events-none" : ""}`}>
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-xl">
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
              {user?.role === "admin"
                ? "Admin Dashboard"
                : "Moderator Dashboard"}
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor content moderation and expert performance
            </p>
          </div>

          <div className="flex items-center gap-4">
            <ModeratorCheckInControl user={user} />
            <DashboardClock />
          </div>
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <LoadingWrapper
            loading={isOverviewLoading}
            text="Fetching role overview..."
          >
            <ModeratorsOverview data={overviewData?.userRoleOverview ?? []} />
          </LoadingWrapper>
          <LoadingWrapper
            loading={isOverviewLoading}
            text="Fetching approval stats..."
          >
            <ApprovalRateCard
              data={
                overviewData?.moderatorApprovalRate ?? {
                  approved: 0,
                  pending: 0,
                  approvalRate: 0,
                }
              }
            />
          </LoadingWrapper>
        </div>

        {/* Golden Dataset Row */}
        <div className="mb-6 ">
          <GoldenDatasetOverview
            data={
              goldenData ?? {
                type: viewType,
                yearData: [],
                weeksData: [],
                dailyData: [],
                dayHourlyData: {},
                totalEntriesByType: 0,
                totalVerifiedByType: 0,
                verifiedEntries: 0,
              }
            }
            isLoading={isGoldenLoading}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            selectedDay={selectedDay}
            selectedMonth={selectedMonth}
            selectedWeek={selectedWeek}
            setSelectedDay={setSelectedDay}
            setSelectedMonth={setSelectedMonth}
            setSelectedWeek={setSelectedWeek}
            setViewType={handleSetViewType}
            viewType={viewType}
            customStartDateTime={customStartDateTime}
            setCustomStartDateTime={setCustomStartDateTime}
            customEndDateTime={customEndDateTime}
            setCustomEndDateTime={setCustomEndDateTime}
          />
        </div>

        {/* Question Source Charts Row */}
        {goldenData?.questionSourceBreakdown && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <QuestionSourceCharts
              whatsappCount={goldenData.questionSourceBreakdown.whatsapp}
              ajrasakhaCount={goldenData.questionSourceBreakdown.ajrasakha}
            />
            <div className="flex flex-col gap-3">
            {goldenData?.questionsAnsweredWithin120Min && (
              <QuestionsAnswered120Min
                whatsappCount={goldenData.questionsAnsweredWithin120Min.whatsapp}
                ajrasakhaCount={goldenData.questionsAnsweredWithin120Min.ajrasakha}
              />
            )}
             <QuestionsAnsweredAfter120MinProps
                whatsappCount={goldenData?.questionsAnsweredAfter120Min?.whatsapp??0}
                ajrasakhaCount={goldenData?.questionsAnsweredAfter120Min?.ajrasakha??0}
                questionsStateBreakdown={goldenData?.questionStateBreakdown}
              />
            </div>
          </div>
        )}

        {/* Response Adherence Row */}
        {goldenData?.questionSourceBreakdown && goldenData?.questionsAnsweredWithin120Min && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponseAdherence
              totalWhatsapp={goldenData.questionSourceBreakdown.whatsapp}
              totalAjrasakha={goldenData.questionSourceBreakdown.ajrasakha}
              answeredWithin120WhatsApp={goldenData.questionsAnsweredWithin120Min.whatsapp}
              answeredWithin120Ajrasakha={goldenData.questionsAnsweredWithin120Min.ajrasakha}
            />
            {goldenData?.averageResponseTime && (
              <AverageResponseTime
                whatsappAvgTime={goldenData.averageResponseTime.whatsapp}
                ajrasakhaAvgTime={goldenData.averageResponseTime.ajrasakha}
              />
            )}
          </div>
        )}

        {/* PAE Metrics Row */}
        {goldenData?.paeMetrics && (
          <div className="mb-6">
            <PAEMetrics
              assigned={goldenData.paeMetrics.assigned}
              submitted={goldenData.paeMetrics.submitted}
              closed={goldenData.paeMetrics.closed}
            />
          </div>
        )}

        {/* Sources Chart Row */}
        <div className="mb-6">
          <LoadingWrapper
            loading={isContributionLoading}
            text="Fetching sources chart..."
          >
            <SourcesChart
              data={contributionData ?? []}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
            />
          </LoadingWrapper>
        </div>

        {/* Question Status Row */}
        <div className="mb-6">
          <LoadingWrapper
            loading={isStatusLoading}
            text="Fetching status overview..."
          >
            <StatusCharts
              data={statusData ?? { questions: [], answers: [] }}
            />
          </LoadingWrapper>
        </div>

        {/* Analytics Row */}
        <div className="mb-6">
          <LoadingWrapper
            loading={isAnalyticsLoading || isAnalyticsFetching}
            text="Fetching analytics data..."
          >
            <QuestionsAnalytics
              date={date}
              setDate={setDate}
              analyticsType={analyticsType}
              setAnalyticsType={setAnalyticsType}
              analyticsStatus={analyticsStatus}
              setAnalyticsStatus={setAnalyticsStatus}
              analyticsState={analyticsState}
              setAnalyticsState={setAnalyticsState}
              analyticsSource={analyticsSource}
              setAnalyticsSource={setAnalyticsSource}
              analyticsCrop={analyticsCrop}
              setAnalyticsCrop={setAnalyticsCrop}
              data={
                analyticsData ?? { cropData: [], stateData: [], domainData: [], tableData: [] }
              }
            />
          </LoadingWrapper>
        </div>

        {/* Performance Row */}
        <div className="flex flex-col gap-5">
          <LoadingWrapper
            loading={isExpertLoading}
            text="Fetching expert performance..."
          >
            <ExpertsPerformance data={expertData ?? []} />
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
            disabled={sendingReport}
          >
            {sendingReport ? "Sending Report..." : "Send Report"}
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