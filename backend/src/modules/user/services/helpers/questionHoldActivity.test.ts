import { describe, expect, it } from 'vitest';
import { groupQuestionHoldDurations } from './questionHoldActivity.js';

const validHold = (
  expertId: string,
  totalDuration: number,
  questionId = 'question-1',
) => ({
  action: 'QUESTION_HOLD',
  outcome: { status: 'SUCCESS' },
  context: { questionId },
  changes: {
    before: {
      previousExpertId: { id: expertId },
      totalDuration,
    },
  },
});

describe('groupQuestionHoldDurations', () => {
  it('returns no events for experts without successful holds', () => {
    expect(groupQuestionHoldDurations([]).get('expert-1') ?? []).toEqual([]);
  });

  it('groups every valid event by previous expert without deduplicating questions', () => {
    const grouped = groupQuestionHoldDurations([
      validHold('expert-1', 720000, 'same-question'),
      validHold('expert-2', 1920000),
      validHold('expert-1', 1500000, 'same-question'),
    ]);

    expect(grouped.get('expert-1')).toEqual([720000, 1500000]);
    expect(grouped.get('expert-2')).toEqual([1920000]);
    expect(grouped.get('actor-id')).toBeUndefined();
  });

  it('skips records with missing IDs, missing or invalid durations, and unsuccessful outcomes', () => {
    const valid = validHold('expert-1', 9000);
    const noExpertId = validHold('', 1000);
    noExpertId.changes.before.previousExpertId.id = undefined;
    const noDuration = {
      action: 'QUESTION_HOLD',
      outcome: { status: 'SUCCESS' },
      changes: { before: { previousExpertId: { id: 'expert-1' } } },
    };
    const zeroDuration = validHold('expert-1', 0);
    const negativeDuration = validHold('expert-1', -1);
    const invalidDuration = validHold('expert-1', Number.NaN);
    const failed = { ...validHold('expert-1', 2000), outcome: { status: 'FAILED' } };
    const partial = { ...validHold('expert-1', 3000), outcome: { status: 'PARTIAL' } };

    expect(groupQuestionHoldDurations([
      valid,
      noExpertId,
      noDuration,
      zeroDuration,
      negativeDuration,
      invalidDuration,
      failed,
      partial,
    ]).get('expert-1')).toEqual([9000]);
  });
});
