export interface QuestionHoldAuditRecord {
  action?: unknown;
  outcome?: { status?: unknown };
  changes?: {
    before?: {
      previousExpertId?: { id?: unknown };
      totalDuration?: unknown;
    };
  };
}

/** Groups each valid successful hold event by the expert who previously owned it. */
export function groupQuestionHoldDurations(
  audits: QuestionHoldAuditRecord[],
): Map<string, number[]> {
  const durationsByExpert = new Map<string, number[]>();

  for (const audit of audits) {
    const expertId = audit.changes?.before?.previousExpertId?.id;
    const duration = audit.changes?.before?.totalDuration;
    if (
      audit.action !== 'QUESTION_HOLD' ||
      audit.outcome?.status !== 'SUCCESS' ||
      typeof expertId !== 'string' ||
      !expertId.trim() ||
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      continue;
    }

    const durations = durationsByExpert.get(expertId) ?? [];
    durations.push(duration);
    durationsByExpert.set(expertId, durations);
  }

  return durationsByExpert;
}
