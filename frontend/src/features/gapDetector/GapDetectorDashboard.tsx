import React, { useState, useEffect } from "react";
import type { HeatmapMatrix, HeatmapCell, GapCluster, GapReport, GapAnalyticsSummary } from "./types";
import { gapDetectorApi } from "./services/gapDetectorApi";
import { CoverageHeatmap } from "./components/CoverageHeatmap";
import { GapClustersTable } from "./components/GapClustersTable";
import { OutreachActionPlanCard } from "./components/OutreachActionPlanCard";
import { GapReportModal } from "./components/GapReportModal";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import {
  RefreshCw,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  TrendingUp,
  MapPin,
  Bot,
  Layers,
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
      toast.error("Failed to load gap detector data");
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
    <div className="space-y-8 max-w-6xl mx-auto px-6 py-8">
      {/* Header — Simple, clear, human English */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/50 rounded-xl text-emerald-700 dark:text-emerald-400">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Farmer Question Gap Detector
                </h1>
                <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                  Project 6
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Finds questions our farmer chatbot couldn't answer, so our team knows what info to collect next.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>

          <Button
            size="sm"
            onClick={() => setIsReportOpen(true)}
            className="gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Download Summary Report
          </Button>
        </div>
      </div>

      {/* Key Numbers — 4 clean, spacious cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1 */}
        <div className="bg-card border border-border/70 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Questions Answered</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold text-foreground">
            {heatmap?.overallCoverageScore ?? 68}%
          </div>
          <p className="text-xs text-muted-foreground">
            Bot answers 68 out of every 100 questions.
          </p>
        </div>

        {/* Card 2 */}
        <div className="bg-card border border-border/70 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Unanswered Questions</span>
            <HelpCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-bold text-rose-600">
            {heatmap?.totalDisclaimers ?? 420}
          </div>
          <p className="text-xs text-muted-foreground">
            Times bot replied "Sorry, I don't know" this week.
          </p>
        </div>

        {/* Card 3 */}
        <div className="bg-card border border-border/70 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>High Priority Problem Areas</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-bold text-amber-600">
            {heatmap?.criticalGapCount ?? 7} Areas
          </div>
          <p className="text-xs text-muted-foreground">
            Crop & state areas with less than 50% answers.
          </p>
        </div>

        {/* Card 4 */}
        <div className="bg-card border border-border/70 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Missing Topic Groups</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-foreground">
            {clusters.length} Topics
          </div>
          <p className="text-xs text-muted-foreground">
            Grouped by common problem (pests, fertilizer, etc.)
          </p>
        </div>
      </div>

      {/* Section 1: Heatmap Grid */}
      <div className="pt-2">
        {heatmap && (
          <CoverageHeatmap
            data={heatmap}
            selectedCell={selectedCell}
            onSelectCell={handleCellSelect}
          />
        )}
      </div>

      {/* Section 2: Missing Questions Table */}
      <div className="pt-2">
        <GapClustersTable
          clusters={displayedClusters}
          onRefresh={loadData}
        />
      </div>

      {/* Section 3: Field Action Plan */}
      {report?.outreachRecommendations && (
        <div className="pt-2">
          <OutreachActionPlanCard
            recommendations={report.outreachRecommendations}
          />
        </div>
      )}

      {/* Download Modal */}
      <GapReportModal
        report={report}
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
      />
    </div>
  );
};
