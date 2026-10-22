import {QueueQuestionItem} from '../../interfaces/IQuestionService.js';

/**
 * Stateless queue-item mappers shared between QuestionService (queue rendering)
 * and PaeValidationService. Extracted so the mapping lives in one place.
 */

/** Normalise a crop value (string or {name}) to its display name. */
export function queueCropName(crop: unknown): string | undefined {
  if (!crop) return undefined;
  if (typeof crop === 'string') return crop;
  if (typeof crop === 'object' && 'name' in (crop as any)) {
    return (crop as any).name?.toString();
  }
  return undefined;
}

/** Map a submission (or `{question}`) into the flat queue-item shape. */
export function submissionToQueueItem(sub: any): QueueQuestionItem {
  const q = sub.question || {};
  return {
    _id: (q._id ?? sub.questionId)?.toString(),
    question: q.question ?? '',
    status: q.status ?? '',
    source: q.source ?? '',
    isTrainingQuestion: q.isTrainingQuestion === true,
    priority: q.priority,
    createdAt: q.createdAt,
    state: q.details?.state,
    district: q.details?.district,
    crop: queueCropName(q.details?.crop),
  };
}
