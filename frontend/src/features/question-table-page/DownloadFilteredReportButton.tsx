import { useState } from "react";
import { Button } from "../../components/atoms/button";
import { Download, Loader2, Filter, Sprout, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { QuestionService } from "@/hooks/services/questionService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/atoms/dialog";
import { Label } from "@/components/atoms/label";
import { Input } from "@/components/atoms/input";
import { Separator } from "@/components/atoms/separator";
import { Checkbox } from "@/components/atoms/checkbox";
import { STATES, SEASONS, DOMAINS, STATUS, SOURCES } from "@/components/MetaData";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { useGetUsersByRole } from "@/hooks/api/user/useGetUsersByRole";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { cn } from "@/lib/utils";

const getDefaultDates = () => {
  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  return { startTime: oneMonthAgo, endTime: today };
};

// const toDateString = (d: Date | undefined) =>
//   d ? d.toISOString().split("T")[0] : undefined;

const toDateString = (d: Date | undefined) => {
  if (!d) return undefined;

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const CheckMark = () => (
  <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Reusable multi-select combobox for a list of string options: a trigger button,
 * a checkbox dropdown with an "all" option, and removable chips for the selection.
 */
const FilterMultiSelect = ({
  label,
  icon,
  options,
  selected,
  onChange,
  allLabel,
  summaryNoun = "selected",
  capitalize,
}: {
  label: string;
  icon?: React.ReactNode;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
  /** Plural noun for the "N x… selected" summary, e.g. "states". */
  summaryNoun?: string;
  capitalize?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  const displayText =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? selected[0]
        : `${selected.length} ${summaryNoun}`;

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-2">
        {icon}
        {label}
      </Label>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "h-9 w-full justify-between px-3 font-normal",
            selected.length === 0 && "text-muted-foreground"
          )}
        >
          <span className={cn("truncate", capitalize && "capitalize")}>{displayText}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 opacity-50 transition-transform",
              open && "rotate-180"
            )}
          />
        </Button>
        {open && (
          <>
            {/* Click-away layer to close the dropdown */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[220px] rounded-md border bg-popover text-popover-foreground shadow-md">
              <div className="flex flex-col max-h-[300px] overflow-y-auto p-1">
                <div
                  className="relative flex items-center px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => onChange([])}
                >
                  <div className={cn(
                    "flex items-center justify-center border rounded-sm h-4 w-4 mr-2",
                    selected.length === 0 && "bg-primary border-primary"
                  )}>
                    {selected.length === 0 && <CheckMark />}
                  </div>
                  <span className="text-sm">{allLabel}</span>
                </div>
                {options.map((opt) => (
                  <div
                    key={opt}
                    className="relative flex items-center px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => toggle(opt)}
                  >
                    <div className={cn(
                      "flex items-center justify-center border rounded-sm h-4 w-4 mr-2",
                      selected.includes(opt) && "bg-primary border-primary"
                    )}>
                      {selected.includes(opt) && <CheckMark />}
                    </div>
                    <span className={cn("text-sm", capitalize && "capitalize")}>{opt}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-md"
            >
              <span className={cn(capitalize && "capitalize")}>{v}</span>
              <X
                className="h-3 w-3 cursor-pointer hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(v);
                }}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export const DownloadFilteredReportButton = ({ onOpenDialog }: { onOpenDialog?: () => void }) => {
  const questionService = new QuestionService();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isModeratorPopoverOpen, setIsModeratorPopoverOpen] = useState(false);
  const { data: cropsData } = useGetAllCrops({ type: "crop", limit: 500 });
  const dbCrops = cropsData?.crops ?? [];
  const { data: usersByRole } = useGetUsersByRole(["moderator","auditor"], isDialogOpen);

  const [filters, setFilters] = useState<{
    states: string[];
    crop: string[];
    normalised_crop: string[];
    seasons: string[];
    domains: string[];
    statuses: string[];
    sources: string[];
    allUsers: string[];
    /** Optional per-approver question count (userId -> count string). */
    userCounts: Record<string, string>;
    /** Total questions to sample across approvers (default 50). */
    totalCount: string;
    hiddenQuestions: boolean;
    duplicateQuestions: boolean;
    startTime: Date | undefined;
    endTime: Date | undefined;
  }>({
    states: [],
    crop: [],
    normalised_crop: [],
    seasons: [],
    domains: [],
    statuses: [],
    sources: [],
    allUsers: [],
    userCounts: {},
    totalCount: "50",
    hiddenQuestions: false,
    duplicateQuestions: false,
    ...getDefaultDates(),
  });

  const handleDownloadReport = async () => {
    if (!filters.startTime || !filters.endTime) {
      toast.error("Please select a valid date range");
      return;
    }
    if (filters.startTime > filters.endTime) {
      toast.error("Start date cannot be after end date");
      return;
    }

    try {
      setIsDownloading(true);
      toast.info("Preparing download...");

      const blob = await questionService.downloadFilteredReport({
        state: filters.states.length > 0 ? filters.states.join(",") : "all",
        crop: filters.normalised_crop.length > 0 ? filters.normalised_crop.join(",") : "all",
        normalised_crop: filters.normalised_crop.length > 0 ? filters.normalised_crop.join(",") : "all",
        season: filters.seasons.length > 0 ? filters.seasons.join(",") : "all",
        domain: filters.domains.length > 0 ? filters.domains.join(",") : "all",
        status: filters.statuses.length > 0 ? filters.statuses.join(",") : "all",
        source: filters.sources.length > 0 ? filters.sources.join(",") : "all",
        // Each approver is sent as "id" or "id:count" (explicit per-user count).
        allUsers:
          filters.allUsers.length > 0
            ? filters.allUsers
                .map(id => {
                  const c = (filters.userCounts[id] ?? "").trim();
                  return c && Number(c) > 0 ? `${id}:${Math.floor(Number(c))}` : id;
                })
                .join(",")
            : "all",
        totalCount:
          (filters.totalCount ?? "").trim() && Number(filters.totalCount) > 0
            ? String(Math.floor(Number(filters.totalCount)))
            : undefined,
        hiddenQuestions: filters.hiddenQuestions,
        duplicateQuestions: filters.duplicateQuestions,
        startDate: toDateString(filters.startTime),
        endDate: toDateString(filters.endTime),
      });

      // Build filename
      const filterParts: string[] = [];
      if (filters.startTime) filterParts.push(toDateString(filters.startTime)!);
      if (filters.endTime) filterParts.push(toDateString(filters.endTime)!);
      if (filters.states.length > 0) filterParts.push(filters.states.join("-"));
      if (filters.normalised_crop.length > 0) filterParts.push(filters.normalised_crop.join("-"));
      if (filters.seasons.length > 0) filterParts.push(filters.seasons.join("-"));
      if (filters.domains.length > 0) filterParts.push(filters.domains.join("-"));
      if (filters.statuses.length > 0) filterParts.push(filters.statuses.join("-"));
      if (filters.hiddenQuestions) filterParts.push("hidden");
      if (filters.duplicateQuestions) filterParts.push("duplicate");

      const filename = `questions_${filterParts.join("_")}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Filtered report downloaded successfully!");
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Download error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to download filtered report";
      toast.error(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDateChange = (key: string, value: Date | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleCheckboxChange = (key: "hiddenQuestions" | "duplicateQuestions", value: boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleAllUsersToggle = (userId: string) => {
    setFilters(prev => {
      const current = prev.allUsers;
      return current.includes(userId)
        ? { ...prev, allUsers: current.filter(id => id !== userId) }
        : { ...prev, allUsers: [...current, userId] };
    });
  };

  const getAllUsersDisplayText = () => {
    if (filters.allUsers.length === 0) return "All Users";
    const list = usersByRole ?? [];
    const names = filters.allUsers
      .map(id => list.find(m => m._id === id)?.name)
      .filter(Boolean);
    if (names.length === 0) return `${filters.allUsers.length} selected`;
    return names.length <= 2
      ? names.join(", ")
      : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  };

  const handleReset = () => {
    setFilters({
      states: [],
      crop: [],
      normalised_crop: [],
      seasons: [],
      domains: [],
      statuses: [],
      sources: [],
      allUsers: [],
      userCounts: {},
      totalCount: "50",
      hiddenQuestions: false,
      duplicateQuestions: false,
      ...getDefaultDates(),
    });
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <button
          className="w-full flex items-center justify-between p-0 bg-transparent transition-all"
          disabled={isDownloading}
          onClick={() => onOpenDialog?.()}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-500/10 flex items-center justify-center text-green-600 dark:text-green-400">
              {isDownloading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Filter className="h-5 w-5" />
              )}
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {isDownloading ? "Downloading..." : "Custom Question Report"}
              </p>
              <p className="text-[11px] text-gray-500">
                Questions filtered by State, Crop, Season, Domain, and Status
              </p>
            </div>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(90vw,600px)] w-full max-h-[90vh] overflow-hidden flex flex-col p-4">
        <DialogHeader className="space-y-2 flex-shrink-0">
          <DialogTitle className="text-lg font-semibold">
            Select Filters for Report
          </DialogTitle>
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md border">
            By default, the last 1 month of data is downloaded. You can customize the date range and apply additional filters.
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 py-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 items-start">

            {/* Date Range Filter */}
            <div className="col-span-2">
              <DateRangeFilter
                advanceFilter={{ startTime: filters.startTime, endTime: filters.endTime }}
                handleDialogChange={handleDateChange}
              />
            </div>

            <div className="col-span-2">
              <Separator className="my-2" />
            </div>

            {/* State Filter - Multi-select */}
            <FilterMultiSelect
              label="State"
              allLabel="All States"
              summaryNoun="states"
              options={STATES}
              selected={filters.states}
              onChange={(next) => setFilters(prev => ({ ...prev, states: next }))}
            />

            {/* Crop Type Filter - Multi-select */}
            <FilterMultiSelect
              label="Crop Type"
              icon={<Sprout className="h-4 w-4 text-primary" />}
              allLabel="All Crops"
              summaryNoun="crops"
              options={dbCrops.map((c) => c.name)}
              selected={filters.normalised_crop}
              onChange={(next) => setFilters(prev => ({ ...prev, normalised_crop: next }))}
              capitalize
            />

            <div className="col-span-2">
              <Separator className="my-2" />
            </div>

            {/* Season Filter - Multi-select */}
            <FilterMultiSelect
              label="Season"
              allLabel="All Seasons"
              summaryNoun="seasons"
              options={SEASONS}
              selected={filters.seasons}
              onChange={(next) => setFilters(prev => ({ ...prev, seasons: next }))}
            />

            {/* Domain Filter - Multi-select */}
            <FilterMultiSelect
              label="Domain"
              allLabel="All Domains"
              summaryNoun="domains"
              options={DOMAINS}
              selected={filters.domains}
              onChange={(next) => setFilters(prev => ({ ...prev, domains: next }))}
            />

            {/* Separator after State and Crop Type row */}
            <div className="col-span-2">
              <Separator className="my-2" />
            </div>

            {/* Status and Source Filter - in single row (multi-select) */}
            <FilterMultiSelect
              label="Status"
              allLabel="All Status"
              summaryNoun="statuses"
              options={STATUS}
              selected={filters.statuses}
              onChange={(next) => setFilters(prev => ({ ...prev, statuses: next }))}
            />

            <FilterMultiSelect
              label="Source"
              allLabel="All Sources"
              summaryNoun="sources"
              options={SOURCES}
              selected={filters.sources}
              onChange={(next) => setFilters(prev => ({ ...prev, sources: next }))}
            />

            <div className="space-y-2 col-span-2">
              <Label className="text-sm font-medium">Approved by</Label>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={isModeratorPopoverOpen}
                  onClick={() => setIsModeratorPopoverOpen((open) => !open)}
                  className={cn(
                    "h-9 w-full justify-between px-3 font-normal",
                    filters.allUsers.length === 0 && "text-muted-foreground"
                  )}
                >
                  <span className="truncate">{getAllUsersDisplayText()}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 opacity-50 transition-transform",
                      isModeratorPopoverOpen && "rotate-180"
                    )}
                  />
                </Button>
                {isModeratorPopoverOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsModeratorPopoverOpen(false)}
                    />
                    <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[250px] rounded-md border bg-popover text-popover-foreground shadow-md">
                      <div className="flex flex-col max-h-[300px] overflow-y-auto p-1">
                        <div
                          className="relative flex items-center px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => setFilters(prev => ({ ...prev, allUsers: [] }))}
                        >
                          <div className={cn(
                            "flex items-center justify-center border rounded-sm h-4 w-4 mr-2",
                            filters.allUsers.length === 0 && "bg-primary border-primary"
                          )}>
                            {filters.allUsers.length === 0 && (
                              <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className="text-sm">All Users</span>
                        </div>
                        {(usersByRole ?? []).map((m) => (
                          <div
                            key={m._id}
                            className="relative flex items-center px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
                            onClick={() => handleAllUsersToggle(m._id)}
                          >
                            <div className={cn(
                              "flex items-center justify-center border rounded-sm h-4 w-4 mr-2",
                              filters.allUsers.includes(m._id) && "bg-primary border-primary"
                            )}>
                              {filters.allUsers.includes(m._id) && (
                                <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <span className="text-sm">{m.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {filters.allUsers.length > 0 && (
                <div className="mt-2 space-y-2">
                  {/* Total questions — split equally across approvers who have no explicit count */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">
                      Total questions (max 50)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={filters.totalCount}
                      onChange={(e) => {
                        // Cap the total at 50.
                        const raw = e.target.value;
                        const n = Number(raw);
                        const next = raw === "" ? "" : Number.isFinite(n) ? String(Math.min(50, Math.max(1, Math.floor(n)))) : filters.totalCount;
                        setFilters(prev => ({ ...prev, totalCount: next }));
                      }}
                      placeholder="50"
                      className="h-8 w-24"
                    />
                  </div>
                  {/* Per-approver rows with an optional count (blank = share of the total) */}
                  <div className="space-y-1">
                    {filters.allUsers.map(id => {
                      const name = (usersByRole ?? []).find(m => m._id === id)?.name ?? id;
                      return (
                        <div key={id} className="flex items-center gap-2">
                          <span className="flex-1 truncate inline-flex items-center px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                            {name}
                          </span>
                          <Input
                            type="number"
                            min={1}
                            value={filters.userCounts[id] ?? ""}
                            onChange={(e) =>
                              setFilters(prev => ({
                                ...prev,
                                userCounts: { ...prev.userCounts, [id]: e.target.value },
                              }))
                            }
                            placeholder="auto"
                            className="h-8 w-20 text-xs"
                          />
                          <X
                            className="h-3.5 w-3.5 cursor-pointer hover:text-destructive shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAllUsersToggle(id);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Leave a count blank to split the total equally. Questions are picked randomly; if someone data not available, the rest fill from others.
                  </p>
                </div>
              )}
            </div>

            {/* Separator */}
            <div className="col-span-2">
              <Separator className="my-2" />
            </div>

            <div className="space-y-2 col-span-2">
              <Label className="text-sm font-medium">Question Type</Label>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={filters.hiddenQuestions}
                    onCheckedChange={(checked) =>
                      handleCheckboxChange("hiddenQuestions", checked === true)
                    }
                    className="h-4 w-4 border-primary"
                  />
                  <span className="text-sm">Show passed questions</span>
                </label>
              </div>
            </div>

            {/* Separator after last row */}
            <div className="col-span-2">
              <Separator className="my-2" />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-3 flex-shrink-0 flex-row justify-end">
          <Button variant="outline" type="button" onClick={handleReset} className="w-auto">
            Reset
          </Button>
          <DialogClose asChild>
            <Button variant="outline" type="button" className="w-auto">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleDownloadReport}
            disabled={isDownloading}
            className="w-auto"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download Excel
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};