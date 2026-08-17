import { useState } from "react";
import { Button } from "../../components/atoms/button";
import { Download, Loader2, CalendarIcon, Timer } from "lucide-react";
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
import { Checkbox } from "@/components/atoms/checkbox";
import { formatDateLocal } from "@/utils/formatDate";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";

/**
 * TAT (turnaround-time) report — one row per question with author / reviewer /
 * moderator handling times and the total lifecycle time. Same download flow as the
 * other report buttons; adds two scope toggles (all sources, closed only).
 */
export const TatReportButton = ({ onOpenDialog }: { onOpenDialog?: () => void }) => {
  const questionService = new QuestionService();
  const [isDownloading, setIsDownloading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [allSources, setAllSources] = useState(false);
  const [closedOnly, setClosedOnly] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleDownload = async () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error("Please select a date range first");
      return;
    }

    // Cap the window at ~1 month to keep the export bounded.
    const oneMonthInMs = 31 * 24 * 60 * 60 * 1000;
    if (dateRange.to.getTime() - dateRange.from.getTime() > oneMonthInMs) {
      toast.error("Date range cannot exceed 1 month. Please select a shorter range.");
      return;
    }

    try {
      setIsDownloading(true);
      toast.info("Preparing TAT report...");

      const startDate = formatDateLocal(dateRange.from);
      const endDate = formatDateLocal(dateRange.to);

      const blob = await questionService.downloadTatReport(startDate, endDate, {
        allSources,
        closedOnly,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tat-report-${startDate}-to-${endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("TAT report downloaded successfully!");
      setIsDialogOpen(false);
    } catch (error) {
      console.error("TAT report download error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to download TAT report";
      toast.error(message);
    } finally {
      setIsDownloading(false);
    }
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
            <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400">
              {isDownloading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Timer className="h-5 w-5" />
              )}
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {isDownloading ? "Downloading..." : "TAT Report"}
              </p>
              <p className="text-[11px] text-gray-500">
                Per-question turnaround time (author → reviewers → moderator)
              </p>
            </div>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(90vw,800px)] w-full max-h-[90vh] overflow-hidden flex flex-col p-4">
        <DialogHeader className="space-y-2 flex-shrink-0">
          <DialogTitle className="text-lg font-semibold">
            TAT Report — Select Date Range (Max 1 Month)
          </DialogTitle>
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md border">
            One row per question created in the range, with the time the author, each
            reviewer and the moderator took, plus the total lifecycle time.
            <span className="font-semibold text-foreground"> Maximum range: 1 month.</span>
          </div>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 py-2">
          <div className="flex items-center gap-2 text-xs bg-primary/5 p-2 rounded-md border border-primary/20">
            <CalendarIcon className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="font-medium text-sm">
              {dateRange?.from && dateRange?.to
                ? `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`
                : "No date range selected"}
            </span>
          </div>
          <div className="flex justify-center overflow-x-auto pb-2">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={2}
              disabled={(date) => date > new Date()}
              className="rounded-md border shadow-sm scale-95"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6 px-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={allSources}
                onCheckedChange={(v) => setAllSources(v === true)}
              />
              <span>
                All sources
                <span className="text-muted-foreground">
                  {" "}
                  (default: time-bound only)
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={closedOnly}
                onCheckedChange={(v) => setClosedOnly(v === true)}
              />
              <span>Closed questions only</span>
            </label>
          </div>
        </div>
        <DialogFooter className="gap-2 pt-3 flex-shrink-0">
          <DialogClose asChild>
            <Button variant="outline" type="button" className="w-full sm:w-auto">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleDownload}
            disabled={!dateRange?.from || !dateRange?.to || isDownloading}
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
  );
};
