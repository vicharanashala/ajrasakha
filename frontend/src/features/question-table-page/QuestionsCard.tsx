import type { IDetailedQuestion, QuestionStatus, UserRole } from "@/types";
import React, { useMemo, useRef, useState } from "react";
import { useCountdown } from "@/hooks/ui/useCountdown";
import { Badge } from "../../components/atoms/badge";
import { TimerDisplay } from "../../components/timer-display";
import { formatDate } from "@/utils/formatDate";
import {
  AlertCircle,
  Calendar,
  CheckSquare,
  Edit,
  Eye,
  MapPin,
  MessageCircle,
  Sprout,
  Trash2,
  User,
} from "lucide-react";
import { ConfirmationModal } from "../../components/confirmation-modal";

const truncate = (s: string, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

interface QuestionsCardProps {
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
  isSelectionModeOn: boolean;
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
    status?: QuestionStatus,
  ) => Promise<void>;
  onViewMore: (id: string) => void;
  showClosedAt?: boolean;
}

const QuestionsCard: React.FC<QuestionsCardProps> = ({
  q,
  idx,
  currentPage,
  limit,
  userRole,
  uploadedQuestionsCount,
  isBulkUpload,
  deletingQuestion,
  setEditOpen,
  setSelectedQuestion,
  handleDelete,
  onViewMore,
  setIsSelectionModeOn,
  isSelectionModeOn,
  isSelected,
  handleQuestionsSelection,
  selectedQuestionIds,
}) => {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const uploadedCountRef = useRef(uploadedQuestionsCount);

  const DURATION_HOURS = 4;
  const timer = useCountdown(q.createdAt, DURATION_HOURS, () => {});
  const totalSeconds = DURATION_HOURS * 3600;

  const [h, m, s] = timer.split(":").map(Number);
  const remainingSeconds = h * 3600 + m * 60 + s;

  const delayPerQuestion = 180 / 200;
  let delaySeconds = uploadedCountRef.current * delayPerQuestion;
  if (userRole === "expert") delaySeconds = 200;

  const isClickable =
    remainingSeconds <= totalSeconds - delaySeconds && !isBulkUpload;

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
    if (!q.priority)
      return (
        <Badge variant="outline" className="text-muted-foreground">
          NIL
        </Badge>
      );

    const colorClass =
      q.priority === "high"
        ? "bg-red-50 text-red-600 border-red-100 ring-1 ring-red-500/10"
        : q.priority === "medium"
          ? "bg-yellow-50 text-yellow-600 border-yellow-100 ring-1 ring-yellow-500/10"
          : "bg-green-50 text-green-600 border-green-100 ring-1 ring-green-500/10";

    return (
      <span
        className={`w-fit px-2 py-0.5 rounded text-xs font-semibold ${colorClass}`}
      >
        {q.priority.charAt(0).toUpperCase() + q.priority.slice(1)}
      </span>
    );
  }, [q.priority]);

  const hasSelectedQuestions =
    selectedQuestionIds && selectedQuestionIds.length > 0;
  // Handle Right Click
  const handleContextMenu = (e: any) => {
    e.preventDefault(); 
    if (!q._id) return;
    if (!isSelectionModeOn) {
      setIsSelectionModeOn?.(true);
      // Automatically select the card that was right-clicked
      if (!isSelected) handleQuestionsSelection?.(q._id);
    }
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      onClick={() => {
        if (isSelectionModeOn || hasSelectedQuestions) {
          handleQuestionsSelection?.(q._id ?? "");
          return;
        }
        if (!isClickable) return;
        onViewMore(q._id?.toString() ?? "");
      }}
      className={`
        group relative w-full bg-white rounded-2xl border transition-all duration-300 ease-in-out cursor-pointer overflow-hidden
        ${
          isSelected
            ? "border-blue-500 ring-2 ring-blue-500/20 shadow-md bg-blue-50/10"
            : "border-gray-200 hover:border-gray-300 hover:shadow-lg"
        }
      `}
    >
      {/* Checkbox Overlay (Visible on Selection Mode) */}
      <div
        className={`
        absolute top-4 left-4 z-20 transition-all duration-200
        ${isSelectionModeOn ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"}
      `}
      >
        <div
          className={`
          w-5 h-5 rounded border flex items-center justify-center transition-colors
          ${isSelected ? "bg-blue-600 border-blue-600" : "bg-white border-gray-300"}
        `}
        >
          {isSelected && <CheckSquare size={14} className="text-white" />}
        </div>
      </div>

      <div
        className={`p-5 space-y-4 ${isSelectionModeOn ? "pl-12" : ""} transition-all duration-300`}
      >
        {/* Header Row ( Line 1 — Serial + Status ) */}
        <div className="flex justify-between items-start">
          <span className="text-sm font-medium text-gray-400 font-mono">
            #{(currentPage - 1) * limit + idx + 1}
          </span>
          {statusBadge}
        </div>

        {/* Title ( Question and timer )*/}
        <div className="flex flex-col h-[5rem] justify-between">
          <h3 className="text-lg font-bold text-gray-900 leading-snug group-hover:text-blue-700 transition-colors line-clamp-2">
            {truncate(q.question, 80)}
          </h3>
          <div className="mt-1 h-5 flex items-center">
            <TimerDisplay timer={timer} status={q.status} />
          </div>
        </div>

        {/* Grid of details */}
        <div className="grid grid-cols-2 gap-y-4 gap-x-2 pt-2 border-t border-gray-100">
          {/* Priority */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Priority
            </span>
            {priorityBadge}
          </div>

          {/* Review Level */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Review Level
            </span>
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <User size={14} className="text-gray-400" />
              {q.review_level_number}
            </div>
          </div>

          {/* State */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              State
            </span>
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <MapPin size={14} className="text-gray-400" />
              <span className="truncate max-w-[150px]" title={q.details.state}>
                {q.details.state}
              </span>
            </div>
          </div>

          {/* Crop */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Crop
            </span>
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Sprout size={14} className="text-green-500" />
              <span className="truncate max-w-[150px]">{q.details.crop}</span>
            </div>
          </div>

          {/* Source */}
          <div className="truncate flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Source
            </span>
            <span className="truncate max-w-[150px] inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
              {q.source}
            </span>
          </div>

          {/* Created Date */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Created
            </span>
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Calendar size={14} className="text-gray-400" />
              {formatDate(new Date(q.createdAt!), false)}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <MessageCircle size={16} />
          <span className="font-medium">{q.totalAnswersCount} Answers</span>
        </div>
        <div className="flex gap-2 animate-in fade-in duration-200">
          {isSelectionModeOn && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewMore(q._id!);
              }}
              className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-blue-600 transition-colors"
              title="View Question"
            >
              <Eye size={18} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedQuestion(q);
              setEditOpen(true);
            }}
            className={`p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:${userRole === "expert" ? "text-red-600" : "text-blue-600"} transition-colors`}
            title={`${userRole === "expert" ? "Raise Flag" : "Edit Card"}`}
          >
            {userRole === "expert" ? (
              <AlertCircle size={18} />
            ) : (
              <Edit size={18} />
            )}
          </button>
          {userRole !== "expert" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteOpen(true)
              }}
              className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              title="Delete Question"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
        <ConfirmationModal
          title="Delete Question Permanently?"
          description="Are you sure you want to delete this question?"
          confirmText="Delete"
          cancelText="Cancel"
          isLoading={deletingQuestion}
          type="delete"
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          onConfirm={() => {
            handleDelete(q._id!);
          }}
        />
      </div>
    </div>
  );
};

export default React.memo(QuestionsCard);
