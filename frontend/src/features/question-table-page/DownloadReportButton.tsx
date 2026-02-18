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

export const DownloadReportButton = ({ onOpenDialog }: { onOpenDialog?: () => void }) => {
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

    // Check if date range is more than 1 month
    const oneMonthInMs = 31 * 24 * 60 * 60 * 1000; // 31 days
    const diffInMs =
      downloadDateRange.to.getTime() - downloadDateRange.from.getTime();

    if (diffInMs > oneMonthInMs) {
      toast.error(
        "Date range cannot exceed 1 month. Please select a shorter range."
      );
      return;
    }

    try {
      setIsDownloading(true);
      toast.info("Preparing download...");

      const startDate = formatDateLocal(downloadDateRange.from);
      const endDate = formatDateLocal(downloadDateRange.to);

      // Download ALL modified/rejected questions (no approval count filter)
      const blob = await questionService.downloadQuestionReport(
        undefined,
        startDate,
        endDate
      );

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `questions-modified-rejected-${startDate}-to-${endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Report downloaded successfully!");
      setIsDateDialogOpen(false);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download report. No questions found for the selected date range.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <TooltipProvider>
      <Dialog open={isDateDialogOpen} onOpenChange={setIsDateDialogOpen}>
        <DialogTrigger asChild>
          <button
            className="w-full flex items-center justify-between p-0 bg-transparent hover:opacity-80 transition-all"
            disabled={isDownloading}
            onClick={() => onOpenDialog?.()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                {isDownloading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Download className="h-5 w-5" />
                )}
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  {isDownloading ? "Downloading..." : "Download Report"}
                </p>
              </div>
            </div>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-[min(90vw,800px)] w-full max-h-[90vh] overflow-hidden flex flex-col p-4">
          <DialogHeader className="space-y-2 flex-shrink-0">
            <DialogTitle className="text-lg font-semibold">
              Select Date Range (Max 1 Month)
            </DialogTitle>
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md border">
              Select a date range to download questions with 2 consecutive
              approvals.
              <span className="font-semibold text-foreground">
                {" "}
                Maximum range: 1 month.
              </span>
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
                disabled={(date) => date > new Date()}
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
