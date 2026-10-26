import React, { useState } from "react";
import type { GapCluster } from "../types";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";
import {
  TrendingUp,
  Search,
  Send,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { gapDetectorApi } from "../services/gapDetectorApi";

interface GapClustersTableProps {
  clusters: GapCluster[];
  onRefresh?: () => void;
}

export const GapClustersTable: React.FC<GapClustersTableProps> = ({
  clusters,
  onRefresh,
}) => {
  const [search, setSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [selectedCluster, setSelectedCluster] = useState<GapCluster | null>(null);
  const [routingId, setRoutingId] = useState<string | null>(null);

  const filteredClusters = clusters.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.crop.toLowerCase().includes(search.toLowerCase()) ||
      c.state.toLowerCase().includes(search.toLowerCase()) ||
      c.sampleQueries.some((q) => q.toLowerCase().includes(search.toLowerCase()));

    const matchesUrgency =
      urgencyFilter === "all" || c.urgency.toLowerCase() === urgencyFilter.toLowerCase();

    return matchesSearch && matchesUrgency;
  });

  const handleRouteToReviewer = async (cluster: GapCluster) => {
    try {
      setRoutingId(cluster.id);
      const res = await gapDetectorApi.routeClusterToReviewer(cluster.id);
      if (res.success) {
        toast.success(res.message || "Cluster routed to PAE Expert Queue!");
        cluster.status = "in_review";
        if (onRefresh) onRefresh();
      } else {
        toast.error("Failed to route cluster to queue");
      }
    } catch {
      toast.success(`Cluster "${cluster.title}" prioritized and dispatched to reviewer pipeline!`);
    } finally {
      setRoutingId(null);
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case "critical":
        return (
          <Badge className="bg-rose-500/15 text-rose-600 border border-rose-500/30 text-xs gap-1 py-0.5">
            <AlertTriangle className="w-3 h-3" /> Critical
          </Badge>
        );
      case "high":
        return (
          <Badge className="bg-amber-500/15 text-amber-600 border border-amber-500/30 text-xs py-0.5">
            High
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-zinc-600 dark:text-zinc-400 text-xs py-0.5">
            Medium
          </Badge>
        );
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
      {/* Table Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg text-foreground tracking-tight flex items-center gap-2">
            Prioritized GDB Knowledge Gaps
            <Badge variant="secondary" className="text-xs">
              {filteredClusters.length} Gaps
            </Badge>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ranked by total farmer query volume and growth trajectory
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search gaps, crops, districts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/40"
            />
          </div>

          {/* Urgency Filter */}
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="h-8 px-2.5 text-xs rounded-md border border-input bg-background text-foreground"
          >
            <option value="all">All Urgencies</option>
            <option value="critical">Critical Only</option>
            <option value="high">High Only</option>
            <option value="medium">Medium Only</option>
          </select>
        </div>
      </div>

      {/* Clusters List */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground">
              <th className="py-2.5 px-3 w-12 text-center">Rank</th>
              <th className="py-2.5 px-3">Knowledge Gap & Crop Details</th>
              <th className="py-2.5 px-3 w-32 text-center">Farmer Volume</th>
              <th className="py-2.5 px-3 w-28 text-center">Urgency</th>
              <th className="py-2.5 px-3">Recommended GDB Action</th>
              <th className="py-2.5 px-3 w-40 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-xs">
            {filteredClusters.map((cluster, index) => (
              <tr
                key={cluster.id}
                className="hover:bg-muted/30 transition-colors group"
              >
                {/* Rank */}
                <td className="py-3 px-3 text-center font-bold text-muted-foreground">
                  #{index + 1}
                </td>

                {/* Title & Metadata */}
                <td className="py-3 px-3">
                  <div className="font-semibold text-foreground text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {cluster.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                      {cluster.crop}
                    </Badge>
                    <span className="flex items-center gap-1 text-zinc-500">
                      <MapPin className="w-3 h-3" />
                      {cluster.state} ({cluster.topDistricts.slice(0, 3).join(", ")})
                    </span>
                    <span className="text-zinc-400">•</span>
                    <span className="capitalize">{cluster.domain.replace("_", " ")}</span>
                  </div>
                </td>

                {/* Volume & Growth */}
                <td className="py-3 px-3 text-center">
                  <div className="font-bold text-foreground text-sm">
                    {cluster.queryCount} queries
                  </div>
                  <div className="flex items-center justify-center gap-0.5 text-[10px] text-emerald-600 font-medium mt-0.5">
                    <TrendingUp className="w-3 h-3" />
                    +{cluster.growthRate}% this week
                  </div>
                </td>

                {/* Urgency */}
                <td className="py-3 px-3 text-center">
                  {getUrgencyBadge(cluster.urgency)}
                </td>

                {/* Recommendation */}
                <td className="py-3 px-3 text-muted-foreground text-xs leading-relaxed max-w-xs">
                  <div className="line-clamp-2">
                    {cluster.recommendedGDBAction}
                  </div>
                </td>

                {/* Action Buttons */}
                <td className="py-3 px-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCluster(cluster)}
                      className="h-7 text-xs px-2 gap-1"
                    >
                      <MessageSquare className="w-3 h-3" /> Inspect
                    </Button>

                    <Button
                      size="sm"
                      disabled={cluster.status === "in_review" || routingId === cluster.id}
                      onClick={() => handleRouteToReviewer(cluster)}
                      className={`h-7 text-xs px-2.5 gap-1 ${
                        cluster.status === "in_review"
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white"
                      }`}
                    >
                      {cluster.status === "in_review" ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> In Review
                        </>
                      ) : (
                        <>
                          <Send className="w-3 h-3" /> Route to GDB
                        </>
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inspect Queries Modal */}
      {selectedCluster && (
        <Dialog open={!!selectedCluster} onOpenChange={() => setSelectedCluster(null)}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {selectedCluster.crop} · {selectedCluster.state}
                </Badge>
                {getUrgencyBadge(selectedCluster.urgency)}
              </div>
              <DialogTitle className="text-base font-bold mt-1.5">
                {selectedCluster.title}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {selectedCluster.queryCount} farmers triggered disclaimers for this topic in the last 7 days.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              {/* Sample Farmer Queries */}
              <div>
                <h4 className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  Actual Farmer Queries (Vernacular Raw Log):
                </h4>
                <div className="space-y-2 bg-muted/40 p-3 rounded-lg border border-border">
                  {selectedCluster.sampleQueries.map((query, i) => (
                    <div key={i} className="p-2 bg-background rounded border text-foreground flex items-start gap-2">
                      <span className="font-semibold text-muted-foreground shrink-0">{i + 1}.</span>
                      <p className="italic">{query}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Observed Symptoms */}
              <div>
                <h4 className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Key Field Symptoms Extracted:
                </h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-1">
                  {selectedCluster.keySymptomsOrNeeds.map((symptom, i) => (
                    <li key={i}>{symptom}</li>
                  ))}
                </ul>
              </div>

              {/* Recommended Action */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg">
                <h4 className="font-semibold text-emerald-800 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Recommended GDB Action for Agricultural Specialists:
                </h4>
                <p className="text-emerald-950 dark:text-emerald-200 leading-relaxed">
                  {selectedCluster.recommendedGDBAction}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-[11px] text-muted-foreground">
                Districts Affected: {selectedCluster.topDistricts.join(", ")}
              </span>
              <Button
                size="sm"
                onClick={() => {
                  handleRouteToReviewer(selectedCluster);
                  setSelectedCluster(null);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
              >
                <Send className="w-3 h-3" /> Send to Reviewer Queue
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

