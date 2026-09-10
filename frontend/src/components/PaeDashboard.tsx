import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/atoms/card";
import {
  ListTodo,
  CheckCircle,
  Loader2,
  ClipboardList,
  History,
  MessageSquare,
} from "lucide-react";
import { UserHistoryView } from "@/components/UserHistoryView";
import { useReviewerLifecycle } from "@/hooks/api/user/useReviewerLifecycle";
import { ReviewerLifecycle } from "./ReviewerTimeline";
import { WorkingHoursTrendChart } from "@/features/chatbotDashboard/working-hours-trend";
import { getISOStringsForDateRange } from "@/features/chatbotDashboard/utils/dateUtils";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { usePaeAnswerDashboard } from "@/hooks/api/question/usePaeAnswerDashboard";
import { useGetPaeValidationAssignedQuestions } from "@/hooks/api/question/useGetPaeValidationAssignedQuestions";
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
import { DateRangeFilter } from "./DateRangeFilter";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import type {
  PaeAnswerDashboardQuestion,
  PaeValidationQuestionItem,
} from "@/hooks/services/questionService";

const QUESTIONS_LIMIT = 11;
const VALIDATION_LIMIT = 10;

interface PaeDashboardProps {
  /** When set (manager viewing another PAE), show that PAE's dashboard instead of the logged-in user's. */
  userId?: string;
  userName?: string;
  goBack?: () => void;
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "closed":
    case "dynamic_closed":
    case "duplicate_closed":
      return "bg-gray-500/10 text-gray-600 border-gray-500/30";
    case "pae_submitted":
    case "auditor_review":
      return "bg-indigo-500/10 text-indigo-600 border-indigo-500/30";
    case "in-review":
      return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    case "re-routed":
      return "bg-purple-500/10 text-purple-600 border-purple-500/30";
    case "duplicate":
    case "queue_duplicate":
    case "duplicate_confirmed":
      return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    default:
      return "bg-muted text-foreground";
  }
};

const formatDomain = (domain: PaeValidationQuestionItem["domain"]) =>
  Array.isArray(domain) ? domain.join(", ") : domain ?? "";

/** Second bucket: questions assigned to this PAE for feedback / validation
 *  (submission.paeValidation, paeId = this PAE). The assigned list is the pending set. */
const PaeValidationSection = ({
  userId,
  onOpen,
}: {
  userId?: string;
  onOpen: (id: string) => void;
}) => {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useGetPaeValidationAssignedQuestions(VALIDATION_LIMIT, true, userId);

  const questions: PaeValidationQuestionItem[] =
    data?.pages?.flatMap((p) => p?.questions ?? []) ?? [];
  const totalCount = data?.pages?.[0]?.totalCount ?? 0;

  return (
    <Card className="mt-8">
      <div className="flex items-center gap-2 ml-5 mr-5 mt-4">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Feedback / Validation</h2>
        <Badge className="bg-primary/10 text-primary border-primary/30">
          {totalCount} assigned
        </Badge>
      </div>
      <p className="ml-5 mr-5 mt-1 mb-2 text-xs text-muted-foreground">
        Questions assigned to this PAE for validation (pending review).
      </p>

      <div className="rounded-lg border bg-card overflow-x-auto min-h-[30vh] ml-5 mr-5 mb-4">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-card sticky top-0 z-10">
            <TableRow>
              <TableHead className="text-center w-12">Sl.No</TableHead>
              <TableHead className="text-center w-24">Source</TableHead>
              <TableHead className="text-left">Question Text</TableHead>
              <TableHead className="text-center w-40">Status</TableHead>
              <TableHead className="text-left w-40">Crop / Domain</TableHead>
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
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  No validation questions assigned
                </TableCell>
              </TableRow>
            ) : (
              questions.map((q, index) => (
                <TableRow
                  key={String(q._id ?? index)}
                  onClick={() => q._id && onOpen(String(q._id))}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <TableCell className="align-top text-center">{index + 1}</TableCell>
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
                  <TableCell className="align-top">{q.question}</TableCell>
                  <TableCell className="align-top text-center">
                    <Badge className={`${statusBadgeClass(q.status)} whitespace-nowrap`}>
                      {q.status?.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top text-left text-xs text-muted-foreground">
                    {[q.crop ?? q.details?.crop, formatDomain(q.domain) || q.details?.domain]
                      .filter(Boolean)
                      .join(" · ")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {hasNextPage ? (
        <div className="ml-5 mr-5 mb-4 flex justify-center">
          <Button size="sm" variant="outline" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Load more
          </Button>
        </div>
      ) : null}
    </Card>
  );
};

export const PaeDashboard = ({ userId, userName, goBack }: PaeDashboardProps = {}) => {
  const { data: currentUser } = useGetCurrentUser({});
  // "Viewing other" = a manager opened a specific PAE from User Management.
  const viewingOther = !!userId;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  const { data, isLoading, isFetching } = usePaeAnswerDashboard(page, QUESTIONS_LIMIT, {
    enabled: viewingOther ? true : currentUser?.role === "pae_expert",
    search: debouncedSearch,
    userId,
    startDate,
    endDate,
  });

  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const {
    data: selectedQuestionDetails,
    refetch: refetchSelectedQuestion,
    isLoading: isLoadingSelectedQuestion,
  } = useGetQuestionFullDataById(selectedQuestionId || null);

  const targetUserId = viewingOther ? userId : currentUser?._id;

  // Reviewer lifecycle (manager view only) — default last 1 month.
  const [lifecycleRange, setLifecycleRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    return { from, to };
  });
  // Memoize so the resolved (ms-precise "now") end time doesn't churn the query key.
  const lifecycleIso = useMemo(
    () => getISOStringsForDateRange(lifecycleRange),
    [lifecycleRange],
  );
  const { data: reviewerLifecycleData, isLoading: isReviewerLifecycle } =
    useReviewerLifecycle(
      viewingOther ? targetUserId ?? "" : "",
      lifecycleIso.startTime ?? "",
      lifecycleIso.endTime ?? "",
    );

  const assignedCount = data?.assignedCount ?? 0;
  const submittedCount = data?.submittedCount ?? 0;
  const pendingCount = Math.max(0, assignedCount - submittedCount);
  const feedbackAssigned = data?.feedbackAssigned ?? 0;
  const feedbackPending = data?.feedbackPending ?? 0;
  const feedbackCompleted = data?.feedbackCompleted ?? 0;
  const feedbackCompletedQuestions: PaeAnswerDashboardQuestion[] =
    data?.feedbackCompletedQuestions ?? [];
  const questions: PaeAnswerDashboardQuestion[] = data?.questions ?? [];
  const totalPages = data?.totalPages ?? 1;

  // Opening a question shows its full details (same view used across the app).
  if (selectedQuestionId) {
    return (
      <main className="mx-auto w-full p-4 md:p-6">
        {isLoadingSelectedQuestion || !selectedQuestionDetails?.data || !currentUser ? (
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
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <span className="leading-none">Exit</span>
          </Button>
        </div>
      ) : null}

      <div className="mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            PAE Expert {viewingOther ? "Performance" : "Dashboard"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor {viewingOther ? "PAE expert" : "your"} answering work:{" "}
            {viewingOther
              ? userName ?? ""
              : `${currentUser?.firstName ?? ""} ${currentUser?.lastName ?? ""}`}
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assigned Questions</p>
                  <p className="text-3xl font-bold text-foreground">{assignedCount}</p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Total questions to answer
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
                  <p className="text-xs text-muted-foreground mb-1">Submitted Questions</p>
                  <p className="text-3xl font-bold text-foreground">{submittedCount}</p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Answers submitted by you
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
                  <p className="text-xs text-muted-foreground mb-1">Pending Questions</p>
                  <p className="text-3xl font-bold text-foreground">{pendingCount}</p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Assigned but not yet answered
                  </p>
                </div>
                <ListTodo className="w-8 h-8 opacity-60 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feedback / Validation bucket — shown as its own cards */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Feedback Assigned</p>
                  <p className="text-3xl font-bold text-foreground">{feedbackAssigned}</p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Validation questions assigned
                  </p>
                </div>
                <MessageSquare className="w-8 h-8 opacity-60 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Feedback Completed</p>
                  <p className="text-3xl font-bold text-foreground">{feedbackCompleted}</p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Validations you have finished
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
                  <p className="text-xs text-muted-foreground mb-1">Feedback Pending</p>
                  <p className="text-3xl font-bold text-foreground">{feedbackPending}</p>
                  <p className="text-xs text-green-600 mt-2 font-medium">
                    Assigned but not yet validated
                  </p>
                </div>
                <ListTodo className="w-8 h-8 opacity-60 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Answering-flow questions list */}
        <Card className="mt-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between ml-5 mr-5 mt-4">
            <h1 className="text-1xl font-bold text-foreground mt-0 mb-3">Questions</h1>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <DateRangeFilter
                advanceFilter={{ startTime: dateRange?.from, endTime: dateRange?.to }}
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

          <div className="rounded-lg border bg-card overflow-x-auto min-h-[45vh] ml-5 mr-5">
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
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      No questions found
                    </TableCell>
                  </TableRow>
                ) : (
                  questions.map((q, index) => (
                    <TableRow
                      key={String(q._id ?? index)}
                      onClick={() => q._id && setSelectedQuestionId(String(q._id))}
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
                      <TableCell className="align-top">{q.question}</TableCell>
                      <TableCell className="align-top text-center">
                        <Badge className={`${statusBadgeClass(q.status)} whitespace-nowrap`}>
                          {q.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top text-center">
                        {q.submitted ? (
                          <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground text-xs">Pending</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
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
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </Card>

        {/* Second bucket — feedback / validation questions (pending). */}
        <PaeValidationSection userId={userId} onOpen={setSelectedQuestionId} />

        {/* Completed feedback / validation questions. */}
        <Card className="mt-8">
          <div className="flex items-center gap-2 ml-5 mr-5 mt-4">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-bold text-foreground">Completed Feedback</h2>
            <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
              {feedbackCompleted} completed
            </Badge>
          </div>
          <p className="ml-5 mr-5 mt-1 mb-2 text-xs text-muted-foreground">
            Validation questions this PAE has finished (newest first, up to 50).
          </p>
          <div className="rounded-lg border bg-card overflow-x-auto min-h-[20vh] ml-5 mr-5 mb-4">
            <Table className="min-w-[800px]">
              <TableHeader className="bg-card sticky top-0 z-10">
                <TableRow>
                  <TableHead className="text-center w-12">Sl.No</TableHead>
                  <TableHead className="text-center w-24">Source</TableHead>
                  <TableHead className="text-left">Question Text</TableHead>
                  <TableHead className="text-center w-40">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedbackCompletedQuestions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                      No completed validations yet
                    </TableCell>
                  </TableRow>
                ) : (
                  feedbackCompletedQuestions.map((q, index) => (
                    <TableRow
                      key={String(q._id ?? index)}
                      onClick={() => q._id && setSelectedQuestionId(String(q._id))}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <TableCell className="align-top text-center">{index + 1}</TableCell>
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
                      <TableCell className="align-top">{q.question}</TableCell>
                      <TableCell className="align-top text-center">
                        <Badge className={`${statusBadgeClass(q.status)} whitespace-nowrap`}>
                          {q.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Performance sections — only when a manager is viewing a PAE. */}
        {viewingOther && targetUserId && (
          <div className="mt-8">
            <ReviewerLifecycle
              data={reviewerLifecycleData}
              isLoading={isReviewerLifecycle}
              dateRange={lifecycleRange}
              onDateRangeChange={setLifecycleRange}
            />
          </div>
        )}

        {viewingOther && targetUserId && (
          <div className="mb-6 mt-8 p-6 rounded-xl border border-border bg-card/30 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <History className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">User Activity History</h2>
            </div>
            <UserHistoryView userId={targetUserId} isEmbedded />
          </div>
        )}

        {viewingOther && targetUserId && <WorkingHoursTrendChart userId={targetUserId} />}
      </div>
    </main>
  );
};
