import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { IDomainBreakdown, ILanguageBreakdown, IStateBreakdown } from "../types";
import { Layers, Globe, MapPin } from "lucide-react";


interface Props {
  domains?: IDomainBreakdown[];
  languages?: ILanguageBreakdown[];
  states?: IStateBreakdown[];
  isLoading: boolean;
}

const COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#6366f1", "#14b8a6"];

export const FarmerFeedbackBreakdownCharts: React.FC<Props> = ({
  domains = [],
  languages = [],
  states = [],
  isLoading,
}) => {
  const domainData = domains.slice(0, 7).map((d) => ({
    name: d.domain.length > 16 ? `${d.domain.slice(0, 14)}...` : d.domain,
    fullName: d.domain,
    Yes: d.positive,
    No: d.negative,
    score: d.helpfulnessPercentage,
  }));

  const langData = languages.slice(0, 6).map((l) => ({
    name: l.language.toUpperCase(),
    value: l.total,
    score: l.helpfulnessPercentage,
  }));

  const stateData = states.slice(0, 6).map((s) => ({
    name: s.state,
    total: s.total,
    score: s.helpfulnessPercentage,
  }));

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-64 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Domain Satisfaction Bar Chart */}
      <div className="lg:col-span-2 rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-lg backdrop-blur-xl flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              Domain Quality & Feedback Volume
            </h3>
          </div>
          <span className="text-xs text-slate-400">Helpful vs Not Helpful</span>
        </div>

        <div className="h-64 w-full">
          {domainData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No domain feedback recorded yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={domainData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "0.75rem",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                  formatter={(value: any, name: any, item: any) => [
                    `${value} (${item.payload.score}% Helpful)`,
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                />
                <Bar dataKey="Yes" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="No" fill="#f43f5e" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Language & Regional Split */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-lg backdrop-blur-xl flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              Language Distribution
            </h3>
          </div>
          <span className="text-xs text-slate-400">Indic Breakdown</span>
        </div>

        <div className="h-44 w-full">
          {langData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No language data recorded
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={langData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={64}
                  paddingAngle={3}
                >
                  {langData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "0.75rem",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                  formatter={(value: any, name: any, item: any) => [
                    `${value} feedback (${item.payload.score}% satisfaction)`,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* State snapshot mini list */}
        <div className="mt-auto border-t border-slate-800 pt-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2 font-medium">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span>Top Active States</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stateData.map((s, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700/60 text-[11px] text-slate-300"
              >
                {s.name}: <strong className="text-emerald-400">{s.score}%</strong>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
