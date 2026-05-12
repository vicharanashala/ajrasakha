import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

export interface DuplicateQuestionEntry {
  questionId: string;
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
}

export function useDuplicateQuestions(enabled = false) {
  return useQuery<DuplicateQuestionEntry[], Error>({
    queryKey: ['duplicate-questions'],
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const result = await apiFetch<DuplicateQuestionEntry[]>(
        `${API_BASE_URL}/analytics/duplicate-questions`
      );
      return result ?? [];
    },
    enabled,
  });
}
