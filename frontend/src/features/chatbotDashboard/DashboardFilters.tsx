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
  filters: DashboardFilterValues;
  onFilterChange: (filters: DashboardFilterValues) => void;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export function DashboardFilters({ filters, onFilterChange }: DashboardFiltersProps) {
  const { village, crop, season, startTime, endTime } = filters;

  const handleChange = (overrides: Partial<DashboardFilterValues>) => {
    onFilterChange({ ...filters, ...overrides });
  };

  const handleDateChange = (key: string, value: any) => {
    handleChange({ [key]: value });
  };

  const baseSelect =
    "text-sm h-10 px-3 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200 cursor-pointer outline-none w-full lg:min-w-[150px] lg:w-auto shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2a2a2a] appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] dark:bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23ccc%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] pr-8";

  const activeSelect =
    "text-sm h-10 px-3 border border-green-500 dark:border-green-500 rounded-md bg-green-50 dark:bg-[#1a1a1a] text-green-700 dark:text-green-400 font-medium cursor-pointer outline-none w-full lg:min-w-[150px] lg:w-auto shadow-sm transition-all hover:bg-green-100 dark:hover:bg-[#2a2a2a] appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%231E7A3C%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] dark:bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%234adc64%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center] pr-8";

  const getSubtitle = () => {
    const parts: string[] = [];
    parts.push(village !== "all" ? village : "All villages");
    parts.push(crop !== "all" ? crop : "All crops");
    parts.push(season !== "all" ? season : "All seasons");

    if (startTime && endTime) {
      const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      parts.push(`${fmt(startTime)} – ${fmt(endTime)}`);
    }
    return `Showing data for: ${parts.join(" · ")} · Updated every 15 min`;
  };

  return (
    <div className="mb-4">
      {/* Page header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[#1a1a1a] dark:text-white" style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>
            National overview
          </h1>
          <p className="text-[#888] dark:text-gray-400" style={{ fontSize: 12, marginTop: 4, margin: 0 }}>
            {getSubtitle()}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <button
            onClick={() => console.log("Export PDF clicked")}
            className="w-full sm:w-auto whitespace-nowrap h-10 px-4 flex justify-center items-center text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors shadow-sm"
          >
            Export PDF
          </button>
          <button
            onClick={() => console.log("Share report clicked")}
            className="w-full sm:w-auto whitespace-nowrap h-10 px-4 flex justify-center items-center text-sm border border-green-500 dark:border-green-500 rounded-md bg-green-50 dark:bg-[#1a1a1a] text-green-700 dark:text-green-400 font-medium cursor-pointer hover:bg-green-100 dark:hover:bg-[#2a2a2a] transition-colors shadow-sm"
          >
            Share report
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap lg:flex-nowrap items-stretch gap-3 w-full">
        {/* Village Filter */}
        <select
          value={village}
          onChange={(e) => handleChange({ village: e.target.value })}
          className={`sm:flex-1 min-w-[130px] ${village !== "all" ? activeSelect : baseSelect}`}
        >
          <option className="text-gray-700 bg-white dark:bg-[#1a1a1a] dark:text-gray-200" value="all">All Villages</option>
          {VILLAGES.map((v) => (
            <option className="text-gray-700 bg-white dark:bg-[#1a1a1a] dark:text-gray-200" key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        {/* Crop Filter */}
        <select
          value={crop}
          onChange={(e) => handleChange({ crop: e.target.value })}
          className={`sm:flex-1 min-w-[130px] ${crop !== "all" ? activeSelect : baseSelect}`}
        >
          <option className="text-gray-700 bg-white dark:bg-[#1a1a1a] dark:text-gray-200" value="all">All Crops</option>
          {CROPS.map((c) => (
            <option className="text-gray-700 bg-white dark:bg-[#1a1a1a] dark:text-gray-200" key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Season Filter */}
        <select
          value={season}
          onChange={(e) => handleChange({ season: e.target.value })}
          className={`sm:flex-1 min-w-[130px] ${season !== "all" ? activeSelect : baseSelect}`}
        >
          <option className="text-gray-700 bg-white dark:bg-[#1a1a1a] dark:text-gray-200" value="all">All Seasons</option>
          {SEASONS.map((s) => (
            <option className="text-gray-700 bg-white dark:bg-[#1a1a1a] dark:text-gray-200" key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Date Range Filter (label hidden, inline calendar button with flexible scaling) */}
        <div className="w-full lg:w-auto lg:flex-none [&_label]:hidden [&_#date-toggle]:!w-full [&_#date-toggle]:!whitespace-nowrap [&_#date-toggle_span]:!whitespace-nowrap [&_#date-toggle]:!h-10">
          <DateRangeFilter
            customName=""
            advanceFilter={{ startTime, endTime }}
            handleDialogChange={handleDateChange}
            className={
              startTime
                ? "!h-10 !text-sm !w-full !border-green-500 dark:!border-green-500 !bg-green-50 dark:!bg-[#1a1a1a] !text-green-700 dark:!text-green-400 !font-medium hover:!bg-green-100 dark:hover:!bg-[#2a2a2a]"
                : "!h-10 !text-sm !w-full !border-gray-200 dark:!border-gray-700 !bg-white dark:!bg-[#1a1a1a] !text-gray-700 dark:!text-gray-200 !font-normal hover:!bg-gray-50 dark:hover:!bg-[#2a2a2a]"
            }
          />
        </div>
      </div>
    </div>
  );
}
