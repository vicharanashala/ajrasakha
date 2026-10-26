import React, { useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, X, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";

interface AlertItem {
  id: string;
  type: "critical" | "warning" | "success";
  title: string;
  description: string;
  impactTag: string;
  metric: string;
}

const INITIAL_ALERTS: AlertItem[] = [
  {
    id: "alt-1",
    type: "critical",
    title: "Surge in Pink Bollworm Resistance Disclaimers",
    description: "Maharashtra (Yavatmal, Amravati) reported a 34% increase in unanswered pyrethroid spray timing queries over the last 48 hours.",
    impactTag: "Cotton · Maharashtra",
    metric: "+34% Surge",
  },
  {
    id: "alt-2",
    type: "warning",
    title: "Wheat Yellow Rust Outbreak in Fazilka border belt",
    description: "Chatbot received 42 disclaimer responses regarding PBW-550 fungicide dosage. Field knowledge pack missing.",
    impactTag: "Wheat · Punjab",
    metric: "42 Unanswered",
  },
  {
    id: "alt-3",
    type: "success",
    title: "Groundnut Drought Gap Resolved in AP",
    description: "Anantapur KVK dataset integrated into GDB. Coverage jumped from 48% to 82% this morning.",
    impactTag: "Groundnut · AP",
    metric: "Resolved (82%)",
  },
];

export const SmartAlertsBanner: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-emerald-500/10 border border-border/80 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600">
            <Bell className="w-4 h-4 animate-bounce" />
          </div>
          <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
            Real-time Gap Telemetry Alerts
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
          </h4>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          {alerts.length} Active Notice{alerts.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="bg-card/90 backdrop-blur-sm border border-border/70 rounded-xl p-3 flex flex-col justify-between hover:border-foreground/20 transition-all text-xs relative group"
          >
            <button
              onClick={() => dismissAlert(alert.id)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition-opacity"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div>
              <div className="flex items-center gap-1.5 mb-1.5 pr-4">
                {alert.type === "critical" && (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                )}
                {alert.type === "warning" && (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                )}
                {alert.type === "success" && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                )}
                <span className="font-semibold text-foreground line-clamp-1">{alert.title}</span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed line-clamp-2">
                {alert.description}
              </p>
            </div>

            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/40">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {alert.impactTag}
              </Badge>
              <span
                className={`font-bold text-[10px] ${
                  alert.type === "critical"
                    ? "text-rose-600"
                    : alert.type === "warning"
                    ? "text-amber-600"
                    : "text-emerald-600"
                }`}
              >
                {alert.metric}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

