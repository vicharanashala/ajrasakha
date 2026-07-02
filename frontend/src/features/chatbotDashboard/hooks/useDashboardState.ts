// ─── Dashboard State Management Hook ─────────────────────────────────────────
import { useState, useCallback } from "react";
import type { DashboardFilterValues } from "../DashboardFilters";
import type { Segment } from "../types";
import type { DashboardView } from "../DashboardSidebar";
import { getTodayStart } from "../utils/dateUtils";

interface InactiveUsersFilters {
  lowFeedbackOnly: boolean;
  inactiveOnly: boolean;
  search: string;
  crop: string;
  village: string;
  profileCompleted: string;
  startTime?: Date;
  endTime?: Date;
}

interface UserDetailsFilters {
  lowFeedbackOnly: boolean;
  inactiveOnly: boolean;
  search: string;
  crop: string;
  village: string;
  profileCompleted: string;
  startTime?: Date;
  endTime?: Date;
}

export interface DashboardStateReturn {
  // Core state
  source: "annam" | "whatsapp";
  setSource: (source: "annam" | "whatsapp") => void;
  
  // Active segment
  activeSegment: Segment | null;
  setActiveSegment: (segment: Segment | null) => void;
  
  // Filters
  filters: DashboardFilterValues;
  setFilters: (filters: DashboardFilterValues) => void;
  updateFilters: (updates: Partial<DashboardFilterValues>) => void;
  
  // Active view
  activeView: DashboardView;
  setActiveView: (view: DashboardView) => void;
  
  // User details initial filters
  userDetailsInitialFilters: Partial<UserDetailsFilters> | undefined;
  setUserDetailsInitialFilters: (filters: Partial<InactiveUsersFilters>) => void;
  
  // Source change handler
  handleSourceChange: (newSource: "annam" | "whatsapp") => void;
  
  // Low feedback users handler
  handleLowFeedbackUsersClick: () => void;
  
  // Inactive users handler
  handleInactiveUsersClick: () => void;
}

export function useDashboardState(): DashboardStateReturn {
  const [source, setSource] = useState<"annam" | "whatsapp">("annam");
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [filters, setFilters] = useState<DashboardFilterValues>({
    village: "all",
    crop: "all",
    season: "all",
    startTime: undefined,
    endTime: undefined,
    userType: "all",
  });
  const [userDetailsInitialFilters, setUserDetailsInitialFilters] = useState<
    Partial<UserDetailsFilters> | undefined
  >(undefined);

  const updateFilters = useCallback((updates: Partial<DashboardFilterValues>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleSourceChange = useCallback((newSource: "annam" | "whatsapp") => {
    setSource(newSource);
    if (newSource === "whatsapp") {
      setFilters((prev) => ({ ...prev, userType: "all" }));
    }
  }, []);

  const handleLowFeedbackUsersClick = useCallback(() => {
    setUserDetailsInitialFilters({
      lowFeedbackOnly: true,
      inactiveOnly: false,
      search: "",
      crop: "",
      village: "",
      profileCompleted: "all",
    });
    setActiveView("user-details");
  }, []);

  const handleInactiveUsersClick = useCallback(() => {
    const threeDaysAgo = getTodayStart();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const today = getTodayStart();
    setUserDetailsInitialFilters({
      inactiveOnly: true,
      startTime: threeDaysAgo,
      endTime: today,
      search: "",
      crop: "",
      village: "",
      profileCompleted: "all",
    });
    setActiveView("user-details");
  }, []);

  return {
    source,
    setSource,
    activeSegment,
    setActiveSegment,
    filters,
    setFilters,
    updateFilters,
    activeView,
    setActiveView,
    userDetailsInitialFilters,
    setUserDetailsInitialFilters,
    handleSourceChange,
    handleLowFeedbackUsersClick,
    handleInactiveUsersClick,
  };
}

export default useDashboardState;