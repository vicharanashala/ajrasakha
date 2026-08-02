import type { QuestionPriority } from '@/types';

export interface WorkloadSnapshot {
  expertId: string;
  expertName: string;
  high: string | null;
  medium: string | null;
  low: string | null;
}

export interface WorkloadSlotsProps {
  workloads: WorkloadSnapshot[];
  expertId: string;
  onComplete: (questionId: string, expertId: string) => void;
}

export interface QuestionSlotCardProps {
  questionId: string;
  expertId: string;
  priority: QuestionPriority;
  onComplete: (questionId: string) => void;
}
