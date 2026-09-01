import 'reflect-metadata';
import { inject, injectable } from 'inversify';
import { ClientSession, ObjectId } from 'mongodb';
import { BaseService, MongoDatabase } from '#root/shared/index.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { appConfig } from '#root/config/app.js';
import {
  IAnswer,
  QuestionStatus,
  SourceItem,
} from '#root/shared/interfaces/models.js';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';
import { IAnswerRepository } from '#root/shared/database/interfaces/IAnswerRepository.js';
import { IQuestionRepository } from '#root/shared/database/interfaces/IQuestionRepository.js';
import { IQuestionSubmissionRepository } from '#root/shared/database/interfaces/IQuestionSubmissionRepository.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { AiService } from '#root/modules/ai/services/AiService.js';
import { IQuestionService } from '#root/modules/question/interfaces/IQuestionService.js';
import { UpdateAnswerBody } from '../classes/validators/AnswerValidator.js';
import { triggerWebhook } from '../utils/triggerWebhook.js';
import { IAnswerApprovalService } from '../interfaces/IAnswerApprovalService.js';

/**
 * Service responsible for answer approvals, LLM answer approvals, duplicate confirms, and customer notifications.
 */
@injectable()
export class AnswerApprovalService extends BaseService implements IAnswerApprovalService {
  constructor(
    @inject(CORE_TYPES.AIService)
    private readonly aiService: AiService,

    @inject(GLOBAL_TYPES.AnswerRepository)
    private readonly answerRepo: IAnswerRepository,

    @inject(GLOBAL_TYPES.QuestionRepository)
    private readonly questionRepo: IQuestionRepository,

    @inject(GLOBAL_TYPES.QuestionSubmissionRepository)
    private readonly questionSubmissionRepo: IQuestionSubmissionRepository,

    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async approveAnswer(
    userId: string,
    updates: UpdateAnswerBody,
  ): Promise<{ modifiedCount: number } | { insertedId: string }> {
    const approveResult = await this._withTransaction(async (session: ClientSession) => {
      let questionId = updates.questionId;
      if (!questionId && updates.answerId) {
        const answer = await this.answerRepo.getById(updates.answerId, session);
        if (!answer) {
          throw new BadRequestError(
            `Answer with ID ${updates.answerId} not found`,
          );
        }
        questionId = answer.questionId.toString();
      }

      if (!questionId) {
        throw new BadRequestError('Question ID not found');
      }

      const question = await this.questionRepo.getById(questionId);

      if (!question) {
        throw new BadRequestError(`Question with ID ${questionId} not found`);
      }

      // Block approval only if the crop genuinely isn't registered.
      const normalisedCrop = await this.questionService.ensureNormalisedCrop(
        questionId,
        session,
      );
      if (!normalisedCrop) {
        throw new BadRequestError(
          `This question does not have a normalised crop. Please add the respective crop from the Agri Tech Management section before approving this answer.`,
        );
      }

      // Validate & normalise state / district against LGD collections
      await this.questionService.ensureNormalisedLocation(questionId, session);

      const submission = await this.questionSubmissionRepo.getByQuestionId(
        questionId,
        session,
      );

      const user = await this.userRepo.findById(userId, session);

      if (!user || user.role === 'expert') {
        throw new UnauthorizedError(
          "You don't have permission to approve an answer!",
        );
      }

      const text = `Question: ${question.question}\n\nanswer: ${updates.answer}`;

      const generateEmbedding = async (value: string) => {
        if (appConfig.isDevelopment) {
          return [];
        }
        const { embedding } = await this.aiService.getEmbedding(value);
        return embedding;
      };

      // EDIT-FINAL-ANSWER FLOW
      // Applies to any closed variant — a plain `closed` question AND the auditor
      // "Notify User" closes (`duplicate_closed` / `dynamic_closed`). The latter skip the
      // peer-review cycle so they have no question_submissions doc; routing their edit
      // through here (text/embedding + updateAnswer) avoids the submission-required path.
      if (
        (question.status === 'closed' ||
          question.status === 'duplicate_closed' ||
          question.status === 'dynamic_closed') &&
        updates.answerId
      ) {
        const existing = await this.answerRepo.getById(updates.answerId, session);
        if (!existing) {
          throw new BadRequestError(`Answer with ID ${updates.answerId} not found`);
        }
        if (!existing.isFinalAnswer) {
          throw new BadRequestError(
            `Can't edit this answer: ${updates.answerId}. It is not the final answer for a closed question.`,
          );
        }

        const editEmbedding = await generateEmbedding(text);

        await this.questionRepo.updateQuestion(
          question._id.toString(),
          {
            text,
            embedding: editEmbedding,
          },
          session,
          true,
        );

        const editResult = await this.answerRepo.updateAnswer(
          updates.answerId,
          {
            answer: updates.answer,
            sources: updates.sources,
            embedding: editEmbedding,
          },
          session,
        );

        return editResult;
      }

      let answerId = updates.answerId;

      const hasDuplicateRef = !!(question as any).referenceQuestionId;
      const isDynamicClose =
        question.status === 'dynamic' ||
        question.tag === 'static_dynamic' ||
        (question.status === 'auditor_review' &&
          (question.auditorReviewType === 'dynamic' ||
            (!question.auditorReviewType && !hasDuplicateRef)));

      const isDuplicateClose =
        question.status === 'duplicate' ||
        (question.status === 'auditor_review' &&
          (question.auditorReviewType === 'duplicate' ||
            (!question.auditorReviewType && hasDuplicateRef)));

      const closeStatus: QuestionStatus =
        updates.closeIntent === 'notify'
          ? isDuplicateClose
            ? 'duplicate_closed'
            : isDynamicClose
              ? 'dynamic_closed'
              : 'closed'
          : 'closed';

      // DUPLICATE / DYNAMIC QUESTION FLOW
      if (
        question.status === 'duplicate' ||
        ((question.status === 'auditor_review' ||
          question.status === 'dynamic') &&
          !answerId)
      ) {
        const [answerEmbedding, questionEmbedding] = await Promise.all([
          generateEmbedding(text),
          generateEmbedding(text),
        ]);

        const answer = await this.answerRepo.addAnswer(
          questionId,
          userId,
          updates.answer,
          updates.sources,
          answerEmbedding,
          true, // isFinalAnswer
          1, // answerIteration
          session,
          'approved',
          isDynamicClose
            ? 'LLM generated answer approved as final answer by auditor since the question is dynamic'
            : 'LLM generated answer approved as final answer by moderator .',
          undefined,
        );

        answerId = answer.insertedId.toString();

        await this.questionRepo.updateQuestion(
          questionId,
          {
            text,
            embedding: questionEmbedding,
            status: closeStatus,
            paeValidation: 'pending',
            autoAllocatePaeValidationExpert: true,
            closedAt: new Date(),
          },
          session,
          true,
        );
      } else {
        // NORMAL APPROVAL FLOW
        if (!submission) {
          throw new NotFoundError(
            `Submission details for question ID ${questionId} not found`,
          );
        }

        if (
          question.status !== 'in-review' &&
          question.status !== 'pae_submitted'
        ) {
          throw new BadRequestError(
            `Can't approve this answer: ${answerId}, currently question is not in review or pae submitted!`,
          );
        }
      }

      if (!answerId) {
        throw new BadRequestError('Answer ID not found');
      }

      const answer = await this.answerRepo.getById(answerId, session);

      if (!answer) {
        throw new BadRequestError(`Answer with ID ${answerId} not found`);
      }

      const authorId = answer.authorId.toString();
      const author = await this.userRepo.findById(authorId, session);

      // UPDATE AUTHOR INCENTIVE
      await this.userRepo.updatePenaltyAndIncentive(
        authorId,
        'incentive',
        session,
      );

      // CLOSE QUESTION
      const isDuplicateApproval = question.status === 'duplicate';
      const questionEmbedding = await generateEmbedding(text);

      await this.questionRepo.updateQuestion(
        questionId,
        {
          text,
          embedding: questionEmbedding,
          status: closeStatus,
          paeValidation: 'pending',
          autoAllocateFeedback: true,
          autoAllocatePaeValidationExpert: true,
          closedAt: new Date(),
        },
        session,
        true,
      );

      try {
        await this.userRepo.removeAssignedQuestionFromAllModerators(
          questionId,
          session,
        );
      } catch (err: any) {
        console.error(
          '[ModeratorQueue] Failed to clear question from moderators:',
          err?.message,
        );
      }

      // UPDATE ANSWER
      const answerEmbedding = await generateEmbedding(text);

      const payload: Partial<IAnswer> = {
        answer: updates.answer,
        sources: updates.sources,
        approvedBy: new ObjectId(userId),
        embedding: answerEmbedding,
        isFinalAnswer: true,
        status: 'approved',
      };

      const result = await this.answerRepo.updateAnswer(
        answerId,
        payload,
        session,
      );

      const authorName =
        `${author?.firstName ?? ''} ${author?.lastName ?? ''}`.trim() ||
        'Expert';

      // Propagate the close to confirmed-duplicate children
      try {
        const childQuestions =
          await this.questionRepo.findByReferenceQuestionId(
            questionId,
            'duplicate_confirmed',
            session,
          );
        for (const child of childQuestions) {
          const childId = child._id!.toString();
          await this.answerRepo.addAnswer(
            childId,
            userId,
            updates.answer ?? '',
            updates.sources ?? [],
            answerEmbedding,
            true, // isFinalAnswer
            1, // answerIteration
            session,
            'approved',
            'Answer replicated from the parent question on close',
            undefined, // type
            userId, // approvedBy — same id as author
          );

          await this.questionRepo.updateQuestion(
            childId,
            {
              status: 'closed',
              closedAt: new Date(),
              closedBy: 'System',
              paeValidation: 'pending',
              autoAllocatePaeValidationExpert: true,
            },
            session,
          );

          await this.userRepo
            .removeAssignedQuestionFromAllModerators(childId, session)
            .catch((e: any) =>
              console.error(
                `[approveAnswer] Failed to clear moderators for child ${childId}:`,
                e?.message,
              ),
            );

          await this.notifyCustomerOnClose(
            child,
            updates.answer ?? '',
            updates.sources ?? [],
            authorName,
            session,
          );
        }
        if (childQuestions.length) {
          console.log(
            `[approveAnswer] Closed ${childQuestions.length} queue_duplicate child question(s) of ${questionId} and replicated the answer (closedBy: System).`,
          );
        }
      } catch (childErr: any) {
        console.error(
          '[approveAnswer] Failed to propagate close to queue_duplicate children:',
          childErr?.message,
        );
      }

      // Notify the parent question's customer
      await this.notifyCustomerOnClose(
        question,
        updates.answer ?? '',
        updates.sources ?? [],
        authorName,
        session,
        closeStatus,
      );

      return result;
    });

    if (updates.questionId) {
      await this.questionService.freeRoleAssigneeOnStatusChange(
        updates.questionId,
      );
    }
    return approveResult;
  }

  async confirmDuplicate(
    userId: string,
    questionId: string,
  ): Promise<{ status: QuestionStatus; closed: boolean }> {
    const result = await this._withTransaction(
      async (session: ClientSession) => {
        const question = await this.questionRepo.getById(questionId);
        if (!question) {
          throw new NotFoundError(`Question with ID ${questionId} not found`);
        }
        if (question.status !== 'queue_duplicate') {
          throw new BadRequestError(
            `Only queue-duplicate questions can be confirmed (current status: ${question.status}).`,
          );
        }
        const referenceId = (question as any).referenceQuestionId?.toString();
        if (!referenceId) {
          throw new BadRequestError(
            'This duplicate question has no reference question.',
          );
        }
        const reference = await this.questionRepo.getById(referenceId);
        if (!reference) {
          throw new BadRequestError('Reference question not found.');
        }

        const referenceClosed =
          reference.status === 'closed' ||
          reference.status === 'dynamic_closed' ||
          reference.status === 'duplicate_closed';

        // CASE A — reference already closed: replicate its final answer onto this question, system-close it and notify customer
        if (referenceClosed) {
          const [refAnswer] =
            await this.answerRepo.getFinalAnswersByQuestionIds(
              [referenceId],
              session,
            );
          if (!refAnswer) {
            throw new BadRequestError(
              'Reference question is closed but has no final answer to replicate.',
            );
          }
          const answerText = refAnswer.answer ?? '';
          const sources = refAnswer.sources ?? [];
          const embedding = refAnswer.embedding ?? [];

          await this.answerRepo.addAnswer(
            questionId,
            userId,
            answerText,
            sources,
            embedding,
            true, // isFinalAnswer
            1, // answerIteration
            session,
            'approved',
            'Answer replicated from the reference question on duplicate confirm',
            undefined, // type
            userId, // approvedBy
          );

          await this.questionRepo.updateQuestion(
            questionId,
            {
              status: 'closed',
              closedAt: new Date(),
              closedBy: 'System',
              paeValidation: 'pending',
              autoAllocatePaeValidationExpert: true,
            },
            session,
          );

          const author = await this.userRepo.findById(userId, session);
          const authorName =
            `${author?.firstName ?? ''} ${author?.lastName ?? ''}`.trim() ||
            'Expert';

          await this.notifyCustomerOnClose(
            question,
            answerText,
            sources,
            authorName,
            session,
          );

          return { status: 'closed' as QuestionStatus, closed: true };
        }

        // CASE B — reference still open: mark this question duplicate_confirmed
        await this.questionRepo.updateQuestion(
          questionId,
          { status: 'duplicate_confirmed' },
          session,
        );
        return {
          status: 'duplicate_confirmed' as QuestionStatus,
          closed: false,
        };
      },
    );

    await this.questionService.freeRoleAssigneeOnStatusChange(questionId);
    return result;
  }

  async notifyCustomerOnClose(
    q: {
      _id?: string | ObjectId;
      source: string;
      question?: string;
      messageId?: string;
      threadId?: string;
    },
    answer: string,
    sources: SourceItem[],
    authorName: string,
    session?: ClientSession,
    status: QuestionStatus = 'closed',
  ): Promise<boolean> {
    if (q.source !== 'WHATSAPP' && q.source !== 'AJRASAKHA') return false;

    const qId = q._id!.toString();
    const webhookPayload = {
      question_id: qId,
      status,
      answer: answer ?? '',
      author: authorName || 'Expert',
      sources: sources ?? [],
    };

    let isCustomerNotified = false;
    try {
      if (q.source === 'WHATSAPP') {
        await triggerWebhook(
          appConfig.WA_WEBHOOK_API_URL,
          appConfig.WA_WEBHOOK_API_KEY,
          webhookPayload,
          'WhatsApp',
        );
      } else {
        await triggerWebhook(
          appConfig.WEB_WEBHOOK_API_URL,
          appConfig.WEB_WEBHOOK_API_KEY,
          {
            ...webhookPayload,
            question: q.question,
            messageId: q.messageId,
            threadId: q.threadId,
          },
          'Browser',
        );
      }
      isCustomerNotified = true;
    } catch (err) {
      isCustomerNotified = false;
      console.log(
        `Error occured while notifying customer(${q.source}) for question ${qId}: `,
        err,
      );
    }

    await this.questionRepo.updateQuestion(
      qId,
      { isCustomerNotified },
      session,
      false,
    );
    return isCustomerNotified;
  }

  async approveLLMAnswer(
    userId: string,
    updates: UpdateAnswerBody,
  ): Promise<{ modifiedCount: number }> {
    const llmResult = await this._withTransaction(async (session: ClientSession) => {
      const isAjrasakha = updates.source === 'AJRASAKHA';
      const isWhatsApp = updates.source === 'WHATSAPP';

      if (!isAjrasakha && !isWhatsApp) {
        throw new BadRequestError(
          'Only AJRASAKHA or WHATSAPP sources are supported for this action',
        );
      }

      if (!updates.questionId) {
        throw new BadRequestError('questionId is required');
      }

      const user = await this.userRepo.findById(userId, session);

      if (!user || user.role === 'expert') {
        throw new UnauthorizedError(
          "You don't have permission to approve an answer!",
        );
      }

      const question = await this.questionRepo.getById(
        updates.questionId,
        session,
      );

      if (!question) {
        throw new BadRequestError(
          `Question with ID ${updates.questionId} not found`,
        );
      }

      if (question.status === 'in-review' || question.status === 'closed') {
        throw new BadRequestError(
          `Can't approve this answer. Current question status is '${question.status}'.`,
        );
      }

      const isAddTextRequired = true;
      const assignedModeratorId = (question as any).moderatorId?.toString();

      await this.questionRepo.updateQuestion(
        updates.questionId,
        {
          aiApprovedSources: updates.sources ?? [],
          aiInitialAnswer: updates.answer ?? '',
          isAutoAllocate: true,
          status: 'open',
          moderatorId: null,
          moderatorAssignedAt: null,
        },
        session,
        isAddTextRequired,
      );

      if (assignedModeratorId) {
        await this.userRepo.removeAssignedQuestion(
          assignedModeratorId,
          updates.questionId,
        );
      }

      return { modifiedCount: 1 };
    });

    if (updates.questionId) {
      await this.questionService.freeRoleAssigneeOnStatusChange(
        updates.questionId,
      );
    }
    return llmResult;
  }
}
