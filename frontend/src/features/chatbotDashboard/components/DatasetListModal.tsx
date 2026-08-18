import type { ComponentType } from "react";
import { ChevronLeft, ChevronRight, Database, X } from "lucide-react";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  ReusableDataTable,
  type ReusableTableColumn,
} from "./ReusableDataTable";

type DatasetListModalProps<T> = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  columns: ReusableTableColumn<T>[];
  rows: T[];
  isLoading?: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  getRowKey?: (row: T, index: number) => string | number;
};

export function DatasetListModal<T>({
  isOpen,
  onClose,
  title,
  description,
  icon: Icon = Database,
  columns,
  rows,
  isLoading,
  page,
  totalPages,
  totalCount,
  onPageChange,
  getRowKey,
}: DatasetListModalProps<T>) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl max-h-[88vh] flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl ring-1 ring-border/60 animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-foreground">
                {title}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {description ?? `Total: ${totalCount.toLocaleString()}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <ReusableDataTable
              columns={columns}
              data={rows}
              getRowKey={getRowKey}
              emptyMessage="No records found."
            />
          )}
        </div>

        {/* Footer */}
        {totalPages > 1 && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-6 py-3">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => onPageChange(page - 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => onPageChange(page + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
