/* ============================================================
   USE MAP SEARCH - Hook for search functionality
============================================================ */

import { useState, useCallback } from "react";
import type { SearchHit } from "../lib/types";
import { mockDistrictDetails } from "../lib/mockData";

interface UseMapSearchProps {
  statesWithData: {
    type: string;
    features: Array<{
      type: string;
      properties: Record<string, unknown>;
    }>;
  } | null;
  districtsAll: unknown;
  selectedState: string | null;
  onNavigateToState: (name: string) => void;
  onNavigateToDistrict: (name: string) => void;
  onFlyTo: (feature: unknown) => void;
}

export function useMapSearch({
  statesWithData,
  districtsAll,
  selectedState,
  onNavigateToState,
  onNavigateToDistrict,
  onFlyTo,
}: UseMapSearchProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  const search = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);
      const q = searchQuery.trim().toLowerCase();
      if (q.length < 2 || !statesWithData) {
        setHits([]);
        return;
      }

      const searchHits: SearchHit[] = [];
      const statesWithFeatures = statesWithData as unknown as {
        features: Array<{
          type: string;
          properties: { NAME_1?: string; NAME_2?: string; _name: string };
        }>;
      };
      const districtsWithFeatures = districtsAll as unknown as {
        features: Array<{
          type: string;
          properties: { NAME_1?: string; NAME_2?: string };
        }>;
      };

      // Search states
      statesWithFeatures.features.forEach((f) => {
        if (
          String(f.properties._name).toLowerCase().includes(q) &&
          searchHits.length < 30
        ) {
          searchHits.push({
            type: "state",
            label: f.properties._name as string,
            sub: "State",
            onSelect: () => {
              onNavigateToState(f.properties._name as string);
              onFlyTo(f);
              setQuery("");
              setHits([]);
            },
          });
        }
      });

      // Search districts
      if (districtsWithFeatures) {
        districtsWithFeatures.features.forEach((f) => {
          if (
            f.properties.NAME_2?.toLowerCase().includes(q) &&
            searchHits.length < 60
          ) {
            searchHits.push({
              type: "district",
              label: f.properties.NAME_2 as string,
              sub: `District · ${f.properties.NAME_1}`,
              onSelect: () => {
                onNavigateToState(f.properties.NAME_1 as string);
                onNavigateToDistrict(f.properties.NAME_2 as string);
                onFlyTo(f);
                setQuery("");
                setHits([]);
              },
            });
          }
        });

        // Search villages/blocks/kvk
        if (selectedState) {
          const stateDistricts = districtsWithFeatures.features.filter(
            (f) => f.properties.NAME_1 === selectedState,
          );

          for (const d of stateDistricts) {
            const dn = d.properties.NAME_2!;
            const det = mockDistrictDetails(dn);

            det.villages.forEach((v) => {
              if (searchHits.length >= 80) return;
              if (v.name.toLowerCase().includes(q)) {
                searchHits.push({
                  type: "village",
                  label: v.name,
                  sub: `Village · ${dn}`,
                  onSelect: () => {
                    onNavigateToDistrict(dn);
                    onFlyTo(d);
                    setQuery("");
                    setHits([]);
                  },
                });
              }
            });

            det.blocks.forEach((bl) => {
              if (searchHits.length >= 100) return;
              if (bl.toLowerCase().includes(q)) {
                searchHits.push({
                  type: "block",
                  label: bl,
                  sub: `Block · ${dn}`,
                  onSelect: () => {
                    onNavigateToDistrict(dn);
                    onFlyTo(d);
                    setQuery("");
                    setHits([]);
                  },
                });
              }
            });

            if (det.kvk.toLowerCase().includes(q) && searchHits.length < 110) {
              searchHits.push({
                type: "kvk",
                label: det.kvk,
                sub: `KVK · ${dn}`,
                onSelect: () => {
                  onNavigateToDistrict(dn);
                  onFlyTo(d);
                  setQuery("");
                  setHits([]);
                },
              });
            }
          }
        }
      }

      setHits(searchHits.slice(0, 12));
    },
    [
      statesWithData,
      districtsAll,
      selectedState,
      onNavigateToState,
      onNavigateToDistrict,
      onFlyTo,
    ],
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setHits([]);
  }, []);

  return {
    query,
    hits,
    search,
    clearSearch,
  };
}