import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table";

export type Column<T> = {
  key: keyof T | string;
  label: string;
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
};

type BaseTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
};

export function BaseTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = "No records found",
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
              {col.label}
            </TableHead>
          ))}
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
                  {col.render ? col.render(row, i) : (row as any)[col.key]}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
