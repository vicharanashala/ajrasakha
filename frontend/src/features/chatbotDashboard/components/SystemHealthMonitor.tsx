import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Database,
  Cpu,
  Globe,
  Server,
  Clock,
  Wifi,
  WifiOff,
} from "lucide-react";

interface ServiceStatus {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  latencyMs?: number;
  lastChecked: Date;
  uptime24h?: number;
  uptime7d?: number;
  errorMessage?: string;
  url?: string;
}

interface HealthData {
  services: ServiceStatus[];
  overallStatus: "healthy" | "degraded" | "down";
  systemInfo: {
    nodeVersion?: string;
    platform?: string;
    memoryUsageMb?: number;
    memoryTotalMb?: number;
    cpuUsagePercent?: number;
    activeConnections?: number;
    uptimeSeconds?: number;
  };
}

const MOCK_SERVICES: ServiceStatus[] = [
  {
    name: "MongoDB Atlas",
    status: "healthy",
    latencyMs: 12,
    lastChecked: new Date(),
    uptime24h: 99.98,
    uptime7d: 99.95,
    url: "Cluster0.1v2vb4v.mongodb.net",
  },
  {
    name: "Redis",
    status: "healthy",
    latencyMs: 3,
    lastChecked: new Date(),
    uptime24h: 100,
    uptime7d: 99.99,
  },
  {
    name: "AI Agent Service",
    status: "healthy",
    latencyMs: 245,
    lastChecked: new Date(),
    uptime24h: 99.8,
    uptime7d: 99.7,
    url: "localhost:2026",
  },
  {
    name: "Weather MCP",
    status: "healthy",
    latencyMs: 89,
    lastChecked: new Date(),
    uptime24h: 99.9,
    uptime7d: 99.8,
  },
  {
    name: "Market MCP",
    status: "healthy",
    latencyMs: 67,
    lastChecked: new Date(),
    uptime24h: 99.95,
    uptime7d: 99.9,
  },
  {
    name: "Soil MCP",
    status: "healthy",
    latencyMs: 54,
    lastChecked: new Date(),
    uptime24h: 100,
    uptime7d: 99.98,
  },
  {
    name: "Schemes MCP",
    status: "healthy",
    latencyMs: 78,
    lastChecked: new Date(),
    uptime24h: 99.85,
    uptime7d: 99.8,
  },
  {
    name: "FAQ MCP",
    status: "healthy",
    latencyMs: 42,
    lastChecked: new Date(),
    uptime24h: 99.99,
    uptime7d: 99.97,
  },
  {
    name: "Golden Dataset MCP",
    status: "healthy",
    latencyMs: 35,
    lastChecked: new Date(),
    uptime24h: 99.97,
    uptime7d: 99.95,
  },
  {
    name: "Sarvam Translation API",
    status: "healthy",
    latencyMs: 320,
    lastChecked: new Date(),
    uptime24h: 99.5,
    uptime7d: 99.3,
  },
  {
    name: "Firebase Auth",
    status: "healthy",
    latencyMs: 45,
    lastChecked: new Date(),
    uptime24h: 100,
    uptime7d: 100,
  },
  {
    name: "Plivo Voice API",
    status: "healthy",
    latencyMs: 120,
    lastChecked: new Date(),
    uptime24h: 99.8,
    uptime7d: 99.7,
  },
];

function getStatusColor(status: string) {
  switch (status) {
    case "healthy":
      return "bg-emerald-500";
    case "degraded":
      return "bg-amber-500";
    case "down":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "healthy":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
          <CheckCircle className="w-3 h-3 mr-1" />
          Healthy
        </Badge>
      );
    case "degraded":
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Degraded
        </Badge>
      );
    case "down":
      return (
        <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">
          <XCircle className="w-3 h-3 mr-1" />
          Down
        </Badge>
      );
    default:
      return (
        <Badge className="bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30">
          Unknown
        </Badge>
      );
  }
}

function getLatencyColor(ms: number) {
  if (ms < 50) return "text-emerald-600 dark:text-emerald-400";
  if (ms < 150) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getOverallStatusColor(status: string) {
  switch (status) {
    case "healthy":
      return "from-emerald-500 to-emerald-600";
    case "degraded":
      return "from-amber-500 to-amber-600";
    case "down":
      return "from-red-500 to-red-600";
    default:
      return "from-gray-400 to-gray-500";
  }
}

function getServiceIcon(name: string) {
  if (name.includes("Mongo") || name.includes("Redis"))
    return <Database className="w-4 h-4" />;
  if (name.includes("AI")) return <Cpu className="w-4 h-4" />;
  if (name.includes("MCP")) return <Server className="w-4 h-4" />;
  if (name.includes("Firebase") || name.includes("Sarvam") || name.includes("Plivo"))
    return <Globe className="w-4 h-4" />;
  return <Activity className="w-4 h-4" />;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function SystemHealthMonitor() {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = useCallback(async () => {
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));

    const services: ServiceStatus[] = MOCK_SERVICES.map((s) => ({
      ...s,
      lastChecked: new Date(),
    }));

    const downCount = services.filter((s) => s.status === "down").length;
    const degradedCount = services.filter((s) => s.status === "degraded").length;

    let overallStatus: "healthy" | "degraded" | "down" = "healthy";
    if (downCount > 0) overallStatus = "down";
    else if (degradedCount > 0) overallStatus = "degraded";

    setHealthData({
      services,
      overallStatus,
      systemInfo: {
        nodeVersion: "v22.x",
        platform: "Linux",
        memoryUsageMb: 256,
        memoryTotalMb: 512,
        cpuUsagePercent: 23,
        activeConnections: 47,
        uptimeSeconds: 259200,
      },
    });
    setLastRefresh(new Date());
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  const healthyCount = healthData?.services.filter((s) => s.status === "healthy").length ?? 0;
  const totalCount = healthData?.services.length ?? 0;
  const avgLatency = healthData
    ? Math.round(
        healthData.services.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0) /
          totalCount,
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* Overall Status Banner */}
      <div
        className={`relative overflow-hidden rounded-xl bg-gradient-to-r ${getOverallStatusColor(healthData?.overallStatus ?? "unknown")} p-[1px]`}
      >
        <div className="bg-background rounded-[11px] p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-full ${getStatusColor(healthData?.overallStatus ?? "unknown")} flex items-center justify-center animate-pulse`}
              >
                {healthData?.overallStatus === "healthy" ? (
                  <CheckCircle className="w-6 h-6 text-white" />
                ) : healthData?.overallStatus === "down" ? (
                  <XCircle className="w-6 h-6 text-white" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground capitalize">
                  System {healthData?.overallStatus ?? "Checking..."}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {healthyCount}/{totalCount} services operational
                  {avgLatency > 0 && ` · Avg latency ${avgLatency}ms`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="gap-1.5"
              >
                {autoRefresh ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchHealth}
                disabled={isRefreshing}
                className="gap-1.5"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="py-4">
          <CardContent className="px-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{healthyCount}</p>
                <p className="text-xs text-muted-foreground">Healthy</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {healthData?.services.filter((s) => s.status === "degraded").length ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Degraded</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {healthData?.services.filter((s) => s.status === "down").length ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Down</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{avgLatency}ms</p>
                <p className="text-xs text-muted-foreground">Avg Latency</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Services Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="w-4 h-4" />
            Service Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {healthData?.services.map((service) => (
              <div
                key={service.name}
                className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-card/50 hover:bg-accent/30 transition-colors"
              >
                <div className="mt-0.5">{getServiceIcon(service.name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {service.name}
                    </p>
                    {getStatusBadge(service.status)}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    {service.latencyMs != null && (
                      <span className={getLatencyColor(service.latencyMs)}>
                        {service.latencyMs}ms
                      </span>
                    )}
                    {service.uptime24h != null && (
                      <span>{service.uptime24h}% uptime</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      {healthData?.systemInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="w-4 h-4" />
              System Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Node.js</p>
                <p className="text-sm font-medium">{healthData.systemInfo.nodeVersion}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Platform</p>
                <p className="text-sm font-medium">{healthData.systemInfo.platform}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Memory</p>
                <p className="text-sm font-medium">
                  {healthData.systemInfo.memoryUsageMb}MB / {healthData.systemInfo.memoryTotalMb}MB
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CPU</p>
                <p className="text-sm font-medium">{healthData.systemInfo.cpuUsagePercent}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Connections</p>
                <p className="text-sm font-medium">{healthData.systemInfo.activeConnections}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Uptime</p>
                <p className="text-sm font-medium">
                  {healthData.systemInfo.uptimeSeconds
                    ? formatUptime(healthData.systemInfo.uptimeSeconds)
                    : "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last Checked */}
      <p className="text-xs text-muted-foreground text-center">
        Last checked: {lastRefresh.toLocaleTimeString()} · Auto-refreshes every 30s
      </p>
    </div>
  );
}
