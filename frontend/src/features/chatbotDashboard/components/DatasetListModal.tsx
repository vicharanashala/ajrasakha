import { X } from "lucide-react";
import {
  ReusableDataTable,
  type ReusableTableColumn,
} from "./ReusableDataTable";


type DatasetListModalProps<T> = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-4xl w-full p-6 relative flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>

        <div className="mb-4 pr-12">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            {title}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {description ?? `Total: ${totalCount.toLocaleString()}`}
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400 dark:text-gray-500">
              Loading…
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

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => onPageChange(page - 1)}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => onPageChange(page + 1)}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
