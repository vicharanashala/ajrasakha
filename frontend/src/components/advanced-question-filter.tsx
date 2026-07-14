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
import { Input } from "@/components/atoms/input";
import { StateMultiSelect } from "./atoms/StateMultiSelect";
import { CropMultiSelect } from "./atoms/CropMultiSelect";
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
  XCircle,
  Layers,
  Send,
  BadgeCheck,
  Hand,
  Users,
  Settings,
  Radio,
  CircleSlash,
  Copy,
  AlertCircle,
  Zap,
} from "lucide-react";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./atoms/tooltip";
import type { IMyPreference } from "@/types";
import { CROPS, STATES, DOMAINS, Review_Level } from "@/components/MetaData";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { useGetStates } from "@/hooks/api/location/useLocations";
export { STATES, CROPS, DOMAINS };
import { DateRangeFilter } from "./DateRangeFilter";
import { TopRightBadge } from "./NewBadge";

export type QuestionFilterStatus = "all" | "open" | "in-review" | "closed" | "pae_submitted" | "draft" | "hold" | "dynamic";
export type QuestionDateRangeFilter =
  | "all"
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type QuestionSourceFilter = "all" | "AJRASAKHA" | "AGRI_EXPERT" | "WHATSAPP" | "OUTREACH";
// New Type
export type QuestionPriorityFilter = "all" | "high" | "low" | "medium" | "critical";
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
  autoAllocateModeratorFilter?: string;
  closedInTwoHrs?: boolean;
  hiddenQuestions?: boolean;
  duplicateQuestions?: boolean;
  isOnHold?: boolean;
  unallocatedQuestions?: boolean;
  pae_review?: boolean;
  is_non_agri?: boolean;
  is_testing?: boolean;
  /** When set, filters to questions whose moderatorId matches this ID (dedicated tab). */
  moderatorId?: string;
};


// Inline multi-select for State/Region with hover-to-scroll zones

interface AdvanceFilterDialogProps {
  advanceFilter: AdvanceFilterValues;
  setAdvanceFilterValues: (values: any) => void;
  handleDialogChange: (key: string, value: any) => void;
  handleApplyFilters: (myPreference?: IMyPreference) => void;
  crops: string[];
  activeFiltersCount: number;
  onReset: () => void;
  isForQA: boolean;
  setIsSidebarOpen: (value: boolean) => void;
}

type SearchableFilterSelectOption = {
  value: string;
  searchText: string;
  children: React.ReactNode;
};

const SearchableFilterSelect = ({
  value,
  onValueChange,
  options,
  disabled,
  triggerClassName = "bg-background w-full",
}: {
  value?: string;
  onValueChange: (value: string) => void;
  options: SearchableFilterSelectOption[];
  disabled?: boolean;
  triggerClassName?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleOptions = normalizedSearchQuery
    ? options.filter((option) =>
        option.searchText.toLowerCase().includes(normalizedSearchQuery),
      )
    : options;

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearchQuery("");
        }
      }}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        headerSlot={
          <div className="p-1">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              placeholder="Search"
              className="h-8"
              autoFocus
            />
          </div>
        }
      >
        {visibleOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.children}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const AdvanceFilterDialog: React.FC<AdvanceFilterDialogProps> = ({
  advanceFilter,
  setAdvanceFilterValues,
  handleDialogChange,
  handleApplyFilters,
  crops,
  activeFiltersCount,
  onReset,
  isForQA,
  setIsSidebarOpen,
}) => {
  const [open, setOpen] = useState(false);
  const { data: userNameReponse, isLoading } = useGetAllUsers();
  const { data: cropsData } = useGetAllCrops({ type: "crop", limit: 500 });
  const dbCrops = cropsData?.crops || [];
  const { data: statesResponse = [] } = useGetStates();
  const stateOptions = statesResponse.map((s) => s.stateNameEnglish);

  const users = (userNameReponse?.users || []).sort((a, b) =>
    a.userName.localeCompare(b.userName),
  );

  const statusOptions: SearchableFilterSelectOption[] = [
    {
      value: "all",
      searchText: "All Statuses",
      children: (
        <div className="flex items-center gap-2 ">
          <Eye className="w-4 h-4 text-primary" />
          <span>All Statuses</span>
          <TopRightBadge label="new" />
        </div>
      ),
    },
    {
      value: "open",
      searchText: "Open",
      children: (
        <div className="flex items-center gap-2">
          <Circle className="w-4 h-4 text-green-500 fill-green-500/20" />
          <span>Open</span>
        </div>
      ),
    },
    {
      value: "in-review",
      searchText: "In Review",
      children: (
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          <span>In Review</span>
        </div>
      ),
    },
    {
      value: "delayed",
      searchText: "Delayed",
      children: (
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
          <span>Delayed</span>
        </div>
      ),
    },
    {
      value: "re-routed",
      searchText: "Re Routed",
      children: (
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-green-500" />
          <span>Re Routed</span>
        </div>
      ),
    },
    {
      value: "pae_submitted",
      searchText: "PAE Submitted",
      children: (
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600" />
          <span>PAE Submitted</span>
        </div>
      ),
    },
    {
      value: "closed",
      searchText: "Closed",
      children: (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-red-500" />
          <span>Closed</span>
        </div>
      ),
    },
    {
      value: "pass",
      searchText: "Passed",
      children: (
        <div className="flex items-center gap-2">
          <CircleSlash className="w-4 h-4 text-gray-500" />
          <span>Passed</span>
        </div>
      ),
    },
    {
      value: "duplicate",
      searchText: "Duplicate",
      children: (
        <div className="flex items-center gap-2">
          <Copy className="w-4 h-4 text-orange-500" />
          <span>Duplicate</span>
        </div>
      ),
    },
    {
      value: "draft",
      searchText: "Draft",
      children: (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <span>Draft</span>
        </div>
      ),
    },
    {
      value: "hold",
      searchText: "Hold",
      children: (
        <div className="flex items-center gap-2">
          <Hand className="w-4 h-4 text-orange-600" />
          <span>Hold</span>
        </div>
      ),
    },
    {
      value: "non_agri",
      searchText: "Non Agri",
      children: (
        <div className="flex items-center gap-2">
          <CircleSlash className="w-4 h-4 text-slate-500" />
          <span>Non Agri</span>
        </div>
      ),
    },
    {
      value: "dynamic",
      searchText: "Dynamic",
      children: (
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          <span>Dynamic</span>
        </div>
      ),
    },
  ];

  const reviewLevelOptions: SearchableFilterSelectOption[] = [
    { value: "all", searchText: "All Levels", children: "All Levels" },
    ...Review_Level.map((level) => ({
      value: level,
      searchText: level === "Level 0" ? "Author Level 0" : level,
      children: level === "Level 0" ? "Author" : level,
    })),
  ];

  const domainOptions: SearchableFilterSelectOption[] = [
    { value: "all", searchText: "All Domains", children: "All Domains" },
    ...DOMAINS.map((domain) => ({
      value: domain,
      searchText: domain,
      children: domain,
    })),
  ];

  const userOptions: SearchableFilterSelectOption[] = [
    { value: "all", searchText: "All Users", children: "All Users" },
    ...users.map((user) => ({
      value: user._id,
      searchText: user.userName,
      children: user.userName,
    })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setIsSidebarOpen(false);
      }}
    >
      <DialogTrigger asChild>
        <button className="  w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-purple-50 dark:hover:bg-purple-500/5 border border-gray-200 dark:border-gray-800 hover:border-purple-500/50 rounded-xl group transition-all shadow-sm dark:shadow-none relative">
          <div className="flex items-center gap-3 w-full ">
            <TopRightBadge label="new" left={0} />
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center text-purple-500 dark:text-purple-400">
              <Settings size={20} />
            </div>
            <div className="text-left ">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 ">
              {!isForQA && (
                <div className="space-y-2 min-w-0 ">

                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4 text-primary" />
                    Question Status
                  </Label>
                  <SearchableFilterSelect
                    value={advanceFilter.status}
                    onValueChange={(v) => {
                      handleDialogChange("status", v);
                    }}
                    options={statusOptions}
                    triggerClassName="bg-background w-full relative"
                  />
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

                    <SelectItem value="OUTREACH">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-primary" />
                        <span>Outreach</span>
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
                  states={stateOptions}
                  selected={advanceFilter.states || []}
                  onChange={(next) => handleDialogChange("states", next)}
                  searchable
                />
              </div>
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Layers className="h-4 w-4 text-primary" />
                  Review Level
                </Label>
                <SearchableFilterSelect
                  value={advanceFilter.review_level}
                  onValueChange={(v) => handleDialogChange("review_level", v)}
                  options={reviewLevelOptions}
                />
              </div>
            </div>

            <Separator />

            {/* Domain & Users */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Sprout className="h-4 w-4 text-primary" />
                  Crop Type
                </Label>
                <CropMultiSelect
                  dbCrops={dbCrops}
                  crops={crops}
                  selected={advanceFilter.normalisedCrops || []}
                  onChange={(next) => handleDialogChange("normalisedCrops", next)}
                  searchable
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

                {isLoading ? (
                  <Select value={advanceFilter.user} disabled>
                    <SelectTrigger className="bg-background w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="flex items-center justify-center p-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="ml-2 text-sm text-muted-foreground">
                          Loading users...
                        </span>
                      </div>
                    </SelectContent>
                  </Select>
                ) : (
                  <SearchableFilterSelect
                    value={advanceFilter.user}
                    onValueChange={(v) => handleDialogChange("user", v)}
                    options={userOptions}
                  />
                )}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">

                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Globe className="h-4 w-4 text-primary" />
                  Domain
                </Label>
                <SearchableFilterSelect
                  value={advanceFilter.domain}
                  onValueChange={(v) => handleDialogChange("domain", v)}
                  options={domainOptions}
                />
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
                        <ArrowUp className="w-4 h-4 text-orange-500" />
                        <span>High</span>
                      </div>
                    </SelectItem>

                    <SelectItem value="critical">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span>Critical</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0 ">
                <Label className="relative flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="h-4 w-4 text-primary" />
                  Auto Allocate Moderator
                </Label>
                <Select
                  value={advanceFilter.autoAllocateModeratorFilter}
                  onValueChange={(v) =>
                    handleDialogChange("autoAllocateModeratorFilter", v)
                  }
                >
                  <SelectTrigger className="bg-background w-full">
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

                {/* show unallocated questions */}
                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={advanceFilter.unallocatedQuestions ?? false}
                    onCheckedChange={(checked) =>
                      handleDialogChange("unallocatedQuestions", checked === true)
                    }
                    className="h-3.5 w-3.5 border-primary"
                  />
                  <span className="text-sm">Show un-allocated questions</span>
                </label>

                {/* show testing questions */}
                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={advanceFilter.is_testing ?? false}
                    onCheckedChange={(checked) =>
                      handleDialogChange("is_testing", checked === true)
                    }
                    className="h-3.5 w-3.5 border-primary"
                  />
                  <span className="text-sm">Show testing questions</span>
                </label>

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
                              : key === "unallocatedQuestions"
                                ? "Show un-allocated questions"
                                : key === "is_testing"
                                ? "Show testing questions"
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
                                      key === "duplicateQuestions" ||
                                      key === "closedInTwoHrs" ||
                                      key === "isOnHold" ||
                                      key === "unallocatedQuestions" ||
                                      key === "is_testing"
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
                  autoAllocateModeratorFilter: "all",
                  unallocatedQuestions: false,
                  is_testing: false,
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
