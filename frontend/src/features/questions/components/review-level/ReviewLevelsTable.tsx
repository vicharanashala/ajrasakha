import { Pagination } from "@/components/pagination";
import { ScrollArea, ScrollBar } from "@/components/atoms/scroll-area";
import { BaseTable } from "../baseTable";
import { useReviewLevelColumns, type ReviewRow } from "./reviewLevel.coloumn";
import { ReviewLevelMobileCard } from "./ReviewLevelMobile";
import { useQuestionTableStore } from "@/stores/all-questions";
import ReviewLevelsCard from "./ReviewLevelsCard";
import { Loader2 } from "lucide-react";

type Props = {
  data: ReviewRow[] | undefined;
  isLoading?: boolean;

  page: number;
  totalPages: number;

  onPageChange: (page: number) => void;
  onViewMore: (id: string) => void;

  sort: string;
  toggleSort: (key: string) => void;

  limit: number;
  view: "table" | "grid";
  onRefresh?: () => void;
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
  limit,
  view,
  onRefresh,
}: Props) {
  //hide question elements
  const visibleColumns = useQuestionTableStore((state) => state.visibleColumns);
  const { columns, modal, onDelayedClick } = useReviewLevelColumns(onViewMore, visibleColumns, onRefresh);

  return (
    <div className="ps-4 md:ps-0">
      {modal}
      <div
        className={`rounded-lg mb-2 bg-card min-h-[55vh] ${view === "table" && "border"}`}
      >
        {/* Desktop Table */}
        <div className="hidden md:block">
          {view === "table" ? (
            <ScrollArea className="w-full whitespace-nowrap">
              <BaseTable
              columns={columns}
              data={data}
              isLoading={isLoading}
              onSort={toggleSort}
              sort={sort}
              startIndex={(page - 1) * limit}
            />
            <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : isLoading ? (
            <div className="text-center py-10">
              <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
            </div>
          ) : data?.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground">
              No questions found
            </p>
          ) : (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(400px,1fr))] pb-3">
              {data.map((row, i) => (
                <ReviewLevelsCard
                  key={i}
                  row={row}
                  index={(page - 1) * data.length + i}
                  onViewMore={onViewMore}
                  onSort={toggleSort}
                  sort={sort}
                  onDelayedClick={onDelayedClick}
                />
              ))}
            </div>
          )}
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
              onDelayedClick={onDelayedClick}
            />
          ))}
        </div>
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}
