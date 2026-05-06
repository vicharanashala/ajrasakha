import {
  IRerouteHistory,
  RerouteStatus,
} from '#root/shared/interfaces/models.js';
import { AllocatedQuestionsBodyDto, GetDetailedQuestionsQuery } from '../classes/validators/QuestionValidators.js';
import {
  AllocatedQuestionDto,
  QuestionDetailedResponseDto,
  RerouteHistoryEntryDto,
} from '../dtos/ReRouteResponseDto.js';

export interface IReRouteService {
  /**
   * Assign a re-routed expert to an answer
   */
  addrerouteAnswer(
    questionId: string,
    expertId: string,
    answerId: string,
    moderatorId: string,
    comment: string,
    status: RerouteStatus
  ): Promise<void>;

  /**
   * Get re-routed questions allocated to expert
   */
  getAllocatedQuestions(
    userId: string,
    query: GetDetailedQuestionsQuery,
    body: AllocatedQuestionsBodyDto,
  ): Promise<AllocatedQuestionDto[]>;

  /**
   * Get re-routed question details for expert
   */
  getQuestionById(
    questionId: string,
    userId: string
  ): Promise<QuestionDetailedResponseDto>;

  /**
   * Expert or moderator rejects re-route
   */
  rejectRerouteRequest(
    rerouteId: string,
    questionId: string,
    expertId: string,
    moderatorId: string,
    reason: string,
    role: string
  ): Promise<void>;

  /**
   * Get re-route history for an answer
   */
  getRerouteHistory(answerId: string): Promise<RerouteHistoryEntryDto[]>;

  /**
   * Moderator rejects & updates re-route status
   */
  moderatorReject(
    questionId: string,
    expertId: string,
    status: RerouteStatus,
    reason: string
  ): Promise<any>;
}
