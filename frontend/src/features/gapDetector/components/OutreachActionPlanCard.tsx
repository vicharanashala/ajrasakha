import React from "react";
import type { OutreachRecommendation } from "../types";
import { Badge } from "@/components/atoms/badge";
import { MapPin, Navigation, CheckSquare } from "lucide-react";

interface OutreachActionPlanProps {
  recommendations: OutreachRecommendation[];
}

export const OutreachActionPlanCard: React.FC<OutreachActionPlanProps> = ({
  recommendations,
}) => {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-lg text-foreground tracking-tight flex items-center gap-2">
            <Navigation className="w-4 h-4 text-emerald-600" />
            Field Outreach Target Directives
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Data-driven field visit priorities based on high-frequency unanswered farmer demand
          </p>
        </div>
        <Badge variant="outline" className="text-xs bg-muted/40 text-muted-foreground self-start sm:self-auto">
          Updated for Next Field Cycle
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
        {recommendations.map((rec, i) => (
          <div
            key={i}
            className="p-3.5 bg-muted/20 border border-border/70 rounded-lg hover:border-emerald-500/40 transition-colors flex flex-col justify-between space-y-2.5"
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="font-bold text-sm text-foreground flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  {rec.state} ({rec.district})
                </span>
                <Badge
                  className={`text-[10px] py-0 px-1.5 ${
                    rec.farmerDemandLevel === "Very High"
                      ? "bg-rose-500 text-white"
                      : "bg-amber-500 text-zinc-950"
                  }`}
                >
                  {rec.farmerDemandLevel} Demand
                </Badge>
              </div>

              <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mb-1">
                Crop: {rec.priorityCrop}
              </div>

              <p className="text-xs text-foreground/90 font-medium line-clamp-2">
                Gap: {rec.gapTopic}
              </p>
            </div>

            <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground bg-muted/30 p-2 rounded">
              <span className="font-semibold text-foreground flex items-center gap-1 mb-0.5">
                <CheckSquare className="w-3 h-3 text-emerald-600" />
                Action:
              </span>
              {rec.suggestedAction}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

