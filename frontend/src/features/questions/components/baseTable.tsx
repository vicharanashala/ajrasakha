import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";
import { RotateCcw } from "lucide-react";

export type Column<T> = {
  key: keyof T | string;
  label: string;
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
};

type BaseTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  sort: string;
  onSort: (key: string) => void;
  startIndex?: number;
};

export function BaseTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = "No records found",
  sort,
  onSort,
  startIndex,
}: BaseTableProps<T>) {
  return (
    <Table className="min-w-[800px] table-fixed">
      <TableHeader className="bg-card sticky top-0 z-10">
        <TableRow>
          {columns.map((col) => (
            <TableHead
              key={col.key as string}
              style={{ width: col.width }}
              className="text-center"
            >
              {col.sortable ? (
                <button
                  onClick={() => onSort(col.key as string)}
                  className="flex items-center justify-around gap-0.5 mx-auto select-none"
                >
                  {col.label}
                  {sort === `${col.key as string}___asc` && (
                    <span className="text-md text-green-500">↑</span>
                  )}
                  {sort === `${col.key as string}___desc` && (
                    <span className="text-md text-green-500">↓</span>
                  )}
                </button>
              ) : (
                col.label
              )}
            </TableHead>
          ))}
          {/* Clear sort column */}
          {sort && (
            <TableHead className="text-center w-[60px]">
              <button
                onClick={() => onSort("clearSort")}
                className="px-2 py-1 rounded-md text-xs bg-primary text-white hover:text-black cursor-pointer"
              >
                <RotateCcw size={16} />
              </button>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>

      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-10 text-center">
              Loading...
            </TableCell>
          </TableRow>
        ) : data.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="py-10 text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          data.map((row, i) => (
            <TableRow key={i} className="text-center hover:bg-muted/40">
              {columns.map((col) => (
                <TableCell key={col.key as string}>
                  {col.render
                    ? col.render(row, (startIndex ?? 0) + i)
                    : (row as any)[col.key]}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
