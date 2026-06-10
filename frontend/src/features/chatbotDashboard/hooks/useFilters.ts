import { useState, useCallback, useEffect } from "react";
import type { DashboardFilterValues } from "../DashboardFilters";
import { DEFAULT_FILTERS } from "../utils/constants";
import type { SourceType } from "../types/index";

/**
 * Hook for managing dashboard filter state
 */
export function useFilters(initialFilters: DashboardFilterValues = DEFAULT_FILTERS) {
  const [filters, setFilters] = useState<DashboardFilterValues>(initialFilters);

  const updateFilters = useCallback((updates: Partial<DashboardFilterValues>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return {
    filters,
    setFilters,
    updateFilters,
    resetFilters,
  };
}

/**
 * Hook for handling filter reset when source changes
 */
export function useFiltersSourceReset(source: SourceType) {
  const [filters, setFilters] = useState<DashboardFilterValues>(DEFAULT_FILTERS);

  useEffect(() => {
    if (source === "whatsapp") {
      setFilters((prev) => ({
        ...prev,
        userType: "all",
      }));
    }
  }, [source]);

  return { filters, setFilters };
}

/**
 * Hook for managing user type filter
 */
export function useUserTypeFilter(
  filters: DashboardFilterValues,
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilterValues>>,
  source: SourceType
) {
  const handleUserTypeChange = useCallback(
    (value: string) => {
      setFilters((prev) => ({
        ...prev,
        userType: value.toLowerCase() as DashboardFilterValues["userType"],
      }));
    },
    [setFilters]
  );

  const getUserTypeLabel = useCallback(() => {
    return filters.userType === "all"
      ? "All Users"
      : filters.userType.charAt(0).toUpperCase() + filters.userType.slice(1);
  }, [filters.userType]);

  const shouldShowUserTypeFilter = source !== "whatsapp";

  return {
    handleUserTypeChange,
    getUserTypeLabel,
    shouldShowUserTypeFilter,
    userType: filters.userType,
  };
}