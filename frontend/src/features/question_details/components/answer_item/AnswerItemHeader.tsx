import type { IAnswer, ISubmissionHistory, QuestionStatus, SourceItem, UserRole } from "@/types";
import { Badge } from "@/components/atoms/badge";
import { XCircle, Clock, UserCheck } from "lucide-react";
import { ApproveAnswerDialog } from "./ApproveAnswerDialog";

interface AnswerItemHeaderProps {
  questionId: string;
  answer: IAnswer;
  isMine: boolean;
  isRejected: boolean|undefined;
  submissionData?: ISubmissionHistory;
  questionStatus: QuestionStatus;
  lastAnswerId: string;
  userRole:  UserRole;
  editFinalOpen?: boolean;
  setEditFinalOpen?: (open: boolean) => void;
  editFinalAnswer?: string;
  setEditFinalAnswer?: (value: string) => void;
  editFinalSources?: SourceItem[];
  setEditFinalSources?: (sources: SourceItem[]) => void;
  isUpdatingFinalAnswer?: boolean;
  handleEditFinalAnswer?: () => void;
}

export const AnswerItemHeader = ({
  questionId,
  answer,
  isMine,
  isRejected,
  submissionData,
  questionStatus,
  lastAnswerId,
  userRole,
  editFinalOpen,
  setEditFinalOpen,
  editFinalAnswer,
  setEditFinalAnswer,
  editFinalSources,
  setEditFinalSources,
  isUpdatingFinalAnswer,
  handleEditFinalAnswer,
}: AnswerItemHeaderProps) => {
  const showRejectedBadge =
    (isRejected && !submissionData?.isReroute) ||
    (submissionData?.isReroute &&
      submissionData?.status === "rejected" &&
      lastAnswerId !== answer?._id);

  const showInReviewBadge =
    ((questionStatus === "in-review" || questionStatus === "re-routed") &&
      lastAnswerId === answer?._id) ||
    (!isRejected &&
      !submissionData?.rejectedAnswer &&
      questionStatus !== "in-review" &&
      questionStatus !== "re-routed" &&
      questionStatus !== "closed");

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
      <div className="flex items-center gap-2">
        {answer.isFinalAnswer && (
          <>
            <Badge variant="outline" className="text-green-600 border-green-600">
              Final
            </Badge>
            {userRole !== "expert" &&
              setEditFinalOpen &&
              setEditFinalAnswer &&
              setEditFinalSources &&
              handleEditFinalAnswer && (
                <ApproveAnswerDialog
                  mode="edit"
                  questionId={questionId}
                  editOpen={!!editFinalOpen}
                  setEditOpen={setEditFinalOpen}
                  editableAnswer={editFinalAnswer ?? ""}
                  setEditableAnswer={setEditFinalAnswer}
                  sources={editFinalSources ?? []}
                  setSources={setEditFinalSources}
                  isUpdatingAnswer={!!isUpdatingFinalAnswer}
                  handleUpdateAnswer={handleEditFinalAnswer}
                />
              )}
          </>
        )}

        {showRejectedBadge && (
          <Badge className="bg-rejected text-red-500 dark:text-red-700 border-rejected hover:bg-rejected/90">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        )}

        {showInReviewBadge && (
          <Badge
            className="bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100
              dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 dark:hover:bg-amber-900"
          >
            <Clock className="w-3 h-3 mr-1 opacity-80" />
            In Review
          </Badge>
        )}

        {isMine && <UserCheck className="w-4 h-4 text-blue-600 ml-1" />}
      </div>
       {answer?.approvalCount !== undefined && answer?.approvalCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-green-400 font-medium text-xs whitespace-nowrap border border-primary/20">{answer.approvalCount} Approvals</span>
        )}
    </div>
  );
};
