import { useState } from "react";
import { PerformaneService } from "@/hooks/services/performanceService";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { formatMonthYear } from "@/utils/formateMonthYear";
import { TopRightBadge } from "@/components/NewBadge";

const DownloadLevelWiseReportButton = ({
  closeSideBar,
}: {
  closeSideBar: () => void;
}) => {
  const service = new PerformaneService();
  const [isDownloading, setIsDownloading] = useState(false);
  async function handleLevelWiseReportDownload() {
    try {
      setIsDownloading(true);
      const blob = await service.downloadLevelWiseReport();
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `level_wise_report(Nov-25_to_${formatMonthYear(new Date())}).xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Level Wise report downloaded successfully!");
    } catch (err: any) {
      console.error("Download error:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to download filtered report";
      toast.error(errorMessage);
    } finally {
      setIsDownloading(false);
      closeSideBar();
    }
  }
  return (
    <button
      className="w-full flex items-center justify-between p-0 bg-transparent transition-all"
      disabled={isDownloading}
      onClick={handleLevelWiseReportDownload}
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
  );
};

export default DownloadLevelWiseReportButton;
