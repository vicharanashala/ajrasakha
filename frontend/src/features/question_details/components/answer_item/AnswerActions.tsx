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
  handleSubmit: () => void;
  handleCancel: () => void;
  isRejectDialogOpen: boolean;
  setIsRejectDialogOpen: (open: boolean) => void;
  rejectionReason: string;
  setRejectionReason: (reason: string) => void;
  handleRejectReRouteAnswer: (reason: string) => void;
  isRejected: boolean|undefined;
  submissionData?: ISubmissionHistory;
  questionId: string;
  reviews: any[];
  firstTrueIndex?: number;
  firstFalseOrMissingIndex?: number;
  currentPage: number;
  setCurrentPage: (page: number | ((prev: number) => number)) => void;
  itemsPerPage: number;
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
  handleSubmit,
  handleCancel,
  isRejectDialogOpen,
  setIsRejectDialogOpen,
  rejectionReason,
  setRejectionReason,
  handleRejectReRouteAnswer,
  isRejected,
  submissionData,
  questionId,
  reviews,
  firstTrueIndex,
  firstFalseOrMissingIndex,
  currentPage,
  setCurrentPage,
  itemsPerPage,
}: AnswerActionsProps) => {
  const showActions =
    userRole !== "expert" &&
    (questionStatus === "in-review" || questionStatus === "re-routed") &&
    lastAnswerId === answer?._id;

  return (
    <div className="flex items-center justify-center gap-2">
      {showActions && (
        <>
          <ApproveAnswerDialog
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
          />

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
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            itemsPerPage={itemsPerPage}
          />

          {lastReroutedTo?.status === "pending" && (
            <RejectReRouteDialog
              isRejectDialogOpen={isRejectDialogOpen}
              setIsRejectDialogOpen={setIsRejectDialogOpen}
              rejectionReason={rejectionReason}
              setRejectionReason={setRejectionReason}
              handleRejectReRouteAnswer={handleRejectReRouteAnswer}
              lastReroutedTo={lastReroutedTo}
            />
          )}
        </>
      )}

      <ViewMoreDialog
        answer={answer}
        submissionData={submissionData}
        isRejected={isRejected}
        questionStatus={questionStatus}
        lastAnswerId={lastAnswerId}
        reviews={reviews}
        firstTrueIndex={firstTrueIndex}
        firstFalseOrMissingIndex={firstFalseOrMissingIndex}
      />
    </div>
  );
};
