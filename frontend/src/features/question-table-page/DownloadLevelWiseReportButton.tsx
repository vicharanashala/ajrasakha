import { useState } from "react";
import { PerformaneService } from "@/hooks/services/performanceService";
import { formatMonthYear } from "@/utils/formateMonthYear";
import { TopRightBadge } from "@/components/NewBadge";
import { Button } from "../../components/atoms/button";
import { Download, Loader2, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/atoms/dialog";
import MonthYearPicker from "../../components/MonthYearPicker";
import { formatMonthYearLabel } from "../../utils/formatMonthYearLabel";

interface MonthYearRange {
  from: { month: number; year: number } | undefined;
  to: { month: number; year: number } | undefined;
}

const currentYear = new Date().getFullYear();

const DownloadLevelWiseReportButton = ({
  closeSideBar,
}: {
  closeSideBar: () => void;
}) => {
  const service = new PerformaneService();
  const [isDownloading, setIsDownloading] = useState(false);
  const [monthYearRange, setMonthYearRange] = useState<MonthYearRange>({
    from: undefined,
    to: undefined,
  });
  const [isDateDialogOpen, setIsDateDialogOpen] = useState(false);

  async function handleLevelWiseReportDownload() {
    if (!monthYearRange.from || !monthYearRange.to) {
      toast.error("Please select a month range first");
      setIsDateDialogOpen(true);
      return;
    }
    try {
      setIsDownloading(true);
      const fromDate = new Date(
        monthYearRange.from.year,
        monthYearRange.from.month,
        1,
      );
      const toDate = new Date(
        monthYearRange.to.year,
        monthYearRange.to.month + 1,
        0,
      );
      const blob = await service.downloadLevelWiseReport(
        fromDate.toString(),
        toDate.toString(),
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `level_wise_report(Nov-25_to_${formatMonthYear(new Date())}).xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Level Wise report downloaded successfully!");
      setIsDateDialogOpen(false);
    } catch (err: any) {
      console.error("Download error:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to download filtered report";
      toast.error(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  }

  const fromLabel = formatMonthYearLabel(monthYearRange.from);
  const toLabel = formatMonthYearLabel(monthYearRange.to);

  return (
    <Dialog open={isDateDialogOpen} onOpenChange={setIsDateDialogOpen}>
      <DialogTrigger asChild>
        <button
          className="w-full flex items-center justify-between p-0 bg-transparent transition-all"
          disabled={isDownloading}
          onClick={() => closeSideBar()}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              {isDownloading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Download className="h-5 w-5" />
              )}
            </div>
            <div className="text-left">
              <p className="text-sm relative font-bold text-gray-900 dark:text-white">
                {isDownloading ? "Downloading..." : "LevelWise Report"}
                <TopRightBadge label="new" right={0} />
              </p>
              <p className="text-[11px] text-gray-500">
                Submission Report by Level (Monthly)
              </p>
            </div>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm w-full p-5">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-lg font-semibold">
            Select Month Range
          </DialogTitle>
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md border">
            Select a start and end month to download the LevelWise report.
          </div>
        </DialogHeader>

        {/* Selected range display */}
        <div className="flex items-center gap-2 text-xs bg-primary/5 p-2 rounded-md border border-primary/20">
          <CalendarIcon className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="font-medium text-sm">
            {fromLabel && toLabel
              ? `${fromLabel} → ${toLabel}`
              : fromLabel
                ? `${fromLabel} → (select end)`
                : "No range selected"}
          </span>
        </div>

        {/* Month/Year pickers side by side */}
        <div className="flex gap-4 pt-1">
          <MonthYearPicker
            label="From"
            value={monthYearRange.from}
            onChange={(val) =>
              setMonthYearRange((prev) => {
                // If from > to, reset to
                const newTo =
                  prev.to &&
                  (val.year > prev.to.year ||
                    (val.year === prev.to.year && val.month > prev.to.month))
                    ? undefined
                    : prev.to;
                return { from: val, to: newTo };
              })
            }
            minMonthYear={{ month: 10, year: 2025 }}
            maxMonthYear={{ month: new Date().getMonth(), year: currentYear }}
          />
          <div className="w-px bg-border" />
          <MonthYearPicker
            label="To"
            value={monthYearRange.to}
            onChange={(val) =>
              setMonthYearRange((prev) => ({ ...prev, to: val }))
            }
            minMonthYear={monthYearRange.from}
            maxMonthYear={{ month: new Date().getMonth(), year: currentYear }}
          />
        </div>

        <DialogFooter className="gap-2 pt-2 flex-shrink-0">
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
            onClick={handleLevelWiseReportDownload}
            disabled={
              !monthYearRange.from ||
              !monthYearRange.to ||
              isDownloading ||
              monthYearRange.from.year > monthYearRange.to.year ||
              monthYearRange.to.year > currentYear
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
  );
};

export default DownloadLevelWiseReportButton;
