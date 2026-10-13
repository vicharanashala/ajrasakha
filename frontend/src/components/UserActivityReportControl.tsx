import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "./atoms/button";
import { UserService } from "@/hooks/services/userService";
import { toast } from "sonner";
import {
  DateTimeRangeFilter,
  getDefaultDateTimeRange,
  type DateTimeRangeValue,
} from "./DateTimeRangeFilter";

interface UserActivityReportControlProps {
  userId: string;
  userName?: string;
  userRole?: string;
}

export const UserActivityReportControl = ({
  userId,
  userName = "User",
  userRole,
}: UserActivityReportControlProps) => {
  const [range, setRange] = useState<DateTimeRangeValue>(() =>
    getDefaultDateTimeRange()
  );
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!userId) {
      toast.error("User ID is missing");
      return;
    }

    if (!range.startDate || !range.endDate) {
      toast.error("Please select both start and end date");
      return;
    }

    const startIso = `${range.startDate}T${range.startTime || "00:00"}:00+05:30`;
    const endIso = `${range.endDate}T${range.endTime || "23:59"}:59+05:30`;

    if (new Date(startIso) > new Date(endIso)) {
      toast.error("'From' date and time cannot be after 'To' date and time");
      return;
    }

    try {
      setIsExporting(true);
      toast.info("Generating activity report...");
      const blob = await new UserService().exportUserActivityReport(userId, {
        startDate: startIso,
        endDate: endIso,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const cleanName = (userName || "User").replace(/[^a-zA-Z0-9_-]/g, "_");
      const startTag = `${range.startDate}_${(range.startTime || "00:00").replace(":", "")}`;
      const endTag = `${range.endDate}_${(range.endTime || "23:59").replace(":", "")}`;
      link.download = `${cleanName}_Activity_Report_${startTag}_to_${endTag}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Activity report downloaded successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export report",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-card border rounded-lg p-1.5 shadow-xs">
      {/* Custom Date and Time Filter */}
      <DateTimeRangeFilter
        value={range}
        onChange={setRange}
        disabled={isExporting}
      />

      {/* Export Report Button */}
      <Button
        type="button"
        size="sm"
        onClick={handleExport}
        disabled={isExporting}
        className="h-9 px-3 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-medium rounded-md transition-all shrink-0 cursor-pointer"
        title="Download individual activity report in Excel"
      >
        {isExporting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-3.5 h-3.5" />
        )}
        <span>{isExporting ? "Exporting..." : "Report"}</span>
      </Button>
    </div>
  );
};
