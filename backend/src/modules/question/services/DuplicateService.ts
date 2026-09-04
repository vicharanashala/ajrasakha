import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {ClientSession, ObjectId} from 'mongodb';
import {GLOBAL_TYPES} from '#root/types.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IQuestion} from '#root/shared/interfaces/models.js';
import {IQuestionRepository} from '#root/shared/database/interfaces/IQuestionRepository.js';
import {IQuestionSubmissionRepository} from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import {IDuplicateQuestionRepository} from '#root/shared/database/interfaces/IDuplicateQuestionRepository.js';
import {AiService} from '#root/modules/ai/services/AiService.js';
import {checkDuplicateQuestionHelper} from '../helpers/duplicateQuestionHelper.js';
import {runDuplicateCheckPipeline} from './helpers/duplicatePipeline.js';
import {IRoleAssigneeService} from '../interfaces/IRoleAssigneeService.js';

/**
 * Duplicate-detection workflow extracted from QuestionService: the reusable
 * duplicate check and the manual (moderator-triggered) duplicate check.
 * QuestionService keeps thin delegating wrappers for both.
 */
@injectable()
export class DuplicateService {
  constructor(
    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.DuplicateQuestionRepository)
    private readonly duplicateQuestionRepository: IDuplicateQuestionRepository,

    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.RoleAssigneeService)
    private readonly roleAssigneeService: IRoleAssigneeService,
  ) {}

  /**
   * Event-driven gate-keeper / auditor queue allocation. Call after manually marking a
   * question `duplicate` / `queue_duplicate` (a gate-keeper status) so a free gate keeper
   * picks it up. Fire-and-forget and idempotent — never affects the caller's write.
   */
  private triggerRoleQueueAllocation(context: string): void {
    void this.roleAssigneeService
      .runGateKeeperAuditorQueueCron()
      .catch(err =>
        console.error(
          `[${context}] event-driven gate-keeper/auditor allocation failed:`,
          err?.message,
        ),
      );
  }

    async checkDuplicateQuestion(
    baseQuestion: IQuestion,
    details: IQuestion['details'],
    logData: Record<string, any>,
    session?: ClientSession,
  ): Promise<{
    isDuplicate: boolean;
    duplicateData?: any;
    isNonAgri?: boolean;
    nonAgriData?: any;
  }> {
    return checkDuplicateQuestionHelper(
      baseQuestion,
      details,
      logData,
      this.aiService,
      this.duplicateQuestionRepository,
      session,
    );
  }

  async manualCheckDuplicate(questionId: string): Promise<{
    message: string;
    isDuplicate: boolean;
    referenceQuestionId?: string;
  }> {
    const question = await this.questionRepo.getById(questionId);

    if (question.referenceQuestionId) {
      return {
        message: 'Question already has a reference question assigned.',
        isDuplicate: true,
      };
    }

    const logData: Record<string, any> = {questionId, manual: true};
    const result = await runDuplicateCheckPipeline(this.aiService, 
      question,
      question.details,
      logData,
    );

    if (result.isDuplicate) {
      const refId =
        result.referenceQuestionId instanceof ObjectId
          ? result.referenceQuestionId
          : result.referenceQuestionId
            ? new ObjectId(String(result.referenceQuestionId))
            : null;

      // Get submission to check queue length
      const questionSubmission =
        await this.questionSubmissionRepo.getByQuestionId(questionId);
      const queueLength = questionSubmission?.queue?.length || 0;

      // Only flip the status to 'duplicate' when the question is still open/delayed.
      // For any other status (in-review, closed, etc.) the workflow is already past
      // that point, so the status must not change — we just record the reference.
      const canMarkDuplicate =
        (question.status === 'open' || question.status === 'delayed') &&
        queueLength === 0;
      await this.questionRepo.updateQuestion(questionId, {
        ...(canMarkDuplicate ? {status: 'duplicate'} : {}),
        similarityScore: result.similarityScore,
        referenceQuestionId: refId,
        referenceQuestion: result.referenceQuestion,
        referenceSource: result.referenceSource,
        isDuplicateChecked: true,
        ...(result.isExact !== undefined ? {isExact: result.isExact} : {}),
      });
      // Entered a gate-keeper status → fill the gate-keeper queue now.
      if (canMarkDuplicate) this.triggerRoleQueueAllocation('manualCheckDuplicate');
      return {
        message: canMarkDuplicate
          ? 'Duplicate detected and question updated.'
          : `Duplicate detected; status left unchanged (question is '${question.status}').`,
        isDuplicate: true,
        referenceQuestionId: refId?.toString(),
      };
    }

    if (result.isQueueDuplicate) {
      const refId =
        result.referenceQuestionId instanceof ObjectId
          ? result.referenceQuestionId
          : result.referenceQuestionId
            ? new ObjectId(String(result.referenceQuestionId))
            : null;
      const canMarkQueue =
        question.status === 'open' || question.status === 'delayed';
      await this.questionRepo.updateQuestion(questionId, {
        ...(canMarkQueue
          ? {status: 'queue_duplicate', isAutoAllocate: false}
          : {}),
        similarityScore: result.similarityScore,
        referenceQuestionId: refId,
        referenceQuestion: result.referenceQuestion,
        referenceSource: result.referenceSource,
        isDuplicateChecked: true,
      });
      // Entered a gate-keeper status → fill the gate-keeper queue now.
      if (canMarkQueue) this.triggerRoleQueueAllocation('manualCheckDuplicate');
      return {
        message: canMarkQueue
          ? 'Found in the GDB pending-duplicate queue.'
          : `In GDB queue; status left unchanged (question is '${question.status}').`,
        isDuplicate: false,
        referenceQuestionId: refId?.toString(),
      };
    }

    if (result.isNonAgri) {
      await this.questionRepo.updateQuestion(questionId, {
        status: 'non_agri',
        isDuplicateChecked: true,
      });
      return {message: 'Question marked as non-agri.', isDuplicate: false};
    }

    await this.questionRepo.updateQuestion(questionId, {
      isDuplicateChecked: true,
    });
    return {message: 'No duplicate found.', isDuplicate: false};
  }
}
