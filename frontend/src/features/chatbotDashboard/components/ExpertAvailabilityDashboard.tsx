import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Input } from "@/components/atoms/input";
import {
  Users,
  Search,
  RefreshCw,
  Clock,
  Phone,
  Shield,
  Activity,
  TrendingUp,
  BarChart3,
  UserCheck,
  UserX,
  Timer,
} from "lucide-react";

interface Expert {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "online" | "idle" | "busy" | "offline" | "blocked";
  lastActive: Date;
  currentTask?: string;
  questionsHandledToday: number;
  avgResponseTimeMin: number;
  shift?: string;
  isCallAgent?: boolean;
}

const MOCK_EXPERTS: Expert[] = [
  { id: "e1", name: "Dr. Priya Patel", email: "priya@example.com", role: "expert", status: "online", lastActive: new Date(), questionsHandledToday: 12, avgResponseTimeMin: 4.2, shift: "Morning" },
  { id: "e2", name: "Prof. Rajesh Sharma", email: "rajesh@example.com", role: "expert", status: "online", lastActive: new Date(), questionsHandledToday: 8, avgResponseTimeMin: 5.1, shift: "Morning" },
  { id: "e3", name: "Dr. Anita Kumar", email: "anita@example.com", role: "expert", status: "busy", lastActive: new Date(), questionsHandledToday: 15, avgResponseTimeMin: 3.8, currentTask: "Answering question q_452", shift: "Morning" },
  { id: "e4", name: "Dr. Suresh Reddy", email: "suresh@example.com", role: "expert", status: "idle", lastActive: new Date(Date.now() - 900000), questionsHandledToday: 3, avgResponseTimeMin: 7.2, shift: "Morning" },
  { id: "e5", name: "Mod. Kavita Singh", email: "kavita@example.com", role: "moderator", status: "online", lastActive: new Date(), questionsHandledToday: 20, avgResponseTimeMin: 2.1, shift: "Morning" },
  { id: "e6", name: "Dr. Manoj Desai", email: "manoj@example.com", role: "expert", status: "offline", lastActive: new Date(Date.now() - 28800000), questionsHandledToday: 0, avgResponseTimeMin: 0, shift: "Afternoon" },
  { id: "e7", name: "Prof. Deepa Nair", email: "deepa@example.com", role: "expert", status: "online", lastActive: new Date(), questionsHandledToday: 6, avgResponseTimeMin: 4.8, shift: "Morning" },
  { id: "e8", name: "Dr. Arjun Mehta", email: "arjun@example.com", role: "expert", status: "blocked", lastActive: new Date(Date.now() - 86400000), questionsHandledToday: 0, avgResponseTimeMin: 0 },
  { id: "e9", name: "Mod. Sunita Verma", email: "sunita@example.com", role: "moderator", status: "online", lastActive: new Date(), questionsHandledToday: 18, avgResponseTimeMin: 1.9, shift: "Morning" },
  { id: "e10", name: "Agent Rahul Joshi", email: "rahul@example.com", role: "call_agent", status: "online", lastActive: new Date(), questionsHandledToday: 5, avgResponseTimeMin: 8.5, isCallAgent: true, shift: "Morning" },
  { id: "e11", name: "Dr. Neha Gupta", email: "neha@example.com", role: "expert", status: "online", lastActive: new Date(), questionsHandledToday: 9, avgResponseTimeMin: 5.5, shift: "Morning" },
  { id: "e12", name: "Prof. Vikram Rao", email: "vikram@example.com", role: "expert", status: "offline", lastActive: new Date(Date.now() - 43200000), questionsHandledToday: 0, avgResponseTimeMin: 0, shift: "Night" },
];

function getStatusConfig(status: Expert["status"]) {
  switch (status) {
    case "online":
      return {
        color: "bg-emerald-500",
        badge: <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">Online</Badge>,
        ringColor: "ring-emerald-500/30",
      };
    case "busy":
      return {
        color: "bg-amber-500",
        badge: <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px]">Busy</Badge>,
        ringColor: "ring-amber-500/30",
      };
    case "idle":
      return {
        color: "bg-orange-400",
        badge: <Badge className="bg-orange-400/15 text-orange-700 dark:text-orange-400 border-orange-400/30 text-[10px]">Idle</Badge>,
        ringColor: "ring-orange-400/30",
      };
    case "offline":
      return {
        color: "bg-gray-400",
        badge: <Badge className="bg-gray-400/15 text-gray-600 dark:text-gray-400 border-gray-400/30 text-[10px]">Offline</Badge>,
        ringColor: "ring-gray-400/30",
      };
    case "blocked":
      return {
        color: "bg-red-500",
        badge: <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 text-[10px]">Blocked</Badge>,
        ringColor: "ring-red-500/30",
      };
  }
}

function getRoleIcon(role: string) {
  if (role === "moderator") return <Shield className="w-3.5 h-3.5 text-purple-500" />;
  if (role === "call_agent") return <Phone className="w-3.5 h-3.5 text-blue-500" />;
  return <Users className="w-3.5 h-3.5 text-primary" />;
}

function formatLastActive(date: Date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ExpertAvailabilityDashboard() {
  const [experts, setExperts] = useState<Expert[]>(MOCK_EXPERTS);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 600));
    setExperts([...MOCK_EXPERTS]);
    setIsRefreshing(false);
  };

  useEffect(() => {
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, []);

  const filtered = experts.filter((e) => {
    if (searchTerm && !e.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    return true;
  });

  const onlineCount = experts.filter((e) => e.status === "online").length;
  const busyCount = experts.filter((e) => e.status === "busy").length;
  const idleCount = experts.filter((e) => e.status === "idle").length;
  const offlineCount = experts.filter((e) => e.status === "offline").length;
  const blockedCount = experts.filter((e) => e.status === "blocked").length;
  const totalHandledToday = experts.reduce((sum, e) => sum + e.questionsHandledToday, 0);
  const activeExperts = experts.filter((e) => ["online", "busy", "idle"].includes(e.status));
  const avgResponseTime = activeExperts.length
    ? (activeExperts.reduce((sum, e) => sum + e.avgResponseTimeMin, 0) / activeExperts.length).toFixed(1)
    : "0";

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="py-3">
          <CardContent className="px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{onlineCount}</p>
                <p className="text-[10px] text-muted-foreground">Online</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Timer className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{busyCount}</p>
                <p className="text-[10px] text-muted-foreground">Busy</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-400/10 flex items-center justify-center">
                <Clock className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{idleCount}</p>
                <p className="text-[10px] text-muted-foreground">Idle</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-400/10 flex items-center justify-center">
                <UserX className="w-4 h-4 text-gray-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{offlineCount}</p>
                <p className="text-[10px] text-muted-foreground">Offline</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{totalHandledToday}</p>
                <p className="text-[10px] text-muted-foreground">Handled Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="px-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">{avgResponseTime}m</p>
                <p className="text-[10px] text-muted-foreground">Avg Response</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Coverage Bar */}
      <Card>
        <CardContent className="py-4 px-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Shift Coverage — Morning</p>
            <p className="text-xs text-muted-foreground">{onlineCount + busyCount + idleCount} active / {experts.length} total</p>
          </div>
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
            {onlineCount > 0 && (
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${(onlineCount / experts.length) * 100}%` }}
              />
            )}
            {busyCount > 0 && (
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${(busyCount / experts.length) * 100}%` }}
              />
            )}
            {idleCount > 0 && (
              <div
                className="h-full bg-orange-400 transition-all"
                style={{ width: `${(idleCount / experts.length) * 100}%` }}
              />
            )}
            {blockedCount > 0 && (
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${(blockedCount / experts.length) * 100}%` }}
              />
            )}
            {offlineCount > 0 && (
              <div
                className="h-full bg-gray-400 transition-all"
                style={{ width: `${(offlineCount / experts.length) * 100}%` }}
              />
            )}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Online ({onlineCount})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Busy ({busyCount})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Idle ({idleCount})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> Offline ({offlineCount})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Blocked ({blockedCount})</span>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {["all", "online", "busy", "idle", "offline", "blocked"].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all capitalize ${
                filterStatus === status
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:bg-accent/50"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={isRefreshing} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Expert Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((expert) => {
          const config = getStatusConfig(expert.status);
          return (
            <div
              key={expert.id}
              className={`relative p-4 rounded-xl border border-border/60 bg-card/50 hover:bg-accent/30 transition-all ring-1 ${config.ringColor}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {expert.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${config.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-tight">{expert.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {getRoleIcon(expert.role)}
                      <span className="text-[10px] text-muted-foreground capitalize">{expert.role.replace("_", " ")}</span>
                    </div>
                  </div>
                </div>
                {config.badge}
              </div>

              {expert.currentTask && (
                <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md px-2 py-1 mb-3 truncate">
                  {expert.currentTask}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-1.5 rounded-md bg-muted/50">
                  <p className="text-sm font-bold">{expert.questionsHandledToday}</p>
                  <p className="text-[9px] text-muted-foreground">Handled</p>
                </div>
                <div className="p-1.5 rounded-md bg-muted/50">
                  <p className="text-sm font-bold">{expert.avgResponseTimeMin > 0 ? `${expert.avgResponseTimeMin}m` : "—"}</p>
                  <p className="text-[9px] text-muted-foreground">Avg Time</p>
                </div>
                <div className="p-1.5 rounded-md bg-muted/50">
                  <p className="text-sm font-bold">{expert.shift || "—"}</p>
                  <p className="text-[9px] text-muted-foreground">Shift</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Last active: {formatLastActive(expert.lastActive)}</span>
                {expert.status === "online" && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Activity className="w-3 h-3" /> Active now
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No experts match your filter</p>
        </div>
      )}
    </div>
  );
}
