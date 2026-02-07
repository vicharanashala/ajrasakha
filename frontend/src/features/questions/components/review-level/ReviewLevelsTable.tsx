import { Pagination } from "@/components/pagination";
import { BaseTable } from "../baseTable";
import { TableContainer } from "../TableContainer";
import { reviewLevelColumns, type ReviewRow } from "./reviewLevel.coloumn";
import { ReviewLevelMobileCard } from "./ReviewLevelMobile";

type Props = {
  data: ReviewRow[] | undefined;
  isLoading?: boolean;

  page: number;
  totalPages: number;

  onPageChange: (page: number) => void;
  onViewMore: (id: string) => void;

  sort: string;
  toggleSort: (key: string) => void;
};

export function ReviewLevelsTable({
  data = [],
  isLoading,
  page,
  totalPages,
  onPageChange,
  onViewMore,
  toggleSort,
  sort,
}: Props) {
  return (
    <div className="ps-4 md:ps-0">
      <TableContainer>
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <BaseTable
            columns={reviewLevelColumns(onViewMore)}
            data={data}
            isLoading={isLoading}
            onSort={toggleSort}
            sort={sort}
            index={(page - 1) * data.length }
          />
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3 p-3">
          {data.map((row, i) => (
            <ReviewLevelMobileCard
              key={i}
              row={row}
              index={(page - 1) * data.length + i}
              onViewMore={onViewMore}
              onSort={toggleSort}
              sort={sort}
            />
          ))}
        </div>
      </TableContainer>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}
