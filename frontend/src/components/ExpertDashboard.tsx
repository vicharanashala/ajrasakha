import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  ListTodo,
  Award,
  ThumbsDown,
  Loader2,
  Trophy,
  Clock,
  Target,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useGetReviewLevel } from "@/hooks/api/user/useGetReviewLevel";
import { useGetAllExperts } from "@/hooks/api/user/useGetAllUsers";
import { useCheckIn } from "@/hooks/api/performance/useCheckIn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import { DashboardClock } from "./dashboard/dashboard-clock";
import { Button } from "./atoms/button";
import { DateRangeFilter } from "./DateRangeFilter";
// import { ChristmasCap, HolidayBanner, Snowfall } from "./dashboard";
import { useTheme } from "next-themes";
import { Label } from "./atoms/label";
import { Switch } from "./atoms/switch";
import { TopRightBadge } from "./NewBadge";
interface ExpertDashboardProps {
  expertId?: string | null;
  goBack?: () => void;
  rankPosition?: number;
  expertDetailsList?: any;
}
interface DateRange {
  startTime?: Date;
  endTime?: Date;
}

export const ExpertDashboard = ({
  expertId,
  goBack,
  rankPosition,
  expertDetailsList,
}: ExpertDashboardProps) => {
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

  const shouldFetch = !expertDetailsList;
  const [expertDate, setExpertDate] = useState<DateRange>({
    startTime: undefined,
    endTime: undefined,
  });

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const { data: user, isLoading } = useGetCurrentUser({ enabled: shouldFetch });
  let userId: string | undefined;

  if (expertId) {
    userId = expertId.toString();
  } else {
    userId = user?._id?.toString();
  }
  const { data: reviewLevel, isLoading: isLoadingReviewLevel } =
    useGetReviewLevel({
      userId,
      dateRange: {
        startTime: expertDate.startTime,
        endTime: expertDate.endTime,
      },
    });
  const levels = reviewLevel || [];
  const totalPending = levels.reduce((sum, item) => sum + (item.pendingcount ?? 0), 0);
  const totalCompleted = levels.reduce(
    (sum, item) => sum + (item.completedcount??0),
    0
  );
  const totalapproved = levels.reduce(
    (sum, item) => sum + (item.approvedCount??0),
    0
  );
  const totalrejected = levels.reduce(
    (sum, item) => sum + (item.rejectedCount??0),
    0
  );
  const totalmodified = levels.reduce(
    (sum, item) => sum + (item.modifiedCount??0),
    0
  );
  const totalDelayedQuestions = levels.reduce(
    (sum, item) => sum + (item.delayedQuestion??0),
    0
  );
  const [search, setSearch] = useState("");

  const [filter, setFilter] = useState("");

  const [selectedSort, setSelectedSort] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 500;

  const { data: expertDetails, isLoading: isloadingRank } = useGetAllExperts(
    page,
    LIMIT,
    search,
    selectedSort,
    filter,
    { enabled: shouldFetch }
  );
  const [userDetails, setUserDetails] = useState<any[]>([]);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [checkInTimer, setCheckInTimer] = useState<string>("00:00:00");
  const [lateTimer, setLateTimer] = useState<string | null>(null);


  const expertArr = expertDetailsList || expertDetails;
  useEffect(() => {
    if (!expertArr || !expertArr.experts) return; // safety check
    const filteredUsers = expertArr.experts.filter((ele: any) => {
      return ele._id === userId; // optional chaining for user
    });
    setTotalUsers(expertArr.totalExperts);
    setUserDetails(filteredUsers);
  }, [expertArr, user?.email]);


  const lastCheckIn = userDetails?.[0]?.lastCheckInAt
    ? new Date(userDetails[0].lastCheckInAt)
    : null;
    useEffect(() => {
  if (!lastCheckIn) return;

  const interval = setInterval(() => {
    const now = new Date().getTime();
    const diff = now - lastCheckIn.getTime();

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    const format = (n: number) => n.toString().padStart(2, "0");

    setCheckInTimer(
      `${format(hours)}:${format(minutes)}:${format(seconds)}`
    );
  }, 1000);

  return () => clearInterval(interval);
}, [lastCheckIn]);

  const isCheckInDisabled = (lastCheckIn: Date | null) => {
    if (!lastCheckIn) return false;

    const now = new Date();

    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0, 0, 0, 0
    );

    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23, 59, 59, 999
    );

    return lastCheckIn >= startOfToday && lastCheckIn <= endOfToday;
  };
  const isCheckedInToday = isCheckInDisabled(lastCheckIn);
  const isLateCheckIn = (() => {
  if (!lastCheckIn) return false;
  const checkInTime = new Date(lastCheckIn);

  const nineAM = new Date(checkInTime);
  nineAM.setHours(9, 0, 0, 0);

  return checkInTime > nineAM;
})();

useEffect(() => {
  if (isCheckedInToday) {
    setLateTimer(null);
    return;
  }

  const interval = setInterval(() => {
    const now = new Date();
    const nineAM = new Date();
    nineAM.setHours(9, 0, 0, 0);

    if (now > nineAM) {
      const diff = now.getTime() - nineAM.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      const format = (n: number) => n.toString().padStart(2, "0");

      setLateTimer(
        `${hours.toString().padStart(2, "0")}hr ` +
        `${minutes.toString().padStart(2, "0")}min ` +
        `${seconds.toString().padStart(2, "0")}sec`
      );
    } else {
      setLateTimer(null);
    }
  }, 1000);

  return () => clearInterval(interval);
}, [isCheckedInToday]);


  const { checkIn, isPending } = useCheckIn();

  const handleDateChange = (key: string, value?: Date) => {
    setExpertDate((prev) => ({
      ...prev,
      [key]: value,
    }));
  };
 



  return (
    <main
      className={`min-h-screen bg-background ${isLoading ? "opacity-40" : ""}`}
    >
      {/* {theme == "dark" && animationsEnabled && <Snowfall />} */}
      {/* <HolidayBanner /> */}

      {expertId ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="inline-flex items-center justify-center gap-1 whitespace-nowrap p-2"
            onClick={goBack}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
            <span className="leading-none">Exit</span>
          </Button>
        </div>
      ) : null}

      <div className="mx-auto p-6">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Expert {expertId ? "Performance" : "Dashboard"}
            </h1>
            {/* {expertId ? 
            <h1 className="text-3xl font-bold text-foreground">
              Expert {expertId ? "Performance" : "Dashboard"}
            </h1> : 
             <div className="relative inline-block">
               <ChristmasCap className="absolute -top-13 -left-4 w-14 h-14 -rotate-6 z-10" />
               <h1 className="text-3xl font-bold text-foreground pt-2 pl-6">
                 Expert Dashboard
               </h1>
             </div> 
            } */}
            <p className="text-muted-foreground mt-1">
              Monitor {expertId?"expert":"your"} performance: {userDetails?.[0]?.firstName}
            </p>
          </div>

          {/* <DashboardClock /> */}
          <div className="flex flex-col items-center gap-1">
          {/* {user?.role==='expert' && ( */}
           <div className="flex flex-col items-center gap-1">
             
                  <div className="flex flex-col items-center gap-0.5">
                   {isCheckedInToday &&(
                    <span className="text-lg px-1 font-semibold tracking-widest w-full text-right">
                     {checkInTimer}
                    </span>

                      )}

                      <div className="relative group">
                      <TopRightBadge label="New" />

                  <button
                disabled={isCheckedInToday || isPending}
                onClick={() => {
                  if (!isCheckedInToday) checkIn();
                }}
                className={`
                  flex items-center gap-2 px-2 py-2 rounded-xl border
                  transition-all duration-200 
                  ${
                    isCheckedInToday
                      ? "bg-green-50 border-green-200 text-green-600 cursor-not-allowed"
                      : "bg-card border-green-300 text-green-600 hover:bg-green-50 cursor-pointer"
                  }
                  ${isPending ? "opacity-60" : ""}
                `}
              >
                {isCheckedInToday ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <Clock className="w-5 h-5 text-green-500 " />
                )}

                <span className="text-sm font-medium">
                  {isCheckedInToday ? "Checked In" : "Check In"}
                </span>
              </button>
              <div
                  className="
                    absolute top-full mt-2 left-1/2 -translate-x-[70%]
                    hidden group-hover:block
                    w-74 text-xs text-white bg-green-500 rounded-lg px-3 py-2
                    shadow-lg z-50
                  "
                >
                  <p className="font-medium">⏰<b> Check-in Policy </b></p>
                  <p className="mt-1">
                   • Check in before <b>9:00 AM</b>. Late check-ins will be marked <b>absent</b> and no questions will be allocated.

                  </p>
                  <p className="mt-1">
                    • No checkout is required. The system resets automatically at the end of the day.
                  </p>
                </div>
              </div>
              {lateTimer && !isCheckedInToday && (
                <span className="text-xs font-semibold text-red-500 tracking-wide">
                  ⏱ You are <b>{lateTimer}</b> late
                </span>
              )}


              {(isLateCheckIn  && isCheckedInToday) && (
                    <span className="text-xs text-red-500 px-2 font-medium w-full text-right">
                      Late Check-in
                    </span>
                  )}
               
                </div>
            </div>
          {/* )}   */}

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
            {/* <DashboardClock /> */}
          </div>
        </div>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Rank</p>
                  <p className="text-3xl font-bold text-foreground">
                    {userDetails?.[0]?.rankPosition ?? 0}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Leaderboard position among {totalUsers} experts
                  </p>
                </div>
                <Trophy className="w-8 h-8 text-chart-2 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Pending WorkLoad
                  </p>
                  <p className="text-3xl font-bold text-foreground">
                    {totalPending || 0}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Pending Questions To Review
                  </p>
                </div>
                <ListTodo className="w-8 h-8 text-chart-1 opacity-60 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Incentive Points
                  </p>
                  <p className="text-3xl font-bold text-foreground">
                    {userDetails?.[0]?.incentive || user?.incentive || 0}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Total Approved Answers
                  </p>
                </div>
                <Award className="w-8 h-8 text-chart-2 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Penality</p>
                  <p className="text-3xl font-bold text-foreground">
                    {userDetails?.[0]?.penalty || user?.penalty || 0}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Total Rejected Answers
                  </p>
                </div>
                <ThumbsDown className="w-8 h-8 text-chart-3 opacity-60 text-red-400" />
              </div>
            </CardContent>
          </Card>
          {/*To display Delayed uestion count */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Delayed Questions
                  </p>
                  <p className="text-3xl font-bold text-foreground">
                    {totalDelayedQuestions || 0}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Count of Delayed Questions
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-chart-3 opacity-60 text-red-400" />
              </div>
            </CardContent>
          </Card>
          {/*Working hours card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Working Hours
                  </p>
                  <p className="text-3xl font-bold text-foreground">{"N/A"}</p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Total Working Hours Per Week
                  </p>
                </div>
                <Clock className="w-8 h-8 text-chart-3 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>
          {/*QA Target*/}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    QA Target
                  </p>
                  <p className="text-3xl font-bold text-foreground">{"N/A"}</p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Target For 1 month
                  </p>
                </div>
                <Target className="w-8 h-8 text-chart-3 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>
          {/*QA Complete*/}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    QA Completed
                  </p>
                  <p className="text-3xl font-bold text-foreground">{"N/A"}</p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Completed Task
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-chart-3 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>
        {/*summary of review level */}
        <Card className="mt-10">
          <div className="flex justify-between  ml-5 mr-5">
            <h1 className="text-1xl font-bold text-foreground mt-0 mb-3">
              Summary of Pending Tasks by Review Level
            </h1>
            <DateRangeFilter
              advanceFilter={expertDate}
              handleDialogChange={handleDateChange}
            />
          </div>

          <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh] ml-5 mr-5">
            <Table className="min-w-[800px]">
              <TableHeader className="bg-card sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-center w-12">Sl.No</TableHead>
                  <TableHead className="w-[35%] text-center w-52">
                    Review Level
                  </TableHead>
                  <TableHead className="text-center w-52">
                    Pending Tasks({totalPending})
                  </TableHead>
                  <TableHead className="text-center w-52">
                    Approved Answers({totalapproved})
                  </TableHead>
                  <TableHead className="text-center w-52">
                    Rejected Answers({totalrejected})
                  </TableHead>
                  <TableHead className="text-center w-52">
                    Modified Answers({totalmodified})
                  </TableHead>
                  <TableHead className="text-center w-52">
                    Completed Tasks({totalCompleted})
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoadingReviewLevel ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10">
                      <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : !reviewLevel || reviewLevel.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      rowSpan={10}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No Details found
                    </TableCell>
                  </TableRow>
                ) : (
                  reviewLevel.map((level: any, ind: number) => (
                    <TableRow key={ind} className="text-center">
                      <TableCell className="align-middle w-36">
                        {ind + 1}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {level.Review_level}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {level.pendingcount}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {ind === 0 ? "N/A" : level.approvedCount}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {ind === 0 ? "N/A" : level.rejectedCount}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {ind === 0 ? "N/A" : level.modifiedCount}
                      </TableCell>
                      <TableCell className="align-middle w-36">
                        {level.completedcount}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </main>
  );
};
