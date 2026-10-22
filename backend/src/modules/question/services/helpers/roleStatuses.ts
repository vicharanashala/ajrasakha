import {QuestionStatus} from '#root/shared/interfaces/models.js';

/**
 * Statuses each role queue handles (drives both assignment and auto-freeing).
 * Shared between QuestionService (gate-keeper/auditor crons, status-change
 * freeing) and QueueService (queue rendering).
 */
export const GATE_KEEPER_STATUSES: QuestionStatus[] = [
  'dynamic',
  'duplicate',
  'queue_duplicate',
];

export const AUDITOR_STATUSES: QuestionStatus[] = ['auditor_review'];
