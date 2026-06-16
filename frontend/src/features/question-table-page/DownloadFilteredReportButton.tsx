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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { Label } from "@/components/atoms/label";
import { Separator } from "@/components/atoms/separator";
import { Checkbox } from "@/components/atoms/checkbox";
import { STATES, SEASONS, DOMAINS, STATUS, SOURCES } from "@/components/MetaData";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { useGetModerators } from "@/hooks/api/user/useGetModerators";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { cn } from "@/lib/utils";

const getDefaultDates = () => {
  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  return { startTime: oneMonthAgo, endTime: today };
};

const toDateString = (d: Date | undefined) =>
  d ? d.toISOString().split("T")[0] : undefined;

export const DownloadFilteredReportButton = ({ onOpenDialog }: { onOpenDialog?: () => void }) => {
  const questionService = new QuestionService();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCropPopoverOpen, setIsCropPopoverOpen] = useState(false);
  const [isModeratorPopoverOpen, setIsModeratorPopoverOpen] = useState(false);
  const { data: cropsData } = useGetAllCrops({ type: "crop", limit: 500 });
  const dbCrops = cropsData?.crops ?? [];
  const { data: moderators } = useGetModerators(isDialogOpen);

  const [filters, setFilters] = useState<{
    state: string;
    crop: string[];
    normalised_crop: string[];
    season: string;
    domain: string;
    status: string;
    source: string;
    moderator: string[];
    hiddenQuestions: boolean;
    duplicateQuestions: boolean;
    startTime: Date | undefined;
    endTime: Date | undefined;
  }>({
    state: "all",
    crop: [],
    normalised_crop: [],
    season: "all",
    domain: "all",
    status: "all",
    source: "all",
    moderator: [],
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
    let toastId;
    try {
      setIsDownloading(true);
      toastId=toast.loading("Preparing download...");

      const blob = await questionService.downloadFilteredReport({
        state: filters.state,
        crop: filters.normalised_crop.length > 0 ? filters.normalised_crop.join(",") : "all",
        normalised_crop: filters.normalised_crop.length > 0 ? filters.normalised_crop.join(",") : "all",
        season: filters.season,
        domain: filters.domain,
        status: filters.status,
        source: filters.source,
        moderator: filters.moderator.length > 0 ? filters.moderator.join(",") : "all",
        hiddenQuestions: filters.hiddenQuestions,
        duplicateQuestions: filters.duplicateQuestions,
        startDate: toDateString(filters.startTime),
        endDate: toDateString(filters.endTime),
      });

      // Build filename
      const filterParts: string[] = [];
      if (filters.startTime) filterParts.push(toDateString(filters.startTime)!);
      if (filters.endTime) filterParts.push(toDateString(filters.endTime)!);
      if (filters.state !== "all") filterParts.push(filters.state);
      if (filters.normalised_crop.length > 0) filterParts.push(filters.normalised_crop.join("-"));
      if (filters.season !== "all") filterParts.push(filters.season);
      if (filters.domain !== "all") filterParts.push(filters.domain);
      if (filters.status !== "all") filterParts.push(filters.status);
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
      toast.dismiss(toastId)
      toast.success("Filtered report downloaded successfully!");
      setIsDialogOpen(false);
    } catch (error) {
      toast.dismiss(toastId)
      console.error("Download error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to download filtered report";
      toast.error(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleDateChange = (key: string, value: Date | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleCheckboxChange = (key: "hiddenQuestions" | "duplicateQuestions", value: boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleCropToggle = (cropName: string) => {
    setFilters(prev => {
      const currentCrops = prev.normalised_crop;
      if (currentCrops.includes(cropName)) {
        return { ...prev, normalised_crop: currentCrops.filter(c => c !== cropName) };
      } else {
        return { ...prev, normalised_crop: [...currentCrops, cropName] };
      }
    });
  };

  const handleModeratorToggle = (moderatorId: string) => {
    setFilters(prev => {
      const current = prev.moderator;
      return current.includes(moderatorId)
        ? { ...prev, moderator: current.filter(id => id !== moderatorId) }
        : { ...prev, moderator: [...current, moderatorId] };
    });
  };

  const getModeratorDisplayText = () => {
    if (filters.moderator.length === 0) return "All Moderators";
    const list = moderators ?? [];
    const names = filters.moderator
      .map(id => list.find(m => m._id === id)?.name)
      .filter(Boolean);
    if (names.length === 0) return `${filters.moderator.length} selected`;
    return names.length <= 2
      ? names.join(", ")
      : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  };

  const handleReset = () => {
    setFilters({
      state: "all",
      crop: [],
      normalised_crop: [],
      season: "all",
      domain: "all",
      status: "all",
      source: "all",
      moderator: [],
      hiddenQuestions: false,
      duplicateQuestions: false,
      ...getDefaultDates(),
    });
  };

  const getCropDisplayText = () => {
    if (filters.normalised_crop.length === 0) {
      return "All Crops";
    }
    if (filters.normalised_crop.length === 1) {
      return filters.normalised_crop[0];
    }
    return `${filters.normalised_crop.length} crops selected`;
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
          <div className="grid grid-cols-2 gap-4">

            {/* Date Range Filter */}
            <div className="col-span-2">
              <DateRangeFilter
                advanceFilter={{ startTime: filters.startTime, endTime: filters.endTime }}
                handleDialogChange={handleDateChange}
              />
            </div>

            <div className="col-span-2">
              <Separator className="my-1" />
            </div>

            {/* State Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">State</Label>
              <Select value={filters.state} onValueChange={(val) => handleFilterChange("state", val)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select State" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Crop Type Filter - Multi-select */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Sprout className="h-4 w-4 text-primary" />
                Crop Type
              </Label>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={isCropPopoverOpen}
                  onClick={() => setIsCropPopoverOpen((open) => !open)}
                  className={cn(
                    "h-9 w-full justify-between px-3 font-normal",
                    filters.normalised_crop.length === 0 && "text-muted-foreground"
                  )}
                >
                  <span className="truncate">{getCropDisplayText()}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 opacity-50 transition-transform",
                      isCropPopoverOpen && "rotate-180"
                    )}
                  />
                </Button>
                {isCropPopoverOpen && (
                  <>
                    {/* Click-away layer to close the dropdown */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsCropPopoverOpen(false)}
                    />
                    <div className="absolute left-0 top-full z-50 mt-1 w-[250px] rounded-md border bg-popover text-popover-foreground shadow-md">
                      <div className="flex flex-col max-h-[300px] overflow-y-auto p-1">
                        {/* All option */}
                        <div
                          className="relative flex items-center px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => setFilters(prev => ({ ...prev, normalised_crop: [] }))}
                        >
                          <div className={cn(
                            "flex items-center justify-center border rounded-sm h-4 w-4 mr-2",
                            filters.normalised_crop.length === 0 && "bg-primary border-primary"
                          )}>
                            {filters.normalised_crop.length === 0 && (
                              <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className="text-sm">All Crops</span>
                        </div>
                        {dbCrops.map((crop) => (
                          <div
                            key={crop._id || crop.name}
                            className="relative flex items-center px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
                            onClick={() => handleCropToggle(crop.name)}
                          >
                            <div className={cn(
                              "flex items-center justify-center border rounded-sm h-4 w-4 mr-2",
                              filters.normalised_crop.includes(crop.name) && "bg-primary border-primary"
                            )}>
                              {filters.normalised_crop.includes(crop.name) && (
                                <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <span className="text-sm capitalize">{crop.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* Selected crops display */}
              {filters.normalised_crop.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {filters.normalised_crop.map(crop => (
                    <span
                      key={crop}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-md"
                    >
                      <span className="capitalize">{crop}</span>
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCropToggle(crop);
                        }}
                      />
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="col-span-2">
              <Separator className="my-1" />
            </div>

            {/* Season Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Season</Label>
              <Select value={filters.season} onValueChange={(val) => handleFilterChange("season", val)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select Season" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Seasons</SelectItem>
                  {SEASONS.map((season) => (
                    <SelectItem key={season} value={season}>
                      {season}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Domain Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Domain</Label>
              <Select value={filters.domain} onValueChange={(val) => handleFilterChange("domain", val)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select Domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains</SelectItem>
                  {DOMAINS.map((domain) => (
                    <SelectItem key={domain} value={domain}>
                      {domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Separator after State and Crop Type row */}
            <div className="col-span-2">
              <Separator className="my-2" />
            </div>

            {/* Status and Source Filter - in single row */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={filters.status} onValueChange={(val) => handleFilterChange("status", val)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STATUS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Source</Label>
              <Select value={filters.source} onValueChange={(val) => handleFilterChange("source", val)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Moderator (approved by)</Label>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={isModeratorPopoverOpen}
                  onClick={() => setIsModeratorPopoverOpen((open) => !open)}
                  className={cn(
                    "h-9 w-full justify-between px-3 font-normal",
                    filters.moderator.length === 0 && "text-muted-foreground"
                  )}
                >
                  <span className="truncate">{getModeratorDisplayText()}</span>
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
                    <div className="absolute left-0 top-full z-50 mt-1 w-[250px] rounded-md border bg-popover text-popover-foreground shadow-md">
                      <div className="flex flex-col max-h-[300px] overflow-y-auto p-1">
                        <div
                          className="relative flex items-center px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => setFilters(prev => ({ ...prev, moderator: [] }))}
                        >
                          <div className={cn(
                            "flex items-center justify-center border rounded-sm h-4 w-4 mr-2",
                            filters.moderator.length === 0 && "bg-primary border-primary"
                          )}>
                            {filters.moderator.length === 0 && (
                              <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className="text-sm">All Moderators</span>
                        </div>
                        {(moderators ?? []).map((m) => (
                          <div
                            key={m._id}
                            className="relative flex items-center px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
                            onClick={() => handleModeratorToggle(m._id)}
                          >
                            <div className={cn(
                              "flex items-center justify-center border rounded-sm h-4 w-4 mr-2",
                              filters.moderator.includes(m._id) && "bg-primary border-primary"
                            )}>
                              {filters.moderator.includes(m._id) && (
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
              {filters.moderator.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {filters.moderator.map(id => {
                    const name = (moderators ?? []).find(m => m._id === id)?.name ?? id;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-md"
                      >
                        <span>{name}</span>
                        <X
                          className="h-3 w-3 cursor-pointer hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleModeratorToggle(id);
                          }}
                        />
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Separator */}
            <div className="col-span-2">
              <Separator className="my-2" />
            </div>

            <div className="space-y-3 col-span-2">
              <Label className="text-sm font-medium">Question Type</Label>
              <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={filters.hiddenQuestions}
                    onCheckedChange={(checked) =>
                      handleCheckboxChange("hiddenQuestions", checked === true)
                    }
                    className="h-3.5 w-3.5 border-primary"
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