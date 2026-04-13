import React from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select";
import { Label } from "@/components/atoms/label";
import { Badge } from "@/components/atoms/badge";
import { Checkbox } from "@/components/atoms/checkbox";
import {
  FileText,
  MessageSquare,
  MapPin,
  Flag,
  Globe,
  Layers,
  Loader2,
  Info,
  AlertTriangle,
  Eye,
  BadgeCheck,
  Users,
  Sprout,
  UserIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./atoms/tooltip";
import {
  CROPS, STATES, DOMAINS, Review_Level, SEASONS,
  STATUS_OPTIONS, SOURCE_OPTIONS, PRIORITY_OPTIONS,
  AUTO_ALLOCATE_OPTIONS, CONSECUTIVE_APPROVAL_OPTIONS,
} from "@/components/MetaData";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { StateMultiSelect, CropMultiSelect } from "./advanced-question-filter";
import { DateRangeFilter } from "./DateRangeFilter";
import type { AdvanceFilterValues } from "./advanced-question-filter";

export type CommonFilterKey =
  | "status"
  | "source"
  | "states"
  | "reviewLevel"
  | "cropType"
  | "user"
  | "domain"
  | "priority"
  | "dateRange"
  | "closedDate"
  | "consecutiveApprovals"
  | "autoAllocate"
  | "hiddenQuestions"
  | "duplicateQuestions"
  | "isOnHold"
  | "season"
  | "state";

export type CommonFilterValues = {
  status?: string;
  source?: string;
  states?: string[];        // multi-select (AdvanceFilter / QA)
  state?: string;           // single-select (DownloadReport)
  review_level?: string;
  normalisedCrops?: string[]; // multi-select (AdvanceFilter)
  normalised_crop?: string;   // single-select (DownloadReport)
  user?: string;
  domain?: string;
  priority?: string;
  startTime?: Date | null;
  endTime?: Date | null;
  closedAtStart?: Date | null;
  closedAtEnd?: Date | null;
  consecutiveApprovals?: string;
  autoAllocateFilter?: string;
  hiddenQuestions?: boolean;
  duplicateQuestions?: boolean;
  isOnHold?: boolean;
  season?: string;
  answersCount?: [number, number];
};

interface CommonFilterFieldsProps {
  values: CommonFilterValues;
  onChange: (key: string, value: any) => void;
  visibleFields: CommonFilterKey[];
  /** Override review level options (default: Review_Level from MetaData) */
  reviewLevelOptions?: string[];
  /** Whether the Source dropdown is disabled (default: true) */
  sourceDisabled?: boolean;
  /** States list for the multi-select (default: STATES from MetaData) */
  normalizedStates?: string[];
  /** Crops list fallback when DB crops are empty (default: CROPS from MetaData) */
  crops?: string[];
  /**
   * Controls whether cropType renders a multi-select (AdvanceFilter style)
   * or a single-select with DB crops (DownloadReport style).
   * Default: "multi"
   */
  cropTypeMode?: "multi" | "single";
}

export const CommonFilterFields: React.FC<CommonFilterFieldsProps> = ({
  values,
  onChange,
  visibleFields,
  reviewLevelOptions = Review_Level,
  sourceDisabled = true,
  normalizedStates = STATES,
  crops = CROPS,
  cropTypeMode = "multi",
}) => {
  const { data: userNameResponse, isLoading: isLoadingUsers } = useGetAllUsers();
  const { data: cropsData } = useGetAllCrops();
  const dbCrops = cropsData?.crops || [];

  const users = (userNameResponse?.users || []).sort((a, b) =>
    a.userName.localeCompare(b.userName),
  );

  const show = (field: CommonFilterKey) => visibleFields.includes(field);

  const showVisibility = show("hiddenQuestions") || show("duplicateQuestions") || show("isOnHold");

  return (
    <div className="space-y-6 py-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-8 gap-x-4">
            {show("status") && (
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-primary" />
                  Question Status
                </Label>
                <Select
                  value={values.status ?? "all"}
                  onValueChange={(v) => onChange("status", v)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(({ value, label, icon: Icon, iconClass }) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${iconClass}`} />
                          <span>{label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {show("source") && (
              <div
                className={`space-y-2 min-w-0 ${sourceDisabled ? "cursor-not-allowed" : ""}`}
              >
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Source
                </Label>
                <Select
                  value={values.source ?? "all"}
                  disabled={sourceDisabled}
                  onValueChange={(v) => onChange("source", v)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="Select Source" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map(({ value, label, icon: Icon, iconClass }) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${iconClass}`} />
                          <span>{label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {show("states") && (
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-primary" />
                  State/Region
                  {values.states && values.states.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      {values.states.length}
                    </Badge>
                  )}
                </Label>
                <StateMultiSelect
                  states={normalizedStates}
                  selected={values.states || []}
                  onChange={(next) => onChange("states", next)}
                />
              </div>
            )}

            {show("reviewLevel") && (
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Layers className="h-4 w-4 text-primary" />
                  Review Level
                </Label>
                <Select
                  value={values.review_level ?? "all"}
                  onValueChange={(v) => onChange("review_level", v)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    {reviewLevelOptions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {show("cropType") && (
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Sprout className="h-4 w-4 text-primary" />
                  Crop Type
                  <TooltipProvider>
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
                  </TooltipProvider>
                </Label>

                {cropTypeMode === "multi" ? (
                  <CropMultiSelect
                    dbCrops={dbCrops}
                    crops={crops}
                    selected={values.normalisedCrops || []}
                    onChange={(next) => onChange("normalisedCrops", next)}
                  />
                ) : (
                  /* single-select mode (used by DownloadFilteredReportButton) */
                  <Select
                    value={values.normalised_crop ?? "all"}
                    onValueChange={(v) => onChange("normalised_crop", v)}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select Crop Type" />
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
                                      {crop.aliases.map((a: string) => (
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
                        : crops.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {show("user") && (
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <UserIcon className="h-4 w-4 text-primary" />
                  User
                  <TooltipProvider>
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
                  </TooltipProvider>
                </Label>
                <Select
                  value={values.user ?? "all"}
                  onValueChange={(v) => onChange("user", v)}
                  disabled={isLoadingUsers}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingUsers ? (
                      <div className="flex items-center justify-center p-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="ml-2 text-sm text-muted-foreground">
                          Loading users...
                        </span>
                      </div>
                    ) : (
                      <>
                        <SelectItem value="all">All Users</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u._id} value={u._id}>
                            {u.userName}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {show("domain") && (
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Globe className="h-4 w-4 text-primary" />
                  Domain
                </Label>
                <Select
                  value={values.domain ?? "all"}
                  onValueChange={(v) => onChange("domain", v)}
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
            )}

            {show("priority") && (
              <div className="space-y-2 min-w-0">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Flag className="h-4 w-4 text-primary" />
                  Priority
                </Label>
                <Select
                  value={values.priority ?? "all"}
                  onValueChange={(v) => onChange("priority", v)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue placeholder="Select Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(({ value, label, icon: Icon, iconClass }) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${iconClass}`} />
                          <span>{label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {show("dateRange") && (
              <div className="space-y-2 min-w-0">
                <DateRangeFilter
                  customName="CreatedAt Date Range"
                  advanceFilter={values as Partial<AdvanceFilterValues>}
                  handleDialogChange={onChange}
                />
              </div>
            )}
            {show("closedDate") && (
              <div className="space-y-2 min-w-0">
                <DateRangeFilter
                  customName="ClosedAt Date Range"
                  advanceFilter={values as Partial<AdvanceFilterValues>}
                  handleDialogChange={onChange}
                  type="closedDateRange"
                />
              </div>
            )}
            {show("consecutiveApprovals") && (
              <div className="space-y-2 min-w-0">
                <Label className="relative flex items-center gap-2 text-sm font-semibold">
                  <BadgeCheck className="h-4 w-4 text-primary" />
                  Consecutive Approvals
                  <TooltipProvider>
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
                  </TooltipProvider>
                </Label>
                <Select
                  value={values.consecutiveApprovals ?? "all"}
                  onValueChange={(v) => onChange("consecutiveApprovals", v)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSECUTIVE_APPROVAL_OPTIONS.map((val) => (
                      <SelectItem key={val} value={val}>
                        <div className="flex items-center gap-2">
                          <BadgeCheck className="w-4 h-4 text-green-500 fill-green-500/20" />
                          <span>{val === "all" ? "All" : val}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {show("autoAllocate") && (
              <div className="space-y-2 min-w-0">
                <Label className="relative flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-primary" />
                  Auto Allocate Experts
                </Label>
                <Select
                  value={values.autoAllocateFilter ?? "all"}
                  onValueChange={(v) => onChange("autoAllocateFilter", v)}
                >
                  <SelectTrigger className="bg-background w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTO_ALLOCATE_OPTIONS.map(({ value, label, icon: Icon, iconClass }) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${iconClass}`} />
                          <span>{label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {show("state") && (
              <div className="space-y-2 min-w-0">
                <Label className="text-sm font-medium">State</Label>
                <Select
                  value={values.state ?? "all"}
                  onValueChange={(v) => onChange("state", v)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Select State" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {show("season") && (
              <div className="space-y-2 min-w-0">
                <Label className="text-sm font-medium">Season</Label>
                <Select
                  value={values.season ?? "all"}
                  onValueChange={(v) => onChange("season", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select Season" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Seasons</SelectItem>
                    {SEASONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
      </div>

      {/* ── Hidden & Duplicate Questions ── */}
      {showVisibility && (
        <div className="space-y-4">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Question Visibility
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            {show("hiddenQuestions") && (
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={values.hiddenQuestions ?? false}
                  onCheckedChange={(checked) =>
                    onChange("hiddenQuestions", checked === true)
                  }
                  className="h-3.5 w-3.5 border-primary"
                />
                <span className="text-sm">Show passed questions</span>
              </label>
            )}
            {show("duplicateQuestions") && (
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={values.duplicateQuestions ?? false}
                  onCheckedChange={(checked) =>
                    onChange("duplicateQuestions", checked === true)
                  }
                  className="h-3.5 w-3.5 border-primary"
                />
                <span className="text-sm">Show duplicate questions</span>
              </label>
            )}
            {show("isOnHold") && (
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={values.isOnHold ?? false}
                  onCheckedChange={(checked) =>
                    onChange("isOnHold", checked === true)
                  }
                  className="h-3.5 w-3.5 border-primary"
                />
                <span className="text-sm">Show questions on Hold</span>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
