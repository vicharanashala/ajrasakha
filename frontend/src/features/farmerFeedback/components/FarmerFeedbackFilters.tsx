import React from "react";
import { Search, Filter, RefreshCw, Sparkles, FileText, Send } from "lucide-react";
import type { IFeedbackFilterState } from "../types";


interface Props {
  filters: IFeedbackFilterState;
  onChange: (filters: Partial<IFeedbackFilterState>) => void;
  onRefresh: () => void;
  onOpenDigest: () => void;
  onOpenSimulator: () => void;
  onTriggerFlagging: () => void;
  isFlagging: boolean;
}

const DOMAINS = [
  "All Domains",
  "Pest & Disease",
  "Weather Advisory",
  "Soil Health & Fertilizer",
  "Government Schemes",
  "Market Prices & Mandi",
  "Package of Practices",
  "Irrigation",
];

const STATES = [
  "All States",
  "Punjab",
  "Haryana",
  "Maharashtra",
  "Karnataka",
  "Uttar Pradesh",
  "Madhya Pradesh",
  "Tamil Nadu",
  "Andhra Pradesh",
  "Telangana",
  "Gujarat",
  "Bihar",
  "Rajasthan",
];

const LANGUAGES = [
  { label: "All Languages", value: "" },
  { label: "Hindi (हिंदी)", value: "hi" },
  { label: "English", value: "en" },
  { label: "Kannada (ಕನ್ನಡ)", value: "kn" },
  { label: "Telugu (తెలుగు)", value: "te" },
  { label: "Tamil (தமிழ்)", value: "ta" },
  { label: "Marathi (मराठी)", value: "mr" },
  { label: "Punjabi (ਪੰਜਾਬੀ)", value: "pa" },
  { label: "Gujarati (ગુજરાતી)", value: "gu" },
];

export const FarmerFeedbackFilters: React.FC<Props> = ({
  filters,
  onChange,
  onRefresh,
  onOpenDigest,
  onOpenSimulator,
  onTriggerFlagging,
  isFlagging,
}) => {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-slate-900/80 border border-slate-800 p-4 backdrop-blur-xl shadow-md">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search query, crop, or GDB question..."
            value={filters.search || ""}
            onChange={(e) => onChange({ search: e.target.value, page: 1 })}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl bg-slate-800/80 border border-slate-700/60 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Simulate feedback button */}
          <button
            onClick={onOpenSimulator}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Send className="w-3.5 h-3.5 text-blue-400" />
            <span>Simulate WhatsApp Feedback</span>
          </button>

          {/* Trigger Auto Flagging */}
          <button
            onClick={onTriggerFlagging}
            disabled={isFlagging}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-sm transition-all disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isFlagging ? "Scanning GDB..." : "Run Auto-Flag Pipeline"}</span>
          </button>

          {/* Weekly Digest */}
          <button
            onClick={onOpenDigest}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Weekly Agri Digest</span>
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            title="Refresh metrics"
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Select Filters Row */}
      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400 font-medium">
          <Filter className="w-3.5 h-3.5" />
          <span>Filters:</span>
        </div>

        {/* Domain Filter */}
        <select
          value={filters.domain || "All Domains"}
          onChange={(e) =>
            onChange({
              domain: e.target.value === "All Domains" ? undefined : e.target.value,
              page: 1,
            })
          }
          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-emerald-500"
        >
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* State Filter */}
        <select
          value={filters.state || "All States"}
          onChange={(e) =>
            onChange({
              state: e.target.value === "All States" ? undefined : e.target.value,
              page: 1,
            })
          }
          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-emerald-500"
        >
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Language Filter */}
        <select
          value={filters.language || ""}
          onChange={(e) =>
            onChange({
              language: e.target.value === "" ? undefined : e.target.value,
              page: 1,
            })
          }
          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-emerald-500"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>

        {/* Clear Filters */}
        {(filters.domain || filters.state || filters.language || filters.search) && (
          <button
            onClick={() =>
              onChange({
                domain: undefined,
                state: undefined,
                language: undefined,
                search: undefined,
                page: 1,
              })
            }
            className="text-xs text-rose-400 hover:text-rose-300 ml-auto font-medium"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
};
