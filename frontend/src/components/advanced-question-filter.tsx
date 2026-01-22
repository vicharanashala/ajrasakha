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
  Send
} from "lucide-react";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";
import type { IMyPreference } from "@/types";
import { CROPS, STATES, DOMAINS, Review_Level } from "@/components/MetaData";
import { Popover, PopoverContent, PopoverTrigger } from "./atoms/popover";
import { format } from "date-fns";
export { STATES, CROPS, DOMAINS };
import type { DateRange } from "react-day-picker";
import { Calendar } from "./atoms/calendar";
import { DateRangeFilter } from "./DateRangeFilter";

export type QuestionFilterStatus = "all" | "open" | "in-review" | "closed";
export type QuestionDateRangeFilter =
  | "all"
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type QuestionSourceFilter = "all" | "AJRASAKHA" | "AGRI_EXPERT";
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
  answersCount: [number, number];
  dateRange: QuestionDateRangeFilter;
  user: string;
  domain: string;
  crop: string;
  priority: QuestionPriorityFilter;
  startTime?: Date | undefined | null; // Use a specific name like startTime/endTime
  endTime?: Date | undefined | null;
  review_level?: ReviewLevel;
  closedAtEnd?: Date | undefined | null,
  closedAtStart?: Date | undefined | null
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
}) => {
  const { data: userNameReponse, isLoading } = useGetAllUsers();

  const users = (userNameReponse?.users || []).sort((a, b) =>
    a.userName.localeCompare(b.userName)
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="flex-1 min-w-[150px] flex items-center justify-center gap-2"
        >
          <Filter className="h-5 w-5 text-primary" />
          Preferences
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

      <ScrollArea>
        <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
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
                    <SelectTrigger className="bg-background w-full w-full">
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

              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Source
                </Label>
                <Select
                  value={advanceFilter.source}
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
                </Label>
                <Select
                  value={advanceFilter.state}
                  onValueChange={(v) => handleDialogChange("state", v)}
                >
                  <SelectTrigger className="bg-background w-full">
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
                {/* <Label className="flex items-center gap-2 text-sm font-semibold">
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
                </Select> */}
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Sprout className="h-4 w-4 text-primary" />
                  Crop Type
                </Label>
                <Select
                  value={advanceFilter.crop}
                  onValueChange={(v) => handleDialogChange("crop", v)}
                >
                  <SelectTrigger className="bg-background w-full">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
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
                        value === "all" ||
                        key === "closedAtStart" ||
                        key === "closedAtEnd" ||
                        (Array.isArray(value) &&
                          value[0] === 0 &&
                          value[1] === 100)
                      )
                        return null;
                      return (
                        <Badge
                          key={key}
                          variant="secondary"
                          className="text-xs flex items-center gap-1"
                        >
                          {key}:{" "}
                          {Array.isArray(value)
                            ? `${value[0]}-${value[1]}`
                            : (value as String)}
                          <XCircle
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

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
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
                  priority: "all",
                  user: "all",
                  domain: "all",
                  review_level: "all",
                  
                  endTime: undefined,
                  startTime:undefined,
                  closedAtStart:undefined,
                  closedAtEnd:undefined
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
