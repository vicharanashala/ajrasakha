import { useMemo, useState } from "react";
import { Button } from "../../components/atoms/button";
import { Download, Loader2, CalendarIcon, Timer, ChevronDown, Info } from "lucide-react";
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
import { MultiSelect } from "@/components/atoms/MultiSelect";
import { SOURCES, STATUS } from "@/components/MetaData";
import { formatDateLocal } from "@/utils/formatDate";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";

/**
 * TAT (turnaround-time) report — one row per question with author / reviewer /
 * moderator handling times and the total lifecycle time. Same download flow as the
 * other report buttons; scoped by source + status multi-selects and a date range.
 */
export const TatReportButton = ({ onOpenDialog }: { onOpenDialog?: () => void }) => {
  const questionService = new QuestionService();
  const [isDownloading, setIsDownloading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDateOpen, setIsDateOpen] = useState(false);

  // Source / status options come straight from the shared frontend metadata.
  const sourceOptions = useMemo(
    () => SOURCES.map((s) => ({ value: s, label: s })),
    [],
  );
  const statusOptions = useMemo(
    () => STATUS.map((s) => ({ value: s, label: s })),
    [],
  );

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
        sources: selectedSources,
        statuses: selectedStatuses,
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
            One row per question <span className="font-semibold text-foreground">created or closed</span>{" "}
            within the selected date range, with the time the author, each reviewer and
            the moderator took, plus the total lifecycle time.
            <span className="font-semibold text-foreground"> Maximum range: 1 month.</span>
          </div>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sources</label>
              <MultiSelect
                items={sourceOptions}
                selected={selectedSources}
                onChange={setSelectedSources}
                placeholder="All sources"
                direction="down"
                getDisplayLabel={(sel) =>
                  sel.length === 0 || sel.length === sourceOptions.length
                    ? "All sources"
                    : `${sel.length} source${sel.length > 1 ? "s" : ""} selected`
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <MultiSelect
                items={statusOptions}
                selected={selectedStatuses}
                onChange={setSelectedStatuses}
                placeholder="All statuses"
                direction="down"
                searchable
                getDisplayLabel={(sel) =>
                  sel.length === 0 || sel.length === statusOptions.length
                    ? "All statuses"
                    : `${sel.length} status${sel.length > 1 ? "es" : ""} selected`
                }
              />
            </div>
          </div>
          <div className="space-y-1.5 px-1">
            <label className="text-sm font-medium">
              Date range{" "}
              <span className="font-normal text-muted-foreground">
                (by created or closed date)
              </span>
            </label>
            <button
              type="button"
              onClick={() => setIsDateOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary flex-shrink-0" />
                <span
                  className={
                    dateRange?.from && dateRange?.to
                      ? "font-medium"
                      : "text-muted-foreground"
                  }
                >
                  {dateRange?.from && dateRange?.to
                    ? `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`
                    : "Select a date range"}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${
                  isDateOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {isDateOpen && (
              <div className="rounded-md border shadow-sm p-2 overflow-x-auto animate-in fade-in slide-in-from-top-1 duration-150">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range);
                    // Collapse once a full range is picked.
                    if (range?.from && range?.to) setIsDateOpen(false);
                  }}
                  numberOfMonths={2}
                  disabled={(date) => date > new Date()}
                  className="rounded-md"
                />
              </div>
            )}
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-px flex-shrink-0 text-primary" />
              <span>
                {dateRange?.from && dateRange?.to ? (
                  <>
                    The report will include every question{" "}
                    <span className="font-medium text-foreground">
                      created or closed between {format(dateRange.from, "MMM dd")} and{" "}
                      {format(dateRange.to, "MMM dd, yyyy")}
                    </span>{" "}
                    (matching the selected status).
                  </>
                ) : (
                  "Pick a range to include questions created OR closed within those dates (matching the selected status)."
                )}
              </span>
            </p>
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
