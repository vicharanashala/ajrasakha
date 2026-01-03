type Props = { children: React.ReactNode };

export function TableContainer({ children }: Props) {
  return (
    <div className="rounded-lg border bg-card min-h-[55vh]">
      <div className="hidden md:block overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
