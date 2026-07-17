import type {
  IAnswer,
  ISubmissionHistory,
  UserRole,
  QuestionStatus,
  IUser,
  SourceItem,
} from "@/types";
import { ApproveAnswerDialog } from "./ApproveAnswerDialog";
import { ReRouteDialog } from "./ReRouteDialog";
import { RejectReRouteDialog } from "./RejectReRouteDialog";
import { ViewMoreDialog } from "./ViewMoreDialog";

interface AnswerActionsProps {
  answer: IAnswer;
  userRole: UserRole;
  questionStatus: QuestionStatus;
  lastAnswerId: string;
  lastReroutedTo: any;
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  editableAnswer: string;
  setEditableAnswer: (value: string) => void;
  sources: SourceItem[];
  setSources: (sources: SourceItem[]) => void;
  isUpdatingAnswer: boolean;
  handleUpdateAnswer: () => void;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  comment: string;
  setComment: (comment: string) => void;
  isUsersLoading: boolean;
  filteredExperts: IUser[];
  selectedExperts: string[];
  handleSelectExpert: (expertId: string) => void;
  isAllocatingExperts?: boolean;
  handleSubmit: () => void;
  handleCancel: () => void;
  isRejectDialogOpen: boolean;
  setIsRejectDialogOpen: (open: boolean) => void;
  rejectionReason: string;
  setRejectionReason: (reason: string) => void;
  handleRejectReRouteAnswer: (reason: string) => void;
  isRejecting?: boolean;
  isRejected: boolean | undefined;
  submissionData?: ISubmissionHistory;
  questionId: string;
  reviews: any[];
  firstTrueIndex?: number;
  firstFalseOrMissingIndex?: number;
  lastAnswerApprovalCount?: number;
  paeReview?: boolean;
  /** When true the question was opened from the moderator's Dedicated tab.
   *  Approve and Re-route actions are only available in this view. */
  isDedicatedView?: boolean;
  /** The moderator currently assigned to this question (shown in the Re-route dialog). */
  assignedModerator?: { name: string; email: string } | null;
  /** Whether the current user is the moderator this question is assigned to. Required
   *  for pae_submitted questions so Approve/Re-route only show for the assigned moderator. */
  isAssignedModerator?: boolean;
}

export const AnswerActions = ({
  answer,
  userRole,
  questionStatus,
  lastAnswerId,
  lastReroutedTo,
  editOpen,
  setEditOpen,
  editableAnswer,
  setEditableAnswer,
  sources,
  setSources,
  isUpdatingAnswer,
  handleUpdateAnswer,
  isModalOpen,
  setIsModalOpen,
  searchTerm,
  setSearchTerm,
  comment,
  setComment,
  isUsersLoading,
  filteredExperts,
  selectedExperts,
  handleSelectExpert,
  isAllocatingExperts,
  handleSubmit,
  handleCancel,
  isRejectDialogOpen,
  setIsRejectDialogOpen,
  rejectionReason,
  setRejectionReason,
  handleRejectReRouteAnswer,
  isRejecting,
  isRejected,
  submissionData,
  questionId,
  reviews,
  firstTrueIndex,
  firstFalseOrMissingIndex,
  lastAnswerApprovalCount,
  paeReview,
  isDedicatedView = false,
  assignedModerator,
  isAssignedModerator = false,
}: AnswerActionsProps) => {
  // Approve and Re-route are restricted to the Dedicated (moderator-assigned) tab.
  // For pae_submitted questions (PAE tab) they are restricted to the assigned moderator
  // only — other moderators viewing the PAE tab don't see Approve/Re-route.
  const canModerate =
    isDedicatedView ||
    userRole === "admin" ||
    (questionStatus === "pae_submitted" && isAssignedModerator);

  const showActions =
    userRole !== "expert" &&
    userRole !== "tester" &&
    canModerate &&
    (questionStatus === "in-review" || questionStatus === "re-routed" || questionStatus === "pae_submitted") &&
    lastAnswerId === answer?._id;
  const showAprroveButton =
    userRole !== "tester" &&
    userRole !== "expert" &&
    canModerate &&
    (((questionStatus === "in-review" || questionStatus === "re-routed") &&
      (lastAnswerApprovalCount ?? 0) >= 3) ||
      questionStatus === "pae_submitted");

  return (
    <div className="flex items-center justify-center gap-2">
      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-background text-foreground font-medium text-xs sm:text-sm whitespace-nowrap border-l-2 border-primary pl-2.5">
        Iteration {answer.answerIteration}
      </span>
      {
        showAprroveButton && (
          <ApproveAnswerDialog
            questionId={questionId}
            editOpen={editOpen}
            setEditOpen={setEditOpen}
            editableAnswer={editableAnswer}
            setEditableAnswer={setEditableAnswer}
            sources={sources}
            setSources={setSources}
            isUpdatingAnswer={isUpdatingAnswer}
            handleUpdateAnswer={handleUpdateAnswer}
            lastReroutedTo={lastReroutedTo}
            approvalCount={answer.approvalCount}
            questionStatus={questionStatus}
            paeReview={paeReview}
          />
        )
      }
      {showActions && (
        <>

          <ReRouteDialog
            isModalOpen={isModalOpen}
            setIsModalOpen={setIsModalOpen}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            comment={comment}
            setComment={setComment}
            isUsersLoading={isUsersLoading}
            filteredExperts={filteredExperts}
            selectedExperts={selectedExperts}
            handleSelectExpert={handleSelectExpert}
            handleSubmit={handleSubmit}
            handleCancel={handleCancel}
            lastReroutedTo={lastReroutedTo}
            isAllocatingExperts={isAllocatingExperts}
            // @ts-ignore
            assignedModerator={assignedModerator}
          />

          {lastReroutedTo?.status === "pending" && (
            <RejectReRouteDialog
              isRejectDialogOpen={isRejectDialogOpen}
              setIsRejectDialogOpen={setIsRejectDialogOpen}
              rejectionReason={rejectionReason}
              setRejectionReason={setRejectionReason}
              handleRejectReRouteAnswer={handleRejectReRouteAnswer}
              isRejecting={isRejecting}
              lastReroutedTo={lastReroutedTo}
            />
          )}
        </>
      )}

      <ViewMoreDialog
        answer={answer}
        submissionData={submissionData}
        // @ts-ignore
        isRejected={isRejected}
        questionStatus={questionStatus}
        lastAnswerId={lastAnswerId}
        reviews={reviews}
        firstTrueIndex={firstTrueIndex}
        firstFalseOrMissingIndex={firstFalseOrMissingIndex}
        userRole={userRole}
      />
    </div>
  );
};
