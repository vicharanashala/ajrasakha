import React from "react";
import type { OutreachRecommendation } from "../types";
import { Badge } from "@/components/atoms/badge";
import { MapPin, Navigation, CheckSquare } from "lucide-react";

interface OutreachActionPlanCardProps {
  recommendations: OutreachRecommendation[];
}

export const OutreachActionPlanCard: React.FC<OutreachActionPlanCardProps> = ({
  recommendations,
}) => {
  return (
    <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-lg text-foreground">
            Where to Send Field Teams Next
          </h3>
          <Badge className="bg-emerald-600 text-white text-xs">
            Action Plan
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Based on farmer demand, these are the top districts our team should visit to gather missing agricultural answers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
        {recommendations.map((rec, idx) => (
          <div
            key={idx}
            className="border border-border/70 rounded-xl p-4 bg-background flex flex-col justify-between hover:border-emerald-500/40 transition-colors space-y-3"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  {rec.priorityCrop}
                </span>
                <span className="text-[11px] font-medium text-rose-600">
                  {rec.farmerDemandLevel} Demand
                </span>
              </div>

              <div>
                <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  {rec.district}, {rec.state}
                </div>
                <p className="text-xs font-medium text-muted-foreground mt-1">
                  Missing: <span className="text-foreground">{rec.gapTopic}</span>
                </p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/40">
              <span className="font-medium text-foreground">Next Step: </span>
              {rec.suggestedAction}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
