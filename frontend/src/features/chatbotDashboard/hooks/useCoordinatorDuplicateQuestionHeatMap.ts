import { env } from "@/config/env";
import { apiFetch } from "@/hooks/api/api-fetch";
import { useQuery } from "@tanstack/react-query";

export interface CoordinatorDuplicateQuestionDetail {
  question: string;
  repeatCount: number;
  userId: string;
  userName?: string;
  email?: string;
  block?: string;
  village?: string;
  firstAskedAt?: string;
  lastAskedAt?: string;
  questionIds: string[];
}

export interface CoordinatorDuplicateQuestionVillage {
  village: string;
  count: number;
  details: CoordinatorDuplicateQuestionDetail[];
}

export interface CoordinatorDuplicateQuestionBlock {
  block: string;
  count: number;
  villages: CoordinatorDuplicateQuestionVillage[];
}

export interface CoordinatorDuplicateQuestionHeatMapResponse {
  coordinatorId: string;
  coordinatorRole: string;
  scope: "district" | "block" | "village";
  state?: string;
  district?: string;
  block?: string;
  totalDuplicateQuestions: number;
  blocks: CoordinatorDuplicateQuestionBlock[];
}

const EMPTY_RESPONSE: CoordinatorDuplicateQuestionHeatMapResponse = {
  coordinatorId: "",
  coordinatorRole: "",
  scope: "district",
  totalDuplicateQuestions: 0,
  blocks: [],
};

export function useCoordinatorDuplicateQuestionHeatMap(
  coordinatorId: string,
  enabled = true,
) {
  return useQuery<CoordinatorDuplicateQuestionHeatMapResponse, Error>({
    queryKey: ["coordinator-duplicate-question-heat-map", coordinatorId],
    enabled: enabled && Boolean(coordinatorId),
    queryFn: async () =>
      (await apiFetch<CoordinatorDuplicateQuestionHeatMapResponse>(
        `${env.apiBaseUrl()}/analytics/coordinator-duplicate-heat-map/${coordinatorId}`,
      )) ?? EMPTY_RESPONSE,
  });
}
