import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useTestersDashboardData } from "./hooks/useTestersDashboardData";
import { Switch } from "@/components/atoms/switch";
import type { ITestersDashboardRecord } from "@/hooks/services/testersDashboardService";

function timeToMinutes(timeStr?: string): number | null {
  if (!timeStr || timeStr === "NA" || timeStr === "NIL" || timeStr === "") return null;
  const trimmed = String(timeStr).trim();
  if (!isNaN(Number(trimmed))) return parseFloat(trimmed);

  const parts = trimmed.split(":");
  if (parts.length >= 3) {
    const hrs = parseFloat(parts[0]) || 0;
    const mins = parseFloat(parts[1]) || 0;
    const secs = parseFloat(parts[2]) || 0;
    return hrs * 60 + mins + secs / 60;
  }
  if (parts.length === 2) {
    const mins = parseFloat(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins + secs / 60;
  }
  return null;
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function trendLabel(score: number): { text: string; className: string } {
  return score >= 80
    ? { text: "↑ Good", className: "text-emerald-600" }
    : { text: "↓ Low", className: "text-red-500" };
}

// NOTE: the source CSV has a typo in this exact column header - a stray
// space in "Respo nse". Kept as-is to match the real data, not a bug here.
const RESPONSE_TIME_KEY = "Respo nse Time (mins) [Auto]";

const EMPTY_FILTERS = {
  dateRange: "all",
  build: "all",
  sprint: "all",
  channel: "all",
  language: "all",
  category: "all",
  tester: "all",
  type: "all",
  status: "all",
  severity: "all",
};

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All Dates" },
  { value: "today", label: "Today" },
  { value: "7days", label: "Last 7 Days" },
  { value: "30days", label: "Last 30 Days" },
  { value: "custom", label: "Custom Range" },
];

const FILTER_FIELDS: { key: keyof typeof EMPTY_FILTERS; csvKey: string; label: string }[] = [
  { key: "build", csvKey: "Build / Version", label: "Build / Version" },
  { key: "sprint", csvKey: "Sprint / Cycle", label: "Sprint / Cycle" },
  { key: "channel", csvKey: "Channel Tested", label: "Channel Tested" },
  { key: "language", csvKey: "Language Tested", label: "Language Tested" },
  { key: "category", csvKey: "Question Category", label: "Question Category" },
  { key: "tester", csvKey: "Tester Name", label: "Tester Name" },
  { key: "type", csvKey: "Type of Question", label: "Type of Question" },
  { key: "status", csvKey: "Overall Test Status", label: "Overall Test Status" },
  { key: "severity", csvKey: "Defect Severity", label: "Defect Severity" },
];

const TAT_STAGES: { name: string; key: string }[] = [
  { name: "Authoring", key: "Author TAT (mins) [Auto]" },
  { name: "Review 1", key: "Review1 TAT (mins) [Auto]" },
  { name: "Review 2", key: "Review2 TAT (mins) [Auto]" },
  { name: "Review 3", key: "Review3 TAT (mins) [Auto]" },
  { name: "Review 4", key: "Review4 TAT (mins) [Auto]" },
  { name: "Review 5", key: "Review5 TAT (mins) [Auto]" },
  { name: "Moderator", key: "Moderator TAT (mins) [Auto]" },
];

export function TestersDashboard() {
  const { data, isLoading, isError } = useTestersDashboardData();
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [excludeFailures, setExcludeFailures] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const allRecords = data?.records ?? [];

  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const field of FILTER_FIELDS) {
      const unique = Array.from(
        new Set(allRecords.map((r) => (r[field.csvKey] || "").trim())),
      )
        .filter((v) => v !== "" && v !== "NA" && v !== "NIL")
        .sort();
      options[field.key] = unique;
    }
    return options;
  }, [allRecords]);

  const filtered = useMemo(() => {
    let rows: ITestersDashboardRecord[] = allRecords;

    if (excludeFailures) {
      rows = rows.filter(
        (r) =>
          r["Question Saved in DB?"] !== "Not Saved" &&
          r["Answer Saved in DB?"] !== "Not Saved" &&
          r["Q-ID Consistent Across Systems?"] !== "Wrongly Identified as Duplicate" &&
          r["Defect Severity"] !== "Critical",
      );
    }

    for (const field of FILTER_FIELDS) {
      const value = filters[field.key];
      if (value !== "all") {
        rows = rows.filter((r) => r[field.csvKey] === value);
      }
    }

    if (filters.dateRange !== "all") {
      const now = new Date();
      rows = rows.filter((r) => {
        const dateStr = r["Test Date"];
        if (!dateStr) return false;
        const rDate = new Date(dateStr);
        if (isNaN(rDate.getTime())) return false;

        if (filters.dateRange === "today") {
          const todayStr = now.toISOString().slice(0, 10);
          return dateStr === todayStr;
        } else if (filters.dateRange === "7days") {
          const diffDays = Math.ceil(Math.abs(now.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 7;
        } else if (filters.dateRange === "30days") {
          const diffDays = Math.ceil(Math.abs(now.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 30;
        } else if (filters.dateRange === "custom") {
          if (customStart && dateStr < customStart) return false;
          if (customEnd && dateStr > customEnd) return false;
          return true;
        }
        return true;
      });
    }

    return rows;
  }, [allRecords, filters, excludeFailures, customStart, customEnd]);

  const kpis = useMemo(() => {
    const N = filtered.length;

    const countSciCorrect = filtered.filter(
      (r) => r["Answer Scientifically Correct?"] === "Correct",
    ).length;
    const A_sci = pct(countSciCorrect, N);

    const weatherRows = filtered.filter(
      (r) => !["NA", "NIL", ""].includes(r["Weather Q Answered Correctly?"]),
    );
    const mandiRows = filtered.filter(
      (r) => !["NA", "NIL", ""].includes(r["Mandi Price Q Correct?"]),
    );
    const schemeRows = filtered.filter(
      (r) => !["NA", "NIL", ""].includes(r["Scheme Q Correct?"]),
    );
    const weatherAcc = weatherRows.length
      ? pct(weatherRows.filter((r) => r["Weather Q Answered Correctly?"] === "Yes").length, weatherRows.length)
      : 100;
    const mandiAcc = mandiRows.length
      ? pct(mandiRows.filter((r) => r["Mandi Price Q Correct?"] === "Yes").length, mandiRows.length)
      : 100;
    const schemeAcc = schemeRows.length
      ? pct(schemeRows.filter((r) => r["Scheme Q Correct?"] === "Yes").length, schemeRows.length)
      : 100;
    const A_dom = Math.round((weatherAcc + mandiAcc + schemeAcc) / 3);

    const S_lnk = pct(
      filtered.filter((r) => r["Source Links Provided?"] === "Provided & Relevant").length,
      N,
    );

    const E_exp = pct(
      filtered.filter(
        (r) => r["Expert Name Displayed?"] === "Displayed" && r["Correct Expert Name?"] === "Yes",
      ).length,
      N,
    );

    const Q_trn = pct(
      filtered.filter(
        (r) => r["Translation Quality"] === "Correct" || r["Translation Quality"] === "Good",
      ).length,
      N,
    );

    const C_chn = pct(
      filtered.filter((r) => r["WhatsApp vs Web Answer Match?"] === "Yes").length,
      N,
    );

    const trustScore = Math.round(
      0.4 * A_sci + 0.2 * A_dom + 0.1 * S_lnk + 0.1 * E_exp + 0.1 * Q_trn + 0.1 * C_chn,
    );

    let speedSum = 0;
    let speedCount = 0;
    filtered.forEach((r) => {
      const mins = timeToMinutes(r[RESPONSE_TIME_KEY]);
      if (mins !== null) {
        let score = 0;
        if (mins <= 15) score = 100;
        else if (mins > 120) score = 0;
        else score = 100 - ((mins - 15) / (120 - 15)) * 100;
        speedSum += score;
        speedCount++;
      }
    });
    const S_rsp = speedCount ? Math.round(speedSum / speedCount) : 0;

    const S_sla = pct(filtered.filter((r) => r["SLA Status"] === "Within SLA").length, N);

    const voiceInWorking = pct(filtered.filter((r) => r["Voice Input Working?"] === "Yes").length, N);
    const voiceOutWorking = pct(filtered.filter((r) => r["Voice Output Working?"] === "Yes").length, N);
    const voiceInQuality = pct(filtered.filter((r) => r["Voice Input Quality"] === "Clear").length, N);
    const voiceOutQuality = pct(filtered.filter((r) => r["Voice Output Quality"] === "Clear").length, N);
    const V_io = Math.round((voiceInWorking + voiceOutWorking + voiceInQuality + voiceOutQuality) / 4);

    const validNotifRows = filtered.filter(
      (r) =>
        ["Received on Time", "Received Late", "Yes"].includes(r["Notification Received?"]) &&
        r["Notification on Same Thread?"] === "Yes" &&
        r["Notification Linked Correct Q-ID?"] === "Yes",
    );
    const N_exp = pct(validNotifRows.length, N);

    const experienceScore = Math.round(
      0.3 * S_rsp + 0.2 * S_sla + 0.2 * V_io + 0.15 * Q_trn + 0.15 * N_exp,
    );

    const countIncorrect = filtered.filter(
      (r) => r["Answer Scientifically Correct?"] === "Incorrect",
    ).length;
    const countDbFailure = filtered.filter(
      (r) => r["Question Saved in DB?"] === "Not Saved" || r["Answer Saved in DB?"] === "Not Saved",
    ).length;
    const countNotifFailure = filtered.filter(
      (r) =>
        r["Notification Received?"] === "Not Received" ||
        r["Notification on Same Thread?"] === "No" ||
        r["Notification Linked Correct Q-ID?"] === "No",
    ).length;
    const countCriticalBugs = filtered.filter((r) => r["Defect Severity"] === "Critical").length;
    const criticalFailuresToday =
      countIncorrect + countDbFailure + countNotifFailure + countCriticalBugs;

    const totalPassed = filtered.filter((r) => r["Overall Test Status"] === "Pass").length;
    const passRate = pct(totalPassed, N);
    const criticalDefectRate = pct(countCriticalBugs, N);
    const dataIntegrityFailures = filtered.filter(
      (r) =>
        r["Question Saved in DB?"] === "Not Saved" ||
        r["Answer Saved in DB?"] === "Not Saved" ||
        r["Q-ID Consistent Across Systems?"] === "Wrongly Identified as Duplicate",
    ).length;
    const dataIntegrityRate = pct(dataIntegrityFailures, N);
    const rawReleaseHealth = N ? Math.round(passRate - criticalDefectRate - dataIntegrityRate) : 0;
    const releaseHealth = Math.max(0, Math.min(100, rawReleaseHealth));

    return {
      N,
      trustScore,
      trustBreakdown: { A_sci, A_dom, S_lnk, E_exp, Q_trn, C_chn },
      experienceScore,
      experienceBreakdown: { S_rsp, S_sla, V_io, Q_trn, N_exp },
      criticalFailuresToday,
      criticalBreakdown: { countIncorrect, countDbFailure, countNotifFailure, countCriticalBugs },
      releaseHealth,
      releaseBreakdown: { passRate, criticalDefects: countCriticalBugs, dataIntegrityFailures },
    };
  }, [filtered]);

  const diagnostics = useMemo(() => {
    const stageStats = TAT_STAGES.map((stage) => {
      let sum = 0;
      let count = 0;
      filtered.forEach((r) => {
        const mins = timeToMinutes(r[stage.key]);
        if (mins !== null) {
          sum += mins;
          count++;
        }
      });
      return { name: stage.name, avg: count ? sum / count : 0 };
    });

    let bottleneckName = "None";
    let bottleneckTime = 0;
    stageStats.forEach((s) => {
      if (s.avg > bottleneckTime) {
        bottleneckTime = s.avg;
        bottleneckName = s.name;
      }
    });

    const categories = Array.from(
      new Set(filtered.map((r) => (r["Question Category"] || "").trim())),
    ).filter((c) => c !== "" && c !== "NA" && c !== "NIL");

    let weakestModule = "None";
    let weakestAccuracy = 101;
    categories.forEach((cat) => {
      const catRows = filtered.filter((r) => r["Question Category"] === cat);
      const correctCount = catRows.filter(
        (r) => r["Answer Scientifically Correct?"] === "Correct",
      ).length;
      const acc = pct(correctCount, catRows.length);
      if (acc < weakestAccuracy) {
        weakestAccuracy = acc;
        weakestModule = cat;
      }
    });

    const criticalRows = filtered.filter(
      (r) => r["Defect Severity"] === "Critical" || r["Defect Severity"] === "High",
    );
    const seenUrls = new Set<string>();
    const openTickets: { id: string; url: string; severity: string }[] = [];
    criticalRows.forEach((r) => {
      const url = (r["Defect ID / Bug Ref Zoho Desk Ticketing"] || "").trim();
      if (url && url.startsWith("http") && !seenUrls.has(url)) {
        seenUrls.add(url);
        openTickets.push({
          id: url.split("/").pop() || url,
          url,
          severity: (r["Defect Severity"] || "").toLowerCase(),
        });
      }
    });

    return {
      stageStats,
      bottleneckName,
      bottleneckTime,
      weakestModule,
      weakestAccuracy: weakestAccuracy <= 100 ? weakestAccuracy : null,
      openTickets: openTickets.slice(0, 10),
    };
  }, [filtered]);

  const chartData = useMemo(() => {
    const dailyGroups: Record<string, ITestersDashboardRecord[]> = {};
    filtered.forEach((r) => {
      const d = (r["Test Date"] || "").trim();
      if (d && d !== "NA" && d !== "NIL") {
        if (!dailyGroups[d]) dailyGroups[d] = [];
        dailyGroups[d].push(r);
      }
    });

    const sortedDates = Object.keys(dailyGroups).sort();
    const scoreTrend = sortedDates.map((d) => {
      const rows = dailyGroups[d];
      const N = rows.length;
      const countSci = rows.filter((r) => r["Answer Scientifically Correct?"] === "Correct").length;
      const A_sci = pct(countSci, N);
      const countMatch = rows.filter((r) => r["WhatsApp vs Web Answer Match?"] === "Yes").length;
      const C_chn = pct(countMatch, N);
      const trust = Math.round(0.5 * A_sci + 0.5 * C_chn);

      const countSla = rows.filter((r) => r["SLA Status"] === "Within SLA").length;
      const experience = pct(countSla, N);

      let sumMin = 0;
      let countMin = 0;
      rows.forEach((r) => {
        const m = timeToMinutes(r[RESPONSE_TIME_KEY]);
        if (m !== null) {
          sumMin += m;
          countMin++;
        }
      });
      const avgLatency = countMin ? Math.round((sumMin / countMin) * 10) / 10 : 0;

      return { date: d, trust, experience, avgLatency };
    });

    const sprintGroups: Record<string, ITestersDashboardRecord[]> = {};
    filtered.forEach((r) => {
      const s = (r["Sprint / Cycle"] || "").trim();
      if (s && s !== "NA" && s !== "NIL") {
        if (!sprintGroups[s]) sprintGroups[s] = [];
        sprintGroups[s].push(r);
      }
    });
    const sortedSprints = Object.keys(sprintGroups).sort();
    const defectsBySprint = sortedSprints.map((s) => ({
      sprint: s,
      defects: sprintGroups[s].filter(
        (r) => r["Defect Severity"] === "Critical" || r["Defect Severity"] === "High",
      ).length,
    }));

    return { scoreTrend, defectsBySprint };
  }, [filtered]);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading testers dashboard data...</div>;
  }

  if (isError || !data?.success) {
    return (
      <div className="p-6 text-destructive">
        Failed to load testers dashboard data. Check that the backend CSV source is configured.
      </div>
    );
  }

  const maxStageAvg = Math.max(...diagnostics.stageStats.map((s) => s.avg), 1);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Testers Dashboard</h1>
          <p className="text-sm text-muted-foreground">Minimalist Quality Assurance Performance Analytics</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
         <label className="flex items-center gap-2 cursor-pointer">
            <Switch
              checked={excludeFailures}
              onCheckedChange={setExcludeFailures}
            />
            Exclude Failures
          </label>
          <span className="text-muted-foreground">
            {excludeFailures
              ? `Showing ${filtered.length} clean of ${allRecords.length} records.`
              : `Loaded ${allRecords.length} records.`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 border rounded-lg p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">
            Date Range
          </label>
          <Select
            value={filters.dateRange}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, dateRange: value }))
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filters.dateRange === "custom" && (
          <div className="col-span-2 md:col-span-2 flex gap-2 items-end">
            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase">Start</label>
              <input
                type="date"
                className="h-8 w-full text-sm border rounded-md px-2"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase">End</label>
              <input
                type="date"
                className="h-8 w-full text-sm border rounded-md px-2"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </div>
        )}
        {FILTER_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase">
              {field.label}
            </label>
            <Select
              value={filters[field.key]}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, [field.key]: value }))
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {filterOptions[field.key]?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Trust Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold flex items-baseline gap-2">
              {kpis.trustScore}%
              <span className={`text-sm font-medium ${trendLabel(kpis.trustScore).className}`}>
                {trendLabel(kpis.trustScore).text}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Sci Accuracy (40%)</span><span>{kpis.trustBreakdown.A_sci}%</span></div>
              <div className="flex justify-between"><span>Domain Accuracy (20%)</span><span>{kpis.trustBreakdown.A_dom}%</span></div>
              <div className="flex justify-between"><span>Source Links (10%)</span><span>{kpis.trustBreakdown.S_lnk}%</span></div>
              <div className="flex justify-between"><span>Expert Matching (10%)</span><span>{kpis.trustBreakdown.E_exp}%</span></div>
              <div className="flex justify-between"><span>Translation Quality (10%)</span><span>{kpis.trustBreakdown.Q_trn}%</span></div>
              <div className="flex justify-between"><span>Channel Consistency (10%)</span><span>{kpis.trustBreakdown.C_chn}%</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Farmer Experience Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold flex items-baseline gap-2">
              {kpis.experienceScore}%
              <span className={`text-sm font-medium ${trendLabel(kpis.experienceScore).className}`}>
                {trendLabel(kpis.experienceScore).text}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Response Speed (30%)</span><span>{kpis.experienceBreakdown.S_rsp}%</span></div>
              <div className="flex justify-between"><span>SLA Compliance (20%)</span><span>{kpis.experienceBreakdown.S_sla}%</span></div>
              <div className="flex justify-between"><span>Voice Mechanics (20%)</span><span>{kpis.experienceBreakdown.V_io}%</span></div>
              <div className="flex justify-between"><span>Translation Quality (15%)</span><span>{kpis.experienceBreakdown.Q_trn}%</span></div>
              <div className="flex justify-between"><span>Notification Exp (15%)</span><span>{kpis.experienceBreakdown.N_exp}%</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Critical Failures Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{kpis.criticalFailuresToday}</div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Incorrect Answers</span><span>{kpis.criticalBreakdown.countIncorrect}</span></div>
              <div className="flex justify-between"><span>Not Saved in DB</span><span>{kpis.criticalBreakdown.countDbFailure}</span></div>
              <div className="flex justify-between"><span>Notification Failure</span><span>{kpis.criticalBreakdown.countNotifFailure}</span></div>
              <div className="flex justify-between"><span>Critical Severity Bugs</span><span>{kpis.criticalBreakdown.countCriticalBugs}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Release Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{kpis.releaseHealth}%</div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${kpis.releaseHealth}%` }}
              />
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Overall Pass Rate</span><span>{kpis.releaseBreakdown.passRate}%</span></div>
              <div className="flex justify-between"><span>Critical Defects</span><span>{kpis.releaseBreakdown.criticalDefects}</span></div>
              <div className="flex justify-between"><span>Data Integrity Failures</span><span>{kpis.releaseBreakdown.dataIntegrityFailures}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Biggest Bottleneck</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{diagnostics.bottleneckName}</div>
            <div className="text-sm text-muted-foreground mb-3">
              {diagnostics.bottleneckTime > 0 ? `${diagnostics.bottleneckTime.toFixed(1)} mins avg` : "0 mins avg"}
            </div>
            <div className="space-y-2">
              {diagnostics.stageStats.map((s) => (
                <div key={s.name} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span>{s.name}</span>
                    <span className="font-medium">{s.avg.toFixed(1)}m</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(s.avg / maxStageAvg) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Weakest Module</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{diagnostics.weakestModule}</div>
            <div className="text-sm text-red-500 font-medium mb-2">
              {diagnostics.weakestAccuracy !== null ? `${diagnostics.weakestAccuracy}% Accuracy` : "--% Accuracy"}
            </div>
            <p className="text-sm text-muted-foreground">
              This topic category shows the lowest average scientific accuracy across tested queries.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Open Critical Defects</CardTitle>
          </CardHeader>
          <CardContent>
            {diagnostics.openTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active critical/high defects.</p>
            ) : (
              <ul className="space-y-2">
                {diagnostics.openTickets.map((t) => (
                  <li key={t.url} className="flex items-center justify-between text-sm">
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      Ticket #{t.id}
                    </a>
                    <span className="text-xs uppercase text-muted-foreground">{t.severity}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Trust &amp; Farmer Experience Trends</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="trust" name="Trust Score" stroke="#4f46e5" strokeWidth={1.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="experience" name="Farmer Experience" stroke="#10b981" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Average Response Time (Minutes)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Line type="monotone" dataKey="avgLatency" name="Avg Response Time" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Defect Count by Sprint / Cycle</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.defectsBySprint}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="sprint" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Bar dataKey="defects" name="Defect Volume" fill="#ef4444" barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
