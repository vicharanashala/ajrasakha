import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Skeleton } from "@/components/atoms/skeleton";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";

export type QuestionListSortDirection = "asc" | "desc";

export type QuestionListColumn<T> = {
  key: string;
  label: ReactNode;
  visible?: boolean;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
  tooltip?: string;
  render?: (row: T, index: number) => ReactNode;
  accessor?: (row: T) => ReactNode;
  sortAccessor?: (row: T) => string | number | Date | null | undefined;
  format?: (value: ReactNode, row: T, index: number) => ReactNode;
};

export type QuestionListPagination = {
  page: number;
  pageSize: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

type QuestionListTableProps<T> = {
  data: T[];
  columns: QuestionListColumn<T>[];
  loading?: boolean;
  error?: ReactNode;
  emptyMessage?: ReactNode;
  loadingMessage?: string;
  getRowKey?: (row: T, index: number) => string | number;
  pagination?: QuestionListPagination;
  enableInternalPagination?: boolean;
  initialPageSize?: number;
  initialSortKey?: string;
  initialSortDirection?: QuestionListSortDirection;
  onSortChange?: (key: string, direction: QuestionListSortDirection) => void;
  className?: string;
  tableClassName?: string;
};

const alignClasses = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function normalizeSortValue(value: string | number | Date | null | undefined) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return String(value ?? "").toLowerCase();
}

function compareValues(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined,
  direction: QuestionListSortDirection,
) {
  const first = normalizeSortValue(a);
  const second = normalizeSortValue(b);
  const result =
    typeof first === "number" && typeof second === "number"
      ? first - second
      : String(first).localeCompare(String(second));

  return direction === "asc" ? result : -result;
}

function renderDefaultValue(value: ReactNode) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-gray-400 dark:text-gray-500">-</span>;
  }

  return value;
}

export function QuestionListTable<T>({
  data,
  columns,
  loading = false,
  error,
  emptyMessage = "No questions found.",
  loadingMessage = "Loading questions...",
  getRowKey,
  pagination,
  enableInternalPagination = false,
  initialPageSize = 25,
  initialSortKey,
  initialSortDirection = "asc",
  onSortChange,
  className,
  tableClassName,
}: QuestionListTableProps<T>) {
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDirection, setSortDirection] =
    useState<QuestionListSortDirection>(initialSortDirection);
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(initialPageSize);

  const visibleColumns = useMemo(
    () => columns.filter((column) => column.visible !== false),
    [columns],
  );

  const sortedData = useMemo(() => {
    const activeColumn = visibleColumns.find(
      (column) => column.key === sortKey && column.sortable,
    );

    if (!activeColumn) return data;

    return [...data].sort((a, b) =>
      compareValues(
        activeColumn.sortAccessor?.(a) ??
          (typeof activeColumn.accessor?.(a) === "string" ||
          typeof activeColumn.accessor?.(a) === "number"
            ? (activeColumn.accessor(a) as string | number)
            : undefined),
        activeColumn.sortAccessor?.(b) ??
          (typeof activeColumn.accessor?.(b) === "string" ||
          typeof activeColumn.accessor?.(b) === "number"
            ? (activeColumn.accessor(b) as string | number)
            : undefined),
        sortDirection,
      ),
    );
  }, [data, sortDirection, sortKey, visibleColumns]);

  const activePagination = pagination ?? {
    page: internalPage,
    pageSize: internalPageSize,
    total: sortedData.length,
    onPageChange: setInternalPage,
    onPageSizeChange: setInternalPageSize,
  };

  const shouldPaginate = Boolean(pagination || enableInternalPagination);
  const totalItems = activePagination.total ?? sortedData.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalItems / Math.max(activePagination.pageSize, 1)),
  );
  const displayPage = Math.min(activePagination.page, totalPages);

  const rows = useMemo(() => {
    if (!shouldPaginate || pagination) return sortedData;

    const start = (displayPage - 1) * activePagination.pageSize;
    return sortedData.slice(start, start + activePagination.pageSize);
  }, [
    activePagination.pageSize,
    displayPage,
    pagination,
    shouldPaginate,
    sortedData,
  ]);

  const handleSort = (column: QuestionListColumn<T>) => {
    if (!column.sortable) return;

    const nextDirection =
      sortKey === column.key && sortDirection === "asc" ? "desc" : "asc";
    setSortKey(column.key);
    setSortDirection(nextDirection);
    onSortChange?.(column.key, nextDirection);
  };

  if (loading) {
    return (
      <div className={cn("space-y-2 p-4", className)}>
        <div className="sr-only">{loadingMessage}</div>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400 dark:text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className={cn("w-full min-w-max text-sm border-collapse", tableClassName)}>
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-[#1f1f1f] border-b border-gray-200 dark:border-[#2a2a2a]">
            <tr>
              {visibleColumns.map((column) => {
                const active = sortKey === column.key;
                const SortIcon = !active
                  ? ArrowUpDown
                  : sortDirection === "asc"
                    ? ArrowUp
                    : ArrowDown;

                return (
                  <th
                    key={column.key}
                    title={column.tooltip}
                    className={cn(
                      "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap",
                      alignClasses[column.align ?? "left"],
                      column.className,
                      column.headerClassName,
                    )}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(column)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-gray-800 dark:hover:text-gray-100",
                          column.align === "center" && "justify-center",
                          column.align === "right" && "justify-end",
                        )}
                      >
                        <span>{column.label}</span>
                        <SortIcon className="h-3 w-3" />
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
            {rows.map((row, index) => {
              const absoluteIndex = shouldPaginate
                ? (displayPage - 1) * activePagination.pageSize + index
                : index;

              return (
                <tr
                  key={getRowKey?.(row, absoluteIndex) ?? absoluteIndex}
                  className="hover:bg-gray-50 dark:hover:bg-[#1f1f1f] transition-colors"
                >
                  {visibleColumns.map((column) => {
                    const value = column.render
                      ? column.render(row, absoluteIndex)
                      : column.accessor?.(row);

                    return (
                      <td
                        key={column.key}
                        className={cn(
                          "px-4 py-3 align-top text-gray-700 dark:text-gray-300",
                          alignClasses[column.align ?? "left"],
                          column.className,
                          column.cellClassName,
                        )}
                      >
                        {column.format
                          ? column.format(value, row, absoluteIndex)
                          : renderDefaultValue(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shouldPaginate && totalPages > 1 && (
        <div className="shrink-0 border-t border-gray-100 px-4 py-3 dark:border-[#2a2a2a]">
          <Pagination
            currentPage={displayPage}
            totalPages={totalPages}
            onPageChange={(page) => activePagination.onPageChange?.(page)}
            limit={activePagination.pageSize}
            onLimitChange={(pageSize) => {
              activePagination.onPageSizeChange?.(pageSize);
              activePagination.onPageChange?.(1);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function FarmerInfoCell({
  primary,
  secondary,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="min-w-[140px]">
      <div className="font-medium text-gray-800 dark:text-gray-100">
        {renderDefaultValue(primary)}
      </div>
      {secondary && (
        <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          {secondary}
        </div>
      )}
    </div>
  );
}
