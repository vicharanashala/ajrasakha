import type { ClientSession, ObjectId } from 'mongodb';
import type { QuestionStatus, SourceItem } from '#root/shared/interfaces/models.js';
import type { UpdateAnswerBody } from '../classes/validators/AnswerValidator.js';

/**
 * Interface defining answer approval, finalization, LLM approval, and duplicate confirm operations.
 */
export interface IAnswerApprovalService {
  approveAnswer(
    userId: string,
    updates: UpdateAnswerBody,
  ): Promise<{ modifiedCount: number } | { insertedId: string }>;

  approveLLMAnswer(
    userId: string,
    updates: UpdateAnswerBody,
  ): Promise<{ modifiedCount: number }>;

  confirmDuplicate(
    userId: string,
    questionId: string,
  ): Promise<{ status: QuestionStatus; closed: boolean }>;

  notifyCustomerOnClose(
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
    status?: QuestionStatus,
  ): Promise<boolean>;
}
