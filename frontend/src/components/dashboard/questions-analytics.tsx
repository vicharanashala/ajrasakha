"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/atoms/tabs";
import { Label } from "../atoms/label";
import { CalendarIcon, Download, Filter, MapPin } from "lucide-react";
import { SOURCES, CROPS } from "../MetaData";
import { ScrollArea } from "../atoms/scroll-area";
import { Calendar } from "../atoms/calendar";
import { useRestartOnView } from "@/hooks/ui/useRestartView";
import CountUp from "react-countup";
import React, { useState } from "react";
import { format } from "date-fns";
import { useGetStates } from "@/hooks/api/location/useLocations";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../atoms/dialog";
import { Button } from "../atoms/button";
import { MultiSelect } from "../atoms/MultiSelect";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../atoms/table";
import {
  Tooltip as UITooltip,
  TooltipContent as UITooltipContent,
  TooltipProvider as UITooltipProvider,
  TooltipTrigger as UITooltipTrigger,
} from "../atoms/tooltip";

export interface DateRange {
  startTime?: Date;
  endTime?: Date;
}

interface QuestionsAnalyticsProps {
  date: DateRange;
  setDate: React.Dispatch<React.SetStateAction<DateRange>>;
  data: QuestionsAnalytics;
  setAnalyticsType: (value: "question" | "answer") => void;
  analyticsType: "question" | "answer";
  analyticsStatus: string[];
  setAnalyticsStatus: (value: string[]) => void;
  analyticsState: string[];
  setAnalyticsState: (value: string[]) => void;
  analyticsSource: string[];
  setAnalyticsSource: (value: string[]) => void;
  analyticsCrop: string[];
  setAnalyticsCrop: (value: string[]) => void;
}
const colors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

// For items beyond the first 5 (which use the CSS chart vars above),
// generate a unique HSL color from the item's index so every additional
// crop/domain gets its own distinct color automatically.
const extendedColor = (index: number): string => {
  // Offset the index so we don't overlap with the 5 CSS-var hues (approx 0°,120°,60°,200°,30°)
  const hue = ((index - 5) * 137.508 + 250) % 360; // golden-angle stepping, offset from chart vars
  const saturation = 55 + (index % 3) * 8;          // 55 / 63 / 71 %
  const lightness  = 42 + (index % 4) * 5;          // 42 / 47 / 52 / 57 %
  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`;
};

const getItemColor = (index: number): string =>
  index < colors.length ? colors[index] : extendedColor(index);

// Custom tooltip for the domain pie chart — shows breakdown when hovering "Others"
const DomainPieTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload as AnalyticsItem & { color: string };

  if (entry.name === "Others" && entry.otherItems?.length) {
    const sorted = [...entry.otherItems].sort((a, b) => b.count - a.count);
    return (
      <div
        style={{
          backgroundColor: "var(--color-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius)",
          color: "var(--color-foreground)",
          padding: "10px 14px",
          minWidth: 180,
          maxHeight: 260,
          overflowY: "auto",
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: 6 }}>Others</p>
        {sorted.map((item) => (
          <div
            key={item.name}
            style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13, marginBottom: 3 }}
          >
            <span>{item.name}</span>
            <span style={{ fontWeight: 600 }}>{item.count}</span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            fontSize: 13,
            fontWeight: 700,
            borderTop: "1px solid var(--color-border)",
            marginTop: 6,
            paddingTop: 6,
          }}
        >
          <span>Total</span>
          <span>{entry.count}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        color: "var(--color-foreground)",
        padding: "8px 12px",
        fontSize: 13,
      }}
    >
      <p style={{ fontWeight: 600 }}>{entry.name}</p>
      <p>{entry.count}</p>
    </div>
  );
};

export interface AnalyticsItem {
  name: string;
  count: number;
  otherItems?: { name: string; count: number }[];
}

export interface AnalyticsTableRow {
  state?: string;
  crop?: string;
  source?: string;
  open: number;
  closed: number;
  inReview: number;
  delayed: number;
  reRouted: number;
  hold: number;
  paeSubmitted: number;
  draft: number;
  duplicate: number;
  total: number;
  /** Most recent createdAt date across questions in this group */
  lastPushedDate?: string;
  /** Most recent closedAt date across questions in this group */
  lastClosedDate?: string;
  /** Percentage of questions closed: (closed / total) * 100 */
  completionPct: number;
}

export interface QuestionsAnalytics {
  cropData: AnalyticsItem[];
  stateData: AnalyticsItem[];
  domainData: AnalyticsItem[];
  tableData: AnalyticsTableRow[];
}

// Module-level constants — computed once, never recreated on render
const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in-review", label: "In Review" },
  { value: "closed", label: "Closed" },
  { value: "delayed", label: "Delayed" },
  { value: "re-routed", label: "Re-routed" },
  { value: "hold", label: "Hold" },
  { value: "pae_submitted", label: "PAE Submitted" },
  { value: "draft", label: "Draft" },
  { value: "duplicate", label: "Duplicate" },
];
const SOURCE_OPTIONS = SOURCES.map((src) => ({ value: src, label: src }));
const CROP_OPTIONS = [...CROPS].sort().map((c) => ({ value: c, label: c }));

type DraftFilters = {
  status: string[];
  analyticsType: "question" | "answer";
  dateRange: { startTime?: Date; endTime?: Date };
  state: string[];
  source: string[];
  crop: string[];
};

const defaultDraft = (
  status: string[],
  analyticsType: "question" | "answer",
  date: DateRange,
  state: string[],
  source: string[],
  crop: string[],
): DraftFilters => ({
  status,
  analyticsType,
  dateRange: { startTime: date.startTime, endTime: date.endTime },
  state,
  source,
  crop,
});

export const QuestionsAnalytics: React.FC<QuestionsAnalyticsProps> = ({
  date,
  setDate,
  data,
  setAnalyticsType,
  analyticsType,
  analyticsStatus,
  setAnalyticsStatus,
  analyticsState,
  setAnalyticsState,
  analyticsSource,
  setAnalyticsSource,
  analyticsCrop,
  setAnalyticsCrop,
}) => {

  const { ref, key } = useRestartOnView();

  const { data: states = [] } = useGetStates();
  const stateOptions = states.map((s) => ({ value: s.stateNameEnglish, label: s.stateNameEnglish }));

  const handleDownloadCSV = () => {
    const tableData = data.tableData ?? [];
    if (tableData.length === 0) return;

    const headers = [
      "State",
      "Crop",
      "Source",
      "Open",
      "In Review",
      "Closed",
      "Delayed",
      "Re-routed",
      "Hold",
      "PAE Submitted",
      "Draft",
      "Duplicate",
      "Total",
      "Created At",
      "Closed At",
      "Completion %",
    ];

    const escape = (val: string | number | undefined) => {
      const str = val === undefined || val === null ? "" : String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };

    const rows = tableData.map((row) => [
      escape(row.state ?? "—"),
      escape(row.crop ?? "—"),
      escape(row.source ?? "—"),
      escape(row.open),
      escape(row.inReview),
      escape(row.closed),
      escape(row.delayed),
      escape(row.reRouted),
      escape(row.hold),
      escape(row.paeSubmitted),
      escape(row.draft),
      escape(row.duplicate),
      escape(row.total),
      escape(row.lastPushedDate ? format(new Date(row.lastPushedDate), "dd MMM yyyy") : ""),
      escape(row.lastClosedDate ? format(new Date(row.lastClosedDate), "dd MMM yyyy") : ""),
      escape(`${row.completionPct ?? 0}%`),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `status-breakdown-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const [openFilter, setOpenFilter] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [draftFilters, setDraftFilters] = useState<DraftFilters>(() =>
    defaultDraft(analyticsStatus, analyticsType, date, analyticsState, analyticsSource, analyticsCrop),
  );

  const handleApplyFilters = () => {
    setAnalyticsStatus(draftFilters.status);
    setAnalyticsType(draftFilters.analyticsType);
    setDate(draftFilters.dateRange);
    setAnalyticsState(draftFilters.state);
    setAnalyticsSource(draftFilters.source);
    setAnalyticsCrop(draftFilters.crop);
    setOpenFilter(false);
  };

  const handleClearFilters = () => {
    const defaults = defaultDraft([], "question", {}, [], [], []);
    setDraftFilters(defaults);
    setAnalyticsStatus(defaults.status);
    setAnalyticsType(defaults.analyticsType);
    setDate(defaults.dateRange);
    setAnalyticsState(defaults.state);
    setAnalyticsSource(defaults.source);
    setAnalyticsCrop(defaults.crop);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setDraftFilters(defaultDraft(analyticsStatus, analyticsType, date, analyticsState, analyticsSource, analyticsCrop));
      setShowCalendar(false);
    }
    setOpenFilter(open);
  };

  const processedCropWithColors = data.cropData.map((item, index) => ({
    ...item,
    color: getItemColor(index),
  }));

  const processedDomainWithColors = data.domainData.map((item, index) => ({
    ...item,
    color: getItemColor(index),
  }));

  return (
    <Card ref={ref}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 mb-2">
        <div>
          <CardTitle className="mb-2">Questions & Answers Analytics</CardTitle>
          <CardDescription>
            Breakdown by crop, state, and domain
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleDownloadCSV}
            disabled={(data.tableData ?? []).length === 0}
            title="Download table as CSV"
          >
            <Download className="h-4 w-4 text-primary" />
            Download
          </Button>

          <Dialog open={openFilter} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4 text-primary" />
              Preferences
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl max-w-[95vw] max-h-[90vh] overflow-y-auto min-h-[420px]">
            <DialogHeader>
              <DialogTitle>Analytics Preferences</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                {/* Status */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    Status
                  </Label>
                  <MultiSelect
                    items={STATUS_OPTIONS}
                    selected={draftFilters.status}
                    onChange={(val) => setDraftFilters((prev) => ({ ...prev, status: val }))}
                    placeholder="All Statuses"
                  />
                </div>

                {/* Crop */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    Crop
                  </Label>
                  <MultiSelect
                    items={CROP_OPTIONS}
                    selected={draftFilters.crop}
                    onChange={(val) => setDraftFilters((prev) => ({ ...prev, crop: val }))}
                    placeholder="All Crops"
                  />
                </div>

                {/* State */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    State
                  </Label>
                  <MultiSelect
                    items={stateOptions}
                    selected={draftFilters.state}
                    onChange={(val) => setDraftFilters((prev) => ({ ...prev, state: val }))}
                    placeholder="All States"
                  />
                </div>

                {/* Source */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    Source
                  </Label>
                  <MultiSelect
                    items={SOURCE_OPTIONS}
                    selected={draftFilters.source}
                    onChange={(val) => setDraftFilters((prev) => ({ ...prev, source: val }))}
                    placeholder="All Sources"
                  />
                </div>

                {/* Date Range + Crop — side by side */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    Date Range
                  </Label>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    onClick={() => setShowCalendar((v) => !v)}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {draftFilters.dateRange.startTime ? (
                      draftFilters.dateRange.endTime ? (
                        <span className="truncate text-xs">
                          {format(draftFilters.dateRange.startTime, "MMM d, yy")}
                          {" – "}
                          {format(draftFilters.dateRange.endTime, "MMM d, yy")}
                        </span>
                      ) : (
                        <span className="truncate text-xs">{format(draftFilters.dateRange.startTime, "MMM d, yy")} – pick end</span>
                      )
                    ) : (
                      <span className="text-muted-foreground text-xs">Select date range</span>
                    )}
                  </Button>

                  {showCalendar && (
                    <div className="sm:col-span-2">
                      <Calendar
                        mode="range"
                        selected={{
                          from: draftFilters.dateRange.startTime,
                          to: draftFilters.dateRange.endTime,
                        }}
                        onSelect={(range) => {
                          const next = { startTime: range?.from, endTime: range?.to };
                          setDraftFilters((prev) => ({ ...prev, dateRange: next }));
                          if (next.startTime && next.endTime) {
                            setShowCalendar(false);
                          }
                        }}
                        numberOfMonths={1}
                        className="rounded-md border"
                      />
                    </div>
                  )}
                </div>

              </div>
            <DialogFooter className="gap-2 pt-2 border-t">
              <Button variant="outline" onClick={handleClearFilters}>
                Clear
              </Button>
              <Button onClick={handleApplyFilters}>
                Apply Filters
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="crop" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="crop">By Crop</TabsTrigger>
            <TabsTrigger value="state">By State</TabsTrigger>
            <TabsTrigger value="domain">By Domain</TabsTrigger>
          </TabsList>

          <TabsContent value="crop" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Crop Distribution
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart key={`crop-${key}`}>
                    <Pie
                      data={data.cropData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      // label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      dataKey="count"
                      stroke="none"
                      animationDuration={500}
                    >

                      {processedCropWithColors.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />

                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius)",
                        color: "var(--color-foreground)",
                      }}
                      itemStyle={{
                        color: "var(--color-foreground)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Crop Breakdown
                </h3>

                <ScrollArea className="h-72 rounded-md border p-1">
                  <div className="space-y-2 pr-2">
                    {processedCropWithColors.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-foreground">
                            {item.name.length > 18
                              ? item.name.substring(0, 18) + "..."
                              : item.name}
                          </span>
                        </div>

                        <span className="font-semibold text-foreground">
                          <CountUp key={`crop-${key}`} end={item.count} duration={0.5} preserveValue />
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="state" className="mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Questions by State
            </h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart key={`bar-${key}`} data={data.stateData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 12 }}
                />
                <YAxis stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    color: "var(--color-foreground)",
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="var(--color-chart-2)"
                  radius={[8, 8, 0, 0]}
                  animationDuration={500}
                />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="domain" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Domain Distribution
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart key={`domainDistribution-${key}`}>
                    <Pie
                      data={processedDomainWithColors}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      labelLine={false}
                      // label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      dataKey="count"
                      stroke="none"
                      animationDuration={500}
                    >

                      {processedDomainWithColors.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />

                      ))}
                    </Pie>
                    <Tooltip
                      content={<DomainPieTooltip />}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Domain Breakdown
                </h3>

                <ScrollArea className="h-72 rounded-md border p-1">
                  <div className="space-y-2 pr-2">
                    {processedDomainWithColors.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-foreground">
                            {item.name}
                          </span>
                        </div>

                        <span className="font-semibold text-foreground">
                          <CountUp key={`domainBreakdown-${key}`} end={item.count} duration={0.5} preserveValue />
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Status Breakdown Table ──────────────────────────────────── */}
        {(() => {
          const tableData = data.tableData ?? [];

          type CropGroup = { crop: string; rows: AnalyticsTableRow[] };
          type StateGroup = { state: string; crops: CropGroup[]; totalRows: number };

          const stateGroups: StateGroup[] = [];
          for (const row of tableData) {
            const stateName = row.state ?? "—";
            const cropName = row.crop ?? "—";

            let sg = stateGroups.find((s) => s.state === stateName);
            if (!sg) {
              sg = { state: stateName, crops: [], totalRows: 0 };
              stateGroups.push(sg);
            }

            let cg = sg.crops.find((c) => c.crop === cropName);
            if (!cg) {
              cg = { crop: cropName, rows: [] };
              sg.crops.push(cg);
            }

            cg.rows.push(row);
            sg.totalRows += 1;
          }

          const fmt = (n: number) => (n > 0 ? n : 0);

          return (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Status Breakdown by State, Crop & Source
              </h3>
              <div className="rounded-lg border overflow-auto max-h-[480px]">
                <Table>
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="bg-muted/80 backdrop-blur-sm hover:bg-muted/80">
                      <TableHead className="w-[160px] min-w-[160px] max-w-[160px] font-semibold sticky left-0 z-20 bg-muted/80 backdrop-blur-sm border-r border-border">State</TableHead>
                      <TableHead className="w-[200px] min-w-[200px] max-w-[200px] font-semibold sticky left-[160px] z-20 bg-muted/80 backdrop-blur-sm border-r border-border">Crop</TableHead>
                      <TableHead className="w-[150px] min-w-[150px] max-w-[150px] font-semibold sticky left-[360px] z-20 bg-muted/80 backdrop-blur-sm border-r border-border">Source</TableHead>
                      <TableHead className="text-center min-w-[60px] text-emerald-600 dark:text-emerald-400 font-semibold">Open</TableHead>
                      <TableHead className="text-center min-w-[80px] text-sky-600 dark:text-sky-400 font-semibold">In Review</TableHead>
                      <TableHead className="text-center min-w-[60px] text-rose-600 dark:text-rose-400 font-semibold">Closed</TableHead>
                      <TableHead className="text-center min-w-[70px] text-amber-600 dark:text-amber-400 font-semibold">Delayed</TableHead>
                      <TableHead className="text-center min-w-[80px] text-violet-600 dark:text-violet-400 font-semibold">Re-routed</TableHead>
                      <TableHead className="text-center min-w-[55px] text-slate-600 dark:text-slate-400 font-semibold">Hold</TableHead>
                      <TableHead className="text-center min-w-[100px] text-indigo-600 dark:text-indigo-400 font-semibold">PAE Submitted</TableHead>
                      <TableHead className="text-center min-w-[55px] text-gray-500 dark:text-gray-400 font-semibold">Draft</TableHead>
                      <TableHead className="text-center min-w-[75px] text-orange-600 dark:text-orange-400 font-semibold">Duplicate</TableHead>
                      <TableHead className="text-center min-w-[60px] font-bold">Total</TableHead>
                      <TableHead className="text-center min-w-[110px] text-blue-600 dark:text-blue-400 font-semibold">
                        <UITooltipProvider>
                          <UITooltip>
                            <UITooltipTrigger asChild>
                              <span className="cursor underline decoration-dotted underline-offset-2">Created At</span>
                            </UITooltipTrigger>
                            <UITooltipContent side="top" className="max-w-[220px] text-center">
                              The earliest question creation date in this group (State × Crop × Source)
                            </UITooltipContent>
                          </UITooltip>
                        </UITooltipProvider>
                      </TableHead>
                      <TableHead className="text-center min-w-[110px] text-purple-600 dark:text-purple-400 font-semibold">
                        <UITooltipProvider>
                          <UITooltip>
                            <UITooltipTrigger asChild>
                              <span className="cursor underline decoration-dotted underline-offset-2">Closed At</span>
                            </UITooltipTrigger>
                            <UITooltipContent side="top" className="max-w-[220px] text-center">
                              The most recent date a question in this group was closed
                            </UITooltipContent>
                          </UITooltip>
                        </UITooltipProvider>
                      </TableHead>
                      <TableHead className="text-center min-w-[90px] text-teal-600 dark:text-teal-400 font-semibold">Completion %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stateGroups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={16} className="text-center text-muted-foreground py-10">
                          No data available. Apply filters and try again.
                        </TableCell>
                      </TableRow>
                    ) : (
                      stateGroups.map((sg, stateIdx) =>
                        sg.crops.map((cg, cropIdx) =>
                          cg.rows.map((row, rowIdx) => (
                            <TableRow
                              key={`${sg.state}-${cg.crop}-${rowIdx}`}
                              className={`transition-colors hover:bg-muted/60 ${
                                stateIdx % 2 === 0 ? "bg-transparent" : "bg-muted/25"
                              }`}
                            >
                              {/* State — first row of group */}
                              {cropIdx === 0 && rowIdx === 0 && (
                                <TableCell
                                  rowSpan={sg.totalRows}
                                  className="w-[160px] min-w-[160px] max-w-[160px] text-sm font-semibold align-top border-r border-border/50 bg-muted/30 sticky left-0 z-10"
                                >
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                                    <span className="truncate">{sg.state}</span>
                                  </div>
                                </TableCell>
                              )}
                              {/* Crop — first row of sub-group */}
                              {rowIdx === 0 && (
                                <TableCell
                                  rowSpan={cg.rows.length}
                                  className="w-[200px] min-w-[200px] max-w-[200px] text-sm font-medium align-top border-r border-border/40 bg-background sticky left-[160px] z-10"
                                >
                                  <span className="block truncate" title={cg.crop}>{cg.crop}</span>
                                </TableCell>
                              )}
                              <TableCell className="w-[150px] min-w-[150px] max-w-[150px] text-sm text-muted-foreground bg-background sticky left-[360px] z-10 border-r border-border/40">
                                <span className="block truncate" title={row.source || "—"}>{row.source || "—"}</span>
                              </TableCell>
                              <TableCell className="text-center text-sm">{fmt(row.open)}</TableCell>
                              <TableCell className="text-center text-sm">{fmt(row.inReview)}</TableCell>
                              <TableCell className="text-center text-sm">{fmt(row.closed)}</TableCell>
                              <TableCell className="text-center text-sm">{fmt(row.delayed)}</TableCell>
                              <TableCell className="text-center text-sm">{fmt(row.reRouted)}</TableCell>
                              <TableCell className="text-center text-sm">{fmt(row.hold)}</TableCell>
                              <TableCell className="text-center text-sm">{fmt(row.paeSubmitted)}</TableCell>
                              <TableCell className="text-center text-sm">{fmt(row.draft)}</TableCell>
                              <TableCell className="text-center text-sm">{fmt(row.duplicate)}</TableCell>
                              <TableCell className="text-center text-sm font-bold">{row.total}</TableCell>
                              <TableCell className="text-center text-sm text-blue-600 dark:text-blue-400">
                                {row.lastPushedDate
                                  ? format(new Date(row.lastPushedDate), "dd MMM yyyy")
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-center text-sm text-purple-600 dark:text-purple-400">
                                {row.lastClosedDate
                                  ? format(new Date(row.lastClosedDate), "dd MMM yyyy")
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-center text-sm">
                                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  row.completionPct >= 75
                                    ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300"
                                    : row.completionPct >= 40
                                    ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                                    : "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
                                }`}>
                                  {row.completionPct ?? 0}%
                                </span>
                              </TableCell>
                            </TableRow>
                          ))
                        )
                      )
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
};
