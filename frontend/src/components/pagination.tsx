import { Button } from "./atoms/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "./atoms/tooltip";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  limit?: number;
  onLimitChange?: (limit: number) => void;
}

export const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  limit,
  onLimitChange,
}: PaginationProps) => {
  const MAX_VISIBLE_PAGES = 5;

  // Calculate start and end page for the visible window
  let startPage = Math.max(1, currentPage - Math.floor(MAX_VISIBLE_PAGES / 2));
  let endPage = startPage + MAX_VISIBLE_PAGES - 1;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - MAX_VISIBLE_PAGES + 1);
  }

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex flex-wrap items-center md:justify-end justify-center gap-4 mt-4 w-full px-1">
      <div className="flex items-center justify-center gap-2 flex-wrap md:justify-end">
        {/* Pagination Limit Dropdown */}
        <div className="flex items-center gap-2 relative mr-2">
          {onLimitChange && limit !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <Select
                      value={limit.toString()}
                      onValueChange={(value) => onLimitChange(Number(value))}
                    >
                      <SelectTrigger className="w-[85px] relative" size="sm">
                        <SelectValue placeholder="Limit" />
                      </SelectTrigger>
                      <SelectContent>
                        {[12, 25, 50, 100].map((v) => (
                          <SelectItem key={v} value={v.toString()}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Items per page</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="flex-shrink-0"
        >
          Previous
        </Button>

        <div className="flex gap-2 overflow-x-auto max-w-full px-1 scrollbar-thin scrollbar-thumb-gray-300">
          {startPage > 1 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPageChange(startPage - 1)}
              className="flex-shrink-0"
            >
              ...
            </Button>
          )}

          {pages.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === currentPage ? "default" : "outline"}
              onClick={() => onPageChange(p)}
              className="flex-shrink-0"
            >
              {p}
            </Button>
          ))}

          {endPage < totalPages && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPageChange(endPage + 1)}
              className="flex-shrink-0"
            >
              ...
            </Button>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          disabled={currentPage === totalPages || totalPages === 0}
          onClick={() => onPageChange(currentPage + 1)}
          className="flex-shrink-0"
        >
          Next
        </Button>
      </div>
    </div>
  );
};
