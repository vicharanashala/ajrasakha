import React, { useState, useEffect } from "react";
import type { HeatmapMatrix, HeatmapCell, GapCluster, GapReport, GapAnalyticsSummary } from "./types";
import { gapDetectorApi } from "./services/gapDetectorApi";
import { CoverageHeatmap } from "./components/CoverageHeatmap";
import { GapClustersTable } from "./components/GapClustersTable";
import { OutreachActionPlanCard } from "./components/OutreachActionPlanCard";
import { GapReportModal } from "./components/GapReportModal";
import { CoverageAnalyticsChart } from "./components/CoverageAnalyticsChart";
import { SmartAlertsBanner } from "./components/SmartAlertsBanner";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import {
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  AlertOctagon,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Target,
  Layers,
  Activity,
} from "lucide-react";
import { toast } from "sonner";

export const GapDetectorDashboard: React.FC = () => {
  const [heatmap, setHeatmap] = useState<HeatmapMatrix | null>(null);
  const [clusters, setClusters] = useState<GapCluster[]>([]);
  const [report, setReport] = useState<GapReport | null>(null);
  const [_analytics, setAnalytics] = useState<GapAnalyticsSummary | null>(null);
  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [hmData, clData, repData, anData] = await Promise.all([
        gapDetectorApi.getHeatmap(),
        gapDetectorApi.getClusters(),
        gapDetectorApi.getWeeklyReport(),
        gapDetectorApi.getAnalytics(),
      ]);

      setHeatmap(hmData);
      setClusters(clData);
      setReport(repData);
      setAnalytics(anData);
    } catch (e) {
      toast.error("Failed to load gap detector telemetry");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCellSelect = (cell: HeatmapCell | null) => {
    setSelectedCell(cell);
  };

  // Filter clusters if a heatmap cell is clicked
  const displayedClusters = selectedCell
    ? clusters.filter(
        (c) =>
          c.crop.toLowerCase() === selectedCell.crop.toLowerCase() &&
          c.state.toLowerCase() === selectedCell.state.toLowerCase()
      )
    : clusters;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Top Banner & Title with Glassmorphism / Modern Card Styling */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl text-white shadow-md shadow-emerald-500/20">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                GDB Coverage Gap Detector
                <Badge className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs border-0 shadow-sm">
                  Project 6 Engine
                </Badge>
                <Badge variant="outline" className="text-[11px] text-muted-foreground hidden sm:inline-flex">
                  v2.0 Active Telemetry
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Continuous semantic clustering of disclaimer-triggered queries to guide GDB growth toward 200,000 verified entries
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
            className="h-9 gap-1.5 text-xs shadow-sm hover:bg-muted/80"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Telemetry
          </Button>

          <Button
            size="sm"
            onClick={() => setIsReportOpen(true)}
            className="h-9 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Generate Weekly Gap Report
          </Button>
        </div>
      </div>

      {/* Real-Time Telemetry Alerts */}
      <SmartAlertsBanner />

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex items-start justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-500" />
              National GDB Coverage
            </div>
            <div className="text-3xl font-extrabold text-foreground mt-1 flex items-baseline gap-1.5">
              <span>{heatmap?.overallCoverageScore ?? 68}%</span>
              <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-500/10 px-1.5 py-0.2 rounded">
                +4% this week
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              Target: &gt;85% Benchmark
            </div>
          </div>
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-600 relative z-10">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex items-start justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="text-xs font-medium text-muted-foreground">Disclaimers Triggered (7d)</div>
            <div className="text-3xl font-extrabold text-rose-500 mt-1">
              {heatmap?.totalDisclaimers ?? 420}
            </div>
            <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
              <AlertOctagon className="w-3 h-3 text-rose-500" />
              Unanswered inquiries logged
            </div>
          </div>
          <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-500 relative z-10">
            <HelpCircle className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex items-start justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="text-xs font-medium text-muted-foreground">Critical Gap Hotspots</div>
            <div className="text-3xl font-extrabold text-amber-500 mt-1">
              {heatmap?.criticalGapCount ?? 7} Zones
            </div>
            <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-amber-500" />
              &lt;50% Coverage (Priority 1)
            </div>
          </div>
          <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500 relative z-10">
            <AlertOctagon className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex items-start justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="text-xs font-medium text-muted-foreground">Semantic Clusters Identified</div>
            <div className="text-3xl font-extrabold text-foreground mt-1">
              {clusters.length}
            </div>
            <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-500" />
              Categorized by AI intent model
            </div>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-500 relative z-10">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* NEW: Dynamic Recharts Trend & Domain Analytics */}
      <CoverageAnalyticsChart />

      {/* Coverage Heatmap Section */}
      {heatmap && (
        <CoverageHeatmap
          data={heatmap}
          selectedCell={selectedCell}
          onSelectCell={handleCellSelect}
        />
      )}

      {/* Prioritized Gap Clusters Table */}
      <GapClustersTable
        clusters={displayedClusters}
        onRefresh={loadData}
      />

      {/* Outreach Action Directives */}
      {report?.outreachRecommendations && (
        <OutreachActionPlanCard
          recommendations={report.outreachRecommendations}
        />
      )}

      {/* Report Modal */}
      <GapReportModal
        report={report}
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
      />
    </div>
  );
};
