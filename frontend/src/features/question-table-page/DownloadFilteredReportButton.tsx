import { useState } from "react";
import { Button } from "../../components/atoms/button";
import { Download, Loader2, Filter } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { STATES, CROPS, SEASONS, DOMAINS, STATUS } from "@/components/MetaData";

export const DownloadFilteredReportButton = () => {
  const questionService = new QuestionService();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [filters, setFilters] = useState({
    state: "all",
    crop: "all",
    season: "all",
    domain: "all",
    status: "all",
  });

  const handleDownloadReport = async () => {
    // Check if at least one filter is selected
    const hasFilter = Object.values(filters).some(value => value !== "all");
    
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
      if (filters.season !== "all") filterParts.push(filters.season);
      if (filters.domain !== "all") filterParts.push(filters.domain);
      if (filters.status !== "all") filterParts.push(filters.status);
      
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
      toast.error("Failed to download filtered report. No questions found for selected filters.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setFilters({
      state: "all",
      crop: "all",
      season: "all",
      domain: "all",
      status: "all",
    });
  };

  return (
    <TooltipProvider>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="flex items-center gap-2 w-full"
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Filter className="h-4 w-4" />
                    Filtered Report
                  </>
                )}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-sm">
              Download questions filtered by State, Crop, Season, Domain, and Status.
              Select at least one filter to download.
            </p>
          </TooltipContent>
        </Tooltip>
        <DialogContent className="max-w-[min(90vw,600px)] w-full max-h-[90vh] overflow-hidden flex flex-col p-4">
          <DialogHeader className="space-y-2 flex-shrink-0">
            <DialogTitle className="text-lg font-semibold">
              Select Filters for Report
            </DialogTitle>
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md border">
              Choose filters to download questions. At least one filter must be selected.
            </div>
          </DialogHeader>
          
          <div className="space-y-4 overflow-y-auto flex-1 py-2">
            {/* State Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">State</Label>
              <Select value={filters.state} onValueChange={(val) => handleFilterChange("state", val)}>
                <SelectTrigger>
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

            {/* Crop Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Crop</Label>
              <Select value={filters.crop} onValueChange={(val) => handleFilterChange("crop", val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Crop" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Crops</SelectItem>
                  {CROPS.map((crop) => (
                    <SelectItem key={crop} value={crop}>
                      {crop}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Season Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Season</Label>
              <Select value={filters.season} onValueChange={(val) => handleFilterChange("season", val)}>
                <SelectTrigger>
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
                <SelectTrigger>
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

            {/* Status Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={filters.status} onValueChange={(val) => handleFilterChange("status", val)}>
                <SelectTrigger>
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
          </div>

          <DialogFooter className="gap-2 pt-3 flex-shrink-0">
            <Button variant="outline" type="button" onClick={handleReset}>
              Reset
            </Button>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleDownloadReport}
              disabled={isDownloading}
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
    </TooltipProvider>
  );
};
