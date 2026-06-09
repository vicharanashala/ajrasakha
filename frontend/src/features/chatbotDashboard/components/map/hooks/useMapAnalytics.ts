/* ============================================================
   USE MAP ANALYTICS - Hook for computing map analytics data
============================================================ */

import { useMemo } from "react";
import type { Analytics, LevelKey } from "../lib/types";
import { mockAnalytics, mockDistrictDetails } from "../lib/mockData";

interface UseMapAnalyticsProps {
  statesGeo: unknown;
  districtsAll: unknown;
  level: LevelKey;
  selectedState: string | null;
  selectedDistrict: string | null;
}

export function useMapAnalytics({
  statesGeo,
  districtsAll,
  level,
  selectedState,
  selectedDistrict,
}: UseMapAnalyticsProps) {
  // Attach analytics to states
  const statesWithData = useMemo(() => {
    if (!statesGeo) return null;
    const geo = statesGeo as {
      type?: string;
      features: Array<{ type?: string; geometry?: unknown; properties: Record<string, unknown> }>;
    };
    return {
      type: geo.type ?? "FeatureCollection",
      features: geo.features.map((f) => ({
        type: f.type ?? "Feature",
        geometry: f.geometry,
        properties: {
          ...f.properties,
          _name: f.properties.NAME_1 as string,
          _analytics: mockAnalytics(`state:${f.properties.NAME_1}`),
        },
      })),
    };
  }, [statesGeo]);

  // Filter districts by selected state
  const districtsOfState = useMemo(() => {
    if (!districtsAll || !selectedState) return null;
    const geo = districtsAll as {
      type?: string;
      features: Array<{ type?: string; geometry?: unknown; properties: Record<string, unknown> }>;
    };
    const features = geo.features
      .filter((f) => f.properties.NAME_1 === selectedState)
      .map((f) => ({
        type: f.type ?? "Feature",
        geometry: f.geometry,
        properties: {
          ...f.properties,
          _name: f.properties.NAME_2 as string,
          _parent: f.properties.NAME_1 as string,
          _analytics: mockAnalytics(
            `dist:${f.properties.NAME_1}:${f.properties.NAME_2}`,
          ),
        },
      }));
    return { type: "FeatureCollection", features };
  }, [districtsAll, selectedState]);

  // Active geo to render
  const activeGeo =
    level === "india"
      ? statesWithData
      : level === "state"
        ? districtsOfState
        : districtsOfState;

  // District details
  const districtDetails = useMemo(
    () => (selectedDistrict ? mockDistrictDetails(selectedDistrict) : null),
    [selectedDistrict],
  );

  // Min/max for color ramp
  const [minV, maxV] = useMemo(() => {
    if (!activeGeo) return [0, 1];
    const geo = activeGeo as { features: Array<{ properties: { _analytics: Analytics } }> };
    const arr = geo.features.map((f) => f.properties._analytics.questions);
    return [Math.min(...arr), Math.max(...arr)];
  }, [activeGeo]);

  // Compute active analytics
  const activeAnalytics = useMemo(() => {
    if (!statesWithData) return null;

    // District level
    if (selectedDistrict && districtsOfState) {
      const district = districtsOfState.features.find(
        (f) => f.properties._name === selectedDistrict,
      );
      return district?.properties._analytics ?? null;
    }

    // State level
    if (selectedState) {
      const state = statesWithData.features.find(
        (f) => f.properties._name === selectedState,
      );
      return state?.properties._analytics ?? null;
    }

    // Country level (aggregate all)
    return statesWithData.features.reduce(
      (acc, f) => {
        const x = f.properties._analytics;
        return {
          questions: acc.questions + x.questions,
          answers: acc.answers + x.answers,
          users: acc.users + x.users,
          activeUsers: acc.activeUsers + x.activeUsers,
          coordinators: acc.coordinators + x.coordinators,
          closureHrs: acc.closureHrs + x.closureHrs,
        };
      },
      {
        questions: 0,
        answers: 0,
        users: 0,
        activeUsers: 0,
        coordinators: 0,
        closureHrs: 0,
      },
    );
  }, [statesWithData, districtsOfState, selectedState, selectedDistrict]);

  return {
    statesWithData,
    districtsOfState,
    districtDetails,
    activeGeo,
    minV,
    maxV,
    activeAnalytics,
  };
}