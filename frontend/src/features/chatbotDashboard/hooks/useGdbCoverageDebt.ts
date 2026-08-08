// ─── useGdbCoverageDebt Hook ─────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";

export interface GapCluster {
  clusterId: string;
  crop: string;
  state: string;
  domain: string;
  affectedFarmersCount: number;
  rawQuestionsCount: number;
  weekGrowthPercent: number;
  coverageDebtScore: number;
  diagnosis:
    | "missing_knowledge"
    | "retrieval_failure"
    | "language_alias_gap"
    | "missing_context"
    | "safety_escalation";
  diagnosisLabel: string;
  recommendedAction: string;
  fourWeekTrend: number[];
  representativeQuestions: string[];
  trendState?: "new" | "growing" | "shrinking" | "resolved";
}

export interface GdbCoverageDebtResponse {
  week: string | null;
  totalDisclaimers: number;
  activeClustersCount: number;
  weekOverWeekGrowth: number;
  coverageDebtScore: number;
  disclaimerDeflectionImpact: number;
  topGapCluster: GapCluster | null;
  clusters: GapCluster[];
}

const EMPTY_RESPONSE: GdbCoverageDebtResponse = {
  week: null,
  totalDisclaimers: 0,
  activeClustersCount: 0,
  weekOverWeekGrowth: 0,
  coverageDebtScore: 0,
  disclaimerDeflectionImpact: 0,
  topGapCluster: null,
  clusters: [],
};

export interface UseGdbCoverageDebtOptions {
  crop?: string;
  state?: string;
  enabled?: boolean;
}

export function useGdbCoverageDebt({
  crop,
  state,
  enabled = true,
}: UseGdbCoverageDebtOptions = {}) {
  return useQuery<GdbCoverageDebtResponse>({
    queryKey: ["gdb-coverage-debt", crop, state],
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min
    queryFn: async () => {
      const params = new URLSearchParams();
      if (crop) params.set("crop", crop);
      if (state) params.set("state", state);
      const qs = params.toString();
      const url = `${env.apiBaseUrl()}/analytics/gdb-coverage-debt${qs ? `?${qs}` : ""}`;
      return (await apiFetch<GdbCoverageDebtResponse>(url)) ?? EMPTY_RESPONSE;
    },
  });
}

export function usePushToReviewerQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      clusterId: string;
      crop: string;
      state: string;
      domain: string;
      representativeQuestion: string;
    }) => {
      const url = `${env.apiBaseUrl()}/analytics/gdb-coverage-debt/push-to-reviewer`;
      return await apiFetch<{
        success: boolean;
        questionId: string;
        message: string;
        isDuplicate?: boolean;
      }>(url, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gdb-coverage-debt"] });
    },
  });
}
