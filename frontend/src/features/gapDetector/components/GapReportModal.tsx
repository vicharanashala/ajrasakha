import React from "react";
import type { GapReport } from "../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Download, FileText, Printer, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface GapReportModalProps {
  report: GapReport | null;
  isOpen: boolean;
  onClose: () => void;
}

export const GapReportModal: React.FC<GapReportModalProps> = ({
  report,
  isOpen,
  onClose,
}) => {
  if (!report) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCsv = () => {
    const headers = "Rank,Title,Crop,State,QueryCount,GrowthRate,Urgency,RecommendedGDBAction\n";
    const rows = report.topGaps
      .map(
        (g, i) =>
          `"${i + 1}","${g.title.replace(/"/g, '""')}","${g.crop}","${g.state}","${g.queryCount}","+${g.growthRate}%","${g.urgency}","${g.recommendedGDBAction.replace(/"/g, '""')}"`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `GDB_Coverage_Gap_Report_${report.reportId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("GDB Gap Report CSV downloaded successfully!");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-full print:p-0">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              <DialogTitle className="text-lg font-bold">
                Official GDB Coverage Gap Report
              </DialogTitle>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {report.reportId}
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            Generated on {new Date(report.generatedAt).toLocaleDateString()} for the Agricultural Knowledge & Outreach Committee
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Executive Summary Card */}
          <div className="bg-muted/30 border border-border rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-[11px] text-muted-foreground">Total Inquiries Analyzed</div>
              <div className="text-lg font-bold text-foreground mt-0.5">
                {report.summary.totalQueriesAnalyzed.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Disclaimers Triggered</div>
              <div className="text-lg font-bold text-rose-500 mt-0.5">
                {report.summary.totalDisclaimers.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Current GDB Coverage</div>
              <div className="text-lg font-bold text-emerald-600 mt-0.5">
                {report.summary.overallCoveragePercentage}%
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Target GDB Scale</div>
              <div className="text-lg font-bold text-foreground mt-0.5">
                200,000 Q&As
              </div>
            </div>
          </div>

          {/* Strategic Context Alert */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-lg flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              <span className="font-semibold">Agri Science Team Priority:</span> The following <strong>{report.topGaps.length} prioritized question types</strong> represent over 60% of all disclaimer triggers across India this week. Reviewer resources should be allocated directly to authoring validated Q&A pairs for these clusters.
            </div>
          </div>

          {/* Top Prioritized GDB Entries Table */}
          <div>
            <h4 className="font-semibold text-foreground mb-2 text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Top Prioritized GDB Entries Required (Ranked by Farmer Demand)
            </h4>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="p-2 w-10 text-center">#</th>
                    <th className="p-2">Identified Gap Topic</th>
                    <th className="p-2 w-24">Crop & State</th>
                    <th className="p-2 w-20 text-center">Volume</th>
                    <th className="p-2">Recommended GDB Action Card</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {report.topGaps.map((gap, i) => (
                    <tr key={gap.id} className="hover:bg-muted/20">
                      <td className="p-2 font-bold text-center text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="p-2 font-semibold text-foreground">
                        {gap.title}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {gap.crop} ({gap.state})
                      </td>
                      <td className="p-2 text-center font-bold text-emerald-600">
                        {gap.queryCount}
                      </td>
                      <td className="p-2 text-muted-foreground text-[11px] leading-relaxed">
                        {gap.recommendedGDBAction}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Outreach Directives Section */}
          <div>
            <h4 className="font-semibold text-foreground mb-1.5 text-sm">
              Recommended Regional Outreach Allocations:
            </h4>
            <div className="space-y-1.5">
              {report.outreachRecommendations.map((rec, i) => (
                <div key={i} className="p-2 bg-muted/20 rounded border flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-foreground">{rec.state} ({rec.district})</span>
                    <span className="text-muted-foreground ml-2">— Crop: {rec.priorityCrop}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {rec.farmerDemandLevel} Priority
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <span className="text-[11px] text-muted-foreground">
            Ajrasakha ACE Knowledge Intelligence Engine
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 gap-1.5 text-xs">
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
            <Button size="sm" onClick={handleDownloadCsv} className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
              <Download className="w-3.5 h-3.5" /> Download CSV
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

