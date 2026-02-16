import type {
  IDetailedQuestion,
  QuestionStatus,
  UserRole,
} from "@/types";
import {
  useMemo,
  useRef,
} from "react";
import { useCountdown } from "@/hooks/ui/useCountdown";
import { Badge } from "../../components/atoms/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../components/atoms/context-menu";
import {
  TableCell,
  TableRow,
} from "../../components/atoms/table";
import { Checkbox } from "../../components/atoms/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/atoms/tooltip";
import { TimerDisplay } from "../../components/timer-display";
import { formatDate } from "@/utils/formatDate";
import {AlertCircle,
  Edit,
  Eye,Square,
  Trash,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmationModal } from "../../components/confirmation-modal";
import { useQuestionTableStore } from "@/stores/all-questions";

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
const truncate = (s: string, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

export const QuestionRow: React.FC<QuestionRowProps> = ({
  q,
  idx,
  currentPage,
  limit,
  userRole,
  updatingQuestion,
  uploadedQuestionsCount,
  isBulkUpload,
  deletingQuestion,
  setEditOpen,
  setSelectedQuestion,
  handleDelete,
  onViewMore,
  setIsSelectionModeOn,
  isSelected,
  handleQuestionsSelection,
  selectedQuestionIds,
  showClosedAt,
}) => {

  //visible columns
  const visibleColumns = useQuestionTableStore(
    (state) => state.visibleColumns
  );
  // To track cont

  const uploadedCountRef = useRef(uploadedQuestionsCount);

  const DURATION_HOURS = 4;
  const timer = useCountdown(q.createdAt, DURATION_HOURS, () => {});

  const totalSeconds = DURATION_HOURS * 60 * 60;

  // Parse timer string ("hh:mm:ss") to seconds
  const [h, m, s] = timer.split(":").map(Number);
  const remainingSeconds = h * 3600 + m * 60 + s;

  //  Calculate delay based on uploaded questions
  // 200 questions → 3 minutes = 180 seconds
  const delayPerQuestion = 180 / 200; // 0.9 seconds per question
  let delaySeconds = uploadedCountRef.current * delayPerQuestion;

  if (userRole === "expert") {
    delaySeconds = 200;
  }

  // For tooltip
  const delayMinutes = delaySeconds / 60;

  //  Check if enough time has passed
  const isClickable =
    remainingSeconds <= totalSeconds - delaySeconds && !isBulkUpload;

  const priorityBadge = useMemo(() => {
    if (!q.priority)
      return (
        <Badge variant="outline" className="text-muted-foreground">
          NIL
        </Badge>
      );

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

  const hasSelectedQuestions =
    selectedQuestionIds && selectedQuestionIds.length > 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow
          key={q._id}
          className={`text-center transition-colors ${
            isSelected ? "bg-primary/10" : "hover:bg-muted/50"
          }`}
          onClick={() => {
            if (!q._id || !hasSelectedQuestions) return;
            handleQuestionsSelection?.(q._id);
          }}
        >
          {/* Serial Number */}
          {
            visibleColumns.sl_No &&
          <TableCell
            className="align-middle text-center p-4"
            title={idx.toString()}
          >
            {hasSelectedQuestions ? (
              <Checkbox
                checked={q._id ? selectedQuestionIds.includes(q._id) : false}
                onCheckedChange={() => {
                  if (!q._id) return;
                  handleQuestionsSelection?.(q._id);
                }}
              />
            ) : (
              (currentPage - 1) * limit + idx + 1
            )}
          </TableCell>
          }
          

          {/* Question Text */}
          {
            visibleColumns.question &&

          <TableCell className="text-start ps-3 " title={q.question}>
            <div className="flex flex-col gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`cursor-pointer ${
                        isClickable
                          ? hasSelectedQuestions
                            ? ""
                            : "hover:underline"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                      onClick={() => {
                        if (!isClickable || hasSelectedQuestions) return;
                        onViewMore(q._id?.toString() || "");
                      }}
                    >
                      {truncate(q.question, 50)}
                    </span>
                  </TooltipTrigger>
                  {!isClickable && (
                    <TooltipContent side="top">
                      <p>
                        The question is currently being processed. Expert
                        allocation is underway and may take{" "}
                        {delayMinutes < 1
                          ? "less than 1 minute"
                          : `up to ${Math.ceil(delayMinutes)} ${
                              Math.ceil(delayMinutes) === 1
                                ? "minute"
                                : "minutes"
                            }`}{" "}
                        to complete.
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              {q.status !== "delayed" && (
                <TimerDisplay timer={timer} status={q.status} />
              )}
            </div>
          </TableCell>
          }

          {/* Priority */}
          {
            visibleColumns.priority &&

          <TableCell className="align-middle text-center">
            {priorityBadge}
          </TableCell>
          }

          {/* Details */}
          {
            visibleColumns.state &&

          <TableCell className="align-middle">
            {" "}
            {truncate(q.details.state, 10)}
          </TableCell>
          }

          {
            visibleColumns.crop &&
          <TableCell className="align-middle">
            {truncate(q.details.crop, 10)}
          </TableCell>
          }
          {
            visibleColumns.domain &&

          <TableCell className="align-middle">
            {truncate(q.details.domain, 12)}
          </TableCell>
          }

          {/* Source */}
          {
            visibleColumns.source &&

          <TableCell className="align-middle">
            <Badge variant="outline">{q.source}</Badge>
          </TableCell>
          }
          {/* Status */}
          {
            visibleColumns.status &&

          <TableCell className="align-middle">{statusBadge}</TableCell>
          }

          {/* Total Answers */}
          {
            visibleColumns.answers &&
          <TableCell className="align-middle">{q.totalAnswersCount}</TableCell>
          }
          {
            visibleColumns.review_level &&
          <TableCell className="align-middle">
            {q.review_level_number?.toString() == "Author"
              ? q.review_level_number
              : `Level ${q.review_level_number}`}
          </TableCell>
          }
          {!showClosedAt && visibleColumns.created ? (
          <TableCell className="align-middle">
            {formatDate(new Date(q.createdAt!), false)}
          </TableCell>
          ) : null}
          {showClosedAt && visibleColumns.closed ? (
            <TableCell className="align-middle">
              {q.closedAt ? formatDate(new Date(q.closedAt!), false) : "N/C"}
            </TableCell>
          ) : null}
        </TableRow>
      </ContextMenuTrigger>

      {/* RIGHT CLICK MENU */}
      <ContextMenuContent className="w-56 p-2">
        {/* Selected Question Number */}
        <div className="mb-2 px-2 py-1 rounded-md border border-transparent shadow-sm text-sm font-semibold ">
          Question #{(currentPage - 1) * limit + idx + 1}
        </div>
        {userRole !== "expert" && !isSelected && (
          <>
            <ContextMenuSeparator />

            <ContextMenuItem
              onSelect={(e) => {
                e.preventDefault();
                if (!q._id) return;

                setIsSelectionModeOn?.(true);
                handleQuestionsSelection?.(q._id);
              }}
            >
              {/* <div className="flex h-4 w-4 items-center justify-center rounded border-2 border-primary/40 bg-primary/5 mr-2.5"> */}
              <Square className="h-2.5 w-2.5 text-primary" />
              {/* </div> */}
              <span className=" ms-2">Select</span>
            </ContextMenuItem>
          </>
        )}
        {/* Actions */}
        <ContextMenuItem onClick={() => onViewMore(q._id?.toString() || "")}>
          <Eye className="w-4 h-4 mr-2 text-primary" />
          View
        </ContextMenuItem>

        <ContextMenuSeparator />

        {userRole === "expert" ? (
          <ContextMenuItem
            onSelect={(e) => {
              // SetTimeout is essential becuase it will resolve the UI Overlay conflicts happening due to edit modal being opened before closing the context menu
              setTimeout(() => {
                e.preventDefault();
                setSelectedQuestion(q);
                setEditOpen(true);
              }, 0);
            }}
          >
            <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
            Raise Flag
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem
              // onSelect={(e) => {
              //   e.preventDefault();
              //   setSelectedQuestion(q);
              //   setEditOpen(true);
              // }}
              onSelect={(e) => {
                // SetTimeout is essential becuase it will resolve the UI Overlay conflicts happening due to edit modal being opened before closing the context menu
                setTimeout(() => {
                  e.preventDefault();
                  setSelectedQuestion(q);
                  setEditOpen(true);
                }, 0);
              }}
            >
              <Edit className="w-4 h-4 mr-2 text-blue-500" />
              {updatingQuestion ? "Editing..." : "Edit"}
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onSelect={(e) => e.preventDefault()}>
              <ConfirmationModal
                title="Delete Question Permanently?"
                description="Are you sure you want to delete this question? This action is irreversible."
                confirmText="Delete"
                cancelText="Cancel"
                isLoading={deletingQuestion}
                type="delete"
                onConfirm={() => {
                  if (!q || !q._id) {
                    toast.error("Question id not founded");
                    return;
                  }
                  handleDelete(q._id!);
                }}
                trigger={
                  <div className="flex items-center gap-2 ">
                    <Trash className="w-4 h-4 text-red-600 mr-2" />
                    {deletingQuestion ? "Deleting..." : "Delete"}
                  </div>
                }
              />
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};