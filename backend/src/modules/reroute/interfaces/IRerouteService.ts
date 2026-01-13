import {
  IRerouteHistory,
  RerouteStatus,
} from '#root/shared/interfaces/models.js';
import { GetDetailedQuestionsQuery } from '../classes/validators/QuestionValidators.js';

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
    query: GetDetailedQuestionsQuery
  ): Promise<any>;

  /**
   * Get re-routed question details for expert
   */
  getQuestionById(
    questionId: string,
    userId: string
  ): Promise<{
    id: string;
    text: string;
    source: string;
    details: any;
    status: string;
    priority: string;
    aiInitialAnswer: string;
    createdAt: string;
    updatedAt: string;
    totalAnswersCount: number;
    history: any;
  }>;

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
  getRerouteHistory(answerId: string): Promise<IRerouteHistory[]>;

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
