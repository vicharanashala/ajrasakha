import {type ReactNode} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  QuestionListTable,
  type QuestionListColumn,
} from "./QuestionListTable";

export type QueryListColumn<T> = QuestionListColumn<T>;

export interface QueriesModalProps<T> {
  title: ReactNode;
  subtitle?: ReactNode;
  data: T[];
  columns: QueryListColumn<T>[];
  total: number;
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  page: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onClose: () => void;
  getRowKey: (row: T) => string | number;
  entityName?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

export function QueriesModal<T>({
  title,
  subtitle,
  data,
  columns,
  total,
  isLoading,
  isError,
  isFetching,
  page,
  onPageChange,
  pageSize = 10,
  onClose,
  getRowKey,
  entityName = "query",
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search by name, email, query or ID...",
}: QueriesModalProps<T>) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl dark:bg-[#1a1a1a]">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-[#2a2a2a]">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {onSearchChange && (
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-[#2a2a2a] dark:text-gray-100"
              />
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label={`Close ${entityName} modal`}
            >
              <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        <QuestionListTable
          data={data}
          columns={columns}
          loading={isLoading}
          loadingMessage={`Loading ${entityName} data...`}
          error={
            isError
              ? `Failed to load ${entityName} data. Please try again.`
              : undefined
          }
          emptyMessage={`No ${entityName} data found.`}
          getRowKey={getRowKey}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange,
          }}
          initialSortKey="createdAt"
          initialSortDirection="desc"
        />

        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-6 py-3 text-xs text-gray-400 dark:border-[#2a2a2a] dark:text-gray-500">
          <span>
            {isFetching && !isLoading
              ? "Refreshing..."
              : `${total} ${total === 1 ? entityName : entityName.endsWith('y') ? entityName.slice(0, -1) + 'ies' : entityName + 's'}`}
          </span>
          <span>{title}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
