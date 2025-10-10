import { useMemo, useState } from "react";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import { Input } from "./atoms/input";

import {
  Edit,
  Eye,
  Loader2,
  MoreHorizontal,
  MoreVertical,
  RefreshCcw,
  Search,
  Trash,
} from "lucide-react";

import { Pagination } from "./pagination";
import {
  AdvanceFilterDialog,
  type AdvanceFilterValues,
} from "./advanced-question-filter";
import type { IDetailedQuestion, IMyPreference } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./atoms/dropdown-menu";

export type QuestionStatus = "open" | "answered" | "closed";

export interface IQuestion {
  _id?: string;
  userId: string;
  question: string;
  context: string;
  status: QuestionStatus;
  totalAnswersCount: number;
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
  source: "AJRASAKHA" | "AGRI_EXPERT";
  createdAt?: string;
  updatedAt?: string;
}
const truncate = (s: string, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

const formatDate = (d?: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date
    ? new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(date)
    : "";
};

type QuestionsTableProps = {
  items?: IDetailedQuestion[] | null;
  onViewMore: (questionId: string) => void;
  // hasMore?: boolean;
  // isLoadingMore?: boolean;
  // lastElementRef?: (node: HTMLDivElement | null) => void;
  currentPage: number;
  setCurrentPage: (val: number) => void;
  isLoading?: boolean;
  totalPages: number;
};

export const QuestionsTable = ({
  items,
  onViewMore,
  // lastElementRef,
  currentPage,
  setCurrentPage,
  isLoading,
  totalPages,
}: QuestionsTableProps) => {
  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh]">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-card sticky top-0 z-10">
            <TableRow>
              <TableHead className="text-center">Sl.No</TableHead>
              <TableHead className="w-[35%] text-center">Question</TableHead>
              <TableHead className="text-center">Priority</TableHead>
              <TableHead className="text-center">State</TableHead>
              <TableHead className="text-center">Crop</TableHead>
              <TableHead className="text-center">Source</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Answers</TableHead>
              <TableHead className="text-center">Created</TableHead>
              <TableHead className="text-center">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : items?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  rowSpan={10}
                  className="text-center py-10 text-muted-foreground"
                >
                  No questions found
                </TableCell>
              </TableRow>
            ) : (
              items?.map((q, idx) => {
                const isSecondLastItem = idx === items?.length - 2;
                return (
                  <TableRow
                    key={q._id}
                    className="text-center"
                    // ref={isSecondLastItem ? lastElementRef : null}
                  >
                    <TableCell
                      className="align-middle text-center"
                      title={idx.toString()}
                    >
                      {(currentPage - 1) * totalPages + idx + 1}
                    </TableCell>
                    <TableCell
                      className="text-start ps-3 w-[35%]"
                      title={q.question}
                    >
                      <span
                        className="cursor-pointer hover:underline"
                        onClick={() => onViewMore(q._id?.toString() || "")}
                      >
                        {truncate(q.question, 90)}
                      </span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      {q.priority ? (
                        <Badge
                          variant={
                            q.priority === "high"
                              ? "destructive"
                              : q.priority === "medium"
                              ? "secondary"
                              : "outline"
                          }
                          className={
                            q.priority === "high"
                              ? "bg-red-500/10 text-red-600 border-red-500/30"
                              : q.priority === "medium"
                              ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                              : "bg-green-500/10 text-green-600 border-green-500/30"
                          }
                        >
                          {q.priority.charAt(0).toUpperCase() +
                            q.priority.slice(1)}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          NIL
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="align-middle">
                      {q.details.state}
                    </TableCell>
                    <TableCell className="align-middle">
                      {q.details.crop}
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge variant="outline">{q.source}</Badge>
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge
                        variant={
                          q.status === "answered"
                            ? "secondary"
                            : q.status === "open"
                            ? "outline"
                            : q.status === "closed"
                            ? "destructive"
                            : "outline"
                        }
                        className={
                          q.status === "answered"
                            ? "bg-green-500/10 text-green-600 border-green-500/30"
                            : q.status === "open"
                            ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                            : q.status === "closed"
                            ? "bg-gray-500/10 text-gray-600 border-gray-500/30"
                            : "bg-muted text-foreground"
                        }
                      >
                        {q.status ? q.status.replace("_", " ") : "NIL"}
                      </Badge>
                    </TableCell>

                    <TableCell className="align-middle">
                      {q.totalAnswersCount}
                    </TableCell>
                    <TableCell className="align-middle">
                      {formatDate(q.createdAt)}
                    </TableCell>
                    {/* <TableCell className="align-middle">
                      <div className="flex justify-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-1"
                          onClick={() => onViewMore(q._id?.toString() || "")}
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Button>
                      </div>
                    </TableCell> */}
                    <TableCell className="align-middle">
                      <div className="flex justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="p-1">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                onViewMore(q._id?.toString() || "")
                              }
                            >
                              <Eye className="w-4 h-4 mr-2" /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                            // onClick={() => onEdit(q._id?.toString() || "")}
                            >
                              <Edit className="w-4 h-4 mr-2 text-blue-500" />{" "}
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                            // onClick={() => onDelete(q._id?.toString() || "")}
                            >
                              <Trash className="w-4 h-4 mr-2 text-red-500" />{" "}
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => setCurrentPage(page)}
      />
    </div>
  );
};

type QuestionsFiltersProps = {
  search: string;
  states: string[];
  onChange: (next: AdvanceFilterValues) => void;
  crops: string[];
  onReset: () => void;
  setSearch: (val: string) => void;
  refetch: () => void;
  totalQuestions: number;
};

export const QuestionsFilters = ({
  search,
  setSearch,
  crops,
  states,
  onChange,
  onReset,
  refetch,
  totalQuestions,
}: QuestionsFiltersProps) => {
  const [advanceFilter, setAdvanceFilterValues] = useState<AdvanceFilterValues>(
    {
      status: "all",
      source: "all",
      state: "all",
      answersCount: [0, 100],
      dateRange: "all",
      crop: "all",
      priority: "all",
      domain: "all",
      user: "all",
    }
  );

  const handleDialogChange = (key: string, value: any) => {
    setAdvanceFilterValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = (myPreference?: IMyPreference) => {
    onChange({
      status: advanceFilter.status,
      source: advanceFilter.source,
      state: myPreference?.state || advanceFilter.state,
      crop: myPreference?.crop || advanceFilter.crop,
      answersCount: advanceFilter.answersCount,
      dateRange: advanceFilter.dateRange,
      priority: advanceFilter.priority,
      domain: myPreference?.domain || advanceFilter.domain,
      user: advanceFilter.user,
    });
  };

  const activeFiltersCount = Object.values(advanceFilter).filter(
    (v) => v !== "all" && !(Array.isArray(v) && v[0] === 0 && v[1] === 100)
  ).length;

  return (
    <div className="flex flex-wrap items-center justify-between w-full p-4 gap-3 border-b bg-card rounded">
      <div className="flex-1 min-w-[200px] max-w-[400px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search questions, crops..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-end w-full sm:w-auto">
        <AdvanceFilterDialog
          advanceFilter={advanceFilter}
          setAdvanceFilterValues={setAdvanceFilterValues}
          handleDialogChange={handleDialogChange}
          handleApplyFilters={handleApplyFilters}
          normalizedStates={states}
          crops={crops}
          activeFiltersCount={activeFiltersCount}
          onReset={onReset}
          isStatusFilterNeeded={true}
        />
        <Button
          variant="outline"
          size="icon"
          className="flex-none w-12 p-3 sm:w-auto"
          onClick={refetch}
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>

        <span className="ml-4 text-sm text-muted-foreground">
          Total Questions: {totalQuestions}
        </span>
      </div>
    </div>
  );
};
