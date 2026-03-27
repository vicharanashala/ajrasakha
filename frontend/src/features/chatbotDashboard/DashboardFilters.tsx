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
    "text-sm h-10 px-3 border border-gray-200 rounded-md bg-white text-gray-700 cursor-pointer outline-none min-w-[150px] shadow-sm transition-all hover:bg-gray-50 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] pr-8";

  const activeSelect =
    "text-sm h-10 px-3 border border-green-500 rounded-md bg-green-50 text-green-700 font-medium cursor-pointer outline-none min-w-[150px] shadow-sm transition-all hover:bg-green-100 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%231E7A3C%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] pr-8";

  return (
    <div className="flex items-start gap-2 mb-4 flex-wrap">
      {/* Village Filter */}
      <select
        value={village}
        onChange={(e) => {
          setVillage(e.target.value);
          fireChange({ village: e.target.value });
        }}
        className={village !== "all" ? activeSelect : baseSelect}
      >
        <option className="text-gray-700 bg-white" value="all">All Villages</option>
        {VILLAGES.map((v) => (
          <option className="text-gray-700 bg-white" key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <div className="w-px h-5 bg-gray-200 self-center" />

      {/* Crop Filter */}
      <select
        value={crop}
        onChange={(e) => {
          setCrop(e.target.value);
          fireChange({ crop: e.target.value });
        }}
        className={crop !== "all" ? activeSelect : baseSelect}
      >
        <option className="text-gray-700 bg-white" value="all">All Crops</option>
        {CROPS.map((c) => (
          <option className="text-gray-700 bg-white" key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <div className="w-px h-5 bg-gray-200 self-center" />

      {/* Season Filter */}
      <select
        value={season}
        onChange={(e) => {
          setSeason(e.target.value);
          fireChange({ season: e.target.value });
        }}
        className={season !== "all" ? activeSelect : baseSelect}
      >
        <option className="text-gray-700 bg-white" value="all">All Seasons</option>
        {SEASONS.map((s) => (
          <option className="text-gray-700 bg-white" key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <div className="w-px h-5 bg-gray-200 self-center" />

      {/* Date Range Filter (label hidden, inline calendar button) */}
      <div className="min-w-[200px] [&_label]:hidden">
        <DateRangeFilter
          customName=""
          advanceFilter={dateFilter}
          handleDialogChange={handleDateChange}
          className="!h-10 !text-sm !text-gray-700 !font-normal !bg-white hover:!bg-gray-50"
        />
      </div>
    </div>
  );
}
