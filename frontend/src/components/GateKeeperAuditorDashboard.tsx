import { useState } from "react";
import { Card, CardContent } from "@/components/atoms/card";
import { ListTodo, CheckCircle, Loader2, ClipboardList } from "lucide-react";
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

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);

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
    },
  );

  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const {
    data: selectedQuestionDetails,
    refetch: refetchSelectedQuestion,
    isLoading: isLoadingSelectedQuestion,
  } = useGetQuestionFullDataById(selectedQuestionId || null);

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
        <div className="mb-8">
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
                        <TableCell className="align-top">{q.question}</TableCell>
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
      </div>
    </main>
  );
};
