import { useState } from "react";
import { Card } from "@/components/atoms/card";
import { Loader2, MessageSquare, CheckCircle } from "lucide-react";
import { ExpertDashboard } from "./ExpertDashboard";
import { useGetPaeValidationAssignedQuestions } from "@/hooks/api/question/useGetPaeValidationAssignedQuestions";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { QuestionDetails } from "./question-details";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import type { PaeValidationQuestionItem } from "@/hooks/services/questionService";

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
    default:
      return "bg-muted text-foreground";
  }
};

const formatDomain = (domain: PaeValidationQuestionItem["domain"]) =>
  Array.isArray(domain) ? domain.join(", ") : domain ?? "";

/** The PAE's second work bucket: questions assigned to them for feedback / validation
 *  (submission.paeValidation with paeId = this PAE). The assigned list is the pending
 *  set — a completed validation is removed from the assignment. */
const PaeValidationSection = ({
  userId,
  onOpen,
}: {
  userId?: string;
  onOpen: (id: string) => void;
}) => {
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useGetPaeValidationAssignedQuestions(VALIDATION_LIMIT, true, userId);

  const questions: PaeValidationQuestionItem[] =
    data?.pages?.flatMap((p) => p?.questions ?? []) ?? [];
  const totalCount = data?.pages?.[0]?.totalCount ?? 0;

  return (
    <Card className="mt-8">
      <div className="flex items-center justify-between gap-3 ml-5 mr-5 mt-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">
            Feedback / Validation
          </h2>
          <Badge className="bg-primary/10 text-primary border-primary/30">
            {totalCount} assigned
          </Badge>
        </div>
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
                <TableCell
                  colSpan={5}
                  className="text-center py-10 text-muted-foreground"
                >
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
                  <TableCell className="align-top text-center">
                    {index + 1}
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
          <Button
            size="sm"
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {isFetchingNextPage ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-1" />
            )}
            Load more
          </Button>
        </div>
      ) : null}
    </Card>
  );
};

export const PaeDashboard = ({ userId, goBack }: PaeDashboardProps = {}) => {
  const { data: currentUser } = useGetCurrentUser({});
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const {
    data: selectedQuestionDetails,
    refetch: refetchSelectedQuestion,
    isLoading: isLoadingSelectedQuestion,
  } = useGetQuestionFullDataById(selectedQuestionId || null);

  // Opening a validation question shows its full details (same view used across the app).
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
    <div>
      {/* Normal bucket + performance sections — reuses the Expert dashboard.
          On the PAE's own dashboard (no userId) the summary cards + Reviewer
          Lifecycle are hidden; a manager viewing a PAE (userId set) still sees them. */}
      <ExpertDashboard
        expertId={userId ?? null}
        goBack={goBack}
        roleLabel="PAE Expert"
        hideOverview={!userId}
      />

      {/* Second bucket — feedback / validation questions assigned to this PAE. */}
      <div className="mx-auto px-6 pb-8">
        <PaeValidationSection userId={userId} onOpen={setSelectedQuestionId} />
      </div>
    </div>
  );
};
