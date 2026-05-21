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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../atoms/select";
import { Label } from "../atoms/label";
import { Activity, AlertTriangle, CalendarIcon, Filter, MapPin } from "lucide-react";
import { STATES, SOURCES } from "../MetaData";
import { ScrollArea } from "../atoms/scroll-area";
import { Calendar } from "../atoms/calendar";
import { useRestartOnView } from "@/hooks/ui/useRestartView";
import CountUp from "react-countup";
import React, { useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
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
}
const colors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

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
const STATE_OPTIONS = STATES.map((s) => ({ value: s, label: s }));
const SOURCE_OPTIONS = SOURCES.map((src) => ({ value: src, label: src }));

type DraftFilters = {
  status: string[];
  analyticsType: "question" | "answer";
  dateRange: { startTime?: Date; endTime?: Date };
  state: string[];
  source: string[];
};

const defaultDraft = (
  status: string[],
  analyticsType: "question" | "answer",
  date: DateRange,
  state: string[],
  source: string[],
): DraftFilters => ({
  status,
  analyticsType,
  dateRange: { startTime: date.startTime, endTime: date.endTime },
  state,
  source,
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
}) => {

  const { ref, key } = useRestartOnView();

  const MAX_RANGE_DAYS = 30;
  const [openFilter, setOpenFilter] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [rangeWarning, setRangeWarning] = useState(false);
  const [draftFilters, setDraftFilters] = useState<DraftFilters>(() =>
    defaultDraft(analyticsStatus, analyticsType, date, analyticsState, analyticsSource),
  );

  const handleApplyFilters = () => {
    if (rangeWarning) return;
    setAnalyticsStatus(draftFilters.status);
    setAnalyticsType(draftFilters.analyticsType);
    setDate(draftFilters.dateRange);
    setAnalyticsState(draftFilters.state);
    setAnalyticsSource(draftFilters.source);
    setOpenFilter(false);
  };

  const handleClearFilters = () => {
    const defaults = defaultDraft([], "question", {}, [], []);
    setDraftFilters(defaults);
    setRangeWarning(false);
    setAnalyticsStatus(defaults.status);
    setAnalyticsType(defaults.analyticsType);
    setDate(defaults.dateRange);
    setAnalyticsState(defaults.state);
    setAnalyticsSource(defaults.source);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setDraftFilters(defaultDraft(analyticsStatus, analyticsType, date, analyticsState, analyticsSource));
      setRangeWarning(false);
      setShowCalendar(false);
    }
    setOpenFilter(open);
  };

  const processedCropWithColors = data.cropData.map((item, index) => ({
    ...item,
    color: colors[index % colors.length],
  }));

  const processedDomainWithColors = data.domainData.map((item, index) => ({
    ...item,
    color: colors[index % colors.length],
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

                {/* Analytics Type */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Analytics Type
                  </Label>
                  <Select
                    value={draftFilters.analyticsType}
                    onValueChange={(value) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        analyticsType: value as "question" | "answer",
                      }))
                    }
                  >
                    <SelectTrigger className="hover:bg-accent/50 hover:text-accent-foreground transition-colors">
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="question">Question</SelectItem>
                      <SelectItem value="answer">Answer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* State */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    State
                  </Label>
                  <MultiSelect
                    items={STATE_OPTIONS}
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

                {/* Date Range — toggle trigger + inline calendar */}
                <div className="sm:col-span-2 space-y-2">
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
                        <span>
                          {format(draftFilters.dateRange.startTime, "MMM d, yyyy")}
                          {" – "}
                          {format(draftFilters.dateRange.endTime, "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span>{format(draftFilters.dateRange.startTime, "MMM d, yyyy")} – pick end</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">Select date range</span>
                    )}
                  </Button>

                  {showCalendar && (
                    <>
                      {rangeWarning && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <p className="text-xs leading-snug">
                            Range exceeds {MAX_RANGE_DAYS} days. Please pick an end date within {MAX_RANGE_DAYS} days of the start.
                          </p>
                        </div>
                      )}
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
                            setRangeWarning(differenceInCalendarDays(next.endTime, next.startTime) > MAX_RANGE_DAYS);
                            setShowCalendar(false);
                          } else {
                            setRangeWarning(false);
                          }
                        }}
                        numberOfMonths={1}
                        className="rounded-md border"
                      />
                      <p className="text-xs text-muted-foreground">Select up to {MAX_RANGE_DAYS} days at a time</p>
                    </>
                  )}
                </div>
              </div>
            <DialogFooter className="gap-2 pt-2 border-t">
              <Button variant="outline" onClick={handleClearFilters}>
                Clear
              </Button>
              <Button onClick={handleApplyFilters} disabled={rangeWarning}>
                Apply Filters
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                          <CountUp key={`crop-${key}`} end={item.count} duration={2} preserveValue />
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
                          <CountUp key={`domainBreakdown-${key}`} end={item.count} duration={2} preserveValue />
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Status breakdown table — State & Crop shown once per group, sources as sub-rows */}
        {(() => {
          const tableData = data.tableData ?? [];

          // Group rows by state+crop
          const groups: { state: string; crop: string; rows: AnalyticsTableRow[] }[] = [];
          for (const row of tableData) {
            const key = `${row.state ?? ""}||${row.crop ?? ""}`;
            const existing = groups.find((g) => `${g.state}||${g.crop}` === key);
            if (existing) {
              existing.rows.push(row);
            } else {
              groups.push({ state: row.state ?? "—", crop: row.crop ?? "—", rows: [row] });
            }
          }

          return (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Status Breakdown by State, Crop & Source
              </h3>
              <div className="rounded-md border overflow-auto max-h-[420px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead className="min-w-[140px]">State</TableHead>
                      <TableHead className="min-w-[140px]">Crop</TableHead>
                      <TableHead className="min-w-[120px]">Source</TableHead>
                      <TableHead className="text-center min-w-[70px]">Open</TableHead>
                      <TableHead className="text-center min-w-[85px]">In Review</TableHead>
                      <TableHead className="text-center min-w-[70px]">Closed</TableHead>
                      <TableHead className="text-center min-w-[70px]">Delayed</TableHead>
                      <TableHead className="text-center min-w-[85px]">Re-routed</TableHead>
                      <TableHead className="text-center min-w-[60px]">Hold</TableHead>
                      <TableHead className="text-center min-w-[110px]">PAE Submitted</TableHead>
                      <TableHead className="text-center min-w-[60px]">Draft</TableHead>
                      <TableHead className="text-center min-w-[80px]">Duplicate</TableHead>
                      <TableHead className="text-center min-w-[60px] font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                          No data available. Apply filters and try again.
                        </TableCell>
                      </TableRow>
                    ) : (
                      groups.map((group) =>
                        group.rows.map((row, rowIdx) => (
                          <TableRow key={`${group.state}-${group.crop}-${rowIdx}`} className="hover:bg-muted/50">
                            {/* State & Crop only on first source row */}
                            {rowIdx === 0 && (
                              <>
                                <TableCell
                                  rowSpan={group.rows.length}
                                  className="text-sm font-medium align-top border-r"
                                >
                                  {group.state}
                                </TableCell>
                                <TableCell
                                  rowSpan={group.rows.length}
                                  className="text-sm align-top border-r"
                                >
                                  {group.crop}
                                </TableCell>
                              </>
                            )}
                            <TableCell className="text-sm text-muted-foreground">{row.source || "—"}</TableCell>
                            <TableCell className="text-center text-sm">{row.open || 0}</TableCell>
                            <TableCell className="text-center text-sm">{row.inReview || 0}</TableCell>
                            <TableCell className="text-center text-sm">{row.closed || 0}</TableCell>
                            <TableCell className="text-center text-sm">{row.delayed || 0}</TableCell>
                            <TableCell className="text-center text-sm">{row.reRouted || 0}</TableCell>
                            <TableCell className="text-center text-sm">{row.hold || 0}</TableCell>
                            <TableCell className="text-center text-sm">{row.paeSubmitted || 0}</TableCell>
                            <TableCell className="text-center text-sm">{row.draft || 0}</TableCell>
                            <TableCell className="text-center text-sm">{row.duplicate || 0}</TableCell>
                            <TableCell className="text-center text-sm font-semibold">{row.total}</TableCell>
                          </TableRow>
                        ))
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
