"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./atoms/card";
import { Button } from "./atoms/button";
import { Badge } from "./atoms/badge";
import { Spinner } from "./atoms/spinner";
import { useACCAnalytics } from "../hooks/api/plivo/useACCAnalytics";
import { useGetCurrentUser } from "../hooks/api/user/useGetCurrentUser";
import { LiveCallMonitor } from "./LiveCallMonitor";
import { 
  Phone, 
  Calendar, 
  TrendingUp, 
  RefreshCw, 
  Filter, 
  BarChart3, 
  LineChart as LineChartIcon,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Radio
} from "lucide-react";

// ... existing code inside component ...
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";
import CountUp from "react-countup";
import { useQuery } from "@tanstack/react-query";
import { plivoService } from "../hooks/api/plivo/api";
import { getCurrentUser } from "../hooks/api/api-fetch";
import { getIdToken } from "firebase/auth";

import { env } from "../config/env";

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

const FloatingPopoverText = ({ text, title = "Content", characterLimit = 120, isBold = false }: { text: string; title?: string; characterLimit?: number; isBold?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!text) return <span className="text-muted-foreground">-</span>;
  if (text.length <= characterLimit) {
    return <div className={`whitespace-pre-wrap text-xs ${isBold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{text}</div>;
  }

  return (
    <div className="relative text-xs">
      <div className={`text-xs ${isBold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
        {text.slice(0, characterLimit)}...
      </div>
      
      <div className="mt-1">
        <button
          onClick={(e) => {
            e.preventDefault();
            setIsOpen(!isOpen);
          }}
          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline cursor-pointer focus:outline-none"
        >
          {isOpen ? "Hide Details" : "View Details"}
        </button>
      </div>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-transparent cursor-default" 
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div 
            className="absolute left-0 top-full mt-2 sm:w-[450px] w-80 max-h-72 overflow-y-auto bg-popover border border-border shadow-2xl rounded-xl p-4 z-50 text-popover-foreground text-xs animate-in fade-in slide-in-from-top-1 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-border pb-2 mb-2">
              <span className="font-bold text-foreground uppercase tracking-wider text-[10px]">{title}</span>
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="text-muted-foreground hover:text-foreground text-xs font-bold focus:outline-none cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="whitespace-pre-wrap leading-relaxed max-w-full overflow-x-hidden font-normal text-muted-foreground">
              {text}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const ACCAnalyticsDashboard = () => {
  const { data: user } = useGetCurrentUser();
  const [activeDashboardView, setActiveDashboardView] = useState<'analytics' | 'live_monitor'>('analytics');
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  
  // Search, Domain Filter & Pagination State
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isDownloading, setIsDownloading] = useState(false);

  // Debounce search term changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const { data: analytics, isLoading, error, refetch } = useACCAnalytics({
    startDate: customStartDate ? new Date(customStartDate).toISOString() : undefined,
    endDate: customEndDate ? new Date(customEndDate).toISOString() : undefined,
  });

  const { data: queriesData, isLoading: isLoadingQueries, error: queriesError, refetch: refetchQueries } = useQuery({
    queryKey: ["acc-queries", customStartDate, customEndDate, debouncedSearch, selectedDomain, currentPage, pageSize],
    queryFn: async () => {
      console.log("🔍 [ACC-QUERIES-UI] Fetching queries with params:", {
        customStartDate, customEndDate, debouncedSearch, selectedDomain, currentPage, pageSize
      });
      try {
        const res = await plivoService.getQueries({
          startDate: customStartDate ? new Date(customStartDate).toISOString() : undefined,
          endDate: customEndDate ? new Date(customEndDate).toISOString() : undefined,
          search: debouncedSearch,
          domain: selectedDomain !== "All" ? selectedDomain : undefined,
          limit: pageSize,
          page: currentPage,
        });
        console.log("✅ [ACC-QUERIES-UI] Fetched queries result:", res);
        return res;
      } catch (err) {
        console.error("❌ [ACC-QUERIES-UI] Error fetching queries:", err);
        throw err;
      }
    },
    enabled: user?.role === "admin" || user?.role === "moderator",
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    console.log("📊 [ACC-QUERIES-UI] Render state:", {
      userRole: user?.role,
      isLoadingQueries,
      queriesError,
      queriesDataTotal: queriesData?.total,
      queriesLength: queriesData?.queries?.length
    });
  }, [user, isLoadingQueries, queriesError, queriesData]);

  const handleDownloadQueries = async () => {
    setIsDownloading(true);
    try {
      const params = new URLSearchParams();
      if (customStartDate) {
        params.append("startDate", new Date(customStartDate).toISOString());
      }
      if (customEndDate) {
        params.append("endDate", new Date(customEndDate).toISOString());
      }
      if (debouncedSearch) {
        params.append("search", debouncedSearch);
      }
      if (selectedDomain && selectedDomain !== "All") {
        params.append("domain", selectedDomain);
      }

      const firebaseUser = await getCurrentUser();
      let token = "";
      if (firebaseUser) {
        token = await getIdToken(firebaseUser);
      }

      const baseApi = env.apiBaseUrl();
      const rawUrl = `${baseApi}/plivo/download-acc-queries?${params.toString()}`;
      const url = rawUrl.includes('localhost:4000') ? rawUrl.replace('localhost:4000', 'localhost:4001') : rawUrl;
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Failed to download queries: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", `acc_queries_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error("Failed to download queries:", err);
      alert(err.message || "Failed to download queries");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRefreshAll = () => {
    refetch();
    refetchQueries();
  };

  if (user?.role !== "admin" && user?.role !== "moderator") {
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
      {/* Header & View Switcher */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-xl border">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-8 w-8 text-primary" />
            ACC Management Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Call center analytics, domain performance, and real-time live call monitoring
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-muted p-1 rounded-lg flex items-center gap-1 border">
            <Button
              variant={activeDashboardView === 'analytics' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveDashboardView('analytics')}
              className="text-xs flex items-center gap-1.5"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Analytics
            </Button>

            <Button
              variant={activeDashboardView === 'live_monitor' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveDashboardView('live_monitor')}
              className="text-xs flex items-center gap-1.5 text-red-500 font-semibold"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              Live Call Intercept
            </Button>
          </div>

          {activeDashboardView === 'analytics' && (
            <>
              <Button
                variant={showCustomFilter ? "default" : "outline"}
                size="sm"
                onClick={() => setShowCustomFilter(!showCustomFilter)}
              >
                <Filter className="h-4 w-4 mr-2" />
                {showCustomFilter ? "Hide Filter" : "Date Filter"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefreshAll}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadQueries} 
                disabled={isDownloading}
                className="border-emerald-200 hover:bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:hover:bg-emerald-950/20"
              >
                <Download className="h-4 w-4 mr-2" />
                {isDownloading ? "Downloading..." : "Download Queries"}
              </Button>
            </>
          )}
        </div>
      </div>

      {activeDashboardView === 'live_monitor' ? (
        <LiveCallMonitor />
      ) : (
        <>

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
                onClick={handleRefreshAll}
                disabled={!customStartDate || !customEndDate}
              >
                Apply
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCustomStartDate("");
                  setCustomEndDate("");
                  // Wait, we need to clear filters and refresh
                  setTimeout(() => {
                    refetch();
                    refetchQueries();
                  }, 0);
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

          {/* Queries List Table Card */}
          <Card className="mt-6 border-zinc-200 dark:border-zinc-800 shadow-lg">
            <CardHeader className="border-b border-zinc-100 dark:border-zinc-900 pb-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                    <Phone className="h-5 w-5 text-indigo-500" />
                    Agricultural Queries List
                  </CardTitle>
                  <CardDescription className="text-xs">
                    List of all queries asked with domain metadata, crops, and specialist responses
                  </CardDescription>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  {/* Search Input */}
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search crop, domain, question, or phone..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* Domain Filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Domain:</span>
                    <select
                      value={selectedDomain}
                      onChange={(e) => {
                        setSelectedDomain(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 text-sm border border-input rounded-lg bg-background text-foreground max-w-[180px] focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="All">All Domains</option>
                      <option value="Soil Health and Nutrient Management">Nutrient Management</option>
                      <option value="Irrigation and Water Management">Irrigation & Water</option>
                      <option value="Insect - Pest Management">Insect - Pest Management</option>
                      <option value="Disease Management">Disease Management</option>
                      <option value="Seed and Variety Selection">Seed & Variety Selection</option>
                      <option value="Cultural and Crop Management Practices">Crop Management</option>
                      <option value="Organic and Natural Farming">Organic Farming</option>
                      <option value="Weed Management">Weed Management</option>
                      <option value="Climate, Weather & Stress Management">Climate & Weather</option>
                      <option value="Farm Tools & Mechanisation">Farm Tools & Mech</option>
                      <option value="Post-Harvest Management & Storage">Post-Harvest & Storage</option>
                      <option value="Market Prices, MSP & Marketing">Market Prices & MSP</option>
                      <option value="Agricultural Schemes & Subsidies">Schemes & Subsidies</option>
                      <option value="Credit, Loan & Insurance">Credit, Loan & Insurance</option>
                      <option value="Capacity Building & Extension">Capacity Building</option>
                      <option value="Rural Infrastructure">Rural Infrastructure</option>
                      <option value="Animal Husbandry & Livestock">Animal Husbandry</option>
                      <option value="Fisheries & Aquaculture">Fisheries & Aquaculture</option>
                      <option value="Horticulture & Landscaping">Horticulture</option>
                      <option value="Allied Agricultural Activities">Allied Activities</option>
                      <option value="Others">Others</option>
                      <option value="NA / Invalid Data">NA / Invalid</option>
                    </select>
                  </div>

                  {/* Page Size Select */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Page Size:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 text-sm border border-input rounded-lg bg-background text-foreground"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {isLoadingQueries ? (
                <div className="flex justify-center items-center py-12">
                  <Spinner text="Loading queries..." />
                </div>
              ) : !queriesData || queriesData.queries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground flex flex-col items-center justify-center">
                  <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm">No queries found matching the criteria.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Responsive Table */}
                  <div className="overflow-x-auto border border-zinc-200/50 dark:border-zinc-800/80 rounded-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="py-3 px-4 text-left font-medium">Date</th>
                          <th className="py-3 px-4 text-left font-medium">Domain</th>
                          <th className="py-3 px-4 text-left font-medium">Crop</th>
                          <th className="py-3 px-4 text-left font-medium">Question</th>
                          <th className="py-3 px-4 text-left font-medium">Specialist Answer</th>
                          <th className="py-3 px-4 text-left font-medium">Farmer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200/40 dark:divide-zinc-800/50">
                        {queriesData.queries.map((item: any) => (
                          <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                            <td className="py-3 px-4 whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(item.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {Array.isArray(item.domain) && item.domain.length > 0 ? (
                                  item.domain.map((d: string, idx: number) => (
                                    <Badge key={idx} className="bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border-none font-semibold text-[10px] whitespace-normal leading-normal">
                                      {d}
                                    </Badge>
                                  ))
                                ) : item.domain && typeof item.domain === 'string' && item.domain.trim() ? (
                                  <Badge className="bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border-none font-semibold text-[10px] whitespace-normal leading-normal">
                                    {item.domain}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <Badge className="bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-none font-semibold text-[10px]">
                                {item.crop || "Unknown"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 max-w-xs md:max-w-sm">
                              <FloatingPopoverText text={item.question} title="Question Asked" characterLimit={100} isBold={true} />
                            </td>
                            <td className="py-3 px-4 max-w-xs md:max-w-sm">
                              <FloatingPopoverText text={item.answer} title="Specialist Answer" characterLimit={150} isBold={false} />
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-zinc-900 dark:text-zinc-100">{item.farmerName || "Unknown"}</div>
                              <div className="text-xs text-muted-foreground">{item.phone}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-900 text-xs">
                    <span className="text-muted-foreground">
                      Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, queriesData.total)} of {queriesData.total} queries
                    </span>

                    <div className="flex items-center gap-1">
                      {/* First Page */}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="h-8 w-8 rounded-lg cursor-pointer"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      
                      {/* Prev Page */}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                        disabled={currentPage === 1}
                        className="h-8 w-8 rounded-lg cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      <span className="px-3 py-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                        Page {currentPage} of {Math.ceil(queriesData.total / pageSize) || 1}
                      </span>

                      {/* Next Page */}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentPage((p) => Math.min(p + 1, Math.ceil(queriesData.total / pageSize)))}
                        disabled={currentPage >= Math.ceil(queriesData.total / pageSize)}
                        className="h-8 w-8 rounded-lg cursor-pointer"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>

                      {/* Last Page */}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentPage(Math.ceil(queriesData.total / pageSize) || 1)}
                        disabled={currentPage >= Math.ceil(queriesData.total / pageSize)}
                        className="h-8 w-8 rounded-lg cursor-pointer"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
};
