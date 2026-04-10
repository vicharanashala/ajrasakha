import { useState } from "react";
import { Button } from "../../components/atoms/button";
import { Download, Loader2, Filter } from "lucide-react";
import { CommonFilterFields } from "@/components/CommonFilterFields";
import type { CommonFilterKey } from "@/components/CommonFilterFields";
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

export const DownloadFilteredReportButton = ({ onOpenDialog }: { onOpenDialog?: () => void }) => {
  const questionService = new QuestionService();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // useGetAllCrops moved into CommonFilterFields
  
  const [filters, setFilters] = useState({
    state: "all",
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

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // handleCheckboxChange is now handled by CommonFilterFields via handleFilterChange
  // const handleCheckboxChange = (key: "hiddenQuestions" | "duplicateQuestions", value: boolean) => {
  //   setFilters(prev => ({ ...prev, [key]: value }));
  // };

  const handleReset = () => {
    setFilters({
      state: "all",
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
            {/* ── CommonFilterFields replaces the duplicated filter dropdowns below ── */}
            <CommonFilterFields
              values={filters}
              onChange={handleFilterChange}
              visibleFields={
                [
                  "state",
                  "cropType",
                  "season",
                  "domain",
                  "status",
                  "hiddenQuestions",
                ] as CommonFilterKey[]
              }
              cropTypeMode="single"
            />

            {/*
            ── OLD inline filter fields (commented out, replaced by CommonFilterFields above) ──

            <div className="grid grid-cols-2 gap-4">
              {/* State Filter *\/}
              <div className="space-y-2">
                <Label className="text-sm font-medium">State</Label>
                <Select value={filters.state} onValueChange={(val) => handleFilterChange("state", val)}>
                  ...
                </Select>
              </div>

              {/* Crop Type Filter *\/}
              <div className="space-y-2">
                ...normalised_crop single select with DB crops and aliases tooltip...
              </div>

              {/* Season Filter *\/}
              <div className="space-y-2">...</div>

              {/* Domain Filter *\/}
              <div className="space-y-2">...</div>

              <div className="col-span-2"><Separator className="my-2" /></div>

              {/* Status Filter *\/}
              <div className="space-y-2 col-span-2">
                ...STATUS.map select...
              </div>

              <div className="space-y-3 col-span-2">
                ...hiddenQuestions checkbox...
              </div>
            </div>
            */}
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
