import React, { useState } from "react";
import type { GapCluster } from "../types";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import {
  Search,
  Send,
  Eye,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";
import { gapDetectorApi } from "../services/gapDetectorApi";
import { toast } from "sonner";

interface GapClustersTableProps {
  clusters: GapCluster[];
  onRefresh: () => void;
}

export const GapClustersTable: React.FC<GapClustersTableProps> = ({
  clusters,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUrgency, setSelectedUrgency] = useState<string>("all");
  const [inspectCluster, setInspectCluster] = useState<GapCluster | null>(null);
  const [routingId, setRoutingId] = useState<string | null>(null);

  const filteredClusters = clusters.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.crop.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.state.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesUrgency =
      selectedUrgency === "all" || c.urgency === selectedUrgency;
    return matchesSearch && matchesUrgency;
  });

  const handleRoute = async (cluster: GapCluster) => {
    try {
      setRoutingId(cluster.id);
      const res = await gapDetectorApi.routeClusterToReviewer(cluster.id);
      if (res.success) {
        toast.success(`Assigned "${cluster.crop} - ${cluster.title}" to expert team!`);
        onRefresh();
      }
    } catch {
      toast.error("Failed to assign topic");
    } finally {
      setRoutingId(null);
    }
  };

  return (
    <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-5">
      {/* Header and Search Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-lg text-foreground">
            Questions Farmers Are Asking (Grouped by Topic)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            These are the repeated questions our AI couldn't answer. Click "Inspect" to read real examples.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative w-56">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search crop, state, or problem..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <select
            value={selectedUrgency}
            onChange={(e) => setSelectedUrgency(e.target.value)}
            className="h-9 px-3 text-xs bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Priorities</option>
            <option value="critical">High Priority Only</option>
            <option value="high">Medium Priority</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border/60 rounded-xl">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
            <tr>
              <th className="p-3.5">Topic & Crop</th>
              <th className="p-3.5">State & Districts</th>
              <th className="p-3.5 text-center">Unanswered Questions</th>
              <th className="p-3.5 text-center">Priority</th>
              <th className="p-3.5 text-center">Status</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filteredClusters.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No topics match your search.
                </td>
              </tr>
            ) : (
              filteredClusters.map((cluster) => (
                <tr key={cluster.id} className="hover:bg-muted/15 transition-colors">
                  <td className="p-3.5">
                    <div className="font-semibold text-foreground text-sm">
                      {cluster.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">{cluster.crop}</span>
                      <span>·</span>
                      <span className="capitalize">{cluster.domain.replace("_", " ")}</span>
                    </div>
                  </td>

                  <td className="p-3.5">
                    <div className="font-medium text-foreground">{cluster.state}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {cluster.topDistricts.join(", ")}
                    </div>
                  </td>

                  <td className="p-3.5 text-center font-bold text-foreground">
                    {cluster.queryCount} farmers
                  </td>

                  <td className="p-3.5 text-center">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium ${
                        cluster.urgency === "critical"
                          ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                          : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                      }`}
                    >
                      {cluster.urgency === "critical" ? "High Priority" : "Medium Priority"}
                    </Badge>
                  </td>

                  <td className="p-3.5 text-center">
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {cluster.status === "in_review" ? "Being Worked On" : "Needs Review"}
                    </span>
                  </td>

                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInspectCluster(cluster)}
                        className="h-8 px-2.5 text-xs gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        See Questions
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleRoute(cluster)}
                        disabled={routingId === cluster.id}
                        className="h-8 px-2.5 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Assign Team
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Inspect Dialog: Shows Real Farmer Questions */}
      {inspectCluster && (
        <Dialog open={!!inspectCluster} onOpenChange={() => setInspectCluster(null)}>
          <DialogContent className="max-w-lg p-6 space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                {inspectCluster.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Reported by {inspectCluster.queryCount} farmers in {inspectCluster.state} ({inspectCluster.topDistricts.join(", ")})
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                  What Farmers Actually Asked:
                </h4>
                <div className="space-y-1.5 bg-muted/30 p-3 rounded-lg border border-border/60">
                  {inspectCluster.sampleQueries.map((q, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="font-bold text-foreground">“</span>
                      <span className="italic">{q}</span>
                      <span className="font-bold text-foreground">”</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-foreground mb-1.5">
                  Action Needed:
                </h4>
                <p className="text-xs text-muted-foreground bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 leading-relaxed">
                  {inspectCluster.recommendedGDBAction}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setInspectCluster(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
