"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./atoms/card";
import { Button } from "./atoms/button";
import { Badge } from "./atoms/badge";
import { Spinner } from "./atoms/spinner";
import { useACCAnalytics } from "@/hooks/api/plivo/useACCAnalytics";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { Phone, Calendar, TrendingUp, RefreshCw, Filter, BarChart3, LineChart as LineChartIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";
import CountUp from "react-countup";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

// Add custom styles for chart labels
const chartLabelStyle = {
  fill: "currentColor",
  color: "inherit",
};

const StatCard = ({ title, value, icon: Icon, description, color }: { title: string; value: number; icon: any; description?: string; color?: string }) => {
  return (
    <Card className="flex flex-col border-l-4 hover:shadow-lg transition-shadow" style={{ borderLeftColor: color || "var(--primary)" }}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4" style={{ color: color || "var(--primary)" }} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-foreground">
          <CountUp end={value} duration={1.5} preserveValue />
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length > 0) {
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-sm text-foreground">{payload[0].payload.date || payload[0].payload.month}</p>
        <p className="text-sm text-muted-foreground">{payload[0].value} calls</p>
      </div>
    );
  }
  return null;
};

export const ACCAnalyticsDashboard = () => {
  const { data: user } = useGetCurrentUser();
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const { data: analytics, isLoading, error, refetch } = useACCAnalytics({
    startDate: customStartDate ? new Date(customStartDate).toISOString() : undefined,
    endDate: customEndDate ? new Date(customEndDate).toISOString() : undefined,
  });

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md border-destructive">
          <CardContent className="pt-6 text-center">
            <div className="text-destructive text-4xl mb-4">🔒</div>
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-muted-foreground">
              This dashboard is only available for administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-8 w-8 text-primary" />
            ACC Analytics Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Domain-based call analytics overview
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={showCustomFilter ? "default" : "outline"}
            size="sm"
            onClick={() => setShowCustomFilter(!showCustomFilter)}
          >
            <Filter className="h-4 w-4 mr-2" />
            {showCustomFilter ? "Hide Filter" : "Date Filter"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Custom Date Filter */}
      {showCustomFilter && (
        <Card className="border-primary">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="text-sm font-medium mb-2 block text-foreground">Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                />
              </div>
              <div className="flex-1 w-full">
                <label className="text-sm font-medium mb-2 block text-foreground">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                />
              </div>
              <Button
                onClick={() => refetch()}
                disabled={!customStartDate || !customEndDate}
              >
                Apply
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCustomStartDate("");
                  setCustomEndDate("");
                  refetch();
                }}
              >
                Clear
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
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <div className="text-4xl mb-2">⚠️</div>
              <p className="font-semibold">Failed to load analytics</p>
              <p className="text-sm text-muted-foreground mt-1">Please try again later.</p>
            </div>
          </CardContent>
        </Card>
      ) : analytics ? (
        <div className="space-y-6">
          {/* Stats Cards - Direct data for all time periods */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Calls"
              value={analytics.totalCalls}
              icon={Phone}
              description="All time"
              color="#3b82f6"
            />
            <StatCard
              title="Calls Today"
              value={analytics.callsToday}
              icon={Calendar}
              description="Today"
              color="#10b981"
            />
            <StatCard
              title="This Week"
              value={analytics.callsThisWeek}
              icon={TrendingUp}
              description="Last 7 days"
              color="#f59e0b"
            />
            <StatCard
              title="This Month"
              value={analytics.callsThisMonth}
              icon={TrendingUp}
              description="Current month"
              color="#8b5cf6"
            />
          </div>

          {/* Domains Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Domains Breakdown
              </CardTitle>
              <CardDescription>Calls by domain with time-based statistics</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.domains.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-3 px-4 font-semibold">Domain</th>
                        <th className="text-right py-3 px-4 font-semibold">Total</th>
                        <th className="text-right py-3 px-4 font-semibold">Today</th>
                        <th className="text-right py-3 px-4 font-semibold">This Week</th>
                        <th className="text-right py-3 px-4 font-semibold">This Month</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.domains.map((domain, index) => (
                        <tr key={index} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-medium">{domain.domain}</td>
                          <td className="text-right py-3 px-4">
                            <Badge variant="default" className="bg-blue-500">{domain.count}</Badge>
                          </td>
                          <td className="text-right py-3 px-4">
                            <span className={domain.today > 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground"}>
                              {domain.today}
                            </span>
                          </td>
                          <td className="text-right py-3 px-4">
                            <span className={domain.thisWeek > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-muted-foreground"}>
                              {domain.thisWeek}
                            </span>
                          </td>
                          <td className="text-right py-3 px-4">
                            <span className={domain.thisMonth > 0 ? "text-violet-600 dark:text-violet-400 font-semibold" : "text-muted-foreground"}>
                              {domain.thisMonth}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mb-3 opacity-50" />
                  <p>No domain data available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Monthly Call Trend
                </CardTitle>
                <CardDescription>Last 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.monthlyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fontSize: 12, style: { fill: "var(--muted-foreground)" } }}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis 
                        tick={{ fontSize: 12, style: { fill: "var(--muted-foreground)" } }}
                        stroke="var(--muted-foreground)"
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {analytics.monthlyTrend.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mb-3 opacity-50" />
                    <p>No monthly trend data available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChartIcon className="h-5 w-5 text-primary" />
                  Daily Call Trend
                </CardTitle>
                <CardDescription>Last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.dailyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12, style: { fill: "var(--muted-foreground)" } }}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis 
                        tick={{ fontSize: 12, style: { fill: "var(--muted-foreground)" } }}
                        stroke="var(--muted-foreground)"
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#8b5cf6" 
                        strokeWidth={3}
                        dot={{ fill: "#8b5cf6", r: 4, strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                    <LineChartIcon className="h-12 w-12 mb-3 opacity-50" />
                    <p>No daily trend data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
};
