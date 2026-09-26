import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

export interface DuplicateQuestionEntry {
  questionId: string;
  userId?: string;
  question: string;
  referenceQuestion: string;
  similarityScore: number;
  createdAt: string;
  farmerName: string;
  email: string;
  village: string;
  block: string;
  district: string;
  state: string;
  mobileNumber: string;
  threadId: string;
}

export function useDuplicateQuestions(
  enabled = false,
  source: 'annam' | 'whatsapp' = 'annam',
  userType: string,
  coordinatorId?: string,
) {
  return useQuery<DuplicateQuestionEntry[], Error>({
    queryKey: ['duplicate-questions', source, userType, coordinatorId],
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const params = new URLSearchParams();
      params.append("source", source);
      params.append("userType", userType);
      if (coordinatorId) params.append("coordinatorId", coordinatorId);
      const result = await apiFetch<DuplicateQuestionEntry[]>(
        `${API_BASE_URL}/analytics/duplicate-questions?${params.toString()}`
      );
      return result ?? [];
    },
    enabled,
  });
}
