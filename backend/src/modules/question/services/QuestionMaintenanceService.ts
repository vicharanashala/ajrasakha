import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {BadRequestError} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {appConfig} from '#root/config/app.js';
import {AiService} from '#root/modules/ai/services/AiService.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IAnswerRepository} from '#root/shared/database/interfaces/IAnswerRepository.js';
import {INotificationRepository} from '#root/shared/database/interfaces/INotificationRepository.js';
import {ISubmissionHistory} from '#root/shared/interfaces/models.js';

/**
 * Admin / maintenance / normalization utilities extracted from QuestionService:
 * geo + domain normalization, submission history/queue data-fixes, and backfill /
 * diagnostic jobs (embeddings, closed-question moderatorId, delayed notifications,
 * closed-answer mismatch). None are on the core question workflow. QuestionService
 * keeps thin delegating wrappers.
 */
@injectable()
export class QuestionMaintenanceService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository) private readonly questionRepo: IQuestionRepository,
    @inject(GLOBAL_TYPES.UserRepository) private readonly userRepo: IUserRepository,
    @inject(GLOBAL_TYPES.QuestionSubmissionRepository) private readonly questionSubmissionRepo: IQuestionSubmissionRepository,
    @inject(GLOBAL_TYPES.AnswerRepository) private readonly answerRepo: IAnswerRepository,
    @inject(GLOBAL_TYPES.NotificationRepository) private readonly notificationRepository: INotificationRepository,
    @inject(CORE_TYPES.AIService) private readonly aiService: AiService,
    @inject(GLOBAL_TYPES.Database) mongoDatabase: MongoDatabase,
  ) { super(mongoDatabase); }

  async normalizeQuestionState(
    currentValues: string[],
    standardizedTo: string,
  ): Promise<{matched: number; modified: number}> {
    const cleaned = (currentValues ?? [])
      .map(v => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    const target = (standardizedTo ?? '').trim();
    if (cleaned.length === 0) {
      throw new BadRequestError(
        'current values must be a non-empty array of strings',
      );
    }
    if (!target) {
      throw new BadRequestError('standardizedTo is required');
    }
    return this._withTransaction(async (session: ClientSession) => {
      return this.questionRepo.normalizeQuestionState(cleaned, target, session);
    });
  }

  /** Standardise question district names, validating each `standardiseTo` against the
   *  `districts` collection (districtNameEnglish). Matching ones update questions whose
   *  details.district === existingName; non-matching names are returned untouched. */
  async normalizeQuestionDistricts(
    mappings: {existingName: string; standardiseTo: string}[],
  ) {
    const cleaned = (mappings ?? [])
      .map(m => ({
        existingName:
          typeof m?.existingName === 'string' ? m.existingName.trim() : '',
        standardiseTo:
          typeof m?.standardiseTo === 'string' ? m.standardiseTo.trim() : '',
      }))
      .filter(m => m.existingName && m.standardiseTo);
    if (cleaned.length === 0) {
      throw new BadRequestError(
        'mappings must be a non-empty array of { existingName, standardiseTo }',
      );
    }
    return this.questionRepo.normalizeQuestionDistricts(cleaned);
  }

  /** Audit: distinct question details.state / details.district values that don't exist in the
   *  states / districts collections. */
  async findUnknownQuestionGeo(): Promise<{
    unknownStates: string[];
    matchedDistricts: {
      name: string;
      foundIn: 'block' | 'village';
      districtCode: number | null;
      stateCode: number | null;
      districtNameEnglish: string | null;
    }[];
    notMatchingDistricts: string[];
  }> {
    return this.questionRepo.findUnknownQuestionGeo();
  }

  async sendDelayedNotifications(): Promise<void> {
    await this._withTransaction(async session => {
      const delayedReviews =
        await this.questionSubmissionRepo.getDelayedReviews(session);
      if (!delayedReviews.length) {
        return;
      }

      const notifiedSubmissionIds: ObjectId[] = [];

      const moderators = await this.userRepo.findModerators();

      for (const item of delayedReviews) {
        try {
          await Promise.allSettled(
            moderators.map(mod =>
              this.notificationRepository.addNotification(
                mod._id.toString(),
                item.questionId.toString(),
                'question_delayed',
                'A question has been delayed for 45 minutes',
                'Question Delayed',
              ),
            ),
          );

          notifiedSubmissionIds.push(item?._id);
        } catch (error) {
          console.error(
            `Failed notification for question ${item?.questionId}`,
            error,
          );
        }
      }
      if (notifiedSubmissionIds.length) {
        await this.questionSubmissionRepo.markDelayedNotificationsSent(
          notifiedSubmissionIds,
          session,
        );
      }
    });
  }

  async backfillEmptyEmbeddings(batchLimit = 50): Promise<void> {
    if (!appConfig.ENABLE_AI_SERVER) {
      console.log('<<EMBEDDING_BACKFILL>> AI server disabled, skipping.');
      return;
    }

    const questions =
      await this.questionRepo.getQuestionsWithEmptyEmbeddings(batchLimit);

    if (questions.length === 0) {
      console.log(
        '<<EMBEDDING_BACKFILL>> No questions with empty embeddings found.',
      );
      return;
    }

    console.log(
      `<<EMBEDDING_BACKFILL>> Processing ${questions.length} question(s)...`,
    );

    let succeeded = 0;
    let failed = 0;

    for (const q of questions) {
      const inputText = (q.question || q.text || '').trim();

      if (!inputText) {
        console.warn(`<<EMBEDDING_BACKFILL>> Skipping ${q._id} — no text`);
        failed++;
        continue;
      }

      try {
        const {embedding} = await this.aiService.getEmbedding(inputText);
        await this.questionRepo.updateQuestionEmbedding(
          q._id.toString(),
          embedding,
        );
        succeeded++;
      } catch (err) {
        console.error(`<<EMBEDDING_BACKFILL>> Failed for ${q._id}:`, err);
        failed++;
      }
    }

    console.log(
      `<<EMBEDDING_BACKFILL>> Done — ✅ ${succeeded} succeeded, ❌ ${failed} failed`,
    );
  }

  /**
   * Backfill embeddings that were never generated (empty/missing `embedding`), reproducing
   * the SAME text each generation path uses so the backfilled vectors are consistent with
   * live ones:
   *   • creation path → `Question: <question>` (see QuestionService.processQuestionInBackground)
   *   • approval/close path → `Question: <question>\n\nanswer: <final answer>` and the final
   *     answer's own embedding gets the same vector (see AnswerApprovalService.approveAnswer)
   *
   * So a CLOSED question (closed / duplicate_closed / dynamic_closed) is embedded from its
   * Q+A text and its final answer's embedding is repaired too; any other status is embedded
   * from the question text alone. Runs in batches; call repeatedly until `scanned` is 0.
   */
  async backfillMissingEmbeddings(batchLimit = 50): Promise<{
    scanned: number;
    questionsUpdated: number;
    updatedIds: string[];
    matchedButUnchanged: number;
    closedWithAnswer: number;
    closedWithAnswerIds: string[];
    skippedNoText: number;
    failed: number;
  }> {
    const result = {
      scanned: 0,
      questionsUpdated: 0,
      updatedIds: [] as string[],
      matchedButUnchanged: 0,
      closedWithAnswer: 0,
      closedWithAnswerIds: [] as string[],
      skippedNoText: 0,
      failed: 0,
    };

    if (!appConfig.ENABLE_AI_SERVER) {
      console.log('<<EMBEDDING_BACKFILL>> AI server disabled, skipping.');
      return result;
    }

    const questions =
      await this.questionRepo.getQuestionsMissingEmbedding(batchLimit);
    result.scanned = questions.length;

    if (questions.length === 0) {
      console.log('<<EMBEDDING_BACKFILL>> No questions with missing embeddings.');
      return result;
    }

    const CLOSED_STATUSES = new Set([
      'closed',
      'duplicate_closed',
      'dynamic_closed',
    ]);

    // Batch-fetch the final answers for every closed candidate (one query, no N+1).
    const closedIds = questions
      .filter(q => CLOSED_STATUSES.has(q.status ?? ''))
      .map(q => q._id.toString());
    // questionId -> final answer text (used only as the embedding INPUT for closed questions).
    const finalAnswerByQuestion = new Map<string, string>();
    if (closedIds.length) {
      const finals = await this.answerRepo.getFinalAnswersByQuestionIds(closedIds);
      for (const a of finals) {
        const qid = a.questionId?.toString();
        // First final answer per question wins (matches the approval flow's single final).
        if (qid && !finalAnswerByQuestion.has(qid)) {
          finalAnswerByQuestion.set(qid, a.answer ?? '');
        }
      }
    }

    console.log(
      `<<EMBEDDING_BACKFILL>> Processing ${questions.length} question(s)...`,
    );

    for (const q of questions) {
      const qid = q._id.toString();
      const questionText = (q.question || '').trim();
      const isClosed = CLOSED_STATUSES.has(q.status ?? '');
      const finalAnswerText = isClosed ? finalAnswerByQuestion.get(qid) : undefined;

      // Closed + has a final answer → embed the Q+A text (approval flow); otherwise fall
      // back to the plain question text (creation flow).
      const inputText =
        finalAnswerText && questionText
          ? `Question: ${questionText}\n\nanswer: ${finalAnswerText}`
          : questionText
            ? `Question: ${questionText}`
            : (q.text || '').trim();

      if (!inputText) {
        console.warn(`<<EMBEDDING_BACKFILL>> Skipping ${qid} — no text`);
        result.skippedNoText++;
        continue;
      }

      try {
        const {embedding} = await this.aiService.getEmbedding(inputText);
        if (!embedding?.length) {
          console.warn(
            `<<EMBEDDING_BACKFILL>> Empty embedding returned for ${qid}, skipping`,
          );
          result.failed++;
          continue;
        }

        // Only the question's embedding is backfilled — `text` (and everything else) is left
        // as-is. The Q+A text is used purely as the embedding INPUT for closed questions so
        // the vector matches the approval flow. (Answer-collection embeddings are handled
        // separately by backfillAnswerEmbeddings.)
        const {modifiedCount} = await this.questionRepo.updateQuestionEmbedding(
          qid,
          embedding,
        );
        // Count/report ONLY questions Mongo actually changed, so the numbers reflect real
        // DB writes (a matched-but-unchanged doc is surfaced separately, not as "updated").
        if (modifiedCount > 0) {
          result.questionsUpdated++;
          result.updatedIds.push(qid);
          if (finalAnswerText) {
            result.closedWithAnswer++;
            result.closedWithAnswerIds.push(qid);
          }
        } else {
          result.matchedButUnchanged++;
          console.warn(
            `<<EMBEDDING_BACKFILL>> ${qid} matched but not modified (no DB change)`,
          );
        }
      } catch (err) {
        console.error(`<<EMBEDDING_BACKFILL>> Failed for ${qid}:`, err);
        result.failed++;
      }
    }

    console.log(
      `<<EMBEDDING_BACKFILL>> Done — questions ✅ ${result.questionsUpdated} ` +
        `(closed w/ answer ${result.closedWithAnswer}), unchanged ${result.matchedButUnchanged}, ` +
        `❌ ${result.failed}, skipped ${result.skippedNoText}`,
    );
    if (result.updatedIds.length) {
      console.log(
        `<<EMBEDDING_BACKFILL>> Updated question ids: ${result.updatedIds.join(', ')}`,
      );
    }
    return result;
  }

  /**
   * Backfill embeddings on the ANSWERS collection (empty/missing `embedding`), reproducing
   * the SAME text each answer path uses:
   *   • normal submission (AnswerService.addAnswer) → `getEmbedding(answer)` — answer text only
   *   • approval/close (AnswerApprovalService)      → `Question: <q>\n\nanswer: <answer>`
   *     for the FINAL answer
   *
   * So `isFinalAnswer` answers are embedded from their Q+A text (question fetched by id) and
   * every other answer from its answer text alone. Batched; call until `scanned` is 0.
   */
  async backfillAnswerEmbeddings(batchLimit = 50): Promise<{
    scanned: number;
    updated: number;
    finalWithQuestion: number;
    skippedNoText: number;
    failed: number;
  }> {
    const result = {
      scanned: 0,
      updated: 0,
      finalWithQuestion: 0,
      skippedNoText: 0,
      failed: 0,
    };

    if (!appConfig.ENABLE_AI_SERVER) {
      console.log('<<ANSWER_EMBEDDING_BACKFILL>> AI server disabled, skipping.');
      return result;
    }

    const answers =
      await this.answerRepo.getAnswersMissingEmbedding(batchLimit);
    result.scanned = answers.length;

    if (answers.length === 0) {
      console.log('<<ANSWER_EMBEDDING_BACKFILL>> No answers with missing embeddings.');
      return result;
    }

    // Final answers embed the Q+A text, so batch-fetch their question texts (one query).
    const questionIdsForFinal = Array.from(
      new Set(
        answers
          .filter(a => a.isFinalAnswer && a.questionId)
          .map(a => a.questionId!.toString()),
      ),
    ).map(id => new ObjectId(id));
    const questionTextById = new Map<string, string>();
    if (questionIdsForFinal.length) {
      const qs = await this.questionRepo.findByIds(questionIdsForFinal);
      for (const q of qs) {
        questionTextById.set(q._id!.toString(), (q.question || '').trim());
      }
    }

    console.log(
      `<<ANSWER_EMBEDDING_BACKFILL>> Processing ${answers.length} answer(s)...`,
    );

    for (const a of answers) {
      const aid = a._id.toString();
      const answerText = (a.answer || '').trim();
      const questionText = a.isFinalAnswer
        ? questionTextById.get(a.questionId?.toString() ?? '')
        : undefined;

      // Final answer with a resolvable question → Q+A text (approval flow); otherwise the
      // answer text alone (submission flow).
      const inputText =
        a.isFinalAnswer && questionText && answerText
          ? `Question: ${questionText}\n\nanswer: ${answerText}`
          : answerText;

      if (!inputText) {
        console.warn(`<<ANSWER_EMBEDDING_BACKFILL>> Skipping ${aid} — no text`);
        result.skippedNoText++;
        continue;
      }

      try {
        const {embedding} = await this.aiService.getEmbedding(inputText);
        if (!embedding?.length) {
          console.warn(
            `<<ANSWER_EMBEDDING_BACKFILL>> Empty embedding returned for ${aid}, skipping`,
          );
          result.failed++;
          continue;
        }
        await this.answerRepo.updateAnswer(aid, {embedding});
        result.updated++;
        if (a.isFinalAnswer && questionText) result.finalWithQuestion++;
      } catch (err) {
        console.error(`<<ANSWER_EMBEDDING_BACKFILL>> Failed for ${aid}:`, err);
        result.failed++;
      }
    }

    console.log(
      `<<ANSWER_EMBEDDING_BACKFILL>> Done — answers ✅ ${result.updated} ` +
        `(final w/ question ${result.finalWithQuestion}), ❌ ${result.failed}, ` +
        `skipped ${result.skippedNoText}`,
    );
    return result;
  }

  async backgroundProcessAction(
    userId: string,
  ): Promise<{modifiedCount: number}> {
    return await this.userRepo.clearAssignedQuestions(userId);
  }

  /** Admin utility: remove a submission history entry (by 0-based index) for a question. */
  async removeSubmissionHistoryEntry(
    questionId: string,
    index: number,
  ): Promise<{success: boolean; historyLength: number}> {
    const updated = await this.questionSubmissionRepo.removeHistoryEntryByIndex(
      questionId,
      index,
    );
    return {
      success: true,
      historyLength: updated?.history?.length ?? 0,
    };
  }

  /** Admin data-fix: remove a single expert from a question's submission queue by index. */
  async removeSubmissionQueueEntry(
    questionId: string,
    index: number,
  ): Promise<{success: boolean; queueLength: number}> {
    const updated = await this.questionSubmissionRepo.removeQueueEntryByIndex(
      questionId,
      index,
    );
    return {
      success: true,
      queueLength: updated?.queue?.length ?? 0,
    };
  }

  /** Admin utility: append an expert to a question's submission queue. */
  async addSubmissionQueueEntry(
    questionId: string,
    expertId: string,
  ): Promise<{success: boolean; queueLength: number}> {
    if (!expertId || !ObjectId.isValid(expertId)) {
      throw new BadRequestError('A valid expertId is required');
    }
    const updated = await this.questionSubmissionRepo.addQueueEntry(
      questionId,
      expertId,
    );
    return {success: true, queueLength: updated?.queue?.length ?? 0};
  }

  /** Admin utility: append a history entry to a question's submission history.
   *  The raw entry's id/date fields are coerced to ObjectId/Date before storing. */
  async addSubmissionHistoryEntry(
    questionId: string,
    rawEntry: Record<string, any>,
  ): Promise<{success: boolean; historyLength: number}> {
    const entry = this.buildHistoryEntry(rawEntry);
    const updated = await this.questionSubmissionRepo.addHistoryEntry(
      questionId,
      entry,
    );
    return {
      success: true,
      historyLength: updated?.history?.length ?? 0,
    };
  }

  /** Coerce a raw JSON history entry into a stored ISubmissionHistory (ObjectIds + Dates). */
  private buildHistoryEntry(raw: Record<string, any>): ISubmissionHistory {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestError('entry object is required');
    }
    const toOid = (v: unknown): ObjectId => {
      if (!v || !ObjectId.isValid(String(v))) {
        throw new BadRequestError(`Invalid ObjectId: ${String(v)}`);
      }
      return new ObjectId(String(v));
    };
    const toDate = (v: unknown): Date | undefined =>
      v ? new Date(v as string) : undefined;

    if (!raw.updatedBy) {
      throw new BadRequestError('entry.updatedBy is required');
    }
    if (!raw.status) {
      throw new BadRequestError('entry.status is required');
    }

    const entry: any = {
      updatedBy: toOid(raw.updatedBy),
      status: raw.status,
      createdAt: toDate(raw.createdAt) ?? new Date(),
      updatedAt: toDate(raw.updatedAt) ?? new Date(),
    };

    // Optional ObjectId fields.
    if (raw.answer) entry.answer = toOid(raw.answer);
    if (raw.reviewId) entry.reviewId = toOid(raw.reviewId);
    if (raw.approvedAnswer) entry.approvedAnswer = toOid(raw.approvedAnswer);
    if (raw.rejectedBy) entry.rejectedBy = toOid(raw.rejectedBy);
    if (raw.rejectedAnswer) entry.rejectedAnswer = toOid(raw.rejectedAnswer);
    if (raw.lastModifiedBy) entry.lastModifiedBy = toOid(raw.lastModifiedBy);
    if (raw.modifiedAnswer) entry.modifiedAnswer = toOid(raw.modifiedAnswer);

    // Optional string fields.
    if (raw.reasonForRejection) {
      entry.reasonForRejection = String(raw.reasonForRejection);
    }
    if (raw.reasonForLastModification) {
      entry.reasonForLastModification = String(raw.reasonForLastModification);
    }

    return entry as ISubmissionHistory;
  }

  async setNormalizedDomains(
    entries: { 'Question ID'?: string; 'Standardized Domain'?: string }[],
  ): Promise<{
    total: number;
    matched: number;
    modified: number;
    notMatched: number;
    invalid: number;
  }> {
    const pairs = (Array.isArray(entries) ? entries : []).map(e => ({
      questionId: String(e?.['Question ID'] ?? '').trim(),
      normalizedDomain: String(e?.['Standardized Domain'] ?? '').trim(),
    }));
    return this.questionRepo.bulkSetNormalizedDomain(pairs);
  }

  /** Diagnostic: closed questions in a window that don't have a final answer with a
   *  valid ObjectId approvedBy — i.e. the ones dropped from the moderator breakdown,
   *  which explains the "closed count vs breakdown count" mismatch. */
  async getClosedAnswerMismatch(
    startTime?: Date,
    endTime?: Date,
  ): Promise<{
    window: { start: Date; end: Date };
    totalClosed: number;
    matched: number;
    mismatched: number;
    items: any[];
  }> {
    let start = startTime;
    let end = endTime;
    if (!start || !end) {
      // Default to the current IST day if no window is given.
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    }
    return this.questionRepo.getClosedAnswerMismatch(start, end);
  }

  async backfillClosedModeratorIds(limit = 500): Promise<{
    matched: number;
    updated: number;
    skippedNoFinalAnswer: number;
    skippedNoApprover: number;
  }> {
    const questionIds =
      await this.questionRepo.findClosedQuestionsWithoutModerator(limit);
    if (!questionIds.length) {
      return {
        matched: 0,
        updated: 0,
        skippedNoFinalAnswer: 0,
        skippedNoApprover: 0,
      };
    }

    const finalAnswers =
      await this.answerRepo.getFinalAnswersByQuestionIds(questionIds);

    // questionId -> approvedBy (first final answer that has an approver wins).
    const approverByQuestion = new Map<string, string>();
    const questionsWithFinal = new Set<string>();
    for (const a of finalAnswers) {
      const qid = a.questionId?.toString();
      if (!qid) continue;
      questionsWithFinal.add(qid);
      const approver = a.approvedBy?.toString();
      if (approver && !approverByQuestion.has(qid)) {
        approverByQuestion.set(qid, approver);
      }
    }

    const pairs: {questionId: string; moderatorId: string}[] = [];
    let skippedNoFinalAnswer = 0;
    let skippedNoApprover = 0;
    for (const qid of questionIds) {
      if (!questionsWithFinal.has(qid)) {
        skippedNoFinalAnswer++;
        continue;
      }
      const approver = approverByQuestion.get(qid);
      if (!approver) {
        skippedNoApprover++;
        continue;
      }
      pairs.push({questionId: qid, moderatorId: approver});
    }

    const updated = await this.questionRepo.bulkSetModeratorId(pairs);
    return {
      matched: questionIds.length,
      updated,
      skippedNoFinalAnswer,
      skippedNoApprover,
    };
  }
}
