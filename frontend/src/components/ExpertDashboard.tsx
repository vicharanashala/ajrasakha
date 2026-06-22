import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/atoms/card";
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
  History,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useGetReviewLevel } from "@/hooks/api/user/useGetReviewLevel";
import { useGetAllExperts } from "@/hooks/api/user/useGetAllUsers";
import { useCheckIn } from "@/hooks/api/performance/useCheckIn";
import { useBlockUser } from "@/hooks/api/user/useBlockUser";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs";
import { Input } from "@/components/atoms/input";
import { Pagination } from "@/components/pagination";
import { Button } from "./atoms/button";
import { DateRangeFilter } from "./DateRangeFilter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { Badge } from "./atoms/badge";
import { ConfirmationModal } from "./confirmation-modal";
import { useRemoveExpertAllocations } from "@/hooks/api/Admin/useRemoveExpertAllocations";
import { useGetAllocatedQuestions } from "@/hooks/api/question/useGetAllocatedQuestions";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { QuestionDetails } from "./question-details";
import { useDebounce } from "@/hooks/ui/useDebounce";
import type { IQuestion } from "@/types";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";
import { toast } from "@/shared/components/toast";
interface ExpertDashboardProps {
  expertId?: string | null;
  goBack?: () => void;
  rankPosition?: number;
  expertDetailsList?: any;
  currentUserRole?: string;
  selectedUserRole?: string;
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
  currentUserRole,
  selectedUserRole,
}: ExpertDashboardProps) => {
  localStorage.removeItem("animationsEnabled");

  const navigate = useNavigate();
  const shouldFetch = !expertDetailsList;
  const [expertDate, setExpertDate] = useState<DateRange>({
    startTime: undefined,
    endTime: undefined,
  });

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
  const totalPending = levels.reduce(
    (sum, item) => sum + (item.pendingcount ?? 0),
    0,
  );
  const totalCompleted = levels.reduce(
    (sum, item) => sum + (item.completedcount ?? 0),
    0,
  );
  const totalapproved = levels.reduce(
    (sum, item) => sum + (item.approvedCount ?? 0),
    0,
  );
  const totalrejected = levels.reduce(
    (sum, item) => sum + (item.rejectedCount ?? 0),
    0,
  );
  const totalmodified = levels.reduce(
    (sum, item) => sum + (item.modifiedCount ?? 0),
    0,
  );
  const totalDelayedQuestions = levels.reduce(
    (sum, item) => sum + (item.delayedQuestion ?? 0),
    0,
  );
  const [search, setSearch] = useState("");

  const [filter, setFilter] = useState("");

  const [selectedSort, setSelectedSort] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 500;

  const { data: expertDetails } = useGetAllExperts(
    page,
    LIMIT,
    search,
    selectedSort,
    filter,
    { enabled: shouldFetch },
  );
  const [userDetails, setUserDetails] = useState<any[]>([]);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [questionsPage, setQuestionsPage] = useState(1);
  const questionsLimit = 11;
  const [questionsSearch, setQuestionsSearch] = useState("");
  const debouncedQuestionsSearch = useDebounce(questionsSearch, 200);

  // Opening a question from the Questions tab into the full details view.
  // The logged-in viewer is always fetched here (the dashboard's own `user`
  // query is disabled when expert data is passed in), so QuestionDetails has a
  // currentUser regardless of how the dashboard was mounted.
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("");
  // Controlled so returning from a question's details keeps the user on the tab
  // they came from (e.g. "questions") instead of resetting to "review_level".
  const [activeTab, setActiveTab] = useState("review_level");
  const { data: viewerUser } = useGetCurrentUser();
  const {
    data: selectedQuestionDetails,
    refetch: refetchSelectedQuestion,
    isLoading: isLoadingSelectedQuestion,
  } = useGetQuestionFullDataById(selectedQuestionId || null);

  const formatReviewLevel = (rawLevel: string | number | undefined) => {
    if (rawLevel === undefined || rawLevel === null) return "N/A";
    if (typeof rawLevel === "string") return rawLevel;
    return rawLevel === 0 ? "Author" : `Level ${rawLevel}`;
  };

  const allocatedPreferences = useMemo<AdvanceFilterValues>(
    () => ({
      status: "all",
      source: "all",
      state: "all",
      states: [],
      answersCount: [0, 100],
      dateRange: "all",
      user: userId || "all",
      domain: "all",
      crop: "all",
      crops: [],
      normalised_crop: "all",
      priority: "all",
      review_level: "all",
      startTime: expertDate.startTime,
      endTime: expertDate.endTime,
      hiddenQuestions: false,
      duplicateQuestions: false,
      isOnHold: false,
    }),
    [expertDate.endTime, expertDate.startTime, userId],
  );

  const {
    data: allocatedQuestionPages,
    isLoading: isQuestionsLoading,
    isFetching: isQuestionsFetching,
  } = useGetAllocatedQuestions(
    2000,
    "newest",
    allocatedPreferences,
    "allocated",
    null,
    "all",
    true, // include reroute-pending questions in this management view
  );

  const allAllocatedQuestions = useMemo<
    (IQuestion & { review_level_number?: string | number })[]
  >(() => {
    const flattened = allocatedQuestionPages?.pages?.flat() || [];
    return flattened as (IQuestion & { review_level_number?: string | number })[];
  }, [allocatedQuestionPages]);

  const filteredQuestions = useMemo(() => {
    const needle = debouncedQuestionsSearch.trim().toLowerCase();
    const sorted = [...allAllocatedQuestions].sort((a, b) => {
      const getLevel = (value: string | number | undefined) => {
        if (value === "Author" || value === 0) return 0;
        if (typeof value === "number") return value;
        if (typeof value === "string") {
          const parsed = Number(value.replace("Level", "").trim());
          return Number.isNaN(parsed) ? 999 : parsed;
        }
        return 999;
      };
      return getLevel(a.review_level_number) - getLevel(b.review_level_number);
    });

    if (!needle) return sorted;
    return sorted.filter((q) => (q.text || "").toLowerCase().includes(needle));
  }, [allAllocatedQuestions, debouncedQuestionsSearch]);

  const totalQuestionCount = filteredQuestions.length;
  const paginatedQuestions = useMemo(() => {
    const start = (questionsPage - 1) * questionsLimit;
    const end = start + questionsLimit;
    return filteredQuestions.slice(start, end);
  }, [filteredQuestions, questionsLimit, questionsPage]);
  const totalQuestionPages = Math.ceil(totalQuestionCount / questionsLimit);

  useEffect(() => {
    setQuestionsPage(1);
  }, [debouncedQuestionsSearch, expertDate.endTime, expertDate.startTime, userId]);

  const expertArr = expertDetailsList || expertDetails;
  useEffect(() => {
    if (!expertArr || !expertArr.experts) return; // safety check
    const filteredUsers = expertArr.experts.filter((ele: any) => {
      return ele._id === userId; // optional chaining for user
    });
    setTotalUsers(expertArr.totalExperts);
    setUserDetails(filteredUsers);
  }, [expertArr, user?.email]);

  const { checkIn, isPending: isCheckingIn } = useCheckIn();
  const blockUser = useBlockUser();
  const {
    mutateAsync: removeExpertAllocations,
    isPending: removingAllocations,
  } = useRemoveExpertAllocations();

  // Check-in/checkout state for experts (same as moderator)
  const isExpert = user?.role === "expert";
  const [checkedIn, setCheckedIn] = useState(
    () => isExpert && user?.isBlocked === false,
  );
  const [checkedInAt, setCheckedInAt] = useState<number | null>(() =>
    user?.lastCheckInAt ? new Date(user.lastCheckInAt).getTime() : null,
  );
  const [expertTimer, setExpertTimer] = useState("00:00:00");
  const busy = isCheckingIn || blockUser.isPending;

  // Re-sync with the server when user data changes
  useEffect(() => {
    setCheckedIn(isExpert && user?.isBlocked === false);
    setCheckedInAt(
      user?.lastCheckInAt ? new Date(user.lastCheckInAt).getTime() : null,
    );
  }, [isExpert, user?.isBlocked, user?.lastCheckInAt]);

  // Timer for expert check-in
  useEffect(() => {
    if (!checkedIn || !checkedInAt) {
      setExpertTimer("00:00:00");
      return;
    }
    const tick = () => {
      const diff = Date.now() - checkedInAt;
      const f = (n: number) => Math.max(0, n).toString().padStart(2, "0");
      setExpertTimer(
        `${f(Math.floor(diff / 3600000))}:${f(Math.floor((diff / 60000) % 60))}:${f(
          Math.floor((diff / 1000) % 60),
        )}`,
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [checkedIn, checkedInAt]);

  const handleExpertCheckIn = async () => {
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

  const handleExpertCheckOut = async () => {
    if (!user?._id || busy) return;
    try {
      await blockUser.mutateAsync({ userId: user._id, action: "block" });
      setCheckedIn(false);
    } catch {
      /* errors surfaced via the hooks' toasts */
    }
  };

  const handleDateChange = (key: string, value?: Date) => {
    setExpertDate((prev) => ({
      ...prev,
      [key]: value,
    }));
  };
  console.log("questtions ", paginatedQuestions)

  // When a question is opened from the Questions tab, show its full details
  // (same view used across the app) instead of the dashboard.
  if (selectedQuestionId) {
    return (
      <main className="mx-auto w-full p-4 md:p-6">
        {isLoadingSelectedQuestion || !selectedQuestionDetails?.data || !viewerUser ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="animate-spin w-6 h-6 text-primary" />
          </div>
        ) : (
          <QuestionDetails
            question={selectedQuestionDetails.data}
            currentUserId={selectedQuestionDetails.currentUserId}
            refetchAnswers={refetchSelectedQuestion}
            isRefetching={isLoadingSelectedQuestion}
            goBack={() => setSelectedQuestionId("")}
            navigateToQuestionPage={() => setSelectedQuestionId("")}
            currentUser={viewerUser!}
          />
        )}
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen bg-background ${isLoading ? "opacity-40" : ""}`}
    >
      {expertId ? (
        <div className="flex justify-end gap-2">
          {/* History is available for experts/moderators only — never for admins. */}
          {selectedUserRole !== "admin" && (
            <Button
              size="sm"
              variant="outline"
              className="inline-flex items-center justify-center gap-1 whitespace-nowrap p-2"
              onClick={() =>
                navigate({
                  to: "/history",
                  search: (prev: Record<string, unknown>) => ({
                    ...prev,
                    expertId: expertId.toString(),
                  }),
                })
              }
            >
              <History className="w-4 h-4" />
              <span className="leading-none">View History</span>
            </Button>
          )}
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
            <p className="text-muted-foreground mt-1">
              Monitor {expertId ? "expert" : "your"} performance:{" "}
              {userDetails?.[0]?.firstName}
            </p>
          </div>

          {/* <DashboardClock /> */}
          <div className="flex flex-col items-center gap-1">
            {expertId && currentUserRole === "admin" && (
              <ConfirmationModal
                title="Remove all allocations for this expert?"
                description="This will clear all question queues where this expert is allocated. All experts in those queues will be removed, and this expert's pending workload will be reset to zero."
                confirmText="Remove Allocations"
                cancelText="Cancel"
                type="delete"
                isLoading={removingAllocations}
                onConfirm={async () => {
                  await toast.promise(removeExpertAllocations(expertId),{
                    loading: 'Removing allocations...',
                    success:(resp:any) => `Allocations removed successfully from ${resp?.questionsAffected ?? 0} question(s).`,
                    error:(err:any) =>  err?.message || "Failed to remove allocations. Please try again."
                  });
                }}
                trigger={
                  <div className="relative inline-block">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="border-red-200 cursor-not-allowed text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      Remove Allocations
                    </Button>

                    <Badge
                      variant="default"
                      className="absolute -top-2 -right-2 h-4 text-[9px] px-1.5 py-0 bg-red-500 text-white hover:bg-red-600 border-0 font-medium shadow-sm"
                    >
                      New
                    </Badge>
                  </div>
                }
              />
            )}
            {user?.role === "expert" && (
              <div className="flex flex-col items-center gap-0.5">
                {checkedIn && (
                  <span className="text-lg px-1 font-semibold tracking-widest w-full text-center">
                    {expertTimer}
                  </span>
                )}
                <button
                  disabled={busy}
                  onClick={() => (checkedIn ? handleExpertCheckOut() : handleExpertCheckIn())}
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
            )}
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-10">
          <TabsList>
            <TabsTrigger value="review_level">Review Level</TabsTrigger>
            <TabsTrigger value="questions">Questions</TabsTrigger>
          </TabsList>

          <TabsContent value="review_level">
            <Card>
              <div className="flex justify-between ml-5 mr-5">
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
          </TabsContent>

          <TabsContent value="questions">
            <Card>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between ml-5 mr-5">
                <h1 className="text-1xl font-bold text-foreground mt-0 mb-3">
                  Questions
                </h1>
                <Input
                  value={questionsSearch}
                  onChange={(e) => setQuestionsSearch(e.target.value)}
                  placeholder="Search questions..."
                  className="md:w-80"
                />
              </div>
              <div className="ml-5 mr-5 mb-2 text-sm text-muted-foreground">
                Total Questions: {totalQuestionCount}
              </div>

              <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh] ml-5 mr-5">
                <Table className="min-w-[800px]">
                  <TableHeader className="bg-card sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-center w-12">Sl.No</TableHead>
                      <TableHead className="text-center w-12">Source</TableHead>
                      <TableHead className="text-left">Question Text</TableHead>
                      <TableHead className="text-center w-32">Status</TableHead>
                      <TableHead className="text-center w-52">Review Level</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {isQuestionsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10">
                          <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                        </TableCell>
                      </TableRow>
                    ) : paginatedQuestions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-10 text-muted-foreground"
                        >
                          No questions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedQuestions.map((question, index: number) => (
                        <TableRow
                          key={question.id ?? index}
                          onClick={() =>
                            question.id && setSelectedQuestionId(question.id)
                          }
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <TableCell className="align-top text-center">
                            {(questionsPage - 1) * questionsLimit + index + 1}
                          </TableCell>
                          <TableCell className={` ${question.source === "AJRASAKHA"
                            ? "text-red-500 "
                            : question.source === "WHATSAPP"
                              ? "text-green-500"
                              : question.source === "OUTREACH"
                                ? "text-orange-500"
                                : question.source === "AGRI_EXPERT"
                                  ? "text-gray-500"
                                  : "text-yellow-500"
                            }`}>{question.source}</TableCell>
                          <TableCell className="align-top max-w-[300px]">
                            {question.text.length > 80 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="line-clamp-2 cursor-default">{question.text}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-sm text-sm">
                                    {question.text}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span>{question.text}</span>
                            )}
                          </TableCell>
                          <TableCell className="align-top text-center">
                            {question.status || '—'}
                          </TableCell>
                          <TableCell className="align-top text-center">
                            {formatReviewLevel(question.review_level_number)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {isQuestionsFetching && !isQuestionsLoading ? (
                <div className="ml-5 mr-5 mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="animate-spin w-4 h-4" />
                  Updating results...
                </div>
              ) : null}

              <div className="ml-5 mr-5">
                <Pagination
                  currentPage={questionsPage}
                  totalPages={totalQuestionPages}
                  onPageChange={setQuestionsPage}
                />
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
};
