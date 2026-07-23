import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { env } from "@/config/env";

interface HealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
  environment: string;
}

export function SystemHealthIndicator() {
  const { data, isError, isLoading } = useQuery<HealthResponse>({
    queryKey: ["systemHealth"],
    queryFn: async () => {
      const baseUrl = env.apiBaseUrl() || "";
      const res = await fetch(`${baseUrl}/api/health`);
      if (!res.ok) {
        throw new Error("Health check failed");
      }
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 2,
  });

  const isOnline = !isError && data?.status === "healthy";

  return (
    <div className="relative group flex items-center">
      <button
        type="button"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/50 hover:bg-accent transition-colors border border-border/50"
        title={isOnline ? "System Online" : "Backend Disconnected"}
      >
        <span className="relative flex h-2 w-2">
          {isOnline ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </>
          ) : (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </>
          )}
        </span>
        <span className="hidden sm:inline text-muted-foreground group-hover:text-foreground transition-colors">
          {isLoading ? "Checking..." : isOnline ? "Online" : "Offline"}
        </span>
      </button>

      {/* Hover Card Detail Tooltip */}
      <div className="absolute right-0 top-full mt-2 w-56 p-3 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 z-50 text-xs">
        <div className="flex items-center justify-between font-semibold border-b pb-1.5 mb-2">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-primary" />
            Backend Health
          </span>
          {isOnline ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          )}
        </div>

        {isOnline && data ? (
          <div className="space-y-1 text-muted-foreground">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="font-medium text-emerald-500 uppercase">{data.status}</span>
            </div>
            <div className="flex justify-between">
              <span>Uptime:</span>
              <span className="font-medium text-foreground">{Math.floor(data.uptime / 60)}m</span>
            </div>
            <div className="flex justify-between">
              <span>Environment:</span>
              <span className="font-medium text-foreground">{data.environment || "production"}</span>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            {isLoading
              ? "Connecting to backend health endpoint..."
              : "Unable to reach backend API endpoint (/api/health)."}
          </p>
        )}
      </div>
    </div>
  );
}
