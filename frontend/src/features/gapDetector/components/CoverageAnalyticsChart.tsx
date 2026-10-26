import React from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, ShieldAlert, Zap, Award } from "lucide-react";
import { Badge } from "@/components/atoms/badge";

const WEEKLY_TREND_DATA = [
  { week: "W38 (Sep)", coverage: 51, disclaimers: 680, target: 85 },
  { week: "W39 (Sep)", coverage: 54, disclaimers: 630, target: 85 },
  { week: "W40 (Oct)", coverage: 58, disclaimers: 580, target: 85 },
  { week: "W41 (Oct)", coverage: 61, disclaimers: 510, target: 85 },
  { week: "W42 (Oct)", coverage: 65, disclaimers: 460, target: 85 },
  { week: "W43 (Current)", coverage: 68, disclaimers: 420, target: 85 },
];

const DOMAIN_DISTRIBUTION = [
  { domain: "Pest & Disease", count: 182, criticalGaps: 4 },
  { domain: "Soil & Nutrient", count: 94, criticalGaps: 1 },
  { domain: "Mandi & Prices", count: 68, criticalGaps: 1 },
  { domain: "Govt Schemes", count: 42, criticalGaps: 1 },
  { domain: "Irrigation/Weather", count: 34, criticalGaps: 0 },
];

export const CoverageAnalyticsChart: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* 6-Week Progress Trend Area Chart */}
      <div className="lg:col-span-2 bg-card border border-border/70 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base text-foreground flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Coverage Velocity & Disclaimer Reduction
              </h3>
              <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                +17% in 6 Weeks
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tracking GDB accuracy growth as field outreach closes verified knowledge gaps
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-muted-foreground">National Target:</span>
            <span className="text-xs font-bold text-foreground bg-muted px-2 py-0.5 rounded">85% Benchmark</span>
          </div>
        </div>

        <div className="h-64 mt-4 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={WEEKLY_TREND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="coverageGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="disclaimerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "0.75rem",
                  fontSize: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
              <Area
                type="monotone"
                dataKey="coverage"
                name="Coverage Score (%)"
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#coverageGrad)"
              />
              <Area
                type="monotone"
                dataKey="target"
                name="Target Benchmark (%)"
                stroke="#6366f1"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                fill="none"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Domain Breakdown Bar Chart */}
      <div className="bg-card border border-border/70 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-border/50">
            <h3 className="font-semibold text-base text-foreground flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              Gaps by Agri Domain
            </h3>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              420 Total
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Pest & disease queries represent 43% of total unanswered questions
          </p>

          <div className="h-44 mt-3 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DOMAIN_DISTRIBUTION} layout="vertical" margin={{ top: 5, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.15} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="domain" type="category" tick={{ fontSize: 10 }} width={80} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "11px",
                  }}
                />
                <Bar dataKey="count" name="Disclaimers" fill="#f43f5e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Award className="w-3.5 h-3.5 text-emerald-500" />
            <span>Highest Impact Target:</span>
          </div>
          <span className="font-semibold text-foreground">Cotton & Wheat Rust</span>
        </div>
      </div>
    </div>
  );
};

