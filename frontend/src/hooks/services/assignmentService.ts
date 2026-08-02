import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

const API_BASE_URL = env.apiBaseUrl();

export interface WorkloadSnapshot {
  expertId: string;
  expertName: string;
  high: string | null;
  medium: string | null;
  low: string | null;
}

export interface QueueLengths {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface QueueEntry {
  _id: string;
  questionId: string;
  priority: 'low' | 'medium' | 'high';
  status: string;
  enqueuedAt: string;
}

export class AssignmentService {
  async getAllWorkloads(): Promise<WorkloadSnapshot[]> {
    return apiFetch<WorkloadSnapshot[]>(`${API_BASE_URL}/assignments/workloads`);
  }

  async getWorkloadSnapshot(expertId: string): Promise<WorkloadSnapshot | null> {
    return apiFetch<WorkloadSnapshot | null>(`${API_BASE_URL}/assignments/workloads/${expertId}`);
  }

  async getQueueLengths(): Promise<QueueLengths> {
    return apiFetch<QueueLengths>(`${API_BASE_URL}/assignments/queue`);
  }

  async getQueueEntries(): Promise<QueueEntry[]> {
    return apiFetch<QueueEntry[]>(`${API_BASE_URL}/assignments/queue/entries`);
  }

  async completeQuestion(questionId: string, expertId: string): Promise<void> {
    return apiFetch<void>(`${API_BASE_URL}/assignments/complete`, {
      method: 'POST',
      body: JSON.stringify({ questionId, expertId }),
    });
  }
}
