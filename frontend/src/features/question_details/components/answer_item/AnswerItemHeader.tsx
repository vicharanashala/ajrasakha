import type { IAnswer, ISubmissionHistory, QuestionStatus } from "@/types";
import { Badge } from "lucide-react";
import { XCircle, Clock, UserCheck } from "lucide-react";

interface AnswerItemHeaderProps {
  answer: IAnswer;
  isMine: boolean;
  isRejected: boolean;
  submissionData?: ISubmissionHistory;
  questionStatus: QuestionStatus;
  lastAnswerId: string;
}

export const AnswerItemHeader = ({
  answer,
  isMine,
  isRejected,
  submissionData,
  questionStatus,
  lastAnswerId,
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
        <span className="font-medium text-foreground">
          Iteration {answer.answerIteration}
        </span>

        {answer.isFinalAnswer && (
          <Badge variant="outline" className="text-green-600 border-green-600">
            Final
          </Badge>
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
    </div>
  );
};
