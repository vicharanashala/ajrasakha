import React, { useState } from "react";
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";
import { Separator } from "@/components/atoms/separator";
import { Badge } from "@/components/atoms/badge";
import { Slider } from "@/components/atoms/slider";
import { Checkbox } from "@/components/atoms/checkbox";
import {
  Filter,
  FileText,
  MessageSquare,
  MapPin,
  Flag,
  RefreshCcw,
  Sprout,
  UserIcon,
  Globe,
  Loader2,
  Info,
  AlertTriangle,
  Circle,
  Clock,
  CheckCircle2,
  Eye,
  Bot,
  UserRound,
  ArrowUp,
  ArrowDown,
  ListFilter,
  CalendarIcon,
  ChevronUp,
  ChevronDown,
  XCircle,
  Layers,
  Send,
  BadgeCheck,
  Hand,
  Users,
  Settings,
} from "lucide-react";
import { Plus } from "lucide-react";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./atoms/tooltip";
import type { IMyPreference } from "@/types";
import { CROPS, STATES, DOMAINS, Review_Level } from "@/components/MetaData";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { Popover, PopoverContent, PopoverTrigger } from "./atoms/popover";
import { format } from "date-fns";
export { STATES, CROPS, DOMAINS };
import type { DateRange } from "react-day-picker";
import { Calendar } from "./atoms/calendar";
import { DateRangeFilter } from "./DateRangeFilter";
import { TopRightBadge } from "./NewBadge";

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
  closedInTwoHrs?: boolean;
  hiddenQuestions?: boolean;
  duplicateQuestions?: boolean;
  isOnHold?: boolean;
};

// Define the props for your new component
interface DateRangeFilterProps {
  // advanceFilter prop now includes startTime and endTime
  advanceFilter: Partial<AdvanceFilterValues>;
  // The handler to update the parent state
  handleDialogChange: (key: string, value: any) => void;
  className?: string;
}

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

  const cropList = dbCrops.length > 0 ? dbCrops : crops.map((c) => ({ name: c }));

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
  advanceFilter: AdvanceFilterValues;
  setAdvanceFilterValues: (values: any) => void;
  handleDialogChange: (key: string, value: any) => void;
  handleApplyFilters: (myPreference?: IMyPreference) => void;
  normalizedStates: string[];
  crops: string[];
  activeFiltersCount: number;
  onReset: () => void;
  isForQA: boolean;
  setIsSidebarOpen: (value: boolean) => void;
}

export const AdvanceFilterDialog: React.FC<AdvanceFilterDialogProps> = ({
  advanceFilter,
  setAdvanceFilterValues,
  handleDialogChange,
  handleApplyFilters,
  normalizedStates,
  crops,
  activeFiltersCount,
  onReset,
  isForQA,
  setIsSidebarOpen,
}) => {
  const [open, setOpen] = useState(false);
  const { data: userNameReponse, isLoading } = useGetAllUsers();
  const { data: cropsData } = useGetAllCrops();
  const dbCrops = cropsData?.crops || [];

  const users = (userNameReponse?.users || []).sort((a, b) =>
    a.userName.localeCompare(b.userName),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setIsSidebarOpen(false);
      }}
    >
      <DialogTrigger asChild>
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
            {/* Question Status & Source */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!isForQA && (
                <div className="space-y-2 min-w-0 ">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4 text-primary" />
                    Question Status
                  </Label>
                  <Select
                    value={advanceFilter.status}
                    onValueChange={(v) => handleDialogChange("status", v)}
                  >
                    <SelectTrigger className="bg-background w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-primary" />
                          <span>All Statuses</span>
                        </div>
                      </SelectItem>

                      <SelectItem value="open">
                        <div className="flex items-center gap-2">
                          <Circle className="w-4 h-4 text-green-500 fill-green-500/20" />
                          <span>Open</span>
                        </div>
                      </SelectItem>

                      <SelectItem value="in-review">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-500" />
                          <span>In Review</span>
                        </div>
                      </SelectItem>

                      <SelectItem value="delayed">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                          <span>Delayed</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="re-routed">
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4 text-green-500" />
                          <span>Re Routed</span>
                        </div>
                      </SelectItem>

                      <SelectItem value="closed">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-red-500" />
                          <span>Closed</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2 min-w-0 cursor-not-allowed">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Source
                </Label>
                <Select
                  value={advanceFilter.source}
                  disabled
                  onValueChange={(v) => handleDialogChange("source", v)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="Select Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-primary" />
                        <span>All Sources</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="AJRASAKHA">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-primary" />
                        <span>Ajrasakha </span>
                      </div>
                    </SelectItem>

                    <SelectItem value="AGRI_EXPERT">
                      <div className="flex items-center gap-2">
                        <UserRound className="w-4 h-4 text-primary" />
                        <span>Agri Expert</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="WHATSAPP">
                      <div className="flex items-center gap-2">
                        <UserRound className="w-4 h-4 text-primary" />
                        <span>Whatsapp</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Location & Crop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-primary" />
                  State/Region
                  {advanceFilter.states && advanceFilter.states.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      {advanceFilter.states.length}
                    </Badge>
                  )}
                </Label>
                <StateMultiSelect
                  states={normalizedStates}
                  selected={advanceFilter.states || []}
                  onChange={(next) => handleDialogChange("states", next)}
                />
              </div>
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Layers className="h-4 w-4 text-primary" />
                  Review Level
                </Label>
                <Select
                  value={advanceFilter.review_level}
                  onValueChange={(v) => handleDialogChange("review_level", v)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    {Review_Level.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Domain & Users */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Sprout className="h-4 w-4 text-primary" />
                  Crop Type
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-sm">
                      <p>
                        Filter by the standardized crop name. You can view a
                        crop's alternative names by hovering over the "+" icon
                        next to it. Use "Not Set" to find older questions
                        without a normalized crop.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Select
                  value={advanceFilter.normalised_crop}
                  onValueChange={(v) =>
                    handleDialogChange("normalised_crop", v)
                  }
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Crops</SelectItem>
                    <SelectItem value="__NOT_SET__">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        <span className="text-yellow-700 dark:text-yellow-400 font-medium">
                          Not Set (Legacy)
                        </span>
                      </div>
                    </SelectItem>
                    {dbCrops.length > 0
                      ? dbCrops.map((crop) => (
                          <SelectItem
                            key={crop._id || crop.name}
                            value={crop.name}
                          >
                            {crop.aliases && crop.aliases.length > 0 ? (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-2 cursor-default">
                                      <span className="capitalize">
                                        {crop.name}
                                      </span>
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">
                                        +{crop.aliases.length}
                                      </span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="right"
                                    className="text-xs"
                                  >
                                    <p className="font-semibold mb-0.5">
                                      Also known as:
                                    </p>
                                    {crop.aliases.map((a) => (
                                      <p
                                        key={a}
                                        className="capitalize text-muted-foreground"
                                      >
                                        {a}
                                      </p>
                                    ))}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="capitalize">{crop.name}</span>
                            )}
                          </SelectItem>
                        ))
                      : crops.map((crop) => (
                          <SelectItem key={crop} value={crop}>
                            {crop}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
                <CropMultiSelect
                  dbCrops={dbCrops}
                  crops={crops}
                  selected={advanceFilter.normalisedCrops || []}
                  onChange={(next) => handleDialogChange("normalisedCrops", next)}
                />
              </div>

              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <UserIcon className="h-4 w-4 text-primary" />
                  User
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-sm">
                      <p>
                        This option allows filtering questions that have been
                        submitted at least once by the selected user.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </Label>

                <Select
                  value={advanceFilter.user}
                  onValueChange={(v) => handleDialogChange("user", v)}
                  disabled={isLoading}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {isLoading ? (
                      <div className="flex items-center justify-center p-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="ml-2 text-sm text-muted-foreground">
                          Loading users...
                        </span>
                      </div>
                    ) : (
                      <>
                        <SelectItem value="all">All Users</SelectItem>
                        {users?.map((u) => (
                          <SelectItem key={u._id} value={u._id}>
                            {u.userName}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                {/* <Label className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  Date Range
                </Label>
                <Select
                  value={advanceFilter.dateRange}
                  onValueChange={(v) => handleDialogChange("dateRange", v)}
                >
                  <SelectTrigger className="bg-background w-full">
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
                </Select> */}

                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Globe className="h-4 w-4 text-primary" />
                  Domain
                </Label>
                <Select
                  value={advanceFilter.domain}
                  onValueChange={(v) => handleDialogChange("domain", v)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Domains</SelectItem>
                    {DOMAINS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Flag className="h-4 w-4 text-primary" />
                  Priority
                </Label>
                <Select
                  value={advanceFilter.priority}
                  onValueChange={(v) => handleDialogChange("priority", v)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="Select Priority" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <ListFilter className="w-4 h-4 text-gray-500" />
                        <span>All</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <ArrowDown className="w-4 h-4 text-green-500" />
                        <span>Low</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        <span>Medium</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <ArrowUp className="w-4 h-4 text-red-500" />
                        <span>High</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />
            <div className="space-y-2 mb-4">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-primary" />
                Closed within 2 Hours
              </Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  className="w-3.5 h-3.5 border-primary"
                  checked={advanceFilter.closedInTwoHrs ?? false}
                  onCheckedChange={(checked) =>
                    handleDialogChange("closedInTwoHrs", checked === true)
                  }
                />
                <span className="text-sm text-muted-foreground">
                  Show questions closed within 2 hours
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              <div className="space-y-2 min-w-0">
                <DateRangeFilter
                  customName={"CreatedAt Date Range"}
                  advanceFilter={advanceFilter}
                  handleDialogChange={handleDialogChange}
                />
              </div>
              <div className="space-y-2 min-w-0">
                <DateRangeFilter
                  customName={"ClosedAt Date Range"}
                  advanceFilter={advanceFilter}
                  handleDialogChange={handleDialogChange}
                  type={"closedDateRange"}
                />
              </div>
            </div>

            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0 ">
                <Label className="relative flex items-center gap-2 text-sm font-semibold">
                  <BadgeCheck className="h-4 w-4 text-primary" />
                  Consecutive Approvals
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-sm">
                      <p>
                        Filter questions based on the number of consecutive
                        approvals received by their latest answer.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Select
                  value={advanceFilter.consecutiveApprovals}
                  onValueChange={(v) =>
                    handleDialogChange("consecutiveApprovals", v)
                  }
                >
                  <SelectTrigger className="bg-background w-full w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="w-4 h-4 text-green-500 fill-green-500/20" />
                        <span>All</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="1">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="w-4 h-4 text-green-500 fill-green-500/20" />
                        <span>1</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="2">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="w-4 h-4 text-green-500 fill-green-500/20" />
                        <span>2</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="3">
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="w-4 h-4 text-green-500 fill-green-500/20" />
                        <span>3</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 min-w-0 ">
                <Label className="relative flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-primary" />
                  Auto Allocate Experts
                </Label>
                <Select
                  value={advanceFilter.autoAllocateFilter}
                  onValueChange={(v) =>
                    handleDialogChange("autoAllocateFilter", v)
                  }
                >
                  <SelectTrigger className="bg-background w-full w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-green-500 fill-green-500/20" />
                        <span>All</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="on">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-green-500 fill-green-500/20" />
                        <span>ON</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="off">
                      <div className="flex items-center gap-2">
                        <Hand className="w-4 h-4 text-red-500 fill-green-500/20" />
                        <span>OFF</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Number of Answers Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4 text-primary" />
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
            {/* Hidden and Duplicate Questions */}
            <div className="space-y-4">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Question Visibility
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-background p-4">
                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={advanceFilter.hiddenQuestions ?? false}
                    onCheckedChange={(checked) =>
                      handleDialogChange("hiddenQuestions", checked === true)
                    }
                    className="h-3.5 w-3.5 border-primary"
                  />
                  <span className="text-sm">Show passed questions</span>
                </label>
                {/* show holded questions */}
                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={advanceFilter.isOnHold ?? false}
                    onCheckedChange={(checked) =>
                      handleDialogChange("isOnHold", checked === true)
                    }
                    className="h-3.5 w-3.5 border-primary"
                  />
                  <span className="text-sm">Show questions on Hold</span>
                </label>

                {/* <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={advanceFilter.duplicateQuestions ?? false}
                    onChange={(event) =>
                      handleDialogChange(
                        "duplicateQuestions",
                        event.target.checked,
                      )
                    }
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">Show duplicate questions</span>
                </label> */}
              </div>
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
                    {Object.entries(advanceFilter).map(([key, value]) => {
                      if (
                        key == "startTime" ||
                        key == "endTime" ||
                        key === "closedAtStart" ||
                        key === "closedAtEnd" ||
                        (key === "closedInTwoHrs" && value === false) ||
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
                                : key === "closedInTwoHrs"
                                ? "Question closed in 2 hrs"
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
                              handleDialogChange(
                                key,
                                key === "states" || key === "normalisedCrops"
                                  ? []
                                  : Array.isArray(value)
                                    ? [0, 100]
                                    : key === "hiddenQuestions" ||
                                      key === "duplicateQuestions"||
                                      key === "closedInTwoHrs"||
                                      key === "isOnHold"
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
                setAdvanceFilterValues({
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
                  closedInTwoHrs: false,

                  endTime: undefined,
                  startTime: undefined,
                  closedAtStart: undefined,
                  closedAtEnd: undefined,
                  consecutiveApprovals: "all",
                  autoAllocateFilter: "all",
                });
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
                  onClick={() => handleApplyFilters()}
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
