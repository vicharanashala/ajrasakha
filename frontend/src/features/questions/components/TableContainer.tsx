type Props = { children: React.ReactNode };
export function TableContainer({ children }: Props) {
  return (
    <div className="rounded-lg border bg-card min-h-[55vh] overflow-x-auto">
      {children}
    </div>
  );
}

