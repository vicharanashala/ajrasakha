import { useState } from "react";
import { Button } from "../../components/atoms/button";
import { Download, Loader2, Filter, Sprout, AlertTriangle, Info } from "lucide-react";
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
import { STATES, CROPS, SEASONS, DOMAINS, STATUS } from "@/components/MetaData";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

export const DownloadFilteredReportButton = ({ onOpenDialog }: { onOpenDialog?: () => void }) => {
  const questionService = new QuestionService();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: cropsData } = useGetAllCrops();
  const dbCrops = cropsData?.crops ?? [];
  
  const [filters, setFilters] = useState({
    state: "all",
    crop: "all",
    normalised_crop: "all",
    season: "all",
    domain: "all",
    status: "all",
    hiddenQuestions: false,
    duplicateQuestions: false,
  });

  const handleDownloadReport = async () => {
    // Check if at least one filter is selected
    const hasFilter = Object.entries(filters).some(([, value]) =>
      typeof value === "boolean" ? value : value !== "all",
    );
    
    if (!hasFilter) {
      toast.error("Please select at least one filter");
      return;
    }

    try {
      setIsDownloading(true);
      toast.info("Preparing download...");

      // Download filtered report
      const blob = await questionService.downloadFilteredReport(filters);

      // Create filename based on filters
      const filterParts = [];
      if (filters.state !== "all") filterParts.push(filters.state);
      if (filters.crop !== "all") filterParts.push(filters.crop);
      if (filters.normalised_crop !== "all") filterParts.push(filters.normalised_crop === '__NOT_SET__' ? 'legacy' : filters.normalised_crop);
      if (filters.season !== "all") filterParts.push(filters.season);
      if (filters.domain !== "all") filterParts.push(filters.domain);
      if (filters.status !== "all") filterParts.push(filters.status);
      if (filters.hiddenQuestions) filterParts.push("hidden");
      if (filters.duplicateQuestions) filterParts.push("duplicate");
      
      const filename = `questions_${filterParts.join("_") || "filtered"}.xlsx`;

      // Create download link
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

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleCheckboxChange = (key: "hiddenQuestions" | "duplicateQuestions", value: boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setFilters({
      state: "all",
      crop: "all",
      normalised_crop: "all",
      season: "all",
      domain: "all",
      status: "all",
      hiddenQuestions: false,
      duplicateQuestions: false,
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
                  {isDownloading ? "Downloading..." : "Filtered Report"}
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
              Choose filters to download questions. At least one filter must be selected.
            </div>
          </DialogHeader>
          
          <div className="overflow-y-auto flex-1 py-2">
            <div className="grid grid-cols-2 gap-4">
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



              {/* Crop Type Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Sprout className="h-4 w-4 text-primary" />
                  Crop Type
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-primary transition-colors">
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-sm">
                        <p>Filter by the standardized crop name. You can view a crop's alternative names by hovering over the "+" icon next to it. Use "Not Set" to find older questions without a normalized crop.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Select value={filters.normalised_crop} onValueChange={(val) => handleFilterChange("normalised_crop", val)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select Crop Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Crops</SelectItem>
                    <SelectItem value="__NOT_SET__">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        <span className="text-yellow-700 dark:text-yellow-400 font-medium">Not Set (Legacy)</span>
                      </div>
                    </SelectItem>
                    {dbCrops.length > 0
                      ? dbCrops.map((crop) => (
                          <SelectItem key={crop._id || crop.name} value={crop.name}>
                            {crop.aliases && crop.aliases.length > 0 ? (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-2 cursor-default">
                                      <span className="capitalize">{crop.name}</span>
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">
                                        +{crop.aliases.length}
                                      </span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="text-xs">
                                    <p className="font-semibold mb-0.5">Also known as:</p>
                                    {crop.aliases.map((a, i) => (
                                      <p key={i} className="capitalize text-muted-foreground">{a.en_repr}</p>
                                    ))}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="capitalize">{crop.name}</span>
                            )}
                          </SelectItem>
                        ))
                      : CROPS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                  </SelectContent>
                </Select>
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

              {/* Separator */}
              <div className="col-span-2">
                <Separator className="my-2" />
              </div>

              {/* Status Filter - spans 2 columns */}
              <div className="space-y-2 col-span-2">
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

                  {/* <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={filters.duplicateQuestions}
                      onChange={(event) =>
                        handleCheckboxChange("duplicateQuestions", event.target.checked)
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm">Show duplicate questions</span>
                  </label> */}
                </div>
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
