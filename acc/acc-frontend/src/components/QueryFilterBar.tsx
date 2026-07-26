import React, { useState } from 'react';
import {
  Filter,
  Download,
  X,
  Search,
  Calendar,
  Tag,
  MapPin,
  Sprout,
  Sun,
  Loader2,
  Phone
} from 'lucide-react';
import { Button } from './atoms/button';
import { plivoApi } from '@/hooks/api/plivo/api';
import { toast } from 'sonner';

export interface QueryFilterValues {
  domain: string;
  state: string;
  district: string;
  crop: string;
  season: string;
  startDate: string;
  endDate: string;
  search: string;
}

interface QueryFilterBarProps {
  filters: QueryFilterValues;
  onFilterChange: (newFilters: Partial<QueryFilterValues>) => void;
  onResetFilters: () => void;
  pageSize: number;
  onPageSizeChange: (newSize: number) => void;
  totalCount?: number;
}

const DOMAIN_OPTIONS = [
  'All',
  'Soil Health and Nutrient Management',
  'Irrigation and Water Management',
  'Insect - Pest Management',
  'Disease Management',
  'Seed and Variety Selection',
  'Cultural and Crop Management Practices',
  'Organic and Natural Farming',
  'Weed Management',
  'Climate, Weather & Stress Management',
  'Farm Tools & Mechanisation',
  'Post-Harvest Management & Storage',
  'Market Prices, MSP & Marketing',
  'Agricultural Schemes & Subsidies',
  'Credit, Loan & Insurance',
  'Capacity Building & Extension',
  'Rural Infrastructure',
  'Animal Husbandry & Livestock',
  'Fisheries & Aquaculture',
  'Horticulture & Landscaping',
  'Allied Agricultural Activities',
  'Others',
  'NA / Invalid Data'
];

const SEASON_OPTIONS = ['All', 'Rabi', 'Kharif', 'Zaid', 'Year-round'];

const INDIAN_STATES = [
  'All',
  'Andhra Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
];

export const QueryFilterBar: React.FC<QueryFilterBarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  pageSize,
  onPageSizeChange,
  totalCount
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      toast.info('Generating CSV export for active filters...');

      await plivoApi.downloadQueries({
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        search: filters.search || undefined,
        domain: filters.domain !== 'All' ? filters.domain : undefined,
        state: filters.state !== 'All' ? filters.state : undefined,
        district: filters.district || undefined,
        crop: filters.crop || undefined,
        season: filters.season !== 'All' ? filters.season : undefined
      });

      toast.success('CSV Downloaded successfully!');
    } catch (err: any) {
      console.error('Failed to download CSV:', err);
      toast.error(err.message || 'Failed to download CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const hasActiveFilters = Boolean(
    (filters.domain && filters.domain !== 'All') ||
    (filters.state && filters.state !== 'All') ||
    (filters.season && filters.season !== 'All') ||
    filters.district ||
    filters.crop ||
    filters.startDate ||
    filters.endDate ||
    filters.search
  );

  return (
    <div className="w-full space-y-4">
      {/* Header Row: Title & Subtitle on Left, Controls on Right */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2.5 text-foreground">
            <Phone className="h-5 w-5 text-indigo-500" />
            Agricultural Queries List
            {totalCount !== undefined && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-mono font-medium">
                {totalCount} Total
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            List of all queries asked with domain metadata, crops, and specialist responses
          </p>
        </div>

        {/* Action Controls Group on Right */}
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="text-xs h-8 border-input hover:bg-accent hover:text-accent-foreground"
          >
            <Filter className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
            {isOpen ? 'Hide Filters' : 'Filters'}
          </Button>

          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResetFilters}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 text-xs h-8 px-2.5"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Reset
            </Button>
          )}

          <Button
            onClick={handleExportCSV}
            disabled={isExporting}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow border border-indigo-400/30 text-xs h-8 px-3"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export CSV
              </>
            )}
          </Button>

          {/* Page Size Select */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 text-xs border border-input rounded-md bg-background text-foreground h-8 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Full-width Collapsible Filter Grid */}
      {isOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-3 border-t border-border/60 animate-in fade-in slide-in-from-top-1 duration-200 w-full">
          {/* Search Input */}
          <div className="space-y-1">
            <label className="text-foreground font-medium flex items-center gap-1.5 text-[11px]">
              <Search className="w-3.5 h-3.5 text-indigo-500" />
              Search Text
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Question or Answer text..."
                value={filters.search}
                onChange={(e) => onFilterChange({ search: e.target.value })}
                className="w-full bg-background border border-input rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
              />
              {filters.search && (
                <button
                  onClick={() => onFilterChange({ search: '' })}
                  className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Domain Filter */}
          <div className="space-y-1">
            <label className="text-foreground font-medium flex items-center gap-1.5 text-[11px]">
              <Tag className="w-3.5 h-3.5 text-indigo-500" />
              Domain
            </label>
            <select
              value={filters.domain}
              onChange={(e) => onFilterChange({ domain: e.target.value })}
              className="w-full bg-background border border-input rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
            >
              {DOMAIN_OPTIONS.map((domain) => (
                <option key={domain} value={domain} className="bg-popover text-popover-foreground">
                  {domain}
                </option>
              ))}
            </select>
          </div>

          {/* State Filter */}
          <div className="space-y-1">
            <label className="text-foreground font-medium flex items-center gap-1.5 text-[11px]">
              <MapPin className="w-3.5 h-3.5 text-indigo-500" />
              State
            </label>
            <select
              value={filters.state}
              onChange={(e) => onFilterChange({ state: e.target.value })}
              className="w-full bg-background border border-input rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
            >
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st} className="bg-popover text-popover-foreground">
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* District Filter */}
          <div className="space-y-1">
            <label className="text-foreground font-medium flex items-center gap-1.5 text-[11px]">
              <MapPin className="w-3.5 h-3.5 text-indigo-500" />
              District
            </label>
            <input
              type="text"
              placeholder="Filter district..."
              value={filters.district}
              onChange={(e) => onFilterChange({ district: e.target.value })}
              className="w-full bg-background border border-input rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
            />
          </div>

          {/* Crop Filter */}
          <div className="space-y-1">
            <label className="text-foreground font-medium flex items-center gap-1.5 text-[11px]">
              <Sprout className="w-3.5 h-3.5 text-emerald-500" />
              Crop
            </label>
            <input
              type="text"
              placeholder="e.g. Wheat, Rice, Cotton..."
              value={filters.crop}
              onChange={(e) => onFilterChange({ crop: e.target.value })}
              className="w-full bg-background border border-input rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
            />
          </div>

          {/* Season Filter */}
          <div className="space-y-1">
            <label className="text-foreground font-medium flex items-center gap-1.5 text-[11px]">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              Season
            </label>
            <select
              value={filters.season}
              onChange={(e) => onFilterChange({ season: e.target.value })}
              className="w-full bg-background border border-input rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
            >
              {SEASON_OPTIONS.map((sn) => (
                <option key={sn} value={sn} className="bg-popover text-popover-foreground">
                  {sn}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="space-y-1">
            <label className="text-foreground font-medium flex items-center gap-1.5 text-[11px]">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              From Date
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => onFilterChange({ startDate: e.target.value })}
              className="w-full bg-background border border-input rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1">
            <label className="text-foreground font-medium flex items-center gap-1.5 text-[11px]">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              To Date
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => onFilterChange({ endDate: e.target.value })}
              className="w-full bg-background border border-input rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
};
