export   const TOTAL_EXPERTS_LIMIT = 10;
export const DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT = 1;

/**
 * Allocation categories by question source. Each category has an independent
 * per-expert active-question cap (an expert may hold 1 time-bound AND 1 manual
 * question at once). Keep these as the single source of truth — every place that
 * splits "time-bound vs manual" (queue caps, reallocation cron, queue-details
 * dashboard) must derive from these so the two caps never drift.
 *
 * - Time-bound: cron-driven, 45-min SLA.
 * - Manual: moderator-driven (AGRI_EXPERT / OUTREACH, excluding pae_review).
 */
export const TIME_BOUND_SOURCES = ['AJRASAKHA', 'WHATSAPP'] as const;
export const MANUAL_SOURCES = ['AGRI_EXPERT', 'OUTREACH'] as const;