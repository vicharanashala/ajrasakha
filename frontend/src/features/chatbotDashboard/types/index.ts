// Re-export all types from the main types file
export * from "../types";

// Re-export DashboardFilterValues from DashboardFilters
export type { DashboardFilterValues } from "../DashboardFilters";

// Additional dashboard-specific types - align with DashboardSidebar.tsx
export type DashboardView = 
  | "overview" 
  | "responsetable" 
  | "usage-patterns" 
  | "bugs-ux" 
  | "demographics" 
  | "farmer-segments" 
  | "query-analysis" 
  | "feedback-sentiment" 
  | "geo-intelligence" 
  | "app-health" 
  | "user-details" 
  | "verify-users"
  | "export-data";

export type SourceType = "annam" | "whatsapp";

export interface DateRangeFilter {
  dateRange?: DateRange;
  onDateRangeChange: (range?: DateRange) => void;
}

export interface DateRange {
  from?: Date;
  to?: Date;
}