import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/atoms/table";
import { Loader2, } from "lucide-react";

import { Pagination } from "../../components/pagination";

import type {
  IDetailedQuestion,
  QuestionStatus,
  UserRole,
} from "@/types";

import { useCreateRequest } from "@/hooks/api/request/useCreateRequest";
import { toast } from "sonner";
import { useDeleteQuestion } from "@/hooks/api/question/useDeleteQuestion";
import { useUpdateQuestion } from "@/hooks/api/question/useUpdateQuestion";

import { STATES, CROPS, DOMAINS, SEASONS, DISTRICTS } from "../../components/MetaData";
import { QuestionRow } from "./QuestionRow";
import { MobileQuestionCard } from "./MobileQuestionCard";
import { AddOrEditQuestionDialog } from "./AddOrEditQuestionDialog";
import { Checkbox } from '@/components/atoms/checkbox';

type QuestionsTableProps = {
  items?: IDetailedQuestion[] | null;
  onViewMore: (questionId: string) => void;
  currentPage: number;
  setCurrentPage: (val: number) => void;
  isLoading?: boolean;
  isBulkUpload: boolean;
  totalPages: number;
  limit: number;
  uploadedQuestionsCount: number;
  userRole?: UserRole;
  setIsSelectionModeOn: (value: boolean) => void;
  selectedQuestionIds: string[];
  setSelectedQuestionIds: Dispatch<SetStateAction<string[]>>;
  showClosedAt?: boolean;
};

export const QuestionsTable = ({
  items,
  onViewMore,
  limit,
  currentPage,
  setCurrentPage,
  userRole,
  isLoading,
  totalPages,
  uploadedQuestionsCount,
  isBulkUpload,
  setIsSelectionModeOn,
  selectedQuestionIds,
  setSelectedQuestionIds,
  showClosedAt,
}: QuestionsTableProps) => {
  const [editOpen, setEditOpen] = useState(false);
  const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(
    null
  );
  const [questionIdToDelete, setQuestionIdToDelete] = useState("");
  const [selectedQuestion, setSelectedQuestion] =
    useState<IDetailedQuestion | null>(null);

  const { mutateAsync: createRequest, isPending: creatingRequest } =
    useCreateRequest();

  const { mutateAsync: deleteQuestion, isPending: deletingQuestion } =
    useDeleteQuestion();

  const { mutateAsync: updateQuestion, isPending: updatingQuestion } =
    useUpdateQuestion();

  const handleUpdateQuestion = async (
    mode: "add" | "edit",
    entityId?: string,
    flagReason?: string,
    status?: QuestionStatus
    // formData?: FormData
  ) => {
    try {
      if (!entityId) {
        toast.error(`Failed to identify and ${mode} the selected question.`);
        return;
      }

      if (!updatedData) {
        // if just status update is needed then no need updatedData
        console.error("No data available to update.");
        return;
      }

      if (userRole === "expert" && !status) {
        if (!flagReason || flagReason.trim().length < 8) {
          toast.error(
            "Please provide a valid reason for flagging (minimum 8 characters)."
          );
          return;
        }

        await createRequest({
          entityId,
          requestType: "question_flag",
          updatedData,
          reason: flagReason.trim(),
        });

        toast.success(
          "Thank you for your feedback. Your flag request has been submitted successfully."
        );
        setEditOpen(false);
        return;
      }

      if (updatedData) {

        if (!updatedData.question?.trim()) {
          toast.error("Question text is required.");
          return;
        }

        if (updatedData.question?.trim().length < 10) {
          toast.error("Question must be atleast 10 characters long.");
          return;
        }

        if (!updatedData.priority) {
          toast.error("Priority is required.");
          return;
        }
        
        if (!updatedData.details?.state?.trim()) {
          toast.error("State is required.");
          return;
        }

        if (!updatedData.details?.district?.trim()) {
          toast.error("District is required.");
          return;
        }

        if (!updatedData.details?.crop?.trim()) {
          toast.error("Crop is required.");
          return;
        }

        if (!updatedData.details?.season?.trim()) {
          toast.error("Season is required.");
          return;
        }

        if (!updatedData.details?.domain?.trim()) {
          toast.error("Domain is required.");
          return;
        }

        const payload: IDetailedQuestion = status
          ? { ...updatedData, status }
          : updatedData;

        await updateQuestion(payload);
      }
      if (!status) toast.success("Question updated successfully.");
      setEditOpen(false);
    } catch (error: any) {
      console.error("Error in handleUpdateQuestion:", error);
      if (!status)
        // if status is there that means, then updating question to delayed
        toast.error(
          error?.message || "An error occurred while saving. Please try again."
        );
      setEditOpen(false);
    }
  };

  const handleDelete = async (questionId?: string) => {
    const idToDelete = questionId ?? questionIdToDelete;

    if (!idToDelete) {
      console.warn("No question ID provided for deletion");
      return;
    }

    try {
      await deleteQuestion(idToDelete);
    } catch (error) {
      console.error("Error deleting question:", error);
    }
  };

  const handleQuestionsSelection = (questionId: string) => {
    setSelectedQuestionIds((prev) => {
      let next: string[];

      if (prev.includes(questionId)) {
        next = prev.filter((id) => id !== questionId);
      } else {
        next = [...prev, questionId];
      }
      // if (prev.length >= 50) {
      //   toast.warning("You can select only up to 50 questions");
      //   return prev;
      // }
      setIsSelectionModeOn(next.length > 0);

      return next;
    });
  };

  const handleSelectAll = () => {
    if (!items) return;
    const visibleIds = items.map((q) => q._id).filter(Boolean) as string[];
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedQuestionIds.includes(id));

    setSelectedQuestionIds((prev) => {
      let next: string[];
      if (allVisibleSelected) {
        // Deselect all visible items, keep others
        next = prev.filter((id) => !visibleIds.includes(id));
      } else {
        // Select all visible items, keep others
        const newIds = visibleIds.filter((id) => !prev.includes(id));
        next = [...prev, ...newIds];
      }
      setIsSelectionModeOn(next.length > 0);
      return next;
    });
  };

  const allVisibleSelected =
    items &&
    items.length > 0 &&
    items.every((q) => q._id && selectedQuestionIds.includes(q._id));

  const someVisibleSelected =
    items &&
    items.some((q) => q._id && selectedQuestionIds.includes(q._id));


  return (
    <div className="ps-4 md:ps-0">
      <AddOrEditQuestionDialog
        open={editOpen}
        setOpen={setEditOpen}
        setUpdatedData={setUpdatedData}
        updatedData={updatedData}
        onSave={handleUpdateQuestion}
        question={selectedQuestion!}
        userRole={userRole!}
        isLoadingAction={creatingRequest || updatingQuestion}
        mode="edit"
      />

      <div className="rounded-lg border bg-card min-h-[55vh] ">
        <div className="hidden md:block overflow-x-auto">
          <Table className="min-w-[800px]  table-auto">
            <TableHeader className="bg-card sticky top-0 z-10">
              <TableRow>
                <TableHead className="text-center">
                  {selectedQuestionIds.length > 0 ? (
                    <div className="flex justify-center">
                      <Checkbox
                        checked={
                          allVisibleSelected
                            ? true
                            : someVisibleSelected
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all questions"
                      />
                    </div>
                  ) : (
                    "Sl.No"
                  )}
                </TableHead>
                <TableHead className="w-[25%] text-center">Question</TableHead>
                <TableHead className="text-center">Priority</TableHead>
                <TableHead className="text-center">State</TableHead>
                <TableHead className="text-center">Crop</TableHead>
                <TableHead className="text-center">Domain</TableHead>
                <TableHead className="text-center">Source</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Answers</TableHead>
                <TableHead className="text-center">Review Level</TableHead>
                {!showClosedAt ? (
                  <TableHead className="text-center">Created</TableHead>
                ) : null}
                {showClosedAt ? (
                  <TableHead className="text-center">Closed</TableHead>
                ) : null}

                {/* <TableHead className="text-center">Action</TableHead> */}
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10 ">
                    <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : items?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    rowSpan={10}
                    className="text-center py-10 text-muted-foreground"
                  >
                    No questions found
                  </TableCell>
                </TableRow>
              ) : (
                items?.map((q, idx) => (
                  <QuestionRow
                    currentPage={currentPage}
                    deletingQuestion={deletingQuestion}
                    handleDelete={handleDelete}
                    idx={idx}
                    onViewMore={onViewMore}
                    q={q}
                    uploadedQuestionsCount={uploadedQuestionsCount}
                    isBulkUpload={isBulkUpload}
                    limit={limit}
                    setUpdatedData={setUpdatedData}
                    updateQuestion={handleUpdateQuestion}
                    setEditOpen={setEditOpen}
                    setQuestionIdToDelete={setQuestionIdToDelete}
                    setSelectedQuestion={setSelectedQuestion}
                    totalPages={totalPages}
                    updatingQuestion={updatingQuestion}
                    userRole={userRole!}
                    key={q._id}
                    handleQuestionsSelection={handleQuestionsSelection}
                    isSelected={!!q._id && selectedQuestionIds.includes(q._id)}
                    setIsSelectionModeOn={setIsSelectionModeOn}
                    selectedQuestionIds={selectedQuestionIds}
                    showClosedAt={showClosedAt}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-4 p-3">
          {isLoading ? (
            <div className="text-center py-10">
              <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
            </div>
          ) : items?.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground">
              No questions found
            </p>
          ) : (
            items?.map((q, idx) => (
              <MobileQuestionCard
                currentPage={currentPage}
                deletingQuestion={deletingQuestion}
                handleDelete={handleDelete}
                idx={idx}
                onViewMore={onViewMore}
                q={q}
                uploadedQuestionsCount={uploadedQuestionsCount}
                isBulkUpload={isBulkUpload}
                limit={limit}
                setUpdatedData={setUpdatedData}
                updateQuestion={handleUpdateQuestion}
                setEditOpen={setEditOpen}
                setQuestionIdToDelete={setQuestionIdToDelete}
                setSelectedQuestion={setSelectedQuestion}
                totalPages={totalPages}
                updatingQuestion={updatingQuestion}
                userRole={userRole!}
                key={q._id}
              />
            ))
          )}
        </div>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => setCurrentPage(page)}
      />
    </div>
  );
};








