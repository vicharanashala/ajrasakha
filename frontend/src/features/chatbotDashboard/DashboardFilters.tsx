import { useState } from "react";
import { CROPS, SEASONS, VILLAGES } from "@/components/MetaData";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";


// ─── TYPES ───────────────────────────────────────────────────────────────────
export interface DashboardFilterValues {
  village: string;
  crop: string;
  season: string;
  startTime?: Date;
  endTime?: Date;
}

interface DashboardFiltersProps {
  onFilterChange?: (filters: DashboardFilterValues) => void;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export function DashboardFilters({ onFilterChange }: DashboardFiltersProps) {
  const [village, setVillage] = useState("all");
  const [crop, setCrop] = useState("all");
  const [season, setSeason] = useState("all");
  const [dateFilter, setDateFilter] = useState<Partial<AdvanceFilterValues>>({
    startTime: undefined,
    endTime: undefined,
  });

  const fireChange = (overrides: Partial<DashboardFilterValues>) => {
    onFilterChange?.({
      village,
      crop,
      season,
      startTime: dateFilter.startTime ?? undefined,
      endTime: dateFilter.endTime ?? undefined,
      ...overrides,
    });
  };

  const handleDateChange = (key: string, value: any) => {
    setDateFilter((prev) => {
      const updated = { ...prev, [key]: value };
      onFilterChange?.({
        village,
        crop,
        season,
        startTime: updated.startTime ?? undefined,
        endTime: updated.endTime ?? undefined,
      });
      return updated;
    });
  };

  const baseSelect =
    "text-sm h-10 px-3 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 cursor-pointer outline-none min-w-[150px] shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-gray-700 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] dark:bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23ccc%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] pr-8";

  const activeSelect =
    "text-sm h-10 px-3 border border-green-500 dark:border-green-500 rounded-md bg-green-50 dark:bg-gray-800 text-green-700 dark:text-green-400 font-medium cursor-pointer outline-none min-w-[150px] shadow-sm transition-all hover:bg-green-100 dark:hover:bg-gray-700 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%231E7A3C%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] dark:bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%234adc64%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] pr-8";

  const getSubtitle = () => {
    const parts: string[] = [];
    parts.push(village !== "all" ? village : "All villages");
    parts.push(crop !== "all" ? crop : "All crops");
    parts.push(season !== "all" ? season : "All seasons");

    if (dateFilter.startTime && dateFilter.endTime) {
      const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      parts.push(`${fmt(dateFilter.startTime)} – ${fmt(dateFilter.endTime)}`);
    }
    return `Showing data for: ${parts.join(" · ")} · Updated every 15 min`;
  };

  return (
    <div className="mb-4">
      {/* Page header */}
      <div
        style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 }}
      >
        <div>
          <h1 className="text-[#1a1a1a] dark:text-white" style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>
            National overview
          </h1>
          <p className="text-[#888] dark:text-gray-400" style={{ fontSize: 12, marginTop: 4, margin: 0 }}>
            {getSubtitle()}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 flex-wrap">
      {/* Village Filter */}
        <select
          value={village}
          onChange={(e) => {
            setVillage(e.target.value);
            fireChange({ village: e.target.value });
          }}
          className={village !== "all" ? activeSelect : baseSelect}
        >
          <option className="text-gray-700 bg-white dark:bg-gray-800 dark:text-gray-200" value="all">All Villages</option>
          {VILLAGES.map((v) => (
            <option className="text-gray-700 bg-white dark:bg-gray-800 dark:text-gray-200" key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center" />

        {/* Crop Filter */}
        <select
          value={crop}
          onChange={(e) => {
            setCrop(e.target.value);
            fireChange({ crop: e.target.value });
          }}
          className={crop !== "all" ? activeSelect : baseSelect}
        >
          <option className="text-gray-700 bg-white dark:bg-gray-800 dark:text-gray-200" value="all">All Crops</option>
          {CROPS.map((c) => (
            <option className="text-gray-700 bg-white dark:bg-gray-800 dark:text-gray-200" key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center" />

        {/* Season Filter */}
        <select
          value={season}
          onChange={(e) => {
            setSeason(e.target.value);
            fireChange({ season: e.target.value });
          }}
          className={season !== "all" ? activeSelect : baseSelect}
        >
          <option className="text-gray-700 bg-white dark:bg-gray-800 dark:text-gray-200" value="all">All Seasons</option>
          {SEASONS.map((s) => (
            <option className="text-gray-700 bg-white dark:bg-gray-800 dark:text-gray-200" key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center" />

        {/* Date Range Filter (label hidden, inline calendar button) */}
        <div className="min-w-[200px] [&_label]:hidden">
          <DateRangeFilter
            customName=""
            advanceFilter={dateFilter}
            handleDialogChange={handleDateChange}
            className={
              dateFilter.startTime
                ? "!h-10 !text-sm !border-green-500 dark:!border-green-500 !bg-green-50 dark:!bg-gray-800 !text-green-700 dark:!text-green-400 !font-medium hover:!bg-green-100 dark:hover:!bg-gray-700"
                : "!h-10 !text-sm !border-gray-200 dark:!border-gray-700 !bg-white dark:!bg-gray-800 !text-gray-700 dark:!text-gray-200 !font-normal hover:!bg-gray-50 dark:hover:!bg-gray-700"
            }
          />
        </div>

      {/* Action Buttons */}
      <button
        onClick={() => console.log("Export PDF clicked")}
        className="text-sm px-4 h-10 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
      >
        Export PDF
      </button>
      <button
        onClick={() => console.log("Share report clicked")}
        className="text-sm px-4 h-10 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
      >
        Share report
      </button>
      </div>
    </div>
  );
}
