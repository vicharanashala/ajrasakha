import { Button } from "./atoms/button";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) => {
  const MAX_VISIBLE_PAGES = 5;

  // Calculate start and end page for the visible window
  let startPage = 1;
  let endPage = Math.min(totalPages, MAX_VISIBLE_PAGES);

  if (currentPage > MAX_VISIBLE_PAGES) {
    startPage = currentPage;
    endPage = Math.min(currentPage + MAX_VISIBLE_PAGES - 1, totalPages);
  }

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-end gap-2 mt-4">
      <Button
        size="sm"
        variant="outline"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        Previous
      </Button>

      {pages.map((p) => (
        <Button
          key={p}
          size="sm"
          variant={p === currentPage ? "default" : "outline"}
          onClick={() => onPageChange(p)}
        >
          {p}
        </Button>
      ))}

      {endPage < totalPages && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(endPage + 1)}
        >
          ...
        </Button>
      )}

      <Button
        size="sm"
        variant="outline"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </Button>
    </div>
  );
};