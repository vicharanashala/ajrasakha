import { useState } from "react";
import { Button } from "../../components/atoms/button";
import { Download, Loader2, CalendarIcon } from "lucide-react";
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
import { Calendar } from "@/components/atoms/calendar";
import { formatDateLocal } from "@/utils/formatDate";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

export const DownloadOverallReportButton = () => {
  const questionService = new QuestionService();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadDateRange, setDownloadDateRange] = useState<
    DateRange | undefined
  >(undefined);
  const [isDateDialogOpen, setIsDateDialogOpen] = useState(false);

  const handleDownloadReport = async () => {
    // Validate date range
    if (!downloadDateRange?.from || !downloadDateRange?.to) {
      toast.error("Please select a date range first");
      setIsDateDialogOpen(true);
      return;
    }

    try {
      setIsDownloading(true);
      toast.info("Preparing download...");

      const startDate = formatDateLocal(downloadDateRange.from);
      const endDate = formatDateLocal(downloadDateRange.to);

      // Download overall report
      const blob = await questionService.downloadOverallReport(
        startDate,
        endDate
      );

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `overall-questions-report-${startDate}-to-${endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Overall report downloaded successfully!");
      setIsDateDialogOpen(false);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download overall report");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <TooltipProvider>
      <Dialog open={isDateDialogOpen} onOpenChange={setIsDateDialogOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="outline"
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
                    <Download className="h-4 w-4" />
                    Overall Report
                  </>
                )}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-sm">
              Download monthly statistics showing total questions, modified
              answers, and rejected answers for the selected date range.
            </p>
          </TooltipContent>
        </Tooltip>
        <DialogContent className="max-w-[min(90vw,800px)] w-full max-h-[90vh] overflow-hidden flex flex-col p-4">
          <DialogHeader className="space-y-2 flex-shrink-0">
            <DialogTitle className="text-lg font-semibold">
              Select Date Range for Overall Report
            </DialogTitle>
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md border">
              Select a date range to download monthly statistics of questions
              added, modified, and rejected.
            </div>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 py-2">
            <div className="flex items-center gap-2 text-xs bg-primary/5 p-2 rounded-md border border-primary/20">
              <CalendarIcon className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="font-medium text-sm">
                {downloadDateRange?.from && downloadDateRange?.to
                  ? `${format(downloadDateRange.from, "MMM dd, yyyy")} - ${format(downloadDateRange.to, "MMM dd, yyyy")}`
                  : "No date range selected"}
              </span>
            </div>
            <div className="flex justify-center overflow-x-auto pb-2">
              <Calendar
                mode="range"
                selected={downloadDateRange}
                onSelect={setDownloadDateRange}
                numberOfMonths={2}
                className="rounded-md border shadow-sm scale-95"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-3 flex-shrink-0">
            <DialogClose asChild>
              <Button
                variant="outline"
                type="button"
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleDownloadReport}
              disabled={
                !downloadDateRange?.from ||
                !downloadDateRange?.to ||
                isDownloading
              }
              className="w-full sm:w-auto"
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
