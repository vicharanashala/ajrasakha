"use client";

import { useState, useEffect } from "react";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./atoms/card";
import { Button } from "./atoms/button";
import { Badge } from "./atoms/badge";
import { Spinner } from "./atoms/spinner";
import { useAgentAnalytics } from "@/hooks/api/plivo/useAgentAnalytics";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { Phone, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import CountUp from "react-countup";
import { useRestartOnView } from "@/hooks/ui/useRestartView";

type TimeFilter = "today" | "week" | "month" | "custom" | "all";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const formatDuration = (seconds: number): string => {
  if (seconds === 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
};

const StatCard = ({ title, value, icon: Icon, description }: { title: string; value: number | string; icon: any; description?: string }) => {
  const { ref, key } = useRestartOnView();
  return (
    <Card ref={ref} className="flex flex-col border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm hover:shadow-md transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">
          {typeof value === 'number' ? (
            <CountUp key={key} end={value} duration={2} preserveValue />
          ) : (
            value
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
};


const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length > 0) {
    return (
      <div className="bg-card text-gray-900 dark:text-gray-100 border dark:border-gray-700 p-2 rounded-md shadow-lg text-sm">
        <strong>{payload[0].payload.date}</strong>: {payload[0].value} calls
      </div>
    );
  }
  return null;
};

const PieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length > 0) {
    return (
      <div className="bg-card text-gray-900 dark:text-gray-100 border dark:border-gray-700 p-2 rounded-md shadow-lg text-sm">
        <strong>{payload[0].name}</strong>: {payload[0].value} calls
      </div>
    );
  }
  return null;
};

export const CallAgentDashboard = () => {
  const { data: user } = useGetCurrentUser();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // Calculate date range based on filter
  const getDateRange = () => {
    const now = new Date();
    
    switch (timeFilter) {
      case "today":
        return {
          startDate: startOfDay(now).toISOString(),
          endDate: endOfDay(now).toISOString(),
        };
      case "week":
        return {
          startDate: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
          endDate: endOfWeek(now, { weekStartsOn: 1 }).toISOString(),
        };
      case "month":
        return {
          startDate: startOfMonth(now).toISOString(),
          endDate: endOfMonth(now).toISOString(),
        };
      case "custom":
        if (customStartDate && customEndDate) {
          return {
            startDate: startOfDay(new Date(customStartDate)).toISOString(),
            endDate: endOfDay(new Date(customEndDate)).toISOString(),
          };
        }
        return undefined;
      case "all":
      default:
        return undefined;
    }
  };

  const dateRange = getDateRange();
  const { data: analytics, isLoading, error, refetch } = useAgentAnalytics({
    startDate: dateRange?.startDate,
    endDate: dateRange?.endDate,
  });

  // Reset custom dates when switching away from custom filter
  useEffect(() => {
    if (timeFilter !== "custom") {
      setCustomStartDate("");
      setCustomEndDate("");
    }
  }, [timeFilter]);

  if (user?.role !== "call_agent") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Access denied. This dashboard is only available for call agents.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto p-6">
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Call Agent Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, {user?.firstName} {user?.lastName}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={timeFilter === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("today")}
            >
              Today
            </Button>
            <Button
              variant={timeFilter === "week" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("week")}
            >
              This Week
            </Button>
            <Button
              variant={timeFilter === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("month")}
            >
              This Month
            </Button>
            <Button
              variant={timeFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("all")}
            >
              All Time
            </Button>
            <Button
              variant={timeFilter === "custom" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("custom")}
            >
              Custom
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {timeFilter === "custom" && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <Button
                  onClick={() => refetch()}
                  disabled={!customStartDate || !customEndDate}
                >
                  Apply Filter
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Spinner text="Loading analytics..." />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-red-500">
                Failed to load analytics. Please try again.
              </p>
            </CardContent>
          </Card>
        ) : analytics ? (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Total Calls"
                value={analytics.totalCalls}
                icon={Phone}
                description={timeFilter === "all" ? "All time" : "Selected period"}
              />
              <StatCard
                title="Average Call Duration"
                value={formatDuration(analytics.averageDuration)}
                icon={Clock}
                description="Selected period"
              />
              <StatCard
                title="Domains Covered"
                value={analytics.domains.length}
                icon={TrendingUp}
                description="Selected period"
              />
              {/* Agent Live Status Card */}
              <Card className="flex flex-col border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm hover:shadow-md transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Agent Status</CardTitle>
                  <div className="flex h-2 w-2 relative">
                    {user?.isCallAgentActive && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${user?.isCallAgentActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className={`text-xl font-bold ${user?.isCallAgentActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {user?.isCallAgentActive ? "Online & Ready" : "Offline"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {user?.isCallAgentActive 
                        ? `Receiving on ${user.agent}` 
                        : "Go online in Call Interface"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>


            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daily Call Trend */}
              <Card>
                <CardHeader>
                  <CardTitle>Daily Call Trend</CardTitle>
                  <CardDescription>Last 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.dailyCallTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Domains Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Domains Answered</CardTitle>
                  <CardDescription>Top domains by call count</CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics.domains.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={analytics.domains}
                          dataKey="count"
                          nameKey="domain"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={4}
                          label={({ domain, percent }) => `${domain} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {analytics.domains.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      No domain data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Call Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Call Status Breakdown</CardTitle>
                <CardDescription>Distribution of call statuses</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.callsByStatus.length > 0 ? (
                  <div className="space-y-4">
                    {analytics.callsByStatus.map((status) => {
                      const maxCount = Math.max(...analytics.callsByStatus.map(s => s.count));
                      const percentage = (status.count / maxCount) * 100;
                      return (
                        <div key={status.status} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium capitalize">{status.status}</span>
                            <Badge variant="secondary">{status.count} calls</Badge>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[100px] text-muted-foreground">
                    No status data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </main>
  );
};
