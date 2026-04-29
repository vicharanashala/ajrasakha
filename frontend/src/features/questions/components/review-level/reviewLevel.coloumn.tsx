import type { Column } from "../baseTable";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { truncate } from "../../helper";
import { renderStatusBadge } from "@/components/renderStatusBadge";
import { renderLevelBadge } from "./RenderLevelBadge";
import { ReallocateModal } from "./ReallocateModal";
import { useState } from "react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import type React from "react";

export type ReviewRow = {
  _id: string;
  question: string;
  status: string;
  levels: (
    | "NA"
    | {
        time: string;
        yet_to_complete: boolean;
      }
  )[];
  sortable?: boolean;
};

interface ModalState {
  open: boolean;
  row: ReviewRow | null;
  levelIndex: number;
  time: string;
  isAuthor: boolean;
}

export function useReviewLevelColumns(
  onViewMore: (id: string) => void,
  visibleColumns: Record<string, boolean>,
  onRefresh?: () => void,
): { columns: Column<ReviewRow>[]; modal: React.ReactNode; onDelayedClick: (row: ReviewRow, index: number, time: string) => void } {
  const { data: currentUser } = useGetCurrentUser({ enabled: true });
  const [modalState, setModalState] = useState<ModalState>({
    open: false,
    row: null,
    levelIndex: 0,
    time: "",
    isAuthor: false,
  });

  const isModeratorOrAdmin =
    currentUser?.role === "moderator" || currentUser?.role === "admin";

  const handleDelayedClick = (row: ReviewRow, index: number, time: string) => {
    if (!isModeratorOrAdmin) return;
    
    // Only allow reallocation for "open" and "delayed" status questions
    if (row.status !== "open" && row.status !== "delayed") {
      return;
    }
    
    // Check if clicking on Author column (index 0)
    const isAuthor = index === 0;
    // Calculate queue index: only count Level columns (1-10), NOT Author (0)
    // Column 1 = Level 1 = queue[0], Column 2 = Level 2 = queue[1], etc.
    // For Level N (column index N), queue index = N - 1
    let queueIndex = 0;
    if (!isAuthor) {
      // For levels, queueIndex = columnIndex - 1 (since column 0 is Author)
      queueIndex = index - 1;
    }
    setModalState({
      open: true,
      row,
      levelIndex: queueIndex,
      time,
      isAuthor,
    });
  };

  const handleCloseModal = () => {
    setModalState((prev) => ({ ...prev, open: false }));
  };

  const handleSuccess = () => {
    onRefresh?.();
  };

  const levelName =
    modalState.levelIndex === 0
      ? "Author"
      : `Level ${modalState.levelIndex}`;

  const columns: Column<ReviewRow>[] = [
    { key: "sl_No", label: "Sl.No", width: "80px", render: (_row, i) => i + 1 },
    {
      key: "question",
      label: "Question",
      width: "28%",
      render: (row) => (
        <div className="text-left">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="block cursor-pointer hover:underline"
                onClick={() => onViewMore(row._id)}
              >
                {truncate(row.question, 50)}
              </span>
            </TooltipTrigger>

            <TooltipContent side="top" className="max-w-sm">
              {row.question}
            </TooltipContent>
          </Tooltip>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: "8%",
      render: (row) => renderStatusBadge(row.status),
    },

    ...Array.from({ length: 10 }).map((_, i) => ({
      key: i === 0 ? "author" : `level_${i}`,
      label: i === 0 ? "Author" : `Level ${i}`,
      sortable: true,
      render: (row: ReviewRow) =>
        renderLevelBadge(row, i, {
          onDelayedClick: isModeratorOrAdmin
            ? handleDelayedClick
            : undefined,
        }),
    })),
  ];

  const modal = (
    <ReallocateModal
      open={modalState.open}
      onOpenChange={handleCloseModal}
      questionId={modalState.row?._id ?? ""}
      questionTitle={modalState.row?.question ?? ""}
      levelIndex={modalState.levelIndex}
      levelName={levelName}
      time={modalState.time}
      isAuthor={modalState.isAuthor}
      onSuccess={handleSuccess}
    />
  );

  return {
    columns: columns.filter((col) => visibleColumns[col.key] !== false),
    modal,
    onDelayedClick: isModeratorOrAdmin ? handleDelayedClick : () => {},
  };
}

// Legacy function for backward compatibility
export const reviewLevelColumns = (
  onViewMore: (id: string) => void,
  visibleColumns: Record<string, boolean>,
): Column<ReviewRow>[] => {
  const baseColumns: Column<ReviewRow>[] = [
    { key: "sl_No", label: "Sl.No", width: "80px", render: (_row, i) => i + 1 },
    {
      key: "question",
      label: "Question",
      width: "28%",
      render: (row) => (
        <div className="text-left">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="block cursor-pointer hover:underline"
                onClick={() => onViewMore(row._id)}
              >
                {truncate(row.question, 50)}
              </span>
            </TooltipTrigger>

            <TooltipContent side="top" className="max-w-sm">
              {row.question}
            </TooltipContent>
          </Tooltip>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: "8%",
      render: (row) => renderStatusBadge(row.status),
    },

    ...Array.from({ length: 10 }).map((_, i) => ({
      key: i === 0 ? "author" : `level_${i}`,
      label: i === 0 ? "Author" : `Level ${i}`,
      sortable: true,
      render: (row: ReviewRow) => renderLevelBadge(row, i),
    })),
  ];
  return baseColumns.filter((col) => visibleColumns[col.key] !== false);
};
