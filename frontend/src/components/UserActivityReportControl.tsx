import { useState } from "react";
import { FileSpreadsheet, Loader2, Calendar, Clock, Filter } from "lucide-react";
import { Button } from "./atoms/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./atoms/popover";
import { TimePicker } from "./dashboard/time-picker";
import { UserService } from "@/hooks/services/userService";
import { toast } from "sonner";

type ViewType = "year" | "month" | "week" | "day";

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
  const [viewType, setViewType] = useState<ViewType>("year");
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear().toString(),
  );

  const getTodayDefaults = () => {
    const today = new Date();
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const month = monthNames[today.getMonth()];
    const weekNumber = Math.ceil(today.getDate() / 7);
    const week = `Week ${Math.min(weekNumber, 5)}`;
    const day = dayNames[today.getDay()];
    return { month, week, day };
  };

  const todayDefaults = getTodayDefaults();
  const [selectedMonth, setSelectedMonth] = useState(todayDefaults.month);
  const [selectedWeek, setSelectedWeek] = useState(todayDefaults.week);
  const [selectedDay, setSelectedDay] = useState(todayDefaults.day);
  const [customStartDateTime, setCustomStartDateTime] = useState<string>("");
  const [customEndDateTime, setCustomEndDateTime] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);

  const getLast10Years = () => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => currentYear - i);
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const handleSetViewType = (v: ViewType) => {
    const defaults = getTodayDefaults();
    setSelectedMonth(defaults.month);
    setSelectedWeek(defaults.week);
    setSelectedDay(defaults.day);
    setViewType(v);
  };

  const handleExport = async () => {
    if (!userId) {
      toast.error("User ID is missing");
      return;
    }

    try {
      setIsExporting(true);
      toast.info("Generating activity report...");
      const blob = await new UserService().exportUserActivityReport(userId, {
        viewType,
        selectedYear,
        selectedMonth,
        selectedWeek,
        selectedDay,
        customStartDateTime: customStartDateTime || undefined,
        customEndDateTime: customEndDateTime || undefined,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const cleanName = (userName || "User").replace(/[^a-zA-Z0-9_-]/g, "_");
      link.download = `${cleanName}_Activity_Report_${viewType}_${selectedYear}.xlsx`;
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
    <div className="flex flex-wrap items-center gap-2 bg-card border rounded-lg p-2 shadow-sm">
      {/* View Type Switcher */}
      <div className="flex items-center bg-muted/60 p-1 rounded-md gap-1">
        {(["year", "month", "week", "day"] as ViewType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => handleSetViewType(type)}
            className={`px-2.5 py-1 text-xs font-semibold rounded capitalize transition-all ${
              viewType === type
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Year Select */}
      <Select value={selectedYear} onValueChange={setSelectedYear}>
        <SelectTrigger className="h-8 w-[95px] text-xs">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {getLast10Years().map((yr) => (
            <SelectItem key={yr} value={String(yr)} className="text-xs">
              {yr}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Month Select */}
      {(viewType === "month" || viewType === "week" || viewType === "day") && (
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {monthNames.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Week Select */}
      {(viewType === "week" || viewType === "day") && (
        <Select value={selectedWeek} onValueChange={setSelectedWeek}>
          <SelectTrigger className="h-8 w-[95px] text-xs">
            <SelectValue placeholder="Week" />
          </SelectTrigger>
          <SelectContent>
            {["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"].map((w) => (
              <SelectItem key={w} value={w} className="text-xs">
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Day Select */}
      {viewType === "day" && (
        <Select value={selectedDay} onValueChange={setSelectedDay}>
          <SelectTrigger className="h-8 w-[85px] text-xs">
            <SelectValue placeholder="Day" />
          </SelectTrigger>
          <SelectContent>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <SelectItem key={d} value={d} className="text-xs">
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Time Filter Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-8 px-2.5 text-xs gap-1.5 ${
              customStartDateTime || customEndDateTime
                ? "border-primary text-primary bg-primary/5"
                : "text-muted-foreground"
            }`}
            title="Time of day filter"
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {customStartDateTime || customEndDateTime
                ? `${customStartDateTime || "00:00"} - ${customEndDateTime || "23:59"}`
                : "Time"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4 space-y-3" align="end">
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary" />
            <span>Time Range Filter (IST)</span>
          </div>
          <div className="flex items-center gap-3">
            <TimePicker
              value={customStartDateTime}
              onChange={setCustomStartDateTime}
              label="Start Time"
            />
            <TimePicker
              value={customEndDateTime}
              onChange={setCustomEndDateTime}
              label="End Time"
            />
          </div>
          {(customStartDateTime || customEndDateTime) && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setCustomStartDateTime("");
                  setCustomEndDateTime("");
                }}
              >
                Clear Time
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Export Button */}
      <Button
        size="sm"
        onClick={handleExport}
        disabled={isExporting}
        className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-medium"
      >
        {isExporting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileSpreadsheet className="w-3.5 h-3.5" />
        )}
        <span>Report</span>
      </Button>
    </div>
  );
};
