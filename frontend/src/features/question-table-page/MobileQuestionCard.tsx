import type {
  IDetailedQuestion,
  QuestionStatus,
  UserRole,
} from "@/types";
import { useMemo } from "react";
import { buildHoldCountdownOptions } from "@/hooks/ui/useCountdown";
import { useQuestionClickability } from "@/hooks/ui/useQuestionClickability";
import { Badge } from "../../components/atoms/badge";
import { Button } from "../../components/atoms/button";
import { TimerDisplay } from "../../components/timer-display";
import { formatDate } from "@/utils/formatDate";
import {
  AlertCircle,
  Edit,
  Eye,
  MoreVertical,
  Trash,
} from "lucide-react";
import { ConfirmationModal } from "../../components/confirmation-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/atoms/dropdown-menu";
import { useQuestionTableStore } from "@/stores/all-questions";

const truncate = (s: string, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

interface QuestionRowProps {
  q: IDetailedQuestion;
  idx: number;
  currentPage: number;
  limit: number;
  uploadedQuestionsCount: number;
  isBulkUpload: boolean;
  totalPages: number;
  userRole: UserRole;
  updatingQuestion: boolean;
  setIsSelectionModeOn?: (val: boolean) => void;
  handleQuestionsSelection?: (questionId: string) => void;
  isSelected?: boolean;
  deletingQuestion: boolean;
  setEditOpen: (val: boolean) => void;
  setSelectedQuestion: (q: any) => void;
  selectedQuestionIds?: string[];
  setQuestionIdToDelete: (id: string) => void;
  handleDelete: (questionId?: string) => Promise<void>;
  setUpdatedData: React.Dispatch<
    React.SetStateAction<IDetailedQuestion | null>
  >;

  updateQuestion: (
    mode: "add" | "edit",
    entityId?: string,
    flagReason?: string,
    status?: QuestionStatus
  ) => Promise<void>;
  onViewMore: (id: string) => void;
  showClosedAt?: boolean;
}

export const MobileQuestionCard: React.FC<QuestionRowProps> = ({
  q,
  idx,
  currentPage,
  limit,
  uploadedQuestionsCount,
  isBulkUpload,
  userRole,
  // updatingQuestion,
  deletingQuestion,
  setEditOpen,
  setSelectedQuestion,
  // setQuestionIdToDelete,
  handleDelete,
  onViewMore,
  showClosedAt,
}) => {
  const visibleColumns = useQuestionTableStore((state) => state.visibleColumns);
  const { timer, isClickable } = useQuestionClickability(
    q.source,
    q.createdAt,
    uploadedQuestionsCount,
    userRole,
    isBulkUpload,
    buildHoldCountdownOptions(q)
  );

  const statusBadge = useMemo(() => {
    // const status = q.status || "NIL";
    const effectiveStatus =
      timer === "00:00:00" && q.status == "open"
        ? "delayed"
        : q.status || "NIL";

    const formatted = effectiveStatus.replace("_", " ");

    const colorClass =
      effectiveStatus === "in-review"
        ? "bg-green-500/10 text-green-600 border-green-500/30"
        : effectiveStatus === "open"
          ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
          : effectiveStatus === "closed"
            ? "bg-gray-500/10 text-gray-600 border-gray-500/30"
            : "bg-muted text-foreground";

    return (
      <Badge variant="outline" className={colorClass}>
        {formatted}
      </Badge>
    );
  }, [q.status, timer]);

  const priorityBadge = useMemo(() => {
    if (!q.priority) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          NIL
        </Badge>
      );
    }

    const colorClass =
      q.priority === "high"
        ? "bg-red-500/10 text-red-600 border-red-500/30"
        : q.priority === "medium"
          ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
          : "bg-green-500/10 text-green-600 border-green-500/30";

    return (
      <Badge variant="outline" className={colorClass}>
        {q.priority.charAt(0).toUpperCase() + q.priority.slice(1)}
      </Badge>
    );
  }, [q.priority]);

  const showCreatedColumn = !showClosedAt && visibleColumns.created;
  const showClosedColumn = !!showClosedAt && visibleColumns.closed;
  const showDetailsSection =
    visibleColumns.priority ||
    visibleColumns.review_level ||
    visibleColumns.state ||
    visibleColumns.crop ||
    visibleColumns.domain ||
    visibleColumns.source ||
    visibleColumns.answers ||
    showCreatedColumn ||
    showClosedColumn;

  return (
    <div className="rounded-lg border p-4 bg-card shadow-sm text-sm leading-snug">
      {(visibleColumns.sl_No || visibleColumns.status) && (
      <div className="flex justify-between items-center mb-1">
          {visibleColumns.sl_No && (
        <p className="text-muted-foreground font-medium">
          #{(currentPage - 1) * limit + idx + 1}
        </p>
          )}
          {visibleColumns.status && (
            <div className={`flex-shrink-0 ${!visibleColumns.sl_No ? "ml-auto" : ""}`}>
              {statusBadge}
            </div>
          )}
        </div>
      )}

      {visibleColumns.question && (
        <>
      <p
        className={`mt-1 font-medium break-words ${isClickable ? "hover:underline cursor-pointer" : "opacity-50"}`}
        onClick={() => isClickable && onViewMore(q._id!)}
      >
        {truncate(q.question, 80)}
      </p>

      {/* Timer */}
      <div className="mt-1 text-xs text-muted-foreground">
        {/* <TimerDisplay timer={timer} status={q.status} /> */}
        <TimerDisplay
          timer={timer}
          status={q.status}
          source={q.source}
        />
      </div>
        </>
      )}

      {showDetailsSection && (
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 text-xs">
        {visibleColumns.priority && (
          <div className="flex gap-1">
            <span className="text-muted-foreground">Priority:</span>
            <span className="flex-shrink-0">{priorityBadge}</span>
          </div>
        )}

          {visibleColumns.review_level && (
        <div className="flex gap-1">
          <span className="text-muted-foreground">Review Level:</span>
          <span className="flex-shrink-0">{q.review_level_number}</span>
        </div>
          )}

          {visibleColumns.state && (
        <div className="truncate">
          <span className="text-muted-foreground">State:</span>
          <span className="ml-1">{truncate(q.details.state, 10)}</span>
        </div>
          )}

          {visibleColumns.crop && (
        <div className="truncate">
          <span className="text-muted-foreground">Crop:</span>
          <span className="ml-1">{truncate(q.details.crop, 10)}</span>
        </div>
          )}

          {visibleColumns.domain && (
            <div className="truncate">
              <span className="text-muted-foreground">Domain:</span>
              <span className="ml-1">{truncate(q.details.domain || "NIL", 12)}</span>
            </div>
          )}

          {visibleColumns.source && (
        <div className="truncate flex items-center gap-1">
          <span className="text-muted-foreground">Source:</span>
          <Badge variant="outline" className="px-1 py-0 text-[10px]">
            {q.source}
          </Badge>
        </div>
          )}

          {visibleColumns.answers && (
        <div>
          <span className="text-muted-foreground">Answers:</span>
          <span className="ml-1">{q.totalAnswersCount}</span>
        </div>
          )}

          {showCreatedColumn && (
        <div className="truncate">
          <span className="text-muted-foreground">Created:</span>
              <span className="ml-1">{formatDate(new Date(q.createdAt!), false)}</span>
          </div>
          )}

          {showClosedColumn && (
            <div className="truncate">
              <span className="text-muted-foreground">Closed:</span>
          <span className="ml-1">
            {q.closedAt ? formatDate(new Date(q.closedAt), false) : "N/C"}
          </span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end mt-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="outline" className="w-8 h-8 p-1">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-40 text-sm">
            <DropdownMenuItem onClick={() => onViewMore(q._id!)}>
              <Eye className="w-4 h-4 mr-2" />
              View
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {userRole === "expert" ? (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setSelectedQuestion(q);
                  setEditOpen(true);
                }}
              >
                <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
                Raise Flag
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setSelectedQuestion(q);
                    setEditOpen(true);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2 text-blue-500" />
                  Edit
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Delete with confirmation */}
                <DropdownMenuItem asChild>
                  <ConfirmationModal
                    title="Delete Question Permanently?"
                    description="Are you sure you want to delete this question?"
                    confirmText="Delete"
                    cancelText="Cancel"
                    isLoading={deletingQuestion}
                    type="delete"
                    onConfirm={() => handleDelete()}
                    trigger={
                      <button className="flex w-full items-center">
                        <Trash className="w-4 h-4 mr-2 text-red-500" />
                        {deletingQuestion ? "Deleting..." : "Delete"}
                      </button>
                    }
                  />
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
