import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Badge } from "@/components/atoms/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { getGapReport, GapReportNotFoundError } from "./api";
import type { GapItem } from "./types";

const PRIORITY_BADGE_VARIANT: Record<
  GapItem["priority_level"],
  "destructive" | "default" | "secondary" | "outline"
> = {
  CRITICAL: "destructive",
  HIGH: "default",
  MEDIUM: "secondary",
  LOW: "outline",
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function GDBGapReportDashboard() {
  const [selectedState, setSelectedState] = useState<string>("All States");
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ["gdb-gap-report"],
    queryFn: getGapReport,
    retry: false,
  });

  const states = useMemo(() => {
    if (!report) return ["All States"];
    return ["All States", ...new Set(report.coverage_stats.heatmap.map((c) => c.state))];
  }, [report]);

  const heatmapData = useMemo(() => {
    if (!report) return [];
    const cells = report.coverage_stats.heatmap.filter(
      (c) => selectedState === "All States" || c.state === selectedState,
    );

    const crops = [...new Set(cells.map((c) => c.crop))];
    const domains = [...new Set(cells.map((c) => c.domain))];

    return crops.map((crop) => ({
      id: crop,
      data: domains.map((domain) => {
        const matching = cells.filter((c) => c.crop === crop && c.domain === domain);
        const gdb = matching.reduce((sum, c) => sum + c.gdb_count, 0);
        const gap = matching.reduce((sum, c) => sum + c.disclaimer_count, 0);
        const total = gdb + gap;
        return {
          x: domain,
          y: total ? Math.round((gdb / total) * 100) : 0,
        };
      }),
    }));
  }, [report, selectedState]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">Loading GDB coverage gap report...</p>
        </div>
      </div>
    );
  }

  if (error instanceof GapReportNotFoundError) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-center px-4">
        <p className="text-sm text-muted-foreground max-w-md">
          No gap report has been generated yet. Run{" "}
          <code className="px-1 py-0.5 rounded bg-muted">python gap_pipeline.py</code> in{" "}
          <code className="px-1 py-0.5 rounded bg-muted">apis/acc_api</code> to produce the first
          one.
        </p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load gap report."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">GDB Coverage Gap Report</h2>
          <p className="text-xs text-muted-foreground">
            Weekly report generated {new Date(report.generated_at).toLocaleString()} · period{" "}
            {report.period_days} days
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Disclaimer-triggered questions" value={report.total_disclaimers} />
        <StatCard label="Unique queries" value={report.unique_queries} />
        <StatCard label="Gap clusters found" value={report.clusters_found} />
        <StatCard label="Coverage gaps (cells)" value={report.coverage_stats.gaps} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Coverage heatmap</CardTitle>
            <CardDescription>
              % of questions answered by the GDB, per crop x domain cell (green = well covered,
              red = gap)
            </CardDescription>
          </div>
          <Select value={selectedState} onValueChange={setSelectedState}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {states.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {heatmapData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No heatmap data for this filter.</p>
          ) : (
            <div className="h-[400px] min-w-[600px]">
              <ResponsiveHeatMap
                data={heatmapData}
                margin={{ top: 40, right: 60, bottom: 40, left: 120 }}
                colors={{ type: "diverging", scheme: "red_yellow_green", divergeAt: 0.5, minValue: 0, maxValue: 100 }}
                emptyColor="#f5f5f5"
                enableLabels={true}
                labelTextColor="#000"
                label={(d) => `${d.data.y}%`}
                axisTop={{ tickSize: 5, tickPadding: 5, tickRotation: -30, legend: "Domain", legendPosition: "middle", legendOffset: -36 }}
                axisLeft={{ tickSize: 5, tickPadding: 5, legend: "Crop", legendPosition: "middle", legendOffset: -100 }}
                animate={false}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top {report.top_gaps.length} gaps, ranked by farmer demand</CardTitle>
          <CardDescription>
            Priority = demand (cluster size) x growth rate. Click a row for sample questions and
            missing keywords.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Question</th>
                <th className="py-2 pr-3">Crop</th>
                <th className="py-2 pr-3">State</th>
                <th className="py-2 pr-3">Domain</th>
                <th className="py-2 pr-3">Demand</th>
                <th className="py-2 pr-3">Growth</th>
                <th className="py-2 pr-3">Priority</th>
              </tr>
            </thead>
            <tbody>
              {report.top_gaps.map((gap, idx) => {
                const isExpanded = expandedClusterId === gap.cluster_id;
                return (
                  <Fragment key={gap.cluster_id}>
                    <tr
                      className="border-b cursor-pointer hover:bg-accent/50"
                      onClick={() => setExpandedClusterId(isExpanded ? null : gap.cluster_id)}
                    >
                      <td className="py-2 pr-3">{idx + 1}</td>
                      <td className="py-2 pr-3 max-w-[320px] truncate">{gap.cluster_name}</td>
                      <td className="py-2 pr-3">{gap.crop}</td>
                      <td className="py-2 pr-3">{gap.states.join(", ")}</td>
                      <td className="py-2 pr-3">{gap.domains.join(", ")}</td>
                      <td className="py-2 pr-3">{gap.farmer_demand}</td>
                      <td className="py-2 pr-3">
                        {gap.growth_rate > 0 ? "+" : ""}
                        {Math.round(gap.growth_rate * 100)}%
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={PRIORITY_BADGE_VARIANT[gap.priority_level]}>
                          {gap.priority_level}
                        </Badge>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-muted/30 border-b">
                        <td colSpan={8} className="py-3 px-3">
                          <div className="flex flex-col gap-2">
                            <div>
                              <span className="font-medium">Recommended action: </span>
                              {gap.recommended_action}
                            </div>
                            {gap.keywords.length > 0 && (
                              <div>
                                <span className="font-medium">Missing keywords: </span>
                                {gap.keywords.map((kw) => (
                                  <Badge key={kw} variant="outline" className="mr-1">
                                    {kw}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {gap.sample_queries.length > 0 && (
                              <div>
                                <span className="font-medium">Sample variations:</span>
                                <ul className="list-disc list-inside text-muted-foreground">
                                  {gap.sample_queries.map((q, i) => (
                                    <li key={i}>{q}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outreach recommendations</CardTitle>
          <CardDescription>Where the content/field team should focus next</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {report.outreach_recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outreach recommendations yet.</p>
          ) : (
            report.outreach_recommendations.map((rec, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-2 border-b last:border-0">
                <p className="text-sm">{rec.recommendation}</p>
                <Badge variant={rec.priority === "HIGH" ? "destructive" : "secondary"}>
                  {rec.priority}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
