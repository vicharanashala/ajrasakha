import {ObjectId} from 'mongodb';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {AiService} from '#root/modules/ai/services/AiService.js';
import {checkConceptDuplicate} from '#root/modules/question/aiservice/checkConceptDuplicate.js';
import {chatbotSimilarityLogger} from '../../logger/chatbot-similarity.logger.js';

/**
 * GDB → pending-duplicate-queue → LLM non-agri classification pipeline.
 * Shared between DuplicateService (manual check) and QuestionService's
 * addQuestion background flow, so it lives here as a stateless helper.
 */
export async function runDuplicateCheckPipeline(
  aiService: AiService,
  baseQuestion: IQuestion,
  details: IQuestion['details'],
  logData: Record<string, any>,
): Promise<{
  isDuplicate: boolean;
  isQueueDuplicate?: boolean;
  isNonAgri?: boolean;
  referenceQuestionId?: ObjectId | string | null;
  referenceQuestion?: string;
  referenceSource?: string;
  similarityScore?: number;
  isExact?: boolean;
}> {
  const cropName =
    typeof details.crop === 'string'
      ? details.crop
      : (details.crop as any)?.name || '';

  const gdbResult = await aiService.searchGdb({
    crop: cropName,
    state: details.state,
    rephrased_query: baseQuestion.question,
  });

  const extractObjectId = (id: any): ObjectId | null => {
    const raw = id?.$oid ?? id;
    const hex = String(raw ?? '');
    if (/^[a-f\d]{24}$/i.test(hex)) return new ObjectId(hex);
    return null;
  };

  const exactMatch = gdbResult?.exact_match;
  if (exactMatch?.question_id) {
    const refId = extractObjectId(exactMatch.question_id);
    if (refId) {
      return {
        isDuplicate: true,
        referenceQuestionId: refId,
        referenceQuestion: exactMatch.question,
        referenceSource: 'reviewer',
        similarityScore: Number(
          (exactMatch.similarity_score * 100).toFixed(2),
        ),
        isExact: true,
      };
    }
    console.warn(
      `[runDuplicateCheckPipeline] GDB exact_match invalid question_id: ${exactMatch.question_id}, skipping`,
    );
  }

  const selectedMatch = gdbResult?.selected_match;
  if (selectedMatch?.question_id) {
    const refId = extractObjectId(selectedMatch.question_id);
    if (refId) {
      return {
        isDuplicate: true,
        referenceQuestionId: refId,
        referenceQuestion: selectedMatch.question,
        referenceSource: 'reviewer',
        similarityScore: Number(
          (selectedMatch.similarity_score * 100).toFixed(2),
        ),
        isExact: false,
      };
    }
    console.warn(
      `[runDuplicateCheckPipeline] GDB selected_match invalid question_id: ${selectedMatch.question_id}, skipping`,
    );
  }

  // No GDB duplicate match — check the GDB pending-duplicate queue before falling
  // through to the LLM, so the LLM classification only runs when the question is
  // neither a duplicate nor already in the queue (single LLM call site).
  try {
    const pendingResult = await aiService.checkPendingDuplicate({
      rephrased_query: baseQuestion.question,
      crop: cropName,
      state: details.state,
      createdAt: baseQuestion.createdAt,
    });
    // A `detail` field means the GDB server didn't find a queued match.
    // Reference details come from the top-level response (duplicate_question_id /
    // query / similarity_score), not the candidates_checked array.
    const dupId =
      pendingResult?.duplicate_question_id ??
      pendingResult?.matched_question_id;
    // Only treat as a queue-duplicate when the GDB returned a usable reference id —
    // a null/undefined duplicate_question_id means no queued match.
    const foundInGdbQueue =
      !!pendingResult &&
      !pendingResult.detail &&
      typeof dupId === 'string' &&
      dupId.trim().length > 0;
    if (foundInGdbQueue) {
      const refId = /^[a-f\d]{24}$/i.test(dupId) ? new ObjectId(dupId) : null;
      return {
        isDuplicate: false,
        isQueueDuplicate: true,
        referenceQuestionId: refId,
        referenceQuestion: pendingResult!.query,
        referenceSource: 'reviewer',
        similarityScore: Number(
          ((pendingResult!.similarity_score ?? 0) * 100).toFixed(2),
        ),
      };
    }
  } catch (queueError: any) {
    console.warn(
      `[runDuplicateCheckPipeline] check-pending-duplicate failed: ${queueError?.message}`,
    );
  }

  // No GDB match and not in the queue — call LLM to classify non-agri vs agri.
  try {
    const llmResult = await checkConceptDuplicate(baseQuestion.question, []);
    if (llmResult.isNonAgri) {
      logData.outcome = 'NON_AGRI_DETECTED';
      chatbotSimilarityLogger.warn('ADD_QUESTION_LOG', logData);
      return {isDuplicate: false, isNonAgri: true};
    }
  } catch (llmError: any) {
    console.warn(
      `[runDuplicateCheckPipeline] LLM non-agri check failed, treating as agri: ${llmError?.message}`,
    );
  }

  return {isDuplicate: false};
}
