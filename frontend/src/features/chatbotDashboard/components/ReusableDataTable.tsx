import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

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
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-sm text-muted-foreground">
        <Inbox className="h-6 w-6 text-muted-foreground/60" />
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={`overflow-auto rounded-xl border border-border ${className}`}
    >
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${
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
              className="border-t border-border/70 transition-colors hover:bg-muted/40"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`whitespace-nowrap px-4 py-2.5 text-foreground/90 ${
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
