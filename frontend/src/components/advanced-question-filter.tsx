import React, { useEffect, useState } from "react";
import { CommonFilterFields } from "./CommonFilterFields";
import type { CommonFilterKey } from "./CommonFilterFields";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Label } from "@/components/atoms/label";
import { Separator } from "@/components/atoms/separator";
import { Badge } from "@/components/atoms/badge";
import { Slider } from "@/components/atoms/slider";
import {
  Filter,
  MessageSquare,
  RefreshCcw,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  XCircle,
  Settings,
} from "lucide-react";
import { CROPS, STATES, DOMAINS } from "@/components/MetaData";
export { STATES, CROPS, DOMAINS };

export type QuestionFilterStatus = "all" | "open" | "in-review" | "closed";
export type QuestionDateRangeFilter =
  | "all"
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type QuestionSourceFilter = "all" | "AJRASAKHA" | "AGRI_EXPERT" | "WHATSAPP";
// New Type
export type QuestionPriorityFilter = "all" | "high" | "low" | "medium";
export type QuestionTimeRange = {
  startDate: Date | undefined;
  endDate: Date | undefined;
};
export type ReviewLevel =
  | "all"
  | "Level 1"
  | "Level 2"
  | "Level 3"
  | "Level 4"
  | "Level 5"
  | "Level 6"
  | "Level 7"
  | "Level 8"
  | "Level 9";

export type AdvanceFilterValues = {
  status: QuestionFilterStatus;
  source: QuestionSourceFilter;
  state: string;
  states?: string[]; // multi-select for Preferences filter
  answersCount: [number, number];
  dateRange: QuestionDateRangeFilter;
  user: string;
  domain: string;
  crop: string;
  crops?: string[]; // multi-select for expert Preferences filter
  normalised_crop: string;
  normalisedCrops?: string[]; // multi-select for Preferences filter
  priority: QuestionPriorityFilter;
  startTime?: Date | undefined | null; // Use a specific name like startTime/endTime
  endTime?: Date | undefined | null;
  review_level?: ReviewLevel;
  closedAtEnd?: Date | undefined | null;
  closedAtStart?: Date | undefined | null;
  consecutiveApprovals?: string;
  autoAllocateFilter?: string;
  hiddenQuestions?: boolean;
  duplicateQuestions?: boolean;
  isOnHold?: boolean;
};

// interface DateRangeFilterProps { ... } // unused — was for the commented-out DateRangeFilter below

// export const DateRangeFilter = ({
//   advanceFilter,
//   handleDialogChange,
//   className,
// }: DateRangeFilterProps) => {
//   const [isCalendarVisible, setIsCalendarVisible] = React.useState(false);
//   // Convert the flat startTime/endTime into the DateRange object for the Calendar
//   const dateRange: DateRange = {
//     from: advanceFilter.startTime,
//     to: advanceFilter.endTime,
//   };

//   const handleDateSelect = (range: DateRange | undefined) => {
//     console.log("Date range: ", range);
//     handleDialogChange("startTime", range?.from);
//     handleDialogChange("endTime", range?.to);

//     // Close the calendar once both dates are selected
//     if (range?.from && range?.to) {
//       setIsCalendarVisible(false);
//     }
//   };

//   const isRangeSelected = dateRange.from && dateRange.to;

//   return (
//     <div className={`space-y-2 min-w-0 relative${className}`}>
//       <Label className="flex items-center gap-2 text-sm font-semibold">
//         <Clock className="h-4 w-4 text-primary" />
//         Custom Date Range
//       </Label>

//       {/* This Button now acts as a toggle */}
//       <Button
//         id="date-toggle"
//         variant={"outline"}
//         className={`w-full justify-start text-left font-normal bg-background pr-3 ${
//           !dateRange.from && "text-muted-foreground"
//         }`}
//         onClick={() => setIsCalendarVisible(!isCalendarVisible)}
//       >
//         <CalendarIcon className="mr-2 h-4 w-4" />
//         {dateRange.from ? (
//           dateRange.to ? (
//             <>
//               {format(dateRange.from, "LLL dd, y")} -{" "}
//               {format(dateRange.to, "LLL dd, y")}
//             </>
//           ) : (
//             format(dateRange.from, "LLL dd, y")
//           )
//         ) : (
//           <span>Select a start and end date</span>
//         )}

//         {/* Toggle Icon */}
//         <span className="ml-auto">
//           {isCalendarVisible ? (
//             <ChevronUp className="h-4 w-4 opacity-50" />
//           ) : (
//             <ChevronDown className="h-4 w-4 opacity-50" />
//           )}
//         </span>
//       </Button>

//       {/* Conditional Rendering of the Calendar */}
//       {isCalendarVisible && (
//         <div className="absolute z-50 mt-2 border rounded-lg p-2 bg-popover text-popover-foreground shadow-lg min-w-full sm:min-w-[300px]">
//           {" "}
//           <Calendar
//             initialFocus
//             mode="range"
//             defaultMonth={dateRange.from}
//             selected={dateRange}
//             onSelect={handleDateSelect}
//             numberOfMonths={1} // Use 1 month since space might be limited now
//             className="w-full"
//           />
//         </div>
//       )}
//     </div>
//   );
// };

// Inline multi-select for State/Region with hover-to-scroll zones
export const StateMultiSelect = ({
  states,
  selected,
  onChange,
}: {
  states: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) => {
  const [open, setOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrollInterval = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const startScroll = (direction: "up" | "down") => {
    stopScroll();
    scrollInterval.current = setInterval(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop += direction === "down" ? 6 : -6;
      }
    }, 16);
  };

  const stopScroll = () => {
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="truncate text-left">
          {selected.length === 0
            ? "All States"
            : selected.length === 1
            ? selected[0]
            : `${selected.length} states selected`}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
        ) : (
          <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-md border border-input bg-popover shadow-md">
          {/* header */}
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-xs font-medium text-muted-foreground">
              {selected.length} selected
            </span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          </div>

          {/* scroll-up zone */}
          <div
            className="flex items-center justify-center h-6 cursor-pointer select-none text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            onMouseEnter={() => startScroll("up")}
            onMouseLeave={stopScroll}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </div>

          {/* list */}
          <div ref={scrollRef} className="max-h-48 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {states.map((s) => {
              const isSelected = selected.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    onChange(
                      isSelected
                        ? selected.filter((x) => x !== s)
                        : [...selected, s],
                    )
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <div
                    className={`h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      isSelected ? "bg-primary border-primary" : "border-gray-400"
                    }`}
                  >
                    {isSelected && (
                      <svg
                        className="h-3 w-3 text-primary-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  {s}
                </button>
              );
            })}
          </div>

          {/* scroll-down zone */}
          <div
            className="flex items-center justify-center h-6 cursor-pointer select-none text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            onMouseEnter={() => startScroll("down")}
            onMouseLeave={stopScroll}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </div>
      )}
    </div>
  );
};

export const CropMultiSelect = ({
  dbCrops,
  crops,
  selected,
  onChange,
}: {
  dbCrops: { _id?: string; name: string; aliases?: string[] }[];
  crops: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) => {
  const [open, setOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrollInterval = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const startScroll = (direction: "up" | "down") => {
    stopScroll();
    scrollInterval.current = setInterval(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop += direction === "down" ? 6 : -6;
      }
    }, 16);
  };

  const stopScroll = () => {
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }
  };

  const cropList: { name: string; aliases?: string[] }[] =
    dbCrops.length > 0 ? dbCrops : crops.map((c) => ({ name: c }));

  const getLabel = (value: string) => {
    if (value === "__NOT_SET__") return "Not Set (Legacy)";
    return value;
  };

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((x) => x !== value) : [...selected, value]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="truncate text-left">
          {selected.length === 0
            ? "All Crops"
            : selected.length === 1
            ? getLabel(selected[0])
            : `${selected.length} crops selected`}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
        ) : (
          <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-md border border-input bg-popover shadow-md">
          {/* header */}
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-xs font-medium text-muted-foreground">
              {selected.length} selected
            </span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          </div>

          {/* scroll-up zone */}
          <div
            className="flex items-center justify-center h-6 cursor-pointer select-none text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            onMouseEnter={() => startScroll("up")}
            onMouseLeave={stopScroll}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </div>

          {/* list */}
          <div ref={scrollRef} className="max-h-48 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {/* Not Set option */}
            <button
              type="button"
              onClick={() => toggle("__NOT_SET__")}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
            >
              <div
                className={`h-4 w-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  selected.includes("__NOT_SET__") ? "bg-primary border-primary" : "border-gray-400 bg-white"
                }`}
              >
                {selected.includes("__NOT_SET__") && (
                  <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
              <span className="text-yellow-700 dark:text-yellow-400 font-medium">Not Set (Legacy)</span>
            </button>

            {cropList.map((crop) => {
              const isSelected = selected.includes(crop.name);
              return (
                <button
                  key={crop.name}
                  type="button"
                  onClick={() => toggle(crop.name)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <div
                    className={`h-4 w-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      isSelected ? "bg-primary border-primary" : "border-gray-400 bg-white"
                    }`}
                  >
                    {isSelected && (
                      <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="capitalize">{crop.name}</span>
                  {crop.aliases && crop.aliases.length > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">
                      +{crop.aliases.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* scroll-down zone */}
          <div
            className="flex items-center justify-center h-6 cursor-pointer select-none text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            onMouseEnter={() => startScroll("down")}
            onMouseLeave={stopScroll}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </div>
      )}
    </div>
  );
};

interface AdvanceFilterDialogProps {
  /** Committed (applied) filter values — seeds draft state when dialog opens. */
  appliedFilter: AdvanceFilterValues;
  /** Called when the user clicks Apply. Receives the full updated values. */
  onApply: (values: AdvanceFilterValues) => void;
  onReset: () => void;
  normalizedStates: string[];
  crops: string[];
  activeFiltersCount: number;
  isForQA: boolean;
  setIsSidebarOpen?: (value: boolean) => void;
  /** Subset of filter fields to render (default: all fields). */
  visibleFields?: CommonFilterKey[];
  /** Override review level options shown in the dropdown. */
  reviewLevelOptions?: string[];
  /** Whether Source dropdown is disabled (default: true). */
  sourceDisabled?: boolean;
  /** Trigger button style: "card" (default) or "compact" pill. */
  triggerVariant?: "card" | "compact";
}

const DEFAULT_FILTER_VALUES: AdvanceFilterValues = {
  status: "all",
  source: "all",
  state: "all",
  states: [],
  answersCount: [0, 100],
  dateRange: "all",
  crop: "all",
  normalised_crop: "all",
  normalisedCrops: [],
  priority: "all",
  user: "all",
  domain: "all",
  review_level: "all",
  endTime: undefined,
  startTime: undefined,
  closedAtStart: undefined,
  closedAtEnd: undefined,
  consecutiveApprovals: "all",
  autoAllocateFilter: "all",
  hiddenQuestions: false,
  duplicateQuestions: false,
};

export const AdvanceFilterDialog: React.FC<AdvanceFilterDialogProps> = ({
  appliedFilter,
  onApply,
  normalizedStates,
  crops,
  activeFiltersCount,
  onReset,
  isForQA,
  setIsSidebarOpen = () => {},
  visibleFields,
  reviewLevelOptions,
  sourceDisabled = true,
  triggerVariant = "card",
}) => {
  const [open, setOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState<AdvanceFilterValues>(appliedFilter);

  // Re-seed draft from committed values each time the dialog opens.
  useEffect(() => {
    if (open) setDraftFilter(appliedFilter);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFieldChange = (key: string, value: any) => {
    setDraftFilter((prev) => ({ ...prev, [key]: value }));
  };
  // useGetAllUsers and useGetAllCrops moved into CommonFilterFields
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setIsSidebarOpen(false);
      }}
    >
      <DialogTrigger asChild>
        {triggerVariant === "compact" ? (
          /* Compact pill button — used by QaHeader */
          <button className="flex items-center gap-1.5 px-2 sm:px-3 py-1 h-8 sm:h-9 bg-background hover:bg-accent hover:text-accent-foreground border border-input rounded-md transition-all shadow-sm shrink-0">
            <span className="text-xs sm:text-sm font-normal text-gray-900 dark:text-white whitespace-nowrap">
              Preferences
            </span>
            {activeFiltersCount > 0 && (
              <Badge
                variant="destructive"
                className="bg-red-500 h-4 px-1.5 min-w-4 rounded-full flex items-center justify-center text-[10px]"
              >
                {activeFiltersCount}
              </Badge>
            )}
          </button>
        ) : (
          /* Default card button — used by QuestionsFilters sidebar */
          <button className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-purple-50 dark:hover:bg-purple-500/5 border border-gray-200 dark:border-gray-800 hover:border-purple-500/50 rounded-xl group transition-all shadow-sm dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center text-purple-500 dark:text-purple-400">
                <Settings size={20} />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    Preferences
                  </p>

                  {activeFiltersCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="bg-red-500 h-4 px-2 rounded-full flex items-center justify-center text-xs"
                    >
                      {activeFiltersCount}
                    </Badge>
                  )}
                </div>

                <p className="text-[11px] text-gray-500">Advanced Filters</p>
              </div>
            </div>
          </button>
        )}
      </DialogTrigger>

      <ScrollArea>
        <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[90vh] overflow-y-auto mr-10">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              Advanced Filters
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Refine your search with multiple filter options
            </p>
            {isForQA && (
              <div className="flex items-start gap-2 mt-1 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                <span>
                  Filters will not apply if you have unanswered questions in
                  your preferences. Complete those questions before applying
                  filters.
                </span>
              </div>
            )}
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* ── CommonFilterFields replaces the duplicated filter dropdowns below ── */}
            <CommonFilterFields
              values={draftFilter}
              onChange={handleFieldChange}
              visibleFields={
                visibleFields ??
                ((isForQA
                  ? [
                      "source",
                      "states",
                      "reviewLevel",
                      "cropType",
                      "domain",
                      "priority",
                      "dateRange",
                      "closedDate",
                      "consecutiveApprovals",
                      "autoAllocate",
                      "hiddenQuestions",
                    ]
                  : [
                      "status",
                      "source",
                      "states",
                      "reviewLevel",
                      "cropType",
                      "user",
                      "domain",
                      "priority",
                      "dateRange",
                      "closedDate",
                      "consecutiveApprovals",
                      "autoAllocate",
                      "hiddenQuestions",
                      "isOnHold",
                    ]) as CommonFilterKey[])
              }
              sourceDisabled={sourceDisabled}
              reviewLevelOptions={reviewLevelOptions}
              normalizedStates={normalizedStates}
              crops={crops}
            />

            {/* ── Number of Answers Slider (kept inline — not shared) ── */}
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Number of Answers
                </Label>
                <Badge variant="secondary" className="text-xs">
                  {draftFilter.answersCount[0]} -{" "}
                  {draftFilter.answersCount[1]}
                </Badge>
              </div>
              <div className="px-2">
                <Slider
                  value={draftFilter.answersCount}
                  onValueChange={(value) =>
                    handleFieldChange("answersCount", value)
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


            {/* Active Filters Badges */}
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
                    {Object.entries(draftFilter).map(([key, value]) => {
                      if (
                        key == "startTime" ||
                        key == "endTime" ||
                        key === "closedAtStart" ||
                        key === "closedAtEnd" ||
                        key === "state" || // replaced by states
                        key === "normalised_crop" || // replaced by normalisedCrops
                        value === "all" ||
                        value === undefined ||
                        value === null ||
                        (typeof value === "boolean" && value === false) ||
                        (Array.isArray(value) && value.length === 0) ||
                        (Array.isArray(value) &&
                          value[0] === 0 &&
                          value[1] === 100)
                      )
                        return null;

                      const label =
                        key === "hiddenQuestions"
                          ? "Show passed questions"
                          : key === "duplicateQuestions"
                            ? "Show duplicate questions"
                            : key === "isOnHold"
                            ? "Show holded questions"
                            : key === "states"
                              ? "state"
                              : key === "normalisedCrops"
                                ? "crop"
                                : key;

                      const displayValue =
                        (key === "states" || key === "normalisedCrops") && Array.isArray(value)
                          ? (value as string[]).join(", ")
                          : Array.isArray(value)
                            ? `${value[0]}-${value[1]}`
                            : typeof value === "boolean"
                              ? "Yes"
                              : (value as string);

                      return (
                        <Badge
                          key={key}
                          variant="secondary"
                          className="text-xs flex items-center gap-1"
                        >
                          {label}: {displayValue}
                          <XCircle
                            className="h-3 w-3 ml-1 cursor-pointer"
                            onClick={() =>
                              handleFieldChange(
                                key,
                                key === "states" || key === "normalisedCrops"
                                  ? []
                                  : Array.isArray(value)
                                    ? [0, 100]
                                    : key === "hiddenQuestions" ||
                                        key === "duplicateQuestions"
                                      ? false
                                      : "all",
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

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDraftFilter(DEFAULT_FILTER_VALUES);
                onReset();
              }}
              className="w-full sm:w-auto"
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>

            <div className="flex gap-2 w-full sm:w-auto">
              <DialogClose asChild>
                <Button variant="secondary" className="flex-1 sm:flex-none">
                  Cancel
                </Button>
              </DialogClose>

              <DialogClose asChild>
                <Button
                  onClick={() => onApply(draftFilter)}
                  className="flex-1 sm:flex-none"
                >
                  Apply Preferences
                </Button>
              </DialogClose>
            </div>
          </DialogFooter>
        </DialogContent>
      </ScrollArea>
    </Dialog>
  );
};
