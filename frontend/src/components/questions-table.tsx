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
import { Label } from "./atoms/label";
import { Input } from "./atoms/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import {
  Calendar,
  Eye,
  FileText,
  Filter,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./atoms/dialog";
import { Separator } from "./atoms/separator";
import { Slider } from "./atoms/slider";
import type {
  AdvanceFilterValues,
  IDetailedQuestion,
  QuestionDateRangeFilter,
  QuestionFilterStatus,
  QuestionSourceFilter,
} from "./questions-page";
import { ScrollArea } from "./atoms/scroll-area";

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
  hasMore?: boolean;
  isLoadingMore?: boolean;
  lastElementRef?: (node: HTMLDivElement | null) => void;
  isLoading?: boolean;
};

export const QuestionsTable = ({
  items,
  onViewMore,
  lastElementRef,
  isLoading,
}: QuestionsTableProps) => {
  return (
    <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh] max-h-[55vh]">
      <Table className="min-w-[800px]">
        <TableHeader className="bg-card sticky top-0 z-10">
          <TableRow>
            <TableHead className="w-[35%] text-center">Question</TableHead>
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
                colSpan={8}
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
                  ref={isSecondLastItem ? lastElementRef : null}
                >
                  <TableCell
                    className="align-middle w-[35%]"
                    title={q.question}
                  >
                    {truncate(q.question, 90)}
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
                      className={
                        q.status === "answered"
                          ? "bg-green-600 text-white"
                          : q.status === "open"
                          ? "bg-amber-500 text-white"
                          : "bg-muted text-foreground"
                      }
                    >
                      {q.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-middle">
                    {q.totalAnswersCount}
                  </TableCell>
                  <TableCell className="align-middle">
                    {formatDate(q.createdAt)}
                  </TableCell>
                  <TableCell className="align-middle">
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
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
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
};

export const QuestionsFilters = ({
  search,
  setSearch,
  crops,
  states,
  onChange,
  onReset,
  refetch,
}: QuestionsFiltersProps) => {
  const normalizedStates = useMemo(() => states.sort(), [states]);

  const [advanceFilter, setAdvanceFilterValues] = useState<AdvanceFilterValues>(
    {
      status: "all",
      source: "all",
      state: "all",
      answersCount: [0, 100],
      dateRange: "all",
      crop: "all",
    }
  );

  const handleDialogChange = (key: string, value: any) => {
    setAdvanceFilterValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    onChange({
      status: advanceFilter.status,
      source: advanceFilter.source,
      state: advanceFilter.state,
      crop: advanceFilter.crop,
      answersCount: advanceFilter.answersCount,
      dateRange: advanceFilter.dateRange,
    });
  };

  const activeFiltersCount = Object.values(advanceFilter).filter(
    (v) => v !== "all" && !(Array.isArray(v) && v[0] === 0 && v[1] === 100)
  ).length;

  return (
    <div className="flex flex-wrap items-center justify-between w-full p-4 gap-3 border-b bg-card/50">
      {/* Search Input */}
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

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 items-center justify-end w-full sm:w-auto">
        {/* Filters Dialog */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="flex-1 min-w-[150px] flex items-center justify-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Advanced Filters
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Refine your search with multiple filter options
              </p>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Question Status & Source */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4" />
                    Question Status
                  </Label>
                  <Select
                    value={advanceFilter.status}
                    onValueChange={(v) => handleDialogChange("status", v)}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="open">🟢 Open</SelectItem>
                      <SelectItem value="answered">🔵 Answered</SelectItem>
                      <SelectItem value="closed">🔴 Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <MessageSquare className="h-4 w-4" />
                    Source
                  </Label>
                  <Select
                    value={advanceFilter.source}
                    onValueChange={(v) => handleDialogChange("source", v)}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="AJRASAKHA">Ajrasakha</SelectItem>
                      <SelectItem value="AGRI_EXPERT">Agri Expert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Location & Crop */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-4 w-4" />
                    State/Region
                  </Label>
                  <Select
                    value={advanceFilter.state}
                    onValueChange={(v) => handleDialogChange("state", v)}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {normalizedStates.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                      />
                    </svg>
                    Crop Type
                  </Label>
                  <Select
                    value={advanceFilter.crop}
                    onValueChange={(v) => handleDialogChange("crop", v)}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Crops</SelectItem>
                      {crops.map((crop) => (
                        <SelectItem key={crop} value={crop}>
                          {crop}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Date Range */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Calendar className="h-4 w-4" />
                  Date Range
                </Label>
                <Select
                  value={advanceFilter.dateRange}
                  onValueChange={(v) => handleDialogChange("dateRange", v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="quarter">Last 3 Months</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Answers Count Slider */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <MessageSquare className="h-4 w-4" />
                    Number of Answers
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    {advanceFilter.answersCount[0]} -{" "}
                    {advanceFilter.answersCount[1]}
                  </Badge>
                </div>
                <div className="px-2">
                  <Slider
                    value={advanceFilter.answersCount}
                    onValueChange={(value) =>
                      handleDialogChange("answersCount", value)
                    }
                    max={100}
                    min={0}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>0 answers</span>
                    <span>100+ answers</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Filter questions based on the number of answers received
                </p>
              </div>

              {activeFiltersCount > 0 && (
                <>
                  <Separator />
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold">
                        Active Filters ({activeFiltersCount})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(advanceFilter).map(([key, value]) => {
                        if (
                          value === "all" ||
                          (Array.isArray(value) &&
                            value[0] === 0 &&
                            value[1] === 100)
                        )
                          return null;
                        return (
                          <Badge
                            key={key}
                            variant="secondary"
                            className="text-xs"
                          >
                            {key}:{" "}
                            {Array.isArray(value)
                              ? `${value[0]}-${value[1]}`
                              : value}
                            <X
                              className="h-3 w-3 ml-1 cursor-pointer"
                              onClick={() =>
                                handleDialogChange(
                                  key,
                                  Array.isArray(value) ? [0, 100] : "all"
                                )
                              }
                            />
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <DialogFooter className="flex justify-between sm:justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setAdvanceFilterValues({
                    status: "all",
                    source: "all",
                    state: "all",
                    answersCount: [0, 100],
                    dateRange: "all",
                    crop: "all",
                  });
                  onReset();
                }}
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <div className="flex gap-2">
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button onClick={handleApplyFilters}>Apply Filters</Button>
                </DialogClose>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="icon"
          className="flex-none w-12 p-3 sm:w-auto"
          onClick={refetch}
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
