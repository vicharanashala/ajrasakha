import { AssignmentPriority, AssignmentStatus, IAssignment } from '../types.js';

export interface IAssignmentRepository {
  /** Persist a new assignment. */
  create(assignment: Omit<IAssignment, '_id'>): Promise<IAssignment>;

  /** Find by primary key. */
  findById(id: string): Promise<IAssignment | null>;

  /** Find all assignments for a question (usually 0 or 1). */
  findByQuestionId(questionId: string): Promise<IAssignment[]>;

  /** Find all assignments (any status) for an expert. */
  findByExpertId(expertId: string): Promise<IAssignment[]>;

  /** Find active assignments for an expert. */
  findActiveByExpertId(expertId: string): Promise<IAssignment[]>;

  /** Find frozen assignments for an expert. */
  findFrozenByExpertId(expertId: string): Promise<IAssignment[]>;

  /** Find queued assignments for an expert. */
  findQueuedByExpertId(expertId: string): Promise<IAssignment[]>;

  /** Update just the status of an assignment. */
  updateStatus(id: string, status: AssignmentStatus): Promise<IAssignment>;

  /** Update status by questionId (used when question is answered/closed externally). */
  updateStatusByQuestionId(questionId: string, status: AssignmentStatus): Promise<IAssignment | null>;

  /** Mark an assignment completed (status=completed, completedAt=now). */
  complete(id: string): Promise<IAssignment>;

  /** Remove an assignment entirely. */
  delete(id: string): Promise<void>;

  /** Remove assignment by questionId. */
  deleteByQuestionId(questionId: string): Promise<void>;

  /** Count active assignments for an expert. */
  countActiveByExpertId(expertId: string): Promise<number>;

  /** Count assignments by status. */
  countByStatus(status: AssignmentStatus): Promise<number>;

  /** Count completed assignments within a date range. */
  countCompletedInRange(start: Date, end: Date): Promise<number>;

  /** Get all distinct expertIds that have at least one assignment. */
  getDistinctExpertIds(): Promise<string[]>;

  /** Find all active assignments (any expert). */
  findAllActive(): Promise<IAssignment[]>;

  /** Find all frozen assignments (any expert). */
  findAllFrozen(): Promise<IAssignment[]>;

  /** Find queued assignments for a specific priority (all experts). */
  findQueuedByPriority(priority: AssignmentPriority): Promise<IAssignment[]>;
}