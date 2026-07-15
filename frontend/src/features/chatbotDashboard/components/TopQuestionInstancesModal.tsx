import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, RefreshCw } from "lucide-react";
import { Badge } from "@/components/atoms/badge";
import {
  QuestionListTable,
  type QuestionListColumn,
} from "./QuestionListTable";
import { TranslatableText } from "./TranslatableText";
import { FarmerNameLink } from "./FarmerNameLink";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";
import { useQueryClient } from "@tanstack/react-query";
import { useTopQuestionInstances } from "../hooks/useActiveUsersAnalytics";

// ── Copyable ID helper (same pattern as QueryCategoryQuestionsModal) ──────────

const CopyableIdCell = ({ id }: { id?: string }) => {
  const [copied, setCopied] = useState(false);
  if (!id) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group flex items-center gap-1.5">
      <span className="font-mono" title={id}>
        ...{id.slice(-6)}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-900 dark:hover:text-gray-100"
        title="Copy full ID"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3 text-gray-400" />
        )}
      </button>
    </div>
  );
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface TopQuestionInstancesModalProps {
  questionId: string;
  questionText: string;
  source?: string;
  userType?: string;
  startDate?: Date;
  endDate?: Date;
  onClose: () => void;
}

const PAGE_SIZE = 10;

// ── Component ─────────────────────────────────────────────────────────────────

export function TopQuestionInstancesModal({
  questionId,
  questionText,
  source,
  userType = "all",
  startDate,
  endDate,
  onClose,
}: TopQuestionInstancesModalProps) {
  const { setSelectedQuestionId, setView } = useSelectedQuestion();

  const [page, setPage] = useState(1);

  const { data, isLoading, isError, isFetching } = useTopQuestionInstances({
    questionId,
    source,
    userType,
    startDate,
    endDate,
    page,
    limit: PAGE_SIZE,
    enabled: true,
  });

  // ── Columns ───────────────────────────────────────────────────────────────

  const columns = useMemo<QuestionListColumn<any>[]>(
    () => [
      {
        key: "questionId",
        label: "Question ID",
        sortable: true,
        sortAccessor: (row) => row._id,
        className: "w-[12%]",
        cellClassName: "text-xs text-gray-500",
        render: (row) => <CopyableIdCell id={row._id} />,
      },
      {
        key: "email",
        label: "Email",
        sortable: true,
        sortAccessor: (row) => row.email ?? "",
        className: "w-[16%]",
        cellClassName: "text-xs text-gray-500 truncate",
        render: (row) => row.email || "Not Available",
      },
      {
        key: "question",
        label: "Question",
        sortable: true,
        sortAccessor: (row) => row.question,
        className: "w-[38%]",
        cellClassName: "overflow-hidden",
        render: (row) => (
          <button
            className="text-left hover:underline"
            onClick={() => {
              setSelectedQuestionId(row._id);
              setView("lifecycle");
              onClose();
            }}
          >
            <TranslatableText
              text={row.question ?? ""}
              showTooltip
              textClassName="text-xs line-clamp-2"
            />
          </button>
        ),
      },
      {
        key: "createdAt",
        label: "Created At",
        sortable: true,
        sortAccessor: (row) => (row.createdAt ? new Date(row.createdAt) : null),
        className: "w-[14%]",
        cellClassName: "whitespace-normal break-words text-[11px]",
        render: (row) =>
          row.createdAt
            ? new Date(row.createdAt).toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
              })
            : undefined,
      },
      {
        key: "status",
        label: "Status",
        align: "center",
        sortable: true,
        sortAccessor: (row) => row.status ?? "",
        className: "w-[10%]",
        render: (row) => (
          <Badge
            variant="outline"
            className="justify-center capitalize text-gray-500"
          >
            {row.status ?? "—"}
          </Badge>
        ),
      },
      {
        key: "source",
        label: "Source",
        align: "center",
        sortable: true,
        sortAccessor: (row) => row.source ?? "",
        className: "w-[10%]",
        render: (row) => (
          <Badge variant="secondary" className="justify-center capitalize">
            {row.source ?? "—"}
          </Badge>
        ),
      },
    ],
    [onClose, setSelectedQuestionId, setView],
  );

  // ── Data ──────────────────────────────────────────────────────────────────
  // Our backend returns { data: [], total, page, limit, totalPages }
  // useTopQuestionInstances wraps this in react-query; the raw response shape
  // has .data[] and .total at the top level.
  const rawData = data as any;
  const questions: any[] = rawData?.data ?? rawData?.questions ?? [];
  const total: number = rawData?.total ?? 0;

  // ── Refresh ───────────────────────────────────────────────────────────────

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["top-question-instances"] });
    setRefreshing(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return createPortal(
    <div
      className="fixed inset-0 z-999 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl dark:bg-[#1a1a1a]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-[#2a2a2a]">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
              {questionText}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              All instances of this question
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={handleRefresh}
              className="rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
              title="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Table */}
        <QuestionListTable
          data={questions}
          columns={columns}
          loading={isLoading}
          loadingMessage="Loading question instances..."
          error={
            isError
              ? "Failed to load instances. Please try again."
              : undefined
          }
          emptyMessage="No instances found for this question."
          getRowKey={(row) => row._id}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: setPage,
          }}
          initialSortKey="createdAt"
          initialSortDirection="desc"
          viewMode="table"
        />

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-6 py-3 text-xs text-gray-400 dark:border-[#2a2a2a] dark:text-gray-500">
          <span>
            {isFetching && !isLoading
              ? "Refreshing…"
              : `${total} instance${total !== 1 ? "s" : ""}`}
          </span>
          <span className="capitalize">{userType} filter</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
