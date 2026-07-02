import type { ReactNode } from "react";

export type ReusableTableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  className?: string;
  render: (row: T, index: number) => ReactNode;
};

type ReusableDataTableProps<T> = {
  columns: ReusableTableColumn<T>[];
  data: T[];
  getRowKey?: (row: T, index: number) => string | number;
  emptyMessage?: string;
  className?: string;
};

const alignClasses: Record<NonNullable<ReusableTableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function ReusableDataTable<T>({
  columns,
  data,
  getRowKey,
  emptyMessage = "No data available.",
  className = "",
}: ReusableDataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400 dark:text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={`overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg ${className}`}
    >
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap ${
                  alignClasses[column.align ?? "left"]
                } ${column.className ?? ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={getRowKey?.(row, index) ?? index}
              className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap ${
                    alignClasses[column.align ?? "left"]
                  } ${column.className ?? ""}`}
                >
                  {column.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
