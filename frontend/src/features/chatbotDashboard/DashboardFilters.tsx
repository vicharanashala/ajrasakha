import { CROPS, SEASONS, VILLAGES } from "@/components/MetaData";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { SearchableSelect } from "@/components/atoms/SearchableSelect";
import { Button } from "@/components/atoms/button";
import { Download, RefreshCcw, Share2 } from "lucide-react";


// ─── TYPES ───────────────────────────────────────────────────────────────────
export interface DashboardFilterValues {
  village: string;
  crop: string;
  season: string;
  startTime?: Date;
  endTime?: Date;
  userType: 'all' | 'external' | 'internal';
}

interface DashboardFiltersProps {
  filters: DashboardFilterValues;
  onFilterChange: (filters: DashboardFilterValues) => void;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export function DashboardFilters({ filters, onFilterChange }: DashboardFiltersProps) {
  const { village, crop, season, startTime, endTime, userType } = filters;

  const handleChange = (overrides: Partial<DashboardFilterValues>) => {
    onFilterChange({ ...filters, ...overrides });
  };

  const handleDateChange = (key: string, value: any) => {
    handleChange({ [key]: value });
  };

  const handleResetFilters = () => {
    onFilterChange({
      village: "all",
      crop: "all",
      season: "all",
      startTime: undefined,
      endTime: undefined,
      userType: "all",
    });
  };

  const isDefault =
    village === "all" &&
    crop === "all" &&
    season === "all" &&
    !startTime &&
    !endTime &&
    userType === "all";

  const baseSelect =
    "text-sm h-10 px-3 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200 cursor-pointer outline-none w-full lg:min-w-[150px] lg:w-auto shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-[#2a2a2a]";

  const activeSelect =
    "text-sm h-10 px-3 border border-green-500 dark:border-green-500 rounded-md bg-green-50 dark:bg-[#1a1a1a] text-green-700 dark:text-green-400 font-medium cursor-pointer outline-none w-full lg:min-w-[150px] lg:w-auto shadow-sm transition-all hover:bg-green-100 dark:hover:bg-[#2a2a2a]";

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
          <h1 className="text-[#1a1a1a] dark:text-white text-base font-medium m-0">
            National overview
          </h1>
          <p className="text-[#888] dark:text-gray-400 text-[12px] mt-1 m-0">
            {getSubtitle()}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <Button
            onClick={handleResetFilters}
            disabled={isDefault}
            className="w-full sm:w-auto whitespace-nowrap h-10 px-4 flex justify-center items-center text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button
            onClick={() => console.log("Export PDF clicked")}
            className="w-full sm:w-auto whitespace-nowrap h-10 px-4 flex justify-center items-center text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors shadow-sm"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
          <Button
            onClick={() => console.log("Share report clicked")}
            className="w-full sm:w-auto whitespace-nowrap h-10 px-4 flex justify-center items-center text-sm border border-green-500 dark:border-green-500 rounded-md bg-green-50 dark:bg-[#1a1a1a] text-green-700 dark:text-green-400 font-medium cursor-pointer hover:bg-green-100 dark:hover:bg-[#2a2a2a] transition-colors shadow-sm"
          >
            <Share2 className="h-4 w-4" />
            Share report
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap lg:flex-nowrap items-stretch gap-3 w-full">
        {/* Village Filter */}
        <SearchableSelect
          options={VILLAGES}
          value={village}
          onChange={(v) => handleChange({ village: v })}
          placeholder="All Villages"
          className={baseSelect}
          activeClassName={activeSelect}
        />

        {/* Crop Filter */}
        <SearchableSelect
          options={CROPS}
          value={crop}
          onChange={(c) => handleChange({ crop: c })}
          placeholder="All Crops"
          className={baseSelect}
          activeClassName={activeSelect}
        />

        {/* Season Filter */}
        <SearchableSelect
          options={SEASONS}
          value={season}
          onChange={(s) => handleChange({ season: s })}
          placeholder="All Seasons"
          className={baseSelect}
          activeClassName={activeSelect}
        />

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

        {/* User Type Filter */}
        <div className="flex h-10 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm w-full lg:w-auto">
          {(['all', 'external', 'internal'] as const).map((type) => (
            <button
              key={type}
              onClick={() => handleChange({ userType: type })}
              className={
                userType === type
                  ? "flex-1 px-3 text-sm font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-500 dark:border-green-500 cursor-pointer transition-colors capitalize"
                  : "flex-1 px-3 text-sm bg-white dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors capitalize border-r last:border-r-0 border-gray-200 dark:border-gray-700"
              }
            >
              {type === 'all' ? 'All' : type === 'external' ? 'External' : 'Internal'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
