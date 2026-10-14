import { useState } from "react";
import { FileText, Loader2, Mail } from "lucide-react";
import { Button } from "./atoms/button";
import { UserService } from "@/hooks/services/userService";
import { toast } from "sonner";
import {
  DateTimeRangeFilter,
  getDefaultDateTimeRange,
  type DateTimeRangeValue,
} from "./DateTimeRangeFilter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./atoms/alert-dialog";

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
  const [isEmailing, setIsEmailing] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [showEmailConfirmDialog, setShowEmailConfirmDialog] = useState(false);

  const buildReportParams = () => {
    if (!range.startDate || !range.endDate) return null;

    const startIso = `${range.startDate}T${range.startTime || "00:00"}:00+05:30`;
    const endIso = `${range.endDate}T${range.endTime || "23:59"}:59+05:30`;

    if (new Date(startIso) > new Date(endIso)) {
      toast.error("'From' date and time cannot be after 'To' date and time");
      return null;
    }

    return { startDate: startIso, endDate: endIso };
  };

  const handleDownloadReport = async () => {
    setShowActionDialog(false);
    const params = buildReportParams();
    if (!params) {
      toast.error("Please select both start and end date");
      return;
    }

    try {
      setIsExporting(true);
      toast.info("Generating activity report...");
      const blob = await new UserService().exportUserActivityReport(userId, params);

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const cleanName = (userName || "User").replace(/[^a-zA-Z0-9_-]/g, "_");
      const startTag = `${range.startDate}_${(range.startTime || "00:00").replace(":", "")}`;
      const endTag = `${range.endDate}_${(range.endTime || "23:59").replace(":", "")}`;
      link.download = `${cleanName}_Activity_Report_${startTag}_to_${endTag}.pdf`;
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

  const handleSendEmailReport = async () => {
    setShowEmailConfirmDialog(false);
    const params = buildReportParams();
    if (!params) {
      toast.error("Please select both start and end date");
      return;
    }

    try {
      setIsEmailing(true);
      toast.info("Sending activity report via email...");
      await new UserService().exportUserActivityReport(userId, { ...params, sendToEmail: true });
      toast.success("Activity report sent via email successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send report via email",
      );
    } finally {
      setIsEmailing(false);
    }
  };

  const handleButtonClick = () => {
    if (!range.startDate || !range.endDate) {
      toast.error("Please select both start and end date");
      return;
    }
    setShowActionDialog(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-card border rounded-lg p-1.5 shadow-xs">
      {/* Custom Date and Time Filter */}
      <DateTimeRangeFilter
        value={range}
        onChange={setRange}
        disabled={isExporting || isEmailing}
      />

      {/* Export Report Button */}
      <Button
        type="button"
        size="sm"
        onClick={handleButtonClick}
        disabled={isExporting || isEmailing}
        className="h-9 px-3 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-medium rounded-md transition-all shrink-0 cursor-pointer"
        title="Download or email individual activity report in PDF"
      >
        {isExporting || isEmailing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileText className="w-3.5 h-3.5" />
        )}
        <span>{isExporting ? "Exporting..." : isEmailing ? "Sending..." : "Report"}</span>
      </Button>

      {/* Action Selection Dialog */}
      <AlertDialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activity Report</AlertDialogTitle>
            <AlertDialogDescription>
              How would you like to get the activity report for <strong>{userName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowActionDialog(false);
                setShowEmailConfirmDialog(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Mail className="w-4 h-4 mr-2" />
              Send Email
            </AlertDialogAction>
            <AlertDialogAction
              onClick={handleDownloadReport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <FileText className="w-4 h-4 mr-2" />
              Download
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Confirmation Dialog */}
      <AlertDialog open={showEmailConfirmDialog} onOpenChange={setShowEmailConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Report via Email?</AlertDialogTitle>
            <AlertDialogDescription>
              The activity report for <strong>{userName}</strong> will be sent as a PDF attachment to the configured email addresses. Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSendEmailReport}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Mail className="w-4 h-4 mr-2" />
              Yes, Send Email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
