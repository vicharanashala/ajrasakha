import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/atoms/card";
import { ListTodo, CheckCircle, Loader2, ClipboardList, Clock, History } from "lucide-react";
import { UserHistoryView } from "@/components/UserHistoryView";
import { useReviewerLifecycle } from "@/hooks/api/user/useReviewerLifecycle";
import { ReviewerLifecycle } from "./ReviewerTimeline";
import { WorkingHoursTrendChart } from "@/features/chatbotDashboard/working-hours-trend";
import { getISOStringsForDateRange } from "@/features/chatbotDashboard/utils/dateUtils";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useGetRoleDashboard } from "@/hooks/api/question/useGetRoleDashboard";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { useDebounce } from "@/hooks/ui/useDebounce";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import { Input } from "@/components/atoms/input";
import { Badge } from "./atoms/badge";
import { Pagination } from "@/components/pagination";
import { QuestionDetails } from "./question-details";
import { Button } from "./atoms/button";
import { useCheckIn } from "@/hooks/api/performance/useCheckIn";
import { useBlockUser } from "@/hooks/api/user/useBlockUser";
import type { IUser } from "@/types";
import { DateRangeFilter } from "./DateRangeFilter";
import { format } from "date-fns";
import { UserActivityReportControl } from "./UserActivityReportControl";
import type { DateRange } from "react-day-picker";
import { ScrollToTopButton } from "@/components/atoms/ScrollToTopButton";
import { Tabs, TabsList, TabsTrigger } from "@/components/atoms/tabs";
import { Dashboard } from "./dashboard";
import { GateKeeperAuditorCheckInControl } from "./GateKeeperAuditorCheckInControl";
export { GateKeeperAuditorCheckInControl };

const QUESTIONS_LIMIT = 11;

interface GateKeeperAuditorDashboardProps {
  /** When set (manager viewing another user), show that user's dashboard instead of the logged-in user's. */
  userId?: string;
  role?: "gate_keeper" | "auditor";
  userName?: string;
  goBack?: () => void;
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "closed":
    case "dynamic_closed":
    case "duplicate_closed":
      return "bg-gray-500/10 text-gray-600 border-gray-500/30";
    case "duplicate":
    case "queue_duplicate":
    case "duplicate_confirmed":
      return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    case "dynamic":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
    case "auditor_review":
      return "bg-indigo-500/10 text-indigo-600 border-indigo-500/30";
    default:
      return "bg-muted text-foreground";
  }
};

export const GateKeeperAuditorDashboard = ({
  userId,
  role,
  userName,
  goBack,
}: GateKeeperAuditorDashboardProps = {}) => {
  const { data: currentUser } = useGetCurrentUser({});
  // "Viewing other" mode = a manager opened a specific gate keeper/auditor from User Management.
  const viewingOther = !!userId && !!role;
  const effectiveRole = viewingOther ? role : currentUser?.role;
  const isAuditor = effectiveRole === "auditor";
  const nounTitle = isAuditor ? "Auditor" : "Gate Keeper";

  const [activeView, setActiveView] = useState<"individual" | "overall">("individual");
  const showViewTabs = !viewingOther && effectiveRole === "gate_keeper";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);

  // Date filter state
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [dateFilterType, setDateFilterType] = useState<"assigned" | "completed" | "both">("both");

  // Format dates for API
  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  const { data, isLoading, isFetching } = useGetRoleDashboard(
    page,
    QUESTIONS_LIMIT,
    debouncedSearch,
    {
      enabled: viewingOther
        ? true
        : currentUser?.role === "gate_keeper" ||
          currentUser?.role === "auditor",
      userId,
      role,
      startDate,
      endDate,
      dateFilterType,
    },
  );

  const handleFilterTypeChange = (type: "assigned" | "completed" | "both") => {
    setDateFilterType(type);
    setPage(1);
  };

  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const {
    data: selectedQuestionDetails,
    refetch: refetchSelectedQuestion,
    isLoading: isLoadingSelectedQuestion,
  } = useGetQuestionFullDataById(selectedQuestionId || null);

  // The gate keeper / auditor whose history/lifecycle/hours we show — the viewed user
  // when a manager opened them, otherwise the logged-in user.
  const targetUserId = viewingOther ? userId : currentUser?._id;

  // Reviewer lifecycle + history timeline (default: last 1 month).
  const [lifecycleRange, setLifecycleRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    return { from, to };
  });
  // Memoize on the range only: getISOStringsForDateRange resolves an end time of
  // "now" (ms-precise) whenever the range ends today, so calling it every render
  // would churn the reviewer-lifecycle query key and refetch in a tight loop.
  const lifecycleIso = useMemo(
    () => getISOStringsForDateRange(lifecycleRange),
    [lifecycleRange],
  );
  const { data: reviewerLifecycleData, isLoading: isReviewerLifecycle } =
    useReviewerLifecycle(
      targetUserId ?? "",
      lifecycleIso.startTime ?? "",
      lifecycleIso.endTime ?? "",
    );

  const assignedCount = data?.assignedCount ?? 0;
  const submittedCount = data?.submittedCount ?? 0;
  const pendingCount = Math.max(0, assignedCount - submittedCount);
  const questions = data?.questions ?? [];
  const totalPages = data?.totalPages ?? 1;

  // Opening a question shows its full details (same view used across the app).
  if (selectedQuestionId) {
    return (
      <main className="mx-auto w-full p-4 md:p-6">
        {isLoadingSelectedQuestion ||
        !selectedQuestionDetails?.data ||
        !currentUser ? (
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
            currentUser={currentUser!}
          />
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      {viewingOther && goBack ? (
        <div className="flex justify-end p-4">
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
        {showViewTabs && (
          <div className="mb-6 flex items-center justify-between">
            <Tabs
              value={activeView}
              onValueChange={(v) =>
                setActiveView(v as "individual" | "overall")
              }
            >
              <TabsList className="bg-muted p-1">
                <TabsTrigger
                  value="individual"
                  className="px-4 py-1.5 text-xs sm:text-sm font-medium cursor-pointer"
                >
                  Individual View
                </TabsTrigger>
                <TabsTrigger
                  value="overall"
                  className="px-4 py-1.5 text-xs sm:text-sm font-medium cursor-pointer"
                >
                  Overall View
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {activeView === "overall" && showViewTabs ? (
          <Dashboard hideMainWrapper />
        ) : (
          <>
            <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  {nounTitle} {viewingOther ? "Performance" : "Dashboard"}
                </h1>
                <p className="text-muted-foreground mt-1">
                  Monitor {viewingOther ? `${nounTitle.toLowerCase()}` : "your"}{" "}
                  performance:{" "}
                  {viewingOther
                    ? userName ?? ""
                    : `${currentUser?.firstName ?? ""} ${currentUser?.lastName ?? ""}`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {targetUserId && (currentUser?.role === "admin" || currentUser?.role === "gate_keeper") && (
                  <UserActivityReportControl
                    userId={targetUserId}
                    userName={
                      viewingOther
                        ? userName ?? "User"
                        : `${currentUser?.firstName ?? ""} ${currentUser?.lastName ?? ""}`.trim() || "User"
                    }
                    userRole={role}
                  />
                )}
                <GateKeeperAuditorCheckInControl user={currentUser} />
              </div>
            </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Assigned Questions
                  </p>
                  <p className="text-3xl font-bold text-foreground">
                    {assignedCount}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Total questions assigned to you
                  </p>
                </div>
                <ClipboardList className="w-8 h-8 opacity-60 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Submitted Questions
                  </p>
                  <p className="text-3xl font-bold text-foreground">
                    {submittedCount}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Questions you have finished
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 opacity-60 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Pending Questions
                  </p>
                  <p className="text-3xl font-bold text-foreground">
                    {pendingCount}
                  </p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Assigned but not yet finished
                  </p>
                </div>
                <ListTodo className="w-8 h-8 opacity-60 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Questions list */}
        <Card className="mt-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between ml-5 mr-5 mt-4">
            <h1 className="text-1xl font-bold text-foreground mt-0 mb-3">
              Questions
            </h1>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              {/* Date Range Filter using DateRangeFilter component */}
              <DateRangeFilter
                advanceFilter={{
                  startTime: dateRange?.from,
                  endTime: dateRange?.to,
                }}
                handleDialogChange={(key, value) => {
                  if (key === "startTime" || key === "endTime") {
                    setDateRange((prev) => ({
                      from: key === "startTime" ? value : prev?.from,
                      to: key === "endTime" ? value : prev?.to,
                    }));
                    setPage(1);
                  }
                }}
                hideLabel
              />
              {/* Filter Type Selection */}
              <div className="relative">
                <select
                  value={dateFilterType}
                  onChange={(e) => handleFilterTypeChange(e.target.value as "assigned" | "completed" | "both")}
                  className="h-10 pl-9 pr-8 text-sm border border-input bg-white dark:bg-[#1a1a1a] rounded-md hover:bg-accent/50 transition-colors cursor-pointer appearance-none w-full text-foreground"
                >
                  <option value="both">Both</option>
                  <option value="assigned">Assigned Date</option>
                  <option value="completed">Completed Date</option>
                </select>
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                    <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
                  </svg>
                </div>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>
              </div>
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search questions..."
                className="md:w-80"
              />
            </div>
          </div>
          <div className="ml-5 mr-5 mb-2 text-sm text-muted-foreground">
            Total Questions: {data?.totalCount ?? 0}
          </div>

          <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh] ml-5 mr-5">
            <Table className="min-w-[800px]">
              <TableHeader className="bg-card sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-center w-12">Sl.No</TableHead>
                  <TableHead className="text-center w-24">Source</TableHead>
                  <TableHead className="text-left">Question Text</TableHead>
                  <TableHead className="text-center w-40">Status</TableHead>
                  <TableHead className="text-center w-28">Submitted</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : questions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No questions found
                    </TableCell>
                  </TableRow>
                ) : (
                  questions.map((q, index) => {
                    const finishedAt = isAuditor
                      ? q.auditorFinishedAt
                      : q.gateKeeperFinishedAt;
                    return (
                      <TableRow
                        key={String(q._id ?? index)}
                        onClick={() =>
                          q._id && setSelectedQuestionId(String(q._id))
                        }
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <TableCell className="align-top text-center">
                          {(page - 1) * QUESTIONS_LIMIT + index + 1}
                        </TableCell>
                        <TableCell
                          className={`align-top text-center ${
                            q.source === "AJRASAKHA"
                              ? "text-red-500"
                              : q.source === "WHATSAPP"
                                ? "text-green-500"
                                : "text-gray-500"
                          }`}
                        >
                          {q.source}
                        </TableCell>
                        <TableCell className="align-top">
                          {(q as any).isFeedbackQuestion ? (
                            <span className="mr-1.5 font-semibold text-red-500">
                              (Feed Back)
                            </span>
                          ) : q.source === "AJRASAKHA" ||
                            q.source === "WHATSAPP" ? (
                            <span className="mr-1.5 font-semibold text-red-500">
                              
                            </span>
                          ) : null}
                          {q.question}
                        </TableCell>
                        <TableCell className="align-top text-center">
                          <Badge
                            className={`${statusBadgeClass(q.status)} whitespace-nowrap`}
                          >
                            {q.status?.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top text-center">
                          {finishedAt ? (
                            <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              Pending
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {isFetching && !isLoading ? (
            <div className="ml-5 mr-5 mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="animate-spin w-4 h-4" />
              Updating results...
            </div>
          ) : null}

          <div className="ml-5 mr-5 mb-4">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        </Card>

        {/* Reviewer life cycle + history timeline */}
        {targetUserId && (
          <div className="mt-8">
            <ReviewerLifecycle
              data={reviewerLifecycleData}
              isLoading={isReviewerLifecycle}
              dateRange={lifecycleRange}
              onDateRangeChange={setLifecycleRange}
            />
          </div>
        )}

        {/* User activity history */}
        {targetUserId && (
          <div className="mb-6 mt-8 p-6 rounded-xl border border-border bg-card/30 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <History className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">
                User Activity History
              </h2>
            </div>
            <UserHistoryView userId={targetUserId} isEmbedded />
          </div>
        )}

        {/* Working hours trend */}
        {targetUserId && <WorkingHoursTrendChart userId={targetUserId} />}
          </>
        )}
      </div>
      <ScrollToTopButton />
    </main>
  );
};
