import type { ClientSession } from "mongodb";
import type {
  IAnswer,
  SourceItem,
} from "#root/shared/interfaces/models.js";
import type {
  ReviewAnswerBody,
  SubmissionResponse,
  UpdateAnswerBody,
} from "../classes/validators/AnswerValidator.js";

import {AnswerSubmissionResponseDto, FinalizedAnswerResponseDto, GoldenFaqResponseDto} from '../dtos/AnswerResponseDto.js';

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
  ): Promise<AnswerSubmissionResponseDto[]>;

  getFinalAnswerQuestions(
    userId: string,
    currentUserId: string,
    date: string,
    status: string,
  ): Promise<FinalizedAnswerResponseDto>;

  /*approveAnswer(
    userId: string,
    answerId: string,
    updates: UpdateAnswerBody,
  ): Promise<{ modifiedCount: number }>;*/
  approveAnswer(
    userId: string,
    updates: UpdateAnswerBody,
  ): Promise<{modifiedCount: number} | {insertedId: string}>;

  deleteAnswer(
    questionId: string,
    answerId: string,
  ): Promise<{ deletedCount: number }>;

  goldenFaq(
    userId: string,
    page: number,
    limit: number,
    search: string,
  ): Promise<GoldenFaqResponseDto>;

  incrementApprovalCount(
    answerId: string,
    session?: ClientSession,
  ): Promise<number>;

  getAnswerById(answerId: string): Promise<IAnswer>;
}
