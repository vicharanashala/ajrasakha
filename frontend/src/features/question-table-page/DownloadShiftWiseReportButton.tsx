import { useState } from "react";
import { Button } from "../../components/atoms/button";
import { Download, Loader2 } from "lucide-react";
import { formatDateLocal } from "@/utils/formatDate";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogTitle,
} from "@/components/atoms/dialog";
import type { DateRange } from "react-day-picker";
import {
  useShiftBasedAuditActionCounts,
  useShiftBasedLevelDistribution,
  useShiftBasedMetrics,
  useShiftBasedStatusDistribution,
  useShiftBasedTopApprovingExperts,
  useShiftBasedTopExperts,
  useShiftBasedTrends,
} from "@/hooks/api/performance/useGetDashboard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Skeleton } from "@/components/atoms/skeleton";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/atoms/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Cell,
  LabelList,
} from "recharts";
import { Badge } from "@/components/atoms/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { TopRightBadge } from "@/components/NewBadge";
import { toast } from "@/shared/components/toast";


//shift based time range
const shiftBasedTimeRange = {
  morning: { id: 'morning', min: '06:00', max: '15:00' },
  all: { id: 'wholeDay', label: 'All Day', min: '00:00', max: '23:59', },
  evening: { id: 'evening', label: 'Night', min: '15:00', max: '23:59' }
};

// Helper to format 24h to 12h for readable toast messages
const formatTime = (timeStr: string) => {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
};
const DownloadShiftWiseReportButton = ({
  closeSideBar,
  userRole,
}: {
  closeSideBar: () => void;
  userRole: any;
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [source, setSource] = useState<"annam" | "whatsapp" | 'agri_expert'>('annam');

  const defaultStartDate = new Date(Date.now());
  // const defaultEndDate = new Date(Date.now());

  const [downloadDateRange, setDownloadDateRange] = useState<
    DateRange | undefined
  >({
    from: defaultStartDate,
    // to: defaultEndDate,
  });
  const [isDateDialogOpen, setIsDateDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<
    "morning" | "evening" | "all"
  >("morning");

  const startDate = downloadDateRange?.from
    ? formatDateLocal(downloadDateRange.from)
    : "";

  // const endDate = downloadDateRange?.to
  //   ? formatDateLocal(downloadDateRange.to)
  //   : "";

  const [timeRange, setTimeRange] = useState({
    from: shiftBasedTimeRange.all.min,
    to: shiftBasedTimeRange.all.max
  });

  // Handler to update specific parts of the time range with boundary validation
  const handleTimeChange = (field: string, value: string) => {
  if (!value) return;

  const currentShift: any = shiftBasedTimeRange[selectedShift];
  let validTime = value;
  let alertMessage: string | null = null;

  if (validTime < currentShift.min) {
    validTime = currentShift.min;
    alertMessage = `Time adjusted: Earliest time for ${currentShift.id} is ${formatTime(currentShift.min)}`;
  } else if (validTime > currentShift.max) {
    validTime = currentShift.max;
    alertMessage = `Time adjusted: Latest time for ${currentShift.id} is ${formatTime(currentShift.max)}`;
  }

  setTimeRange((prev) => {
    let newFrom = field === 'from' ? validTime : prev.from;
    let newTo = field === 'to' ? validTime : prev.to;

    if (newFrom > newTo) {
      if (field === 'from') {
        newTo = newFrom;
        if (!alertMessage) {
          alertMessage =
            '"From" time cannot be later than "To" time. Adjusted.';
        }
      } else {
        newFrom = newTo;
        if (!alertMessage) {
          alertMessage =
            '"To" time cannot be earlier than "From" time. Adjusted.';
        }
      }
    }

    return { from: newFrom, to: newTo };
  });

  if (alertMessage) {
    toast.warning(alertMessage);
  }
};

  const { data: shiftWiseData, isFetching: isShiftWiseDataLoading } =
    useShiftBasedMetrics({
      fromDate: startDate,
      // toDate: endDate,
      shift: selectedShift,
      source,
    });

  const { data: shiftWiseTrends, isFetching: isShiftWiseTrendsLoading } =
    useShiftBasedTrends({
      fromDate: startDate,
      // toDate: endDate,
      shift: selectedShift,
      source,
    });

  const {
    data: questionStatusDistribution,
    isFetching: isQuestionStatusLoading,
  } = useShiftBasedStatusDistribution({
    fromDate: startDate,
    // toDate: endDate,
    shift: selectedShift,
    source,
  });

  const {
    data: questionLevelDistribution,
    isFetching: isQuestionLevelLoading,
  } = useShiftBasedLevelDistribution({
    fromDate: startDate,
    // toDate: endDate,
    shift: selectedShift,
    source,
  });

  const { data: topExperts, isFetching: isTopExpertsLoading } =
    useShiftBasedTopExperts({
      fromDate: startDate,
      // toDate: endDate,
      shift: selectedShift,
      source,
    });

  const { data: topApprovingExperts, isFetching: isTopApproversLoading } =
    useShiftBasedTopApprovingExperts({
      fromDate: startDate,
      // toDate: endDate,
      shift: selectedShift,
      source,
    });

  const { data: auditActionCounts, isFetching: isAuditActionCountsLoading } =
    useShiftBasedAuditActionCounts({
      fromDate: startDate,
      // toDate: endDate,
      shift: selectedShift,
    });

  const formattedAuditActionCounts = (auditActionCounts?.data ?? []).map(
    (item) => {
      const formattedAction = item.action.action
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const formattedCategory = item.action.category
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());

      return {
        ...item,

        yAxisLabel: `(${formattedCategory}) ${formattedAction}`,
      };
    },
  );
  const overviewCards = [
    {
      title: "CarryAway Questions",
      value: shiftWiseData?.openAtMidnight ?? 0,
      toolTip: "Total Questions that doesn't answered before 12am.",
      additional:`${shiftWiseData?.closedBetween12And6 ?? 0} answered after 12am.`
    },

    {
      title: "Questions Added",
      value: shiftWiseData?.questionsAdded ?? 0,
      toolTip: "Total questions added during selected shift and date range.",
    },

    {
      title: "Questions Closed",
      value: shiftWiseData?.questionsClosed ?? 0,
      toolTip: "Total questions closed during selected shift and date range.",
    },

    {
      title: "Average Closure Time",
      value: (shiftWiseData?.averageClosureTimeInMinutes ?? 0) + " m",
      toolTip:
        "Average time taken to close questions that were opened during the selected shift and date range.",
    },

    {
      title: "Total Rerouted Questions",
      value: shiftWiseData?.totalReroutedQuestions ?? 0,
      toolTip:
        "Total questions rerouted that were opened during the selected shift and date range.",
    },
  ];

  async function handleShiftWiseReportDownload() {
    try {
      setIsDownloading(true);

      const rows: string[] = [];

      /**
       *
       * Heading
       */
      rows.push(`Shift Selected,${selectedShift}`);
      rows.push("");

      rows.push(`Date,${String(downloadDateRange?.from?.toDateString())}`);
      // rows.push(`To,${String(downloadDateRange?.to)}`);

      rows.push("");
      rows.push("");
      /**
       * OVERVIEW
       */
      rows.push("OVERVIEW");
      rows.push("Metric,Value");

      overviewCards.forEach((item) => {
        rows.push(`"${item.title}","${item.value}"`);
      });

      rows.push("");

      /**
       * QUESTIONS TRENDS
       */
      rows.push("QUESTIONS ADDED VS CLOSED");
      rows.push("Hour,Questions Added,Questions Closed");

      (shiftWiseTrends ?? []).forEach((item) => {
        rows.push(`"${item.hour}","${item.added}","${item.closed}"`);
      });

      rows.push("");

      /**
       * STATUS DISTRIBUTION
       */
      rows.push("STATUS DISTRIBUTION");
      rows.push("Status,Count");

      (questionStatusDistribution ?? []).forEach((item) => {
        rows.push(`"${item.status}","${item.count}"`);
      });

      rows.push("");

      /**
       * LEVEL DISTRIBUTION
       */
      rows.push("LEVEL DISTRIBUTION");
      rows.push("Level,Count");

      (questionLevelDistribution ?? []).forEach((item) => {
        rows.push(`"${item.level}","${item.count}"`);
      });

      rows.push("");

      /**
       * TOP EXPERTS
       */
      rows.push("TOP EXPERTS");
      rows.push("Name,Reviews,Reputation,Incentive,Penalty");

      (topExperts ?? []).forEach((expert) => {
        rows.push(
          `"${expert.name}","${expert.reviewCount}","${expert.reputation}","${expert.incentive ? expert.incentive : 0}","${expert.penalty ? expert.penalty : 0}"`,
        );
      });

      rows.push("");

      /**
       * TOP APPROVERS
       */
      rows.push("TOP APPROVERS");
      rows.push("Name,Approvals,Reputation,Incentive,Penalty");

      (topApprovingExperts ?? []).forEach((expert) => {
        rows.push(`"${expert.name}","${expert.approvedCount}"`);
      });

      rows.push("");

      /**
       * AUDIT ACTIONS
       */
      rows.push("AUDIT ACTIONS");
      rows.push("Action,Count");

      formattedAuditActionCounts.forEach((item) => {
        rows.push(`"${item.yAxisLabel}","${item.count}"`);
      });

      /**
       * CREATE CSV
       */
      const csvContent = rows.join("\n");

      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });

      /**
       * DOWNLOAD
       */
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;

      link.download = `shift_wise_report_${startDate}.csv`;

      document.body.appendChild(link);

      link.click();

      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);

      toast.success("Shift-wise report downloaded successfully!");

      // setIsDateDialogOpen(false);
    } catch (err) {
      console.error(err);

      toast.error("Failed to generate report");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Dialog open={isDateDialogOpen} onOpenChange={setIsDateDialogOpen}>
      <DialogTrigger asChild className="relative">
        <button
          className="w-full flex items-center justify-between p-0 bg-transparent transition-all "
          disabled={isDownloading}
          onClick={() => closeSideBar()}
        >
          <TopRightBadge label="new" left={0} />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-100 dark:bg-cyan-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              {isDownloading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Download className="h-5 w-5" />
              )}
            </div>
            <div className="text-left">
              <p className="text-sm relative font-bold text-gray-900 dark:text-white">
                {isDownloading ? "Downloading..." : "Shift-Based Report"}
              </p>
              <p className="text-[11px] text-gray-500">
                Shift-Based Review Analytics
              </p>
            </div>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent
        className="
          !w-[98vw]
          !max-w-none
          !h-[98vh]
          overflow-hidden
          p-0
          flex
          flex-col
        "
      >
        <DialogTitle className="display-none"></DialogTitle>
        <DialogHeader className=" flex-shrink-0 items-center">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Shift Analytics Dashboard
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Monitor review workflow, shift productivity, moderator
                efficiency, and expert performance.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Select Source
                </label>

                <select
                  value={source}
                  onChange={(e) =>
                    setSource(
                      e.target.value as "annam" | "whatsapp" | "agri_expert",
                    )
                  }
                  className="
                          h-7
                          rounded-md
                          border
                          bg-background
                          px-3
                          text-sm
                        "
                >
                  <option value="annam">Annam</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="agri_expert">AgriExpert</option>
                </select>
              </div>
              
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Select Shift
                </label>

                <select
                  value={selectedShift}
                  onChange={(e) => {
                    const newShiftId = e.target.value as "morning" | "evening" | "all";

                    setSelectedShift(newShiftId);

                    setTimeRange({
                      from: shiftBasedTimeRange[newShiftId].min,
                      to: shiftBasedTimeRange[newShiftId].max,
                    });
                  }}
                  className="
                          h-7
                          rounded-md
                          border
                          bg-background
                          px-3
                          text-sm
                        "
                >
                  <option value="morning">Morning Shift</option>
                  <option value="evening">Evening Shift</option>
                  <option value="all">Whole Day</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Select Date
                </label>

                <input
                  type="date"
                  value={startDate}
                  onChange={(e) =>
                    setDownloadDateRange((prev) => ({
                      from: new Date(e.target.value),
                      // to: prev?.to,
                    }))
                  }
                  className="
                            h-7
                            rounded-md
                            border
                            bg-background
                            px-3
                            text-sm
                          "
                />
              </div>

              {/* --- Start of the Custom Time Filter --- */}


              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Select Time Range
                </label>

                <div className="flex items-end gap-1">
                  {/* FROM Input */}
                  <div className="flex flex-col gap-1 flex-1">
                    <input
                      type="time"
                      min={shiftBasedTimeRange[selectedShift].min}
                      max={shiftBasedTimeRange[selectedShift].max}
                      value={timeRange.from}
                      onChange={(e) => handleTimeChange('from', e.target.value)}
                      className="
                      h-7
                      rounded-md
                      border
                      bg-background
                      px-3
                      text-sm
                      "
                    />
                  </div>

                  <div className="h-7 flex items-center justify-center text-neutral-300 pb-1">
                    —
                  </div>

                  {/* TO Input */}
                  <div className="flex flex-col gap-1 flex-1">
                    <input
                      type="time"
                      min={shiftBasedTimeRange[selectedShift].min}
                      max={shiftBasedTimeRange[selectedShift].max}
                      value={timeRange.to}
                      onChange={(e) => handleTimeChange('to', e.target.value)}
                      className="
                      h-7
                      rounded-md
                      border
                      bg-background
                      px-3
                      text-sm
                      "
                    />
                  </div>
                </div>
              </div>

              {/* --- End of the Custom Time Filter --- */}

              {/* <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  End Date
                </label>

                <input
                  type="date"
                  value={endDate}
                  onChange={(e) =>
                    setDownloadDateRange((prev) => ({
                      from: prev?.from,
                      to: new Date(e.target.value),
                    }))
                  }
                  className="
                          h-7
                          rounded-md
                          border
                          bg-background
                          px-3
                          text-sm
                        "
                />
              </div> */}
              {/* </div> */}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <div className="min-h-screen bg-background p-6">
            <div className="w-full max-w-none space-y-6 p-6">
              {/* Overview Cards */}
              <section className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  {overviewCards.map((card) => (
                    <Card key={card.title} title={card.title}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                          {card.title}
                        </CardTitle>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="
                                  flex h-4 w-4 items-center justify-center
                                  rounded-full border text-[10px]
                                  cursor-pointer
                                "
                              >
                                i
                              </span>
                            </TooltipTrigger>

                            <TooltipContent>
                              <p>{card.toolTip}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </CardHeader>

                      <CardContent>
                        {isShiftWiseDataLoading ? (
                          <Skeleton className="h-8 w-20" />
                        ) : (
                        <div className="flex flex-col space-y-2 pt-1">
                          <div className="text-3xl font-bold">{card.value}</div>
                          {card.additional && (
                            <div className="inline-flex w-fit items-center rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700 border border-green-200">
                              {card.additional}
                            </div>
                          )}
                        </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>

              {/* Expert Analytics */}

              <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
                <Card className="w-full h-full min-w-0">
                  <CardHeader>
                    <div className="flex justify-between">
                      <CardTitle>Top Five Experts/STF</CardTitle>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="
                                  flex h-4 w-4 items-center justify-center
                                  rounded-full border text-[10px]
                                  cursor-pointer
                                "
                            >
                              i
                            </span>
                          </TooltipTrigger>

                          <TooltipContent>
                            <p>
                              Displays the top 5 experts/STF members based on
                              total reviews completed during the selected shift
                              and date range.{" "}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Highest review throughput experts.
                    </p>
                  </CardHeader>

                  <CardContent>
                    {isTopExpertsLoading ? (
                      <div className="flex h-[320px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : topExperts?.length ? (
                      <div className="space-y-4">
                        {(topExperts ?? []).map((expert, index) => {
                          const rankColors = [
                            "bg-yellow-500",
                            "bg-slate-400",
                            "bg-amber-700",
                            "bg-primary",
                            "bg-secondary",
                          ];

                          return (
                            <div
                              key={expert.userId}
                              className="
                                flex items-center justify-between
                                rounded-xl border p-1
                                transition-colors
                                hover:bg-muted/40
                              "
                            >
                              {/* LEFT */}
                              <div className="flex items-center gap-2">
                                {/* Rank */}
                                <div
                                  className={`
                                    flex h-8 w-8 items-center
                                    justify-center rounded-full
                                    text-sm font-bold text-white
                                    ${rankColors[index]}
                                  `}
                                >
                                  #{index + 1}
                                </div>

                                {/* User */}
                                <div>
                                  <h4 className="font-semibold">
                                    {expert.name}
                                  </h4>

                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">
                                      Reputation: {expert.reputation}
                                    </Badge>

                                    <Badge variant="outline">
                                      Incentive:
                                      {expert.incentive ? expert.incentive : 0}
                                    </Badge>

                                    <Badge variant="destructive">
                                      Penalty:
                                      {expert.penalty ? expert.penalty : 0}
                                    </Badge>
                                  </div>
                                </div>
                              </div>

                              {/* RIGHT */}
                              <div className="text-right">
                                <div className="text-3xl font-bold">
                                  {expert.reviewCount}
                                </div>

                                <p className="text-sm text-muted-foreground">
                                  Reviews
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>No activity found</>
                    )}
                  </CardContent>
                </Card>

                <Card className="w-full h-full min-w-0">
                  <CardHeader>
                    <div className="flex justify-between">
                      <CardTitle>Moderator Approvals Rankings</CardTitle>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="
                                  flex h-4 w-4 items-center justify-center
                                  rounded-full border text-[10px]
                                  cursor-pointer
                                "
                            >
                              i
                            </span>
                          </TooltipTrigger>

                          <TooltipContent>
                            <p>
                              Displays the top moderators ranked by total
                              approved reviews during the selected shift and
                              date range.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Top moderators by approvals.
                    </p>
                  </CardHeader>

                  <CardContent>
                    {isTopApproversLoading ? (
                      <div className="flex h-[320px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : topApprovingExperts?.length ? (
                      <div className="space-y-4">
                        {(topApprovingExperts ?? []).map((expert, index) => {
                          const rankColors = [
                            "bg-yellow-500",
                            "bg-slate-400",
                            "bg-amber-700",
                            "bg-primary",
                            "bg-secondary",
                          ];

                          return (
                            <div
                              key={expert.userId}
                              className="
                                flex items-center justify-between
                                rounded-xl border p-1
                                transition-colors
                                hover:bg-muted/40
                              "
                            >
                              {/* LEFT */}
                              <div className="flex items-center gap-2">
                                {/* Rank */}
                                <div
                                  className={`
                                    flex h-8 w-8 items-center
                                    justify-center rounded-full
                                    text-sm font-bold text-white
                                    ${rankColors[index]}
                                  `}
                                >
                                  #{index + 1}
                                </div>

                                {/* User */}
                                <div>
                                  <h4 className="font-semibold">
                                    {expert.name}
                                  </h4>
                                </div>
                              </div>

                              {/* RIGHT */}
                              <div className="text-right">
                                <div className="text-3xl font-bold">
                                  {expert.approvedCount}
                                </div>

                                <p className="text-sm text-muted-foreground">
                                  Approvals
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>No activity found</>
                    )}
                  </CardContent>
                </Card>
              </section>

              {/* Question Analytics */}
              <section className="space-y-6">
                <Card className="w-full">
                  <CardHeader>
                    <div className="flex justify-between">
                      <CardTitle>Questions Added vs Closed</CardTitle>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="
                                  flex h-4 w-4 items-center justify-center
                                  rounded-full border text-[10px]
                                  cursor-pointer
                                "
                            >
                              i
                            </span>
                          </TooltipTrigger>

                          <TooltipContent>
                            <p>
                              Displays hourly question additions and closures
                              for the selected shift and date range.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Compare operational throughput trends.
                    </p>
                  </CardHeader>

                  <CardContent>
                    {isShiftWiseTrendsLoading ? (
                      <div className="flex h-[320px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <ChartContainer
                        className="h-[320px] w-full"
                        config={{
                          added: {
                            label: "Questions Added",
                            color: "#22c55e",
                          },

                          closed: {
                            label: "Questions Closed",
                            color: "#3b82f6",
                          },
                        }}
                      >
                        <BarChart
                          accessibilityLayer
                          data={shiftWiseTrends ?? []}
                          margin={{
                            top: 20,
                            right: 20,
                            left: 0,
                            bottom: 0,
                          }}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="hour"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                            interval="preserveStartEnd"
                            minTickGap={30}
                            tick={{ fontSize: 11 }}
                          />

                          <YAxis tickLine={false} axisLine={false} />

                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent />}
                          />

                          <ChartLegend content={<ChartLegendContent />} />

                          <Bar
                            dataKey="added"
                            fill="var(--color-added)"
                            radius={[6, 6, 0, 0]}
                          />

                          <Bar
                            dataKey="closed"
                            fill="var(--color-closed)"
                            radius={[6, 6, 0, 0]}
                          />
                        </BarChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
                {/* <div className="flex sapace-x-6 w-full"> */}
                <Card>
                  <CardHeader>
                    <div className="flex justify-between">
                      <CardTitle>Question Status Distribution</CardTitle>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="
                                  flex h-4 w-4 items-center justify-center
                                  rounded-full border text-[10px]
                                  cursor-pointer
                                "
                            >
                              i
                            </span>
                          </TooltipTrigger>

                          <TooltipContent>
                            <p>
                              Current status of questions added in selected
                              shift and date range on particular hour
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Current workflow queue distribution.
                    </p>
                  </CardHeader>

                  <CardContent>
                    {isQuestionStatusLoading ? (
                      <div className="flex h-[320px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : questionStatusDistribution?.length ? (
                      <ChartContainer
                        className="h-[380px] w-full"
                        config={{
                          count: {
                            label: "Questions",
                            color: "#22c55e",
                          },
                        }}
                      >
                        <BarChart
                          accessibilityLayer
                          data={[...(questionStatusDistribution ?? [])].sort(
                            (a, b) => b.count - a.count,
                          )}
                          layout="vertical"
                          margin={{
                            left: 20,
                            right: 20,
                            top: 10,
                            bottom: 10,
                          }}
                        >
                          <CartesianGrid horizontal={false} />

                          <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                          />

                          <YAxis
                            dataKey="status"
                            type="category"
                            tickLine={false}
                            axisLine={false}
                            width={110}
                            tick={{
                              fontSize: 12,
                            }}
                          />

                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent />}
                          />

                          <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                            {(questionStatusDistribution ?? []).map(
                              (entry, index) => {
                                const statusColors: Record<string, string> = {
                                  open: "#3b82f6",
                                  "in-review": "#8b5cf6",
                                  closed: "#22c55e",
                                  delayed: "#f59e0b",
                                  "re-routed": "#eab308",
                                  hold: "#ef4444",
                                  pae_submitted: "#06b6d4",
                                  draft: "#6b7280",
                                  pass: "#10b981",
                                  duplicate: "#64748b",
                                };

                                return (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={
                                      statusColors[entry.status] || "#8884d8"
                                    }
                                  />
                                );
                              },
                            )}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <>No activity found</>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex justify-between">
                      <CardTitle>Review Level Distribution</CardTitle>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="
                                  flex h-4 w-4 items-center justify-center
                                  rounded-full border text-[10px]
                                  cursor-pointer
                                "
                            >
                              i
                            </span>
                          </TooltipTrigger>

                          <TooltipContent>
                            <p>
                              Displays level-wise questions count that were
                              added in the selected shift and date range.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Current workflow depth across questions.
                    </p>
                  </CardHeader>

                  <CardContent>
                    {isQuestionLevelLoading ? (
                      <div className="flex h-[320px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : questionLevelDistribution?.length ? (
                      <ChartContainer
                        className="h-[360px] w-full"
                        config={{
                          count: {
                            label: "Questions",
                            color: "#8b5cf6",
                          },
                        }}
                      >
                        <BarChart
                          accessibilityLayer
                          data={questionLevelDistribution ?? []}
                          margin={{
                            top: 20,
                            right: 20,
                            left: 0,
                            bottom: 10,
                          }}
                        >
                          <CartesianGrid vertical={false} />

                          <XAxis
                            dataKey="level"
                            tickFormatter={(value) =>
                              value === "Level 0"
                                ? "Level 0 (With Author)"
                                : value
                            }
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                            tick={{
                              fontSize: 12,
                            }}
                          />

                          <YAxis tickLine={false} axisLine={false} />

                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent />}
                          />

                          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                            {(questionLevelDistribution ?? []).map(
                              (entry, index) => {
                                const level = Number(
                                  entry.level.replace("Level ", ""),
                                );

                                let color = "#516572";
                                if (level > 0) {
                                }

                                if (level >= 1) {
                                  color = "#3b82f6";
                                }

                                if (level >= 3) {
                                  color = "#f59e0b";
                                }

                                if (level >= 5) {
                                  color = "#ef4444";
                                }

                                return (
                                  <Cell key={`cell-${index}`} fill={color} />
                                );
                              },
                            )}

                            <LabelList
                              dataKey="count"
                              position="top"
                              className="fill-foreground text-xs"
                            />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <>No activity found</>
                    )}
                  </CardContent>
                </Card>
                {/* </div> */}
              </section>

              <Card className="w-full">
                <CardHeader>
                  <div className="flex justify-between">
                    <CardTitle>Audit Action Analytics</CardTitle>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="
                              flex h-4 w-4 items-center justify-center
                              rounded-full border text-[10px]
                              cursor-pointer
                            "
                          >
                            i
                          </span>
                        </TooltipTrigger>

                        <TooltipContent>
                          <p>
                            Displays frequency of operational actions during the
                            selected shift and date range.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Operational workflow/manual activity distribution.
                  </p>
                </CardHeader>

                <CardContent>
                  {isAuditActionCountsLoading ? (
                    <div className="flex h-[500px] items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : formattedAuditActionCounts?.length ? (
                    <ChartContainer
                      className="w-full"
                      style={{
                        height: `${Math.max(
                          formattedAuditActionCounts?.length * 45,
                          300,
                        )}px`,
                      }}
                      config={{
                        count: {
                          label: "Actions",
                          color: "#3b82f6",
                        },
                      }}
                    >
                      <BarChart
                        accessibilityLayer
                        data={[...formattedAuditActionCounts].sort(
                          (a, b) => b.count - a.count,
                        )}
                        layout="vertical"
                        margin={{
                          left: 20,
                          right: 30,
                          top: 10,
                          bottom: 10,
                        }}
                      >
                        <CartesianGrid horizontal={false} />

                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                        />

                        <YAxis
                          dataKey="yAxisLabel"
                          type="category"
                          tickLine={false}
                          axisLine={false}
                          width={320}
                          tick={{
                            fontSize: 11,
                          }}
                        />

                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent />}
                        />

                        <Bar
                          dataKey="count"
                          radius={[0, 8, 8, 0]}
                          fill="var(--color-count)"
                        >
                          <LabelList
                            dataKey="count"
                            position="right"
                            className="fill-foreground text-xs"
                          />
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <div
                      className="
                        flex h-[300px] flex-col items-center justify-center
                        rounded-xl border border-dashed
                        text-center
                      "
                    >
                      <p className="text-sm font-medium text-muted-foreground">
                        No audit activity found
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {userRole === "admin" && (
          <DialogFooter className="gap-2 pt-3 flex-shrink-0 m-1">
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
              onClick={handleShiftWiseReportDownload}
              disabled={!downloadDateRange?.from || isDownloading}
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
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DownloadShiftWiseReportButton;
