/* ============================================================
   USE GEO JSON - Hook for fetching and caching GeoJSON data
============================================================ */

import { useEffect, useState } from "react";
import { fetchStates, fetchDistricts } from "../lib/geoJson";

interface UseGeoJsonResult {
  statesGeo: unknown;
  districtsAll: unknown;
  loading: boolean;
  error: Error | null;
}

export function useGeoJson(): UseGeoJsonResult {
  const [statesGeo, setStatesGeo] = useState<unknown>(null);
  const [districtsAll, setDistrictsAll] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        const [states, districts] = await Promise.all([
          fetchStates(),
          fetchDistricts(),
        ]);

        if (mounted) {
          setStatesGeo(states);
          setDistrictsAll(districts);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Failed to load map data"));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  return { statesGeo, districtsAll, loading, error };
}