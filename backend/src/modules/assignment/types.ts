import { IQuestionPriority } from '#root/shared/interfaces/models.js';

/**
 * Priority used for the assignment engine.
 * Unlike IQuestionPriority (which has 'critical'), AssignmentPriority
 * only has three tiers — 'critical' maps to 'high' internally.
 */
export type AssignmentPriority = 'low' | 'medium' | 'high';

/** Status of an assignment within the engine's lifecycle. */
export type AssignmentStatus = 'active' | 'frozen' | 'completed' | 'queued';

/** Why a question was frozen. */
export type FrozenReason = 'high_priority_occupies_slot' | 'manual_freeze';

/**
 * Maps IQuestionPriority (which includes 'critical') to AssignmentPriority.
 * critical → high; everything else passes through unchanged.
 */
export function toAssignmentPriority(p: IQuestionPriority): AssignmentPriority {
  if (p === 'critical') return 'high';
  return p;
}

/**
 * Priority ordering for the queue: high > medium > low.
 * Lower number = higher priority.
 */
export const PRIORITY_ORDER: Record<AssignmentPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Returns true when a has higher or equal priority than b. */
export function isHigherOrEqualPriority(
  a: AssignmentPriority,
  b: AssignmentPriority,
): boolean {
  return PRIORITY_ORDER[a] <= PRIORITY_ORDER[b];
}

/** Returns true when a has strictly higher priority than b. */
export function isHigherPriority(
  a: AssignmentPriority,
  b: AssignmentPriority,
): boolean {
  return PRIORITY_ORDER[a] < PRIORITY_ORDER[b];
}

// ── Domain interfaces ────────────────────────────────────────────────────────

/** One question assigned to an expert within the assignment engine. */
export interface IAssignment {
  _id?: string;
  questionId: string;
  expertId: string;
  priority: AssignmentPriority;
  status: AssignmentStatus;
  frozenReason?: FrozenReason;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/** Snapshot of an expert's current workload for the dashboard. */
export interface IExpertWorkload {
  expertId: string;
  activeHigh: number;
  activeMedium: number;
  activeLow: number;
  frozenMedium: number;
  frozenLow: number;
  queuedHigh: number;
  queuedMedium: number;
  queuedLow: number;
  totalActive: number;
  totalFrozen: number;
  totalQueued: number;
}

/** Summary stats for the admin dashboard. */
export interface IAdminAssignmentStats {
  totalActive: number;
  totalFrozen: number;
  totalQueued: number;
  totalCompletedToday: number;
  queueLengthByPriority: {
    high: number;
    medium: number;
    low: number;
  };
  expertCount: number;
  overloadedExperts: string[]; // expertIds with > 3 active assignments
}