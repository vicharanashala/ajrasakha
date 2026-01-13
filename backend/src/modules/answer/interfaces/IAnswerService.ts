import type { ClientSession } from "mongodb";
import type {
  SourceItem,
} from "#root/shared/interfaces/models.js";
import type {
  ReviewAnswerBody,
  SubmissionResponse,
  UpdateAnswerBody,
} from "../classes/validators/AnswerValidator.js";

export interface IAnswerService {
  addAnswer(
    questionId: string,
    authorId: string,
    answer: string,
    sources: SourceItem[],
    session?: ClientSession,
    status?: string,
    remarks?: string,
    type?: string,
  ): Promise<{ insertedId: string; isFinalAnswer: boolean }>;

  reviewAnswer(
    userId: string,
    body: ReviewAnswerBody,
  ): Promise<{ message: string }>;

  reRouteReviewAnswer(
    userId: string,
    body: ReviewAnswerBody,
  ): Promise<{ message: string }>;

  getSubmissions(
    userId: string,
    page: number,
    limit: number,
    dateRange?: { from: string | undefined; to: string | undefined },
    selectedHistoryId?: string | undefined,
  ): Promise<SubmissionResponse[]>;

  getFinalAnswerQuestions(
    userId: string,
    currentUserId: string,
    date: string,
    status: string,
  ): Promise<{ finalizedSubmissions: any[] }>;

  approveAnswer(
    userId: string,
    answerId: string,
    updates: UpdateAnswerBody,
  ): Promise<{ modifiedCount: number }>;

  deleteAnswer(
    questionId: string,
    answerId: string,
  ): Promise<{ deletedCount: number }>;

  goldenFaq(
    userId: string,
    page: number,
    limit: number,
    search: string,
  ): Promise<{ faqs: any[]; totalFaqs: number }>;

  incrementApprovalCount(
    answerId: string,
    session?: ClientSession,
  ): Promise<number>;
}
