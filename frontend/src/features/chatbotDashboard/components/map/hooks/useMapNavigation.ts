/* ============================================================
   USE MAP NAVIGATION - Hook for managing map navigation state
============================================================ */

import { useState, useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { LevelKey, Crumb } from "../lib/types";

interface UseMapNavigationResult {
  // State
  level: LevelKey;
  selectedState: string | null;
  selectedDistrict: string | null;
  hovered: string | null;

  // Actions
  setSelectedState: (name: string | null) => void;
  setSelectedDistrict: (name: string | null) => void;
  setHovered: Dispatch<SetStateAction<string | null>>;
  goToIndia: () => void;
  goToState: () => void;
  goCrumb: (idx: number) => void;
  navigateToState: (name: string) => void;
  navigateToDistrict: (name: string) => void;

  // Computed
  crumbs: Crumb[];
  isAtIndiaLevel: boolean;
  isAtStateLevel: boolean;
  isAtDistrictLevel: boolean;
}

export function useMapNavigation(): UseMapNavigationResult {
  const [level, setLevel] = useState<LevelKey>("india");
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // Navigation actions
  const goToIndia = useCallback(() => {
    setLevel("india");
    setSelectedState(null);
    setSelectedDistrict(null);
  }, []);

  const goToState = useCallback(() => {
    setLevel("state");
    setSelectedDistrict(null);
  }, []);

  const goCrumb = useCallback(
    (idx: number) => {
      if (idx === 0) {
        goToIndia();
      } else if (idx === 1) {
        goToState();
      }
    },
    [goToIndia, goToState],
  );

  const navigateToState = useCallback(
    (name: string) => {
      setSelectedState(name);
      setLevel("state");
      setSelectedDistrict(null);
    },
    [],
  );

  const navigateToDistrict = useCallback((name: string) => {
    setSelectedDistrict(name);
  }, []);

  // Computed values
  const crumbs: Crumb[] = useMemo(() => {
    const c: Crumb[] = [{ level: "india", name: "India" }];
    if (selectedState) {
      c.push({ level: "state", name: selectedState, stateName: selectedState });
    }
    if (selectedDistrict) {
      c.push({
        level: "district",
        name: selectedDistrict,
        stateName: selectedState ?? undefined,
      });
    }
    return c;
  }, [selectedState, selectedDistrict]);

  const isAtIndiaLevel = level === "india";
  const isAtStateLevel = level === "state" && !selectedDistrict;
  const isAtDistrictLevel = selectedDistrict !== null;

  return {
    level,
    selectedState,
    selectedDistrict,
    hovered,
    setSelectedState,
    setSelectedDistrict,
    setHovered,
    goToIndia,
    goToState,
    goCrumb,
    navigateToState,
    navigateToDistrict,
    crumbs,
    isAtIndiaLevel,
    isAtStateLevel,
    isAtDistrictLevel,
  };
}