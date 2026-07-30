import { useState, useEffect, useMemo } from "react";
import type { GapCluster, GapKpis } from "../types";
import { mockClusters, mockKpis } from "../data/mockData";

// Simulates Supabase fetch. Replace with real TanStack Query + Supabase
// when the database is connected:
//
//   import { useQuery } from "@tanstack/react-query";
//   import { supabase } from "../lib/supabase";
//
//   export function useGapKpis() {
//     return useQuery({
//       queryKey: ["gap_kpis"],
//       queryFn: async () => {
//         const { data, error } = await supabase.from("gap_kpis").select("*").single();
//         if (error) throw error;
//         return data as GapKpis;
//       },
//       staleTime: 60_000,
//     });
//   }

interface UseGapDataReturn {
  kpis: GapKpis | null;
  clusters: GapCluster[];
  isLoading: boolean;
  error: Error | null;
}

export function useGapData(): UseGapDataReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [kpis] = useState<GapKpis>(mockKpis);
  const [clusters] = useState<GapCluster[]>(mockClusters);

  useEffect(() => {
    // Simulate network fetch
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  return {
    kpis: isLoading ? null : kpis,
    clusters: isLoading ? [] : clusters,
    isLoading,
    error: null,
  };
}

export const DIAGNOSIS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  missing_knowledge: {
    label: "Missing Knowledge",
    color: "var(--color-dx-missing-knowledge)",
    bg: "oklch(0.577 0.22 27 / 0.12)",
    border: "oklch(0.577 0.22 27 / 0.3)",
  },
  retrieval_failure: {
    label: "Retrieval Failure",
    color: "var(--color-dx-retrieval-failure)",
    bg: "oklch(0.65 0.16 85 / 0.12)",
    border: "oklch(0.65 0.16 85 / 0.3)",
  },
  language_alias_gap: {
    label: "Language / Alias Gap",
    color: "var(--color-dx-language-alias)",
    bg: "oklch(0.55 0.18 148 / 0.12)",
    border: "oklch(0.55 0.18 148 / 0.3)",
  },
  missing_context: {
    label: "Missing Context",
    color: "var(--color-dx-missing-context)",
    bg: "oklch(0.55 0.20 258 / 0.12)",
    border: "oklch(0.55 0.20 258 / 0.3)",
  },
  safety_escalation: {
    label: "Safety Escalation",
    color: "var(--color-dx-safety-escalation)",
    bg: "oklch(0.50 0.18 305 / 0.12)",
    border: "oklch(0.50 0.18 305 / 0.3)",
  },
};

export function useClusterDetail(clusterId: string | null) {
  const { clusters } = useGapData();
  return useMemo(
    () => clusters.find((c) => c.id === clusterId) ?? null,
    [clusters, clusterId]
  );
}
